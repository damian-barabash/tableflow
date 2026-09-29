-- TableFlow: AI reception (ElevenLabs Agents + Twilio numbers), universal booking calendar, CRM, calls.
--
-- One model fits every business: a company books "resources" (people, tables, rooms, crews, equipment)
-- for "services" (duration + buffer + party size). Availability = working hours − time off − bookings,
-- the AI agent reads it live through webhook tools of the edge function "reception".
-- ElevenLabs objects (agents, KB docs, tools, numbers) are a deployment target: this database is the
-- source of truth, so switching the ElevenLabs account = re-deploy, nothing is lost.

create extension if not exists btree_gist with schema extensions;

-- ============================================================ helpers
/** Polish-friendly phone normalisation (same rule as loyalty_join): digits, 9 digits → +48. */
create or replace function public.rc_phone(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    when length(regexp_replace(p, '\D', '', 'g')) = 9 then '48' || regexp_replace(p, '\D', '', 'g')
    when length(regexp_replace(p, '\D', '', 'g')) between 10 and 15 then regexp_replace(p, '\D', '', 'g')
    else null end;
$$;

-- ============================================================ secrets (Supabase Vault) — service role only
create or replace function public.rc_secret(p_name text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;
create or replace function public.rc_secret_set(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare v uuid;
begin
  select id into v from vault.secrets where name = p_name;
  if p_value is null or p_value = '' then
    if v is not null then delete from vault.secrets where id = v; end if;
    return;
  end if;
  if v is null then perform vault.create_secret(p_value, p_name, 'TableFlow reception');
  else perform vault.update_secret(v, p_value, p_name, 'TableFlow reception'); end if;
end $$;
revoke all on function public.rc_secret(text), public.rc_secret_set(text, text) from public, anon, authenticated;
grant execute on function public.rc_secret(text), public.rc_secret_set(text, text) to service_role;

-- ============================================================ platform (one ElevenLabs account for all companies)
create table public.rc_platform (
  id int primary key default 1 check (id = 1),
  el_key_hint text,                 -- "sk_…3ed39" — the key itself lives in Vault (rc_el_api_key)
  el_account text,                  -- account label / tier, shown in admin
  el_status text not null default 'missing' check (el_status in ('missing','ok','error')),
  el_error text,
  el_checked_at timestamptz,
  el_generation int not null default 1,  -- bumps on account switch → every agent is re-created
  tools jsonb not null default '{}'::jsonb,        -- tool name → ElevenLabs tool id (current account)
  post_call_webhook_id text,
  webhooks_ok boolean not null default false,
  default_llm text not null default 'gemini-2.5-flash',
  default_tts_model text not null default 'eleven_v3_conversational',
  twilio_sid_hint text,
  updated_at timestamptz not null default now()
);
insert into public.rc_platform (id) values (1) on conflict do nothing;
alter table public.rc_platform enable row level security;
create policy "admins read platform" on public.rc_platform for select to authenticated using (public.is_superadmin());
create policy "admins update platform" on public.rc_platform for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

-- voices offered to clients (curated by admins from the ElevenLabs library)
create table public.rc_voices (
  voice_id text primary key,
  name text not null,
  gender text,
  accent text,
  description text,
  preview_url text,
  public_owner_id text,             -- library voices must be added to the account before use
  enabled boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.rc_voices enable row level security;
create policy "anyone logged reads voices" on public.rc_voices for select to authenticated using (enabled or public.is_superadmin());
create policy "admins write voices" on public.rc_voices for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

-- phone numbers (Twilio, imported into ElevenLabs); only admins assign them to companies
create table public.rc_numbers (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,   -- E.164, e.g. +48221234567
  label text,
  provider text not null default 'twilio',
  el_phone_id text,                    -- id in the current ElevenLabs account (null → not imported yet)
  company_id uuid references public.companies(id) on delete set null,
  assigned_at timestamptz,
  last_error text,
  note text,
  created_at timestamptz not null default now()
);
create index rc_numbers_company on public.rc_numbers(company_id);
alter table public.rc_numbers enable row level security;
create policy "admins manage numbers" on public.rc_numbers for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "members read own numbers" on public.rc_numbers for select to authenticated using (company_id is not null and public.can_access_company(company_id));

-- ============================================================ company configuration
create table public.rc_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  assistant_name text not null default 'Ania' check (length(btrim(assistant_name)) between 1 and 40),
  voice_id text,
  voice_name text,
  voice_speed numeric not null default 1.0 check (voice_speed between 0.7 and 1.2),
  voice_stability numeric not null default 0.45 check (voice_stability between 0 and 1),
  voice_quality text not null default 'natural' check (voice_quality in ('natural','fast')),
  language text not null default 'pl',
  extra_languages text[] not null default array['en','uk']::text[],
  greeting text,
  tone text not null default 'warm' check (tone in ('warm','professional','casual')),
  business_description text,
  instructions text,
  timezone text not null default 'Europe/Warsaw',
  slot_step_min int not null default 15 check (slot_step_min in (5,10,15,20,30,60)),
  min_notice_min int not null default 60 check (min_notice_min between 0 and 20160),
  max_days_ahead int not null default 60 check (max_days_ahead between 1 and 365),
  ai_booking_status text not null default 'confirmed' check (ai_booking_status in ('confirmed','pending')),
  allow_cancel boolean not null default true,
  allow_reschedule boolean not null default true,
  cancel_notice_min int not null default 120 check (cancel_notice_min between 0 and 20160),
  offer_loyalty boolean not null default true,
  ask_name boolean not null default true,
  transfer_phone text,
  after_hours_message text,
  updated_at timestamptz not null default now()
);
create trigger rc_settings_updated before update on public.rc_settings for each row execute function public.set_updated_at();

-- deployment state of the company's agent (written only by the edge function)
create table public.rc_agents (
  company_id uuid primary key references public.companies(id) on delete cascade,
  agent_id text,
  kb_doc_id text,
  el_generation int,
  config_changed_at timestamptz not null default now(),
  synced_at timestamptz,
  sync_error text,
  last_test_at timestamptz
);

-- who / what gets booked: people, tables, rooms, crews, equipment
create table public.rc_resources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null default 'staff' check (kind in ('staff','table','room','team','equipment')),
  name text not null check (length(btrim(name)) between 1 and 80),
  title text,                         -- "Barber", "Stolik przy oknie", "Ekipa kelnerska"
  description text,
  capacity int not null default 1 check (capacity between 1 and 10000),
  min_capacity int not null default 1 check (min_capacity between 1 and 10000),
  color text not null default '#464f96',
  member_user_id uuid references auth.users(id) on delete set null,
  ai_bookable boolean not null default true,
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create index rc_resources_company on public.rc_resources(company_id, sort);

-- weekly hours: resource_id null = business opening hours; a resource without rows follows the business
create table public.rc_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  resource_id uuid references public.rc_resources(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Monday
  opens time not null,
  closes time not null,
  check (closes > opens)
);
create index rc_hours_company on public.rc_hours(company_id, resource_id, weekday);

-- closures / holidays / vacations: resource_id null = whole business closed
create table public.rc_time_off (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  resource_id uuid references public.rc_resources(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index rc_time_off_company on public.rc_time_off(company_id, starts_at);

create table public.rc_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  category text,
  description text,
  duration_min int not null default 60 check (duration_min between 5 and 1440),
  buffer_min int not null default 0 check (buffer_min between 0 and 480),
  price_from numeric(10,2),
  price_to numeric(10,2),
  price_note text,
  resource_kind text not null default 'staff' check (resource_kind in ('staff','table','room','team','equipment')),
  party_min int not null default 1 check (party_min between 1 and 10000),
  party_max int not null default 1 check (party_max between 1 and 10000),
  min_notice_min int check (min_notice_min between 0 and 43200),
  ai_bookable boolean not null default true,
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  check (party_max >= party_min)
);
create index rc_services_company on public.rc_services(company_id, sort);

-- who performs a service; no rows = every active resource of services.resource_kind
create table public.rc_service_resources (
  service_id uuid not null references public.rc_services(id) on delete cascade,
  resource_id uuid not null references public.rc_resources(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (service_id, resource_id)
);

-- free-form knowledge: FAQ, policies, menu, parking…
create table public.rc_knowledge (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null default 'faq' check (kind in ('faq','info','policy')),
  question text not null check (length(btrim(question)) between 1 and 300),
  answer text not null check (length(btrim(answer)) between 1 and 4000),
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rc_knowledge_company on public.rc_knowledge(company_id, sort);
create trigger rc_knowledge_updated before update on public.rc_knowledge for each row execute function public.set_updated_at();

-- ============================================================ CRM, calls, bookings
create table public.rc_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text,
  phone text,
  email text,
  notes text,
  tags text[] not null default '{}'::text[],
  source text not null default 'panel' check (source in ('phone','ai_test','panel','web','loyalty','import')),
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index rc_clients_phone on public.rc_clients(company_id, phone) where phone is not null;
create index rc_clients_company on public.rc_clients(company_id, created_at desc);
create trigger rc_clients_updated before update on public.rc_clients for each row execute function public.set_updated_at();

create table public.rc_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id text unique,
  agent_id text,
  channel text not null default 'phone' check (channel in ('phone','test')),
  caller_phone text,
  called_number text,
  client_id uuid references public.rc_clients(id) on delete set null,
  started_at timestamptz not null default now(),
  duration_s int,
  status text not null default 'in_progress' check (status in ('in_progress','done','failed')),
  title text,
  summary text,
  outcome text check (outcome in ('booked','rescheduled','cancelled','info','callback','other')),
  customer_name text,
  transcript jsonb,
  has_audio boolean not null default false,
  needs_callback boolean not null default false,
  callback_note text,
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null,
  note text,
  cost_usd numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rc_calls_company on public.rc_calls(company_id, started_at desc);
create index rc_calls_client on public.rc_calls(client_id);
create trigger rc_calls_updated before update on public.rc_calls for each row execute function public.set_updated_at();

create table public.rc_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_id uuid references public.rc_services(id) on delete set null,
  resource_id uuid references public.rc_resources(id) on delete set null,
  client_id uuid references public.rc_clients(id) on delete set null,
  call_id uuid references public.rc_calls(id) on delete set null,
  service_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_until timestamptz not null,          -- ends_at + service buffer: the resource is busy until then
  party_size int not null default 1 check (party_size between 1 and 10000),
  status text not null default 'confirmed' check (status in ('pending','confirmed','cancelled','completed','no_show')),
  source text not null default 'panel' check (source in ('phone','ai_test','panel','web','booksy','versum')),
  customer_name text,
  customer_phone text,
  customer_email text,
  notes text,
  internal_note text,
  price numeric(10,2),
  cancel_reason text,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and block_until >= ends_at),
  -- no double booking of the same resource, ever (also protects against two parallel phone calls)
  constraint rc_bookings_no_overlap exclude using gist (
    resource_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, block_until, '[)') with &&
  ) where (status in ('pending','confirmed') and resource_id is not null)
);
create index rc_bookings_company on public.rc_bookings(company_id, starts_at);
create index rc_bookings_client on public.rc_bookings(client_id);
create trigger rc_bookings_updated before update on public.rc_bookings for each row execute function public.set_updated_at();

create or replace function public.rc_norm_phone() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'rc_clients' then new.phone := public.rc_phone(new.phone);
  elsif tg_table_name = 'rc_bookings' then new.customer_phone := coalesce(public.rc_phone(new.customer_phone), nullif(btrim(new.customer_phone), ''));
  end if;
  return new;
end $$;
create trigger rc_clients_phone before insert or update of phone on public.rc_clients for each row execute function public.rc_norm_phone();
create trigger rc_bookings_phone before insert or update of customer_phone on public.rc_bookings for each row execute function public.rc_norm_phone();

-- ============================================================ "the agent must be re-deployed" marker
create or replace function public.rc_touch() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  cid uuid := coalesce(public.try_uuid(rec->>'company_id'), case when tg_table_name = 'companies' then public.try_uuid(rec->>'id') end);
begin
  -- skip when the company itself is being deleted (cascade) — the row would violate the FK
  if cid is not null and exists (select 1 from public.companies where id = cid) then
    insert into public.rc_agents (company_id, config_changed_at) values (cid, now())
    on conflict (company_id) do update set config_changed_at = now();
  end if;
  return coalesce(new, old);
end $$;
create trigger rc_touch after insert or update or delete on public.rc_settings for each row execute function public.rc_touch();
create trigger rc_touch after insert or update or delete on public.rc_resources for each row execute function public.rc_touch();
create trigger rc_touch after insert or update or delete on public.rc_services for each row execute function public.rc_touch();
create trigger rc_touch after insert or update or delete on public.rc_service_resources for each row execute function public.rc_touch();
create trigger rc_touch after insert or update or delete on public.rc_hours for each row execute function public.rc_touch();
create trigger rc_touch after insert or update or delete on public.rc_knowledge for each row execute function public.rc_touch();
create trigger rc_touch after update of name, industry, address, city, phone, website, email on public.companies for each row execute function public.rc_touch();
create trigger rc_touch after insert or update or delete on public.loyalty_programs for each row execute function public.rc_touch();

-- ============================================================ RLS
alter table public.rc_settings enable row level security;
alter table public.rc_agents enable row level security;
alter table public.rc_resources enable row level security;
alter table public.rc_hours enable row level security;
alter table public.rc_time_off enable row level security;
alter table public.rc_services enable row level security;
alter table public.rc_service_resources enable row level security;
alter table public.rc_knowledge enable row level security;
alter table public.rc_clients enable row level security;
alter table public.rc_calls enable row level security;
alter table public.rc_bookings enable row level security;

-- configuration: everyone in the company reads, owners/managers write
do $$
declare t text;
begin
  foreach t in array array['rc_settings','rc_resources','rc_hours','rc_services','rc_service_resources','rc_knowledge'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.can_access_company(company_id))', t);
    execute format('create policy "managers insert" on public.%I for insert to authenticated with check (public.can_manage_company(company_id))', t);
    execute format('create policy "managers update" on public.%I for update to authenticated using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id))', t);
    execute format('create policy "managers delete" on public.%I for delete to authenticated using (public.can_manage_company(company_id))', t);
  end loop;
  -- day-to-day work: the whole team (reception desk staff too)
  foreach t in array array['rc_time_off','rc_clients','rc_bookings'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.can_access_company(company_id))', t);
    execute format('create policy "members insert" on public.%I for insert to authenticated with check (public.can_access_company(company_id))', t);
    execute format('create policy "members update" on public.%I for update to authenticated using (public.can_access_company(company_id)) with check (public.can_access_company(company_id))', t);
  end loop;
end $$;
create policy "managers delete" on public.rc_time_off for delete to authenticated using (public.can_manage_company(company_id));
create policy "managers delete" on public.rc_clients for delete to authenticated using (public.can_manage_company(company_id));
create policy "managers delete" on public.rc_bookings for delete to authenticated using (public.can_manage_company(company_id));
create policy "members read" on public.rc_agents for select to authenticated using (public.can_access_company(company_id));
create policy "members read" on public.rc_calls for select to authenticated using (public.can_access_company(company_id));
create policy "members update" on public.rc_calls for update to authenticated using (public.can_access_company(company_id)) with check (public.can_access_company(company_id));
create policy "managers delete" on public.rc_calls for delete to authenticated using (public.can_manage_company(company_id));

-- ============================================================ RPC for the panel
/** CRM list with visit/call stats and the loyalty card (matched by phone). */
create or replace function public.rc_clients_list(p_company uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_access_company(p_company) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(json_agg(x order by x.last_at desc nulls last), '[]'::json) from (
    select c.id, c.name, c.phone, c.email, c.notes, c.tags, c.source, c.marketing_consent, c.created_at,
      (select count(*) from public.rc_bookings b where b.client_id = c.id and b.status in ('confirmed','completed') and b.starts_at < now()) as visits,
      (select count(*) from public.rc_bookings b where b.client_id = c.id and b.status = 'no_show') as no_shows,
      (select min(b.starts_at) from public.rc_bookings b where b.client_id = c.id and b.status in ('pending','confirmed') and b.starts_at >= now()) as next_at,
      (select count(*) from public.rc_calls k where k.client_id = c.id) as calls,
      greatest(c.created_at, (select max(b.starts_at) from public.rc_bookings b where b.client_id = c.id and b.starts_at < now()), (select max(k.started_at) from public.rc_calls k where k.client_id = c.id)) as last_at,
      (select json_build_object('stamps', lc.stamps, 'required', lp.stamps_required, 'code', lc.code, 'program', lp.name)
         from public.loyalty_cards lc join public.loyalty_programs lp on lp.id = lc.program_id
        where lc.company_id = c.company_id and c.phone is not null and lc.phone = c.phone order by lc.created_at desc limit 1) as loyalty
    from public.rc_clients c where c.company_id = p_company) x);
end $$;
revoke all on function public.rc_clients_list(uuid) from public, anon;
grant execute on function public.rc_clients_list(uuid) to authenticated;

/** Admin overview of the reception: numbers, agents, calls per company. */
create or replace function public.admin_reception() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return json_build_object(
    'platform', (select row_to_json(p) from public.rc_platform p where id = 1),
    'numbers', (select coalesce(json_agg(json_build_object('id', n.id, 'phone_number', n.phone_number, 'label', n.label, 'el_phone_id', n.el_phone_id, 'company_id', n.company_id,
                  'company', c.name, 'assigned_at', n.assigned_at, 'last_error', n.last_error, 'note', n.note, 'created_at', n.created_at) order by n.created_at), '[]'::json)
                from public.rc_numbers n left join public.companies c on c.id = n.company_id),
    'companies', (select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'modules', c.modules,
                  'agent_id', a.agent_id, 'synced_at', a.synced_at, 'config_changed_at', a.config_changed_at, 'sync_error', a.sync_error, 'el_generation', a.el_generation,
                  'voice', s.voice_name, 'services', (select count(*) from public.rc_services where company_id = c.id and active),
                  'resources', (select count(*) from public.rc_resources where company_id = c.id and active),
                  'calls_30d', (select count(*) from public.rc_calls where company_id = c.id and started_at > now() - interval '30 days'),
                  'minutes_30d', (select coalesce(round(sum(duration_s) / 60.0), 0) from public.rc_calls where company_id = c.id and started_at > now() - interval '30 days'),
                  'numbers', (select coalesce(json_agg(n.phone_number), '[]'::json) from public.rc_numbers n where n.company_id = c.id)) order by c.name), '[]'::json)
                from public.companies c left join public.rc_agents a on a.company_id = c.id left join public.rc_settings s on s.company_id = c.id
                where c.modules && array['reception']::text[] or a.agent_id is not null),
    'voices', (select coalesce(json_agg(v order by v.sort, v.name), '[]'::json) from public.rc_voices v)
  );
end $$;
revoke all on function public.admin_reception() from public, anon;
grant execute on function public.admin_reception() to authenticated;

-- audit trail for the admin-only objects
create trigger audit_rc_numbers after insert or update or delete on public.rc_numbers for each row execute function public.audit_row();
create trigger audit_rc_settings after insert or update on public.rc_settings for each row execute function public.audit_row();

notify pgrst, 'reload schema';
