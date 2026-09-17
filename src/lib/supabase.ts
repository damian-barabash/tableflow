/**
 * Minimal PostgREST client: the landing only calls two RPCs, so we skip the 58 KB supabase-js bundle.
 */
export const SUPABASE_URL = 'https://ahtjgghocwegyepxoeru.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_7zS8ao7Vkz0zCPVb7_tWBw_GKTjQk8e'

async function rpc<T>(fn: string, args: Record<string, unknown>, opts?: { keepalive?: boolean }): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify(args),
      keepalive: opts?.keepalive,
    })
    const text = await res.text()
    if (!res.ok) {
      let msg = text
      try { msg = (JSON.parse(text) as { message?: string }).message ?? text } catch { /* raw */ }
      return { data: null, error: msg || `HTTP ${res.status}` }
    }
    try { return { data: (text ? JSON.parse(text) : null) as T, error: null } } catch { return { data: text as unknown as T, error: null } }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'network' }
  }
}

export type JoinResult = 'created' | 'exists' | 'invalid' | 'consent' | 'error'

function utmFromLocation(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const p = new URLSearchParams(window.location.search)
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref']) {
      const v = p.get(k); if (v) out[k] = v.slice(0, 120)
    }
  } catch { /* ignore */ }
  return out
}

export async function joinWaitlist(input: { email: string; locale: string; businessType?: string; company?: string; consent: boolean }): Promise<JoinResult> {
  const { data, error } = await rpc<string>('join_waitlist', {
    p_email: input.email,
    p_locale: input.locale,
    p_business_type: input.businessType ?? null,
    p_company: input.company ?? null,
    p_consent: input.consent,
    p_utm: utmFromLocation(),
    p_user_agent: navigator.userAgent,
  })
  if (error) {
    if (error.includes('invalid_email')) return 'invalid'
    if (error.includes('consent_required')) return 'consent'
    return 'error'
  }
  return data === 'exists' ? 'exists' : 'created'
}

export type ContactResult = 'created' | 'exists' | 'invalid_email' | 'invalid_phone' | 'consent' | 'error'

/** Card page: e-mail OR phone. */
export async function joinWaitlistContact(input: { email?: string; phone?: string; locale: string; consent: boolean; source?: string }): Promise<ContactResult> {
  const { data, error } = await rpc<string>('join_waitlist_contact', {
    p_email: input.email ?? null, p_phone: input.phone ?? null, p_locale: input.locale, p_source: input.source ?? 'card',
    p_consent: input.consent, p_utm: utmFromLocation(), p_user_agent: navigator.userAgent,
  })
  if (error) {
    if (error.includes('invalid_email')) return 'invalid_email'
    if (error.includes('invalid_phone') || error.includes('contact_required')) return 'invalid_phone'
    if (error.includes('consent_required')) return 'consent'
    return 'error'
  }
  return data === 'exists' ? 'exists' : 'created'
}

export type EventKind = 'lang_detected' | 'lang_switched' | 'lang_kept' | 'cookie_accept' | 'cookie_reject' | 'waitlist_view' | 'card_scan' | 'card_signup'

/** Anonymous, aggregate-only event. Fire-and-forget. */
export function logEvent(kind: EventKind, locale?: string, detail?: Record<string, unknown>) {
  void rpc('log_site_event', { p_kind: kind, p_locale: locale ?? null, p_detail: detail ?? {} }, { keepalive: true })
}
