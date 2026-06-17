import { z } from "zod";
import { assertDb, supabase } from "../db.js";
import { sendQueue } from "../queues/sendQueue.js";
import { randomDelayMs } from "../utils/time.js";

const campaignBaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  message_body: z.string().min(1),
  template_id: z.string().uuid().optional().nullable(),
  template_name: z.string().optional().nullable(),
  language_code: z.string().default("pt_BR"),
  template_variables: z.array(z.string()).default([]),
  daily_limit: z.number().int().positive().default(50),
  interval_min_seconds: z.number().int().positive().default(60),
  interval_max_seconds: z.number().int().positive().default(180),
  allowed_start_time: z.string().default("09:00"),
  allowed_end_time: z.string().default("18:00"),
  filters: z
    .object({
      city: z.string().optional(),
      niche: z.string().optional(),
      tag: z.string().optional()
    })
    .optional()
});

export const campaignInputSchema = campaignBaseSchema.refine(
  (data) => data.interval_max_seconds >= data.interval_min_seconds,
  {
    message: "interval_max_seconds deve ser maior ou igual ao minimo"
  }
);

export const campaignPatchSchema = campaignBaseSchema.omit({ filters: true }).partial();

export async function createCampaign(tenantId: string, input: z.infer<typeof campaignInputSchema>) {
  const { filters, ...campaign } = campaignInputSchema.parse(input);
  const template = await resolveApprovedTemplate(tenantId, campaign.template_id, campaign.template_name);
  const payload = template
    ? {
        ...campaign,
        template_id: template.id,
        template_name: template.whatsapp_template_name,
        language_code: template.language_code
      }
    : campaign;
  const created = assertDb(await supabase.from("campaigns").insert({ ...payload, tenant_id: tenantId }).select("*").single()) as {
    id: string;
  };

  if (filters) await attachLeadsByFilters(tenantId, created.id, filters);
  return getCampaign(tenantId, created.id);
}

export async function listCampaigns(tenantId: string) {
  return assertDb(
    await supabase.from("campaigns").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false })
  );
}

export async function getCampaign(tenantId: string, id: string) {
  const campaign = assertDb(await supabase.from("campaigns").select("*").eq("id", id).eq("tenant_id", tenantId).single());
  const leads = assertDb(
    await supabase.from("campaign_leads").select("*, leads(*)").eq("campaign_id", id).eq("tenant_id", tenantId)
  );
  return { ...campaign, campaign_leads: leads };
}

export async function updateCampaign(tenantId: string, id: string, input: z.infer<typeof campaignPatchSchema>) {
  const payload = campaignPatchSchema.parse(input);
  const template =
    payload.template_id || payload.template_name
      ? await resolveApprovedTemplate(tenantId, payload.template_id, payload.template_name)
      : null;
  return assertDb(
    await supabase
      .from("campaigns")
      .update({
        ...payload,
        ...(template
          ? {
              template_id: template.id,
              template_name: template.whatsapp_template_name,
              language_code: template.language_code
            }
          : {}),
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

export async function attachLeadsByFilters(
  tenantId: string,
  campaignId: string,
  filters: { city?: string; niche?: string; tag?: string }
) {
  let query = supabase
    .from("leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("opt_out", false)
    .eq("opt_in_status", "authorized");
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.niche) query = query.eq("niche", filters.niche);
  if (filters.tag) query = query.contains("tags", [filters.tag]);

  const leads = assertDb(await query) as Array<{ id: string }>;
  if (!leads.length) return [];

  const rows = leads.map((lead) => ({ campaign_id: campaignId, lead_id: lead.id, tenant_id: tenantId }));
  return assertDb(
    await supabase.from("campaign_leads").upsert(rows, { onConflict: "tenant_id,campaign_id,lead_id" }).select("*")
  );
}

export async function startCampaign(tenantId: string, id: string) {
  const campaign = assertDb(await supabase.from("campaigns").select("*").eq("id", id).eq("tenant_id", tenantId).single()) as {
    id: string;
    template_id?: string | null;
    template_name?: string | null;
    interval_min_seconds: number;
    interval_max_seconds: number;
  };

  await assertCampaignTemplateApproved(tenantId, campaign.template_id, campaign.template_name);

  await supabase.from("campaigns").update({ status: "active" }).eq("id", id).eq("tenant_id", tenantId);
  const pending = assertDb(
    await supabase
      .from("campaign_leads")
      .select("id, lead_id")
      .eq("campaign_id", id)
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
  ) as Array<{ id: string; lead_id: string }>;

  let delay = 0;
  for (const item of pending) {
    await sendQueue.add(
      "send-initial-message",
      { tenantId, campaignId: campaign.id, campaignLeadId: item.id, leadId: item.lead_id },
      { delay, jobId: `${campaign.id}:${item.id}` }
    );
    delay += randomDelayMs(campaign.interval_min_seconds, campaign.interval_max_seconds);
  }

  return { queued: pending.length };
}

export async function setCampaignStatus(tenantId: string, id: string, status: "paused" | "stopped") {
  return assertDb(
    await supabase
      .from("campaigns")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

async function resolveApprovedTemplate(tenantId: string, templateId?: string | null, templateName?: string | null) {
  if (!templateId && !templateName) return null;
  let query = supabase.from("whatsapp_templates").select("*").eq("tenant_id", tenantId).eq("status", "approved");
  if (templateId) query = query.eq("id", templateId);
  if (!templateId && templateName) query = query.eq("whatsapp_template_name", templateName);
  const result = await query.single();
  if (result.error) throw new Error("Campanha precisa de template aprovado do WhatsApp");
  return result.data as { id: string; whatsapp_template_name: string; language_code: string };
}

async function assertCampaignTemplateApproved(tenantId: string, templateId?: string | null, templateName?: string | null) {
  const template = await resolveApprovedTemplate(tenantId, templateId, templateName);
  if (!template) throw new Error("Campanha precisa de template aprovado do WhatsApp");
}
