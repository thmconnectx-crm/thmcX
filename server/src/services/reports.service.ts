import { z } from "zod";
import { supabase } from "../db.js";

export const metaAdInsightSchema = z.object({
  source_id: z.string().uuid().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  level: z.enum(["campaign", "adset", "ad"]).default("campaign"),
  campaign_id: z.string().optional().nullable(),
  campaign_name: z.string().optional().nullable(),
  adset_id: z.string().optional().nullable(),
  adset_name: z.string().optional().nullable(),
  ad_id: z.string().optional().nullable(),
  ad_name: z.string().optional().nullable(),
  spend: z.coerce.number().min(0).default(0),
  impressions: z.coerce.number().int().min(0).default(0),
  reach: z.coerce.number().int().min(0).default(0),
  clicks: z.coerce.number().int().min(0).default(0),
  unique_clicks: z.coerce.number().int().min(0).default(0),
  leads: z.coerce.number().int().min(0).default(0),
  raw_payload: z.record(z.unknown()).default({})
});

export const metaAdInsightsInputSchema = z.object({
  insights: z.array(metaAdInsightSchema).min(1).max(500)
});

type LeadRow = {
  id: string;
  name: string;
  phone: string;
  company?: string | null;
  status: string;
  opt_out: boolean;
  campaign_name?: string | null;
  adset_name?: string | null;
  ad_name?: string | null;
  form_name?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  created_at: string;
};

type IncomingRow = {
  id: string;
  source_id?: string | null;
  status: string;
  campaign_name?: string | null;
  adset_name?: string | null;
  ad_name?: string | null;
  created_at: string;
};

type ConversationRow = {
  lead_id: string;
  status: string;
  human_needed: boolean;
};

type MessageRow = {
  lead_id: string;
};

type InsightRow = {
  level: "campaign" | "adset" | "ad";
  campaign_name?: string | null;
  adset_name?: string | null;
  ad_name?: string | null;
  spend: number | string;
  impressions: number;
  clicks: number;
};

type InsightMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
};

type ReportRow = {
  name: string;
  campaign_name?: string | null;
  adset_name?: string | null;
  leads: number;
  processed: number;
  duplicates: number;
  errors: number;
  responses: number;
  interested: number;
  opt_outs: number;
  human_needed: number;
  response_rate: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpl: number;
  cost_per_interested: number;
};

export async function getMetaAdsReport(tenantId: string) {
  const sourceIds = await getMetaSourceIds(tenantId);
  const [leads, incoming, insights] = await Promise.all([getMetaLeads(tenantId), getMetaIncoming(tenantId, sourceIds), getMetaInsights(tenantId)]);
  const leadIds = leads.map((lead) => lead.id);
  const [conversations, inboundMessages] = await Promise.all([getConversations(tenantId, leadIds), getInboundMessages(tenantId, leadIds)]);

  const conversationByLead = new Map(conversations.map((conversation) => [conversation.lead_id, conversation]));
  const respondedLeadIds = new Set(inboundMessages.map((message) => message.lead_id));
  const incomingByGroup = groupIncoming(incoming);
  const insightGroups = groupInsights(insights);

  const summary = buildSummary(leads, incoming, conversationByLead, respondedLeadIds, insightGroups.all);
  const campaigns = groupLeads(leads, conversationByLead, respondedLeadIds, incomingByGroup, insightGroups.campaign, (lead) =>
    lead.campaign_name ?? lead.utm_campaign ?? "Sem campanha"
  );
  const adsets = groupLeads(leads, conversationByLead, respondedLeadIds, incomingByGroup, insightGroups.adset, (lead) =>
    lead.adset_name ?? "Sem conjunto"
  );
  const ads = groupLeads(leads, conversationByLead, respondedLeadIds, incomingByGroup, insightGroups.ad, (lead) =>
    lead.ad_name ?? lead.utm_content ?? "Sem anuncio"
  );

  return {
    summary,
    campaigns,
    adsets,
    ads,
    recent_leads: leads.slice(0, 10).map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      company: lead.company,
      status: lead.status,
      campaign_name: lead.campaign_name ?? lead.utm_campaign,
      adset_name: lead.adset_name,
      ad_name: lead.ad_name ?? lead.utm_content,
      created_at: lead.created_at
    }))
  };
}

export async function saveMetaAdInsights(tenantId: string, input: z.infer<typeof metaAdInsightsInputSchema>) {
  const parsed = metaAdInsightsInputSchema.parse(input);
  const rows = parsed.insights.map((item) => ({
    ...item,
    tenant_id: tenantId,
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await supabase.from("meta_ad_insights").insert(rows).select("id");
  if (error) throw new Error(error.message);
  return { imported: data?.length ?? 0 };
}

async function getMetaSourceIds(tenantId: string) {
  const { data, error } = await supabase.from("lead_sources").select("id").eq("tenant_id", tenantId).eq("type", "meta_ads");
  if (error) throw new Error(error.message);
  return (data ?? []).map((source) => source.id as string);
}

async function getMetaLeads(tenantId: string): Promise<LeadRow[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("id,name,phone,company,status,opt_out,campaign_name,adset_name,ad_name,form_name,utm_source,utm_campaign,utm_content,created_at")
    .eq("tenant_id", tenantId)
    .or("source_type.eq.meta_ads,utm_source.ilike.%meta%,utm_source.ilike.%facebook%,utm_source.ilike.%instagram%,utm_source.ilike.%fb%,utm_source.ilike.%ig%")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadRow[];
}

async function getMetaIncoming(tenantId: string, sourceIds: string[]): Promise<IncomingRow[]> {
  if (!sourceIds.length) return [];
  const { data, error } = await supabase
    .from("incoming_leads")
    .select("id,source_id,status,campaign_name,adset_name,ad_name,created_at")
    .eq("tenant_id", tenantId)
    .in("source_id", sourceIds)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as IncomingRow[];
}

async function getMetaInsights(tenantId: string): Promise<InsightRow[]> {
  const { data, error } = await supabase
    .from("meta_ad_insights")
    .select("level,campaign_name,adset_name,ad_name,spend,impressions,clicks")
    .eq("tenant_id", tenantId)
    .order("date", { ascending: false })
    .limit(10000);
  if (error) {
    if (error.message.toLowerCase().includes("meta_ad_insights")) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as InsightRow[];
}

async function getConversations(tenantId: string, leadIds: string[]): Promise<ConversationRow[]> {
  if (!leadIds.length) return [];
  const { data, error } = await supabase
    .from("conversations")
    .select("lead_id,status,human_needed")
    .eq("tenant_id", tenantId)
    .in("lead_id", leadIds.slice(0, 1000));
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversationRow[];
}

async function getInboundMessages(tenantId: string, leadIds: string[]): Promise<MessageRow[]> {
  if (!leadIds.length) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("lead_id")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .in("lead_id", leadIds.slice(0, 1000));
  if (error) throw new Error(error.message);
  return (data ?? []) as MessageRow[];
}

function buildSummary(
  leads: LeadRow[],
  incoming: IncomingRow[],
  conversationByLead: Map<string, ConversationRow>,
  respondedLeadIds: Set<string>,
  insightTotals: InsightMetrics
) {
  const interested = leads.filter((lead) => isInterested(lead, conversationByLead.get(lead.id))).length;
  const humanNeeded = leads.filter((lead) => conversationByLead.get(lead.id)?.human_needed).length;
  const responses = leads.filter((lead) => respondedLeadIds.has(lead.id)).length;
  const processed = incoming.filter((item) => item.status === "processado").length;
  const duplicates = incoming.filter((item) => item.status === "duplicado").length;
  const errors = incoming.filter((item) => item.status === "erro").length;

  return {
    leads: leads.length,
    processed,
    duplicates,
    errors,
    responses,
    response_rate: rate(responses, leads.length),
    interested,
    opt_outs: leads.filter((lead) => lead.opt_out).length,
    human_needed: humanNeeded,
    ...calculatedMediaMetrics(insightTotals, leads.length, interested)
  };
}

function groupLeads(
  leads: LeadRow[],
  conversationByLead: Map<string, ConversationRow>,
  respondedLeadIds: Set<string>,
  incomingByGroup: Map<string, { processed: number; duplicates: number; errors: number }>,
  insightByGroup: Map<string, InsightMetrics>,
  getName: (lead: LeadRow) => string
) {
  const rows = new Map<string, ReportRow>();

  for (const lead of leads) {
    const name = getName(lead);
    const current = rows.get(name) ?? emptyRow(name, lead);
    current.leads += 1;
    current.responses += respondedLeadIds.has(lead.id) ? 1 : 0;
    current.interested += isInterested(lead, conversationByLead.get(lead.id)) ? 1 : 0;
    current.opt_outs += lead.opt_out ? 1 : 0;
    current.human_needed += conversationByLead.get(lead.id)?.human_needed ? 1 : 0;
    rows.set(name, current);
  }

  for (const row of rows.values()) {
    const incoming = incomingByGroup.get(row.name);
    const insight = insightByGroup.get(row.name) ?? emptyInsightMetrics();
    row.processed = incoming?.processed ?? 0;
    row.duplicates = incoming?.duplicates ?? 0;
    row.errors = incoming?.errors ?? 0;
    row.response_rate = rate(row.responses, row.leads);
    Object.assign(row, calculatedMediaMetrics(insight, row.leads, row.interested));
  }

  return Array.from(rows.values()).sort((a, b) => b.leads - a.leads);
}

function groupIncoming(incoming: IncomingRow[]) {
  const groups = new Map<string, { processed: number; duplicates: number; errors: number }>();
  for (const item of incoming) {
    for (const key of [item.campaign_name, item.adset_name, item.ad_name].filter(Boolean) as string[]) {
      const current = groups.get(key) ?? { processed: 0, duplicates: 0, errors: 0 };
      current.processed += item.status === "processado" ? 1 : 0;
      current.duplicates += item.status === "duplicado" ? 1 : 0;
      current.errors += item.status === "erro" ? 1 : 0;
      groups.set(key, current);
    }
  }
  return groups;
}

function groupInsights(insights: InsightRow[]) {
  const all = emptyInsightMetrics();
  const campaign = new Map<string, InsightMetrics>();
  const adset = new Map<string, InsightMetrics>();
  const ad = new Map<string, InsightMetrics>();

  for (const insight of insights) {
    addInsight(all, insight);
    const map = insight.level === "ad" ? ad : insight.level === "adset" ? adset : campaign;
    const key = insight.level === "ad" ? insight.ad_name : insight.level === "adset" ? insight.adset_name : insight.campaign_name;
    if (!key) continue;
    const current = map.get(key) ?? emptyInsightMetrics();
    addInsight(current, insight);
    map.set(key, current);
  }

  return { all, campaign, adset, ad };
}

function addInsight(metrics: InsightMetrics, insight: InsightRow) {
  metrics.spend += Number(insight.spend ?? 0);
  metrics.impressions += Number(insight.impressions ?? 0);
  metrics.clicks += Number(insight.clicks ?? 0);
}

function emptyInsightMetrics(): InsightMetrics {
  return { spend: 0, impressions: 0, clicks: 0 };
}

function calculatedMediaMetrics(metrics: InsightMetrics, leads: number, interested: number) {
  return {
    spend: roundMoney(metrics.spend),
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    ctr: rate(metrics.clicks, metrics.impressions),
    cpc: ratioMoney(metrics.spend, metrics.clicks),
    cpm: metrics.impressions > 0 ? roundMoney((metrics.spend / metrics.impressions) * 1000) : 0,
    cpl: ratioMoney(metrics.spend, leads),
    cost_per_interested: ratioMoney(metrics.spend, interested)
  };
}

function emptyRow(name: string, lead: LeadRow): ReportRow {
  return {
    name,
    campaign_name: lead.campaign_name ?? lead.utm_campaign,
    adset_name: lead.adset_name,
    leads: 0,
    processed: 0,
    duplicates: 0,
    errors: 0,
    responses: 0,
    interested: 0,
    opt_outs: 0,
    human_needed: 0,
    response_rate: 0,
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    cpl: 0,
    cost_per_interested: 0
  };
}

function isInterested(lead: LeadRow, conversation?: ConversationRow) {
  return lead.status === "interessado" || conversation?.status === "interessado" || Boolean(conversation?.human_needed);
}

function rate(part: number, total: number) {
  return total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function ratioMoney(total: number, count: number) {
  return count > 0 ? roundMoney(total / count) : 0;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}
