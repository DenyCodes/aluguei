-- Imobiliaria Oliveira - transactional email automation isolated in the shared project.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.oliveira_settings
  add column if not exists email_enabled boolean not null default true,
  add column if not exists rent_due_email_enabled boolean not null default true,
  add column if not exists email_from_name text not null default 'Imobiliária Oliveira',
  add column if not exists email_from_address text not null default 'noreply@contato.playtecno.com.br',
  add column if not exists email_reply_to text not null default 'playtecno@outlook.com.br',
  add column if not exists email_admin_copy text not null default 'playtecno@outlook.com.br',
  add column if not exists email_send_hour smallint not null default 8,
  add column if not exists email_timezone text not null default 'America/Sao_Paulo';

alter table public.oliveira_settings drop constraint if exists oliveira_settings_email_send_hour_check;
alter table public.oliveira_settings add constraint oliveira_settings_email_send_hour_check check (email_send_hour between 0 and 23);

create table if not exists public.oliveira_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('rent_due','contract_issued','contract_signed','tenant_invite','password_recovery','signature_otp','test')),
  recipient_email text not null,
  subject text not null,
  entity_type text not null,
  entity_id text,
  tenancy_id uuid references public.oliveira_tenancies(id) on delete set null,
  contract_id uuid references public.oliveira_contracts(id) on delete set null,
  installment_id uuid references public.oliveira_rent_installments(id) on delete set null,
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  template_data jsonb not null default '{}'::jsonb,
  error_message text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oliveira_email_deliveries_created_idx on public.oliveira_email_deliveries(created_at desc);
create index if not exists oliveira_email_deliveries_status_idx on public.oliveira_email_deliveries(status, created_at);
create index if not exists oliveira_email_deliveries_installment_idx on public.oliveira_email_deliveries(installment_id) where installment_id is not null;

create table if not exists public.oliveira_signature_otps (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.oliveira_contracts(id) on delete cascade,
  signer_id uuid not null references public.oliveira_profiles(id) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists oliveira_signature_otps_one_active
  on public.oliveira_signature_otps(contract_id)
  where consumed_at is null;
create index if not exists oliveira_signature_otps_signer_idx on public.oliveira_signature_otps(signer_id, created_at desc);

alter table public.oliveira_email_deliveries enable row level security;
alter table public.oliveira_signature_otps enable row level security;

create policy oliveira_email_deliveries_admin_read on public.oliveira_email_deliveries
  for select using (public.oliveira_is_admin());
create policy oliveira_email_deliveries_admin_write on public.oliveira_email_deliveries
  for all using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());

create or replace function public.oliveira_consume_signature_otp(
  p_contract_id uuid,
  p_signer_id uuid,
  p_code_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  otp_row public.oliveira_signature_otps%rowtype;
begin
  select * into otp_row
  from public.oliveira_signature_otps
  where contract_id = p_contract_id and signer_id = p_signer_id and consumed_at is null
  for update;

  if otp_row.id is null then
    return jsonb_build_object('valid', false, 'reason', 'missing');
  end if;
  if otp_row.expires_at <= now() then
    update public.oliveira_signature_otps set consumed_at = now() where id = otp_row.id;
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if otp_row.attempts >= 5 then
    update public.oliveira_signature_otps set consumed_at = now() where id = otp_row.id;
    return jsonb_build_object('valid', false, 'reason', 'blocked');
  end if;
  if otp_row.code_hash <> p_code_hash then
    update public.oliveira_signature_otps
      set attempts = attempts + 1,
          consumed_at = case when attempts + 1 >= 5 then now() else consumed_at end
    where id = otp_row.id;
    return jsonb_build_object('valid', false, 'reason', 'invalid', 'attempts', otp_row.attempts + 1);
  end if;

  update public.oliveira_signature_otps set consumed_at = now() where id = otp_row.id;
  return jsonb_build_object('valid', true, 'otp_id', otp_row.id);
end;
$$;

revoke all on function public.oliveira_consume_signature_otp(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.oliveira_consume_signature_otp(uuid,uuid,text) to service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'oliveira_project_url') then
    perform vault.create_secret('https://fyiocriendicwfpbqfhz.supabase.co', 'oliveira_project_url', 'Project URL used by Oliveira cron');
  end if;
  if not exists (select 1 from vault.secrets where name = 'oliveira_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'oliveira_cron_secret', 'Secret generated for Oliveira rent reminder cron');
  end if;
end
$$;

create or replace function public.oliveira_validate_cron_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'oliveira_cron_secret'
      and decrypted_secret = p_secret
  );
$$;

revoke all on function public.oliveira_validate_cron_secret(text) from public, anon, authenticated;
grant execute on function public.oliveira_validate_cron_secret(text) to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'oliveira-rent-due-0800-sao-paulo';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'oliveira-rent-due-0800-sao-paulo',
    '0 11 * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'oliveira_project_url') || '/functions/v1/oliveira-rent-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-oliveira-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'oliveira_cron_secret')
        ),
        body := jsonb_build_object('source', 'supabase-cron'),
        timeout_milliseconds := 15000
      );
    $cron$
  );
end
$$;
