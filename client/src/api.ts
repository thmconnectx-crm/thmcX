const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const isPreviewMode = () => new URLSearchParams(window.location.search).get("preview") === "1";

export type Session = {
  token: string;
  refresh_token?: string;
  user: { id: string; userId?: string; tenantId?: string; name: string; email: string; role?: "admin" | "agent" };
};

export async function request<T>(path: string, options: RequestInit = {}, retryOnUnauthorized = true): Promise<T> {
  const token = localStorage.getItem("token");
  if (token === "preview" && isPreviewMode()) return mockRequest(path, options) as T;
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retryOnUnauthorized && path !== "/auth/refresh") {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, false);
    clearSessionAndRedirect();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Erro na requisicao" }));
    throw new Error(payload.error ?? "Erro na requisicao");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return request<Session>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function register(email: string, password: string, tenantName: string, name?: string) {
  return request<Session>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, tenantName, name: name || undefined })
  });
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!response.ok) return false;
    const session = (await response.json()) as Session;
    localStorage.setItem("token", session.token);
    if (session.refresh_token) localStorage.setItem("refresh_token", session.refresh_token);
    return true;
  } catch {
    return false;
  }
}

function clearSessionAndRedirect() {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  window.location.href = "/";
}

function mockRequest(path: string, options: RequestInit) {
  if (path === "/dashboard") {
    return {
      total_leads: 0,
      messages_sent: 0,
      messages_error: 0,
      responses_received: 0,
      response_rate: 0,
      interested: 0,
      opt_outs: 0,
      active_campaigns: 0,
      paused_campaigns: 0,
      conversations_waiting_human: 0
    };
  }
  if (path === "/integrations/dashboard") {
    return {
      leads_received_today: 0,
      processing_rate: 0,
      duplicates: 0,
      errors: 0,
      active_sources: 0,
      total_incoming: 0
    };
  }
  if (path === "/integrations") return mockSources;
  if (path === "/templates") return mockTemplates;
  if (path === "/settings/status" || path === "/setup/status") {
    return {
      checks: mockSystemChecks,
      supabase_connected: true,
      redis_connected: true,
      openai_connected: true,
      whatsapp_cloud_connected: true,
      whatsapp_token_configured: true,
      phone_number_id_configured: true,
      whatsapp_business_account_id_configured: false,
      webhook_verified: false,
      template_approved: true,
      worker_running: true,
      inbound_worker_running: true,
      demo_mode: true
    };
  }
  if (path.startsWith("/settings/status/") && path.endsWith("/test")) {
    const key = path.split("/")[3];
    return mockSystemChecks.find((item) => item.key === key) ?? mockSystemChecks[0];
  }
  if (path.startsWith("/setup/test/")) {
    const body = typeof options.body === "string" ? (JSON.parse(options.body) as { key?: string }) : {};
    const key = body.key ?? setupGroupDefaultKey(path.split("/").pop() ?? "");
    return mockSystemChecks.find((item) => item.key === key) ?? mockSystemChecks[0];
  }
  if (path === "/leads") return { data: [], total: 0, page: 1, limit: 50 };
  if (path === "/campaigns") return [];
  if (path === "/conversations") return [];
  if (options.method === "POST" || options.method === "PATCH" || options.method === "DELETE") {
    return { success: true, message: "Acao simulada na previsualizacao local" };
  }
  return {};
}

const mockSources = [
  {
    id: "src_webhook",
    name: "Webhook de entrada",
    type: "webhook",
    status: "configured",
    api_key: "cx_live_preview_webhook",
    webhook_url: "http://localhost:4000/integrations/webhook/src_webhook",
    settings: {
      auto_ai_enabled: true,
      send_first_message: true,
      auto_tag: "diagnostico_trafego",
      initial_status: "novo_lead_ads"
    },
    leads_received: 0,
    error_count: 0,
    last_sync_at: null,
    recent_logs: []
  },
  {
    id: "src_landing",
    name: "Landing Page - Diagnostico Gratuito",
    type: "landing_page",
    status: "working",
    api_key: "cx_live_preview_landing",
    webhook_url: "http://localhost:4000/integrations/webhook/src_landing",
    settings: { auto_ai_enabled: true, send_first_message: true, auto_tag: "landing_diagnostico" },
    leads_received: 0,
    error_count: 0,
    last_sync_at: null,
    recent_logs: []
  },
  {
    id: "src_meta",
    name: "Meta Lead Ads",
    type: "meta_ads",
    status: "not_configured",
    api_key: "cx_live_preview_meta",
    webhook_url: "http://localhost:4000/integrations/webhook/src_meta",
    settings: { account_id: "", page_id: "", form_id: "" },
    leads_received: 0,
    error_count: 0,
    last_sync_at: null,
    recent_logs: []
  }
];

const mockTemplates = [
  {
    id: "tpl1",
    name: "Primeiro contato - diagnostico",
    whatsapp_template_name: "diagnostico_primeiro_contato",
    language_code: "pt_BR",
    category: "MARKETING",
    body_preview:
      "Ola, {{1}}. Tudo bem?\n\nRecebi seu cadastro sobre captacao de clientes pela internet. Hoje voce ja anuncia no Google, Instagram ou Facebook?",
    variables: ["[nome]"],
    status: "approved",
    created_at: new Date().toISOString()
  },
  {
    id: "tpl2",
    name: "Retorno de formulario",
    whatsapp_template_name: "retorno_formulario_connectx",
    language_code: "pt_BR",
    category: "UTILITY",
    body_preview: "Oi, {{1}}. Recebemos seu formulario e vamos te chamar por aqui.",
    variables: ["[nome]"],
    status: "pending",
    created_at: new Date().toISOString()
  }
];

const mockSystemChecks = [
  {
    key: "supabase_connected",
    label: "Supabase conectado",
    status: "connected",
    message: "Banco de dados respondendo em modo demonstracao.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "redis_connected",
    label: "Redis conectado",
    status: "connected",
    message: "Fila simulada respondendo.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "openai_connected",
    label: "OpenAI conectada",
    status: "connected",
    message: "Chave simulada para preview.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "whatsapp_cloud_connected",
    label: "WhatsApp Cloud API conectada",
    status: "pending",
    message: "No preview, nenhuma chamada real e feita para a Graph API.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "phone_number_id_configured",
    label: "Phone Number ID configurado",
    status: "connected",
    message: "Phone Number ID demonstrativo configurado.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "whatsapp_business_account_id_configured",
    label: "WhatsApp Business Account ID configurado",
    status: "pending",
    message: "Configure WHATSAPP_BUSINESS_ACCOUNT_ID para consultar ativos reais.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "webhook_verified",
    label: "Webhook WhatsApp verificado",
    status: "pending",
    message: "A verificacao real depende da Meta apontar para a API.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "worker_running",
    label: "Worker de disparos rodando",
    status: "connected",
    message: "Heartbeat simulado ativo.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "inbound_worker_running",
    label: "Worker de mensagens recebidas rodando",
    status: "connected",
    message: "Fila inbound simulada ativa.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "demo_mode",
    label: "Modo demo ativo/inativo",
    status: "connected",
    message: "Modo demonstracao ativo por preview=1.",
    last_checked_at: new Date().toISOString()
  },
  {
    key: "templates_available",
    label: "Templates WhatsApp disponiveis",
    status: "connected",
    message: "Template aprovado simulado disponivel.",
    last_checked_at: new Date().toISOString()
  }
] as const;

function setupGroupDefaultKey(group: string) {
  const keys: Record<string, string> = {
    supabase: "supabase_connected",
    redis: "redis_connected",
    openai: "openai_connected",
    whatsapp: "whatsapp_cloud_connected",
    worker: "worker_running"
  };
  return keys[group] ?? "supabase_connected";
}
