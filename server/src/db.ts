import { createClient } from "@supabase/supabase-js";
import { env } from "./config.js";

export const supabase = createClient(env.SUPABASE_URL || "http://localhost:54321", env.SUPABASE_SERVICE_ROLE_KEY || "missing", {
  auth: { persistSession: false }
});

export function assertDb<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
