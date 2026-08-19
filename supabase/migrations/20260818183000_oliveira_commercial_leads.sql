-- Pedidos comerciais da pagina publica do sistema.
-- O projeto Supabase e compartilhado; todos os objetos permanecem isolados
-- pelo prefixo Oliveira e nenhuma escrita publica e concedida diretamente.

create table if not exists public.oliveira_commercial_leads (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  contact_hash text not null,
  full_name text not null,
  email text not null,
  phone_digits text not null,
  status text not null default 'new',
  source_path text not null default '/sistema',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  consent_at timestamptz not null,
  internal_note text not null default '',
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid references public.oliveira_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oliveira_commercial_leads_name_length
    check (char_length(full_name) between 2 and 100),
  constraint oliveira_commercial_leads_email_length
    check (char_length(email) between 3 and 254 and email = lower(trim(email))),
  constraint oliveira_commercial_leads_phone_digits
    check (phone_digits ~ '^[0-9]{10,15}$'),
  constraint oliveira_commercial_leads_status
    check (status in ('new','contacted','qualified','converted','archived')),
  constraint oliveira_commercial_leads_source_length
    check (char_length(source_path) between 1 and 120),
  constraint oliveira_commercial_leads_note_length
    check (char_length(internal_note) <= 2000),
  constraint oliveira_commercial_leads_utm_lengths
    check (
      char_length(coalesce(utm_source, '')) <= 100
      and char_length(coalesce(utm_medium, '')) <= 100
      and char_length(coalesce(utm_campaign, '')) <= 100
    )
);

create index if not exists oliveira_commercial_leads_status_created_idx
  on public.oliveira_commercial_leads(status, created_at desc);
create index if not exists oliveira_commercial_leads_contact_created_idx
  on public.oliveira_commercial_leads(contact_hash, created_at desc);
create index if not exists oliveira_commercial_leads_email_idx
  on public.oliveira_commercial_leads(email);

-- Apenas hashes HMAC temporarios sao guardados para limitar abuso; IP e
-- user-agent brutos nao sao persistidos nessa tabela.
create table if not exists public.oliveira_commercial_lead_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists oliveira_commercial_lead_rate_limits_expiry_idx
  on public.oliveira_commercial_lead_rate_limits(expires_at);

create or replace function public.oliveira_consume_commercial_lead_rate_limit(
  p_key_hash text,
  p_limit integer default 5,
  p_window_seconds integer default 1800
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rate_row public.oliveira_commercial_lead_rate_limits%rowtype;
  window_interval interval;
begin
  if nullif(trim(p_key_hash), '') is null then
    raise exception 'Chave de limite obrigatoria';
  end if;
  if p_limit not between 1 and 50 or p_window_seconds not between 60 and 86400 then
    raise exception 'Configuracao de limite invalida';
  end if;

  window_interval := make_interval(secs => p_window_seconds);

  insert into public.oliveira_commercial_lead_rate_limits (
    key_hash,
    window_started_at,
    attempts,
    expires_at,
    updated_at
  ) values (
    p_key_hash,
    now(),
    1,
    now() + window_interval,
    now()
  )
  on conflict (key_hash) do update set
    window_started_at = case
      when public.oliveira_commercial_lead_rate_limits.expires_at <= now()
        then now()
      else public.oliveira_commercial_lead_rate_limits.window_started_at
    end,
    attempts = case
      when public.oliveira_commercial_lead_rate_limits.expires_at <= now()
        then 1
      else public.oliveira_commercial_lead_rate_limits.attempts + 1
    end,
    expires_at = case
      when public.oliveira_commercial_lead_rate_limits.expires_at <= now()
        then now() + window_interval
      else public.oliveira_commercial_lead_rate_limits.expires_at
    end,
    updated_at = now()
  returning * into rate_row;

  return jsonb_build_object(
    'allowed', rate_row.attempts <= p_limit,
    'attempts', rate_row.attempts,
    'retry_after', greatest(0, extract(epoch from (rate_row.expires_at - now()))::integer)
  );
end;
$$;

alter table public.oliveira_commercial_leads enable row level security;
alter table public.oliveira_commercial_lead_rate_limits enable row level security;

drop policy if exists oliveira_commercial_leads_admin_read
  on public.oliveira_commercial_leads;

revoke all on table public.oliveira_commercial_leads
  from public, anon, authenticated;

-- A leitura administrativa passa somente por esta projeção sanitizada. Os
-- identificadores de idempotência e antispam nunca chegam ao navegador.
create or replace function public.oliveira_list_commercial_leads()
returns table (
  id uuid,
  full_name text,
  email text,
  phone_digits text,
  status text,
  source_path text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  consent_at timestamptz,
  internal_note text,
  status_changed_at timestamptz,
  status_changed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.oliveira_is_admin() then
    raise exception using errcode = '42501', message = 'Acesso negado';
  end if;

  return query
  select
    lead.id,
    lead.full_name,
    lead.email,
    lead.phone_digits,
    lead.status,
    lead.source_path,
    lead.utm_source,
    lead.utm_medium,
    lead.utm_campaign,
    lead.consent_at,
    lead.internal_note,
    lead.status_changed_at,
    lead.status_changed_by,
    lead.created_at,
    lead.updated_at
  from public.oliveira_commercial_leads as lead
  order by lead.created_at desc
  limit 500;
end;
$$;

revoke all on function public.oliveira_list_commercial_leads()
  from public, anon, authenticated;
grant execute on function public.oliveira_list_commercial_leads()
  to authenticated;

revoke all on table public.oliveira_commercial_lead_rate_limits
  from public, anon, authenticated;
revoke all on function public.oliveira_consume_commercial_lead_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.oliveira_consume_commercial_lead_rate_limit(text, integer, integer)
  to service_role;

alter table public.oliveira_email_deliveries
  drop constraint if exists oliveira_email_deliveries_event_type_check;
alter table public.oliveira_email_deliveries
  add constraint oliveira_email_deliveries_event_type_check
  check (event_type in (
    'rent_due',
    'contract_issued',
    'contract_signed',
    'tenant_invite',
    'password_recovery',
    'signature_otp',
    'commercial_lead_confirmation',
    'commercial_lead_admin',
    'payment_setup',
    'payment_available',
    'payment_due',
    'payment_confirmed',
    'payment_failed',
    'pix_authorization',
    'late_adjustment_due',
    'payment_reversed',
    'test'
  ));
