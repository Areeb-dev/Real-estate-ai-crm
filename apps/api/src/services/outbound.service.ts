import { CallStatus, CampaignLeadStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/errors";
import { emitCallUpdate, emitDashboardRefresh, emitNotification } from "../sockets";
import { forwardToN8n } from "./n8n.service";

function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s+/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 11) return `+92${digits.slice(1)}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export async function placeOutboundCall(input: {
  leadId?: string;
  phone?: string;
  name?: string;
  campaignId?: string;
  assistantId?: string;
  phoneNumberId?: string;
}) {
  if (!env.vapiApiKey) {
    throw new AppError("VAPI_API_KEY is not configured", 400);
  }

  const assistantId = input.assistantId || env.vapiAssistantId;
  const phoneNumberId = input.phoneNumberId || env.vapiPhoneNumberId;
  if (!assistantId || !phoneNumberId) {
    throw new AppError("Vapi assistantId and phoneNumberId are required for outbound calls", 400);
  }

  let lead =
    input.leadId
      ? await prisma.lead.findUnique({ where: { id: input.leadId } })
      : input.phone
        ? await prisma.lead.findUnique({ where: { phone: input.phone } })
        : null;

  if (!lead && !input.phone) {
    throw new AppError("leadId or phone is required", 400);
  }

  if (!lead && input.phone) {
    lead = await prisma.lead.create({
      data: {
        name: input.name?.trim() || `Outbound ${input.phone}`,
        phone: input.phone,
        source: "outbound",
        status: "PENDING",
      },
    });
  }

  if (!lead) throw new AppError("Lead not found", 404);

  const customerNumber = normalizePhone(lead.phone);

  const response = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.vapiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: {
        number: customerNumber,
        name: lead.name,
      },
      name: `Outbound to ${lead.name}`,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new AppError(
      typeof payload.message === "string"
        ? payload.message
        : `Vapi outbound call failed (${response.status})`,
      502
    );
  }

  const vapiCallId = typeof payload.id === "string" ? payload.id : undefined;

  const call = await prisma.call.create({
    data: {
      vapiCallId,
      leadId: lead.id,
      campaignId: input.campaignId,
      customerName: lead.name,
      customerPhone: lead.phone,
      direction: "outbound",
      status: CallStatus.RINGING,
      startedAt: new Date(),
      rawPayload: payload as Prisma.InputJsonValue,
    },
    include: { lead: true },
  });

  if (input.campaignId) {
    await prisma.campaignLead.updateMany({
      where: { campaignId: input.campaignId, leadId: lead.id },
      data: {
        status: CampaignLeadStatus.CALLING,
        attempts: { increment: 1 },
        lastCallId: call.id,
        lastError: null,
      },
    });
  }

  const notification = await prisma.notification.create({
    data: {
      type: "OUTBOUND_CALL",
      title: "Outbound call started",
      message: `Calling ${lead.name} (${lead.phone})`,
      metadata: { callId: call.id, leadId: lead.id, campaignId: input.campaignId },
    },
  });

  emitCallUpdate(call);
  emitNotification(notification);
  emitDashboardRefresh();

  await forwardToN8n("outbound.call.started", {
    callId: call.id,
    leadId: lead.id,
    campaignId: input.campaignId,
    phone: lead.phone,
    vapiCallId,
  });

  return call;
}

export async function retryMissedOutboundCall(callId: string) {
  const previous = await prisma.call.findUnique({ where: { id: callId } });
  if (!previous) throw new AppError("Call not found", 404);
  if (previous.direction !== "outbound") {
    throw new AppError("Only outbound calls can be retried", 400);
  }
  if (!previous.leadId) throw new AppError("Call has no associated lead", 400);

  return placeOutboundCall({
    leadId: previous.leadId,
    campaignId: previous.campaignId || undefined,
  });
}
