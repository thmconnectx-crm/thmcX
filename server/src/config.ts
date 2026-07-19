import "dotenv/config";
import { z, ZodError } from "zod";

const text = (fallback = "") => z.string().default(fallback).transform((value) => value.trim());
const enumText = <T extends [string, ...string[]]>(values: T, fallback: T[number]) =>
  z
    .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.enum(values))
    .default(fallback);

const baseEnvSchema = z.object({
  NODE_ENV: text("development"),
  QUEUE_MODE: enumText(["worker", "manual"], "worker"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: text("http://localhost:5173"),
  SUPABASE_URL: text(),
  SUPABASE_SERVICE_ROLE_KEY: text(),
  JWT_SECRET: text().pipe(z.string().min(16)),
  SEED_TENANT_NAME: text("ThM ConnectX"),
  SEED_ADMIN_EMAIL: text(),
  SEED_ADMIN_PASSWORD: text(),
  REDIS_URL: text("redis://localhost:6379"),
  WHATSAPP_VERIFY_TOKEN: text(),
  WHATSAPP_ACCESS_TOKEN: text(),
  WHATSAPP_PHONE_NUMBER_ID: text(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: text(),
  WHATSAPP_APP_SECRET: text(),
  WHATSAPP_API_VERSION: text("v20.0"),
  AI_PROVIDER: enumText(["openai", "gemini"], "openai"),
  OPENAI_API_KEY: text(),
  OPENAI_MODEL: text("gpt-4.1-mini"),
  GEMINI_API_KEY: text(),
  GEMINI_MODEL: text("gemini-3.5-flash"),
  GOOGLE_PLACES_API_KEY: text(),
  OVERPASS_API_URL: text("https://overpass-api.de/api/interpreter"),
  REPORT_MONITOR_ENABLED: enumText(["true", "false"], "true"),
  REPORT_MONITOR_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(60)
});

const requiredInProduction = [
  "CLIENT_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_APP_SECRET"
] as const;

const envSchema = baseEnvSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== "production") return;

  for (const key of requiredInProduction) {
    if (!value[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} é obrigatório em produção`
      });
    }
  }

  for (const key of requiredInProduction) {
    if (["replace-me", "missing", "your-project"].some((placeholder) => value[key].includes(placeholder))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} precisa usar um valor real em produção`
      });
    }
  }

  if (value.CLIENT_ORIGIN.includes("localhost") || value.CLIENT_ORIGIN.includes("127.0.0.1")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CLIENT_ORIGIN"],
      message: "CLIENT_ORIGIN deve apontar para a URL pública do painel em produção"
    });
  }

  try {
    const url = new URL(value.SUPABASE_URL);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
      throw new Error("invalid supabase host");
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SUPABASE_URL"],
      message: "SUPABASE_URL deve ser a Project URL do Supabase, no formato https://xxxxx.supabase.co"
    });
  }

  for (const origin of value.CLIENT_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean)) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "https:") throw new Error("invalid origin protocol");
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLIENT_ORIGIN"],
        message: "CLIENT_ORIGIN deve conter URL publica valida do painel"
      });
    }
  }

  if (value.JWT_SECRET === "replace-with-a-long-random-secret") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_SECRET"],
      message: "JWT_SECRET precisa ser trocado em produção"
    });
  }

  if (value.QUEUE_MODE === "worker" && !value.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_URL"],
      message: "REDIS_URL é obrigatório em produção quando QUEUE_MODE=worker"
    });
  }

  if (value.AI_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENAI_API_KEY"],
      message: "OPENAI_API_KEY é obrigatório quando AI_PROVIDER=openai"
    });
  }

  if (value.AI_PROVIDER === "gemini" && !value.GEMINI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GEMINI_API_KEY"],
      message: "GEMINI_API_KEY é obrigatório quando AI_PROVIDER=gemini"
    });
  }

  if (value.AI_PROVIDER === "gemini" && value.GEMINI_API_KEY === "replace-me") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GEMINI_API_KEY"],
      message: "GEMINI_API_KEY precisa usar um valor real em produção"
    });
  }

  if (value.AI_PROVIDER === "openai" && value.OPENAI_API_KEY === "replace-me") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OPENAI_API_KEY"],
      message: "OPENAI_API_KEY precisa usar um valor real em produção"
    });
  }
});

function loadEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Invalid environment configuration:");
      for (const issue of error.issues) {
        console.error(`- ${issue.path.join(".") || "ENV"}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }
}

export const env = loadEnv();
