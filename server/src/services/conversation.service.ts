import { assertDb, supabase } from "../db.js";
import { detectsNegative, detectsOptOut } from "../utils/optOut.js";
import { generateAiReply } from "./ai.service.js";
import { sendWhatsAppText } from "./whatsapp.service.js";

export async function getOrCreateConversation(leadId: string, tenantId?: string) {
  const resolvedTenantId = tenantId ?? (await getLeadTenantId(leadId));
  const existing = await supabase
    .from("conversations")
    .select("*")
    .eq("tenant_id", resolvedTenantId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  return assertDb(
    await supabase.from("conversations").insert({ lead_id: leadId, tenant_id: resolvedTenantId }).select("*").single()
  );
}

export async function listConversations(tenantId: string) {
  return assertDb(
    await supabase
      .from("conversations")
      .select("*, leads(*)")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
  );
}

export async function getConversation(tenantId: string, id: string) {
  const conversation = assertDb(
    await supabase.from("conversations").select("*, leads(*)").eq("id", id).eq("tenant_id", tenantId).single()
  );
  const messages = assertDb(
    await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
  );
  return { ...conversation, messages };
}

export async function sendHumanMessage(tenantId: string, conversationId: string, body: string) {
  const conversation = assertDb(
    await supabase.from("conversations").select("*, leads(*)").eq("id", conversationId).eq("tenant_id", tenantId).single()
  ) as { id: string; lead_id: string; leads: { phone: string; opt_out: boolean } };

  if (conversation.leads.opt_out) throw new Error("Lead esta em opt-out");

  const sent = await sendWhatsAppText(conversation.leads.phone, body);
  return assertDb(
    await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        lead_id: conversation.lead_id,
        tenant_id: tenantId,
        direction: "outbound",
        sender_type: "human",
        body,
        whatsapp_message_id: sent.id,
        status: "sent"
      })
      .select("*")
      .single()
  );
}

export async function takeoverConversation(tenantId: string, conversationId: string, userId: string) {
  return assertDb(
    await supabase
      .from("conversations")
      .update({
        assigned_user_id: userId,
        ai_enabled: false,
        human_needed: true,
        status: "humano_necessario",
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

export async function setAiEnabled(tenantId: string, conversationId: string, enabled: boolean) {
  return assertDb(
    await supabase
      .from("conversations")
      .update({ ai_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

export async function markConversation(tenantId: string, conversationId: string, status: string) {
  const conversation = assertDb(
    await supabase.from("conversations").select("lead_id").eq("id", conversationId).eq("tenant_id", tenantId).single()
  ) as { lead_id: string };
  const humanNeeded = status === "interessado" || status === "humano_necessario";
  if (status === "opt_out") {
    await supabase.from("leads").update({ opt_out: true, status: "opt_out" }).eq("id", conversation.lead_id).eq("tenant_id", tenantId);
  }
  return assertDb(
    await supabase
      .from("conversations")
      .update({
        status,
        human_needed: humanNeeded,
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

export async function handleInboundMessage(leadPhone: string, body: string, whatsappMessageId?: string) {
  const leadResult = await supabase.from("leads").select("*").eq("phone", leadPhone).maybeSingle();
  if (leadResult.error) throw new Error(leadResult.error.message);
  if (!leadResult.data) return { action: "unknown_lead" };
  const lead = leadResult.data as { id: string; tenant_id: string; opt_out: boolean; source_type?: string | null };
  const conversation = await getOrCreateConversation(lead.id, lead.tenant_id);

  const optOut = detectsOptOut(body);
  const negative = detectsNegative(body);

  const inboundPayload = {
    conversation_id: conversation.id,
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    direction: "inbound",
    sender_type: "lead",
    body,
    whatsapp_message_id: whatsappMessageId,
    status: "received"
  };

  const inboundResult = whatsappMessageId
    ? await supabase
        .from("messages")
        .upsert(inboundPayload, {
          onConflict: "whatsapp_message_id",
          ignoreDuplicates: true
        })
        .select("id")
    : await supabase.from("messages").insert(inboundPayload).select("id");

  if (inboundResult.error) throw new Error(inboundResult.error.message);
  if (whatsappMessageId && (inboundResult.data?.length ?? 0) === 0) {
    return { action: "duplicate_inbound" };
  }

  if (optOut) {
    await supabase.from("leads").update({ opt_out: true, status: "opt_out" }).eq("id", lead.id).eq("tenant_id", lead.tenant_id);
    await supabase
      .from("conversations")
      .update({ status: "opt_out", ai_enabled: false, human_needed: false })
      .eq("id", conversation.id);
    return { action: "opt_out" };
  }

  if (negative) {
    await supabase.from("leads").update({ status: "sem_interesse" }).eq("id", lead.id).eq("tenant_id", lead.tenant_id);
  }

  const current = assertDb(
    await supabase.from("conversations").select("*").eq("id", conversation.id).eq("tenant_id", lead.tenant_id).single()
  ) as { ai_enabled: boolean; human_needed: boolean };

  if (!current.ai_enabled || current.human_needed || lead.opt_out) {
    await supabase
      .from("conversations")
      .update({ status: "respondeu", updated_at: new Date().toISOString() })
      .eq("id", conversation.id);
    return { action: "recorded" };
  }

  const history = assertDb(
    await supabase
      .from("messages")
      .select("sender_type, body")
      .eq("conversation_id", conversation.id)
      .eq("tenant_id", lead.tenant_id)
      .order("created_at", { ascending: true })
  ) as Array<{ sender_type: string; body: string }>;

  const externalTypes = ["meta_ads", "google_ads", "landing_page", "zapier", "make", "api", "webhook"];
  const ai = await generateAiReply(history, externalTypes.includes(lead.source_type ?? "") ? "external_lead" : "prospecting");

  if (ai.opt_out) {
    await supabase.from("leads").update({ opt_out: true, status: "opt_out" }).eq("id", lead.id).eq("tenant_id", lead.tenant_id);
  }

  await supabase
    .from("conversations")
    .update({
      status: ai.classification,
      human_needed: ai.human_needed,
      ai_enabled: !ai.human_needed && !ai.opt_out,
      updated_at: new Date().toISOString()
    })
    .eq("id", conversation.id);

  if (!ai.human_needed && !ai.opt_out && ai.reply) {
    const outbound = await sendWhatsAppText(leadPhone, ai.reply);
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      direction: "outbound",
      sender_type: "ai",
      body: ai.reply,
      whatsapp_message_id: outbound.id,
      status: "sent"
    });
  }

  return { action: ai.human_needed ? "human_needed" : "ai_replied" };
}

async function getLeadTenantId(leadId: string) {
  const lead = assertDb(await supabase.from("leads").select("tenant_id").eq("id", leadId).single()) as { tenant_id: string };
  return lead.tenant_id;
}
