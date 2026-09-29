-- User avatars (panel + admin): WebP only, one folder per user; URL kept in auth user_metadata.avatar_url.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp'])
on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types, file_size_limit = excluded.file_size_limit, public = true;
create policy "avatars own read" on storage.objects for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own insert" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own delete" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.my_access()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'user_id', auth.uid(),
    'platform_role', (select role from public.admin_profiles where user_id = auth.uid()),
    'name', (select coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'login') from auth.users where id = auth.uid()),
    'avatar', (select raw_user_meta_data->>'avatar_url' from auth.users where id = auth.uid()),
    'companies', (select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'role', m.role, 'modules', c.modules, 'status', c.status, 'logo_url', c.logo_url) order by c.name), '[]'::json)
                  from public.company_members m join public.companies c on c.id = m.company_id where m.user_id = auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.admin_users()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(json_agg(json_build_object(
      'id', u.id, 'email', u.email, 'avatar', u.raw_user_meta_data->>'avatar_url', 'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'login'), 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'platform_role', a.role,
      'companies', (select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'role', m.role)), '[]'::json) from public.company_members m join public.companies c on c.id = m.company_id where m.user_id = u.id)
    ) order by u.created_at desc), '[]'::json)
    from auth.users u left join public.admin_profiles a on a.user_id = u.id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_companies()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(json_agg(json_build_object(
      'id', c.id, 'name', c.name, 'industry', c.industry, 'status', c.status, 'modules', c.modules, 'city', c.city, 'email', c.email, 'phone', c.phone,
      'address', c.address, 'website', c.website, 'nip', c.nip, 'logo_url', c.logo_url, 'created_at', c.created_at, 'waitlist_id', c.waitlist_id,
      'members', (select coalesce(json_agg(json_build_object('user_id', m.user_id, 'role', m.role, 'avatar', u.raw_user_meta_data->>'avatar_url', 'name', m.display_name, 'email', coalesce(m.email, u.email), 'last_sign_in_at', u.last_sign_in_at) order by m.created_at), '[]'::json)
                  from public.company_members m left join auth.users u on u.id = m.user_id where m.company_id = c.id),
      'programs', (select count(*) from public.loyalty_programs where company_id = c.id),
      'cards', (select count(*) from public.loyalty_cards where company_id = c.id),
      'stamps_30d', (select coalesce(sum(delta), 0) from public.loyalty_events where company_id = c.id and kind = 'stamp' and created_at > now() - interval '30 days')
    ) order by c.created_at desc), '[]'::json) from public.companies c);
end $function$;

-- team list with avatars / last sign-in for the panel (auth.users is not readable by clients)
create or replace function public.company_team(p_company uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_access_company(p_company) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(json_agg(json_build_object(
      'user_id', m.user_id, 'role', m.role, 'display_name', coalesce(m.display_name, u.raw_user_meta_data->>'full_name'), 'email', coalesce(m.email, u.email),
      'avatar', u.raw_user_meta_data->>'avatar_url', 'last_sign_in_at', u.last_sign_in_at, 'created_at', m.created_at) order by m.created_at), '[]'::json)
    from public.company_members m left join auth.users u on u.id = m.user_id where m.company_id = p_company);
end $$;
revoke all on function public.company_team(uuid) from public, anon;
grant execute on function public.company_team(uuid) to authenticated;
notify pgrst, 'reload schema';
