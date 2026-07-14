import { supabase } from "../db.js";

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
};

export async function getMetaAdsReport(tenantId: string) {
  const sourceIds = await getMetaSourceIds(tenantId);
  const [leads, incoming] = await Promise.all([getMetaLeads(tenantId), getMetaIncoming(tenantId, sourceIds)]);
  const leadIds = leads.map((lead) => lead.id);
  const [conversations, inboundMessages] = await Promise.all([getConversations(tenantId, leadIds), getInboundMessages(tenantId, leadIds)]);

  const conversationByLead = new Map(conversations.map((conversation) => [conversation.lead_id, conversation]));
  const respondedLeadIds = new Set(inboundMessages.map((message) => message.lead_id));
  const incomingByGroup = groupIncoming(incoming);

  const summary = buildSummary(leads, incoming, conversationByLead, respondedLeadIds);
  const campaigns = groupLeads(leads, conversationByLead, respondedLeadIds, incomingByGroup, (lead) =>
    lead.campaign_name ?? lead.utm_campaign ?? "Sem campanha"
  );
  const adsets = groupLeads(leads, conversationByLead, respondedLeadIds, incomingByGroup, (lead) =>
    lead.adset_name ?? "Sem conjunto"
  );
  const ads = groupLeads(leads, conversationByLead, respondedLeadIds, incomingByGroup, (lead) =>
    lead.ad_name ?? lead.utm_content ?? "Sem anúncio"
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
  respondedLeadIds: Set<string>
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
    human_needed: humanNeeded
  };
}

function groupLeads(
  leads: LeadRow[],
  conversationByLead: Map<string, ConversationRow>,
  respondedLeadIds: Set<string>,
  incomingByGroup: Map<string, { processed: number; duplicates: number; errors: number }>,
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
    row.processed = incoming?.processed ?? 0;
    row.duplicates = incoming?.duplicates ?? 0;
    row.errors = incoming?.errors ?? 0;
    row.response_rate = rate(row.responses, row.leads);
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
    response_rate: 0
  };
}

function isInterested(lead: LeadRow, conversation?: ConversationRow) {
  return lead.status === "interessado" || conversation?.status === "interessado" || Boolean(conversation?.human_needed);
}

function rate(part: number, total: number) {
  return total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;
}
