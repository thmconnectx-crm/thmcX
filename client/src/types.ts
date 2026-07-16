export type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  city?: string;
  niche?: string;
  source?: string;
  source_id?: string;
  source_type?: string;
  campaign_name?: string;
  utm_source?: string;
  utm_campaign?: string;
  status: string;
  tags: string[];
  observations?: string;
  opt_out: boolean;
  opt_in_status?: "unknown" | "authorized" | "denied";
  created_at: string;
};

export type LeadListResponse = {
  data: Lead[];
  total: number;
  page: number;
  limit: number;
};

export type Campaign = {
  id: string;
  name: string;
  description?: string;
  status: string;
  message_body: string;
  template_id?: string;
  template_name?: string;
  language_code?: string;
  template_variables?: string[];
  daily_limit: number;
  interval_min_seconds: number;
  interval_max_seconds: number;
  allowed_start_time: string;
  allowed_end_time: string;
};

export type Conversation = {
  id: string;
  status: string;
  ai_enabled: boolean;
  human_needed: boolean;
  leads?: Lead;
  messages?: Message[];
};

export type Message = {
  id: string;
  direction: "inbound" | "outbound";
  sender_type: string;
  body: string;
  status: string;
  created_at: string;
};

export type Dashboard = {
  total_leads: number;
  messages_sent: number;
  messages_error: number;
  responses_received: number;
  response_rate: number;
  interested: number;
  opt_outs: number;
  active_campaigns: number;
  paused_campaigns: number;
  conversations_waiting_human: number;
};

export type MetaAdsReportRow = {
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

export type MetaAdsReport = {
  summary: Omit<MetaAdsReportRow, "name" | "campaign_name" | "adset_name">;
  campaigns: MetaAdsReportRow[];
  adsets: MetaAdsReportRow[];
  ads: MetaAdsReportRow[];
  recent_leads: Array<{
    id: string;
    name: string;
    phone: string;
    company?: string | null;
    status: string;
    campaign_name?: string | null;
    adset_name?: string | null;
    ad_name?: string | null;
    created_at: string;
  }>;
};

export type ProspectingSearch = {
  id: string;
  keyword: string;
  city?: string | null;
  status: string;
  filters?: Record<string, unknown>;
  results_count: number;
  error_message?: string | null;
  created_at: string;
};

export type ProspectingCompany = {
  id: string;
  search_id?: string | null;
  source_provider: "osm" | "google_places" | string;
  external_id: string;
  google_place_id?: string | null;
  name: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  niche?: string | null;
  rating?: number | null;
  reviews_count: number;
  business_status?: string | null;
  has_website: boolean;
  status: string;
  tags: string[];
  lead_id?: string | null;
  created_at: string;
};

export type ProspectingSearchResponse = {
  search: ProspectingSearch;
  companies: ProspectingCompany[];
};

export type IntegrationLog = {
  id: string;
  event_type: string;
  status: string;
  error_message?: string | null;
  created_at: string;
};

export type LeadSource = {
  id: string;
  name: string;
  type:
    | "manual"
    | "csv"
    | "webhook"
    | "meta_ads"
    | "google_ads"
    | "google_sheets"
    | "landing_page"
    | "zapier"
    | "make"
    | "api";
  status: string;
  api_key: string;
  webhook_url?: string | null;
  external_account_id?: string | null;
  settings: Record<string, unknown>;
  leads_received?: number;
  error_count?: number;
  last_sync_at?: string | null;
  recent_logs?: IntegrationLog[];
};

export type ConnectionsDashboard = {
  leads_received_today: number;
  processing_rate: number;
  duplicates: number;
  errors: number;
  active_sources: number;
  total_incoming: number;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  whatsapp_template_name: string;
  language_code: string;
  category?: string;
  body_preview: string;
  variables: string[];
  status: "approved" | "pending" | "rejected" | string;
  created_at: string;
};

export type SetupStatus = {
  checks: SystemCheck[];
  supabase_connected: boolean;
  redis_connected: boolean;
  openai_connected: boolean;
  whatsapp_cloud_connected: boolean;
  whatsapp_token_configured: boolean;
  phone_number_id_configured: boolean;
  whatsapp_business_account_id_configured: boolean;
  webhook_verified: boolean;
  template_approved: boolean;
  worker_running: boolean;
  inbound_worker_running: boolean;
};

export type SystemCheck = {
  key: string;
  label: string;
  status: "connected" | "pending" | "error";
  message: string;
  last_checked_at: string;
  error_message?: string;
};
