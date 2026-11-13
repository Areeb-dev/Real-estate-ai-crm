import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(["ADMIN", "MANAGER", "AGENT", "VIEWER"]).optional(),
  phone: z.string().optional(),
});

export const leadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email().optional().or(z.literal("")),
  propertyType: z
    .enum(["APARTMENT", "HOUSE", "VILLA", "PLOT", "COMMERCIAL", "OFFICE", "OTHER"])
    .optional(),
  preferredLocation: z.string().optional(),
  budgetMin: z.coerce.number().optional(),
  budgetMax: z.coerce.number().optional(),
  purchasePreference: z.enum(["BUY", "SELL", "RENT", "UNKNOWN"]).optional(),
  source: z.string().optional(),
  status: z
    .enum([
      "NEW",
      "PENDING",
      "INTERESTED",
      "NOT_INTERESTED",
      "FOLLOW_UP",
      "QUALIFIED",
      "DISQUALIFIED",
      "NO_RESPONSE",
    ])
    .optional(),
  notes: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
});

export const leadUpdateSchema = leadSchema.partial();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  propertyType: z.string().optional(),
  interestLevel: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const agentSchema = z.object({
  name: z.string().min(2).optional(),
  voice: z.string().optional(),
  language: z.string().optional(),
  greeting: z.string().optional(),
  systemPrompt: z.string().optional(),
  vapiAssistantId: z.string().optional(),
  syncToVapi: z.boolean().optional(),
});
