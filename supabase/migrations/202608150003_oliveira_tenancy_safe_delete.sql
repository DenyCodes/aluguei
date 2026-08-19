-- Exclusao logica de locacoes preservando contratos, parcelas e auditoria.
alter table public.oliveira_tenancies
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.oliveira_profiles(id);

create index if not exists oliveira_tenancies_deleted_idx
  on public.oliveira_tenancies(deleted_at, status, created_at desc);

