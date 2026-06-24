import crypto from "node:crypto";
import { z } from "zod";
import { assertDb, supabase } from "../db.js";
import { HttpError } from "../http/errors.js";
import { getOrCreateConversation } from "./conversation.service.js";
import { sendWhatsAppText } from "./whatsapp.service.js";

const sourceTypes = [
  "manual",
  "csv",
  "webhook",
  "meta_ads",
  "google_ads",
  "google_sheets",
  "landing_page",
  "zapier",
  "make",
  "api"
] as const;

export const leadSourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(sourceTypes),
  status: z.string().default("inactive"),
  api_key: z.string().optional(),
  webhook_url: z.string().optional().nullable(),
  external_account_id: z.string().optional().nullable(),
  settings: z
    .object({
      account_id: z.string().optional(),
      page_id: z.string().optional(),
      form_id: z.string().optional(),
      access_token: z.string().optional(),
      customer_id: z.string().optional(),
      conversion_action_id: z.string().optional(),
      gclid: z.string().optional(),
      auto_ai_enabled: z.boolean().optional(),
      send_first_message: z.boolean().optional(),
      first_message_body: z.string().optional(),
      auto_tag: z.string().optional(),
      initial_status: z.string().optional(),
      assigned_user_id: z.string().uuid().optional(),
      campaign_id: z.string().uuid().optional(),
      block_auto_send: z.boolean().optional(),
      opt_in_status: z.enum(["unknown", "authorized", "denied"]).optional()
    })
    .passthrough()
    .default({})
});

export const leadSourcePatchSchema = leadSourceSchema.partial();

type LeadSource = {
  id: string;
  tenant_id: string;
  name: string;
  type: (typeof sourceTypes)[number];
  status: string;
  api_key: string;
  settings: Record<string, unknown>;
};

type NormalizedLead = {
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  niche?: string | null;
  campaign_name?: string | null;
  ad_name?: string | null;
  adset_name?: string | null;
  form_name?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  gclid?: string | null;
};

export function generateApiKey() {
  return crypto.randomBytes(24).toString("hex");
}

export async function createLeadSource(tenantId: string, input: z.infer<typeof leadSourceSchema>, baseUrl = "") {
  const payload = leadSourceSchema.parse(input);
  const created = assertDb(
    await supabase
      .from("lead_sources")
      .insert({
        ...payload,
        tenant_id: tenantId,
        status: payload.status ?? "inactive",
        api_key: payload.api_key ?? generateApiKey()
      })
      .select("*")
      .single()
  ) as LeadSource & { webhook_url?: string | null };

  const webhookUrl = created.webhook_url ?? `${baseUrl}/integrations/webhook/${created.id}`;
  return assertDb(
    await supabase
      .from("lead_sources")
      .update({ webhook_url: webhookUrl })
      .eq("id", created.id)
      .select("*")
      .single()
  );
}

export async function listLeadSources(tenantId: string) {
  const sources = assertDb(
    await supabase
      .from("lead_sources")
      .select("*")
      .eq("tenant_id", tenantId)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
  ) as Array<LeadSource & { created_at: string; webhook_url?: string | null }>;

  return Promise.all(
    sources.map(async (source) => {
      const [received, errors, lastSync, logs] = await Promise.all([
        countRows(tenantId, "incoming_leads", { source_id: source.id }),
        countRows(tenantId, "integration_logs", { source_id: source.id, status: "error" }),
        lastIncomingLead(source.id),
        recentLogs(source.id)
      ]);
      return {
        ...source,
        leads_received: received,
        error_count: errors,
        last_sync_at: lastSync?.created_at ?? null,
        recent_logs: logs
      };
    })
  );
}

export async function getConnectionsDashboard(tenantId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [receivedToday, totalIncoming, processed, duplicates, errors, activeSources] = await Promise.all([
    countRows(tenantId, "incoming_leads", {}, `${today}T00:00:00.000Z`),
    countRows(tenantId, "incoming_leads"),
    countRows(tenantId, "incoming_leads", { status: "processado" }),
    countRows(tenantId, "incoming_leads", { status: "duplicado" }),
    countRows(tenantId, "incoming_leads", { status: "erro" }),
    countRows(tenantId, "lead_sources", { status: "active" })
  ]);

  return {
    leads_received_today: receivedToday,
    processing_rate: totalIncoming > 0 ? Number(((processed / totalIncoming) * 100).toFixed(2)) : 0,
    duplicates,
    errors,
    active_sources: activeSources,
    total_incoming: totalIncoming
  };
}

export async function updateLeadSource(tenantId: string, id: string, input: z.infer<typeof leadSourcePatchSchema>) {
  const payload = leadSourcePatchSchema.parse(input);
  return assertDb(
    await supabase
      .from("lead_sources")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

export async function deleteLeadSource(tenantId: string, id: string) {
  return assertDb(
    await supabase
      .from("lead_sources")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

export async function testLeadSource(tenantId: string, id: string) {
  const source = await getSource(id, tenantId);
  await logIntegration(source.id, "test_connection", "success", { source_id: id }, { ok: true });
  return {
    success: true,
    source_id: source.id,
    message: "Conexão pronta para receber leads"
  };
}

export async function receivePublicLead(apiKey: string, payload: unknown) {
  const result = await supabase.from("lead_sources").select("*").eq("api_key", apiKey).eq("type", "api").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new HttpError(401, "API key inválida");
  const source = result.data as LeadSource;
  return processIncomingLead(source, payload, "public_api");
}

export async function receiveWebhookLead(sourceId: string, payload: unknown, apiKey?: string) {
  const source = await getSource(sourceId);
  if (source.api_key && (!apiKey || !safeEqual(source.api_key, apiKey))) throw new HttpError(401, "API key inválida");
  return processIncomingLead(source, payload, "webhook");
}

async function processIncomingLead(source: LeadSource, payload: unknown, eventType: string) {
  const rawPayload = toRecord(payload);
  const normalized = normalizeLead(rawPayload);
  const incoming = assertDb(
    await supabase
      .from("incoming_leads")
      .insert({
        tenant_id: source.tenant_id,
        source_id: source.id,
        raw_payload: rawPayload,
        ...normalized,
        status: "recebido"
      })
      .select("*")
      .single()
  ) as { id: string };

  try {
    validatePhone(normalized.phone);
    const existing = await supabase
      .from("leads")
      .select("*")
      .eq("tenant_id", source.tenant_id)
      .eq("phone", normalized.phone)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    const settings = source.settings ?? {};
    const autoTag = stringSetting(settings, "auto_tag");
    const initialStatus = stringSetting(settings, "initial_status") ?? "novo_lead_ads";
    const leadPayload = {
      ...normalized,
      tenant_id: source.tenant_id,
      source_id: source.id,
      source_type: source.type,
      source: source.name,
      status: initialStatus,
      opt_in_status:
        pickString(rawPayload, ["opt_in_status"]) === "denied"
          ? "denied"
          : stringSetting(settings, "opt_in_status") ?? "authorized",
      tags: autoTag ? [autoTag] : [],
      last_source_sync_at: new Date().toISOString()
    };

    const lead = existing.data
      ? await updateExistingLead(existing.data as Record<string, unknown>, leadPayload)
      : ((assertDb(await supabase.from("leads").insert(leadPayload).select("*").single()) as Record<string, unknown>));

    await supabase.from("lead_source_history").insert({
      tenant_id: source.tenant_id,
      lead_id: lead.id,
      source_id: source.id,
      source_type: source.type,
      campaign_name: normalized.campaign_name,
      ad_name: normalized.ad_name,
      adset_name: normalized.adset_name,
      form_name: normalized.form_name,
      utm_source: normalized.utm_source,
      utm_medium: normalized.utm_medium,
      utm_campaign: normalized.utm_campaign,
      utm_content: normalized.utm_content,
      utm_term: normalized.utm_term,
      raw_payload: rawPayload
    });

    const conversation = await getOrCreateConversation(String(lead.id), source.tenant_id);
    await supabase
      .from("conversations")
      .update({
        ai_enabled: settings.auto_ai_enabled !== false,
        assigned_user_id: stringSetting(settings, "assigned_user_id"),
        status: "aguardando_atendimento",
        updated_at: new Date().toISOString()
      })
      .eq("id", conversation.id)
      .eq("tenant_id", source.tenant_id);

    if (stringSetting(settings, "campaign_id")) {
      await supabase.from("campaign_leads").upsert({
        tenant_id: source.tenant_id,
        campaign_id: stringSetting(settings, "campaign_id"),
        lead_id: lead.id,
        status: "pending"
      }, { onConflict: "tenant_id,campaign_id,lead_id" });
    }

    await maybeSendFirstMessage(source, lead as { id: string; phone: string; name?: string; opt_out?: boolean }, conversation.id);

    const status = existing.data ? "duplicado" : "processado";
    await supabase
      .from("incoming_leads")
      .update({ status, processed_at: new Date().toISOString() })
      .eq("id", incoming.id);
    await logIntegration(source.id, eventType, "success", rawPayload, { lead_id: lead.id, status });

    return { success: true, lead_id: lead.id, message: "Lead recebido com sucesso", duplicate: Boolean(existing.data) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar lead";
    await supabase
      .from("incoming_leads")
      .update({ status: "erro", processed_at: new Date().toISOString() })
      .eq("id", incoming.id);
    await logIntegration(source.id, eventType, "error", rawPayload, null, message);
    throw error;
  }
}

function normalizeLead(payload: Record<string, unknown>): NormalizedLead {
  return {
    name: pickString(payload, ["name", "nome", "full_name", "nome_completo"]) ?? "Lead sem nome",
    phone: normalizePhone(pickString(payload, ["phone", "telefone", "whatsapp", "celular"]) ?? ""),
    email: pickString(payload, ["email", "e-mail"]),
    company: pickString(payload, ["company", "empresa"]),
    city: pickString(payload, ["city", "cidade"]),
    niche: pickString(payload, ["niche", "nicho", "segmento"]),
    campaign_name: pickString(payload, ["campaign_name", "campaign", "campanha", "utm_campaign"]),
    ad_name: pickString(payload, ["ad_name", "anuncio"]),
    adset_name: pickString(payload, ["adset_name", "conjunto"]),
    form_name: pickString(payload, ["form_name", "formulario"]),
    utm_source: pickString(payload, ["utm_source"]),
    utm_medium: pickString(payload, ["utm_medium"]),
    utm_campaign: pickString(payload, ["utm_campaign"]),
    utm_content: pickString(payload, ["utm_content"]),
    utm_term: pickString(payload, ["utm_term"]),
    gclid: pickString(payload, ["gclid"])
  };
}

async function updateExistingLead(existing: Record<string, unknown>, payload: Record<string, unknown>) {
  const update: Record<string, unknown> = {
    last_source_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  for (const key of [
    "name",
    "email",
    "company",
    "city",
    "niche",
    "source",
    "source_id",
    "source_type",
    "campaign_name",
    "ad_name",
    "adset_name",
    "form_name",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term"
  ]) {
    if (!existing[key] && payload[key]) update[key] = payload[key];
  }
  const tags = new Set([...(Array.isArray(existing.tags) ? existing.tags : []), ...((payload.tags as string[]) ?? [])]);
  update.tags = Array.from(tags);
  return assertDb(
    await supabase
      .from("leads")
      .update(update)
      .eq("id", existing.id)
      .eq("tenant_id", payload.tenant_id)
      .select("*")
      .single()
  );
}

async function maybeSendFirstMessage(
  source: LeadSource,
  lead: { id: string; phone: string; name?: string; opt_out?: boolean },
  conversationId: string
) {
  const settings = source.settings ?? {};
  if (!settings.send_first_message || settings.block_auto_send || lead.opt_out) return;
  const template =
    stringSetting(settings, "first_message_body") ??
    "Olá, [nome]. Tudo bem?\n\nRecebi seu cadastro sobre captação de clientes pela internet.\n\nPara eu entender melhor: hoje você já anuncia no Google, Instagram ou Facebook?";
  const body = template.replace("[nome]", lead.name ?? "tudo bem");
  const sent = await sendWhatsAppText(lead.phone, body);
  const message = assertDb(
    await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        lead_id: lead.id,
        tenant_id: source.tenant_id,
        direction: "outbound",
        sender_type: "automation",
        body,
        whatsapp_message_id: sent.id,
        status: "sent"
      })
      .select("*")
      .single()
  ) as { id: string };
  await supabase
    .from("leads")
    .update({ first_message_sent: true, first_message_at: new Date().toISOString() })
    .eq("id", lead.id)
    .eq("tenant_id", source.tenant_id);
  await supabase.from("send_logs").insert({ tenant_id: source.tenant_id, lead_id: lead.id, message_id: message.id, status: "sent" });
}

async function getSource(id: string, tenantId?: string) {
  let query = supabase.from("lead_sources").select("*").eq("id", id).neq("status", "deleted");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  return assertDb(await query.single()) as LeadSource;
}

async function logIntegration(
  sourceId: string,
  eventType: string,
  status: "success" | "error",
  requestPayload: unknown,
  responsePayload?: unknown,
  errorMessage?: string
) {
  await supabase.from("integration_logs").insert({
    tenant_id: (await getSource(sourceId)).tenant_id,
    source_id: sourceId,
    event_type: eventType,
    status,
    request_payload: requestPayload,
    response_payload: responsePayload,
    error_message: errorMessage
  });
}

async function countRows(tenantId: string, table: string, filters: Record<string, unknown> = {}, since?: string) {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  if (since) query = query.gte("created_at", since);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function lastIncomingLead(sourceId: string) {
  const result = await supabase
    .from("incoming_leads")
    .select("created_at")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as { created_at: string } | null;
}

async function recentLogs(sourceId: string) {
  return assertDb(
    await supabase
      .from("integration_logs")
      .select("*")
      .eq("source_id", sourceId)
      .order("created_at", { ascending: false })
      .limit(5)
  );
}

function pickString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function validatePhone(phone: string) {
  if (!/^\d{10,15}$/.test(phone)) throw new Error("Telefone inválido");
}

function safeEqual(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function toRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
}

function stringSetting(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
