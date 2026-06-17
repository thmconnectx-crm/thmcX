alter table leads add column if not exists email text;
alter table leads add column if not exists source_id uuid;
alter table leads add column if not exists source_type text;
alter table leads add column if not exists campaign_name text;
alter table leads add column if not exists ad_name text;
alter table leads add column if not exists adset_name text;
alter table leads add column if not exists form_name text;
alter table leads add column if not exists utm_source text;
alter table leads add column if not exists utm_medium text;
alter table leads add column if not exists utm_campaign text;
alter table leads add column if not exists utm_content text;
alter table leads add column if not exists utm_term text;
alter table leads add column if not exists first_message_sent boolean not null default false;
alter table leads add column if not exists first_message_at timestamptz;
alter table leads add column if not exists last_source_sync_at timestamptz;
alter table leads add column if not exists opt_in_status text not null default 'unknown';

create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_template_name text not null,
  language_code text not null default 'pt_BR',
  category text,
  body_preview text not null,
  variables jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table campaigns add column if not exists template_id uuid references whatsapp_templates(id) on delete set null;
alter table campaigns add column if not exists template_name text;
alter table campaigns add column if not exists language_code text not null default 'pt_BR';
alter table campaigns add column if not exists template_variables jsonb not null default '[]'::jsonb;

create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
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

create table if not exists incoming_leads (
  id uuid primary key default gen_random_uuid(),
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
  status text not null default 'recebido',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists integration_logs (
  id uuid primary key default gen_random_uuid(),
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

create index if not exists leads_source_id_idx on leads(source_id);
create index if not exists leads_opt_in_status_idx on leads(opt_in_status);
create index if not exists whatsapp_templates_status_idx on whatsapp_templates(status);
create index if not exists lead_sources_type_status_idx on lead_sources(type, status);
create index if not exists incoming_leads_source_created_idx on incoming_leads(source_id, created_at);
create index if not exists integration_logs_source_created_idx on integration_logs(source_id, created_at);
create index if not exists lead_source_history_lead_idx on lead_source_history(lead_id, created_at);
