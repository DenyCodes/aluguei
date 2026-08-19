-- Imobiliaria Oliveira - schema isolado para projeto Supabase compartilhado.
create extension if not exists pgcrypto;

create type public.oliveira_user_role as enum ('admin', 'tenant');
create type public.oliveira_utility_policy as enum ('included', 'individual', 'shared');
create type public.oliveira_tenancy_status as enum ('draft', 'active', 'ended', 'cancelled');
create type public.oliveira_contract_status as enum ('draft', 'pending_signature', 'signed', 'cancelled');
create type public.oliveira_installment_status as enum ('upcoming', 'pending', 'under_review', 'paid', 'late', 'rejected', 'cancelled');
create type public.oliveira_receipt_status as enum ('under_review', 'approved', 'rejected');
create type public.oliveira_maintenance_status as enum ('requested', 'authorized', 'completed', 'credited', 'rejected');

create table public.oliveira_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  cpf_masked text,
  role public.oliveira_user_role not null default 'tenant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oliveira_properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  neighborhood text not null,
  neighborhood_label text not null,
  address text not null,
  price numeric(12,2) not null check (price >= 0),
  bedrooms smallint not null default 0 check (bedrooms >= 0),
  bathrooms smallint not null default 0 check (bathrooms >= 0),
  area numeric(10,2) not null default 0 check (area >= 0),
  water_policy public.oliveira_utility_policy not null default 'individual',
  electricity_policy public.oliveira_utility_policy not null default 'individual',
  contact text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oliveira_property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.oliveira_properties(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.oliveira_tenancies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.oliveira_profiles(id),
  property_id uuid not null references public.oliveira_properties(id),
  starts_on date not null,
  ends_on date not null,
  monthly_rent numeric(12,2) not null check (monthly_rent > 0),
  due_day smallint not null check (due_day between 1 and 28),
  late_fee_percent numeric(7,4) not null check (late_fee_percent >= 0),
  monthly_interest_percent numeric(7,4) not null check (monthly_interest_percent >= 0),
  adjustment_index text not null,
  guarantee_type text not null,
  status public.oliveira_tenancy_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on)
);

create table public.oliveira_contracts (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.oliveira_tenancies(id),
  version integer not null check (version > 0),
  status public.oliveira_contract_status not null default 'draft',
  content jsonb not null,
  document_hash text,
  pdf_path text,
  issued_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenancy_id, version)
);

create table public.oliveira_contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references public.oliveira_contracts(id),
  signer_id uuid not null references public.oliveira_profiles(id),
  signer_name text not null,
  signer_email text not null,
  document_hash text not null,
  ip_address inet,
  user_agent text,
  signed_at timestamptz not null default now()
);

create table public.oliveira_rent_installments (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.oliveira_tenancies(id) on delete cascade,
  reference_month text not null,
  due_date date not null,
  base_amount numeric(12,2) not null check (base_amount >= 0),
  fine_amount numeric(12,2) not null default 0 check (fine_amount >= 0),
  interest_amount numeric(12,2) not null default 0 check (interest_amount >= 0),
  credit_amount numeric(12,2) not null default 0 check (credit_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status public.oliveira_installment_status not null default 'upcoming',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenancy_id, reference_month)
);

create table public.oliveira_payment_receipts (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.oliveira_rent_installments(id),
  tenant_id uuid not null references public.oliveira_profiles(id),
  file_path text not null,
  amount numeric(12,2) not null check (amount > 0),
  status public.oliveira_receipt_status not null default 'under_review',
  note text,
  reviewed_by uuid references public.oliveira_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.oliveira_maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.oliveira_tenancies(id),
  tenant_id uuid not null references public.oliveira_profiles(id),
  title text not null,
  description text not null,
  status public.oliveira_maintenance_status not null default 'requested',
  approved_limit numeric(12,2),
  approved_credit numeric(12,2),
  owner_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oliveira_maintenance_credits (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.oliveira_maintenance_requests(id),
  installment_id uuid not null references public.oliveira_rent_installments(id),
  amount numeric(12,2) not null check (amount > 0),
  created_by uuid not null references public.oliveira_profiles(id),
  created_at timestamptz not null default now(),
  unique (request_id, installment_id)
);

create table public.oliveira_settings (
  id smallint primary key default 1 check (id = 1),
  landlord_name text not null default '',
  landlord_tax_id text not null default '',
  payment_instructions text not null default '',
  jurisdiction text not null default 'Rio de Janeiro - RJ',
  updated_at timestamptz not null default now()
);
insert into public.oliveira_settings (id) values (1) on conflict do nothing;

create table public.oliveira_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create or replace function public.oliveira_is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and email_confirmed_at is not null
      and lower(email) = 'playtecno@outlook.com.br'
  );
$$;

create or replace function public.oliveira_handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.oliveira_profiles (id, email, full_name, phone, cpf_masked, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'cpf_masked', ''),
    case when lower(coalesce(new.email, '')) = 'playtecno@outlook.com.br' and new.email_confirmed_at is not null then 'admin'::public.oliveira_user_role else 'tenant'::public.oliveira_user_role end
  ) on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, phone = excluded.phone, cpf_masked = excluded.cpf_masked,
    role = case when lower(excluded.email) = 'playtecno@outlook.com.br' and new.email_confirmed_at is not null then 'admin'::public.oliveira_user_role else public.oliveira_profiles.role end;
  return new;
end;
$$;
drop trigger if exists oliveira_on_auth_user_created on auth.users;
create trigger oliveira_on_auth_user_created after insert or update of email_confirmed_at on auth.users for each row execute function public.oliveira_handle_new_user();

insert into public.oliveira_profiles (id, email, full_name, role)
select id, email, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), split_part(email, '@', 1)), 'admin'::public.oliveira_user_role
from auth.users
where lower(email) = 'playtecno@outlook.com.br' and email_confirmed_at is not null
on conflict (id) do update set email = excluded.email, role = 'admin', updated_at = now();

create or replace function public.oliveira_audit(action_name text, entity_name text, entity_identifier text, details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.oliveira_audit_log(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), action_name, entity_name, entity_identifier, coalesce(details, '{}'::jsonb));
end;
$$;

create or replace function public.oliveira_mark_overdue_installments()
returns void language sql security definer set search_path = public as $$
  update public.oliveira_rent_installments i
  set status = 'late',
      fine_amount = round(i.base_amount * t.late_fee_percent / 100, 2),
      interest_amount = round(i.base_amount * t.monthly_interest_percent / 100 * greatest(1, ceil((current_date - i.due_date)::numeric / 30)), 2)
  from public.oliveira_tenancies t
  where i.tenancy_id = t.id and i.due_date < current_date and i.status in ('upcoming', 'pending', 'rejected');
$$;

create or replace function public.oliveira_admin_create_tenancy(
  p_tenant_id uuid, p_property_id uuid, p_starts_on date, p_ends_on date,
  p_monthly_rent numeric, p_due_day integer, p_late_fee_percent numeric,
  p_monthly_interest_percent numeric, p_adjustment_index text, p_guarantee_type text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  tenancy_id uuid;
  month_cursor date;
  due_date_value date;
begin
  if not public.oliveira_is_admin() then raise exception 'Acesso negado'; end if;
  insert into public.oliveira_tenancies(tenant_id, property_id, starts_on, ends_on, monthly_rent, due_day, late_fee_percent, monthly_interest_percent, adjustment_index, guarantee_type, status)
  values (p_tenant_id, p_property_id, p_starts_on, p_ends_on, p_monthly_rent, p_due_day, p_late_fee_percent, p_monthly_interest_percent, p_adjustment_index, p_guarantee_type, 'active') returning id into tenancy_id;
  month_cursor := date_trunc('month', p_starts_on)::date;
  while month_cursor <= p_ends_on loop
    due_date_value := make_date(extract(year from month_cursor)::int, extract(month from month_cursor)::int, p_due_day);
    insert into public.oliveira_rent_installments(tenancy_id, reference_month, due_date, base_amount, status)
    values (tenancy_id, to_char(month_cursor, 'YYYY-MM'), due_date_value, p_monthly_rent, case when due_date_value <= current_date then 'pending' else 'upcoming' end);
    month_cursor := (month_cursor + interval '1 month')::date;
  end loop;
  perform public.oliveira_audit('tenancy.created', 'tenancy', tenancy_id::text, jsonb_build_object('tenant_id', p_tenant_id, 'property_id', p_property_id));
  return tenancy_id;
end;
$$;

create or replace function public.oliveira_admin_manual_payment(p_installment_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.oliveira_rent_installments
  set status = 'paid', paid_amount = p_amount, paid_at = now()
  where id = p_installment_id and status in ('pending', 'late', 'rejected', 'under_review');
  if not found then raise exception 'Parcela indisponivel para pagamento'; end if;
end;
$$;

create or replace function public.oliveira_admin_decide_receipt(p_receipt_id uuid, p_approved boolean, p_admin_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare receipt_row public.oliveira_payment_receipts%rowtype;
begin
  update public.oliveira_payment_receipts
  set status = case when p_approved then 'approved'::public.oliveira_receipt_status else 'rejected'::public.oliveira_receipt_status end,
      reviewed_by = p_admin_id, reviewed_at = now(), note = p_note
  where id = p_receipt_id and status = 'under_review'
  returning * into receipt_row;
  if receipt_row.id is null then raise exception 'Comprovante ja analisado ou inexistente'; end if;
  update public.oliveira_rent_installments
  set status = case when p_approved then 'paid'::public.oliveira_installment_status else 'rejected'::public.oliveira_installment_status end,
      paid_amount = case when p_approved then receipt_row.amount else paid_amount end,
      paid_at = case when p_approved then now() else paid_at end
  where id = receipt_row.installment_id;
  return jsonb_build_object('installment_id', receipt_row.installment_id, 'amount', receipt_row.amount);
end;
$$;

create or replace function public.oliveira_admin_maintenance_action(p_request_id uuid, p_action text, p_amount numeric, p_admin_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare request_row public.oliveira_maintenance_requests%rowtype;
declare installment_row public.oliveira_rent_installments%rowtype;
begin
  select * into request_row from public.oliveira_maintenance_requests where id = p_request_id for update;
  if request_row.id is null then raise exception 'Solicitacao nao encontrada'; end if;
  if p_action = 'authorize' then
    if p_amount is null or p_amount < 0 then raise exception 'Limite invalido'; end if;
    update public.oliveira_maintenance_requests set status = 'authorized', approved_limit = p_amount, owner_note = p_note, updated_at = now() where id = p_request_id;
  elsif p_action = 'reject' then
    update public.oliveira_maintenance_requests set status = 'rejected', owner_note = p_note, updated_at = now() where id = p_request_id;
  elsif p_action = 'credit' then
    if p_amount is null or p_amount <= 0 then raise exception 'Credito invalido'; end if;
    if request_row.approved_limit is not null and p_amount > request_row.approved_limit then raise exception 'Credito excede o limite autorizado'; end if;
    select * into installment_row from public.oliveira_rent_installments where tenancy_id = request_row.tenancy_id and status in ('upcoming','pending','late','rejected') order by due_date limit 1 for update;
    if installment_row.id is null then raise exception 'Nenhuma parcela disponivel'; end if;
    insert into public.oliveira_maintenance_credits(request_id, installment_id, amount, created_by) values (p_request_id, installment_row.id, p_amount, p_admin_id);
    update public.oliveira_rent_installments set credit_amount = credit_amount + p_amount where id = installment_row.id;
    update public.oliveira_maintenance_requests set status = 'credited', approved_credit = p_amount, owner_note = p_note, updated_at = now() where id = p_request_id;
    return jsonb_build_object('installment_id', installment_row.id, 'amount', p_amount);
  else raise exception 'Acao invalida';
  end if;
  return '{}'::jsonb;
end;
$$;

alter table public.oliveira_profiles enable row level security;
alter table public.oliveira_properties enable row level security;
alter table public.oliveira_property_media enable row level security;
alter table public.oliveira_tenancies enable row level security;
alter table public.oliveira_contracts enable row level security;
alter table public.oliveira_contract_signatures enable row level security;
alter table public.oliveira_rent_installments enable row level security;
alter table public.oliveira_payment_receipts enable row level security;
alter table public.oliveira_maintenance_requests enable row level security;
alter table public.oliveira_maintenance_credits enable row level security;
alter table public.oliveira_settings enable row level security;
alter table public.oliveira_audit_log enable row level security;

create policy oliveira_profiles_select on public.oliveira_profiles for select using (id = auth.uid() or public.oliveira_is_admin());
create policy oliveira_profiles_admin_write on public.oliveira_profiles for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_properties_public_read on public.oliveira_properties for select using (active or public.oliveira_is_admin());
create policy oliveira_properties_admin_write on public.oliveira_properties for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_media_public_read on public.oliveira_property_media for select using (true);
create policy oliveira_media_admin_write on public.oliveira_property_media for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_tenancies_access on public.oliveira_tenancies for select using (tenant_id = auth.uid() or public.oliveira_is_admin());
create policy oliveira_tenancies_admin_write on public.oliveira_tenancies for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_contracts_access on public.oliveira_contracts for select using (public.oliveira_is_admin() or exists(select 1 from public.oliveira_tenancies t where t.id = tenancy_id and t.tenant_id = auth.uid()));
create policy oliveira_contracts_admin_write on public.oliveira_contracts for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_signatures_access on public.oliveira_contract_signatures for select using (signer_id = auth.uid() or public.oliveira_is_admin());
create policy oliveira_installments_access on public.oliveira_rent_installments for select using (public.oliveira_is_admin() or exists(select 1 from public.oliveira_tenancies t where t.id = tenancy_id and t.tenant_id = auth.uid()));
create policy oliveira_installments_admin_write on public.oliveira_rent_installments for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_receipts_access on public.oliveira_payment_receipts for select using (tenant_id = auth.uid() or public.oliveira_is_admin());
create policy oliveira_receipts_tenant_insert on public.oliveira_payment_receipts for insert with check (tenant_id = auth.uid() and exists(select 1 from public.oliveira_rent_installments i join public.oliveira_tenancies t on t.id = i.tenancy_id where i.id = installment_id and t.tenant_id = auth.uid()));
create policy oliveira_receipts_admin_write on public.oliveira_payment_receipts for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_maintenance_access on public.oliveira_maintenance_requests for select using (tenant_id = auth.uid() or public.oliveira_is_admin());
create policy oliveira_maintenance_tenant_insert on public.oliveira_maintenance_requests for insert with check (tenant_id = auth.uid() and exists(select 1 from public.oliveira_tenancies t where t.id = tenancy_id and t.tenant_id = auth.uid()));
create policy oliveira_maintenance_admin_write on public.oliveira_maintenance_requests for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_credits_access on public.oliveira_maintenance_credits for select using (public.oliveira_is_admin() or exists(select 1 from public.oliveira_rent_installments i join public.oliveira_tenancies t on t.id = i.tenancy_id where i.id = installment_id and t.tenant_id = auth.uid()));
create policy oliveira_credits_admin_write on public.oliveira_maintenance_credits for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_settings_authenticated_read on public.oliveira_settings for select using (auth.uid() is not null);
create policy oliveira_settings_admin_write on public.oliveira_settings for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());
create policy oliveira_audit_admin_read on public.oliveira_audit_log for select using (public.oliveira_is_admin());

insert into storage.buckets (id, name, public) values ('oliveira-property-media', 'oliveira-property-media', true) on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('oliveira-private-documents', 'oliveira-private-documents', false) on conflict (id) do update set public = false;
create policy oliveira_property_media_public_storage_read on storage.objects for select using (bucket_id = 'oliveira-property-media');
create policy oliveira_property_media_admin_storage_write on storage.objects for all using (bucket_id = 'oliveira-property-media' and public.oliveira_is_admin()) with check (bucket_id = 'oliveira-property-media' and public.oliveira_is_admin());
create policy oliveira_private_storage_read on storage.objects for select using (bucket_id = 'oliveira-private-documents' and (public.oliveira_is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy oliveira_private_storage_tenant_insert on storage.objects for insert with check (bucket_id = 'oliveira-private-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.oliveira_is_admin()));
create policy oliveira_private_storage_admin_write on storage.objects for all using (bucket_id = 'oliveira-private-documents' and public.oliveira_is_admin()) with check (bucket_id = 'oliveira-private-documents' and public.oliveira_is_admin());

grant execute on function public.oliveira_is_admin() to authenticated, anon;
grant execute on function public.oliveira_admin_create_tenancy(uuid,uuid,date,date,numeric,integer,numeric,numeric,text,text) to authenticated;
revoke all on function public.oliveira_audit(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.oliveira_mark_overdue_installments() from public, anon, authenticated;
revoke all on function public.oliveira_admin_manual_payment(uuid,numeric) from public, anon, authenticated;
revoke all on function public.oliveira_admin_decide_receipt(uuid,boolean,uuid,text) from public, anon, authenticated;
revoke all on function public.oliveira_admin_maintenance_action(uuid,text,numeric,uuid,text) from public, anon, authenticated;
grant execute on function public.oliveira_admin_manual_payment(uuid,numeric) to service_role;
grant execute on function public.oliveira_admin_decide_receipt(uuid,boolean,uuid,text) to service_role;
grant execute on function public.oliveira_admin_maintenance_action(uuid,text,numeric,uuid,text) to service_role;
