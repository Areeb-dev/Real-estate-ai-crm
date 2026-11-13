import { Router } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { authenticate, authorize } from "../middleware/auth";
import { loginSchema, registerUserSchema } from "../validators";
import * as authService from "../services/auth.service";

const router = Router();

router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password);
    res.json({ success: true, data: result });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getProfile(req.user!.id);
    res.json({ success: true, data: user });
  })
);

router.post(
  "/users",
  authenticate,
  authorize(Role.ADMIN),
  validate(registerUserSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.registerUser(req.body);
    res.status(201).json({ success: true, data: user });
  })
);

export default router;
