create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

insert into tenants (id, name, plan)
values ('00000000-0000-0000-0000-000000000001', 'Default tenant', 'free')
on conflict (id) do nothing;

alter table users add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table users add column if not exists role text not null default 'admin' check (role in ('admin', 'agent'));
alter table users add column if not exists name text;
update users set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
alter table users alter column tenant_id set not null;

alter table refresh_tokens add column if not exists token_hash text;
update refresh_tokens set token_hash = encode(digest(token, 'sha256'), 'hex') where token_hash is null and token is not null;
alter table refresh_tokens alter column token_hash set not null;
alter table refresh_tokens drop constraint if exists refresh_tokens_token_key;
create unique index if not exists refresh_tokens_token_hash_key on refresh_tokens(token_hash);

alter table leads add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table campaigns add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table campaign_leads add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table conversations add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table messages add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table send_logs add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table lead_sources add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table incoming_leads add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table integration_logs add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table lead_source_history add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table whatsapp_templates add column if not exists tenant_id uuid references tenants(id) on delete cascade;

update leads set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update campaigns set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update campaign_leads set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update conversations set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update messages set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update send_logs set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update lead_sources set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update incoming_leads set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update integration_logs set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update lead_source_history set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;
update whatsapp_templates set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

alter table leads alter column tenant_id set not null;
alter table campaigns alter column tenant_id set not null;
alter table campaign_leads alter column tenant_id set not null;
alter table conversations alter column tenant_id set not null;
alter table messages alter column tenant_id set not null;
alter table send_logs alter column tenant_id set not null;
alter table lead_sources alter column tenant_id set not null;
alter table incoming_leads alter column tenant_id set not null;
alter table integration_logs alter column tenant_id set not null;
alter table lead_source_history alter column tenant_id set not null;
alter table whatsapp_templates alter column tenant_id set not null;

alter table leads drop constraint if exists leads_phone_key;
alter table leads add constraint leads_tenant_phone_key unique (tenant_id, phone);

alter table campaign_leads drop constraint if exists campaign_leads_campaign_id_lead_id_key;
alter table campaign_leads add constraint campaign_leads_tenant_campaign_lead_key unique (tenant_id, campaign_id, lead_id);

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
alter table refresh_tokens enable row level security;

drop policy if exists tenants_by_jwt_tenant on tenants;
create policy tenants_by_jwt_tenant on tenants
  using (id = current_tenant_id())
  with check (id = current_tenant_id());

drop policy if exists users_by_jwt_tenant on users;
create policy users_by_jwt_tenant on users
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

drop policy if exists refresh_tokens_by_jwt_tenant on refresh_tokens;
create policy refresh_tokens_by_jwt_tenant on refresh_tokens
  using (exists (select 1 from users where users.id = refresh_tokens.user_id and users.tenant_id = current_tenant_id()))
  with check (exists (select 1 from users where users.id = refresh_tokens.user_id and users.tenant_id = current_tenant_id()));

drop policy if exists leads_by_jwt_tenant on leads;
create policy leads_by_jwt_tenant on leads using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists campaigns_by_jwt_tenant on campaigns;
create policy campaigns_by_jwt_tenant on campaigns using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists campaign_leads_by_jwt_tenant on campaign_leads;
create policy campaign_leads_by_jwt_tenant on campaign_leads using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists conversations_by_jwt_tenant on conversations;
create policy conversations_by_jwt_tenant on conversations using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists messages_by_jwt_tenant on messages;
create policy messages_by_jwt_tenant on messages using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists send_logs_by_jwt_tenant on send_logs;
create policy send_logs_by_jwt_tenant on send_logs using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists lead_sources_by_jwt_tenant on lead_sources;
create policy lead_sources_by_jwt_tenant on lead_sources using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists incoming_leads_by_jwt_tenant on incoming_leads;
create policy incoming_leads_by_jwt_tenant on incoming_leads using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists integration_logs_by_jwt_tenant on integration_logs;
create policy integration_logs_by_jwt_tenant on integration_logs using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists lead_source_history_by_jwt_tenant on lead_source_history;
create policy lead_source_history_by_jwt_tenant on lead_source_history using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists whatsapp_templates_by_jwt_tenant on whatsapp_templates;
create policy whatsapp_templates_by_jwt_tenant on whatsapp_templates using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
