export type Consent = 'accepted' | 'rejected' | null
const KEY = 'tf_consent'
export function readConsent(): Consent {
  try { const v = localStorage.getItem(KEY); return v === 'accepted' || v === 'rejected' ? v : null } catch { return null }
}
export function writeConsent(v: Exclude<Consent, null>) {
  try { localStorage.setItem(KEY, v) } catch { /* ignore */ }
}
export function analyticsAllowed(): boolean { return readConsent() === 'accepted' }
