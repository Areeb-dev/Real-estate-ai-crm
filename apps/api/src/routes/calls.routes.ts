import { Router } from "express";
import { CallStatus, InterestLevel } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { paginationSchema } from "../validators";
import * as callService from "../services/call.service";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  validate(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    const result = await callService.listCalls({
      search: req.query.search as string | undefined,
      status: req.query.status as CallStatus | undefined,
      interestLevel: req.query.interestLevel as InterestLevel | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data: result });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const call = await callService.getCallById(req.params.id);
    res.json({ success: true, data: call });
  })
);

export default router;
