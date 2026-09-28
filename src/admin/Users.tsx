import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { errText, fn, rpc } from '../app/api'
import { Avatar, Badge, Empty, Field, Ic, Loading, Menu, Modal, PageHead, Panel, fmtAgo, fmtDate, useConfirm, useToast } from '../app/ui'
import { Credentials, ROLE_LABEL } from '../panel/TeamPage'
import type { Role } from '../panel/PanelApp'

interface U { id: string; email: string; name: string | null; created_at: string; last_sign_in_at: string | null; platform_role: string | null; companies: { id: string; name: string; role: Role }[] }
const PLATFORM: Record<string, string> = { owner: 'Właściciel platformy', admin: 'Administrator', moderator: 'Edytor treści', viewer: 'Podgląd' }

export function Users({ me }: { me: string }) {
  const toast = useToast(), confirm = useConfirm()
  const [rows, setRows] = useState<U[] | null>(null)
  const [q, setQ] = useState(''); const [kind, setKind] = useState<'all' | 'team' | 'clients' | 'none'>('all')
  const [create, setCreate] = useState(false)
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null)
  const load = useCallback(async () => setRows(await rpc<U[]>('admin_users').catch(() => [])), [])
  useEffect(() => { void load() }, [load])
  const list = useMemo(() => (rows ?? []).filter(u =>
    (kind === 'all' || (kind === 'team' ? !!u.platform_role : kind === 'clients' ? u.companies.length > 0 : !u.platform_role && !u.companies.length)) &&
    (!q || [u.email, u.name, ...u.companies.map(c => c.name)].some(v => v?.toLowerCase().includes(q.toLowerCase())))), [rows, q, kind])
  const call = async (body: Record<string, unknown>, ok: string) => {
    try { const r = await fn<{ password?: string }>('admin-api', body); toast(ok); await load(); return r } catch (e) { toast(errText(e), 'err'); return null }
  }

  return (
    <>
      <PageHead title="Konta" chip={rows ? String(rows.length) : undefined} sub="Wszystkie konta logowania: zespół TableFlow i klienci. Rejestracja publiczna jest wyłączona — konta tworzy administrator lub właściciel firmy."
        actions={<button className="btn btn--primary btn--sm" onClick={() => setCreate(true)}><Ic.plus width={15} height={15} /> Nowe konto</button>} />
      {!rows ? <Loading /> : (
        <Panel pad>
          <div className="ap-row" style={{ marginBottom: 14 }}>
            <label className="ap-search"><Ic.search width={16} height={16} /><input className="input" placeholder="Szukaj: e-mail, imię, firma" value={q} onChange={e => setQ(e.target.value)} /></label>
            <select className="input ap-select" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="all">Wszystkie</option><option value="team">Zespół TableFlow</option><option value="clients">Klienci</option><option value="none">Bez dostępu</option></select>
          </div>
          {!list.length ? <Empty title="Brak kont" /> : (
            <div className="ap-table-wrap"><table className="ap-table">
              <thead><tr><th>Konto</th><th>Dostęp</th><th className="ap-table-hide-sm">Ostatnie logowanie</th><th className="ap-table-hide-sm">Utworzone</th><th /></tr></thead>
              <tbody>{list.map(u => (
                <tr key={u.id}>
                  <td><div className="ap-cell-user"><Avatar name={u.name || u.email} size={32} /><div><b>{u.name || u.email.split('@')[0]}{u.id === me && <small style={{ display: 'inline', marginLeft: 6 }}>(Ty)</small>}</b><small>{u.email}</small></div></div></td>
                  <td><div className="ap-chips">
                    {u.platform_role && <Badge tone="dark">{PLATFORM[u.platform_role] ?? u.platform_role}</Badge>}
                    {u.companies.map(c => <Link key={c.id} to={`/admin/firmy?id=${c.id}`}><Badge tone="brand">{c.name} · {ROLE_LABEL[c.role]}</Badge></Link>)}
                    {!u.platform_role && !u.companies.length && <Badge>brak dostępu</Badge>}
                  </div></td>
                  <td className="ap-table-hide-sm">{fmtAgo(u.last_sign_in_at)}</td>
                  <td className="ap-table-hide-sm">{fmtDate(u.created_at)}</td>
                  <td className="num">{u.id !== me && <Menu items={[
                    { label: 'Nowe hasło', icon: <Ic.lock width={15} height={15} />, onClick: async () => { if (await confirm({ title: 'Wygenerować nowe hasło?', text: `Obecne hasło ${u.email} przestanie działać.`, ok: 'Generuj' })) { const r = await call({ action: 'reset_password', user_id: u.id }, 'Wygenerowano hasło'); if (r?.password) setSecret({ email: u.email, password: r.password }) } } },
                    ...(['admin', 'moderator'] as const).filter(r => r !== u.platform_role).map(r => ({ label: `Nadaj rolę: ${PLATFORM[r]}`, icon: <Ic.shield width={15} height={15} />, onClick: () => void call({ action: 'set_platform_role', user_id: u.id, role: r }, 'Nadano rolę') })),
                    u.platform_role ? { label: 'Odbierz rolę w zespole TableFlow', onClick: () => void call({ action: 'set_platform_role', user_id: u.id, role: null }, 'Odebrano rolę') } : null,
                    { label: 'Usuń konto', icon: <Ic.trash width={15} height={15} />, danger: true, onClick: async () => { if (await confirm({ title: 'Usunąć konto?', text: `Konto ${u.email} zostanie trwale usunięte i straci dostęp do wszystkich firm.`, ok: 'Usuń konto', danger: true, typeToConfirm: u.email })) void call({ action: 'delete_user', user_id: u.id, email: u.email }, 'Usunięto konto') } },
                  ]} />}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
      )}
      <CreateUser open={create} onClose={() => setCreate(false)} onDone={async (email, pw) => { setCreate(false); await load(); if (pw) setSecret({ email, password: pw }) }} />
      <Credentials data={secret} onClose={() => setSecret(null)} />
    </>
  )
}

function CreateUser({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (email: string, pw: string | null) => void }) {
  const toast = useToast()
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [f, setF] = useState({ email: '', name: '', kind: 'client' as 'client' | 'team', company: '', role: 'owner' as Role, platform: 'admin' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF({ email: '', name: '', kind: 'client', company: '', role: 'owner', platform: 'admin' }); void rpc<{ id: string; name: string }[]>('admin_companies').then(setCompanies).catch(() => {}) } }, [open])
  const submit = async () => {
    setBusy(true)
    try {
      const r = await fn<{ password: string | null }>('admin-api', f.kind === 'team' ? { action: 'create_user', email: f.email, name: f.name, platform_role: f.platform } : { action: 'create_user', email: f.email, name: f.name, company_id: f.company, role: f.role })
      toast('Utworzono konto'); onDone(f.email.trim().toLowerCase(), r.password)
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const ok = f.email.includes('@') && (f.kind === 'team' || !!f.company)
  return (
    <Modal open={open} onClose={onClose} title="Nowe konto" footer={<><button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={busy || !ok} onClick={submit}>{busy ? 'Tworzę…' : 'Utwórz konto'}</button></>}>
      <div className="ap-form">
        <Field label="E-mail (login)"><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoFocus /></Field>
        <Field label="Imię i nazwisko"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Rodzaj konta"><select className="input" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as 'client' | 'team' })}><option value="client">Klient (dostęp do firmy)</option><option value="team">Zespół TableFlow</option></select></Field>
        {f.kind === 'client' ? <div className="ap-form ap-form--2">
          <Field label="Firma"><select className="input" value={f.company} onChange={e => setF({ ...f, company: e.target.value })}><option value="">Wybierz…</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Rola"><select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}><option value="owner">Właściciel</option><option value="manager">Menedżer</option><option value="staff">Obsługa</option></select></Field>
        </div> : <Field label="Rola w zespole"><select className="input" value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })}><option value="admin">Administrator (pełny dostęp)</option><option value="moderator">Edytor treści strony</option></select></Field>}
      </div>
    </Modal>
  )
}
