import { env } from "../config.js";
import { assertDb, supabase } from "../db.js";
import type { MarketingReportAnalysis } from "./ai.service.js";
import { getMetaAdsAiAnalysis } from "./reports.service.js";

type TenantRow = { id: string; name?: string | null };

let monitorTimer: NodeJS.Timeout | null = null;
let running = false;

export async function runReportMonitorForTenant(tenantId: string) {
  try {
    const analysis = await getMetaAdsAiAnalysis(tenantId);
    await supabase.from("report_monitor_runs").insert({
      tenant_id: tenantId,
      status: "completed",
      analysis
    });
    await createReportNotification(tenantId, analysis);
    return analysis;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido no monitor de relatórios.";
    await supabase.from("report_monitor_runs").insert({
      tenant_id: tenantId,
      status: "error",
      error_message: message,
      analysis: {}
    });
    await supabase.from("report_notifications").insert({
      tenant_id: tenantId,
      source: "meta_ads_monitor",
      severity: "alta",
      title: "Falha ao analisar campanhas",
      body: message,
      payload: { error: message }
    });
    throw error;
  }
}

export async function runReportMonitorForAllTenants() {
  if (running) return;
  running = true;
  try {
    const tenants = await listTenants();
    for (const tenant of tenants) {
      try {
        await runReportMonitorForTenant(tenant.id);
      } catch (error) {
        console.error(`Report monitor failed for tenant ${tenant.id}:`, error instanceof Error ? error.message : error);
      }
    }
  } finally {
    running = false;
  }
}

export function startReportMonitor() {
  if (env.REPORT_MONITOR_ENABLED !== "true") {
    console.log("Report monitor disabled.");
    return () => undefined;
  }

  const intervalMs = env.REPORT_MONITOR_INTERVAL_MINUTES * 60 * 1000;
  console.log(`Report monitor enabled. Interval: ${env.REPORT_MONITOR_INTERVAL_MINUTES} minute(s).`);

  void runReportMonitorForAllTenants().catch((error) => console.error("Initial report monitor failed:", error.message));
  monitorTimer = setInterval(() => {
    void runReportMonitorForAllTenants().catch((error) => console.error("Report monitor failed:", error.message));
  }, intervalMs);

  return stopReportMonitor;
}

export function stopReportMonitor() {
  if (!monitorTimer) return;
  clearInterval(monitorTimer);
  monitorTimer = null;
}

export async function listReportNotifications(tenantId: string) {
  return (
    assertDb(
      await supabase
        .from("report_notifications")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(30)
    ) ?? []
  );
}

export async function getReportMonitorStatus(tenantId: string) {
  const [notifications, lastRunResult] = await Promise.all([
    supabase
      .from("report_notifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("read_at", null),
    supabase
      .from("report_monitor_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (notifications.error) throw new Error(notifications.error.message);
  if (lastRunResult.error) throw new Error(lastRunResult.error.message);

  return {
    enabled: env.REPORT_MONITOR_ENABLED === "true",
    interval_minutes: env.REPORT_MONITOR_INTERVAL_MINUTES,
    unread_notifications: notifications.count ?? 0,
    last_run: lastRunResult.data ?? null
  };
}

export async function markReportNotificationRead(tenantId: string, notificationId: string) {
  return assertDb(
    await supabase
      .from("report_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", notificationId)
      .select("*")
      .single()
  );
}

async function listTenants() {
  const { data, error } = await supabase.from("tenants").select("id,name").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TenantRow[];
}

async function createReportNotification(tenantId: string, analysis: MarketingReportAnalysis) {
  const topAlert = analysis.alerts[0];
  const topAction = analysis.next_actions[0];
  const severity = topAlert?.severity ?? severityFromStatus(analysis.status);
  const title =
    analysis.status === "sem_dados"
      ? "Campanhas sem dados suficientes"
      : topAlert?.title ?? `Resumo das campanhas: ${analysis.health_score}/100`;
  const body = topAlert?.description ?? topAction ?? analysis.executive_summary;

  await supabase.from("report_notifications").insert({
    tenant_id: tenantId,
    source: "meta_ads_monitor",
    severity,
    title,
    body,
    payload: analysis
  });
}

function severityFromStatus(status: MarketingReportAnalysis["status"]) {
  if (status === "critico") return "alta";
  if (status === "atencao") return "media";
  if (status === "bom") return "baixa";
  return "info";
}
