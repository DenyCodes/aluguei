-- Controles administrativos adicionais sem apagar historico operacional.
alter table public.oliveira_profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists deleted_at timestamptz;

do $$ begin
  alter table public.oliveira_profiles
    add constraint oliveira_profiles_account_status_check
    check (account_status in ('active','disabled','deleted'));
exception when duplicate_object then null; end $$;

alter table public.oliveira_properties
  add column if not exists availability_status text not null default 'available';

do $$ begin
  alter table public.oliveira_properties
    add constraint oliveira_properties_availability_status_check
    check (availability_status in ('available','rented','maintenance','archived'));
exception when duplicate_object then null; end $$;

alter table public.oliveira_maintenance_requests
  add column if not exists created_by uuid references public.oliveira_profiles(id),
  add column if not exists source text not null default 'tenant';

do $$ begin
  alter table public.oliveira_maintenance_requests
    add constraint oliveira_maintenance_source_check
    check (source in ('tenant','admin'));
exception when duplicate_object then null; end $$;

update public.oliveira_properties p
set availability_status = case
  when not p.active then 'archived'
  when exists (
    select 1 from public.oliveira_tenancies t
    where t.property_id = p.id and t.status = 'active'
  ) then 'rented'
  else 'available'
end;

create index if not exists oliveira_profiles_account_status_idx
  on public.oliveira_profiles(role, account_status);
create index if not exists oliveira_properties_availability_idx
  on public.oliveira_properties(availability_status, active);

create or replace function public.oliveira_sync_property_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_property uuid;
begin
  target_property := coalesce(new.property_id, old.property_id);
  update public.oliveira_properties p
  set availability_status = case
    when not p.active then 'archived'
    when exists (
      select 1 from public.oliveira_tenancies t
      where t.property_id = target_property and t.status = 'active'
    ) then 'rented'
    when p.availability_status = 'maintenance' then 'maintenance'
    else 'available'
  end,
  updated_at = now()
  where p.id = target_property;
  return coalesce(new, old);
end;
$$;

drop trigger if exists oliveira_tenancy_property_availability on public.oliveira_tenancies;
create trigger oliveira_tenancy_property_availability
after insert or update of status, property_id or delete on public.oliveira_tenancies
for each row execute function public.oliveira_sync_property_availability();

revoke all on function public.oliveira_sync_property_availability() from public, anon, authenticated;
grant execute on function public.oliveira_sync_property_availability() to service_role;

