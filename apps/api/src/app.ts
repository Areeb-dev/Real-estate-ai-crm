import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/errorHandler";
import authRoutes from "./routes/auth.routes";
import leadsRoutes from "./routes/leads.routes";
import callsRoutes from "./routes/calls.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import settingsRoutes from "./routes/settings.routes";
import webhooksRoutes from "./routes/webhooks.routes";
import outboundRoutes from "./routes/outbound.routes";

export function createApp() {
  const app = express();

  // Required behind localtunnel / ngrok / reverse proxies (X-Forwarded-For)
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ success: true, status: "ok", service: "real-estate-api" });
  });

  // Vapi webhooks need raw body for signature verification
  app.use("/api/webhooks", webhooksRoutes);

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/leads", leadsRoutes);
  app.use("/api/calls", callsRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/outbound", outboundRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
