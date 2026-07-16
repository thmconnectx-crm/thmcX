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

create index if not exists prospecting_searches_tenant_id_idx on prospecting_searches(tenant_id);
create index if not exists prospecting_companies_tenant_id_idx on prospecting_companies(tenant_id);
create index if not exists prospecting_companies_search_id_idx on prospecting_companies(search_id);
create index if not exists prospecting_companies_has_website_idx on prospecting_companies(tenant_id, has_website);
create index if not exists prospecting_companies_city_idx on prospecting_companies(tenant_id, city);
create index if not exists prospecting_companies_status_idx on prospecting_companies(tenant_id, status);

alter table prospecting_searches enable row level security;
alter table prospecting_companies enable row level security;

drop policy if exists prospecting_searches_by_jwt_tenant on prospecting_searches;
create policy prospecting_searches_by_jwt_tenant on prospecting_searches
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

drop policy if exists prospecting_companies_by_jwt_tenant on prospecting_companies;
create policy prospecting_companies_by_jwt_tenant on prospecting_companies
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
