import cors from "cors";
import express, { type Request } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config.js";
import { requireAuth } from "./http/auth.js";
import { errorHandler, notFound } from "./http/errors.js";
import authRoutes from "./routes/auth.routes.js";
import campaignRoutes from "./routes/campaigns.routes.js";
import conversationRoutes from "./routes/conversations.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import integrationRoutes from "./routes/integrations.routes.js";
import leadRoutes from "./routes/leads.routes.js";
import publicRoutes from "./routes/public.routes.js";
import setupRoutes from "./routes/setup.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import templateRoutes from "./routes/templates.routes.js";
import webhookRoutes from "./routes/webhooks.routes.js";

export const app = express();

const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false
});

const restrictedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet());
app.use(defaultLimiter);
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as Request).rawBody = Buffer.from(buf);
    }
  })
);
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));
app.use("/auth", restrictedLimiter, authRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/public", restrictedLimiter, publicRoutes);
app.use("/integrations", restrictedLimiter, integrationRoutes);
app.use("/leads", requireAuth, leadRoutes);
app.use("/campaigns", requireAuth, campaignRoutes);
app.use("/conversations", requireAuth, conversationRoutes);
app.use("/dashboard", requireAuth, dashboardRoutes);
app.use("/templates", requireAuth, templateRoutes);
app.use("/setup", requireAuth, setupRoutes);
app.use("/settings", requireAuth, settingsRoutes);
app.use(notFound);
app.use(errorHandler);
