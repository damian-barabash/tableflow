-- TableFlow: client panel (/panel), admin (/admin), loyalty cards (Apple/Google Wallet),
-- cookieless site analytics, site settings, audit log.

-- ============================================================ helpers / roles
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_profiles where user_id = auth.uid() and role in ('owner','admin'));
$$;
revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

create or replace function public.try_uuid(t text) returns uuid
language plpgsql immutable as $$ begin return t::uuid; exception when others then return null; end $$;

-- ============================================================ companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  industry text,
  status text not null default 'active' check (status in ('trial','active','paused')),
  modules text[] not null default array['loyalty']::text[],
  email text, phone text, address text, city text, website text, nip text,
  logo_url text,
  waitlist_id uuid references public.waitlist_subscribers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger companies_updated before update on public.companies for each row execute function public.set_updated_at();

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','manager','staff')),
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user on public.company_members(user_id);

create or replace function public.company_role(cid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.company_members where company_id = cid and user_id = auth.uid();
$$;
create or replace function public.can_access_company(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or exists (select 1 from public.company_members where company_id = cid and user_id = auth.uid());
$$;
create or replace function public.can_manage_company(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or exists (select 1 from public.company_members where company_id = cid and user_id = auth.uid() and role in ('owner','manager'));
$$;
revoke all on function public.company_role(uuid), public.can_access_company(uuid), public.can_manage_company(uuid) from public;
grant execute on function public.company_role(uuid), public.can_access_company(uuid), public.can_manage_company(uuid) to authenticated;

-- clients may edit their profile, but not the plan (modules/status) or lead link
create or replace function public.companies_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then
    new.modules := old.modules; new.status := old.status; new.waitlist_id := old.waitlist_id; new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger companies_guard before update on public.companies for each row execute function public.companies_guard();

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
create policy "members read company" on public.companies for select to authenticated using (public.can_access_company(id));
create policy "managers update company" on public.companies for update to authenticated using (public.can_manage_company(id)) with check (public.can_manage_company(id));
create policy "admins insert company" on public.companies for insert to authenticated with check (public.is_superadmin());
create policy "admins delete company" on public.companies for delete to authenticated using (public.is_superadmin());
-- membership writes go through the admin-api edge function (service role) — read only here
create policy "members read members" on public.company_members for select to authenticated using (public.can_access_company(company_id));

-- ============================================================ loyalty
create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  slug text not null unique default lower(substr(md5(gen_random_uuid()::text), 1, 10)),
  name text not null default 'Karta stałego klienta' check (length(btrim(name)) between 1 and 80),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  stamps_required int not null default 10 check (stamps_required between 3 and 24),
  reward text not null default 'Nagroda' check (length(reward) <= 80),
  design jsonb not null default '{}'::jsonb,       -- colours, gradient, logo, stamp icons (see src/panel/loyalty/design.ts)
  info jsonb not null default '{}'::jsonb,         -- description, terms, address, phone, website, hours
  join_fields jsonb not null default '{"email":"optional","phone":"optional","birthday":"off"}'::jsonb,
  rules jsonb not null default '{"cooldown_minutes":60,"max_per_scan":3}'::jsonb,
  assets jsonb not null default '{}'::jsonb,        -- published wallet images: {version, base, strips}
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loyalty_programs_company on public.loyalty_programs(company_id);
create trigger loyalty_programs_updated before update on public.loyalty_programs for each row execute function public.set_updated_at();

create table public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null unique,                        -- short human code, in the QR (tableflow.pl/s?c=CODE)
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),  -- secret: customer card link + Apple auth token
  customer_name text not null default '' check (length(customer_name) <= 80),
  email extensions.citext,
  phone text,
  birthday date,
  consent_marketing boolean not null default false,
  note text,
  stamps int not null default 0 check (stamps >= 0),
  total_stamps int not null default 0,
  rewards_redeemed int not null default 0,
  status text not null default 'active' check (status in ('active','blocked')),
  apple_devices int not null default 0,
  google_saved boolean not null default false,
  last_message text,
  last_message_at timestamptz,
  last_stamp_at timestamptz,
  join_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loyalty_cards_program on public.loyalty_cards(program_id, created_at desc);
create index loyalty_cards_company on public.loyalty_cards(company_id);
create unique index loyalty_cards_email on public.loyalty_cards(program_id, email) where email is not null;
create unique index loyalty_cards_phone on public.loyalty_cards(program_id, phone) where phone is not null;
create trigger loyalty_cards_updated before update on public.loyalty_cards for each row execute function public.set_updated_at();

create table public.loyalty_events (
  id bigint generated always as identity primary key,
  card_id uuid references public.loyalty_cards(id) on delete cascade,
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('issued','stamp','unstamp','reward','message','apple_added','apple_removed','google_saved','blocked','unblocked')),
  delta int not null default 0,
  by_user uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index loyalty_events_company on public.loyalty_events(company_id, created_at desc);
create index loyalty_events_card on public.loyalty_events(card_id, created_at desc);

create table public.loyalty_messages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null, body text not null, segment text not null default 'all',
  cards int not null default 0, apple int not null default 0, google int not null default 0,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_messages_program on public.loyalty_messages(program_id, created_at desc);

-- Apple Wallet web service registrations (service role only)
create table public.wallet_registrations (
  device_id text not null,
  pass_type_id text not null,
  serial text not null,
  push_token text not null,
  created_at timestamptz not null default now(),
  primary key (device_id, pass_type_id, serial)
);
create index wallet_registrations_serial on public.wallet_registrations(serial);

alter table public.loyalty_programs enable row level security;
alter table public.loyalty_cards enable row level security;
alter table public.loyalty_events enable row level security;
alter table public.loyalty_messages enable row level security;
alter table public.wallet_registrations enable row level security;

create policy "members read programs" on public.loyalty_programs for select to authenticated using (public.can_access_company(company_id));
create policy "managers insert programs" on public.loyalty_programs for insert to authenticated with check (public.can_manage_company(company_id));
create policy "managers update programs" on public.loyalty_programs for update to authenticated using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id));
create policy "managers delete programs" on public.loyalty_programs for delete to authenticated using (public.can_manage_company(company_id));

create policy "members read cards" on public.loyalty_cards for select to authenticated using (public.can_access_company(company_id));
create policy "managers update cards" on public.loyalty_cards for update to authenticated using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id));
create policy "managers delete cards" on public.loyalty_cards for delete to authenticated using (public.can_manage_company(company_id));
-- stamps / counters only through RPCs
revoke update on public.loyalty_cards from authenticated, anon;
grant update (customer_name, email, phone, birthday, note, status) on public.loyalty_cards to authenticated;

create policy "members read events" on public.loyalty_events for select to authenticated using (public.can_access_company(company_id));
create policy "members read messages" on public.loyalty_messages for select to authenticated using (public.can_access_company(company_id));

-- short codes without ambiguous characters
create or replace function public.gen_card_code() returns text
language plpgsql as $$
declare a text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; c text; i int;
begin
  loop
    c := '';
    for i in 1..8 loop c := c || substr(a, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1); end loop;
    exit when not exists (select 1 from public.loyalty_cards where code = c);
  end loop;
  return c;
end $$;

create or replace function public.req_ip() returns text
language sql stable as $$
  select coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true)::json->>'cf-connecting-ip', current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown');
$$;

-- public: program data for the join page
create or replace function public.loyalty_public_program(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'slug', p.slug, 'name', p.name, 'reward', p.reward, 'stamps_required', p.stamps_required,
    'design', p.design, 'info', p.info, 'join_fields', p.join_fields, 'assets', p.assets,
    'company', json_build_object('name', c.name, 'logo_url', c.logo_url, 'industry', c.industry))
  from public.loyalty_programs p join public.companies c on c.id = p.company_id
  where p.slug = lower(btrim(p_slug)) and p.status = 'active' and c.status <> 'paused' and 'loyalty' = any(c.modules);
$$;

-- public: customer joins a program → gets the secret card token
create or replace function public.loyalty_join(p_slug text, p_name text, p_email text default null, p_phone text default null, p_birthday date default null, p_consent boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
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
  if (p.join_fields->>'phone') = 'required' and v_phone is null then raise exception 'phone_required' using errcode = '22023'; end if;
  if v_email is null and v_phone is null and coalesce(p.join_fields->>'email','optional') <> 'off' and coalesce(p.join_fields->>'phone','optional') <> 'off' then raise exception 'contact_required' using errcode = '22023'; end if;
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
end $$;

-- public: the customer's own card (by secret token)
create or replace function public.loyalty_card_public(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'code', k.code, 'name', k.customer_name, 'stamps', k.stamps, 'rewards_redeemed', k.rewards_redeemed, 'status', k.status,
    'apple', k.apple_devices > 0, 'google', k.google_saved, 'last_message', k.last_message, 'last_message_at', k.last_message_at,
    'created_at', k.created_at, 'last_stamp_at', k.last_stamp_at,
    'program', json_build_object('name', p.name, 'reward', p.reward, 'stamps_required', p.stamps_required, 'design', p.design, 'info', p.info, 'assets', p.assets, 'status', p.status),
    'company', json_build_object('name', c.name, 'logo_url', c.logo_url),
    'history', coalesce((select json_agg(json_build_object('kind', e.kind, 'delta', e.delta, 'at', e.created_at) order by e.created_at desc)
                         from (select * from public.loyalty_events where card_id = k.id and kind in ('stamp','reward','issued') order by created_at desc limit 12) e), '[]'::json))
  from public.loyalty_cards k join public.loyalty_programs p on p.id = k.program_id join public.companies c on c.id = k.company_id
  where k.token = p_token;
$$;

-- public: minimal info for a scanned card QR (no personal data)
create or replace function public.loyalty_code_info(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('company', c.name, 'program', p.name, 'company_id', c.id)
  from public.loyalty_cards k join public.loyalty_programs p on p.id = k.program_id join public.companies c on c.id = k.company_id
  where k.code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

create or replace function public.loyalty_card_json(k public.loyalty_cards) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', k.id, 'code', k.code, 'name', k.customer_name, 'email', k.email, 'phone', k.phone, 'stamps', k.stamps, 'total_stamps', k.total_stamps,
    'rewards_redeemed', k.rewards_redeemed, 'status', k.status, 'last_stamp_at', k.last_stamp_at, 'created_at', k.created_at,
    'apple_devices', k.apple_devices, 'google_saved', k.google_saved, 'company_id', k.company_id,
    'program', json_build_object('id', p.id, 'name', p.name, 'reward', p.reward, 'stamps_required', p.stamps_required, 'rules', p.rules, 'design', p.design),
    'history', coalesce((select json_agg(json_build_object('kind', e.kind, 'delta', e.delta, 'at', e.created_at, 'by', m.display_name, 'note', e.note) order by e.created_at desc)
                         from (select * from public.loyalty_events where card_id = k.id order by created_at desc limit 8) e
                         left join public.company_members m on m.user_id = e.by_user and m.company_id = k.company_id), '[]'::json))
  from public.loyalty_programs p where p.id = k.program_id;
$$;
revoke all on function public.loyalty_card_json(public.loyalty_cards) from public, anon;

-- staff: find a card by scanned code / token / URL
create or replace function public.loyalty_lookup(p_query text) returns json
language plpgsql stable security definer set search_path = public as $$
declare q text := btrim(coalesce(p_query, '')); k public.loyalty_cards;
begin
  if q ~* '[?&]c=' then q := substring(q from '[?&][cC]=([0-9A-Za-z-]+)'); end if;
  if q ~* '[?&]t=' then q := substring(q from '[?&]t=([0-9a-f]+)'); end if;
  select * into k from public.loyalty_cards where token = lower(q) or code = upper(regexp_replace(q, '[^0-9A-Za-z]', '', 'g')) limit 1;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.can_access_company(k.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return public.loyalty_card_json(k);
end $$;

-- staff: add stamps (cooldown + per-scan limit; managers may force)
create or replace function public.loyalty_stamp(p_card uuid, p_count int default 1, p_force boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare k public.loyalty_cards; p public.loyalty_programs; v_role text; v_cool int; v_max int; v_wait int;
begin
  select * into k from public.loyalty_cards where id = p_card for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.can_access_company(k.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if k.status <> 'active' then raise exception 'card_blocked' using errcode = '22023'; end if;
  select * into p from public.loyalty_programs where id = k.program_id;
  v_role := coalesce(public.company_role(k.company_id), case when public.is_superadmin() then 'owner' end);
  v_cool := coalesce((p.rules->>'cooldown_minutes')::int, 0);
  v_max := greatest(1, coalesce((p.rules->>'max_per_scan')::int, 3));
  if p_count < 1 or p_count > greatest(v_max, case when v_role in ('owner','manager') then 24 else 0 end) then raise exception 'too_many' using errcode = '22023'; end if;
  if v_cool > 0 and k.last_stamp_at is not null and k.last_stamp_at > now() - make_interval(mins => v_cool) and not (p_force and v_role in ('owner','manager')) then
    v_wait := ceil(extract(epoch from (k.last_stamp_at + make_interval(mins => v_cool) - now())) / 60.0);
    return json_build_object('status', 'cooldown', 'wait_minutes', v_wait, 'card', public.loyalty_card_json(k));
  end if;
  update public.loyalty_cards set stamps = stamps + p_count, total_stamps = total_stamps + p_count, last_stamp_at = now() where id = k.id returning * into k;
  insert into public.loyalty_events (card_id, program_id, company_id, kind, delta, by_user, note)
  values (k.id, k.program_id, k.company_id, 'stamp', p_count, auth.uid(), case when p_force then 'force' end);
  return json_build_object('status', 'ok', 'card', public.loyalty_card_json(k));
end $$;

create or replace function public.loyalty_unstamp(p_card uuid, p_count int default 1) returns json
language plpgsql security definer set search_path = public as $$
declare k public.loyalty_cards; n int;
begin
  select * into k from public.loyalty_cards where id = p_card for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.can_manage_company(k.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  n := least(greatest(p_count, 1), k.stamps);
  if n = 0 then return json_build_object('status', 'ok', 'card', public.loyalty_card_json(k)); end if;
  update public.loyalty_cards set stamps = stamps - n, total_stamps = greatest(0, total_stamps - n) where id = k.id returning * into k;
  insert into public.loyalty_events (card_id, program_id, company_id, kind, delta, by_user) values (k.id, k.program_id, k.company_id, 'unstamp', -n, auth.uid());
  return json_build_object('status', 'ok', 'card', public.loyalty_card_json(k));
end $$;

create or replace function public.loyalty_redeem(p_card uuid) returns json
language plpgsql security definer set search_path = public as $$
declare k public.loyalty_cards; req int;
begin
  select * into k from public.loyalty_cards where id = p_card for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.can_access_company(k.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select stamps_required into req from public.loyalty_programs where id = k.program_id;
  if k.stamps < req then raise exception 'not_enough' using errcode = '22023'; end if;
  update public.loyalty_cards set stamps = stamps - req, rewards_redeemed = rewards_redeemed + 1 where id = k.id returning * into k;
  insert into public.loyalty_events (card_id, program_id, company_id, kind, delta, by_user) values (k.id, k.program_id, k.company_id, 'reward', -req, auth.uid());
  return json_build_object('status', 'ok', 'card', public.loyalty_card_json(k));
end $$;

-- staff: manual card (customer at the counter)
create or replace function public.loyalty_issue(p_program uuid, p_name text, p_email text default null, p_phone text default null) returns json
language plpgsql security definer set search_path = public as $$
declare p public.loyalty_programs; c public.loyalty_cards; v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  select * into p from public.loyalty_programs where id = p_program;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.can_access_company(p.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_name, ''))) < 1 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if v_phone is not null and length(v_phone) = 9 then v_phone := '48' || v_phone; end if;
  if exists (select 1 from public.loyalty_cards where program_id = p.id and ((v_email is not null and email = v_email) or (v_phone is not null and phone = v_phone))) then
    raise exception 'exists' using errcode = '23505';
  end if;
  insert into public.loyalty_cards (program_id, company_id, code, customer_name, email, phone)
  values (p.id, p.company_id, public.gen_card_code(), btrim(p_name), v_email, v_phone) returning * into c;
  insert into public.loyalty_events (card_id, program_id, company_id, kind, by_user) values (c.id, p.id, p.company_id, 'issued', auth.uid());
  return json_build_object('status', 'ok', 'card', public.loyalty_card_json(c), 'token', c.token);
end $$;

-- panel statistics (loyalty)
create or replace function public.loyalty_stats(p_company uuid, p_days int default 30, p_program uuid default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw' - make_interval(days => greatest(p_days, 1) - 1);
        r json;
begin
  if not public.can_access_company(p_company) then raise exception 'forbidden' using errcode = '42501'; end if;
  with cards as (select k.*, p.stamps_required req from public.loyalty_cards k join public.loyalty_programs p on p.id = k.program_id
                 where k.company_id = p_company and (p_program is null or k.program_id = p_program)),
       ev as (select * from public.loyalty_events where company_id = p_company and (p_program is null or program_id = p_program) and created_at >= since),
       days as (select generate_series(since at time zone 'Europe/Warsaw', now() at time zone 'Europe/Warsaw', interval '1 day')::date d)
  select json_build_object(
    'cards', (select count(*) from cards),
    'cards_active', (select count(*) from cards where last_stamp_at > now() - interval '30 days'),
    'new_cards', (select count(*) from cards where created_at >= since),
    'stamps', (select coalesce(sum(delta), 0) from ev where kind = 'stamp'),
    'rewards', (select count(*) from ev where kind = 'reward'),
    'rewards_ready', (select count(*) from cards where stamps >= req),
    'apple', (select count(*) from cards where apple_devices > 0),
    'google', (select count(*) from cards where google_saved),
    'returning', (select count(*) from cards where total_stamps >= 2),
    'avg_stamps', (select round(coalesce(avg(total_stamps), 0)::numeric, 1) from cards),
    'marketing', (select count(*) from cards where consent_marketing),
    'series', (select json_agg(json_build_object('d', d,
                 'stamps', (select coalesce(sum(delta), 0) from ev where kind = 'stamp' and (created_at at time zone 'Europe/Warsaw')::date = d),
                 'cards', (select count(*) from ev where kind = 'issued' and (created_at at time zone 'Europe/Warsaw')::date = d),
                 'rewards', (select count(*) from ev where kind = 'reward' and (created_at at time zone 'Europe/Warsaw')::date = d)) order by d) from days),
    'heat', (select coalesce(json_agg(json_build_object('dow', dow, 'h', h, 'n', n)), '[]'::json) from (
               select extract(isodow from created_at at time zone 'Europe/Warsaw')::int dow, extract(hour from created_at at time zone 'Europe/Warsaw')::int h, sum(delta)::int n
               from ev where kind = 'stamp' group by 1, 2) x),
    'progress', (select coalesce(json_agg(json_build_object('s', s, 'n', n) order by s), '[]'::json) from (
               select least(stamps, req) s, count(*) n from cards where status = 'active' group by 1) x),
    'staff', (select coalesce(json_agg(json_build_object('name', coalesce(m.display_name, m.email, 'Administrator'), 'n', x.n) order by x.n desc), '[]'::json) from (
               select by_user, sum(delta)::int n from ev where kind = 'stamp' group by 1) x left join public.company_members m on m.user_id = x.by_user and m.company_id = p_company),
    'recent', (select coalesce(json_agg(json_build_object('kind', e.kind, 'delta', e.delta, 'at', e.created_at, 'card', k.customer_name, 'code', k.code, 'card_id', k.id) order by e.created_at desc), '[]'::json) from (
               select * from public.loyalty_events where company_id = p_company and (p_program is null or program_id = p_program) order by created_at desc limit 20) e left join public.loyalty_cards k on k.id = e.card_id)
  ) into r;
  return r;
end $$;

-- grants: public RPCs to anon, staff RPCs to authenticated only
revoke all on function public.loyalty_public_program(text), public.loyalty_join(text, text, text, text, date, boolean), public.loyalty_card_public(text), public.loyalty_code_info(text),
  public.loyalty_lookup(text), public.loyalty_stamp(uuid, int, boolean), public.loyalty_unstamp(uuid, int), public.loyalty_redeem(uuid), public.loyalty_issue(uuid, text, text, text),
  public.loyalty_stats(uuid, int, uuid), public.gen_card_code() from public;
grant execute on function public.loyalty_public_program(text), public.loyalty_join(text, text, text, text, date, boolean), public.loyalty_card_public(text), public.loyalty_code_info(text) to anon, authenticated;
grant execute on function public.loyalty_lookup(text), public.loyalty_stamp(uuid, int, boolean), public.loyalty_unstamp(uuid, int), public.loyalty_redeem(uuid), public.loyalty_issue(uuid, text, text, text), public.loyalty_stats(uuid, int, uuid) to authenticated;

-- ============================================================ site settings
create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);
alter table public.site_settings enable row level security;
create policy "anyone reads public settings" on public.site_settings for select using (public or public.is_superadmin());
create policy "admins write settings" on public.site_settings for insert to authenticated with check (public.is_superadmin());
create policy "admins update settings" on public.site_settings for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
insert into public.site_settings (key, value, public) values
  ('announcement', '{"enabled":false,"text":{},"link":"","style":"brand"}', true),
  ('analytics', '{"enabled":true,"retention_days":395}', false);

-- ============================================================ cookieless analytics
-- visitor = sha256(daily salt + IP + UA) — rotates every day, IP is never stored (no cookies / storage needed)
create table public.analytics_salt (day date primary key, salt bytea not null default extensions.gen_random_bytes(16));
alter table public.analytics_salt enable row level security;   -- no policies: definer functions only

create table public.site_visits (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  visitor text not null,
  path text not null,
  referrer text,
  utm_source text, utm_medium text, utm_campaign text,
  locale text, device text, browser text, os text, country text, screen int,
  duration_ms int not null default 0,
  scroll int not null default 0,
  sections text[] not null default '{}',
  clicks jsonb not null default '[]'::jsonb
);
create index site_visits_created on public.site_visits(created_at desc);
create index site_visits_visitor on public.site_visits(visitor, created_at);
alter table public.site_visits enable row level security;
create policy "admins read visits" on public.site_visits for select to authenticated using (public.is_superadmin());

create or replace function public.track_view(p_id uuid, p_path text, p_referrer text default null, p_utm jsonb default '{}'::jsonb, p_locale text default null, p_screen int default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare h json := coalesce(current_setting('request.headers', true)::json, '{}'::json); ua text := coalesce(h->>'user-agent', ''); s bytea; v text; ref text;
begin
  if coalesce((select (value->>'enabled')::boolean from public.site_settings where key = 'analytics'), true) = false then return; end if;
  if ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|axios|node-fetch)' then return; end if;
  if p_path is null or p_path ~ '^/(panel|admin|edit-mod|s)(/|$)' then return; end if;
  insert into public.analytics_salt (day) values (current_date) on conflict do nothing;
  select salt into s from public.analytics_salt where day = current_date;
  v := substr(encode(digest(s || convert_to(public.req_ip() || '|' || ua, 'utf8'), 'sha256'), 'hex'), 1, 20);
  ref := lower(substring(coalesce(p_referrer, '') from '^https?://(?:www\.)?([^/:?#]+)'));
  if ref = 'tableflow.pl' or ref = '' or ref ~ '^(localhost|127\.)' then ref := null; end if;
  insert into public.site_visits (id, visitor, path, referrer, utm_source, utm_medium, utm_campaign, locale, device, browser, os, country, screen)
  values (p_id, v, left(p_path, 200), left(ref, 120),
    left(p_utm->>'utm_source', 80), left(p_utm->>'utm_medium', 80), left(p_utm->>'utm_campaign', 120), left(p_locale, 8),
    case when ua ~* 'ipad|tablet' then 'tablet' when ua ~* 'mobi|iphone|android' then 'mobile' else 'desktop' end,
    case when ua ~* 'edg/' then 'Edge' when ua ~* 'opr/|opera' then 'Opera' when ua ~* 'samsungbrowser' then 'Samsung' when ua ~* 'firefox|fxios' then 'Firefox'
         when ua ~* 'chrome|crios' then 'Chrome' when ua ~* 'safari' then 'Safari' else 'Inne' end,
    case when ua ~* 'iphone|ipad|ipod' then 'iOS' when ua ~* 'android' then 'Android' when ua ~* 'mac os' then 'macOS' when ua ~* 'windows' then 'Windows' when ua ~* 'linux' then 'Linux' else 'Inne' end,
    nullif(h->>'cf-ipcountry', 'XX'), p_screen)
  on conflict (id) do nothing;
end $$;

create or replace function public.track_ping(p_id uuid, p_duration int, p_scroll int, p_sections text[] default '{}', p_click text default null)
returns void language sql security definer set search_path = public as $$
  update public.site_visits set
    duration_ms = greatest(duration_ms, least(coalesce(p_duration, 0), 3600000)),
    scroll = greatest(scroll, least(greatest(coalesce(p_scroll, 0), 0), 100)),
    sections = (select coalesce(array_agg(distinct x), '{}') from unnest(sections || coalesce(p_sections[1:30], '{}')) x where length(x) <= 40),
    clicks = case when p_click is not null and jsonb_array_length(clicks) < 40 then clicks || jsonb_build_array(jsonb_build_object('c', left(p_click, 60), 't', coalesce(p_duration, 0))) else clicks end,
    updated_at = now()
  where id = p_id and created_at > now() - interval '12 hours';
$$;
revoke all on function public.track_view(uuid, text, text, jsonb, text, int), public.track_ping(uuid, int, int, text[], text) from public;
grant execute on function public.track_view(uuid, text, text, jsonb, text, int), public.track_ping(uuid, int, int, text[], text) to anon, authenticated;

alter table public.site_events drop constraint site_events_kind_check;
alter table public.site_events add constraint site_events_kind_check check (kind in ('lang_detected','lang_switched','lang_kept','cookie_accept','cookie_reject','waitlist_view','card_scan','card_signup','cta_click','waitlist_signup'));

-- admin: traffic analytics (sessions = same daily visitor with gaps < 30 min)
create or replace function public.admin_analytics(p_days int default 30) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw' - make_interval(days => greatest(p_days, 1) - 1);
        prev timestamptz; r json;
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  prev := since - (now() - since);
  with v as (select * from public.site_visits where created_at >= since),
       vs as (select *, sum(new_s) over (partition by visitor order by created_at) sn from (
                select *, case when lag(created_at) over (partition by visitor order by created_at) is null
                                 or created_at - lag(created_at) over (partition by visitor order by created_at) > interval '30 minutes' then 1 else 0 end new_s from v) a),
       s as (select visitor, sn, min(created_at) started, max(created_at + make_interval(secs => duration_ms / 1000.0)) ended, count(*) views,
                    sum(duration_ms) dur, max(scroll) scroll, (array_agg(referrer order by created_at))[1] referrer, (array_agg(utm_source order by created_at))[1] utm,
                    (array_agg(device order by created_at))[1] device, (array_agg(browser order by created_at))[1] browser, (array_agg(os order by created_at))[1] os,
                    (array_agg(country order by created_at))[1] country, (array_agg(locale order by created_at))[1] locale,
                    json_agg(json_build_object('path', path, 'at', created_at, 'dur', duration_ms, 'scroll', scroll, 'sections', sections, 'clicks', clicks) order by created_at) pages
             from vs group by visitor, sn),
       days as (select generate_series(since at time zone 'Europe/Warsaw', now() at time zone 'Europe/Warsaw', interval '1 day')::date d)
  select json_build_object(
    'views', (select count(*) from v),
    'visitors', (select count(distinct visitor || (created_at at time zone 'Europe/Warsaw')::date) from v),
    'sessions', (select count(*) from s),
    'avg_duration', (select coalesce(round(avg(dur) / 1000.0), 0) from s),
    'engaged', (select coalesce(round(100.0 * count(*) filter (where dur >= 10000 or views > 1 or scroll >= 50) / nullif(count(*), 0)), 0) from s),
    'avg_scroll', (select coalesce(round(avg(scroll)), 0) from v),
    'prev_views', (select count(*) from public.site_visits where created_at >= prev and created_at < since),
    'prev_visitors', (select count(distinct visitor || (created_at at time zone 'Europe/Warsaw')::date) from public.site_visits where created_at >= prev and created_at < since),
    'live', (select count(distinct visitor) from public.site_visits where updated_at > now() - interval '5 minutes'),
    'signups', (select count(*) from public.waitlist_subscribers where created_at >= since),
    'prev_signups', (select count(*) from public.waitlist_subscribers where created_at >= prev and created_at < since),
    'series', (select json_agg(json_build_object('d', d,
                 'views', (select count(*) from v where (created_at at time zone 'Europe/Warsaw')::date = d),
                 'visitors', (select count(distinct visitor) from v where (created_at at time zone 'Europe/Warsaw')::date = d),
                 'signups', (select count(*) from public.waitlist_subscribers w where (w.created_at at time zone 'Europe/Warsaw')::date = d)) order by d) from days),
    'hours', (select coalesce(json_agg(json_build_object('h', h, 'n', n) order by h), '[]'::json) from (select extract(hour from created_at at time zone 'Europe/Warsaw')::int h, count(*) n from v group by 1) x),
    'pages', (select coalesce(json_agg(json_build_object('k', path, 'n', n, 'dur', dur) order by n desc), '[]'::json) from (select path, count(*) n, round(avg(duration_ms) / 1000.0) dur from v group by 1 order by 2 desc limit 12) x),
    'referrers', (select coalesce(json_agg(json_build_object('k', k, 'n', n) order by n desc), '[]'::json) from (select coalesce(referrer, 'Bezpośrednio') k, count(*) n from s group by 1 order by 2 desc limit 10) x),
    'utm', (select coalesce(json_agg(json_build_object('k', k, 'n', n) order by n desc), '[]'::json) from (select concat_ws(' / ', utm_source, utm_medium, utm_campaign) k, count(*) n from v where utm_source is not null group by 1 order by 2 desc limit 10) x),
    'devices', (select coalesce(json_agg(json_build_object('k', device, 'n', n) order by n desc), '[]'::json) from (select device, count(*) n from s group by 1) x),
    'browsers', (select coalesce(json_agg(json_build_object('k', browser, 'n', n) order by n desc), '[]'::json) from (select browser, count(*) n from s group by 1) x),
    'os', (select coalesce(json_agg(json_build_object('k', os, 'n', n) order by n desc), '[]'::json) from (select os, count(*) n from s group by 1) x),
    'countries', (select coalesce(json_agg(json_build_object('k', coalesce(country, '?'), 'n', n) order by n desc), '[]'::json) from (select country, count(*) n from s group by 1 order by 2 desc limit 12) x),
    'locales', (select coalesce(json_agg(json_build_object('k', coalesce(locale, '?'), 'n', n) order by n desc), '[]'::json) from (select locale, count(*) n from v group by 1) x),
    'sections', (select coalesce(json_agg(json_build_object('k', sec, 'n', n)), '[]'::json) from (select sec, count(*) n from v, unnest(sections) sec where path = '/' group by 1) x),
    'home_views', (select count(*) from v where path = '/'),
    'scroll_buckets', (select json_build_object('25', count(*) filter (where scroll >= 25), '50', count(*) filter (where scroll >= 50), '75', count(*) filter (where scroll >= 75), '100', count(*) filter (where scroll >= 95), 'all', count(*)) from v where path = '/'),
    'clicks', (select coalesce(json_agg(json_build_object('k', c, 'n', n) order by n desc), '[]'::json) from (select x->>'c' c, count(*) n from v, jsonb_array_elements(clicks) x group by 1 order by 2 desc limit 12) y),
    'recent', (select coalesce(json_agg(row_to_json(z) order by z.started desc), '[]'::json) from (select * from s order by started desc limit 60) z)
  ) into r;
  return r;
end $$;
revoke all on function public.admin_analytics(int) from public, anon;
grant execute on function public.admin_analytics(int) to authenticated;

-- ============================================================ admin: overview, companies, users
create or replace function public.admin_overview() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return json_build_object(
    'leads', (select count(*) from public.waitlist_subscribers),
    'leads_7d', (select count(*) from public.waitlist_subscribers where created_at > now() - interval '7 days'),
    'leads_new', (select count(*) from public.waitlist_subscribers where status = 'pending'),
    'companies', (select count(*) from public.companies),
    'users', (select count(*) from auth.users),
    'cards', (select count(*) from public.loyalty_cards),
    'stamps_7d', (select coalesce(sum(delta), 0) from public.loyalty_events where kind = 'stamp' and created_at > now() - interval '7 days'),
    'views_today', (select count(*) from public.site_visits where created_at >= date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw'),
    'visitors_today', (select count(distinct visitor) from public.site_visits where created_at >= date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw'),
    'live', (select count(distinct visitor) from public.site_visits where updated_at > now() - interval '5 minutes'),
    'latest_leads', (select coalesce(json_agg(row_to_json(x)), '[]'::json) from (select id, email, phone, company, business_type, source, created_at, status from public.waitlist_subscribers order by created_at desc limit 6) x)
  );
end $$;

create or replace function public.admin_companies() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(json_agg(json_build_object(
      'id', c.id, 'name', c.name, 'industry', c.industry, 'status', c.status, 'modules', c.modules, 'city', c.city, 'email', c.email, 'phone', c.phone,
      'address', c.address, 'website', c.website, 'nip', c.nip, 'logo_url', c.logo_url, 'created_at', c.created_at, 'waitlist_id', c.waitlist_id,
      'members', (select coalesce(json_agg(json_build_object('user_id', m.user_id, 'role', m.role, 'name', m.display_name, 'email', coalesce(m.email, u.email), 'last_sign_in_at', u.last_sign_in_at) order by m.created_at), '[]'::json)
                  from public.company_members m left join auth.users u on u.id = m.user_id where m.company_id = c.id),
      'programs', (select count(*) from public.loyalty_programs where company_id = c.id),
      'cards', (select count(*) from public.loyalty_cards where company_id = c.id),
      'stamps_30d', (select coalesce(sum(delta), 0) from public.loyalty_events where company_id = c.id and kind = 'stamp' and created_at > now() - interval '30 days')
    ) order by c.created_at desc), '[]'::json) from public.companies c);
end $$;

create or replace function public.admin_users() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(json_agg(json_build_object(
      'id', u.id, 'email', u.email, 'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'login'), 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'platform_role', a.role,
      'companies', (select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'role', m.role)), '[]'::json) from public.company_members m join public.companies c on c.id = m.company_id where m.user_id = u.id)
    ) order by u.created_at desc), '[]'::json)
    from auth.users u left join public.admin_profiles a on a.user_id = u.id);
end $$;

-- the logged-in user: platform role + companies (drives /panel and /admin routing)
create or replace function public.my_access() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'user_id', auth.uid(),
    'platform_role', (select role from public.admin_profiles where user_id = auth.uid()),
    'name', (select coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'login') from auth.users where id = auth.uid()),
    'companies', (select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'role', m.role, 'modules', c.modules, 'status', c.status, 'logo_url', c.logo_url) order by c.name), '[]'::json)
                  from public.company_members m join public.companies c on c.id = m.company_id where m.user_id = auth.uid()));
$$;
revoke all on function public.admin_overview(), public.admin_companies(), public.admin_users(), public.my_access() from public, anon;
grant execute on function public.admin_overview(), public.admin_companies(), public.admin_users(), public.my_access() to authenticated;

-- ============================================================ audit log
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid default auth.uid(),
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  company_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created on public.audit_log(created_at desc);
alter table public.audit_log enable row level security;
create policy "admins read audit" on public.audit_log for select to authenticated using (public.is_superadmin());

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old)); changed text[]; cid uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k) into changed from jsonb_each(to_jsonb(new)) n(k, v) where k not in ('updated_at') and to_jsonb(old)->k is distinct from v;
    if changed is null then return new; end if;
  end if;
  cid := coalesce(public.try_uuid(rec->>'company_id'), case when tg_table_name = 'companies' then public.try_uuid(rec->>'id') end);
  insert into public.audit_log (actor, actor_email, action, target_type, target_id, company_id, detail)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), lower(tg_op), tg_table_name,
          coalesce(rec->>'id', rec->>'key', rec->>'user_id'), cid,
          jsonb_strip_nulls(jsonb_build_object('name', coalesce(rec->>'name', rec->>'email', rec->>'key', rec->>'customer_name'), 'changed', to_jsonb(changed), 'role', rec->>'role')));
  return coalesce(new, old);
end $$;
create trigger audit_companies after insert or update or delete on public.companies for each row execute function public.audit_row();
create trigger audit_members after insert or update or delete on public.company_members for each row execute function public.audit_row();
create trigger audit_programs after insert or update or delete on public.loyalty_programs for each row execute function public.audit_row();
create trigger audit_settings after insert or update on public.site_settings for each row execute function public.audit_row();
create trigger audit_waitlist after update or delete on public.waitlist_subscribers for each row execute function public.audit_row();
create trigger audit_admins after insert or update or delete on public.admin_profiles for each row execute function public.audit_row();

-- ============================================================ storage: wallet assets (logos, stamp icons, rendered strips)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wallet', 'wallet', true, 3145728, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;
create policy "wallet managers read" on storage.objects for select to authenticated
  using (bucket_id = 'wallet' and (storage.foldername(name))[1] = 'c' and public.can_manage_company(public.try_uuid((storage.foldername(name))[2])));
create policy "wallet managers insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'wallet' and (storage.foldername(name))[1] = 'c' and public.can_manage_company(public.try_uuid((storage.foldername(name))[2])));
create policy "wallet managers update" on storage.objects for update to authenticated
  using (bucket_id = 'wallet' and (storage.foldername(name))[1] = 'c' and public.can_manage_company(public.try_uuid((storage.foldername(name))[2])));
create policy "wallet managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wallet' and (storage.foldername(name))[1] = 'c' and public.can_manage_company(public.try_uuid((storage.foldername(name))[2])));

-- ============================================================ platform admins
update public.admin_profiles set role = 'admin' where role = 'moderator'
  and user_id in (select id from auth.users where email in ('dmytrii@tableflow.pl', 'jakub@tableflow.pl'));

notify pgrst, 'reload schema';
