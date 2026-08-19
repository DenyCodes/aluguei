-- Renovação operacional: perfis documentais, recibos, anexos e notificações.
alter table public.oliveira_profiles
  add column if not exists avatar_path text,
  add column if not exists document_status text not null default 'incomplete'
    check (document_status in ('incomplete','pending','approved','rejected'));

alter table public.oliveira_tenancies
  add column if not exists require_document_approval boolean not null default false,
  add column if not exists required_document_types text[] not null default '{}'::text[];

create table if not exists public.oliveira_tenant_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.oliveira_profiles(id) on delete cascade,
  document_type text not null check (document_type in ('profile_photo','rg_front','rg_back','cpf','proof_of_address','other')),
  display_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'pending' check (status in ('pending','approved','rejected','replaced','deleted')),
  uploaded_by uuid not null references public.oliveira_profiles(id),
  reviewed_by uuid references public.oliveira_profiles(id),
  review_note text,
  reviewed_at timestamptz,
  replaced_by uuid references public.oliveira_tenant_documents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists oliveira_tenant_documents_tenant_status_idx on public.oliveira_tenant_documents(tenant_id,status,document_type);

create table if not exists public.oliveira_maintenance_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.oliveira_maintenance_requests(id) on delete cascade,
  tenant_id uuid not null references public.oliveira_profiles(id),
  storage_path text not null unique,
  display_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null references public.oliveira_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.oliveira_rent_receipts (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null unique references public.oliveira_rent_installments(id) on delete cascade,
  tenancy_id uuid not null references public.oliveira_tenancies(id) on delete cascade,
  tenant_id uuid not null references public.oliveira_profiles(id),
  receipt_number text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null,
  pdf_path text,
  issued_by uuid not null references public.oliveira_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.oliveira_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.oliveira_profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oliveira_notifications_recipient_idx on public.oliveira_notifications(recipient_id,read_at,created_at desc);

alter table public.oliveira_tenant_documents enable row level security;
alter table public.oliveira_maintenance_attachments enable row level security;
alter table public.oliveira_rent_receipts enable row level security;
alter table public.oliveira_notifications enable row level security;

drop policy if exists oliveira_tenant_documents_access on public.oliveira_tenant_documents;
create policy oliveira_tenant_documents_access on public.oliveira_tenant_documents for select
using (tenant_id = auth.uid() or public.oliveira_is_admin());
drop policy if exists oliveira_tenant_documents_admin_write on public.oliveira_tenant_documents;
create policy oliveira_tenant_documents_admin_write on public.oliveira_tenant_documents for all
using (public.oliveira_is_admin()) with check (public.oliveira_is_admin());

drop policy if exists oliveira_maintenance_attachments_access on public.oliveira_maintenance_attachments;
create policy oliveira_maintenance_attachments_access on public.oliveira_maintenance_attachments for select
using (tenant_id = auth.uid() or public.oliveira_is_admin());

drop policy if exists oliveira_rent_receipts_access on public.oliveira_rent_receipts;
create policy oliveira_rent_receipts_access on public.oliveira_rent_receipts for select
using (tenant_id = auth.uid() or public.oliveira_is_admin());

drop policy if exists oliveira_notifications_access on public.oliveira_notifications;
create policy oliveira_notifications_access on public.oliveira_notifications for select
using (recipient_id = auth.uid() or public.oliveira_is_admin());
drop policy if exists oliveira_notifications_update on public.oliveira_notifications;
create policy oliveira_notifications_update on public.oliveira_notifications for update
using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('oliveira-tenant-files','oliveira-tenant-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists oliveira_tenant_files_read on storage.objects;
create policy oliveira_tenant_files_read on storage.objects for select using (
  bucket_id = 'oliveira-tenant-files' and (public.oliveira_is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);
drop policy if exists oliveira_tenant_files_admin_write on storage.objects;
create policy oliveira_tenant_files_admin_write on storage.objects for all using (
  bucket_id = 'oliveira-tenant-files' and public.oliveira_is_admin()
) with check (bucket_id = 'oliveira-tenant-files' and public.oliveira_is_admin());

revoke all on public.oliveira_tenant_documents, public.oliveira_maintenance_attachments, public.oliveira_rent_receipts, public.oliveira_notifications from anon;
grant select on public.oliveira_tenant_documents, public.oliveira_maintenance_attachments, public.oliveira_rent_receipts, public.oliveira_notifications to authenticated;
grant update(read_at) on public.oliveira_notifications to authenticated;
