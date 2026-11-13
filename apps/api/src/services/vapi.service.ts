import { CallStatus, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { findOrCreateLeadFromCall } from "./lead.service";
import { analyzeWithOptionalLLM, persistCallAnalysis } from "./analysis.service";
import { updateCampaignLeadFromCall } from "./campaign.service";
import { forwardToN8n } from "./n8n.service";
import {
  emitCallUpdate,
  emitDashboardRefresh,
  emitNotification,
} from "../sockets";
import { AppError } from "../utils/errors";

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function mapVapiStatus(status?: string): CallStatus {
  switch ((status || "").toLowerCase()) {
    case "ringing":
    case "queued":
      return CallStatus.RINGING;
    case "in-progress":
    case "in_progress":
    case "answered":
      return CallStatus.IN_PROGRESS;
    case "ended":
    case "completed":
      return CallStatus.COMPLETED;
    case "no-answer":
    case "busy":
    case "missed":
      return CallStatus.MISSED;
    case "failed":
    case "canceled":
    case "cancelled":
      return CallStatus.FAILED;
    default:
      return CallStatus.IN_PROGRESS;
  }
}

export function verifyVapiSignature(rawBody: Buffer | string, signature?: string) {
  if (!env.vapiWebhookSecret) {
    // Allow local/dev without secret, but warn once via log
    return true;
  }
  if (!signature) return false;

  const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = createHmac("sha256", env.vapiWebhookSecret).update(payload).digest("hex");
  const provided = signature.replace(/^sha256=/, "");

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function syncAssistantConfig(agent: {
  name: string;
  voice: string;
  language: string;
  greeting: string;
  systemPrompt: string;
  vapiAssistantId?: string | null;
}) {
  if (!env.vapiApiKey) {
    return { synced: false, reason: "VAPI_API_KEY not configured" };
  }

  const assistantId = agent.vapiAssistantId || env.vapiAssistantId;
  if (!assistantId) {
    return { synced: false, reason: "No Vapi assistant ID configured" };
  }

  const body = {
    name: agent.name,
    firstMessage: agent.greeting,
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `${agent.systemPrompt}\n\nLanguage preference: ${agent.language}. Support English and Urdu when needed.`,
        },
      ],
    },
    voice: {
      provider: "11labs",
      voiceId: agent.voice,
    },
  };

  const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.vapiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(`Failed to sync Vapi assistant: ${text}`, 502);
  }

  return { synced: true, assistantId };
}

export async function processVapiWebhook(payload: Json, eventIdHint?: string) {
  const message = asObject(payload.message ?? payload);
  const eventType =
    pickString(message.type, payload.type, message.event, payload.event) || "unknown";
  const callObj = asObject(message.call ?? payload.call ?? message);
  const vapiCallId =
    pickString(callObj.id, message.callId, payload.callId) ||
    pickString(message.id) ||
    undefined;

  const eventId =
    eventIdHint ||
    pickString(payload.id, message.id, message.hash) ||
    `${eventType}:${vapiCallId || "none"}:${pickString(message.timestamp, payload.timestamp) || Date.now()}`;

  const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (existing?.status === "processed") {
    return { duplicate: true, eventId };
  }

  const webhook = existing
    ? existing
    : await prisma.webhookEvent.create({
        data: {
          eventId,
          eventType,
          payload: payload as Prisma.InputJsonValue,
          status: "pending",
        },
      });

  try {
    if (vapiCallId) {
      await upsertCallFromVapi(eventType, callObj, message, vapiCallId);
    }

    await prisma.webhookEvent.update({
      where: { id: webhook.id },
      data: { status: "processed", processedAt: new Date(), error: null },
    });

    emitDashboardRefresh();
    return { duplicate: false, eventId, eventType };
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: webhook.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

async function upsertCallFromVapi(
  eventType: string,
  callObj: Json,
  message: Json,
  vapiCallId: string
) {
  const customer =
    asObject(callObj.customer) ||
    asObject(message.customer) ||
    asObject(asObject(callObj.transport).customer);

  const phone =
    pickString(
      customer.number,
      customer.phone,
      callObj.customerPhone,
      message.customerPhone,
      asObject(callObj.phoneNumber).number
    ) || "unknown";

  const name = pickString(customer.name, callObj.customerName, message.customerName);
  const status = mapVapiStatus(
    pickString(callObj.status, message.status, eventType.includes("end") ? "ended" : undefined)
  );

  const startedAt = pickString(callObj.startedAt, message.startedAt);
  const endedAt = pickString(callObj.endedAt, message.endedAt);
  const duration =
    typeof callObj.duration === "number"
      ? callObj.duration
      : typeof message.duration === "number"
        ? message.duration
        : startedAt && endedAt
          ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
          : undefined;

  const recordingUrl = pickString(
    callObj.recordingUrl,
    asObject(callObj.artifact).recordingUrl,
    asObject(message.artifact).recordingUrl,
    message.recordingUrl
  );

  const lead = phone !== "unknown" ? await findOrCreateLeadFromCall({ phone, name }) : null;

  const call = await prisma.call.upsert({
    where: { vapiCallId },
    create: {
      vapiCallId,
      leadId: lead?.id,
      customerName: name || lead?.name,
      customerPhone: phone,
      direction: "inbound",
      status,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      endedAt: endedAt ? new Date(endedAt) : undefined,
      durationSeconds: duration,
      recordingUrl,
      rawPayload: { eventType, callObj, message } as Prisma.InputJsonValue,
    },
    update: {
      leadId: lead?.id,
      customerName: name || lead?.name || undefined,
      status,
      startedAt: startedAt ? new Date(startedAt) : undefined,
      endedAt: endedAt ? new Date(endedAt) : undefined,
      durationSeconds: duration,
      recordingUrl: recordingUrl || undefined,
      rawPayload: { eventType, callObj, message } as Prisma.InputJsonValue,
    },
  });

  const transcriptText = extractTranscript(message, callObj);
  if (transcriptText) {
    await prisma.callTranscript.upsert({
      where: { callId: call.id },
      create: {
        callId: call.id,
        content: transcriptText,
        messages: (message.messages || callObj.messages || null) as Prisma.InputJsonValue,
      },
      update: {
        content: transcriptText,
        messages: (message.messages || callObj.messages || null) as Prisma.InputJsonValue,
      },
    });
  }

  const isEndEvent =
    /end|completed|report|analysis/i.test(eventType) || status === CallStatus.COMPLETED;

  await updateCampaignLeadFromCall({
    callId: call.id,
    campaignId: call.campaignId,
    leadId: call.leadId || lead?.id,
    status: status,
  });

  if (isEndEvent) {
    const analysis = await analyzeWithOptionalLLM(transcriptText || call.summary || "", name);
    await persistCallAnalysis(call.id, analysis);

    const notification = await prisma.notification.create({
      data: {
        type: call.direction === "outbound" ? "OUTBOUND_CALL" : "NEW_CALL",
        title:
          call.direction === "outbound"
            ? "Outbound call processed"
            : "Inbound call processed",
        message: `${name || phone} — interest score ${analysis.interestScore}`,
        metadata: { callId: call.id, leadId: lead?.id, direction: call.direction },
      },
    });
    emitNotification(notification);

    await forwardToN8n("call.completed", {
      callId: call.id,
      leadId: lead?.id,
      campaignId: call.campaignId,
      phone,
      direction: call.direction,
      status,
      analysis,
    });
  }

  const fresh = await prisma.call.findUnique({
    where: { id: call.id },
    include: { analysis: true, lead: true },
  });
  emitCallUpdate(fresh);
  return fresh;
}

function extractTranscript(message: Json, callObj: Json): string {
  const artifact = asObject(message.artifact || callObj.artifact);
  const direct = pickString(
    message.transcript,
    callObj.transcript,
    artifact.transcript,
    asObject(message.analysis).summary
  );
  if (direct) return direct;

  const messages = (message.messages || callObj.messages || artifact.messages) as unknown;
  if (Array.isArray(messages)) {
    return messages
      .map((m) => {
        const item = asObject(m);
        const role = pickString(item.role) || "unknown";
        const content = pickString(item.message, item.content) || "";
        return `${role}: ${content}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
