import { Redis } from "ioredis";
import OpenAI from "openai";
import { env } from "../config.js";
import { supabase } from "../db.js";

type CheckStatus = "connected" | "pending" | "error";

export type SystemCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  message: string;
  last_checked_at: string;
  error_message?: string;
};

type SetupStatus = {
  checks: SystemCheck[];
  supabase_connected: boolean;
  redis_connected: boolean;
  openai_connected: boolean;
  whatsapp_cloud_connected: boolean;
  whatsapp_token_configured: boolean;
  phone_number_id_configured: boolean;
  whatsapp_business_account_id_configured: boolean;
  webhook_verified: boolean;
  template_approved: boolean;
  worker_running: boolean;
  inbound_worker_running: boolean;
  demo_mode: boolean;
};

const checkGroups = {
  supabase: ["supabase_connected"],
  redis: ["redis_connected"],
  openai: ["openai_connected"],
  whatsapp: [
    "whatsapp_cloud_connected",
    "phone_number_id_configured",
    "whatsapp_business_account_id_configured",
    "webhook_verified",
    "templates_available"
  ],
  worker: ["worker_running", "inbound_worker_running"]
} as const;

export async function getSetupStatus(tenantId: string): Promise<SetupStatus> {
  const [
    supabaseStatus,
    redisStatus,
    openAiStatus,
    whatsappStatus,
    phoneNumberStatus,
    businessAccountStatus,
    webhookStatus,
    workerStatus,
    inboundWorkerStatus,
    templateStatus
  ] = await Promise.all([
    checkSupabase(),
    checkRedis(),
    checkOpenAI(),
    checkWhatsAppCloud(),
    checkPhoneNumberId(),
    checkBusinessAccountId(),
    checkWebhookVerified(),
    checkWorkerHeartbeat(),
    checkInboundWorkerHeartbeat(),
    checkApprovedTemplate(tenantId)
  ]);

  const demoStatus = makeCheck({
    key: "demo_mode",
    label: "Modo demonstracao ativo/inativo",
    status: "pending",
    message: "A API usa dados reais; o modo demonstracao e ativado somente no painel com ?preview=1."
  });

  const checks = [
    supabaseStatus,
    redisStatus,
    openAiStatus,
    whatsappStatus,
    phoneNumberStatus,
    businessAccountStatus,
    webhookStatus,
    workerStatus,
    inboundWorkerStatus,
    demoStatus,
    templateStatus
  ];

  return {
    checks,
    supabase_connected: supabaseStatus.status === "connected",
    redis_connected: redisStatus.status === "connected",
    openai_connected: openAiStatus.status === "connected",
    whatsapp_cloud_connected: whatsappStatus.status === "connected",
    whatsapp_token_configured: Boolean(env.WHATSAPP_ACCESS_TOKEN),
    phone_number_id_configured: phoneNumberStatus.status === "connected",
    whatsapp_business_account_id_configured: businessAccountStatus.status === "connected",
    webhook_verified: webhookStatus.status === "connected",
    template_approved: templateStatus.status === "connected",
    worker_running: workerStatus.status === "connected",
    inbound_worker_running: inboundWorkerStatus.status === "connected",
    demo_mode: false
  };
}

export async function testSetupCheck(tenantId: string, key: string) {
  const check = await runCheckByKey(tenantId, key);
  if (!check) throw new Error("Check desconhecido");
  return check;
}

export async function testSetupGroup(tenantId: string, group: keyof typeof checkGroups, key?: string) {
  if (key) return testSetupCheck(tenantId, key);

  const keys = checkGroups[group];
  const checks = await Promise.all(keys.map((item) => testSetupCheck(tenantId, item)));
  return checks.length === 1 ? checks[0] : { checks };
}

async function runCheckByKey(tenantId: string, key: string): Promise<SystemCheck | null> {
  const checks: Record<string, () => Promise<SystemCheck> | SystemCheck> = {
    supabase_connected: checkSupabase,
    redis_connected: checkRedis,
    openai_connected: checkOpenAI,
    whatsapp_cloud_connected: checkWhatsAppCloud,
    phone_number_id_configured: checkPhoneNumberId,
    whatsapp_business_account_id_configured: checkBusinessAccountId,
    webhook_verified: checkWebhookVerified,
    worker_running: checkWorkerHeartbeat,
    inbound_worker_running: checkInboundWorkerHeartbeat,
    demo_mode: () =>
      makeCheck({
        key: "demo_mode",
        label: "Modo demonstracao ativo/inativo",
        status: "pending",
        message: "A API usa dados reais; o modo demonstracao e ativado somente no painel com ?preview=1."
      }),
    templates_available: () => checkApprovedTemplate(tenantId),
    template_approved: () => checkApprovedTemplate(tenantId)
  };
  return checks[key] ? checks[key]() : null;
}

async function checkSupabase(): Promise<SystemCheck> {
  const missing = missingEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (missing.length) {
    return pending("supabase_connected", "Supabase conectado", `Configure ${missing.join(", ")} no ambiente da API.`);
  }

  try {
    const { error } = await supabase.from("settings").select("id").limit(1);
    if (error) throw error;
    return connected("supabase_connected", "Supabase conectado", "Banco respondeu com sucesso.");
  } catch (error) {
    return failed("supabase_connected", "Supabase conectado", "Nao foi possivel consultar o Supabase.", error);
  }
}

async function checkRedis(): Promise<SystemCheck> {
  if (!env.REDIS_URL) return pending("redis_connected", "Redis conectado", "Configure REDIS_URL no ambiente da API e do worker.");

  let redis: Redis | null = null;
  try {
    const url = new URL(env.REDIS_URL);
    redis = new Redis({
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: url.pathname ? Number(url.pathname.slice(1) || 0) : 0,
      tls: url.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true
    });
    await redis.connect();
    await redis.ping();
    return connected("redis_connected", "Redis conectado", "Redis respondeu ao PING.");
  } catch (error) {
    return failed("redis_connected", "Redis conectado", "Nao foi possivel conectar no Redis.", error);
  } finally {
    redis?.disconnect();
  }
}

async function checkOpenAI(): Promise<SystemCheck> {
  if (!env.OPENAI_API_KEY) return pending("openai_connected", "OpenAI conectada", "Configure OPENAI_API_KEY no ambiente da API.");

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    await client.models.retrieve(env.OPENAI_MODEL);
    return connected("openai_connected", "OpenAI conectada", `Modelo ${env.OPENAI_MODEL} acessivel.`);
  } catch (error) {
    return failed("openai_connected", "OpenAI conectada", "Nao foi possivel validar a OpenAI.", error);
  }
}

async function checkWhatsAppCloud(): Promise<SystemCheck> {
  const missing = missingEnv(["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]);
  if (missing.length) {
    return pending("whatsapp_cloud_connected", "WhatsApp Cloud API conectada", `Configure ${missing.join(", ")} no ambiente da API.`);
  }

  try {
    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` }
    });
    const payload = (await response.json()) as { error?: { message?: string }; display_phone_number?: string };
    if (!response.ok) throw new Error(payload.error?.message ?? "WhatsApp Cloud API recusou a conexao.");
    return connected(
      "whatsapp_cloud_connected",
      "WhatsApp Cloud API conectada",
      payload.display_phone_number ? `Numero ${payload.display_phone_number} acessivel.` : "Phone Number ID acessivel pela Graph API."
    );
  } catch (error) {
    return failed("whatsapp_cloud_connected", "WhatsApp Cloud API conectada", "Nao foi possivel validar a Graph API.", error);
  }
}

function checkPhoneNumberId(): SystemCheck {
  return env.WHATSAPP_PHONE_NUMBER_ID
    ? connected("phone_number_id_configured", "Phone Number ID configurado", "WHATSAPP_PHONE_NUMBER_ID encontrado no ambiente.")
    : pending("phone_number_id_configured", "Phone Number ID configurado", "Configure WHATSAPP_PHONE_NUMBER_ID no ambiente da API e do worker.");
}

function checkBusinessAccountId(): SystemCheck {
  return env.WHATSAPP_BUSINESS_ACCOUNT_ID
    ? connected(
        "whatsapp_business_account_id_configured",
        "WhatsApp Business Account ID configurado",
        "WHATSAPP_BUSINESS_ACCOUNT_ID encontrado no ambiente."
      )
    : pending(
        "whatsapp_business_account_id_configured",
        "WhatsApp Business Account ID configurado",
        "Configure WHATSAPP_BUSINESS_ACCOUNT_ID para consultar templates e ativos do WhatsApp Business."
      );
}

async function checkApprovedTemplate(tenantId: string): Promise<SystemCheck> {
  const missing = missingEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (missing.length) {
    return pending("templates_available", "Templates WhatsApp disponiveis", `Configure ${missing.join(", ")} antes de consultar templates.`);
  }

  const { count, error } = await supabase
    .from("whatsapp_templates")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "approved");
  if (error) return failed("templates_available", "Templates WhatsApp disponiveis", "Nao foi possivel consultar templates.", error);
  return makeCheck({
    key: "templates_available",
    label: "Templates WhatsApp disponiveis",
    status: (count ?? 0) > 0 ? "connected" : "pending",
    message: (count ?? 0) > 0 ? "Ha pelo menos um template aprovado cadastrado." : "Cadastre um template com status approved."
  });
}

async function checkWebhookVerified(): Promise<SystemCheck> {
  const missing = missingEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_VERIFY_TOKEN"]);
  if (missing.length) {
    return pending("webhook_verified", "Webhook WhatsApp verificado", `Configure ${missing.join(", ")} antes de validar o webhook.`);
  }

  const result = await supabase.from("settings").select("value").eq("key", "whatsapp_webhook_verified").maybeSingle();
  if (result.error) return failed("webhook_verified", "Webhook WhatsApp verificado", "Nao foi possivel consultar o status do webhook.", result.error);

  const verified = Boolean((result.data?.value as { verified?: boolean } | null)?.verified);
  return makeCheck({
    key: "webhook_verified",
    label: "Webhook WhatsApp verificado",
    status: verified ? "connected" : "pending",
    message: verified ? "Webhook marcado como verificado." : "Valide o webhook da Meta e registre whatsapp_webhook_verified=true."
  });
}

async function checkWorkerHeartbeat(): Promise<SystemCheck> {
  const missing = missingEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL"]);
  if (missing.length) {
    return pending("worker_running", "Worker de disparos rodando", `Configure ${missing.join(", ")} no ambiente da API e do worker.`);
  }

  const result = await supabase.from("settings").select("value").eq("key", "worker_heartbeat").maybeSingle();
  if (result.error) return failed("worker_running", "Worker de disparos rodando", "Nao foi possivel consultar heartbeat do worker.", result.error);

  const heartbeat = result.data?.value as { updated_at?: string } | null;
  if (!heartbeat?.updated_at) {
    return makeCheck({
      key: "worker_running",
      label: "Worker de disparos rodando",
      status: "pending",
      message: "Nenhum heartbeat do worker foi registrado ainda."
    });
  }

  const ageMs = Date.now() - new Date(heartbeat.updated_at).getTime();
  return makeCheck({
    key: "worker_running",
    label: "Worker de disparos rodando",
    status: ageMs <= 120000 ? "connected" : "error",
    message: ageMs <= 120000 ? "Worker enviou heartbeat recentemente." : "Heartbeat do worker esta antigo; verifique o processo.",
    error_message: ageMs <= 120000 ? undefined : "Inicie o worker com npm run worker e confirme o acesso ao Redis/Supabase."
  });
}

async function checkInboundWorkerHeartbeat(): Promise<SystemCheck> {
  const missing = missingEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL"]);
  if (missing.length) {
    return pending(
      "inbound_worker_running",
      "Worker de mensagens recebidas rodando",
      `Configure ${missing.join(", ")} no ambiente da API e do worker inbound.`
    );
  }

  const result = await supabase.from("settings").select("value").eq("key", "inbound_worker_heartbeat").maybeSingle();
  if (result.error) {
    return failed(
      "inbound_worker_running",
      "Worker de mensagens recebidas rodando",
      "Nao foi possivel consultar heartbeat do worker inbound.",
      result.error
    );
  }

  const heartbeat = result.data?.value as { updated_at?: string } | null;
  if (!heartbeat?.updated_at) {
    return makeCheck({
      key: "inbound_worker_running",
      label: "Worker de mensagens recebidas rodando",
      status: "pending",
      message: "Nenhum heartbeat do worker inbound foi registrado ainda."
    });
  }

  const ageMs = Date.now() - new Date(heartbeat.updated_at).getTime();
  return makeCheck({
    key: "inbound_worker_running",
    label: "Worker de mensagens recebidas rodando",
    status: ageMs <= 120000 ? "connected" : "error",
    message:
      ageMs <= 120000
        ? "Worker inbound enviou heartbeat recentemente."
        : "Heartbeat do worker inbound esta antigo; verifique o processo.",
    error_message: ageMs <= 120000 ? undefined : "Inicie o worker inbound com npm run inbound-worker e confirme Redis/Supabase."
  });
}

function missingEnv(keys: string[]) {
  return keys.filter((key) => !process.env[key]);
}

function connected(key: string, label: string, message: string) {
  return makeCheck({ key, label, status: "connected", message });
}

function pending(key: string, label: string, message: string) {
  return makeCheck({ key, label, status: "pending", message });
}

function failed(key: string, label: string, message: string, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "Erro desconhecido.";
  return makeCheck({ key, label, status: "error", message, error_message: errorMessage });
}

function makeCheck(input: Omit<SystemCheck, "last_checked_at">): SystemCheck {
  return {
    ...input,
    last_checked_at: new Date().toISOString()
  };
}
