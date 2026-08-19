create or replace function public.oliveira_admin_create_tenancy_v2(
  p_admin_id uuid, p_tenant_id uuid, p_property_id uuid, p_starts_on date, p_ends_on date,
  p_monthly_rent numeric, p_due_day integer, p_late_fee_percent numeric,
  p_monthly_interest_percent numeric, p_adjustment_index text, p_guarantee_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  tenancy_id uuid;
  month_cursor date;
  due_date_value date;
  installment_count integer := 0;
begin
  if not exists (
    select 1 from auth.users where id = p_admin_id
      and lower(email) = 'playtecno@outlook.com.br' and email_confirmed_at is not null
  ) then raise exception 'Acesso administrativo negado'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on <= p_starts_on then
    raise exception 'A data final deve ser posterior à data inicial';
  end if;
  if p_monthly_rent is null or p_monthly_rent <= 0 then raise exception 'Informe um aluguel mensal maior que zero'; end if;
  if p_due_day is null or p_due_day not between 1 and 28 then raise exception 'O vencimento deve estar entre os dias 1 e 28'; end if;
  if coalesce(p_late_fee_percent, -1) < 0 or coalesce(p_monthly_interest_percent, -1) < 0 then raise exception 'Multa e juros não podem ser negativos'; end if;
  if nullif(trim(p_adjustment_index), '') is null then raise exception 'Informe o índice de reajuste'; end if;
  if not exists (select 1 from public.oliveira_profiles where id = p_tenant_id and role = 'tenant') then raise exception 'Inquilino não encontrado ou sem acesso à Imobiliária Oliveira'; end if;
  if not exists (select 1 from public.oliveira_properties where id = p_property_id and active) then raise exception 'Imóvel não encontrado ou inativo'; end if;
  if exists (
    select 1 from public.oliveira_tenancies where property_id = p_property_id
      and status in ('draft', 'active')
      and daterange(starts_on, ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]')
  ) then raise exception 'Este imóvel já possui uma locação no período informado'; end if;

  insert into public.oliveira_tenancies(
    tenant_id, property_id, starts_on, ends_on, monthly_rent, due_day,
    late_fee_percent, monthly_interest_percent, adjustment_index, guarantee_type, status
  ) values (
    p_tenant_id, p_property_id, p_starts_on, p_ends_on, p_monthly_rent, p_due_day,
    p_late_fee_percent, p_monthly_interest_percent, trim(p_adjustment_index),
    coalesce(nullif(trim(p_guarantee_type), ''), 'none'), 'active'
  ) returning id into tenancy_id;

  month_cursor := date_trunc('month', p_starts_on)::date;
  due_date_value := make_date(extract(year from month_cursor)::int, extract(month from month_cursor)::int, p_due_day);
  if due_date_value < p_starts_on then month_cursor := (month_cursor + interval '1 month')::date; end if;

  loop
    due_date_value := make_date(extract(year from month_cursor)::int, extract(month from month_cursor)::int, p_due_day);
    exit when due_date_value > p_ends_on;
    insert into public.oliveira_rent_installments(tenancy_id, reference_month, due_date, base_amount, status)
    values (tenancy_id, to_char(month_cursor, 'YYYY-MM'), due_date_value, p_monthly_rent,
      (case when due_date_value <= current_date then 'pending' else 'upcoming' end)::public.oliveira_installment_status);
    installment_count := installment_count + 1;
    month_cursor := (month_cursor + interval '1 month')::date;
  end loop;

  if installment_count = 0 then raise exception 'O período informado não gera nenhuma parcela válida'; end if;
  insert into public.oliveira_audit_log(actor_id, action, entity_type, entity_id, metadata)
  values (p_admin_id, 'tenancy.created', 'tenancy', tenancy_id::text,
    jsonb_build_object('tenant_id', p_tenant_id, 'property_id', p_property_id, 'installments', installment_count));
  return jsonb_build_object('tenancy_id', tenancy_id, 'installments_created', installment_count);
end;
$$;

revoke all on function public.oliveira_admin_create_tenancy_v2(uuid,uuid,uuid,date,date,numeric,integer,numeric,numeric,text,text) from public, anon, authenticated;
grant execute on function public.oliveira_admin_create_tenancy_v2(uuid,uuid,uuid,date,date,numeric,integer,numeric,numeric,text,text) to service_role;
