import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
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

export const env = envSchema.parse(process.env);
