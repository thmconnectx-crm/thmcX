create table if not exists report_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  status text not null default 'completed',
  analysis jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists report_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null default 'meta_ads_monitor',
  severity text not null default 'info' check (severity in ('info', 'baixa', 'media', 'alta')),
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists report_monitor_runs_tenant_created_idx on report_monitor_runs(tenant_id, created_at desc);
create index if not exists report_notifications_tenant_created_idx on report_notifications(tenant_id, created_at desc);
create index if not exists report_notifications_tenant_unread_idx on report_notifications(tenant_id, read_at) where read_at is null;

alter table report_monitor_runs enable row level security;
alter table report_notifications enable row level security;

drop policy if exists report_monitor_runs_by_jwt_tenant on report_monitor_runs;
create policy report_monitor_runs_by_jwt_tenant on report_monitor_runs
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

drop policy if exists report_notifications_by_jwt_tenant on report_notifications;
create policy report_notifications_by_jwt_tenant on report_notifications
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
