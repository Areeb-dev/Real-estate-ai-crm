import { Router, raw } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { processVapiWebhook, verifyVapiSignature } from "../services/vapi.service";

const router = Router();

router.post(
  "/vapi",
  raw({ type: "*/*" }),
  asyncHandler(async (req, res) => {
    const signature =
      (req.headers["x-vapi-signature"] as string | undefined) ||
      (req.headers["x-signature"] as string | undefined);

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));

    if (!verifyVapiSignature(rawBody, signature)) {
      throw new AppError("Invalid webhook signature", 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new AppError("Invalid JSON payload", 400);
    }

    const result = await processVapiWebhook(payload);
    res.json({ success: true, data: result });
  })
);

export default router;
