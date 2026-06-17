import { parse } from "csv-parse/sync";
import { z } from "zod";
import { assertDb, supabase } from "../db.js";

export const leadInputSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().email().optional().nullable(),
  company: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  niche: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  source_id: z.string().uuid().optional().nullable(),
  source_type: z.string().optional().nullable(),
  campaign_name: z.string().optional().nullable(),
  ad_name: z.string().optional().nullable(),
  adset_name: z.string().optional().nullable(),
  form_name: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  utm_content: z.string().optional().nullable(),
  utm_term: z.string().optional().nullable(),
  status: z.string().default("novo"),
  tags: z.array(z.string()).default([]),
  observations: z.string().optional().nullable(),
  opt_in_status: z.enum(["unknown", "authorized", "denied"]).default("unknown"),
  opt_out: z.boolean().default(false),
  first_message_sent: z.boolean().optional(),
  first_message_at: z.string().optional().nullable(),
  last_source_sync_at: z.string().optional().nullable()
});

export const leadPatchSchema = leadInputSchema.partial();
type LeadFilters = Record<string, unknown> & { page?: number; limit?: number };

export async function createLead(tenantId: string, input: z.infer<typeof leadInputSchema>) {
  const payload = leadInputSchema.parse(input);
  return assertDb(await supabase.from("leads").insert({ ...payload, tenant_id: tenantId }).select("*").single());
}

export async function listLeads(filters: LeadFilters) {
  const page = Number.isFinite(filters.page) && Number(filters.page) > 0 ? Number(filters.page) : 1;
  const limitInput = Number.isFinite(filters.limit) && Number(filters.limit) > 0 ? Number(filters.limit) : 50;
  const limit = Math.min(limitInput, 200);
  const offset = (page - 1) * limit;

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("tenant_id", String(filters.tenantId))
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (typeof filters.city === "string") query = query.eq("city", filters.city);
  if (typeof filters.niche === "string") query = query.eq("niche", filters.niche);
  if (typeof filters.tag === "string") query = query.contains("tags", [filters.tag]);
  if (typeof filters.status === "string") query = query.eq("status", filters.status);
  const result = await query;
  return {
    data: assertDb(result),
    total: result.count ?? 0,
    page,
    limit
  };
}

export async function updateLead(tenantId: string, id: string, input: z.infer<typeof leadPatchSchema>) {
  const payload = leadPatchSchema.parse(input);
  return assertDb(
    await supabase
      .from("leads")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

export async function deleteLead(tenantId: string, id: string) {
  assertDb(await supabase.from("leads").delete().eq("id", id).eq("tenant_id", tenantId));
}

export async function importLeadsCsv(tenantId: string, buffer: Buffer) {
  const rows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Array<
    Record<string, string>
  >;

  const leads = rows.map((row) =>
    leadInputSchema.parse({
      name: row.nome ?? row.name,
      phone: row.telefone ?? row.phone,
      email: row.email || null,
      company: row.empresa ?? row.company,
      city: row.cidade ?? row.city,
      niche: row.nicho ?? row.niche,
      source: row.origem ?? row.source,
      source_type: "csv",
      campaign_name: row.campanha ?? row.campaign_name ?? null,
      utm_source: row.utm_source ?? null,
      utm_medium: row.utm_medium ?? null,
      utm_campaign: row.utm_campaign ?? null,
      utm_content: row.utm_content ?? null,
      utm_term: row.utm_term ?? null,
      status: row.status || "novo",
      tags: (row.tags ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      observations: row.observacoes ?? row.observations ?? null,
      opt_in_status:
        row.opt_in_status === "authorized" || row.opt_in_status === "denied" ? row.opt_in_status : "unknown",
      opt_out: false
    })
  );

  if (leads.length === 0) return [];
  return (
    assertDb(
      await supabase
        .from("leads")
        .upsert(
          leads.map((lead) => ({ ...lead, tenant_id: tenantId })),
          { onConflict: "tenant_id,phone" }
        )
        .select("*")
    ) ?? []
  );
}
