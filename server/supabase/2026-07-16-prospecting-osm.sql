alter table prospecting_companies add column if not exists source_provider text not null default 'google_places';
alter table prospecting_companies add column if not exists external_id text;

update prospecting_companies
set external_id = coalesce(external_id, google_place_id, id::text)
where external_id is null;

alter table prospecting_companies alter column external_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prospecting_companies_tenant_source_external_key'
  ) then
    alter table prospecting_companies
      add constraint prospecting_companies_tenant_source_external_key
      unique (tenant_id, source_provider, external_id);
  end if;
end $$;

create index if not exists prospecting_companies_source_provider_idx
  on prospecting_companies(tenant_id, source_provider);
