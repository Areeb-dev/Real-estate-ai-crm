import {
  InterestLevel,
  LeadStatus,
  Prisma,
  PropertyType,
  PurchasePreference,
} from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";

export interface StructuredAnalysis {
  summary: string;
  propertyType?: PropertyType;
  location?: string;
  budgetMin?: number;
  budgetMax?: number;
  purchaseTimeline?: string;
  customerIntent: PurchasePreference;
  interestLevel: InterestLevel;
  interestScore: number;
  extractedRequirements: Record<string, unknown>;
  recommendedAction: string;
}

const KEYWORD_MAP: Array<{ pattern: RegExp; intent?: PurchasePreference; property?: PropertyType }> = [
  { pattern: /\bbuy\b|\bpurchase\b|\bkharid/i, intent: PurchasePreference.BUY },
  { pattern: /\bsell\b|\bbech/i, intent: PurchasePreference.SELL },
  { pattern: /\brent\b|\bkiraya\b|\blease\b/i, intent: PurchasePreference.RENT },
  { pattern: /\bapartment\b|\bflat\b/i, property: PropertyType.APARTMENT },
  { pattern: /\bhouse\b|\bhome\b/i, property: PropertyType.HOUSE },
  { pattern: /\bvilla\b/i, property: PropertyType.VILLA },
  { pattern: /\bplot\b|\bland\b/i, property: PropertyType.PLOT },
  { pattern: /\bcommercial\b|\bshop\b/i, property: PropertyType.COMMERCIAL },
  { pattern: /\boffice\b/i, property: PropertyType.OFFICE },
];

export function analyzeTranscriptLocally(transcript: string, customerName?: string | null): StructuredAnalysis {
  const text = transcript || "";
  let intent: PurchasePreference = PurchasePreference.UNKNOWN;
  let propertyType: PropertyType | undefined;

  for (const item of KEYWORD_MAP) {
    if (item.pattern.test(text)) {
      if (item.intent) intent = item.intent;
      if (item.property) propertyType = item.property;
    }
  }

  const budgetMatches = [...text.matchAll(/(?:budget|price|upto|under|around)?\s*(?:PKR|Rs\.?|\$)?\s*([\d,]+(?:\.\d+)?)\s*(k|m|lac|lakh|crore)?/gi)];
  const budgets = budgetMatches
    .map((m) => normalizeBudget(m[1], m[2]))
    .filter((n): n is number => typeof n === "number");

  const locationMatch = text.match(/(?:in|at|near|location|area)\s+([A-Za-z][A-Za-z\s-]{2,40})/i);
  const timelineMatch = text.match(/(?:within|in|by|timeline|month|week|asap|immediately)[^\n.]{0,40}/i);

  const positive = (text.match(/\b(interested|yes|looking|want|need|ready|serious|definitely)\b/gi) || []).length;
  const negative = (text.match(/\b(not interested|no thanks|busy|later|don't|dont|nahi)\b/gi) || []).length;

  let interestScore = Math.min(100, Math.max(0, 40 + positive * 12 - negative * 18));
  if (intent !== PurchasePreference.UNKNOWN) interestScore += 10;
  if (propertyType) interestScore += 8;
  if (budgets.length) interestScore += 8;
  interestScore = Math.min(100, interestScore);

  const interestLevel = scoreToInterest(interestScore);
  const recommendedAction =
    interestLevel === InterestLevel.HIGH || interestLevel === InterestLevel.MEDIUM
      ? "Schedule a follow-up with a human agent and share matching listings."
      : interestLevel === InterestLevel.LOW
        ? "Send a polite nurture email/SMS and revisit in 7 days."
        : "Mark for review; gather missing requirements on next contact.";

  return {
    summary:
      text.trim().length > 0
        ? `Conversation with ${customerName || "customer"} captured. Intent: ${intent}. Interest score: ${interestScore}.`
        : "No transcript available for analysis.",
    propertyType,
    location: locationMatch?.[1]?.trim(),
    budgetMin: budgets.length ? Math.min(...budgets) : undefined,
    budgetMax: budgets.length ? Math.max(...budgets) : undefined,
    purchaseTimeline: timelineMatch?.[0]?.trim(),
    customerIntent: intent,
    interestLevel,
    interestScore,
    extractedRequirements: {
      intent,
      propertyType: propertyType ?? null,
      location: locationMatch?.[1]?.trim() ?? null,
      budgets,
      timeline: timelineMatch?.[0]?.trim() ?? null,
    },
    recommendedAction,
  };
}

export async function analyzeWithOptionalLLM(
  transcript: string,
  customerName?: string | null
): Promise<StructuredAnalysis> {
  const local = analyzeTranscriptLocally(transcript, customerName);
  if (!env.openaiApiKey || !transcript.trim()) {
    return local;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You analyze real-estate call transcripts. Return JSON with keys: summary, propertyType (APARTMENT|HOUSE|VILLA|PLOT|COMMERCIAL|OFFICE|OTHER|null), location, budgetMin, budgetMax, purchaseTimeline, customerIntent (BUY|SELL|RENT|UNKNOWN), interestLevel (HIGH|MEDIUM|LOW|NONE|UNKNOWN), interestScore (0-100), extractedRequirements (object), recommendedAction.",
          },
          {
            role: "user",
            content: `Customer: ${customerName || "Unknown"}\n\nTranscript:\n${transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) return local;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return local;
    const parsed = JSON.parse(content) as Partial<StructuredAnalysis>;
    return {
      ...local,
      ...parsed,
      customerIntent: (parsed.customerIntent as PurchasePreference) || local.customerIntent,
      interestLevel: (parsed.interestLevel as InterestLevel) || local.interestLevel,
      interestScore: Number(parsed.interestScore ?? local.interestScore),
      extractedRequirements: parsed.extractedRequirements || local.extractedRequirements,
    };
  } catch {
    return local;
  }
}

export async function persistCallAnalysis(callId: string, analysis: StructuredAnalysis) {
  const saved = await prisma.callAnalysis.upsert({
    where: { callId },
    create: {
      callId,
      summary: analysis.summary,
      propertyType: analysis.propertyType,
      location: analysis.location,
      budgetMin: analysis.budgetMin,
      budgetMax: analysis.budgetMax,
      purchaseTimeline: analysis.purchaseTimeline,
      customerIntent: analysis.customerIntent,
      interestLevel: analysis.interestLevel,
      interestScore: analysis.interestScore,
      extractedRequirements: analysis.extractedRequirements as Prisma.InputJsonValue,
      recommendedAction: analysis.recommendedAction,
      rawAnalysis: analysis as unknown as Prisma.InputJsonValue,
    },
    update: {
      summary: analysis.summary,
      propertyType: analysis.propertyType,
      location: analysis.location,
      budgetMin: analysis.budgetMin,
      budgetMax: analysis.budgetMax,
      purchaseTimeline: analysis.purchaseTimeline,
      customerIntent: analysis.customerIntent,
      interestLevel: analysis.interestLevel,
      interestScore: analysis.interestScore,
      extractedRequirements: analysis.extractedRequirements as Prisma.InputJsonValue,
      recommendedAction: analysis.recommendedAction,
      rawAnalysis: analysis as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.call.update({
    where: { id: callId },
    data: {
      summary: analysis.summary,
      interestLevel: analysis.interestLevel,
      interestScore: analysis.interestScore,
    },
  });

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (call?.leadId) {
    await prisma.lead.update({
      where: { id: call.leadId },
      data: {
        status: interestToLeadStatus(analysis.interestLevel),
        propertyType: analysis.propertyType ?? undefined,
        preferredLocation: analysis.location ?? undefined,
        budgetMin: analysis.budgetMin ?? undefined,
        budgetMax: analysis.budgetMax ?? undefined,
        purchasePreference:
          analysis.customerIntent !== PurchasePreference.UNKNOWN
            ? analysis.customerIntent
            : undefined,
      },
    });

    if (
      analysis.interestLevel === InterestLevel.HIGH ||
      analysis.interestLevel === InterestLevel.MEDIUM
    ) {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 1);
      await prisma.followUp.create({
        data: {
          leadId: call.leadId,
          callId: call.id,
          dueAt,
          notes: analysis.recommendedAction,
        },
      });
    }
  }

  return saved;
}

function normalizeBudget(raw: string, unit?: string): number | undefined {
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return undefined;
  const u = (unit || "").toLowerCase();
  if (u === "k") return n * 1_000;
  if (u === "m") return n * 1_000_000;
  if (u === "lac" || u === "lakh") return n * 100_000;
  if (u === "crore") return n * 10_000_000;
  return n;
}

function scoreToInterest(score: number): InterestLevel {
  if (score >= 75) return InterestLevel.HIGH;
  if (score >= 50) return InterestLevel.MEDIUM;
  if (score >= 25) return InterestLevel.LOW;
  if (score > 0) return InterestLevel.NONE;
  return InterestLevel.UNKNOWN;
}

function interestToLeadStatus(level: InterestLevel): LeadStatus {
  switch (level) {
    case InterestLevel.HIGH:
      return LeadStatus.INTERESTED;
    case InterestLevel.MEDIUM:
      return LeadStatus.FOLLOW_UP;
    case InterestLevel.LOW:
      return LeadStatus.PENDING;
    case InterestLevel.NONE:
      return LeadStatus.NOT_INTERESTED;
    default:
      return LeadStatus.NO_RESPONSE;
  }
}
