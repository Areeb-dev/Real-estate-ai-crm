import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { authenticate, authorize } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { agentSchema, registerUserSchema } from "../validators";
import * as settingsService from "../services/settings.service";
import * as authService from "../services/auth.service";
import * as notificationService from "../services/notification.service";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const data = await settingsService.getAllSettings();
    res.json({ success: true, data });
  })
);

router.put(
  "/company",
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => {
    const data = await settingsService.updateCompanyProfile(req.body);
    res.json({ success: true, data });
  })
);

router.put(
  "/vapi",
  authorize(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const data = await settingsService.updateVapiConfig(req.body);
    res.json({ success: true, data });
  })
);

router.put(
  "/calling-preferences",
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => {
    const data = await settingsService.updateCallingPreferences(req.body);
    res.json({ success: true, data });
  })
);

router.put(
  "/notifications",
  authorize(Role.ADMIN, Role.MANAGER),
  asyncHandler(async (req, res) => {
    const data = await settingsService.updateNotificationSettings(req.body);
    res.json({ success: true, data });
  })
);

router.get(
  "/agent",
  asyncHandler(async (_req, res) => {
    const agent = await settingsService.getActiveAgent();
    res.json({ success: true, data: agent });
  })
);

router.put(
  "/agent",
  authorize(Role.ADMIN, Role.MANAGER),
  validate(agentSchema),
  asyncHandler(async (req, res) => {
    const data = await settingsService.updateAIAgent(req.body);
    res.json({ success: true, data });
  })
);

router.get(
  "/users",
  authorize(Role.ADMIN),
  asyncHandler(async (_req, res) => {
    const users = await settingsService.listUsers();
    res.json({ success: true, data: users });
  })
);

router.post(
  "/users",
  authorize(Role.ADMIN),
  validate(registerUserSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.registerUser(req.body);
    res.status(201).json({ success: true, data: user });
  })
);

router.patch(
  "/users/:id/role",
  authorize(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const user = await settingsService.updateUserRole(req.params.id, req.body.role);
    res.json({ success: true, data: user });
  })
);

router.patch(
  "/users/:id/active",
  authorize(Role.ADMIN),
  asyncHandler(async (req, res) => {
    const user = await settingsService.setUserActive(req.params.id, Boolean(req.body.isActive));
    res.json({ success: true, data: user });
  })
);

router.get(
  "/notifications/feed",
  asyncHandler(async (req, res) => {
    const items = await notificationService.listNotifications(req.user?.id);
    res.json({ success: true, data: items });
  })
);

router.post(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const item = await notificationService.markNotificationRead(req.params.id);
    res.json({ success: true, data: item });
  })
);

router.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    const result = await notificationService.markAllRead(req.user?.id);
    res.json({ success: true, data: result });
  })
);

export default router;
