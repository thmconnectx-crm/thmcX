import "dotenv/config";
import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  QUEUE_MODE: z.enum(["worker", "manual"]).default("worker"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  SUPABASE_URL: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  JWT_SECRET: z.string().min(16),
  SEED_TENANT_NAME: z.string().default("ThM ConnectX"),
  SEED_ADMIN_EMAIL: z.string().default(""),
  SEED_ADMIN_PASSWORD: z.string().default(""),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  WHATSAPP_VERIFY_TOKEN: z.string().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default(""),
  WHATSAPP_APP_SECRET: z.string().default(""),
  WHATSAPP_API_VERSION: z.string().default("v20.0"),
  AI_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash")
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

export const env = envSchema.parse(process.env);
