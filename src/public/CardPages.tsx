import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Mark } from '../brand/Logo'
import { I } from '../components/Icons'
import { anonRpc, errText, WALLET_URL, walletStatus, rpc } from '../app/api'
import { getValidSession } from '../lib/auth'
import { normalizeDesign, type Design, type Info } from '../loyalty/design'
import { Qr, WebCard } from '../loyalty/CardVisual'
import './cardpages.css'

const EASE = [0.22, 1, 0.36, 1] as const
/** vibrate only after a user gesture (Chrome blocks it otherwise) */
const buzz = (p: number | number[]) => { if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) navigator.vibrate?.(p) }
const STORE = 'tf_cards'
function saved(): Record<string, string> { try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch { return {} } }
function remember(slug: string, token: string) { try { localStorage.setItem(STORE, JSON.stringify({ ...saved(), [slug]: token })) } catch { /* */ } }
const platform = () => /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) ? 'apple' : /android/i.test(navigator.userAgent) ? 'google' : 'other'

export default function CardPages() {
  const path = useLocation().pathname
  useEffect(() => { document.body.classList.add('cp-body'); return () => document.body.classList.remove('cp-body') }, [])
  return (
    <div className="cp">
      {path === '/dolacz' ? <Join /> : path === '/s' ? <StampLink /> : <MyCard />}
      <footer className="cp-foot"><Link to="/"><Mark size={14} /> Karta obsługiwana przez <b>TableFlow AI</b></Link><span>·</span><Link to="/polityka-prywatnosci">Prywatność</Link></footer>
    </div>
  )
}

interface PublicProgram { id: string; slug: string; name: string; reward: string; stamps_required: number; design: Partial<Design>; info: Info; join_fields: { email: string; phone: string; birthday: string }; company: { name: string; logo_url: string | null } }

function Join() {
  const nav = useNavigate()
  const slug = new URLSearchParams(useLocation().search).get('p') ?? ''
  const [p, setP] = useState<PublicProgram | null | undefined>(undefined)
  const [f, setF] = useState({ name: '', email: '', phone: '', birthday: '', consent: false })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [exists, setExists] = useState(false)
  const [demo, setDemo] = useState(0)
  const mine = saved()[slug]
  useEffect(() => { void anonRpc<PublicProgram | null>('loyalty_public_program', { p_slug: slug }).then(setP).catch(() => setP(null)) }, [slug])
  useEffect(() => { if (!p) return; const id = setInterval(() => setDemo(v => v >= p.stamps_required ? 0 : v + 1), 900); return () => clearInterval(id) }, [p])
  useEffect(() => { if (p) document.title = `${p.name} — ${p.company.name}` }, [p])

  if (p === undefined) return <div className="cp-center"><span className="cp-spin" /></div>
  if (!p) return <div className="cp-center"><div className="cp-box"><h1>Program niedostępny</h1><p>Ta karta lojalnościowa jest nieaktywna lub link jest nieprawidłowy. Zapytaj obsługę o aktualny kod QR.</p></div></div>
  const d = normalizeDesign(p.design)
  const jf = p.join_fields
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setExists(false)
    if (f.name.trim().length < 2) { setErr('Podaj imię.'); return }
    if (f.phone.replace(/\D/g, '').length < 9) { setErr('Podaj numer telefonu — bez niego nie założymy karty.'); return }
    setBusy(true)
    try {
      const r = await anonRpc<{ status: string; token?: string }>('loyalty_join', { p_slug: slug, p_name: f.name, p_email: f.email || null, p_phone: f.phone || null, p_birthday: f.birthday || null, p_consent: f.consent })
      if (r.status === 'exists') { setExists(true); setBusy(false); return }
      remember(slug, r.token!)
      nav(`/moja-karta?t=${r.token}&new=1`)
    } catch (e2) { setErr(errText(e2)); setBusy(false) }
  }
  return (
    <main className="cp-join">
      <motion.div className="cp-join__card" initial={{ opacity: 0, y: 20, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -2 }} transition={{ duration: .8, ease: EASE }}>
        <WebCard design={d} data={{ name: p.name, reward: p.reward, required: p.stamps_required, company: p.company.name, stamps: demo }} />
      </motion.div>
      <motion.div className="cp-box" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, delay: .15, ease: EASE }}>
        <div className="cp-brand">{p.company.logo_url && <img src={p.company.logo_url} alt="" />}<span>{p.company.name}</span></div>
        <h1>{p.name}</h1>
        <p className="cp-lead">Zbierz <b>{p.stamps_required} pieczątek</b> i odbierz: <b>{p.reward}</b>. Podaj imię i numer telefonu — karta od razu trafi do Apple Wallet lub Google Wallet, bez aplikacji.</p>
        {mine && <Link className="cp-mine" to={`/moja-karta?t=${mine}`}><I.card width={18} height={18} /><span>Masz już kartę na tym telefonie</span><b>Otwórz <I.arrow width={14} height={14} /></b></Link>}
        <form className="cp-form" onSubmit={submit} noValidate>
          <label><span>Imię</span><input className="input" autoComplete="given-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></label>
          <label><span>Numer telefonu</span><input className="input" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="600 000 000" required /></label>
          {jf.email !== 'off' && <label><span>E-mail{jf.email === 'optional' ? ' (opcjonalnie)' : ''}</span><input className="input" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>}
          {jf.birthday === 'optional' && <label><span>Data urodzin (opcjonalnie)</span><input className="input" type="date" value={f.birthday} onChange={e => setF({ ...f, birthday: e.target.value })} /></label>}
          <label className="check"><input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} /><span>Chcę otrzymywać informacje o promocjach od {p.company.name} (powiadomienia na karcie). Zgodę możesz wycofać w każdej chwili.</span></label>
          {err && <p className="cp-err">{err}</p>}
          {exists && <p className="cp-err">Karta z tym numerem telefonu lub e-mailem już istnieje. Poproś obsługę — pokaże Ci kod do jej otwarcia.</p>}
          <button className="btn btn--primary cp-cta" disabled={busy}>{busy ? 'Tworzę kartę…' : 'Odbierz kartę'} <I.arrow className="arrow" width={16} height={16} /></button>
          <p className="cp-legal">Administratorem Twoich danych jest {p.company.name}. TableFlow AI przetwarza je w jego imieniu wyłącznie na potrzeby programu lojalnościowego. <Link to="/polityka-prywatnosci">Polityka prywatności</Link>.</p>
        </form>
        {(p.info.description || p.info.terms) && <details className="cp-details"><summary>Zasady programu</summary>{p.info.description && <p>{p.info.description}</p>}{p.info.terms && <p>{p.info.terms}</p>}</details>}
      </motion.div>
    </main>
  )
}

interface PublicCard {
  code: string; name: string; stamps: number; rewards_redeemed: number; status: string; apple: boolean; google: boolean; last_message: string | null; last_message_at: string | null; created_at: string; last_stamp_at: string | null
  program: { name: string; reward: string; stamps_required: number; design: Partial<Design>; info: Info; status: string }
  company: { name: string; logo_url: string | null }
  history: { kind: string; delta: number; at: string }[]
}
function MyCard() {
  const q = new URLSearchParams(useLocation().search)
  const token = q.get('t') ?? ''
  const isNew = q.get('new') === '1'
  const [c, setC] = useState<PublicCard | null | undefined>(undefined)
  const [wallet, setWallet] = useState<{ apple: boolean; google: boolean } | null>(null)
  const [pulse, setPulse] = useState(false)
  const prev = useRef<number | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => anonRpc<PublicCard | null>('loyalty_card_public', { p_token: token }).then(r => {
      if (!alive) return
      if (r && prev.current != null && r.stamps !== prev.current) { setPulse(true); setTimeout(() => setPulse(false), 1200); buzz(60) }
      prev.current = r?.stamps ?? null; setC(r)
    }).catch(() => alive && setC(c => c ?? null))
    void load(); void walletStatus().then(setWallet)
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 12000)
    return () => { alive = false; clearInterval(id) }
  }, [token])
  useEffect(() => { if (c) document.title = `${c.program.name} — ${c.company.name}` }, [c])

  if (c === undefined) return <div className="cp-center"><span className="cp-spin" /></div>
  if (!c) return <div className="cp-center"><div className="cp-box"><h1>Nie znaleziono karty</h1><p>Link jest nieprawidłowy. Poproś obsługę o kod do Twojej karty.</p></div></div>
  const d = normalizeDesign(c.program.design)
  const req = c.program.stamps_required
  const ready = c.stamps >= req
  const plat = platform()
  const scanUrl = `https://tableflow.pl/s?c=${c.code}`
  const apple = <a key="a" className={`cp-wbtn cp-wbtn--apple ${!wallet?.apple ? 'is-off' : ''}`} href={wallet?.apple ? `${WALLET_URL}/apple/pass?t=${token}` : undefined} aria-disabled={!wallet?.apple}><I.apple width={20} height={20} /><span><small>Dodaj do</small>Apple Wallet</span></a>
  const google = <a key="g" className={`cp-wbtn cp-wbtn--google ${!wallet?.google ? 'is-off' : ''}`} href={wallet?.google ? `${WALLET_URL}/google/save?t=${token}` : undefined} aria-disabled={!wallet?.google}><GIcon /><span><small>Dodaj do</small>Portfela Google</span></a>

  return (
    <main className="cp-card">
      <AnimatePresence>{isNew && <motion.div className="cp-welcome" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><I.check width={18} height={18} /> Twoja karta jest gotowa! Dodaj ją do portfela, aby mieć ją zawsze pod ręką.</motion.div>}</AnimatePresence>
      <div className="cp-brand cp-brand--c">{c.company.logo_url && <img src={c.company.logo_url} alt="" />}<span>{c.company.name}</span></div>
      <motion.div initial={{ opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .7, ease: EASE }}>
        <WebCard design={d} data={{ name: c.program.name, reward: c.program.reward, required: req, company: c.company.name, stamps: c.stamps, customer: c.name }} pulse={pulse} />
      </motion.div>
      {c.status !== 'active' && <p className="cp-err">Ta karta jest zablokowana. Skontaktuj się z {c.company.name}.</p>}
      {ready && <div className="cp-ready g"><span>🎁</span><div><b>Masz komplet pieczątek!</b><small>Pokaż kartę przy kasie i odbierz: {c.program.reward}</small></div></div>}
      {(wallet?.apple || wallet?.google) && <div className="cp-wallets">{(plat === 'google' ? [google, apple] : [apple, google]).filter(b => (b.key === 'a' ? wallet?.apple : wallet?.google))}</div>}
      {!(wallet?.apple || wallet?.google) && <p className="cp-note">Dodawanie do portfela uruchamiamy lada dzień. Do tego czasu zapisz tę stronę — np. „Udostępnij → Do ekranu początkowego”.</p>}
      <section className="cp-qrbox">
        <div className="cp-qrbox__qr"><Qr text={scanUrl} /></div>
        <div><b>Pokaż ten kod przy kasie</b><p>Obsługa zeskanuje go i doda pieczątkę. Numer karty:</p><span className="cp-code">{c.code.replace(/(.{4})/, '$1 ')}</span></div>
      </section>
      {c.last_message && <section className="cp-msg"><I.bell width={16} height={16} /><div><b>Wiadomość od {c.company.name}</b><p>{c.last_message}</p></div></section>}
      <section className="cp-sec">
        <h2>Historia</h2>
        <ul className="cp-hist">{c.history.map((h, i) => <li key={i}><span>{h.kind === 'stamp' ? `Pieczątka${h.delta > 1 ? ` ×${h.delta}` : ''}` : h.kind === 'reward' ? 'Odebrana nagroda 🎉' : 'Karta założona'}</span><small>{new Date(h.at).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></li>)}</ul>
      </section>
      {(c.program.info.address || c.program.info.hours || c.program.info.phone || c.program.info.website || c.program.info.terms || c.program.info.description) && (
        <section className="cp-sec">
          <h2>{c.company.name}</h2>
          <dl className="cp-info">
            {c.program.info.description && <><dt>O programie</dt><dd>{c.program.info.description}</dd></>}
            {c.program.info.hours && <><dt>Godziny</dt><dd>{c.program.info.hours}</dd></>}
            {c.program.info.address && <><dt>Adres</dt><dd><a href={`https://maps.google.com/?q=${encodeURIComponent(c.program.info.address)}`} target="_blank" rel="noreferrer">{c.program.info.address}</a></dd></>}
            {c.program.info.phone && <><dt>Telefon</dt><dd><a href={`tel:${c.program.info.phone.replace(/\s/g, '')}`}>{c.program.info.phone}</a></dd></>}
            {c.program.info.website && <><dt>Strona</dt><dd><a href={/^https?:/.test(c.program.info.website) ? c.program.info.website : `https://${c.program.info.website}`} target="_blank" rel="noreferrer">{c.program.info.website}</a></dd></>}
            {c.program.info.terms && <><dt>Regulamin</dt><dd>{c.program.info.terms}</dd></>}
          </dl>
        </section>
      )}
    </main>
  )
}
function GIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.2z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.5l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22z" /><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3a10 10 0 0 0 0 9z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3 7.5l3.4 2.6C7.2 7.8 9.4 6 12 6z" /></svg> }

/** QR on the pass encodes tableflow.pl/s?c=CODE: staff (logged in) → scanner; anyone else → neutral info. */
function StampLink() {
  const nav = useNavigate()
  const code = new URLSearchParams(useLocation().search).get('c') ?? ''
  const [info, setInfo] = useState<{ company: string; program: string; company_id: string } | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void (async () => {
      const i = await anonRpc<{ company: string; program: string; company_id: string } | null>('loyalty_code_info', { p_code: code }).catch(() => null)
      if (!alive) return
      const s = await getValidSession()
      if (s && i) {
        const a = await rpc<{ platform_role: string | null; companies: { id: string }[] }>('my_access').catch(() => null)
        const member = a?.companies.some(c => c.id === i.company_id)
        const admin = a?.platform_role === 'owner' || a?.platform_role === 'admin'
        if (member || admin) { nav(`/panel/skaner?c=${encodeURIComponent(code)}${!member ? `&firma=${i.company_id}` : ''}`, { replace: true }); return }
      }
      setInfo(i)
    })()
    return () => { alive = false }
  }, [code, nav])
  if (info === undefined) return <div className="cp-center"><span className="cp-spin" /></div>
  return (
    <div className="cp-center">
      <div className="cp-box" style={{ textAlign: 'center' }}>
        <span className="cp-ico g"><I.card width={24} height={24} /></span>
        {info ? <><h1>{info.program}</h1><p>Karta lojalnościowa <b>{info.company}</b>. Pieczątki przybija obsługa — pokaż ten kod przy kasie.</p></> : <><h1>Nieznana karta</h1><p>Ten kod nie należy do żadnego aktywnego programu.</p></>}
        <Link className="btn btn--ghost btn--sm" to={`/panel/skaner?c=${encodeURIComponent(code)}`} style={{ marginTop: 14 }}>Jestem z obsługi — zaloguj</Link>
      </div>
    </div>
  )
}
