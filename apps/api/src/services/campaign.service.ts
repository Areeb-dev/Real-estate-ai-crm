import { CampaignLeadStatus, CampaignStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { emitDashboardRefresh, emitNotification } from "../sockets";
import { forwardToN8n } from "./n8n.service";

export async function listCampaigns() {
  return prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { leads: true, calls: true } },
      leads: {
        select: { status: true },
      },
    },
  });
}

export async function getCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      leads: {
        include: {
          lead: true,
          lastCall: {
            select: {
              id: true,
              status: true,
              interestScore: true,
              startedAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      calls: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!campaign) throw new AppError("Campaign not found", 404);
  return campaign;
}

export async function createCampaign(input: {
  name: string;
  description?: string;
  leadIds?: string[];
  assistantId?: string;
  phoneNumberId?: string;
  scheduledAt?: string;
  maxRetries?: number;
  retryDelayMins?: number;
  createdById?: string;
}) {
  if (!input.name?.trim()) throw new AppError("Campaign name is required", 400);

  const campaign = await prisma.campaign.create({
    data: {
      name: input.name.trim(),
      description: input.description,
      assistantId: input.assistantId,
      phoneNumberId: input.phoneNumberId,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      maxRetries: input.maxRetries ?? 1,
      retryDelayMins: input.retryDelayMins ?? 60,
      createdById: input.createdById,
      status: input.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      leads: input.leadIds?.length
        ? {
            create: input.leadIds.map((leadId) => ({
              leadId,
              status: CampaignLeadStatus.PENDING,
              scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
            })),
          }
        : undefined,
    },
    include: { leads: true },
  });

  await forwardToN8n("campaign.created", { campaignId: campaign.id, name: campaign.name });
  return campaign;
}

export async function addLeadsToCampaign(campaignId: string, leadIds: string[]) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError("Campaign not found", 404);

  for (const leadId of leadIds) {
    await prisma.campaignLead.upsert({
      where: { campaignId_leadId: { campaignId, leadId } },
      create: { campaignId, leadId, status: CampaignLeadStatus.PENDING },
      update: {},
    });
  }

  return getCampaign(campaignId);
}

export async function startCampaign(campaignId: string) {
  const campaign = await getCampaign(campaignId);
  if (campaign.status === CampaignStatus.RUNNING) {
    throw new AppError("Campaign is already running", 400);
  }
  if (!campaign.leads.length) {
    throw new AppError("Add at least one lead before starting the campaign", 400);
  }

  // Queue only — n8n owns dialing, pacing, retries, and DB write-back.
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: CampaignStatus.RUNNING,
      startedAt: new Date(),
    },
  });

  await prisma.campaignLead.updateMany({
    where: {
      campaignId,
      status: {
        in: [CampaignLeadStatus.PENDING, CampaignLeadStatus.FAILED, CampaignLeadStatus.MISSED],
      },
    },
    data: { status: CampaignLeadStatus.QUEUED },
  });

  const notification = await prisma.notification.create({
    data: {
      type: "CAMPAIGN",
      title: "Campaign queued for n8n",
      message: `${campaign.name} is ready — n8n will dial ${campaign.leads.length} lead(s)`,
      metadata: { campaignId },
    },
  });
  emitNotification(notification);
  emitDashboardRefresh();

  await forwardToN8n("campaign.queued", {
    campaignId,
    name: campaign.name,
    leadCount: campaign.leads.length,
    assistantId: campaign.assistantId,
    phoneNumberId: campaign.phoneNumberId,
  });

  return {
    campaignId,
    queued: true,
    message: "Campaign queued. Outbound dialing is handled by n8n.",
    leadCount: campaign.leads.length,
  };
}

export async function pauseCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError("Campaign not found", 404);
  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.PAUSED },
  });
}

export async function updateCampaignLeadFromCall(input: {
  callId: string;
  campaignId?: string | null;
  leadId?: string | null;
  status: string;
}) {
  if (!input.campaignId || !input.leadId) return;

  let leadStatus: CampaignLeadStatus = CampaignLeadStatus.CALLING;
  if (["COMPLETED", "ended", "completed"].includes(input.status)) {
    leadStatus = CampaignLeadStatus.COMPLETED;
  } else if (["MISSED", "no-answer", "busy", "missed"].includes(input.status)) {
    leadStatus = CampaignLeadStatus.MISSED;
  } else if (["FAILED", "failed", "canceled", "cancelled"].includes(input.status)) {
    leadStatus = CampaignLeadStatus.FAILED;
  }

  await prisma.campaignLead.updateMany({
    where: { campaignId: input.campaignId, leadId: input.leadId },
    data: {
      status: leadStatus,
      lastCallId: input.callId,
    },
  });
}

export async function listDueFollowUpCalls(limit = 20) {
  const now = new Date();
  return prisma.followUp.findMany({
    where: {
      status: "PENDING",
      dueAt: { lte: now },
    },
    include: { lead: true },
    orderBy: { dueAt: "asc" },
    take: limit,
  });
}
