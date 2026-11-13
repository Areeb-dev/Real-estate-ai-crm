import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { syncAssistantConfig } from "./vapi.service";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  companyProfile: {
    name: "Horizon Realty",
    email: "hello@horizonrealty.local",
    phone: "+92-300-0000000",
    address: "Lahore, Pakistan",
    website: "https://horizonrealty.local",
  },
  vapi: {
    apiKeyConfigured: false,
    assistantId: "",
    phoneNumberId: "",
  },
  callingPreferences: {
    businessHoursStart: "09:00",
    businessHoursEnd: "18:00",
    timezone: "Asia/Karachi",
    recordCalls: true,
  },
  notifications: {
    emailOnNewLead: true,
    emailOnMissedCall: true,
    inAppEnabled: true,
  },
};

export async function getAllSettings() {
  const rows = await prisma.setting.findMany();
  const map: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    map[row.key] = row.value;
  }

  const agent = await prisma.aIAgent.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  return { settings: map, agent };
}

export async function upsertSetting(key: string, value: unknown) {
  const setting = await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
  return setting;
}

export async function updateCompanyProfile(profile: Record<string, unknown>) {
  return upsertSetting("companyProfile", profile);
}

export async function updateNotificationSettings(value: Record<string, unknown>) {
  return upsertSetting("notifications", value);
}

export async function updateCallingPreferences(value: Record<string, unknown>) {
  return upsertSetting("callingPreferences", value);
}

export async function updateVapiConfig(value: {
  assistantId?: string;
  phoneNumberId?: string;
}) {
  return upsertSetting("vapi", {
    apiKeyConfigured: Boolean(process.env.VAPI_API_KEY),
    assistantId: value.assistantId || "",
    phoneNumberId: value.phoneNumberId || "",
  });
}

export async function getActiveAgent() {
  const agent = await prisma.aIAgent.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!agent) throw new AppError("No AI agent configured", 404);
  return agent;
}

export async function updateAIAgent(input: {
  name?: string;
  voice?: string;
  language?: string;
  greeting?: string;
  systemPrompt?: string;
  vapiAssistantId?: string;
  syncToVapi?: boolean;
}) {
  const existing = await prisma.aIAgent.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const data = {
    name: input.name ?? existing?.name ?? "Realty AI Assistant",
    voice: input.voice ?? existing?.voice ?? "jennifer",
    language: input.language ?? existing?.language ?? "en",
    greeting:
      input.greeting ??
      existing?.greeting ??
      "Hello, thank you for calling. I am your AI real estate assistant. How can I help you today?",
    systemPrompt:
      input.systemPrompt ??
      existing?.systemPrompt ??
      "You are a professional real estate AI assistant.",
    vapiAssistantId: input.vapiAssistantId ?? existing?.vapiAssistantId,
    isActive: true,
  };

  const agent = existing
    ? await prisma.aIAgent.update({ where: { id: existing.id }, data })
    : await prisma.aIAgent.create({ data });

  let syncResult: unknown = null;
  if (input.syncToVapi) {
    syncResult = await syncAssistantConfig(agent);
  }

  return { agent, syncResult };
}

export async function listUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateUserRole(id: string, role: "ADMIN" | "MANAGER" | "AGENT" | "VIEWER") {
  return prisma.user.update({
    where: { id },
    data: { role },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      isActive: true,
    },
  });
}

export async function setUserActive(id: string, isActive: boolean) {
  return prisma.user.update({
    where: { id },
    data: { isActive },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });
}
