import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { Logo, Orb } from '../brand/Logo'
import { I } from '../components/Icons'
import { Home } from './Home'
import { Karta } from './Karta'
import { Policy } from './Policy'
import { LOCALE_NAMES, useI18n, type Locale } from '../i18n'
import { fetchRole, getValidSession, signIn, signOut, type Session } from '../lib/auth'
import { fetchDraftOrPublished, fetchPublishedAuth, flatten, publish, saveDraft, translateTexts, type Overrides } from '../lib/content'
import { createEngine, type Changes, type SelectionInfo } from '../editor/engine'
import './edit-mod.css'

type PageId = 'home' | 'karta' | 'privacy' | 'cookies' | 'terms'
const PAGES: { id: PageId; label: string; hint: string }[] = [
  { id: 'home', label: 'Strona główna', hint: '/' },
  { id: 'karta', label: 'Karta lojalnościowa', hint: '/karta' },
  { id: 'privacy', label: 'Polityka prywatności', hint: '/polityka-prywatnosci' },
  { id: 'cookies', label: 'Polityka cookies', hint: '/polityka-cookies' },
  { id: 'terms', label: 'Regulamin', hint: '/regulamin' },
]
const TARGETS: Locale[] = ['en', 'ru', 'fr', 'es']
const EASE = [0.22, 1, 0.36, 1] as const

/** /edit-mod — login gate → visual on-page editor. Edits are made in Polish only;
 *  on publish the changed texts are machine-translated into the other languages. */
export function EditMod() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [role, setRole] = useState<string | null>(null)
  useEffect(() => { getValidSession().then(async s => { setSession(s); if (s) setRole(await fetchRole(s.user.id)) }) }, [])
  const onLogin = async (s: Session) => { setSession(s); setRole(await fetchRole(s.user.id)) }
  const logout = async () => { await signOut(); setSession(null); setRole(null) }
  if (session === undefined) return <div className="ed-gate"><Orb size={34} /></div>
  if (!session) return <Login onLogin={onLogin} />
  if (!role || !['owner', 'admin', 'moderator'].includes(role)) return <Denied onLogout={logout} email={session.user.email} />
  return <Editor session={session} onLogout={logout} />
}

function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [login, setLogin] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    const r = await signIn(login, pw); setBusy(false)
    if (r.ok) onLogin(r.session); else setErr('Nieprawidłowy login lub hasło.')
  }
  return (
    <div className="ed-gate">
      <motion.form className="ed-login card" onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, ease: EASE }}>
        <Logo size={26} />
        <h1>Tryb edycji</h1>
        <p className="sub">Zaloguj się kontem moderatora, aby edytować strony.</p>
        <label className="ed-field"><span>Login</span><input className="input" autoComplete="username" value={login} onChange={e => setLogin(e.target.value)} autoFocus /></label>
        <label className="ed-field"><span>Hasło</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
        {err && <p className="wl__err">{err}</p>}
        <button className="btn btn--primary" disabled={busy || !login || !pw}>{busy ? 'Loguję…' : 'Zaloguj'} <I.arrow className="arrow" width={16} height={16} /></button>
      </motion.form>
    </div>
  )
}
function Denied({ onLogout, email }: { onLogout: () => void; email: string }) {
  return (
    <div className="ed-gate"><div className="ed-login card"><Logo size={26} /><h1>Brak uprawnień</h1><p className="sub">Konto <b>{email}</b> nie ma roli moderatora.</p><button className="btn btn--ghost" onClick={onLogout}>Wyloguj</button></div></div>
  )
}

type Status = 'loading' | 'clean' | 'dirty' | 'saving' | 'saved-draft' | 'published' | 'error'
type LangState = 'wait' | 'work' | 'done' | 'partial' | 'error' | 'skip'
const COLORS: { v: string; label: string }[] = [
  { v: 'reset', label: 'Domyślny' }, { v: '#1a1916', label: 'Czarny' }, { v: '#6b665e', label: 'Szary' }, { v: '#3f49b5', label: 'Indygo' }, { v: '#6f6396', label: 'Fiolet' }, { v: '#a784a3', label: 'Malwa' }, { v: '#ffffff', label: 'Biały' },
]
const SIZES: { v: string; label: string }[] = [{ v: '0.85em', label: 'S' }, { v: 'reset', label: 'M' }, { v: '1.2em', label: 'L' }, { v: '1.45em', label: 'XL' }]

function Editor({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { locale, base, overrides, setLocale, setEditMode, setEditorOverrides } = useI18n()
  const [page, setPage] = useState<PageId>(() => (new URLSearchParams(window.location.hash.split('?')[1] || '').get('page') as PageId) || 'home')
  const [status, setStatus] = useState<Status>('loading')
  const [source, setSource] = useState<'draft' | 'published' | 'none'>('none')
  const [changes, setChanges] = useState<Changes>({})
  const [focusPath, setFocusPath] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sel, setSel] = useState<SelectionInfo | null>(null)
  const [count, setCount] = useState(0)
  const [progress, setProgress] = useState<null | { step: string; langs: Record<Locale, LangState>; changed: number; note?: string }>(null)
  const root = useRef<HTMLDivElement>(null)
  const engine = useRef<ReturnType<typeof createEngine> | null>(null)

  // editing happens in Polish only
  useEffect(() => {
    setEditMode(true); document.body.classList.add('editing')
    if (locale !== 'pl') void setLocale('pl', { animate: false, persist: false })
    return () => { setEditMode(false); document.body.classList.remove('editing'); setEditorOverrides('pl', null) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const u = new URL(window.location.href); const [h, q] = u.hash.split('?'); const sp = new URLSearchParams(q || ''); sp.set('page', page); history.replaceState(null, '', `${u.pathname}${h}?${sp}`) }, [page])

  useEffect(() => {
    if (locale !== 'pl') return
    let alive = true
    setStatus('loading')
    fetchDraftOrPublished('pl').then(({ data, status }) => { if (!alive) return; setEditorOverrides('pl', data); setSource(status); setChanges({}); setStatus('clean') })
    return () => { alive = false }
  }, [locale, setEditorOverrides])

  const values = useMemo(() => { const m = flatten(base); for (const [k, v] of Object.entries(overrides)) if (m.has(k)) m.set(k, v); return m }, [base, overrides])
  useEffect(() => {
    if (status === 'loading' || locale !== 'pl' || !root.current) return
    engine.current?.destroy()
    const eng = createEngine({ root: root.current, values, onChange: ch => { setChanges(ch); setStatus('dirty') }, onFocusPath: setFocusPath, onSelection: setSel })
    engine.current = eng
    const id = window.setTimeout(() => setCount(eng.count()), 400)
    return () => { clearTimeout(id); eng.destroy() }
  }, [values, page, status === 'loading', locale]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (Object.keys(changes).length) e.preventDefault() }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [changes])

  const merged = useCallback((): Overrides => {
    const out: Overrides = { ...overrides }; const baseFlat = flatten(base)
    for (const [k, v] of Object.entries(changes)) { if (v === baseFlat.get(k)) delete out[k]; else out[k] = v }
    return out
  }, [overrides, changes, base])

  const doSave = async () => {
    setStatus('saving')
    try { const data = merged(); await saveDraft('pl', data); setEditorOverrides('pl', data); setChanges({}); setSource('draft'); setStatus('saved-draft') }
    catch { setStatus('error') }
  }

  /** Publish PL, then translate only what changed into the other languages. */
  const doPublish = async () => {
    setStatus('saving')
    const data = merged()
    const langs = Object.fromEntries(TARGETS.map(l => [l, 'wait'])) as Record<Locale, LangState>
    try {
      const oldPub = await fetchPublishedAuth('pl')
      const changedKeys = Object.keys(data).filter(k => data[k] !== oldPub[k])
      const removedKeys = Object.keys(oldPub).filter(k => !(k in data))
      setProgress({ step: 'Zapisuję wersję polską…', langs, changed: changedKeys.length })
      await publish('pl', data)
      setEditorOverrides('pl', data); setChanges({}); setSource('published')
      if (!changedKeys.length && !removedKeys.length) {
        setProgress({ step: 'Brak zmian do przetłumaczenia.', langs: Object.fromEntries(TARGETS.map(l => [l, 'skip'])) as Record<Locale, LangState>, changed: 0 })
      } else {
        setProgress(p => p && { ...p, step: `Tłumaczę ${changedKeys.length} zmienionych tekstów…` })
        const items = changedKeys.map(k => ({ path: k, text: data[k] }))
        await Promise.all(TARGETS.map(async (l) => {
          setProgress(p => p && { ...p, langs: { ...p.langs, [l]: 'work' } })
          try {
            const r = await translateTexts(l, items)
            const cur = await fetchPublishedAuth(l)
            const next: Overrides = { ...cur }
            for (const k of removedKeys) delete next[k]
            Object.assign(next, r.translations)
            await publish(l, next)
            setProgress(p => p && { ...p, langs: { ...p.langs, [l]: r.failed.length ? 'partial' : 'done' } })
          } catch { setProgress(p => p && { ...p, langs: { ...p.langs, [l]: 'error' } }) }
        }))
        setProgress(p => p && { ...p, step: 'Gotowe — opublikowano we wszystkich językach.' })
      }
      setStatus('published')
    } catch { setStatus('error'); setProgress(p => p && { ...p, step: 'Błąd zapisu.', note: 'Spróbuj ponownie.' }) }
    setTimeout(() => setProgress(null), 2600)
  }
  const discard = () => { if (!Object.keys(changes).length || confirm('Odrzucić niezapisane zmiany?')) window.location.reload() }

  const n = Object.keys(changes).length
  const busy = status === 'saving' || status === 'loading'
  const statusText = status === 'loading' ? 'Ładuję treść…' : status === 'saving' ? 'Zapisuję…' : status === 'dirty' ? `Niezapisane zmiany: ${n}` : status === 'saved-draft' ? 'Zapisano wersję roboczą' : status === 'published' ? 'Opublikowano' : status === 'error' ? 'Błąd zapisu — spróbuj ponownie' : source === 'draft' ? 'Wersja robocza (niepublikowana)' : source === 'published' ? 'Treść opublikowana' : 'Treść domyślna'
  const current = PAGES.find(p => p.id === page)!

  return (
    <div className="ed">
      <div className="ed-canvas" ref={root} key={`${page}-${locale}`}>
        <Nav />
        {page === 'home' && <Home ready />}
        {page === 'karta' && <Karta />}
        {page === 'privacy' && <Policy kind="privacy" />}
        {page === 'cookies' && <Policy kind="cookies" />}
        {page === 'terms' && <Policy kind="terms" />}
        <Footer />
      </div>

      {/* selection toolbar */}
      <AnimatePresence>
        {sel && (
          <motion.div className="ed-tb" style={{ left: Math.max(8, Math.min(window.innerWidth - 8, sel.rect.left + sel.rect.width / 2)), top: Math.max(12, sel.rect.top) }}
            initial={{ opacity: 0, y: 6, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: .96 }} transition={{ duration: .18 }}
            onMouseDown={e => e.preventDefault()}>
            <button className={`ed-tb__btn ${sel.bold ? 'is-on' : ''}`} title="Pogrubienie (⌘B)" onClick={() => engine.current?.format('bold')}><b>B</b></button>
            <span className="ed-tb__sep" />
            {SIZES.map(s => <button key={s.v} className="ed-tb__btn" title={`Rozmiar ${s.label}`} onClick={() => engine.current?.format(s.v === 'reset' ? 'size-reset' : 'size', s.v)}>{s.label}</button>)}
            <span className="ed-tb__sep" />
            {COLORS.map(c => <button key={c.v} className="ed-tb__sw" title={c.label} style={c.v === 'reset' ? undefined : { background: c.v }} onClick={() => engine.current?.format(c.v === 'reset' ? 'color-reset' : 'color', c.v)}>{c.v === 'reset' && <I.close width={12} height={12} />}</button>)}
            <span className="ed-tb__sep" />
            <button className={`ed-tb__btn ed-tb__grad ${sel.grad ? 'is-on' : ''}`} title={sel.grad ? 'Wyłącz gradient' : 'Włącz gradient marki'} onClick={() => engine.current?.format(sel.grad ? 'grad-off' : 'grad-on')}><i className="g" /><span>{sel.grad ? 'Gradient: wł.' : 'Gradient'}</span></button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ed-bar" role="toolbar" aria-label="Edytor">
        <div className="ed-bar__group">
          <button className="ed-btn ed-btn--page" onClick={() => setPickerOpen(v => !v)} aria-expanded={pickerOpen}>
            <I.doc width={15} height={15} /><span>{current.label}</span><I.chevron width={14} height={14} className={pickerOpen ? 'up' : ''} />
          </button>
          <AnimatePresence>
            {pickerOpen && (
              <motion.ul className="ed-pop ed-pop--pages" initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} transition={{ duration: .22 }}>
                <li className="ed-pop__title">Strony</li>
                {PAGES.map(p => (
                  <li key={p.id}><button className={p.id === page ? 'is-active' : ''} onClick={() => { if (n && !confirm('Masz niezapisane zmiany. Przejść bez zapisu?')) return; setPage(p.id); setPickerOpen(false); setChanges({}); setStatus('clean'); window.scrollTo(0, 0) }}>
                    <span>{p.label}</span><small>{p.hint}</small>{p.id === page && <I.check width={14} height={14} />}
                  </button></li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
          <span className="ed-lang" title="Edytujesz wersję polską; pozostałe języki tłumaczy AI przy publikacji"><I.globe width={15} height={15} /><span>Polski → <b>AI</b> EN·RU·FR·ES</span></span>
        </div>

        <div className={`ed-status ed-status--${status}`}>
          <i /><span>{statusText}</span>
          {focusPath && <code title="Ścieżka w słowniku">{focusPath}</code>}
          {!focusPath && status !== 'loading' && <small>{count} pól</small>}
        </div>

        <div className="ed-bar__group ed-bar__actions">
          {n > 0 && <button className="ed-btn" onClick={discard} title="Odrzuć niezapisane zmiany"><I.close width={14} height={14} /><span>Odrzuć</span></button>}
          <button className="btn btn--ghost btn--sm" onClick={doSave} disabled={busy}>Zapisz jako draft</button>
          <button className="btn btn--primary btn--sm" onClick={doPublish} disabled={busy}>{status === 'saving' ? <><span className="ed-spin" /> Publikuję…</> : <>Opublikuj <I.arrowUp width={14} height={14} /></>}</button>
          <button className="ed-btn ed-btn--icon" onClick={onLogout} title={`Wyloguj (${session.user.login})`}><I.users width={15} height={15} /></button>
        </div>
      </div>

      {/* publish / translate progress */}
      <AnimatePresence>
        {progress && (
          <motion.div className="ed-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="ed-progress card" initial={{ y: 14, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: .98 }}>
              <div className="ed-progress__head"><Orb size={30} active={status === 'saving'} /><div><b>Zapisywanie</b><span>{progress.step}</span></div></div>
              <ul className="ed-progress__langs">
                <li className="is-done"><i /><span>{LOCALE_NAMES.pl}</span><small>źródło</small></li>
                {TARGETS.map(l => <li key={l} className={`is-${progress.langs[l]}`}><i /><span>{LOCALE_NAMES[l]}</span><small>{{ wait: 'czeka', work: 'tłumaczę…', done: 'gotowe', partial: 'częściowo', error: 'błąd', skip: 'bez zmian' }[progress.langs[l]]}</small></li>)}
              </ul>
              {progress.note && <p className="wl__err">{progress.note}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
