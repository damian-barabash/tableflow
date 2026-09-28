import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Mark } from '../brand/Logo'
import { Gate, isSuper, type Access } from '../app/session'
import { Avatar, ConfirmProvider, Empty, Ic, ToastProvider, EASE } from '../app/ui'
import { rpc } from '../app/api'
import { Overview } from './Overview'
import { Analytics } from './Analytics'
import { Leads } from './Leads'
import { Companies } from './Companies'
import { Users } from './Users'
import { SiteSettings } from './SiteSettings'
import { Audit } from './Audit'
import '../app/app.css'
import './admin.css'

type Tab = '' | 'analityka' | 'zgloszenia' | 'firmy' | 'konta' | 'strona' | 'dziennik'
const NAV: { id: Tab; label: string; icon: keyof typeof Ic }[] = [
  { id: '', label: 'Przegląd', icon: 'home' },
  { id: 'analityka', label: 'Analityka ruchu', icon: 'analytics' },
  { id: 'zgloszenia', label: 'Zgłoszenia', icon: 'inbox' },
  { id: 'firmy', label: 'Firmy', icon: 'building' },
  { id: 'konta', label: 'Konta', icon: 'users' },
  { id: 'strona', label: 'Strona', icon: 'globe' },
  { id: 'dziennik', label: 'Dziennik zmian', icon: 'list' },
]

export default function AdminApp() {
  useEffect(() => { document.body.classList.add('ap-body'); return () => document.body.classList.remove('ap-body') }, [])
  return (
    <ToastProvider><ConfirmProvider>
      <Gate title="Administracja" sub="Panel zespołu TableFlow — statystyki, klienci, zgłoszenia i ustawienia strony.">
        {(access, logout) => isSuper(access) ? <Shell access={access} logout={logout} /> : (
          <div className="ap-gate"><div className="ap-login" style={{ alignItems: 'center', textAlign: 'center' }}>
            <Mark size={30} />
            <Empty title="Brak uprawnień administratora" text={access.platform_role === 'moderator' ? 'Masz dostęp do edytora treści strony.' : 'To konto nie ma dostępu do administracji.'}
              action={<div className="ap-row" style={{ justifyContent: 'center' }}>{access.platform_role === 'moderator' && <a className="btn btn--primary btn--sm" href="/edit-mod">Edytor treści</a>}{access.companies.length > 0 && <Link className="btn btn--ghost btn--sm" to="/panel">Panel firmy</Link>}<button className="btn btn--ghost btn--sm" onClick={logout}>Wyloguj</button></div>} />
          </div></div>
        )}
      </Gate>
    </ConfirmProvider></ToastProvider>
  )
}

function Shell({ access, logout }: { access: Access; logout: () => Promise<void> }) {
  const loc = useLocation()
  const tab = (loc.pathname.split('/')[2] ?? '') as Tab
  const [drawer, setDrawer] = useState(false)
  const [pending, setPending] = useState(0)
  useEffect(() => { void rpc<{ leads_new: number }>('admin_overview').then(o => setPending(o.leads_new)).catch(() => {}) }, [tab])
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0) }, [tab])
  const side = (
    <aside className="ap-side">
      <div className="ap-side__logo"><Mark size={22} /><span>TableFlow</span><small>Admin</small></div>
      <div className="ap-sec">Zarządzanie</div>
      {NAV.map(n => { const Icon = Ic[n.icon]; return (
        <Link key={n.id} to={`/admin${n.id ? `/${n.id}` : ''}`} className={`ap-item ${tab === n.id ? 'is-active' : ''}`}><Icon width={18} height={18} /><span>{n.label}</span>{n.id === 'zgloszenia' && pending > 0 && <span className="ap-item__badge">{pending}</span>}</Link>
      ) })}
      <div className="ap-sec">Skróty</div>
      <a className="ap-item" href="/edit-mod"><Ic.edit width={18} height={18} /><span>Edytor treści</span></a>
      {access.companies.length > 0 && <Link className="ap-item" to="/panel"><Ic.card width={18} height={18} /><span>Mój panel firmy</span></Link>}
      <a className="ap-item" href="/" target="_blank" rel="noreferrer"><Ic.external width={18} height={18} /><span>Otwórz stronę</span></a>
      <div className="ap-side__foot">
        <div className="ap-user"><Avatar name={access.name || access.email} size={30} /><div><b>{access.name || access.email.split('@')[0]}</b><small>{access.platform_role === 'owner' ? 'Właściciel platformy' : 'Administrator'}</small></div><button className="ap-icon-btn" onClick={logout} title="Wyloguj" aria-label="Wyloguj"><Ic.logout width={16} height={16} /></button></div>
      </div>
    </aside>
  )
  let page: ReactNode
  switch (tab) {
    case 'analityka': page = <Analytics />; break
    case 'zgloszenia': page = <Leads onChange={() => rpc<{ leads_new: number }>('admin_overview').then(o => setPending(o.leads_new)).catch(() => {})} />; break
    case 'firmy': page = <Companies />; break
    case 'konta': page = <Users me={access.user_id} />; break
    case 'strona': page = <SiteSettings />; break
    case 'dziennik': page = <Audit />; break
    default: page = <Overview />
  }
  return (
    <div className="ap">
      {side}
      <header className="ap-top"><button className="ap-icon-btn" onClick={() => setDrawer(true)} aria-label="Menu"><Ic.menu width={20} height={20} /></button><Mark size={20} /><b>{NAV.find(n => n.id === tab)?.label ?? 'Admin'}</b></header>
      <main className="ap-main"><div className="ap-main__in">
        <AnimatePresence mode="wait"><motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .3, ease: EASE }}>{page}</motion.div></AnimatePresence>
      </div></main>
      <nav className="ap-bottom" aria-label="Nawigacja">
        {NAV.filter(n => ['', 'analityka', 'zgloszenia', 'firmy'].includes(n.id)).map(n => { const Icon = Ic[n.icon]; return <Link key={n.id} to={`/admin${n.id ? `/${n.id}` : ''}`} className={tab === n.id ? 'is-active' : ''}><Icon width={20} height={20} />{n.label.split(' ')[0]}</Link> })}
        <button onClick={() => setDrawer(true)}><Ic.menu width={20} height={20} />Więcej</button>
      </nav>
      <AnimatePresence>{drawer && <motion.div className="ap-drawer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="ap-drawer__bg" onClick={() => setDrawer(false)} /><motion.div initial={{ x: -40 }} animate={{ x: 0 }} exit={{ x: -40 }} transition={{ duration: .3, ease: EASE }}>{side}</motion.div></motion.div>}</AnimatePresence>
    </div>
  )
}
