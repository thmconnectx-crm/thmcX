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

create index if not exists meta_ad_insights_tenant_id_idx on meta_ad_insights(tenant_id);
create index if not exists meta_ad_insights_date_idx on meta_ad_insights(tenant_id, date);
create index if not exists meta_ad_insights_campaign_idx on meta_ad_insights(tenant_id, campaign_name);
create index if not exists meta_ad_insights_adset_idx on meta_ad_insights(tenant_id, adset_name);
create index if not exists meta_ad_insights_ad_idx on meta_ad_insights(tenant_id, ad_name);

alter table meta_ad_insights enable row level security;

drop policy if exists meta_ad_insights_by_jwt_tenant on meta_ad_insights;
create policy meta_ad_insights_by_jwt_tenant on meta_ad_insights
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
