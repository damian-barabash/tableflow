import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Logo, Orb } from '../brand/Logo'
import { I } from '../components/Icons'
import { getValidSession, readSession, signIn, signOut } from '../lib/auth'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase'
import { rpc } from './api'

export interface CompanyRef { id: string; name: string; role: 'owner' | 'manager' | 'staff'; modules: string[]; status: string; logo_url: string | null }
export interface Access { user_id: string; platform_role: string | null; name: string | null; avatar: string | null; companies: CompanyRef[]; email: string }
export const isSuper = (a: Access | null) => a?.platform_role === 'owner' || a?.platform_role === 'admin'

/** Loads the session + my_access(); `undefined` while loading, `null` when logged out. */
export function useAccess() {
  const [access, setAccess] = useState<Access | null | undefined>(undefined)
  const load = useCallback(async () => {
    const s = await getValidSession()
    if (!s) { setAccess(null); return }
    try { const a = await rpc<Omit<Access, 'email'>>('my_access'); setAccess({ ...a, email: s.user.email }) }
    catch { setAccess(null) }
  }, [])
  useEffect(() => { void load() }, [load])
  const logout = useCallback(async () => { await signOut(); setAccess(null) }, [])
  return { access, reload: load, logout }
}

const EASE = [0.22, 1, 0.36, 1] as const

/** Password recovery link lands here with #access_token=…&type=recovery. */
function readRecovery(): string | null {
  const h = new URLSearchParams(window.location.hash.slice(1))
  return h.get('type') === 'recovery' ? h.get('access_token') : null
}

export function Gate({ title, sub, children }: { title: string; sub: string; children: (a: Access, logout: () => Promise<void>, reload: () => Promise<void>) => ReactNode }) {
  const { access, reload, logout } = useAccess()
  const [recovery, setRecovery] = useState<string | null>(() => readRecovery())
  if (recovery) return <NewPassword token={recovery} onDone={() => { setRecovery(null); history.replaceState(null, '', window.location.pathname + window.location.search) }} />
  if (access === undefined) return <div className="ap-gate"><Orb size={34} /></div>
  if (!access) return <Login title={title} sub={sub} onLogin={reload} />
  return <>{children(access, logout, reload)}</>
}

function Login({ title, sub, onLogin }: { title: string; sub: string; onLogin: () => void }) {
  const [login, setLogin] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    if (mode === 'forgot') {
      const email = login.includes('@') ? login.trim() : `${login.trim().toLowerCase()}@tableflow.pl`
      const res = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(window.location.origin + window.location.pathname)}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      setBusy(false)
      if (res.ok) setMode('sent'); else setErr(res.status === 429 ? 'Zbyt wiele prób — spróbuj za godzinę.' : 'Nie udało się wysłać wiadomości.')
      return
    }
    const r = await signIn(login, pw); setBusy(false)
    if (r.ok) onLogin(); else setErr('Nieprawidłowy e-mail lub hasło.')
  }
  return (
    <div className="ap-gate">
      <div className="ap-gate__bg mesh"><span className="mesh__b" /><span className="mesh__g" /></div>
      <motion.form className="ap-login" onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, ease: EASE }}>
        <Logo size={26} />
        {mode === 'sent' ? (
          <>
            <h1>Sprawdź skrzynkę</h1>
            <p className="sub">Jeśli konto istnieje, wysłaliśmy link do ustawienia nowego hasła.</p>
            <button type="button" className="btn btn--ghost" onClick={() => setMode('login')}>Wróć do logowania</button>
          </>
        ) : (
          <>
            <h1>{mode === 'forgot' ? 'Nowe hasło' : title}</h1>
            <p className="sub">{mode === 'forgot' ? 'Podaj e-mail konta — wyślemy link do zmiany hasła.' : sub}</p>
            <label className="ap-field"><span>E-mail</span><input className="input" autoComplete="username" inputMode="email" value={login} onChange={e => setLogin(e.target.value)} autoFocus /></label>
            {mode === 'login' && <label className="ap-field"><span>Hasło</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /></label>}
            {err && <p className="ap-err">{err}</p>}
            <button className="btn btn--primary" disabled={busy || !login || (mode === 'login' && !pw)}>{busy ? 'Chwileczkę…' : mode === 'forgot' ? 'Wyślij link' : 'Zaloguj się'} <I.arrow className="arrow" width={16} height={16} /></button>
            <button type="button" className="ap-link" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setErr('') }}>{mode === 'login' ? 'Nie pamiętasz hasła?' : 'Wróć do logowania'}</button>
          </>
        )}
      </motion.form>
    </div>
  )
}

function NewPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) { setErr('Hasło musi mieć co najmniej 8 znaków.'); return }
    if (pw !== pw2) { setErr('Hasła nie są takie same.'); return }
    setBusy(true)
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { method: 'PUT', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
    setBusy(false)
    if (!res.ok) { setErr('Link wygasł — poproś o nowy.'); return }
    onDone()
  }
  return (
    <div className="ap-gate">
      <div className="ap-gate__bg mesh"><span className="mesh__b" /><span className="mesh__g" /></div>
      <form className="ap-login" onSubmit={submit}>
        <Logo size={26} />
        <h1>Ustaw nowe hasło</h1>
        <label className="ap-field"><span>Nowe hasło</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} autoFocus /></label>
        <label className="ap-field"><span>Powtórz hasło</span><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
        {err && <p className="ap-err">{err}</p>}
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Zapisuję…' : 'Zapisz i zaloguj się'}</button>
      </form>
    </div>
  )
}

export const currentEmail = () => readSession()?.user.email ?? ''
