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
import reportRoutes from "./routes/reports.routes.js";
import setupRoutes from "./routes/setup.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import templateRoutes from "./routes/templates.routes.js";
import webhookRoutes from "./routes/webhooks.routes.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em alguns minutos." }
});

const restrictedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." }
});

const allowedOrigins = env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: env.NODE_ENV === "production" ? { maxAge: 15552000, includeSubDomains: true } : false
  })
);
app.use(defaultLimiter);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origem não permitida pelo CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Hub-Signature-256"]
  })
);
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as Request).rawBody = Buffer.from(buf);
    }
  })
);
morgan.token("safe-url", (req) => sanitizeUrl((req as Request).originalUrl ?? req.url ?? ""));
app.use(morgan(":method :safe-url :status :response-time ms - :res[content-length]"));
app.use("/auth", restrictedLimiter, authRoutes);
app.use("/webhooks", webhookRoutes);
app.use("/public", restrictedLimiter, publicRoutes);
app.use("/integrations", restrictedLimiter, integrationRoutes);
app.use("/leads", requireAuth, leadRoutes);
app.use("/campaigns", requireAuth, campaignRoutes);
app.use("/conversations", requireAuth, conversationRoutes);
app.use("/dashboard", requireAuth, dashboardRoutes);
app.use("/reports", requireAuth, reportRoutes);
app.use("/templates", requireAuth, templateRoutes);
app.use("/setup", requireAuth, setupRoutes);
app.use("/settings", requireAuth, settingsRoutes);
app.use(notFound);
app.use(errorHandler);

function sanitizeUrl(url: string) {
  try {
    const parsed = new URL(url, "http://local");
    for (const key of ["access_token", "api_key", "key", "token", "refresh_token", "hub.verify_token"]) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, "[redacted]");
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.replace(/(access_token|api_key|key|token|refresh_token|hub\.verify_token)=([^&]+)/gi, "$1=[redacted]");
  }
}
