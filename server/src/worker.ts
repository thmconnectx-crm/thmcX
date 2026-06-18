import { Worker } from "bullmq";
import { startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { assertDb, supabase } from "./db.js";
import { redisConnection } from "./queues/connection.js";
import type { SendJob } from "./queues/sendQueue.js";
import { getOrCreateConversation } from "./services/conversation.service.js";
import { sendWhatsAppTemplate } from "./services/whatsapp.service.js";
import { isWithinWindow } from "./utils/time.js";

const MAX_CONSECUTIVE_ERRORS = 5;
const MAX_NEGATIVE_RESPONSES = 10;

async function writeWorkerHeartbeat() {
  await supabase.from("settings").upsert(
    {
      key: "worker_heartbeat",
      value: { updated_at: new Date().toISOString(), queue: "campaign-send" }
    },
    { onConflict: "key" }
  );
}

void writeWorkerHeartbeat().catch((error) => console.error("Worker heartbeat failed:", error.message));
setInterval(() => {
  void writeWorkerHeartbeat().catch((error) => console.error("Worker heartbeat failed:", error.message));
}, 30000);

async function pauseCampaign(tenantId: string, campaignId: string, reason: string) {
  await supabase
    .from("campaigns")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("tenant_id", tenantId);
  await supabase.from("send_logs").insert({ tenant_id: tenantId, campaign_id: campaignId, status: "paused", error: reason });
}

async function countSentToday(tenantId: string, campaignId: string, timezone: string = "America/Sao_Paulo") {
  const zonedStart = startOfDay(toZonedTime(new Date(), timezone));
  const startUtc = fromZonedTime(zonedStart, timezone).toISOString();
  const { count, error } = await supabase
    .from("send_logs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("campaign_id", campaignId)
    .eq("status", "sent")
    .gte("created_at", startUtc);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export const worker = new Worker<SendJob, unknown, string>(
  "campaign-send",
  async (job) => {
    const { campaignId, campaignLeadId, leadId } = job.data;
    const campaign = assertDb(
      await supabase.from("campaigns").select("*").eq("id", campaignId).single()
    ) as {
      id: string;
      tenant_id: string;
      status: string;
      message_body: string;
      template_id?: string | null;
      template_name?: string | null;
      language_code: string;
      template_variables?: string[];
      daily_limit: number;
      allowed_start_time: string;
      allowed_end_time: string;
      timezone?: string | null;
      consecutive_errors: number;
      negative_responses: number;
    };
    const tenantId = job.data.tenantId ?? campaign.tenant_id;

    if (campaign.status !== "active") return { skipped: "campaign_not_active" };
    const template = await loadApprovedTemplate(tenantId, campaign.template_id, campaign.template_name);
    if (!template) {
      await pauseCampaign(tenantId, campaignId, "Campanha sem template aprovado do WhatsApp");
      return { skipped: "missing_approved_template" };
    }
    if (campaign.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
      await pauseCampaign(tenantId, campaignId, "Muitos erros consecutivos");
      return { skipped: "too_many_errors" };
    }
    if (campaign.negative_responses >= MAX_NEGATIVE_RESPONSES) {
      await pauseCampaign(tenantId, campaignId, "Muitas respostas negativas");
      return { skipped: "too_many_negative_responses" };
    }
    if (!isWithinWindow(new Date(), campaign.allowed_start_time, campaign.allowed_end_time, campaign.timezone ?? undefined)) {
      await supabase.from("send_logs").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        lead_id: leadId,
        status: "skipped",
        error: "Fora do horário permitido"
      });
      throw new Error("Fora do horário permitido");
    }
    if ((await countSentToday(tenantId, campaignId, campaign.timezone ?? undefined)) >= campaign.daily_limit) {
      await supabase.from("send_logs").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        lead_id: leadId,
        status: "skipped",
        error: "Limite diário atingido"
      });
      return { skipped: "daily_limit" };
    }

    const lead = assertDb(await supabase.from("leads").select("*").eq("id", leadId).eq("tenant_id", tenantId).single()) as {
      id: string;
      name?: string;
      phone: string;
      opt_out: boolean;
      opt_in_status: "unknown" | "authorized" | "denied";
    };
    const campaignLead = assertDb(
      await supabase.from("campaign_leads").select("*").eq("id", campaignLeadId).eq("tenant_id", tenantId).single()
    ) as { attempts: number; status: string };

    if (lead.opt_out) {
      await supabase.from("campaign_leads").update({ status: "blocked_opt_out" }).eq("id", campaignLeadId).eq("tenant_id", tenantId);
      await supabase.from("send_logs").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        lead_id: leadId,
        status: "blocked_opt_out"
      });
      return { skipped: "opt_out" };
    }
    if (lead.opt_in_status !== "authorized") {
      await supabase.from("campaign_leads").update({ status: "blocked_no_opt_in" }).eq("id", campaignLeadId).eq("tenant_id", tenantId);
      await supabase.from("send_logs").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        lead_id: leadId,
        status: "blocked_no_opt_in",
        error: "Lead sem autorização opt-in"
      });
      return { skipped: "no_opt_in" };
    }
    if (campaignLead.attempts > 1 || campaignLead.status === "sent") {
      return { skipped: "attempt_limit_or_already_sent" };
    }

    try {
      const conversation = await getOrCreateConversation(lead.id, tenantId);
      const variables = renderTemplateVariables(campaign.template_variables ?? [], lead);
      const preview = renderPreview(template.body_preview, variables, lead);
      const sent = await sendWhatsAppTemplate(
        lead.phone,
        template.whatsapp_template_name,
        template.language_code,
        variables
      );
      const message = assertDb(
        await supabase
          .from("messages")
          .insert({
            tenant_id: tenantId,
            conversation_id: conversation.id,
            lead_id: lead.id,
            direction: "outbound",
            sender_type: "campaign",
            body: preview,
            whatsapp_message_id: sent.id,
            status: "sent"
          })
          .select("*")
          .single()
      ) as { id: string };

      await supabase
        .from("campaign_leads")
        .update({
          status: "sent",
          attempts: campaignLead.attempts + 1,
          sent_at: new Date().toISOString(),
          error_message: null
        })
        .eq("id", campaignLeadId)
        .eq("tenant_id", tenantId);
      await supabase
        .from("leads")
        .update({ last_contact_at: new Date().toISOString(), status: "contatado" })
        .eq("id", lead.id)
        .eq("tenant_id", tenantId);
      await supabase.from("campaigns").update({ consecutive_errors: 0 }).eq("id", campaignId).eq("tenant_id", tenantId);
      await supabase.from("send_logs").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        lead_id: lead.id,
        message_id: message.id,
        status: "sent"
      });

      return { sent: message.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      await supabase
        .from("campaign_leads")
        .update({
          status: campaignLead.attempts >= 1 ? "failed" : "pending",
          attempts: campaignLead.attempts + 1,
          error_message: message
        })
        .eq("id", campaignLeadId)
        .eq("tenant_id", tenantId);
      await supabase
        .from("campaigns")
        .update({ consecutive_errors: campaign.consecutive_errors + 1 })
        .eq("id", campaignId)
        .eq("tenant_id", tenantId);
      await supabase.from("send_logs").insert({
        tenant_id: tenantId,
        campaign_id: campaignId,
        lead_id: leadId,
        status: "error",
        error: message
      });
      throw error;
    }
  },
  { connection: redisConnection, concurrency: 1 }
);

worker.on("failed", (_job, error) => {
  console.error("Send job failed:", error.message);
});

async function loadApprovedTemplate(tenantId: string, templateId?: string | null, templateName?: string | null) {
  if (!templateId && !templateName) return null;
  let query = supabase.from("whatsapp_templates").select("*").eq("tenant_id", tenantId).eq("status", "approved");
  if (templateId) query = query.eq("id", templateId);
  if (!templateId && templateName) query = query.eq("whatsapp_template_name", templateName);
  const result = await query.maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as
    | { id: string; whatsapp_template_name: string; language_code: string; body_preview: string }
    | null;
}

function renderTemplateVariables(variables: string[], lead: { name?: string; phone: string }) {
  return variables.map((variable) =>
    variable
      .replaceAll("[nome]", lead.name ?? "")
      .replaceAll("[telefone]", lead.phone)
      .replaceAll("{{name}}", lead.name ?? "")
      .replaceAll("{{phone}}", lead.phone)
  );
}

function renderPreview(preview: string, variables: string[], lead: { name?: string; phone: string }) {
  let rendered = preview.replaceAll("[nome]", lead.name ?? "").replaceAll("[telefone]", lead.phone);
  variables.forEach((value, index) => {
    rendered = rendered.replaceAll(`{{${index + 1}}}`, value);
  });
  return rendered;
}
