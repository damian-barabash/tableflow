-- Customers joining via QR must leave name + phone (user decision 2026-09-27): phone is always required.
-- Plus: retention purge for cookieless analytics.
alter table public.loyalty_programs alter column join_fields set default '{"email":"optional","phone":"required","birthday":"off"}'::jsonb;
update public.loyalty_programs set join_fields = join_fields || '{"phone":"required"}'::jsonb;

CREATE OR REPLACE FUNCTION public.loyalty_join(p_slug text, p_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_birthday date DEFAULT NULL::date, p_consent boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare p public.loyalty_programs; v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
        v_name text := btrim(coalesce(p_name, '')); v_hash text; c public.loyalty_cards;
begin
  select * into p from public.loyalty_programs where slug = lower(btrim(p_slug)) and status = 'active';
  if not found or public.loyalty_public_program(p_slug) is null then raise exception 'program_not_found' using errcode = '22023'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$') then raise exception 'invalid_email' using errcode = '22023'; end if;
  if v_phone is not null and (length(v_phone) < 7 or length(v_phone) > 15) then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if v_phone is not null and length(v_phone) = 9 then v_phone := '48' || v_phone; end if;
  if (p.join_fields->>'email') = 'required' and v_email is null then raise exception 'email_required' using errcode = '22023'; end if;
  if v_phone is null then raise exception 'phone_required' using errcode = '22023'; end if;
  if exists (select 1 from public.loyalty_cards where program_id = p.id and ((v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone))) then
    return json_build_object('status', 'exists');
  end if;
  v_hash := encode(digest(public.req_ip() || p.id::text, 'sha256'), 'hex');
  if (select count(*) from public.loyalty_cards where program_id = p.id and join_hash = v_hash and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'rate_limited' using errcode = '22023';
  end if;
  insert into public.loyalty_cards (program_id, company_id, code, customer_name, email, phone, birthday, consent_marketing, join_hash)
  values (p.id, p.company_id, public.gen_card_code(), v_name, v_email, v_phone, p_birthday, coalesce(p_consent, false), v_hash)
  returning * into c;
  insert into public.loyalty_events (card_id, program_id, company_id, kind) values (c.id, p.id, p.company_id, 'issued');
  return json_build_object('status', 'created', 'token', c.token);
end $function$;

create or replace function public.admin_purge_visits(p_days int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.site_visits where created_at < now() - make_interval(days => greatest(p_days, 30));
  get diagnostics n = row_count;
  delete from public.analytics_salt where day < current_date - 2;
  return n;
end $$;
revoke all on function public.admin_purge_visits(int) from public, anon;
grant execute on function public.admin_purge_visits(int) to authenticated;
notify pgrst, 'reload schema';
