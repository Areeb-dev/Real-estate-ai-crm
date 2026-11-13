import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { authenticate } from "../middleware/auth";
import * as dashboardService from "../services/dashboard.service";

const router = Router();

router.use(authenticate);

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const stats = await dashboardService.getDashboardStats();
    res.json({ success: true, data: stats });
  })
);

router.get(
  "/charts",
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 30;
    const charts = await dashboardService.getDashboardCharts(days);
    res.json({ success: true, data: charts });
  })
);

router.get(
  "/analytics",
  asyncHandler(async (req, res) => {
    const data = await dashboardService.getAnalytics(
      req.query.from as string | undefined,
      req.query.to as string | undefined
    );
    res.json({ success: true, data });
  })
);

export default router;
