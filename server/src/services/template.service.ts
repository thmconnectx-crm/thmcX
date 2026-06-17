import { z } from "zod";
import { assertDb, supabase } from "../db.js";

export const templateInputSchema = z.object({
  name: z.string().min(1),
  whatsapp_template_name: z.string().min(1),
  language_code: z.string().default("pt_BR"),
  category: z.string().optional().nullable(),
  body_preview: z.string().min(1),
  variables: z.array(z.string()).default([]),
  status: z.string().default("pending")
});

export const templatePatchSchema = templateInputSchema.partial();

export async function listTemplates(tenantId: string) {
  return assertDb(
    await supabase.from("whatsapp_templates").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false })
  );
}

export async function createTemplate(tenantId: string, input: z.infer<typeof templateInputSchema>) {
  return assertDb(
    await supabase
      .from("whatsapp_templates")
      .insert({ ...templateInputSchema.parse(input), tenant_id: tenantId })
      .select("*")
      .single()
  );
}

export async function updateTemplate(tenantId: string, id: string, input: z.infer<typeof templatePatchSchema>) {
  return assertDb(
    await supabase
      .from("whatsapp_templates")
      .update(templatePatchSchema.parse(input))
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

export async function deleteTemplate(tenantId: string, id: string) {
  assertDb(await supabase.from("whatsapp_templates").delete().eq("id", id).eq("tenant_id", tenantId));
}
