-- Imobiliaria Oliveira - billing Asaas isolado, inicialmente desativado.
-- Nenhuma linha existente gera cobranca automaticamente nesta migracao.

alter table public.oliveira_settings
  add column if not exists billing_enabled boolean not null default false,
  add column if not exists automatic_creation_enabled boolean not null default false,
  add column if not exists billing_started_at timestamptz;

alter table public.oliveira_rent_installments
  add column if not exists principal_paid_at timestamptz,
  add column if not exists settled_at timestamptz,
  add column if not exists payment_source text;

do $$ begin
  alter table public.oliveira_rent_installments
    add constraint oliveira_rent_installments_payment_source_check
    check (payment_source is null or payment_source in ('asaas','manual','receipt'));
exception when duplicate_object then null; end $$;

create table if not exists public.oliveira_asaas_integration (
  id smallint primary key default 1 check (id = 1),
  environment text not null default 'unconfigured'
    check (environment in ('unconfigured','sandbox','production')),
  account_id text,
  pix_automatic_eligibility text not null default 'unknown'
    check (pix_automatic_eligibility in ('unknown','eligible','ineligible')),
  pix_automatic_ineligible_reasons jsonb not null default '[]'::jsonb,
  webhook_id text,
  webhook_url text,
  webhook_configured_at timestamptz,
  last_webhook_at timestamptz,
  last_eligibility_event_at timestamptz,
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.oliveira_asaas_integration(id) values (1) on conflict (id) do nothing;

create table if not exists public.oliveira_asaas_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.oliveira_profiles(id),
  provider_customer_id text not null unique,
  external_reference text not null unique,
  document_hash text not null,
  document_last4 text not null check (length(document_last4) = 4),
  status text not null default 'active' check (status in ('active','deleted','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oliveira_billing_agreements (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.oliveira_tenancies(id),
  tenant_id uuid not null references public.oliveira_profiles(id),
  asaas_customer_id uuid references public.oliveira_asaas_customers(id),
  method text not null check (method in ('pix_automatic','credit_card_subscription')),
  status text not null default 'setup_pending'
    check (status in ('setup_pending','awaiting_authorization','active','fallback_required','cancelled','expired','failed')),
  external_reference text not null unique,
  provider_authorization_id text,
  provider_subscription_id text,
  provider_checkout_id text,
  provider_status text,
  starts_on date not null,
  ends_on date,
  fallback_reason text,
  consent_at timestamptz not null,
  consent_version text not null,
  consent_method text not null check (consent_method in ('tenant_web')),
  activated_at timestamptz,
  cancelled_at timestamptz,
  last_event_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists oliveira_billing_agreements_authorization_uidx
  on public.oliveira_billing_agreements(provider_authorization_id)
  where provider_authorization_id is not null;
create unique index if not exists oliveira_billing_agreements_subscription_uidx
  on public.oliveira_billing_agreements(provider_subscription_id)
  where provider_subscription_id is not null;
create unique index if not exists oliveira_billing_agreements_checkout_uidx
  on public.oliveira_billing_agreements(provider_checkout_id)
  where provider_checkout_id is not null;
create unique index if not exists oliveira_billing_agreements_one_live_idx
  on public.oliveira_billing_agreements(tenancy_id)
  where status in ('setup_pending','awaiting_authorization','active');

create table if not exists public.oliveira_billing_charges (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid references public.oliveira_rent_installments(id),
  agreement_id uuid references public.oliveira_billing_agreements(id),
  tenancy_id uuid not null references public.oliveira_tenancies(id),
  tenant_id uuid not null references public.oliveira_profiles(id),
  kind text not null check (kind in ('rent_principal','late_adjustment')),
  method text not null check (method in ('pix_automatic','credit_card','pix','manual')),
  status text not null default 'draft'
    check (status in ('draft','creating','pending','scheduled','confirmed','received','overdue','refused','cancelled','refunded','chargeback','manual_review')),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  external_reference text not null unique,
  provider_payment_id text,
  provider_checkout_id text,
  provider_instruction_id text,
  provider_status text,
  invoice_url text,
  pix_qr_payload text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  last_event_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists oliveira_billing_charges_payment_uidx
  on public.oliveira_billing_charges(provider_payment_id)
  where provider_payment_id is not null;
create unique index if not exists oliveira_billing_charges_checkout_uidx
  on public.oliveira_billing_charges(provider_checkout_id)
  where provider_checkout_id is not null;
create unique index if not exists oliveira_billing_charges_instruction_uidx
  on public.oliveira_billing_charges(provider_instruction_id)
  where provider_instruction_id is not null;
create unique index if not exists oliveira_billing_charges_one_live_principal_idx
  on public.oliveira_billing_charges(installment_id)
  where kind = 'rent_principal'
    and status not in ('refused','cancelled','refunded','chargeback');
create unique index if not exists oliveira_billing_charges_one_live_late_idx
  on public.oliveira_billing_charges(installment_id)
  where kind = 'late_adjustment'
    and status not in ('refused','cancelled','refunded','chargeback');
create index if not exists oliveira_billing_charges_status_due_idx
  on public.oliveira_billing_charges(status,due_date);

-- Compatibilidade com o fluxo manual existente: historico pago e novas baixas
-- manuais continuam liquidados, sem criar qualquer cobranca no Asaas.
update public.oliveira_rent_installments
set principal_paid_at = coalesce(principal_paid_at, paid_at),
    settled_at = coalesce(settled_at, paid_at),
    payment_source = coalesce(payment_source, 'manual')
where status = 'paid' and paid_at is not null;

create or replace function public.oliveira_admin_manual_payment(
  p_installment_id uuid,
  p_amount numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p_tenancy_id uuid;
begin
  select tenancy_id into p_tenancy_id
  from public.oliveira_rent_installments where id = p_installment_id for update;
  if p_tenancy_id is null then raise exception 'Parcela inexistente'; end if;
  if exists (
    select 1 from public.oliveira_billing_charges
    where installment_id = p_installment_id and kind = 'rent_principal'
      and status in ('creating','pending','scheduled','confirmed','overdue','manual_review')
  ) or exists (
    select 1 from public.oliveira_billing_agreements
    where tenancy_id = p_tenancy_id
      and status in ('setup_pending','awaiting_authorization','active')
  ) then
    raise exception 'Cancele a cobranca e o acordo recorrente antes da baixa manual';
  end if;
  update public.oliveira_rent_installments
  set status = 'paid', paid_amount = p_amount, paid_at = now(),
      principal_paid_at = now(), settled_at = now(), payment_source = 'manual'
  where id = p_installment_id and status in ('pending','late','rejected','under_review');
  if not found then raise exception 'Parcela indisponivel para pagamento'; end if;
end;
$$;

create or replace function public.oliveira_admin_decide_receipt(
  p_receipt_id uuid,
  p_approved boolean,
  p_admin_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_row public.oliveira_payment_receipts%rowtype;
  p_tenancy_id uuid;
begin
  select i.tenancy_id into p_tenancy_id
  from public.oliveira_payment_receipts r
  join public.oliveira_rent_installments i on i.id = r.installment_id
  where r.id = p_receipt_id;
  if p_approved and (
    exists (
      select 1 from public.oliveira_billing_charges c
      join public.oliveira_payment_receipts r on r.installment_id = c.installment_id
      where r.id = p_receipt_id and c.kind = 'rent_principal'
        and c.status in ('creating','pending','scheduled','confirmed','overdue','manual_review')
    ) or exists (
      select 1 from public.oliveira_billing_agreements
      where tenancy_id = p_tenancy_id
        and status in ('setup_pending','awaiting_authorization','active')
    )
  ) then
    raise exception 'Cancele a cobranca e o acordo recorrente antes de aprovar o comprovante';
  end if;
  update public.oliveira_payment_receipts
  set status = case when p_approved then 'approved'::public.oliveira_receipt_status else 'rejected'::public.oliveira_receipt_status end,
      reviewed_by = p_admin_id, reviewed_at = now(), note = p_note
  where id = p_receipt_id and status = 'under_review'
  returning * into receipt_row;
  if receipt_row.id is null then raise exception 'Comprovante ja analisado ou inexistente'; end if;
  update public.oliveira_rent_installments
  set status = case when p_approved then 'paid'::public.oliveira_installment_status else 'rejected'::public.oliveira_installment_status end,
      paid_amount = case when p_approved then receipt_row.amount else paid_amount end,
      paid_at = case when p_approved then now() else paid_at end,
      principal_paid_at = case when p_approved then now() else principal_paid_at end,
      settled_at = case when p_approved then now() else settled_at end,
      payment_source = case when p_approved then 'receipt' else payment_source end
  where id = receipt_row.installment_id;
  return jsonb_build_object('installment_id', receipt_row.installment_id, 'amount', receipt_row.amount);
end;
$$;

create table if not exists public.oliveira_billing_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  operation_type text not null
    check (operation_type in ('create_customer','create_authorization','create_checkout','create_payment','cancel_payment','cancel_agreement','update_payment')),
  agreement_id uuid references public.oliveira_billing_agreements(id),
  charge_id uuid references public.oliveira_billing_charges(id),
  status text not null default 'pending'
    check (status in ('pending','running','succeeded','retryable_failed','permanent_failed','unknown')),
  request_payload jsonb not null default '{}'::jsonb,
  provider_resource_id text,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists oliveira_billing_operations_retry_idx
  on public.oliveira_billing_operations(status,next_attempt_at,created_at);

create table if not exists public.oliveira_asaas_webhook_events (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  event_type text not null,
  account_id text,
  resource_kind text,
  resource_id text,
  external_reference text,
  is_oliveira boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','processed','ignored','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  provider_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists oliveira_asaas_webhook_events_queue_idx
  on public.oliveira_asaas_webhook_events(status,received_at)
  where is_oliveira;

create table if not exists public.oliveira_billing_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.oliveira_profiles(id),
  status text not null default 'running' check (status in ('running','completed','failed')),
  inspected_count integer not null default 0,
  repaired_count integer not null default 0,
  divergence_count integer not null default 0,
  findings jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.oliveira_rent_receipts
  drop constraint if exists oliveira_rent_receipts_installment_id_key;
alter table public.oliveira_rent_receipts
  alter column issued_by drop not null;
alter table public.oliveira_rent_receipts
  add column if not exists billing_charge_id uuid references public.oliveira_billing_charges(id),
  add column if not exists source text not null default 'manual',
  add column if not exists status text not null default 'active',
  add column if not exists provider_payment_id text,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;
do $$ begin
  alter table public.oliveira_rent_receipts
    add constraint oliveira_rent_receipts_source_check check (source in ('manual','asaas'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.oliveira_rent_receipts
    add constraint oliveira_rent_receipts_status_check check (status in ('active','voided'));
exception when duplicate_object then null; end $$;
create unique index if not exists oliveira_rent_receipts_charge_uidx
  on public.oliveira_rent_receipts(billing_charge_id)
  where billing_charge_id is not null;
create unique index if not exists oliveira_rent_receipts_provider_payment_uidx
  on public.oliveira_rent_receipts(provider_payment_id)
  where provider_payment_id is not null;

alter table public.oliveira_email_deliveries
  drop constraint if exists oliveira_email_deliveries_event_type_check;
alter table public.oliveira_email_deliveries
  add constraint oliveira_email_deliveries_event_type_check check (
    event_type in (
      'rent_due','contract_issued','contract_signed','tenant_invite',
      'password_recovery','signature_otp','test','payment_setup',
      'payment_available','payment_confirmed','payment_failed',
      'pix_authorization','late_adjustment_due','payment_reversed'
    )
  );

create or replace function public.oliveira_billing_calculate_late_adjustment(
  p_installment_id uuid,
  p_paid_at timestamptz default now()
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  installment_row public.oliveira_rent_installments%rowtype;
  tenancy_row public.oliveira_tenancies%rowtype;
  days_late integer;
  interest_periods integer;
begin
  select * into installment_row from public.oliveira_rent_installments where id = p_installment_id;
  if installment_row.id is null then raise exception 'Parcela nao encontrada'; end if;
  select * into tenancy_row from public.oliveira_tenancies where id = installment_row.tenancy_id;
  days_late := (p_paid_at at time zone 'America/Sao_Paulo')::date - installment_row.due_date;
  if days_late <= 0 then return 0; end if;
  interest_periods := greatest(1, ceil(days_late::numeric / 30)::integer);
  return round(
    installment_row.base_amount * tenancy_row.late_fee_percent / 100 +
    installment_row.base_amount * tenancy_row.monthly_interest_percent / 100 * interest_periods,
    2
  );
end;
$$;
revoke all on function public.oliveira_billing_calculate_late_adjustment(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.oliveira_billing_calculate_late_adjustment(uuid,timestamptz) to service_role;

create or replace view public.oliveira_installment_financial_summary
with (security_invoker = true)
as
select
  i.*,
  case
    when i.status = 'cancelled' then 'cancelled'
    when exists (
      select 1 from public.oliveira_billing_charges c
      where c.installment_id = i.id and c.status in ('refunded','chargeback','manual_review')
    ) then 'manual_review'
    when i.settled_at is not null then 'settled'
    when i.principal_paid_at is not null and exists (
      select 1 from public.oliveira_billing_charges c
      where c.installment_id = i.id and c.kind = 'late_adjustment'
        and c.status not in ('confirmed','received','cancelled')
    ) then 'principal_paid_fees_due'
    when i.due_date > current_date then 'not_due'
    else 'principal_pending'
  end as financial_status
from public.oliveira_rent_installments i;

alter table public.oliveira_asaas_integration enable row level security;
alter table public.oliveira_asaas_customers enable row level security;
alter table public.oliveira_billing_agreements enable row level security;
alter table public.oliveira_billing_charges enable row level security;
alter table public.oliveira_billing_operations enable row level security;
alter table public.oliveira_asaas_webhook_events enable row level security;
alter table public.oliveira_billing_reconciliation_runs enable row level security;

create policy oliveira_asaas_integration_admin_read on public.oliveira_asaas_integration
  for select using (public.oliveira_is_admin());
create policy oliveira_asaas_customers_access on public.oliveira_asaas_customers
  for select using (tenant_id = auth.uid() or public.oliveira_is_admin());
create policy oliveira_billing_agreements_access on public.oliveira_billing_agreements
  for select using (tenant_id = auth.uid() or public.oliveira_is_admin());
create policy oliveira_billing_charges_access on public.oliveira_billing_charges
  for select using (tenant_id = auth.uid() or public.oliveira_is_admin());
create policy oliveira_billing_operations_admin_read on public.oliveira_billing_operations
  for select using (public.oliveira_is_admin());
create policy oliveira_asaas_events_admin_read on public.oliveira_asaas_webhook_events
  for select using (public.oliveira_is_admin());
create policy oliveira_billing_reconciliation_admin_read on public.oliveira_billing_reconciliation_runs
  for select using (public.oliveira_is_admin());

revoke all on public.oliveira_asaas_integration, public.oliveira_asaas_customers,
  public.oliveira_billing_agreements, public.oliveira_billing_charges,
  public.oliveira_billing_operations, public.oliveira_asaas_webhook_events,
  public.oliveira_billing_reconciliation_runs from anon;
grant select on public.oliveira_asaas_integration, public.oliveira_asaas_customers,
  public.oliveira_billing_agreements, public.oliveira_billing_charges,
  public.oliveira_billing_operations, public.oliveira_asaas_webhook_events,
  public.oliveira_billing_reconciliation_runs,
  public.oliveira_installment_financial_summary to authenticated;
