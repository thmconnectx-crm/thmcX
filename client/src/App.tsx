import {
  Activity,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FormInput,
  Hand,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  MessageSquare,
  Pause,
  Play,
  PlugZap,
  RefreshCw,
  Send,
  Settings,
  ShieldOff,
  Upload,
  UserCheck,
  Users,
  Webhook,
  XCircle
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { login, register, request } from "./api";
import { Logo } from "./components/Logo";
import type {
  Campaign,
  ConnectionsDashboard,
  Conversation,
  Dashboard,
  Lead,
  LeadListResponse,
  LeadSource,
  MetaAdsReport,
  MetaAdsReportRow,
  Message,
  SetupStatus,
  SystemCheck,
  WhatsAppTemplate
} from "./types";

type Tab =
  | "dashboard"
  | "leads"
  | "campaigns"
  | "conversations"
  | "sends"
  | "connections"
  | "templates"
  | "automations"
  | "reports"
  | "settings";

const menu: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: Users },
  { id: "campaigns", label: "Campanhas", icon: Megaphone },
  { id: "conversations", label: "Conversas", icon: MessageSquare },
  { id: "sends", label: "Disparos", icon: Send },
  { id: "connections", label: "Conexões", icon: PlugZap },
  { id: "templates", label: "Templates WhatsApp", icon: ClipboardList },
  { id: "automations", label: "Automações", icon: Bot },
  { id: "reports", label: "Relatórios", icon: Activity },
  { id: "settings", label: "Status do Sistema", icon: Settings }
];

const primaryMenu = menu.filter((item) => item.id !== "settings");
const footerMenu = menu.filter((item) => item.id === "settings");

const tabDescriptions: Record<Tab, string> = {
  dashboard: "Acompanhe a operação e veja o próximo passo recomendado.",
  leads: "Gerencie contatos, origens e informações comerciais em um só lugar.",
  campaigns: "Crie campanhas controladas com templates oficiais e opt-in autorizado.",
  conversations: "Acompanhe atendimentos, IA e passagem para humano.",
  sends: "Monitore a fila de disparos e os registros de envio.",
  connections: "Gerencie as fontes de entrada de leads e integrações do seu atendimento.",
  templates: "Cadastre templates aprovados para campanhas via WhatsApp Cloud API.",
  automations: "Configure fluxos de triagem, tags e handoff por origem.",
  reports: "Analise desempenho por origem, campanha e atendimento.",
  settings: "Valide conexões, credenciais e saúde operacional do sistema."
};

const connectionSections = [
  "Webhooks",
  "Formulários",
  "Meta Ads",
  "Google Ads",
  "Google Sheets",
  "Landing Pages",
  "Integrações via Zapier/Make",
  "API externa",
  "Campos personalizados",
  "Regras de distribuição"
];

const connectionCards = [
  { title: "Webhook de entrada", type: "webhook", icon: Webhook },
  { title: "Formulário próprio", type: "landing_page", icon: FormInput },
  { title: "Meta Lead Ads", type: "meta_ads", icon: Megaphone },
  { title: "Google Ads / Conversões", type: "google_ads", icon: Activity },
  { title: "Google Sheets", type: "google_sheets", icon: FileSpreadsheet },
  { title: "Landing Pages", type: "landing_page", icon: Link2 },
  { title: "Zapier / Make", type: "zapier", icon: PlugZap },
  { title: "API pública", type: "api", icon: ClipboardList }
];

export function App() {
  const [token, setToken] = useState(() => {
    if (localStorage.getItem("token") === "preview") localStorage.removeItem("token");
    return localStorage.getItem("token");
  });
  const [tab, setTab] = useState<Tab>(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    return requestedTab && menu.some((item) => item.id === requestedTab) ? requestedTab : "connections";
  });

  if (!token) return <Login onLogin={setToken} />;

  return (
    <div className="min-h-screen bg-wash text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-white lg:flex lg:flex-col">
        <div className="border-b border-line px-6 py-7">
          <Logo variant="sidebar" />
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {primaryMenu.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition ${
                  item.id === tab ? "bg-ink font-medium text-white" : "text-muted hover:bg-wash hover:text-ink"
                }`}
                onClick={() => setTab(item.id)}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-line p-4">
          {footerMenu.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition ${
                  item.id === tab ? "bg-ink font-medium text-white" : "text-muted hover:bg-wash hover:text-ink"
                }`}
                onClick={() => setTab(item.id)}
              >
                <Icon size={17} />
                Configurações
              </button>
            );
          })}
          <button
            className="mt-2 flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-muted transition hover:bg-wash hover:text-ink"
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("refresh_token");
              setToken(null);
            }}
          >
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-b border-black bg-ink text-white">
          <div className="flex items-center justify-between gap-4 px-5 py-6 lg:px-10">
            <div>
              <div className="mb-4 inline-flex rounded-lg bg-white p-2 lg:hidden">
                <Logo variant="horizontal" />
              </div>
              <h2 className="text-[28px] font-bold leading-tight tracking-tight text-white">{menu.find((item) => item.id === tab)?.label}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{tabDescriptions[tab]}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 xl:inline">Ambiente operacional</span>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
            {menu.map((item) => (
              <button key={item.id} className={item.id === tab ? "btn-primary" : "btn-secondary"} onClick={() => setTab(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="px-5 py-8 lg:px-10">
          {tab === "dashboard" && <DashboardView />}
          {tab === "leads" && <LeadsView />}
          {tab === "campaigns" && <CampaignsView />}
          {tab === "conversations" && <ConversationsView />}
          {tab === "sends" && <SendsView />}
          {tab === "connections" && <ConnectionsView />}
          {tab === "templates" && <TemplatesView />}
          {tab === "automations" && <AutomationsView />}
          {tab === "reports" && <ReportsView />}
          {tab === "settings" && <SettingsView />}
          {!["dashboard", "leads", "campaigns", "conversations", "sends", "connections", "templates", "automations", "reports", "settings"].includes(tab) && (
            <PlaceholderView title={menu.find((item) => item.id === tab)?.label ?? "Módulo"} />
          )}
        </main>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session =
        mode === "register"
          ? await register(email, password, tenantName, name)
          : await login(email, password);
      localStorage.setItem("token", session.token);
      if (session.refresh_token) localStorage.setItem("refresh_token", session.refresh_token);
      onLogin(session.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-wash px-4">
      <form className="panel w-full max-w-md p-7" onSubmit={submit}>
        <Logo variant="login" />
        <p className="mt-2 text-sm leading-6 text-muted">CRM de captação, WhatsApp e atendimento</p>
        <div className="mt-6 grid grid-cols-2 rounded-lg border border-line bg-wash p-1">
          <button
            type="button"
            className={`h-10 rounded-md text-sm font-medium transition ${mode === "login" ? "bg-white text-ink" : "text-muted"}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`h-10 rounded-md text-sm font-medium transition ${mode === "register" ? "bg-white text-ink" : "text-muted"}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            Criar conta
          </button>
        </div>
        <div className="mt-5 space-y-4">
          {mode === "register" && (
            <>
              <Field label="Nome da empresa">
                <input className="input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
              </Field>
              <Field label="Seu nome">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Senha">
          <input
            className="input"
            minLength={mode === "register" ? 8 : undefined}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-ink">{error}</p>}
        <button className="btn-primary mt-5 w-full" disabled={loading}>
          {loading ? "Aguarde" : mode === "register" ? "Criar conta" : "Entrar"}
        </button>
        {mode === "register" && (
          <p className="mt-4 text-xs leading-5 text-muted">
            A conta criada será o administrador do tenant. Os dados de leads, campanhas e conversas ficarão isolados por empresa.
          </p>
        )}
      </form>
    </main>
  );
}

function DashboardView() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);

  useEffect(() => {
    void request<Dashboard>("/dashboard").then(setData);
    void request<SetupStatus>("/setup/status").then(setSetup);
  }, []);

  const nextStep = getNextRecommendedStep(setup);
  const hasActivity = Boolean(
    data &&
      (data.total_leads > 0 ||
        data.messages_sent > 0 ||
        data.responses_received > 0 ||
        data.active_campaigns > 0 ||
        data.conversations_waiting_human > 0)
  );
  const cards = data
    ? [
        ["Leads", data.total_leads],
        ["Enviadas", data.messages_sent],
        ["Erros", data.messages_error],
        ["Respostas", data.responses_received],
        ["Taxa resposta", `${data.response_rate}%`],
        ["Interessados", data.interested],
        ["Opt-outs", data.opt_outs],
        ["Aguardando humano", data.conversations_waiting_human]
      ]
    : [];

  return (
    <section className="space-y-4">
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Próximo passo recomendado</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">{nextStep.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{nextStep.description}</p>
          </div>
        </div>
      </div>

      {!hasActivity ? (
        <EmptyState
          title="Nenhum lead recebido ainda."
          text="Assim que uma landing page, webhook, CSV ou API enviar leads reais, os indicadores aparecem aqui."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="panel p-6">
              <p className="metric-label">{label}</p>
              <strong className="metric-value">{value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "", city: "", niche: "", tags: "" });

  const load = () =>
    void request<LeadListResponse>("/leads").then((response) => {
      setLeads(response.data);
    });
  useEffect(load, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    await request<Lead>("/leads", {
      method: "POST",
      body: JSON.stringify({ ...form, tags: splitTags(form.tags) })
    });
    setForm({ name: "", phone: "", email: "", company: "", city: "", niche: "", tags: "" });
    load();
  }

  async function importCsv() {
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    await request("/leads/import", { method: "POST", body: data });
    setFile(null);
    load();
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[384px_1fr]">
      <div className="space-y-6">
        <form className="panel p-6" onSubmit={create}>
          <h2 className="section-title">Novo lead</h2>
          <p className="section-copy">Cadastre manualmente apenas leads com origem conhecida e permissão registrada.</p>
          <div className="mt-5 space-y-4">
            {(["name", "phone", "email", "company", "city", "niche", "tags"] as const).map((key) => (
              <Field key={key} label={labelFor(key)}>
                <input className="input" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </Field>
            ))}
          </div>
          <button className="btn-primary mt-5 w-full">Salvar</button>
        </form>

        <div className="panel p-6">
          <h2 className="section-title">Importar CSV</h2>
          <p className="section-copy">Use CSV para carregar uma base autorizada e rastreável.</p>
          <div className="mt-5">
            <Field label="Arquivo CSV">
              <input className="input" type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          </div>
          <button className="btn-secondary mt-5 w-full" onClick={importCsv}>
            <Upload size={16} />
            Importar
          </button>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        {leads.length === 0 ? (
          <EmptyState title="Nenhum lead recebido ainda." text="Importe um CSV ou configure uma fonte em Conexões para preencher esta lista." />
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
              <tr>
                {["Nome", "Telefone", "Email", "Origem", "Campanha", "Cidade", "Nicho", "Status"].map((head) => (
                  <th key={head} className="px-5 py-4 font-medium">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-line">
                  <td className="px-5 py-4 font-medium">{lead.name}</td>
                  <td className="px-5 py-4 text-muted">{lead.phone}</td>
                  <td className="px-5 py-4 text-muted">{lead.email}</td>
                  <td className="px-5 py-4 text-muted">{lead.source ?? lead.source_type}</td>
                  <td className="px-5 py-4 text-muted">{lead.campaign_name ?? lead.utm_campaign}</td>
                  <td className="px-5 py-4 text-muted">{lead.city}</td>
                  <td className="px-5 py-4 text-muted">{lead.niche}</td>
                  <td className="px-5 py-4"><StatusPill status={lead.status ?? "inactive"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ConnectionsView() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [dashboard, setDashboard] = useState<ConnectionsDashboard | null>(null);
  const [selected, setSelected] = useState<LeadSource | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "landing_page",
    auto_tag: "",
    initial_status: "recebido",
    send_first_message: false,
    auto_ai_enabled: false
  });

  const load = () => {
    void request<LeadSource[]>("/integrations").then(setSources);
    void request<ConnectionsDashboard>("/integrations/dashboard").then(setDashboard);
  };
  useEffect(load, []);

  async function createSource(event: FormEvent) {
    event.preventDefault();
    await request("/integrations", {
      method: "POST",
      body: JSON.stringify({
        name: form.name,
        type: form.type,
        status: "active",
        settings: {
          auto_tag: form.auto_tag,
          initial_status: form.initial_status,
          send_first_message: form.send_first_message,
          auto_ai_enabled: form.auto_ai_enabled,
          first_message_body:
            "Olá, [nome]. Tudo bem?\n\nRecebi seu cadastro sobre captação de clientes pela internet.\n\nPara eu entender melhor: hoje você já anuncia no Google, Instagram ou Facebook?"
        }
      })
    });
    load();
  }

  async function testSource(source: LeadSource) {
    await request(`/integrations/${source.id}/test`, { method: "POST" });
    load();
  }

  const sourceByType = (type: string) => sources.find((source) => source.type === type);
  const hasIncomingLeads = Boolean(dashboard && dashboard.total_incoming > 0);
  const metricCards = dashboard
    ? [
        ["Recebidos hoje", dashboard.leads_received_today],
        ["Taxa de processamento", `${dashboard.processing_rate}%`],
        ["Duplicados", dashboard.duplicates],
        ["Erros", dashboard.errors],
        ["Fontes ativas", dashboard.active_sources],
        ["Total recebido", dashboard.total_incoming]
      ]
    : [];

  return (
    <section className="space-y-6">
      {hasIncomingLeads && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metricCards.map(([label, value]) => (
            <div key={label} className="panel p-5">
              <p className="metric-label">{label}</p>
              <strong className="metric-value text-2xl">{value}</strong>
            </div>
          ))}
        </div>
      )}

      {!hasIncomingLeads && (
        <EmptyState
          title="Nenhum lead recebido ainda."
          text="Configure uma fonte para comecar a receber contatos."
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[384px_1fr]">
        <div className="space-y-6">
          <form className="panel p-6" onSubmit={createSource}>
            <h2 className="section-title">Nova fonte de leads</h2>
            <p className="section-copy">Crie uma entrada para receber leads de uma ferramenta externa.</p>
            <div className="mt-5 space-y-4">
              <Field label="Nome da fonte">
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Tipo de conexão">
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {["webhook", "landing_page", "meta_ads", "google_ads", "google_sheets", "zapier", "make", "api"].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tag automática">
                <input className="input" value={form.auto_tag} onChange={(e) => setForm({ ...form, auto_tag: e.target.value })} />
              </Field>
              <Field label="Status inicial">
                <input className="input" value={form.initial_status} onChange={(e) => setForm({ ...form, initial_status: e.target.value })} />
              </Field>
              <label className="flex items-center gap-3 rounded-lg border border-line bg-wash px-3 py-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={form.send_first_message}
                  onChange={(e) => setForm({ ...form, send_first_message: e.target.checked })}
                />
                Enviar primeira mensagem automática
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-line bg-wash px-3 py-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={form.auto_ai_enabled}
                  onChange={(e) => setForm({ ...form, auto_ai_enabled: e.target.checked })}
                />
                Ativar IA automaticamente
              </label>
            </div>
            <button className="btn-primary mt-5 w-full">Criar fonte</button>
          </form>

          <div className="panel p-6">
            <h2 className="section-title">Seções do módulo</h2>
            <p className="section-copy">Estrutura preparada para captação, distribuição e automações por origem.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {connectionSections.map((section) => (
                <span key={section} className="status-badge text-muted">
                  {section}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="section-title">Fontes conectáveis</h2>
                <p className="section-copy">Configure entradas reais ou deixe integrações preparadas para a próxima fase.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {connectionCards.map((card) => {
              const source = sourceByType(card.type);
              const Icon = card.icon;
              const statusLabel = connectionStatusLabel(source);
              return (
                <div key={card.title} className="panel p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="grid h-10 w-10 place-items-center rounded-lg border border-ink bg-ink">
                        <Icon size={18} className="text-white" />
                      </div>
                      <h3 className="mt-4 font-semibold">{source?.name ?? card.title}</h3>
                    </div>
                    <span className={`status-badge ${connectionStatusStyle(source)}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted">{connectionHelpText(statusLabel)}</p>
                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Última sync</dt>
                      <dd>{source?.last_sync_at ? formatDate(source.last_sync_at) : "Sem sync"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Leads</dt>
                      <dd>{source?.leads_received ?? 0}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Erros</dt>
                      <dd>{source?.error_count ?? 0}</dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex gap-2">
                    <button className="btn-secondary flex-1" onClick={() => setSelected(source ?? null)}>
                      Configurar
                    </button>
                    <button className="btn-ghost" onClick={() => source && testSource(source)} title="Testar conexão">
                      <RefreshCw size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          <ConnectionConfig source={selected ?? undefined} />
        </div>
      </div>
    </section>
  );
}

function TemplatesView() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [form, setForm] = useState({
    name: "",
    whatsapp_template_name: "",
    language_code: "pt_BR",
    category: "MARKETING",
    body_preview: "",
    variables: "",
    status: "pending"
  });

  const load = () => void request<WhatsAppTemplate[]>("/templates").then(setTemplates);
  useEffect(load, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    await request("/templates", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        variables: splitTags(form.variables)
      })
    });
    load();
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form className="panel p-6" onSubmit={create}>
        <h2 className="section-title">Template WhatsApp</h2>
        <p className="section-copy">Campanhas reais usam templates aprovados no WhatsApp Manager, não texto livre.</p>
        <div className="mt-5 grid gap-4">
          <Field label="Nome interno">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Nome oficial do template">
            <input className="input" value={form.whatsapp_template_name} onChange={(e) => setForm({ ...form, whatsapp_template_name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Idioma">
              <input className="input" value={form.language_code} onChange={(e) => setForm({ ...form, language_code: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="pending">pendente</option>
                <option value="approved">aprovado</option>
                <option value="rejected">rejeitado</option>
              </select>
            </Field>
          </div>
          <Field label="Categoria">
            <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <Field label="Preview interno do corpo">
            <textarea className="input min-h-28 py-2" value={form.body_preview} onChange={(e) => setForm({ ...form, body_preview: e.target.value })} />
          </Field>
          <Field label="Variáveis separadas por vírgula">
            <input className="input" value={form.variables} onChange={(e) => setForm({ ...form, variables: e.target.value })} />
          </Field>
        </div>
        <button className="btn-primary mt-5 w-full">Salvar template</button>
      </form>

      <div className="space-y-3">
        {templates.length === 0 && <EmptyState title="Nenhum template cadastrado" text="Cadastre um template aprovado antes de iniciar campanhas." />}
        {templates.map((template) => (
          <div key={template.id} className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="section-title">{template.name}</h3>
                <p className="text-sm text-muted">
                  {template.whatsapp_template_name} - {template.language_code} - {template.category}
                </p>
              </div>
              <StatusPill status={template.status} />
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{template.body_preview}</p>
            <p className="mt-3 text-xs text-muted">Variáveis: {template.variables?.join(", ") || "sem variáveis"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsView() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      setStatus(await request<SetupStatus>("/setup/status"));
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Não foi possível atualizar o checklist.");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function testCheck(key: string) {
    setTestingKey(key);
    setStatusError(null);
    try {
      const result = await request<SystemCheck>(setupTestPath(key), {
        method: "POST",
        body: JSON.stringify({ key })
      });
      setStatus((current) => {
        if (!current) return current;
        return {
          ...current,
          checks: current.checks.map((item) => (item.key === key ? result : item))
        };
      });
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Não foi possível testar este item.");
    } finally {
      setTestingKey(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel p-5 text-sm text-ink">
        Dados reais ativos. Esta tela consulta a API e os serviços configurados no ambiente.
      </div>

      <div className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Checklist em tempo real</h2>
            <p className="section-copy">Veja exatamente o que falta configurar antes de usar WhatsApp real.</p>
          </div>
          <button className="btn-secondary" onClick={() => void refreshStatus()} disabled={loadingStatus}>
            <RefreshCw size={16} className={loadingStatus ? "animate-spin" : ""} />
            {loadingStatus ? "Atualizando" : "Atualizar tudo"}
          </button>
        </div>
        {statusError && <div className="mt-4 rounded-lg border border-line bg-white p-4 text-sm text-ink">{statusError}</div>}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {loadingStatus && !status && (
            <div className="rounded-xl border border-line bg-wash p-5 text-sm text-muted">Consultando status do sistema...</div>
          )}
          {(status?.checks ?? []).map((item) => (
            <div key={item.key} className="rounded-xl border border-line bg-wash p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {statusIcon(item.status)}
                  <h3 className="text-sm font-semibold text-ink">{item.label}</h3>
                </div>
                <StatusPill status={item.status} />
              </div>
              <p className="mt-3 min-h-10 text-sm text-muted">{item.message}</p>
              {item.error_message && (
                <p className="mt-3 rounded-lg border border-divider bg-white p-3 text-xs leading-5 text-ink">{item.error_message}</p>
              )}
              <p className="mt-3 text-xs text-tertiary">Última verificação: {formatDateTime(item.last_checked_at)}</p>
              <button className="btn-secondary mt-4 w-full" onClick={() => testCheck(item.key)} disabled={testingKey === item.key}>
                <RefreshCw size={15} />
                {testingKey === item.key ? "Testando" : "Testar"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectionConfig({ source }: { source?: LeadSource }) {
  if (!source) {
    return (
      <div className="panel p-6 text-sm text-muted">
        Crie ou selecione uma fonte para ver URL, token, payload, embed e logs.
      </div>
    );
  }

  const embed = `<script src="https://connectx.thmixcompany.com/embed.js" data-source="${source.id}"></script>`;
  const payload = {
    name: "Nome do Lead",
    phone: "66999999999",
    email: "email@email.com",
    company: "Empresa",
    city: "Sinop",
    niche: "Barbearia",
    utm_source: "meta",
    utm_medium: "paid",
    utm_campaign: "campanha_x",
    utm_content: "criativo_1",
    utm_term: "barbearia"
  };

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">{source.name}</h2>
          <p className="section-copy">Configuração operacional da fonte.</p>
        </div>
        <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(source.webhook_url ?? "")}>
          Copiar URL
        </button>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <InfoBlock title="URL única" value={source.webhook_url || "Disponível após salvar a fonte"} />
        <InfoBlock title="Token/API key" value={source.api_key} />
        <InfoBlock title="Endpoint API pública" value="POST /public/leads" />
        <InfoBlock title="Script embed" value={embed} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Exemplo de payload JSON</h3>
          <pre className="mt-2 overflow-x-auto rounded-md bg-black p-3 text-xs text-white">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Logs recentes</h3>
          <div className="mt-2 space-y-2">
            {(source.recent_logs ?? []).length === 0 && <p className="text-sm text-muted">Sem erros recentes.</p>}
            {(source.recent_logs ?? []).map((log) => (
              <div key={log.id} className="rounded-md border border-line bg-wash p-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span>{log.event_type}</span>
                  <span className="text-ink">{log.status}</span>
                </div>
                {log.error_message && <p className="mt-1 text-xs text-ink">{log.error_message}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [form, setForm] = useState({
    name: "",
    message_body: "",
    template_id: "",
    template_variables: "[nome]",
    tag: "",
    city: "",
    niche: "",
    daily_limit: "30",
    interval_min_seconds: "60",
    interval_max_seconds: "180",
    allowed_start_time: "09:00",
    allowed_end_time: "18:00"
  });

  const load = () => {
    void request<Campaign[]>("/campaigns").then(setCampaigns);
    void request<WhatsAppTemplate[]>("/templates").then(setTemplates);
  };
  useEffect(load, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    await request("/campaigns", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        template_id: form.template_id || undefined,
        template_variables: splitTags(form.template_variables),
        daily_limit: Number(form.daily_limit),
        interval_min_seconds: Number(form.interval_min_seconds),
        interval_max_seconds: Number(form.interval_max_seconds),
        filters: { tag: form.tag || undefined, city: form.city || undefined, niche: form.niche || undefined }
      })
    });
    load();
  }

  async function action(id: string, path: string) {
    await request(`/campaigns/${id}/${path}`, { method: "POST" });
    load();
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form className="panel p-6" onSubmit={create}>
        <h2 className="section-title">Nova campanha</h2>
        <p className="section-copy">Primeira abordagem exige template oficial aprovado e opt-in autorizado.</p>
        <div className="mt-5 grid gap-4">
          <Field label="Nome da campanha">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Template aprovado">
            <select className="input" value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })}>
              <option value="">Selecione um template aprovado</option>
              {templates
                .filter((template) => template.status === "approved")
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} - {template.whatsapp_template_name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Variáveis do template">
            <input className="input" value={form.template_variables} onChange={(e) => setForm({ ...form, template_variables: e.target.value })} />
          </Field>
          <Field label="Preview interno da mensagem">
            <textarea className="input min-h-28 py-2" value={form.message_body} onChange={(e) => setForm({ ...form, message_body: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Tag">
              <input className="input" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
            </Field>
            <Field label="Cidade">
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Nicho">
              <input className="input" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
            </Field>
          </div>
        </div>
        <button className="btn-primary mt-5 w-full">Criar campanha</button>
      </form>
      <div className="space-y-3">
        {campaigns.length === 0 && <EmptyState title="Nenhuma campanha" text="Crie uma campanha usando um template aprovado para enviar pelo WhatsApp Cloud API." />}
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="section-title">{campaign.name}</h3>
                <p className="text-sm text-muted">
                  {campaign.status} - template {campaign.template_name ?? "não definido"} - limite {campaign.daily_limit}/dia
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => action(campaign.id, "start")}>
                  <Play size={16} />
                  Iniciar
                </button>
                <button className="btn-secondary" onClick={() => action(campaign.id, "process-next")}>
                  Enviar próximo
                </button>
                <button className="btn-secondary" onClick={() => action(campaign.id, "pause")}>
                  <Pause size={16} />
                  Pausar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConversationsView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");

  const load = () => void request<Conversation[]>("/conversations").then(setConversations);
  useEffect(load, []);
  useEffect(() => {
    if (selectedId) void request<Conversation>(`/conversations/${selectedId}`).then(setSelected);
  }, [selectedId]);

  const messages = useMemo<Message[]>(() => selected?.messages ?? [], [selected]);

  async function post(path: string, body?: unknown) {
    if (!selectedId) return;
    await request(`/conversations/${selectedId}/${path}`, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined
    });
    setSelected(await request<Conversation>(`/conversations/${selectedId}`));
    load();
  }

  return (
    <section className="grid min-h-[650px] gap-6 xl:grid-cols-[340px_1fr]">
      <aside className="panel overflow-hidden">
        {conversations.length === 0 && (
          <p className="p-6 text-sm leading-6 text-muted">Nenhuma conversa ainda. Quando um lead responder ou uma automação iniciar atendimento, ela aparece aqui.</p>
        )}
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            className={`block w-full border-b border-line px-5 py-4 text-left transition hover:bg-wash ${
              selectedId === conversation.id ? "bg-accent" : ""
            }`}
            onClick={() => setSelectedId(conversation.id)}
          >
            <strong className="block text-sm">{conversation.leads?.name ?? "Lead"}</strong>
            <span className="text-xs text-muted">
              {conversation.status} - IA {conversation.ai_enabled ? "ativa" : "pausada"}
            </span>
          </button>
        ))}
      </aside>
      <div className="panel flex min-h-[650px] flex-col">
        {selected ? (
          <>
            <div className="border-b border-line p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="section-title">{selected.leads?.name}</h2>
                  <p className="section-copy">{selected.status} · IA {selected.ai_enabled ? "ativa" : "pausada"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => post("takeover")}>
                    <Hand size={16} />
                    Assumir
                  </button>
                  <button className="btn-secondary" onClick={() => post("mark", { status: "interessado" })}>
                    <UserCheck size={16} />
                    Interessado
                  </button>
                  <button className="btn-danger" onClick={() => post("mark", { status: "opt_out" })}>
                    <ShieldOff size={16} />
                    Bloquear
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-wash p-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[78%] rounded-2xl border border-line p-4 text-sm leading-6 ${
                    message.direction === "outbound" ? "ml-auto bg-ink text-white" : "bg-white text-ink"
                  }`}
                >
                  {message.body}
                </div>
              ))}
            </div>
            <form
              className="flex gap-2 border-t border-line p-5"
              onSubmit={async (event) => {
                event.preventDefault();
                await post("send", { body: reply });
                setReply("");
              }}
            >
              <input className="input" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Responder como humano" />
              <button className="btn-primary">Enviar</button>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-sm text-muted">Selecione uma conversa</div>
        )}
      </div>
    </section>
  );
}

function SendsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    void request<Campaign[]>("/campaigns").then(setCampaigns);
  }, []);

  const activeCount = campaigns.filter((campaign) => campaign.status === "active").length;

  return (
    <section className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="panel p-6">
          <p className="metric-label">Campanhas ativas</p>
          <strong className="metric-value">{activeCount}</strong>
        </div>
      </div>
      <div className="panel overflow-x-auto">
        <div className="border-b border-line p-6">
          <h2 className="section-title">Fila de Disparos</h2>
          <p className="section-copy">Os registros de envio aparecerão aqui assim que campanhas estiverem ativas.</p>
        </div>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
            <tr>
              {["Campanha", "Lead", "Status", "Enviado em", "Erro"].map((head) => (
                <th key={head} className="px-5 py-4 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-5 py-8 text-muted" colSpan={5}>
                Nenhum registro de envio ainda.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AutomationsView() {
  const rules = [
    "Triagem por origem",
    "Tag automática ao entrar",
    "Handoff por classificação da IA",
    "Horário de atendimento por fonte"
  ];

  return (
    <section className="panel p-6">
      <h2 className="section-title">Automações</h2>
      <p className="section-copy">Regras preparadas para a próxima fase. O MVP atual opera com campanha, IA e handoff humano.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {rules.map((rule) => (
          <div key={rule} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-wash p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-muted" size={18} />
              <span className="text-sm font-medium text-ink">{rule}</span>
            </div>
            <span className="status-badge text-muted">Planejado</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportsView() {
  const [report, setReport] = useState<MetaAdsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void request<MetaAdsReport>("/reports/meta-ads")
      .then(setReport)
      .catch((item) => setError(item instanceof Error ? item.message : "Não foi possível carregar o relatório."));
  }, []);

  const summaryCards = report
    ? [
        ["Leads Meta", report.summary.leads],
        ["Investimento", formatCurrency(report.summary.spend)],
        ["Respostas", report.summary.responses],
        ["Taxa resposta", `${report.summary.response_rate}%`],
        ["CPL", formatCurrency(report.summary.cpl)],
        ["Interessados", report.summary.interested],
        ["Custo/interessado", formatCurrency(report.summary.cost_per_interested)],
        ["Handoff humano", report.summary.human_needed],
        ["CTR", `${report.summary.ctr}%`]
      ]
    : [];

  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="section-title">Relatórios</h2>
            <p className="section-copy">Primeira visão de tráfego pago: atribuição de leads vindos de Meta Ads.</p>
          </div>
          <span className="status-badge bg-ink text-white">Meta Ads</span>
        </div>
      </div>

      {error && <div className="panel p-4 text-sm text-ink">{error}</div>}

      {!report && !error && <EmptyState title="Carregando relatório." text="Consultando leads, respostas e origens atribuídas ao Meta Ads." />}

      {report && report.summary.leads === 0 && (
        <EmptyState
          title="Nenhum lead de Meta Ads ainda."
          text="Quando uma fonte Meta Ads, webhook, Zapier/Make ou landing page enviar leads com origem meta/facebook/instagram, o relatório aparece aqui."
        />
      )}

      {report && report.summary.leads > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map(([label, value]) => (
              <div key={label} className="panel p-5">
                <p className="metric-label">{label}</p>
                <strong className="metric-value text-2xl">{value}</strong>
              </div>
            ))}
          </div>

          <ReportTable title="Campanhas Meta" rows={report.campaigns} />
          <ReportTable title="Conjuntos de anúncios" rows={report.adsets} />
          <ReportTable title="Anúncios" rows={report.ads} />

          <div className="panel overflow-hidden">
            <div className="border-b border-line p-5">
              <h3 className="section-title">Leads recentes de Meta Ads</h3>
              <p className="section-copy">Últimos contatos atribuídos a campanhas, conjuntos ou anúncios da Meta.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-3">Lead</th>
                    <th className="px-5 py-3">Campanha</th>
                    <th className="px-5 py-3">Conjunto</th>
                    <th className="px-5 py-3">Anúncio</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recent_leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-4">
                        <strong className="block">{lead.name}</strong>
                        <span className="text-xs text-muted">{lead.company ?? lead.phone}</span>
                      </td>
                      <td className="px-5 py-4 text-muted">{lead.campaign_name ?? "Sem campanha"}</td>
                      <td className="px-5 py-4 text-muted">{lead.adset_name ?? "Sem conjunto"}</td>
                      <td className="px-5 py-4 text-muted">{lead.ad_name ?? "Sem anúncio"}</td>
                      <td className="px-5 py-4"><StatusPill status={lead.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ReportTable({ title, rows }: { title: string; rows: MetaAdsReportRow[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-line p-5">
        <h3 className="section-title">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-muted">
            <tr>
              <th className="px-5 py-3">Nome</th>
              <th className="px-5 py-3">Leads</th>
              <th className="px-5 py-3">Invest.</th>
              <th className="px-5 py-3">CPL</th>
              <th className="px-5 py-3">Respostas</th>
              <th className="px-5 py-3">Taxa</th>
              <th className="px-5 py-3">Interessados</th>
              <th className="px-5 py-3">Custo/int.</th>
              <th className="px-5 py-3">CTR</th>
              <th className="px-5 py-3">Handoff</th>
              <th className="px-5 py-3">Erros</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="px-5 py-5 text-muted" colSpan={11}>Sem dados suficientes.</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-line last:border-0">
                <td className="px-5 py-4 font-medium">{row.name}</td>
                <td className="px-5 py-4">{row.leads}</td>
                <td className="px-5 py-4">{formatCurrency(row.spend)}</td>
                <td className="px-5 py-4">{formatCurrency(row.cpl)}</td>
                <td className="px-5 py-4">{row.responses}</td>
                <td className="px-5 py-4">{row.response_rate}%</td>
                <td className="px-5 py-4">{row.interested}</td>
                <td className="px-5 py-4">{formatCurrency(row.cost_per_interested)}</td>
                <td className="px-5 py-4">{row.ctr}%</td>
                <td className="px-5 py-4">{row.human_needed}</td>
                <td className="px-5 py-4">{row.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LegacyReportsView() {
  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <h2 className="section-title">Relatórios</h2>
        <p className="section-copy">Os relatórios serão gerados assim que houver dados de campanha.</p>
      </div>
      <EmptyState title="Nenhum relatório disponível ainda." text="Depois dos primeiros leads, disparos e respostas reais, esta área pode receber indicadores por origem e campanha." />
    </section>
  );
}

function PlaceholderView({ title }: { title: string }) {
  return (
    <section className="panel p-6">
      <h2 className="section-title">{title}</h2>
      <p className="section-copy">Esta área ainda não faz parte do fluxo operacional do MVP.</p>
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="panel empty-state p-8 text-sm">
      <h3 className="section-title">{title}</h3>
      <p className="section-copy">{text}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: "bg-soft text-ink border-line",
    active: "bg-soft text-ink border-line",
    connected: "bg-soft text-ink border-line",
    pending: "bg-wash text-muted border-line",
    prepared: "bg-wash text-muted border-line",
    error: "bg-wash text-ink border-line",
    rejected: "bg-wash text-ink border-line",
    inactive: "bg-wash text-muted border-line"
  };
  const labels: Record<string, string> = {
    approved: "Aprovado",
    active: "Ativo",
    connected: "Conectado",
    pending: "Pendente",
    prepared: "Preparado",
    error: "Erro",
    rejected: "Rejeitado",
    inactive: "Inativo"
  };
  return <span className={`status-badge ${styles[status] ?? styles.inactive}`}>{labels[status] ?? status}</span>;
}

function statusIcon(status: SystemCheck["status"]) {
  if (status === "connected") return <CheckCircle2 className="text-ink" size={18} />;
  if (status === "error") return <XCircle className="text-ink" size={18} />;
  return <RefreshCw className="text-muted" size={18} />;
}

function getNextRecommendedStep(setup: SetupStatus | null) {
  const checks = setup?.checks ?? [];
  const byKey = (key: string) => checks.find((item) => item.key === key);
  if (byKey("supabase_connected")?.status !== "connected") {
    return {
      title: "Configure o Supabase",
      description: "O banco precisa estar conectado antes de receber leads, salvar conversas e registrar logs."
    };
  }
  if (byKey("whatsapp_cloud_connected")?.status !== "connected" || byKey("phone_number_id_configured")?.status !== "connected") {
    return {
      title: "Configure o WhatsApp Cloud API",
      description: "Adicione token, Phone Number ID e valide a conexão com a Graph API antes de enviar campanhas."
    };
  }
  if (byKey("templates_available")?.status !== "connected") {
    return {
      title: "Crie seu primeiro template",
      description: "Campanhas de primeira abordagem precisam de um template oficial aprovado no WhatsApp Manager."
    };
  }
  if (byKey("worker_running")?.status !== "connected") {
    return {
      title: "Inicie o worker de disparos",
      description: "O worker precisa estar rodando para processar a fila de campanhas com segurança."
    };
  }
  if (byKey("inbound_worker_running")?.status !== "connected") {
    return {
      title: "Inicie o worker de mensagens recebidas",
      description: "O worker inbound precisa estar rodando para processar respostas do WhatsApp, IA e handoff humano."
    };
  }
  return {
    title: "Envie uma mensagem teste",
    description: "Com a infraestrutura pronta, rode um teste controlado antes de ativar uma campanha real."
  };
}

function connectionStatusLabel(source?: LeadSource) {
  if (!source || source.status === "not_configured") return "Não configurado";
  if (source.error_count && source.error_count > 0) return "Com erro";
  if (source.status === "working" || source.status === "active") return "Funcionando";
  if (source.status === "configured") return "Configurado";
  if (source.status === "pending" || source.status === "prepared") return "Configurado";
  if (!source.api_key) return "Não configurado";
  return source.status;
}

function setupTestPath(key: string) {
  if (key === "supabase_connected") return "/setup/test/supabase";
  if (key === "redis_connected") return "/setup/test/redis";
  if (key === "openai_connected") return "/setup/test/openai";
  if (key === "worker_running" || key === "inbound_worker_running") return "/setup/test/worker";
  return "/setup/test/whatsapp";
}

function connectionStatusStyle(source?: LeadSource) {
  const label = connectionStatusLabel(source);
  if (label === "Funcionando") return "border-line bg-soft text-ink";
  if (label === "Configurado") return "border-line bg-wash text-ink";
  if (label === "Com erro") return "border-line bg-wash text-ink";
  return "border-line bg-wash text-muted";
}

function connectionHelpText(status: string) {
  const texts: Record<string, string> = {
    "Não configurado": "Ainda falta criar credenciais ou URL para esta fonte.",
    Configurado: "A fonte tem dados básicos, mas ainda não recebeu leads.",
    "Com erro": "Existe erro recente. Abra os logs antes de usar em produção.",
    Funcionando: "A fonte está pronta para receber leads reais."
  };
  return texts[status] ?? "Revise a configuração antes de ativar automações.";
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-wash p-4">
      <p className="metric-label">{title}</p>
      <p className="mt-1 break-all text-sm">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function labelFor(key: string) {
  const labels: Record<string, string> = {
    name: "Nome",
    phone: "Telefone",
    email: "Email",
    company: "Empresa",
    city: "Cidade",
    niche: "Nicho",
    tags: "Tags separadas por vírgula"
  };
  return labels[key] ?? key;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatDateTime(value?: string) {
  if (!value) return "Ainda não verificado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
