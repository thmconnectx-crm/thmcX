import { assertDb, supabase } from "../db.js";

async function count(tenantId: string, table: string, filters: Record<string, string | boolean> = {}) {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { count: total, error } = await query;
  if (error) throw new Error(error.message);
  return total ?? 0;
}

export async function getDashboard(tenantId: string) {
  const [totalLeads, sent, errors, inbound, interested, optOuts, active, paused, waitingHuman] =
    await Promise.all([
      count(tenantId, "leads"),
      count(tenantId, "messages", { direction: "outbound", status: "sent" }),
      count(tenantId, "send_logs", { status: "error" }),
      count(tenantId, "messages", { direction: "inbound" }),
      count(tenantId, "conversations", { status: "interessado" }),
      count(tenantId, "leads", { opt_out: true }),
      count(tenantId, "campaigns", { status: "active" }),
      count(tenantId, "campaigns", { status: "paused" }),
      count(tenantId, "conversations", { human_needed: true })
    ]);

  const responseRate = sent > 0 ? Number(((inbound / sent) * 100).toFixed(2)) : 0;
  return {
    total_leads: totalLeads,
    messages_sent: sent,
    messages_error: errors,
    responses_received: inbound,
    response_rate: responseRate,
    interested,
    opt_outs: optOuts,
    active_campaigns: active,
    paused_campaigns: paused,
    conversations_waiting_human: waitingHuman
  };
}
