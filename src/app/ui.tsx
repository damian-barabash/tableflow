import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { I } from '../components/Icons'

export const EASE = [0.22, 1, 0.36, 1] as const

// ---------- icons used only in the app ----------
const b = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
type P = React.SVGProps<SVGSVGElement>
export const Ic = {
  ...I,
  lock: (p: P) => <svg {...b} {...p}><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  plus: (p: P) => <svg {...b} {...p}><path d="M12 5v14M5 12h14" /></svg>,
  minus: (p: P) => <svg {...b} {...p}><path d="M5 12h14" /></svg>,
  logout: (p: P) => <svg {...b} {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></svg>,
  copy: (p: P) => <svg {...b} {...p}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>,
  download: (p: P) => <svg {...b} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>,
  print: (p: P) => <svg {...b} {...p}><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></svg>,
  trash: (p: P) => <svg {...b} {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>,
  edit: (p: P) => <svg {...b} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>,
  eye: (p: P) => <svg {...b} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  send: (p: P) => <svg {...b} {...p}><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" /></svg>,
  gift: (p: P) => <svg {...b} {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8c-2-4-6-3.5-5 0M12 8c2-4 6-3.5 5 0" /></svg>,
  building: (p: P) => <svg {...b} {...p}><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4" /></svg>,
  inbox: (p: P) => <svg {...b} {...p}><path d="M3 13l2.5-8h13L21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 13h5l1.5 3h5L16 13h5" /></svg>,
  list: (p: P) => <svg {...b} {...p}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>,
  external: (p: P) => <svg {...b} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>,
  camera: (p: P) => <svg {...b} {...p}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>,
  refresh: (p: P) => <svg {...b} {...p}><path d="M20 11a8 8 0 0 0-14.8-4M4 5v4h4M4 13a8 8 0 0 0 14.8 4M20 19v-4h-4" /></svg>,
  shield: (p: P) => <svg {...b} {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>,
  palette: (p: P) => <svg {...b} {...p}><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.5" r="1" /></svg>,
  dots: (p: P) => <svg {...b} {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>,
  image: (p: P) => <svg {...b} {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>,
  qr: (p: P) => <svg {...b} {...p}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></svg>,
}

// ---------- toasts ----------
interface Toast { id: number; text: string; kind: 'ok' | 'err' | 'info' }
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setItems(v => [...v.slice(-3), { id, text, kind }])
    setTimeout(() => setItems(v => v.filter(t => t.id !== id)), kind === 'err' ? 5200 : 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="ap-toasts" aria-live="polite">
          <AnimatePresence>
            {items.map(t => (
              <motion.div key={t.id} className={`ap-toast is-${t.kind}`} layout initial={{ opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: .3, ease: EASE }}>
                <i>{t.kind === 'err' ? '!' : t.kind === 'ok' ? <I.check width={13} height={13} /> : 'i'}</i><span>{t.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>, document.body)}
    </ToastCtx.Provider>
  )
}

// ---------- modal ----------
export function Modal({ open, onClose, title, sub, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean | 'xl' }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k); document.body.classList.add('ap-noscroll')
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('ap-noscroll') }
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="ap-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div className={`ap-modal__box ${wide === 'xl' ? 'is-xl' : wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" initial={{ y: 24, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 12, opacity: 0, scale: .98 }} transition={{ duration: .32, ease: EASE }}>
            <div className="ap-modal__head">
              <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
              <button className="ap-icon-btn" onClick={onClose} aria-label="Zamknij"><I.close width={16} height={16} /></button>
            </div>
            <div className="ap-modal__body">{children}</div>
            {footer && <div className="ap-modal__foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>, document.body)
}

/** Promise-based confirm dialog (no native confirm()). */
type ConfirmOpts = { title: string; text?: ReactNode; ok?: string; danger?: boolean; typeToConfirm?: string }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = useState('')
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => { setTyped(''); setState({ ...o, resolve }) }), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  const blocked = !!state?.typeToConfirm && typed.trim() !== state.typeToConfirm
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}
        footer={<><button className="btn btn--ghost btn--sm" onClick={() => close(false)}>Anuluj</button><button className={`btn btn--sm ${state?.danger ? 'ap-btn-danger' : 'btn--primary'}`} disabled={blocked} onClick={() => close(true)}>{state?.ok ?? 'Potwierdź'}</button></>}>
        {state?.text && <div className="ap-confirm-text">{state.text}</div>}
        {state?.typeToConfirm && <label className="ap-field"><span>Wpisz <b>{state.typeToConfirm}</b>, aby potwierdzić</span><input className="input" value={typed} onChange={e => setTyped(e.target.value)} autoFocus /></label>}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

// ---------- small building blocks ----------
export function PageHead({ title, chip, sub, actions }: { title: ReactNode; chip?: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ap-head">
      <div className="ap-head__t">
        <h1>{title}{chip && <span className="ap-chip">{chip}</span>}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="ap-head__a">{actions}</div>}
    </div>
  )
}
export function Kpi({ label, value, hint, delta, tone }: { label: string; value: ReactNode; hint?: ReactNode; delta?: number | null; tone?: 'brand' }) {
  return (
    <div className={`ap-kpi ${tone === 'brand' ? 'ap-kpi--brand g' : ''}`}>
      <span className="ap-kpi__l">{label}</span>
      <b className="ap-kpi__v">{value}</b>
      {(hint || delta != null) && <span className="ap-kpi__h">{delta != null && isFinite(delta) && <em className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}%</em>}{hint}</span>}
    </div>
  )
}
export function Panel({ title, sub, actions, children, className = '', pad = true }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`ap-panel ${className}`}>
      {(title || actions) && <div className="ap-panel__head"><div>{title && <h3>{title}</h3>}{sub && <p>{sub}</p>}</div>{actions}</div>}
      <div className={pad ? 'ap-panel__body' : ''}>{children}</div>
    </section>
  )
}
export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={`ap-field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`ap-toggle ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <i aria-hidden="true" />
      {(label || hint) && <span>{label}{hint && <small>{hint}</small>}</span>}
    </label>
  )
}
export function Segmented<T extends string>({ value, onChange, options, size }: { value: T; onChange: (v: T) => void; options: { v: T; label: ReactNode }[]; size?: 'sm' }) {
  return (
    <div className={`ap-seg ${size === 'sm' ? 'ap-seg--sm' : ''}`} role="tablist">
      {options.map(o => (
        <button key={o.v} type="button" role="tab" aria-selected={value === o.v} className={value === o.v ? 'is-on' : ''} onClick={() => onChange(o.v)}>
          {value === o.v && <motion.span layoutId={undefined} className="ap-seg__bg" transition={{ duration: .25, ease: EASE }} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { v: T; label: ReactNode; hidden?: boolean }[] }) {
  return (
    <div className="ap-tabs" role="tablist">
      {tabs.filter(t => !t.hidden).map(t => (
        <button key={t.v} role="tab" aria-selected={value === t.v} className={value === t.v ? 'is-on' : ''} onClick={() => onChange(t.v)}>
          {t.label}{value === t.v && <motion.i layoutId="ap-tab-line" transition={{ duration: .3, ease: EASE }} />}
        </button>
      ))}
    </div>
  )
}
export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return <div className="ap-empty">{icon && <span className="ap-empty__i">{icon}</span>}<b>{title}</b>{text && <p>{text}</p>}{action}</div>
}
export function Spinner({ size = 18 }: { size?: number }) { return <span className="ap-spin" style={{ width: size, height: size }} /> }
export function Loading({ label = 'Ładowanie…' }: { label?: string }) { return <div className="ap-loading"><Spinner /> <span>{label}</span></div> }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'brand' | 'dark' }) {
  return <span className={`ap-badge is-${tone}`}>{children}</span>
}
export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '·'
  return src ? <img className="ap-avatar" src={src} alt="" style={{ width: size, height: size }} /> : <span className="ap-avatar" style={{ width: size, height: size, fontSize: size * .38 }}>{initials}</span>
}
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="ap-color">
      <input type="color" value={value} onChange={e => onChange(e.target.value)} />
      <span><small>{label}</small><code>{value}</code></span>
    </label>
  )
}

export function useCopy() {
  const toast = useToast()
  return useCallback(async (text: string, msg = 'Skopiowano do schowka') => {
    try { await navigator.clipboard.writeText(text); toast(msg) } catch { toast('Nie udało się skopiować', 'err') }
  }, [toast])
}

/** Popover menu (⋯) — rendered in a portal with fixed position, so tables with overflow never clip it;
 *  opens upwards when there is no room below. */
export function Menu({ items, label = 'Więcej' }: { items: ({ label: ReactNode; onClick: () => void; danger?: boolean; icon?: ReactNode } | null | false)[]; label?: string }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLUListElement>(null)
  const list = items.filter(Boolean) as { label: ReactNode; onClick: () => void; danger?: boolean; icon?: ReactNode }[]
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    const h = list.length * 38 + 12
    const right = Math.max(8, window.innerWidth - r.right)
    setPos(r.bottom + 6 + h > window.innerHeight - 8 && r.top - 6 - h > 8 ? { bottom: window.innerHeight - r.top + 6, right } : { top: r.bottom + 6, right })
  }
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [pos])
  return (
    <div className="ap-menu">
      <button ref={btn} className="ap-icon-btn" aria-label={label} aria-expanded={!!pos} onClick={e => { e.stopPropagation(); if (pos) setPos(null); else open() }}><Ic.dots width={16} height={16} /></button>
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.ul ref={pop} className="ap-menu__pop" style={{ position: 'fixed', ...pos }} initial={{ opacity: 0, y: pos.top != null ? -4 : 4, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .16 }}>
              {list.map((x, i) => <li key={i}><button className={x.danger ? 'is-danger' : ''} onClick={e => { e.stopPropagation(); setPos(null); x.onClick() }}>{x.icon}{x.label}</button></li>)}
            </motion.ul>
          )}
        </AnimatePresence>, document.body)}
    </div>
  )
}

// ---------- formatting ----------
export const fmtNum = (n: number | null | undefined) => new Intl.NumberFormat('pl-PL').format(n ?? 0)
export const fmtDate = (s: string | null | undefined, withTime = false) => s ? new Date(s).toLocaleString('pl-PL', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
export function fmtAgo(s: string | null | undefined): string {
  if (!s) return '—'
  const d = (Date.now() - Date.parse(s)) / 1000
  if (d < 60) return 'przed chwilą'
  if (d < 3600) return `${Math.floor(d / 60)} min temu`
  if (d < 86400) return `${Math.floor(d / 3600)} godz. temu`
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} dni temu`
  return fmtDate(s)
}
export const fmtDur = (sec: number) => sec < 60 ? `${Math.round(sec)} s` : `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`
export const pct = (a: number, b: number) => b ? Math.round((a / b) * 100) : 0
export function deltaPct(cur: number, prev: number): number | null { return prev ? ((cur - prev) / prev) * 100 : null }
