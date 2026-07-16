create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'agent')),
  created_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  company text,
  city text,
  niche text,
  source text,
  source_id uuid,
  source_type text,
  campaign_name text,
  ad_name text,
  adset_name text,
  form_name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  status text not null default 'novo',
  tags text[] not null default '{}',
  observations text,
  opt_in_status text not null default 'unknown' check (opt_in_status in ('unknown', 'authorized', 'denied')),
  opt_out boolean not null default false,
  first_message_sent boolean not null default false,
  first_message_at timestamptz,
  last_source_sync_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, phone)
);

create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  type text not null check (type in (
    'manual',
    'csv',
    'webhook',
    'meta_ads',
    'google_ads',
    'google_sheets',
    'landing_page',
    'zapier',
    'make',
    'api'
  )),
  status text not null default 'inactive',
  api_key text not null default encode(gen_random_bytes(24), 'hex'),
  webhook_url text,
  external_account_id text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  whatsapp_template_name text not null,
  language_code text not null default 'pt_BR',
  category text,
  body_preview text not null,
  variables jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists incoming_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid references lead_sources(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  name text,
  phone text,
  email text,
  company text,
  city text,
  niche text,
  campaign_name text,
  ad_name text,
  adset_name text,
  form_name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  status text not null default 'recebido' check (status in (
    'recebido',
    'processado',
    'duplicado',
    'erro',
    'aguardando_atendimento',
    'em_atendimento',
    'convertido',
    'perdido'
  )),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists integration_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid references lead_sources(id) on delete set null,
  event_type text not null,
  status text not null,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists lead_source_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  source_id uuid references lead_sources(id) on delete set null,
  source_type text,
  campaign_name text,
  ad_name text,
  adset_name text,
  form_name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists meta_ad_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_id uuid references lead_sources(id) on delete set null,
  date date not null,
  level text not null default 'campaign' check (level in ('campaign', 'adset', 'ad')),
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  spend numeric(12,2) not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  clicks integer not null default 0,
  unique_clicks integer not null default 0,
  leads integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prospecting_searches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  keyword text not null,
  city text,
  status text not null default 'pending',
  filters jsonb not null default '{}'::jsonb,
  results_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prospecting_companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  search_id uuid references prospecting_searches(id) on delete set null,
  google_place_id text,
  name text not null,
  phone text,
  website text,
  address text,
  city text,
  niche text,
  rating numeric(3,2),
  reviews_count integer not null default 0,
  business_status text,
  has_website boolean not null default false,
  status text not null default 'prospect',
  tags text[] not null default '{}',
  notes text,
  lead_id uuid references leads(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, google_place_id)
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft',
  message_body text not null,
  template_id uuid references whatsapp_templates(id) on delete set null,
  template_name text,
  language_code text not null default 'pt_BR',
  template_variables jsonb not null default '[]'::jsonb,
  daily_limit integer not null default 50,
  interval_min_seconds integer not null default 60,
  interval_max_seconds integer not null default 180,
  allowed_start_time time not null default '09:00',
  allowed_end_time time not null default '18:00',
  consecutive_errors integer not null default 0,
  negative_responses integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique(tenant_id, campaign_id, lead_id)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null default 'aberta',
  ai_enabled boolean not null default true,
  human_needed boolean not null default false,
  assigned_user_id uuid references users(id) on delete set null,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lead_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null,
  sender_type text not null,
  body text not null,
  whatsapp_message_id text,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  unique(whatsapp_message_id)
);

create table if not exists send_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb
);

create index if not exists users_tenant_id_idx on users(tenant_id);
create index if not exists leads_tenant_id_idx on leads(tenant_id);
create index if not exists campaigns_tenant_id_idx on campaigns(tenant_id);
create index if not exists campaign_leads_tenant_id_idx on campaign_leads(tenant_id);
create index if not exists conversations_tenant_id_idx on conversations(tenant_id);
create index if not exists messages_tenant_id_idx on messages(tenant_id);
create index if not exists send_logs_tenant_id_idx on send_logs(tenant_id);
create index if not exists lead_sources_tenant_id_idx on lead_sources(tenant_id);
create index if not exists incoming_leads_tenant_id_idx on incoming_leads(tenant_id);
create index if not exists integration_logs_tenant_id_idx on integration_logs(tenant_id);
create index if not exists lead_source_history_tenant_id_idx on lead_source_history(tenant_id);
create index if not exists whatsapp_templates_tenant_id_idx on whatsapp_templates(tenant_id);
create index if not exists meta_ad_insights_tenant_id_idx on meta_ad_insights(tenant_id);
create index if not exists meta_ad_insights_date_idx on meta_ad_insights(tenant_id, date);
create index if not exists meta_ad_insights_campaign_idx on meta_ad_insights(tenant_id, campaign_name);
create index if not exists meta_ad_insights_adset_idx on meta_ad_insights(tenant_id, adset_name);
create index if not exists meta_ad_insights_ad_idx on meta_ad_insights(tenant_id, ad_name);
create index if not exists prospecting_searches_tenant_id_idx on prospecting_searches(tenant_id);
create index if not exists prospecting_companies_tenant_id_idx on prospecting_companies(tenant_id);
create index if not exists prospecting_companies_search_id_idx on prospecting_companies(search_id);
create index if not exists prospecting_companies_has_website_idx on prospecting_companies(tenant_id, has_website);
create index if not exists prospecting_companies_city_idx on prospecting_companies(tenant_id, city);
create index if not exists prospecting_companies_status_idx on prospecting_companies(tenant_id, status);
create index if not exists leads_tags_idx on leads using gin(tags);
create index if not exists leads_city_idx on leads(city);
create index if not exists leads_niche_idx on leads(niche);
create index if not exists leads_source_id_idx on leads(source_id);
create index if not exists leads_opt_in_status_idx on leads(opt_in_status);
create index if not exists whatsapp_templates_status_idx on whatsapp_templates(status);
create index if not exists campaign_leads_status_idx on campaign_leads(campaign_id, status);
create index if not exists messages_conversation_idx on messages(conversation_id, created_at);
create index if not exists send_logs_campaign_created_idx on send_logs(campaign_id, created_at);
create index if not exists lead_sources_type_status_idx on lead_sources(type, status);
create index if not exists incoming_leads_source_created_idx on incoming_leads(source_id, created_at);
create index if not exists integration_logs_source_created_idx on integration_logs(source_id, created_at);
create index if not exists lead_source_history_lead_idx on lead_source_history(lead_id, created_at);

create or replace function current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      auth.jwt() ->> 'tenantId',
      auth.jwt() ->> 'tenant_id',
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenantId',
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenant_id'
    ),
    ''
  )::uuid
$$;

alter table tenants enable row level security;
alter table users enable row level security;
alter table refresh_tokens enable row level security;
alter table leads enable row level security;
alter table campaigns enable row level security;
alter table campaign_leads enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table send_logs enable row level security;
alter table lead_sources enable row level security;
alter table incoming_leads enable row level security;
alter table integration_logs enable row level security;
alter table lead_source_history enable row level security;
alter table whatsapp_templates enable row level security;
alter table meta_ad_insights enable row level security;
alter table prospecting_searches enable row level security;
alter table prospecting_companies enable row level security;

create policy tenants_by_jwt_tenant on tenants using (id = current_tenant_id()) with check (id = current_tenant_id());
create policy users_by_jwt_tenant on users using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy refresh_tokens_by_jwt_tenant on refresh_tokens
  using (exists (select 1 from users where users.id = refresh_tokens.user_id and users.tenant_id = current_tenant_id()))
  with check (exists (select 1 from users where users.id = refresh_tokens.user_id and users.tenant_id = current_tenant_id()));
create policy leads_by_jwt_tenant on leads using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy campaigns_by_jwt_tenant on campaigns using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy campaign_leads_by_jwt_tenant on campaign_leads using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy conversations_by_jwt_tenant on conversations using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy messages_by_jwt_tenant on messages using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy send_logs_by_jwt_tenant on send_logs using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy lead_sources_by_jwt_tenant on lead_sources using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy incoming_leads_by_jwt_tenant on incoming_leads using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy integration_logs_by_jwt_tenant on integration_logs using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy lead_source_history_by_jwt_tenant on lead_source_history using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy whatsapp_templates_by_jwt_tenant on whatsapp_templates using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy meta_ad_insights_by_jwt_tenant on meta_ad_insights using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy prospecting_searches_by_jwt_tenant on prospecting_searches using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy prospecting_companies_by_jwt_tenant on prospecting_companies using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
