-- Domain move tableflow.pl → tableflow.studio: own-site referrers are not counted as external sources.
CREATE OR REPLACE FUNCTION public.track_view(p_id uuid, p_path text, p_referrer text DEFAULT NULL::text, p_utm jsonb DEFAULT '{}'::jsonb, p_locale text DEFAULT NULL::text, p_screen integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare h json := coalesce(current_setting('request.headers', true)::json, '{}'::json); ua text := coalesce(h->>'user-agent', ''); s bytea; v text; ref text;
begin
  if coalesce((select (value->>'enabled')::boolean from public.site_settings where key = 'analytics'), true) = false then return; end if;
  if ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|axios|node-fetch)' then return; end if;
  if p_path is null or p_path ~ '^/(panel|admin|edit-mod|s)(/|$)' then return; end if;
  insert into public.analytics_salt (day) values (current_date) on conflict do nothing;
  select salt into s from public.analytics_salt where day = current_date;
  v := substr(encode(digest(s || convert_to(public.req_ip() || '|' || ua, 'utf8'), 'sha256'), 'hex'), 1, 20);
  ref := lower(substring(coalesce(p_referrer, '') from '^https?://(?:www\.)?([^/:?#]+)'));
  if ref in ('tableflow.studio', 'www.tableflow.studio', 'tableflow.pl') or ref = '' or ref ~ '^(localhost|127\.)' then ref := null; end if;
  insert into public.site_visits (id, visitor, path, referrer, utm_source, utm_medium, utm_campaign, locale, device, browser, os, country, screen)
  values (p_id, v, left(p_path, 200), left(ref, 120),
    left(p_utm->>'utm_source', 80), left(p_utm->>'utm_medium', 80), left(p_utm->>'utm_campaign', 120), left(p_locale, 8),
    case when ua ~* 'ipad|tablet' then 'tablet' when ua ~* 'mobi|iphone|android' then 'mobile' else 'desktop' end,
    case when ua ~* 'edg/' then 'Edge' when ua ~* 'opr/|opera' then 'Opera' when ua ~* 'samsungbrowser' then 'Samsung' when ua ~* 'firefox|fxios' then 'Firefox'
         when ua ~* 'chrome|crios' then 'Chrome' when ua ~* 'safari' then 'Safari' else 'Inne' end,
    case when ua ~* 'iphone|ipad|ipod' then 'iOS' when ua ~* 'android' then 'Android' when ua ~* 'mac os' then 'macOS' when ua ~* 'windows' then 'Windows' when ua ~* 'linux' then 'Linux' else 'Inne' end,
    nullif(h->>'cf-ipcountry', 'XX'), p_screen)
  on conflict (id) do nothing;
end $function$;
