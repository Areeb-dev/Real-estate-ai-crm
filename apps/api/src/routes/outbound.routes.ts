import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import * as outboundService from "../services/outbound.service";
import * as campaignService from "../services/campaign.service";
import * as n8nQueue from "../services/n8n-queue.service";
import { verifyN8nSecret } from "../services/n8n.service";
import { AppError } from "../utils/errors";

const router = Router();

function requireN8n(req: { headers: Record<string, unknown> }) {
  if (!verifyN8nSecret(req.headers["x-n8n-secret"] as string | undefined)) {
    throw new AppError("Invalid n8n secret", 401);
  }
}

const outboundSchema = z.object({
  leadId: z.string().uuid().optional(),
  phone: z.string().min(5).optional(),
  name: z.string().optional(),
  campaignId: z.string().uuid().optional(),
  assistantId: z.string().optional(),
  phoneNumberId: z.string().optional(),
});

const campaignSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  leadIds: z.array(z.string().uuid()).optional(),
  assistantId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  scheduledAt: z.string().optional(),
  maxRetries: z.coerce.number().int().min(0).max(5).optional(),
  retryDelayMins: z.coerce.number().int().min(5).max(1440).optional(),
});

// Manual one-off call from CRM UI (still uses Vapi). Campaign automation lives in n8n.
router.post(
  "/calls",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER, Role.AGENT),
  validate(outboundSchema),
  asyncHandler(async (req, res) => {
    const call = await outboundService.placeOutboundCall(req.body);
    res.status(201).json({ success: true, data: call });
  })
);

router.post(
  "/calls/:id/retry",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER, Role.AGENT),
  asyncHandler(async (req, res) => {
    const call = await outboundService.retryMissedOutboundCall(req.params.id);
    res.status(201).json({ success: true, data: call });
  })
);

router.get(
  "/campaigns",
  authenticate,
  asyncHandler(async (_req, res) => {
    const campaigns = await campaignService.listCampaigns();
    res.json({ success: true, data: campaigns });
  })
);

router.get(
  "/campaigns/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.getCampaign(req.params.id);
    res.json({ success: true, data: campaign });
  })
);

router.post(
  "/campaigns",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER),
  validate(campaignSchema),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.createCampaign({
      ...req.body,
      createdById: req.user?.id,
    });
    res.status(201).json({ success: true, data: campaign });
  })
);

router.post(
  "/campaigns/:id/leads",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => {
    const leadIds = Array.isArray(req.body.leadIds) ? req.body.leadIds : [];
    const campaign = await campaignService.addLeadsToCampaign(req.params.id, leadIds);
    res.json({ success: true, data: campaign });
  })
);

router.post(
  "/campaigns/:id/start",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => {
    const result = await campaignService.startCampaign(req.params.id);
    res.json({ success: true, data: result });
  })
);

router.post(
  "/campaigns/:id/pause",
  authenticate,
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.pauseCampaign(req.params.id);
    res.json({ success: true, data: campaign });
  })
);

/**
 * n8n automation surface — orchestration stays in n8n.
 * Header: x-n8n-secret: <N8N_SHARED_SECRET>
 */
router.get(
  "/n8n/queue",
  asyncHandler(async (req, res) => {
    requireN8n(req);
    const data = await n8nQueue.getOutboundQueue({
      campaignId: req.query.campaignId as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      statuses: req.query.statuses
        ? String(req.query.statuses).split(",")
        : undefined,
    });
    res.json({ success: true, data });
  })
);

router.post(
  "/n8n/calls/started",
  asyncHandler(async (req, res) => {
    requireN8n(req);
    const call = await n8nQueue.recordOutboundCallStarted(req.body);
    res.status(201).json({ success: true, data: call });
  })
);

router.post(
  "/n8n/calls/result",
  asyncHandler(async (req, res) => {
    requireN8n(req);
    const call = await n8nQueue.recordOutboundCallResult(req.body);
    res.json({ success: true, data: call });
  })
);

router.post(
  "/n8n/calls/failed",
  asyncHandler(async (req, res) => {
    requireN8n(req);
    const data = await n8nQueue.markCampaignLeadFailed(req.body);
    res.json({ success: true, data });
  })
);

router.post(
  "/n8n/trigger",
  asyncHandler(async (req, res) => {
    requireN8n(req);
    const action = String(req.body.action || "");

    if (action === "get_queue") {
      const data = await n8nQueue.getOutboundQueue({
        campaignId: req.body.campaignId,
        limit: req.body.limit,
        statuses: req.body.statuses,
      });
      return res.json({ success: true, data });
    }

    if (action === "queue_campaign") {
      const result = await campaignService.startCampaign(req.body.campaignId);
      return res.json({ success: true, data: result });
    }

    if (action === "due_followups") {
      const items = await campaignService.listDueFollowUpCalls(
        req.body.limit ? Number(req.body.limit) : 20
      );
      return res.json({ success: true, data: items });
    }

    // Kept for rare one-offs; prefer n8n → Vapi → /n8n/calls/started
    if (action === "outbound_call") {
      const call = await outboundService.placeOutboundCall({
        leadId: req.body.leadId,
        phone: req.body.phone,
        name: req.body.name,
        campaignId: req.body.campaignId,
        assistantId: req.body.assistantId,
        phoneNumberId: req.body.phoneNumberId,
      });
      return res.status(201).json({ success: true, data: call });
    }

    throw new AppError("Unknown n8n action", 400);
  })
);

export default router;
