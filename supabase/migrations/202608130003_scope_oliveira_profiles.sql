create or replace function public.oliveira_handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare is_admin boolean;
declare is_oliveira boolean;
begin
  is_admin := lower(coalesce(new.email, '')) = 'playtecno@outlook.com.br' and new.email_confirmed_at is not null;
  is_oliveira := coalesce(new.raw_user_meta_data ->> 'app_scope', '') = 'oliveira';

  if not is_admin and not is_oliveira then
    return new;
  end if;

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
    full_name = excluded.full_name,
    phone = excluded.phone,
    cpf_masked = excluded.cpf_masked,
    role = case when is_admin then 'admin'::public.oliveira_user_role else public.oliveira_profiles.role end,
    updated_at = now();
  return new;
end;
$$;

