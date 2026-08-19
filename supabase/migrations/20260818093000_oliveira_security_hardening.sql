-- Imobiliaria Oliveira - hardening aditivo, sem apagar ou reescrever historico.
begin;

-- Somente associacoes criadas no servidor podem abrir o portal Oliveira.
create or replace function public.oliveira_is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.oliveira_profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.deleted_at is null
  );
$$;

revoke all on function public.oliveira_is_active_member() from public, anon;
grant execute on function public.oliveira_is_active_member() to authenticated, service_role;

create or replace function public.oliveira_is_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.oliveira_admin_accounts a on a.email = lower(u.email)
    join public.oliveira_profiles p on p.id = u.id
    where u.id = p_user_id
      and u.email_confirmed_at is not null
      and a.active
      and p.role = 'admin'
      and p.account_status = 'active'
      and p.deleted_at is null
  );
$$;

revoke all on function public.oliveira_is_admin_user(uuid) from public, anon, authenticated;
grant execute on function public.oliveira_is_admin_user(uuid) to service_role;

-- O metadata do Auth deixa de ser uma autorizacao de entrada no produto. Convites
-- server-side criam o perfil; o trigger apenas sincroniza membros ja existentes ou admins allowlisted.
create or replace function public.oliveira_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  is_admin boolean;
  is_member boolean;
begin
  is_admin := exists (
    select 1 from public.oliveira_admin_accounts a
    where a.email = lower(coalesce(new.email, '')) and a.active
  );
  is_member := exists (
    select 1 from public.oliveira_profiles p where p.id = new.id
  );

  if not is_admin and not is_member then return new; end if;

  insert into public.oliveira_profiles (id, email, full_name, phone, cpf_masked, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'cpf_masked', ''),
    case when is_admin then 'admin'::public.oliveira_user_role else 'tenant'::public.oliveira_user_role end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.oliveira_profiles.full_name),
    phone = coalesce(excluded.phone, public.oliveira_profiles.phone),
    cpf_masked = coalesce(excluded.cpf_masked, public.oliveira_profiles.cpf_masked),
    role = case when is_admin then 'admin'::public.oliveira_user_role else public.oliveira_profiles.role end,
    updated_at = now();
  return new;
end;
$$;

-- A interface legada permanece apenas como definicao compativel, mas sem permissao de chamada.
-- A nova definicao tambem elimina o erro de enum apontado pelo lint remoto.
create or replace function public.oliveira_admin_create_tenancy(
  p_tenant_id uuid, p_property_id uuid, p_starts_on date, p_ends_on date,
  p_monthly_rent numeric, p_due_day integer, p_late_fee_percent numeric,
  p_monthly_interest_percent numeric, p_adjustment_index text, p_guarantee_type text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.oliveira_is_admin() then raise exception 'Acesso negado'; end if;
  result := public.oliveira_admin_create_tenancy_v2(
    auth.uid(), p_tenant_id, p_property_id, p_starts_on, p_ends_on,
    p_monthly_rent, p_due_day, p_late_fee_percent,
    p_monthly_interest_percent, p_adjustment_index, p_guarantee_type
  );
  return (result ->> 'tenancy_id')::uuid;
end;
$$;

revoke all on function public.oliveira_admin_create_tenancy(uuid,uuid,date,date,numeric,integer,numeric,numeric,text,text)
  from public, anon, authenticated, service_role;

-- Inquilinos recebem somente a instrucao de pagamento e apenas enquanto possuem vinculo operacional.
create or replace function public.oliveira_my_payment_instructions()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result text;
begin
  if not public.oliveira_is_active_member() or not exists (
    select 1
    from public.oliveira_tenancies t
    where t.tenant_id = auth.uid()
      and t.deleted_at is null
      and t.status in ('draft', 'active')
  ) then
    raise exception using errcode = '42501', message = 'Acesso negado';
  end if;
  select s.payment_instructions into result
  from public.oliveira_settings s where s.id = 1;
  return coalesce(result, '');
end;
$$;

revoke all on function public.oliveira_my_payment_instructions() from public, anon;
grant execute on function public.oliveira_my_payment_instructions() to authenticated;

-- Novos envios guardam somente o estado operacional do provedor. O conteudo
-- historico de template_data nao e reescrito nem apagado.
alter table public.oliveira_email_deliveries
  add column if not exists operational_status text,
  add column if not exists svix_id text,
  add column if not exists last_provider_event_at timestamptz;

alter table public.oliveira_email_deliveries
  drop constraint if exists oliveira_email_deliveries_operational_status_check;
alter table public.oliveira_email_deliveries
  add constraint oliveira_email_deliveries_operational_status_check
  check (
    operational_status is null
    or operational_status in (
      'queued', 'sending', 'sent', 'delivered', 'delivery_delayed',
      'bounced', 'complained', 'failed', 'suppressed'
    )
  );

-- O historico bruto continua intacto e service-only. O painel recebe um resumo sem template_data.
create or replace function public.oliveira_list_email_delivery_summaries(p_limit integer default 500)
returns table (
  id uuid,
  event_type text,
  recipient_email text,
  subject text,
  entity_type text,
  entity_id text,
  status text,
  operational_status text,
  attempts integer,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.oliveira_is_admin() then
    raise exception using errcode = '42501', message = 'Acesso administrativo negado';
  end if;
  return query
  select
    d.id,
    d.event_type,
    d.recipient_email,
    d.subject,
    d.entity_type,
    d.entity_id,
    d.status,
    d.operational_status,
    d.attempts,
    d.provider_message_id,
    case when d.error_message is null then null else 'Falha registrada no provedor' end::text,
    d.sent_at,
    d.created_at
  from public.oliveira_email_deliveries d
  order by d.created_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 500);
end;
$$;

revoke all on table public.oliveira_email_deliveries from public, anon, authenticated;
revoke all on function public.oliveira_list_email_delivery_summaries(integer) from public, anon;
grant execute on function public.oliveira_list_email_delivery_summaries(integer) to authenticated;

create index if not exists oliveira_email_deliveries_provider_message_idx
  on public.oliveira_email_deliveries(provider_message_id)
  where provider_message_id is not null;

create table if not exists public.oliveira_email_provider_events (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null unique,
  provider_message_id text not null,
  delivery_id uuid references public.oliveira_email_deliveries(id) on delete set null,
  event_type text not null check (
    event_type in (
      'sent', 'delivered', 'delivery_delayed', 'bounced',
      'complained', 'failed', 'suppressed'
    )
  ),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);

alter table public.oliveira_email_provider_events enable row level security;
revoke all on table public.oliveira_email_provider_events
  from public, anon, authenticated;
grant select, insert on table public.oliveira_email_provider_events to service_role;

-- Registra o evento e atualiza o resumo na mesma transacao. Duplicatas de
-- Svix nao reaplicam estado, e eventos atrasados nao fazem o status regredir.
create or replace function public.oliveira_record_email_provider_event(
  p_svix_id text,
  p_provider_message_id text,
  p_event_type text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_event_id uuid;
  matched_delivery_id uuid;
begin
  if coalesce(p_svix_id, '') = ''
     or coalesce(p_provider_message_id, '') = ''
     or p_event_type not in (
       'sent', 'delivered', 'delivery_delayed', 'bounced',
       'complained', 'failed', 'suppressed'
     ) then
    raise exception using errcode = '22023', message = 'Evento de e-mail invalido';
  end if;

  select d.id into matched_delivery_id
  from public.oliveira_email_deliveries d
  where d.provider_message_id = p_provider_message_id
  order by d.created_at desc
  limit 1;

  insert into public.oliveira_email_provider_events (
    svix_id, provider_message_id, delivery_id, event_type, occurred_at
  ) values (
    p_svix_id, p_provider_message_id, matched_delivery_id, p_event_type,
    coalesce(p_occurred_at, now())
  )
  on conflict (svix_id) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    return jsonb_build_object('duplicate', true, 'matched', matched_delivery_id is not null);
  end if;

  if matched_delivery_id is not null then
    update public.oliveira_email_deliveries
    set
      operational_status = p_event_type,
      svix_id = p_svix_id,
      last_provider_event_at = coalesce(p_occurred_at, now()),
      status = case
        when p_event_type in ('bounced', 'complained', 'failed', 'suppressed') then 'failed'
        else 'sent'
      end,
      error_message = case
        when p_event_type in ('bounced', 'complained', 'failed', 'suppressed')
          then 'Falha registrada pelo provedor'
        else null
      end,
      sent_at = case
        when p_event_type in ('sent', 'delivered') then coalesce(sent_at, p_occurred_at, now())
        else sent_at
      end,
      updated_at = now()
    where id = matched_delivery_id
      and (
        last_provider_event_at is null
        or coalesce(p_occurred_at, now()) >= last_provider_event_at
      );
  end if;

  return jsonb_build_object('duplicate', false, 'matched', matched_delivery_id is not null);
end;
$$;

revoke all on function public.oliveira_record_email_provider_event(text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.oliveira_record_email_provider_event(text,text,text,timestamptz)
  to service_role;

-- Hashes novos sao separados e imutaveis; document_hash legado permanece sem backfill.
alter table public.oliveira_contracts
  add column if not exists unsigned_document_hash text,
  add column if not exists signed_document_hash text;

alter table public.oliveira_contract_signatures
  add column if not exists unsigned_document_hash text,
  add column if not exists signed_document_hash text;

-- Metadados calculados no servidor para comprovantes novos. Linhas antigas
-- permanecem validas com valores nulos.
alter table public.oliveira_payment_receipts
  add column if not exists file_sha256 text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint;

alter table public.oliveira_payment_receipts
  drop constraint if exists oliveira_payment_receipts_file_sha256_check;
alter table public.oliveira_payment_receipts
  add constraint oliveira_payment_receipts_file_sha256_check
  check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');

alter table public.oliveira_payment_receipts
  drop constraint if exists oliveira_payment_receipts_size_bytes_check;
alter table public.oliveira_payment_receipts
  add constraint oliveira_payment_receipts_size_bytes_check
  check (size_bytes is null or (size_bytes > 0 and size_bytes <= 10485760));

create or replace function public.oliveira_protect_contract_hashes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.unsigned_document_hash is not null
     and new.unsigned_document_hash is distinct from old.unsigned_document_hash then
    raise exception 'O hash original do contrato e imutavel';
  end if;
  if old.signed_document_hash is not null
     and new.signed_document_hash is distinct from old.signed_document_hash then
    raise exception 'O hash assinado do contrato e imutavel';
  end if;
  return new;
end;
$$;

drop trigger if exists oliveira_contract_hashes_immutable on public.oliveira_contracts;
create trigger oliveira_contract_hashes_immutable
before update of unsigned_document_hash, signed_document_hash on public.oliveira_contracts
for each row execute function public.oliveira_protect_contract_hashes();

-- Policies de leitura passam a exigir associacao ativa. Historico nao e removido.
drop policy if exists oliveira_profiles_select on public.oliveira_profiles;
create policy oliveira_profiles_select on public.oliveira_profiles for select using (
  public.oliveira_is_admin()
  or (id = auth.uid() and public.oliveira_is_active_member())
);

drop policy if exists oliveira_tenancies_access on public.oliveira_tenancies;
create policy oliveira_tenancies_access on public.oliveira_tenancies for select using (
  public.oliveira_is_admin()
  or (tenant_id = auth.uid() and public.oliveira_is_active_member())
);

drop policy if exists oliveira_contracts_access on public.oliveira_contracts;
create policy oliveira_contracts_access on public.oliveira_contracts for select using (
  public.oliveira_is_admin()
  or (
    public.oliveira_is_active_member()
    and exists (
      select 1 from public.oliveira_tenancies t
      where t.id = oliveira_contracts.tenancy_id and t.tenant_id = auth.uid()
    )
  )
);

drop policy if exists oliveira_signatures_access on public.oliveira_contract_signatures;
create policy oliveira_signatures_access on public.oliveira_contract_signatures for select using (
  public.oliveira_is_admin()
  or (signer_id = auth.uid() and public.oliveira_is_active_member())
);

drop policy if exists oliveira_installments_access on public.oliveira_rent_installments;
create policy oliveira_installments_access on public.oliveira_rent_installments for select using (
  public.oliveira_is_admin()
  or (
    public.oliveira_is_active_member()
    and exists (
      select 1 from public.oliveira_tenancies t
      where t.id = oliveira_rent_installments.tenancy_id and t.tenant_id = auth.uid()
    )
  )
);

drop policy if exists oliveira_receipts_access on public.oliveira_payment_receipts;
create policy oliveira_receipts_access on public.oliveira_payment_receipts for select using (
  public.oliveira_is_admin()
  or (tenant_id = auth.uid() and public.oliveira_is_active_member())
);
drop policy if exists oliveira_receipts_tenant_insert on public.oliveira_payment_receipts;

drop policy if exists oliveira_maintenance_access on public.oliveira_maintenance_requests;
create policy oliveira_maintenance_access on public.oliveira_maintenance_requests for select using (
  public.oliveira_is_admin()
  or (tenant_id = auth.uid() and public.oliveira_is_active_member())
);
drop policy if exists oliveira_maintenance_tenant_insert on public.oliveira_maintenance_requests;
create policy oliveira_maintenance_tenant_insert on public.oliveira_maintenance_requests for insert with check (
  tenant_id = auth.uid()
  and public.oliveira_is_active_member()
  and exists (
    select 1 from public.oliveira_tenancies t
    where t.id = oliveira_maintenance_requests.tenancy_id
      and t.tenant_id = auth.uid()
      and t.status = 'active'
      and t.deleted_at is null
  )
);

drop policy if exists oliveira_credits_access on public.oliveira_maintenance_credits;
create policy oliveira_credits_access on public.oliveira_maintenance_credits for select using (
  public.oliveira_is_admin()
  or (
    public.oliveira_is_active_member()
    and exists (
      select 1
      from public.oliveira_rent_installments i
      join public.oliveira_tenancies t on t.id = i.tenancy_id
      where i.id = oliveira_maintenance_credits.installment_id and t.tenant_id = auth.uid()
    )
  )
);

drop policy if exists oliveira_tenant_documents_access on public.oliveira_tenant_documents;
create policy oliveira_tenant_documents_access on public.oliveira_tenant_documents for select using (
  public.oliveira_is_admin()
  or (tenant_id = auth.uid() and public.oliveira_is_active_member())
);

drop policy if exists oliveira_maintenance_attachments_access on public.oliveira_maintenance_attachments;
create policy oliveira_maintenance_attachments_access on public.oliveira_maintenance_attachments for select using (
  public.oliveira_is_admin()
  or (tenant_id = auth.uid() and public.oliveira_is_active_member())
);

drop policy if exists oliveira_rent_receipts_access on public.oliveira_rent_receipts;
create policy oliveira_rent_receipts_access on public.oliveira_rent_receipts for select using (
  public.oliveira_is_admin()
  or (tenant_id = auth.uid() and public.oliveira_is_active_member())
);

drop policy if exists oliveira_notifications_access on public.oliveira_notifications;
create policy oliveira_notifications_access on public.oliveira_notifications for select using (
  public.oliveira_is_admin()
  or (recipient_id = auth.uid() and public.oliveira_is_active_member())
);
drop policy if exists oliveira_notifications_update on public.oliveira_notifications;
create policy oliveira_notifications_update on public.oliveira_notifications for update using (
  recipient_id = auth.uid() and public.oliveira_is_active_member()
) with check (
  recipient_id = auth.uid() and public.oliveira_is_active_member()
);

drop policy if exists oliveira_settings_authenticated_read on public.oliveira_settings;
drop policy if exists oliveira_settings_admin_read on public.oliveira_settings;
create policy oliveira_settings_admin_read on public.oliveira_settings for select using (
  public.oliveira_is_admin()
);

revoke insert, update, delete on table public.oliveira_settings from authenticated;
grant select on table public.oliveira_settings to authenticated;

revoke insert, update, delete on table public.oliveira_payment_receipts from authenticated;
grant select on table public.oliveira_payment_receipts to authenticated;
revoke update on table public.oliveira_notifications from authenticated;
grant update(read_at) on table public.oliveira_notifications to authenticated;

-- Arquivos privados passam obrigatoriamente pelas funcoes auditadas.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
where id = 'oliveira-private-documents';

drop policy if exists oliveira_private_storage_read on storage.objects;
drop policy if exists oliveira_private_storage_tenant_insert on storage.objects;
drop policy if exists oliveira_private_storage_admin_write on storage.objects;
drop policy if exists oliveira_tenant_files_read on storage.objects;
drop policy if exists oliveira_tenant_files_admin_write on storage.objects;

commit;
