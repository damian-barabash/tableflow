import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Mark } from '../brand/Logo'
import { Gate, isSuper, type Access } from '../app/session'
import { ConfirmProvider, Empty, Ic, Loading, ToastProvider, Avatar, EASE } from '../app/ui'
import { get, walletStatus } from '../app/api'
import { ProfileModal } from '../app/profile'
import { Locked } from './Locked'
import { LoyaltyPage } from './loyalty/LoyaltyPage'
import { StatsPage } from './StatsPage'
import { TeamPage } from './TeamPage'
import { SettingsPage } from './SettingsPage'
import { ScannerPage } from './ScannerPage'
import { TodayPage } from './reception/TodayPage'
import { CalendarPage } from './reception/CalendarPage'
import { CallsPage } from './reception/CallsPage'
import { ClientsPage } from './reception/ClientsPage'
import { SetupPage } from './reception/SetupPage'
import { AssistantPage } from './reception/AssistantPage'
import '../app/app.css'

export interface Company {
  id: string; name: string; industry: string | null; status: string; modules: string[]
  email: string | null; phone: string | null; address: string | null; city: string | null; website: string | null; nip: string | null; logo_url: string | null
}
export type Role = 'owner' | 'manager' | 'staff'
export type TabId = 'dzisiaj' | 'kalendarz' | 'rozmowy' | 'klienci' | 'uslugi' | 'asystent' | 'lojalnosc' | 'statystyki' | 'zespol' | 'ustawienia' | 'skaner'

interface Ctx {
  access: Access; company: Company; role: Role; canManage: boolean; impersonating: boolean
  reloadCompany: () => Promise<void>; reloadAccess: () => Promise<void>; href: (tab: TabId, q?: Record<string, string>) => string
  wallet: { apple: boolean; google: boolean } | null
}
const PanelCtx = createContext<Ctx | null>(null)
export const usePanel = () => useContext(PanelCtx)!

// modules that unlock a tab (any of them); tabs without modules are always open
type NavDef = { id: TabId; label: string; icon: keyof typeof Ic; modules?: string[] }
const RECEPCJA: NavDef[] = [
  { id: 'dzisiaj', label: 'Dzisiaj', icon: 'home', modules: ['reception', 'calendar'] },
  { id: 'kalendarz', label: 'Kalendarz', icon: 'calendar', modules: ['reception', 'calendar'] },
  { id: 'rozmowy', label: 'Rozmowy', icon: 'phone', modules: ['reception'] },
  { id: 'klienci', label: 'Klienci', icon: 'users', modules: ['reception', 'clients', 'calendar'] },
  { id: 'uslugi', label: 'Usługi i grafik', icon: 'list', modules: ['reception', 'calendar'] },
  { id: 'asystent', label: 'Asystent AI', icon: 'sparkle', modules: ['reception'] },
]
const FIRMA: NavDef[] = [
  { id: 'lojalnosc', label: 'Lojalność', icon: 'card', modules: ['loyalty'] },
  { id: 'statystyki', label: 'Statystyki', icon: 'analytics' },
  { id: 'zespol', label: 'Zespół', icon: 'users' },
  { id: 'ustawienia', label: 'Ustawienia', icon: 'settings' },
]
export const LIVE_MODULES = ['loyalty', 'reception', 'calendar', 'clients', 'calls']
const TAB_IDS: TabId[] = ['dzisiaj', 'kalendarz', 'rozmowy', 'klienci', 'uslugi', 'asystent', 'lojalnosc', 'statystyki', 'zespol', 'ustawienia', 'skaner']
const STORE = 'tf_panel_company'

/** Where a company's panel starts: the first tab its package unlocks
 *  (reception/calendar → Dzisiaj, only loyalty → Lojalność, only CRM → Klienci). */
export function homeTab(modules: string[]): TabId {
  const has = (m: string) => modules.includes(m) && LIVE_MODULES.includes(m)
  if (has('reception') || has('calendar')) return 'dzisiaj'
  if (has('loyalty')) return 'lojalnosc'
  if (has('clients')) return 'klienci'
  return 'ustawienia'
}

export default function PanelApp() {
  useEffect(() => { document.body.classList.add('ap-body'); return () => document.body.classList.remove('ap-body') }, [])
  return (
    <ToastProvider><ConfirmProvider>
      <Gate title="Panel firmy" sub="Zaloguj się, aby zarządzać kartami lojalnościowymi, zespołem i statystykami.">
        {(access, logout, reload) => <PanelShell access={access} logout={logout} reloadAccess={reload} />}
      </Gate>
    </ConfirmProvider></ToastProvider>
  )
}

function PanelShell({ access, logout, reloadAccess }: { access: Access; logout: () => Promise<void>; reloadAccess: () => Promise<void> }) {
  const [profile, setProfile] = useState(false)
  const loc = useLocation(), nav = useNavigate()
  const q = new URLSearchParams(loc.search)
  const seg = loc.pathname.split('/')[2] as TabId | undefined
  const tab: TabId = seg && TAB_IDS.includes(seg) ? seg : 'dzisiaj'
  const superAdmin = isSuper(access)
  const firmaParam = q.get('firma')
  const companyId = useMemo(() => {
    if (firmaParam && (superAdmin || access.companies.some(c => c.id === firmaParam))) return firmaParam
    let stored: string | null = null
    try { stored = localStorage.getItem(STORE) } catch { /* */ }
    if (stored && access.companies.some(c => c.id === stored)) return stored
    return access.companies[0]?.id ?? null
  }, [firmaParam, superAdmin, access.companies])
  const membership = access.companies.find(c => c.id === companyId)
  const impersonating = !!companyId && !membership && superAdmin
  const role: Role = membership?.role ?? 'owner'

  const [company, setCompany] = useState<Company | null | undefined>(undefined)
  const [wallet, setWallet] = useState<Ctx['wallet']>(null)
  const [drawer, setDrawer] = useState(false)
  const reloadCompany = useCallback(async () => {
    if (!companyId) { setCompany(null); return }
    const rows = await get<Company[]>(`companies?id=eq.${companyId}&select=*`).catch(() => [])
    setCompany(rows[0] ?? null)
  }, [companyId])
  useEffect(() => { setCompany(undefined); void reloadCompany() }, [reloadCompany])
  useEffect(() => { void walletStatus().then(setWallet) }, [])
  useEffect(() => { if (companyId && membership) { try { localStorage.setItem(STORE, companyId) } catch { /* */ } } }, [companyId, membership])
  const home = company ? homeTab(company.modules) : null
  useEffect(() => { if (!seg && home) nav(`/panel/${home}${loc.search}`, { replace: true }) }, [seg, nav, loc.search, home])
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0) }, [tab])

  const href = useCallback((t: TabId, extra?: Record<string, string>) => {
    const p = new URLSearchParams()
    if (impersonating || (firmaParam && companyId === firmaParam)) p.set('firma', companyId!)
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v)
    const s = p.toString()
    return `/panel/${t}${s ? `?${s}` : ''}`
  }, [impersonating, firmaParam, companyId])

  if (!companyId) {
    return (
      <div className="ap-gate"><div className="ap-login" style={{ textAlign: 'center', alignItems: 'center' }}>
        <Mark size={30} />
        <Empty title="Konto nie jest przypisane do firmy" text={superAdmin ? 'Jesteś administratorem — wybierz firmę w panelu administracyjnym, aby zobaczyć jej panel.' : 'Poproś właściciela firmy lub zespół TableFlow o dodanie Cię do firmy.'}
          action={<div className="ap-row" style={{ justifyContent: 'center' }}>{superAdmin && <Link className="btn btn--primary btn--sm" to="/admin/firmy">Otwórz administrację</Link>}<button className="btn btn--ghost btn--sm" onClick={logout}>Wyloguj</button></div>} />
      </div></div>
    )
  }
  if (company === undefined) return <div className="ap-gate"><Loading /></div>
  if (!company) return <div className="ap-gate"><Empty title="Nie znaleziono firmy" action={<button className="btn btn--ghost btn--sm" onClick={logout}>Wyloguj</button>} /></div>

  const ctx: Ctx = { access, company, role, canManage: role !== 'staff', impersonating, reloadCompany, reloadAccess, href, wallet }
  const locked = (mods?: string[] | string) => { const list = typeof mods === 'string' ? [mods] : mods; return !!list?.length && !list.some(m => LIVE_MODULES.includes(m) && company.modules.includes(m)) }
  const title = [...RECEPCJA, ...FIRMA].find(i => i.id === tab)?.label ?? 'Skaner'

  const side = (
    <aside className="ap-side">
      <div className="ap-side__logo"><Mark size={22} /><span>TableFlow</span></div>
      <CompanySwitch access={access} company={company} impersonating={impersonating} />
      <div className="ap-sec">Recepcja</div>
      {RECEPCJA.map(i => <NavItem key={i.id} to={href(i.id)} icon={i.icon} label={i.label} active={tab === i.id} locked={locked(i.modules)} />)}
      <div className="ap-sec">Firma</div>
      {FIRMA.map(i => <NavItem key={i.id} to={href(i.id)} icon={i.icon} label={i.label} active={tab === i.id} locked={locked(i.modules)} />)}
      {!locked('loyalty') && <Link to={href('skaner')} className={`btn btn--brand ap-scan-btn ${tab === 'skaner' ? 'is-active' : ''}`}><Ic.scan width={17} height={17} /> Skaner pieczątek</Link>}
      <div className="ap-side__foot">
        {superAdmin && <Link to="/admin" className="ap-item"><Ic.shield width={17} height={17} />Administracja</Link>}
        <div className="ap-user">
          <button className="ap-user__me" onClick={() => setProfile(true)} title="Mój profil">
            <Avatar name={access.name || access.email} src={access.avatar} size={30} />
            <div><b>{access.name || access.email.split('@')[0]}</b><small>{impersonating ? 'administrator' : ({ owner: 'Właściciel', manager: 'Menedżer', staff: 'Obsługa' } as const)[role]}</small></div>
          </button>
          <button className="ap-icon-btn" onClick={logout} title="Wyloguj" aria-label="Wyloguj"><Ic.logout width={16} height={16} /></button>
        </div>
      </div>
    </aside>
  )

  let page: ReactNode
  const item = [...RECEPCJA, ...FIRMA].find(i => i.id === tab)
  if (item && locked(item.modules)) page = <Locked tab={tab} enabledButNotLive={false} />
  else if (tab === 'dzisiaj') page = <TodayPage />
  else if (tab === 'kalendarz') page = <CalendarPage />
  else if (tab === 'rozmowy') page = <CallsPage />
  else if (tab === 'klienci') page = <ClientsPage />
  else if (tab === 'uslugi') page = <SetupPage />
  else if (tab === 'asystent') page = <AssistantPage />
  else if (tab === 'lojalnosc') page = <LoyaltyPage />
  else if (tab === 'statystyki') page = <StatsPage />
  else if (tab === 'zespol') page = <TeamPage />
  else if (tab === 'ustawienia') page = <SettingsPage />
  else if (tab === 'skaner') page = locked('loyalty') ? <Locked tab="lojalnosc" enabledButNotLive={false} /> : <ScannerPage />
  else page = <Locked tab={tab} enabledButNotLive={false} />

  return (
    <PanelCtx.Provider value={ctx}>
      <div className="ap">
        {side}
        <header className="ap-top">
          <button className="ap-icon-btn" onClick={() => setDrawer(true)} aria-label="Menu"><Ic.menu width={20} height={20} /></button>
          <Mark size={20} />
          <b>{title}</b>
          <Avatar name={company.name} src={company.logo_url} size={30} />
        </header>
        <main className="ap-main">
          <div className="ap-main__in">
            {impersonating && <div className="ap-imp"><Ic.shield width={16} height={16} /><span>Podgląd jako administrator: <b>{company.name}</b> — widzisz i edytujesz wszystko tak jak klient.</span><Link to={`/admin/firmy?id=${company.id}`}>Wróć do administracji</Link></div>}
            <AnimatePresence mode="wait">
              <motion.div key={tab + company.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .3, ease: EASE }}>{page}</motion.div>
            </AnimatePresence>
          </div>
        </main>
        <nav className="ap-bottom" aria-label="Nawigacja">
          {(() => {
            // mobile bar: the first tabs the package unlocks + a centre action (scanner or assistant)
            const center: TabId | null = !locked('loyalty') ? 'skaner' : !locked(['reception']) ? 'asystent' : null
            const open = [...RECEPCJA, ...FIRMA].filter(i => !locked(i.modules) && i.id !== center && !['uslugi', 'asystent', 'ustawienia'].includes(i.id)).slice(0, center ? 3 : 4)
            const link = (i: NavDef) => { const I2 = Ic[i.icon]; return <Link key={i.id} to={href(i.id)} className={tab === i.id ? 'is-active' : ''}><I2 width={20} height={20} />{i.label.split(' ')[0]}</Link> }
            return <>
              {open.slice(0, 2).map(link)}
              {center && <Link to={href(center)} className="ap-bottom__scan" aria-label={center === 'skaner' ? 'Skaner' : 'Asystent AI'}><span className="g">{center === 'skaner' ? <Ic.scan width={22} height={22} /> : <Ic.sparkle width={22} height={22} />}</span></Link>}
              {open.slice(2).map(link)}
            </>
          })()}
          <button onClick={() => setDrawer(true)}><Ic.menu width={20} height={20} />Więcej</button>
        </nav>
        <AnimatePresence>
          {drawer && (
            <motion.div className="ap-drawer" initial={{ opacity: 1 }} exit={{ opacity: 1 }} transition={{ duration: .32 }}>
              <motion.div className="ap-drawer__bg" onClick={() => setDrawer(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .25 }} />
              <motion.div className="ap-drawer__panel" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: .32, ease: EASE }}>{side}</motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ProfileModal open={profile} onClose={() => setProfile(false)} access={access} onChanged={reloadAccess} />
    </PanelCtx.Provider>
  )
}

function NavItem({ to, icon, label, active, locked }: { to: string; icon: keyof typeof Ic; label: string; active: boolean; locked: boolean }) {
  const Icon = Ic[icon]
  return (
    <Link to={to} className={`ap-item ${active ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`} aria-current={active ? 'page' : undefined}>
      <Icon width={18} height={18} /><span>{label}</span>
      {locked && <Ic.lock width={14} height={14} className="ap-item__lock" aria-label="Moduł zablokowany" />}
    </Link>
  )
}

function CompanySwitch({ access, company, impersonating }: { access: Access; company: Company; impersonating: boolean }) {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const many = access.companies.length > 1
  return (
    <div style={{ position: 'relative' }}>
      <button className="ap-co" onClick={() => many && setOpen(v => !v)} aria-expanded={open} style={{ cursor: many ? 'pointer' : 'default' }}>
        <Avatar name={company.name} src={company.logo_url} size={32} />
        <div><b>{company.name}</b><small>{impersonating ? 'Podgląd administratora' : company.industry || 'Twoja firma'}</small></div>
        {many && <Ic.chevron width={14} height={14} />}
      </button>
      {open && (
        <div className="ap-co__pop">
          {access.companies.map(c => <button key={c.id} onClick={() => { setOpen(false); try { localStorage.setItem(STORE, c.id) } catch { /* */ } nav(`/panel?firma=${c.id}`) }}><Avatar name={c.name} src={c.logo_url} size={24} />{c.name}{c.id === company.id && <Ic.check width={14} height={14} style={{ marginLeft: 'auto' }} />}</button>)}
        </div>
      )}
    </div>
  )
}
