import { CallStatus, CampaignLeadStatus, CampaignStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { emitCallUpdate, emitDashboardRefresh } from "../sockets";

/**
 * Thin data helpers for n8n. Orchestration (looping, pacing, retries) lives in n8n —
 * these endpoints only read/write CRM records.
 */

export async function getOutboundQueue(input?: {
  campaignId?: string;
  statuses?: string[];
  limit?: number;
}) {
  const limit = Math.min(100, Math.max(1, input?.limit ?? 25));
  const statusFilter = (input?.statuses?.length
    ? input.statuses
    : ["PENDING", "QUEUED", "MISSED"]) as CampaignLeadStatus[];

  const where: Prisma.CampaignLeadWhereInput = {
    status: { in: statusFilter },
    campaign: {
      status: { in: [CampaignStatus.RUNNING, CampaignStatus.SCHEDULED] },
      ...(input?.campaignId ? { id: input.campaignId } : {}),
    },
  };

  const items = await prisma.campaignLead.findMany({
    where,
    take: limit,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: {
      lead: true,
      campaign: {
        select: {
          id: true,
          name: true,
          status: true,
          assistantId: true,
          phoneNumberId: true,
          maxRetries: true,
        },
      },
    },
  });

  return items.map((row) => ({
    campaignLeadId: row.id,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    assistantId: row.campaign.assistantId,
    phoneNumberId: row.campaign.phoneNumberId,
    maxRetries: row.campaign.maxRetries,
    attempts: row.attempts,
    lead: {
      id: row.lead.id,
      name: row.lead.name,
      phone: row.lead.phone,
      email: row.lead.email,
      status: row.lead.status,
      preferredLocation: row.lead.preferredLocation,
      propertyType: row.lead.propertyType,
      budgetMin: row.lead.budgetMin,
      budgetMax: row.lead.budgetMax,
      purchasePreference: row.lead.purchasePreference,
      notes: row.lead.notes,
    },
  }));
}

export async function recordOutboundCallStarted(input: {
  leadId: string;
  campaignId?: string;
  campaignLeadId?: string;
  vapiCallId: string;
  customerPhone?: string;
  customerName?: string;
  rawPayload?: unknown;
}) {
  if (!input.vapiCallId) throw new AppError("vapiCallId is required", 400);

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new AppError("Lead not found", 404);

  const call = await prisma.call.upsert({
    where: { vapiCallId: input.vapiCallId },
    create: {
      vapiCallId: input.vapiCallId,
      leadId: lead.id,
      campaignId: input.campaignId,
      customerName: input.customerName || lead.name,
      customerPhone: input.customerPhone || lead.phone,
      direction: "outbound",
      status: CallStatus.RINGING,
      startedAt: new Date(),
      rawPayload: (input.rawPayload as Prisma.InputJsonValue) ?? undefined,
    },
    update: {
      leadId: lead.id,
      campaignId: input.campaignId,
      status: CallStatus.RINGING,
      rawPayload: (input.rawPayload as Prisma.InputJsonValue) ?? undefined,
    },
  });

  if (input.campaignLeadId) {
    await prisma.campaignLead.update({
      where: { id: input.campaignLeadId },
      data: {
        status: CampaignLeadStatus.CALLING,
        attempts: { increment: 1 },
        lastCallId: call.id,
        lastError: null,
      },
    });
  } else if (input.campaignId) {
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

  emitCallUpdate(call);
  emitDashboardRefresh();
  return call;
}

export async function recordOutboundCallResult(input: {
  vapiCallId?: string;
  callId?: string;
  status?: string;
  durationSeconds?: number;
  recordingUrl?: string;
  transcript?: string;
  summary?: string;
  interestScore?: number;
  interestLevel?: string;
  leadStatus?: string;
  recommendedAction?: string;
  extractedRequirements?: unknown;
  rawPayload?: unknown;
}) {
  const call = input.callId
    ? await prisma.call.findUnique({ where: { id: input.callId } })
    : input.vapiCallId
      ? await prisma.call.findUnique({ where: { vapiCallId: input.vapiCallId } })
      : null;

  if (!call) throw new AppError("Call not found", 404);

  const statusMap: Record<string, CallStatus> = {
    completed: CallStatus.COMPLETED,
    ended: CallStatus.COMPLETED,
    COMPLETED: CallStatus.COMPLETED,
    missed: CallStatus.MISSED,
    MISSED: CallStatus.MISSED,
    "no-answer": CallStatus.MISSED,
    failed: CallStatus.FAILED,
    FAILED: CallStatus.FAILED,
    in_progress: CallStatus.IN_PROGRESS,
    IN_PROGRESS: CallStatus.IN_PROGRESS,
  };

  const nextStatus = input.status
    ? statusMap[input.status] || CallStatus.COMPLETED
    : CallStatus.COMPLETED;

  const updated = await prisma.call.update({
    where: { id: call.id },
    data: {
      status: nextStatus,
      endedAt: new Date(),
      durationSeconds: input.durationSeconds,
      recordingUrl: input.recordingUrl,
      summary: input.summary,
      interestScore: input.interestScore,
      interestLevel: (input.interestLevel as never) || undefined,
      rawPayload: (input.rawPayload as Prisma.InputJsonValue) ?? undefined,
    },
  });

  if (input.transcript) {
    await prisma.callTranscript.upsert({
      where: { callId: call.id },
      create: { callId: call.id, content: input.transcript },
      update: { content: input.transcript },
    });
  }

  if (input.summary || input.interestScore != null) {
    await prisma.callAnalysis.upsert({
      where: { callId: call.id },
      create: {
        callId: call.id,
        summary: input.summary,
        interestScore: input.interestScore ?? 0,
        interestLevel: (input.interestLevel as never) || "UNKNOWN",
        recommendedAction: input.recommendedAction,
        extractedRequirements: (input.extractedRequirements as Prisma.InputJsonValue) ?? undefined,
      },
      update: {
        summary: input.summary,
        interestScore: input.interestScore ?? 0,
        interestLevel: (input.interestLevel as never) || undefined,
        recommendedAction: input.recommendedAction,
        extractedRequirements: (input.extractedRequirements as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  if (call.leadId && input.leadStatus) {
    await prisma.lead.update({
      where: { id: call.leadId },
      data: { status: input.leadStatus as never },
    });
  }

  if (call.campaignId && call.leadId) {
    const campaignLeadStatus =
      nextStatus === CallStatus.COMPLETED
        ? CampaignLeadStatus.COMPLETED
        : nextStatus === CallStatus.MISSED
          ? CampaignLeadStatus.MISSED
          : CampaignLeadStatus.FAILED;

    await prisma.campaignLead.updateMany({
      where: { campaignId: call.campaignId, leadId: call.leadId },
      data: { status: campaignLeadStatus, lastCallId: call.id },
    });

    const remaining = await prisma.campaignLead.count({
      where: {
        campaignId: call.campaignId,
        status: {
          in: [
            CampaignLeadStatus.PENDING,
            CampaignLeadStatus.QUEUED,
            CampaignLeadStatus.CALLING,
          ],
        },
      },
    });
    if (remaining === 0) {
      await prisma.campaign.update({
        where: { id: call.campaignId },
        data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
      });
    }
  }

  emitCallUpdate(updated);
  emitDashboardRefresh();
  return updated;
}

export async function markCampaignLeadFailed(input: {
  campaignLeadId?: string;
  campaignId?: string;
  leadId?: string;
  error: string;
}) {
  if (input.campaignLeadId) {
    return prisma.campaignLead.update({
      where: { id: input.campaignLeadId },
      data: {
        status: CampaignLeadStatus.FAILED,
        lastError: input.error,
        attempts: { increment: 1 },
      },
    });
  }
  if (input.campaignId && input.leadId) {
    await prisma.campaignLead.updateMany({
      where: { campaignId: input.campaignId, leadId: input.leadId },
      data: {
        status: CampaignLeadStatus.FAILED,
        lastError: input.error,
        attempts: { increment: 1 },
      },
    });
    return { ok: true };
  }
  throw new AppError("campaignLeadId or campaignId+leadId required", 400);
}
