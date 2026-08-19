do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(p.oid)
    into function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'oliveira_admin_create_tenancy_v2'
  limit 1;

  if function_definition is null then
    raise exception 'Função de criação de locação não encontrada';
  end if;

  function_definition := replace(
    function_definition,
    'case when due_date_value <= current_date then ''pending'' else ''upcoming'' end)',
    '(case when due_date_value <= current_date then ''pending'' else ''upcoming'' end)::public.oliveira_installment_status)'
  );
  execute function_definition;
end;
$$;
