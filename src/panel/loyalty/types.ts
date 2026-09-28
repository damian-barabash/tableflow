import { fn, rpc } from '../../app/api'
import type { Design, Info } from '../../loyalty/design'

export type FieldMode = 'required' | 'optional' | 'off'
export interface Program {
  id: string; company_id: string; slug: string; name: string; status: 'draft' | 'active' | 'archived'
  stamps_required: number; reward: string; design: Partial<Design>; info: Info
  join_fields: { email: FieldMode; phone: FieldMode; birthday: 'optional' | 'off' }
  rules: { cooldown_minutes: number; max_per_scan: number }
  assets: { version?: number; base?: string; strips?: number }
  published_at: string | null; created_at: string; updated_at: string
}
export interface CardRow {
  id: string; program_id: string; code: string; token: string; customer_name: string; email: string | null; phone: string | null; birthday: string | null
  consent_marketing: boolean; note: string | null; stamps: number; total_stamps: number; rewards_redeemed: number; status: 'active' | 'blocked'
  apple_devices: number; google_saved: boolean; google_clicked_at: string | null; last_message: string | null; last_stamp_at: string | null; created_at: string
}
/** loyalty_card_json() — what lookup/stamp/redeem return */
export interface ScannedCard {
  id: string; code: string; name: string; email: string | null; phone: string | null; stamps: number; total_stamps: number; rewards_redeemed: number
  status: 'active' | 'blocked'; last_stamp_at: string | null; created_at: string; apple_devices: number; google_saved: boolean; company_id: string
  program: { id: string; name: string; reward: string; stamps_required: number; rules: Program['rules']; design: Partial<Design> }
  history: { kind: string; delta: number; at: string; by: string | null; note: string | null }[]
}
export type StampResult = { status: 'ok'; card: ScannedCard } | { status: 'cooldown'; wait_minutes: number; card: ScannedCard }

export const lookup = (query: string) => rpc<ScannedCard>('loyalty_lookup', { p_query: query })
export const stamp = (id: string, count = 1, force = false) => rpc<StampResult>('loyalty_stamp', { p_card: id, p_count: count, p_force: force })
export const unstamp = (id: string, count = 1) => rpc<StampResult>('loyalty_unstamp', { p_card: id, p_count: count })
export const redeem = (id: string) => rpc<StampResult>('loyalty_redeem', { p_card: id })
/** Push the new state to Apple/Google Wallet (fire-and-forget). */
export const notifyWallet = (id: string) => { void fn('wallet/notify', { card_id: id }).catch(() => {}) }

export const siteOrigin = () => (/^https?:\/\/(localhost|127\.)/.test(window.location.origin) ? window.location.origin : 'https://tableflow.pl')
export const joinUrl = (slug: string) => `${siteOrigin()}/dolacz?p=${slug}`
export const cardUrl = (token: string) => `${siteOrigin()}/moja-karta?t=${token}`

export const EVENT_LABEL: Record<string, string> = {
  issued: 'Wydano kartę', stamp: 'Pieczątka', unstamp: 'Cofnięto pieczątkę', reward: 'Odebrano nagrodę', message: 'Wiadomość',
  apple_added: 'Dodano do Apple Wallet', apple_removed: 'Usunięto z Apple Wallet', google_saved: 'Zapisano w Google Wallet', blocked: 'Zablokowano', unblocked: 'Odblokowano',
}
export const plural = (n: number, one: string, few: string, many: string) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many
