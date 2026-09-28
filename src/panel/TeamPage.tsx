import { useCallback, useEffect, useState } from 'react'
import { errText, fn, get } from '../app/api'
import { Avatar, Badge, Empty, Field, Ic, Loading, Menu, Modal, PageHead, Panel, fmtDate, useConfirm, useCopy, useToast } from '../app/ui'
import { usePanel, type Role } from './PanelApp'

interface Member { user_id: string; role: Role; display_name: string | null; email: string | null; created_at: string }
export const ROLE_LABEL: Record<Role, string> = { owner: 'Właściciel', manager: 'Menedżer', staff: 'Obsługa' }
const ROLE_HINT: Record<Role, string> = {
  owner: 'Pełny dostęp: projekt karty, powiadomienia, zespół i ustawienia firmy.',
  manager: 'Jak właściciel, ale nie może zmieniać właścicieli.',
  staff: 'Skaner pieczątek, lista kart i statystyki. Bez projektu, wysyłek i ustawień.',
}

export function TeamPage() {
  const { company, canManage, role, access, impersonating } = usePanel()
  const toast = useToast(), confirm = useConfirm()
  const [list, setList] = useState<Member[] | null>(null)
  const [add, setAdd] = useState(false)
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null)
  const load = useCallback(async () => setList(await get<Member[]>(`company_members?company_id=eq.${company.id}&select=*&order=created_at.asc`).catch(() => [])), [company.id])
  useEffect(() => { void load() }, [load])

  const call = async (body: Record<string, unknown>, ok: string) => {
    try { const r = await fn<{ password?: string }>('admin-api', { company_id: company.id, ...body }); toast(ok); await load(); return r } catch (e) { toast(errText(e), 'err'); return null }
  }
  const canTouch = (m: Member) => canManage && m.user_id !== access.user_id && (m.role !== 'owner' || role === 'owner' || impersonating)

  return (
    <>
      <PageHead title="Zespół" chip={list ? String(list.length) : undefined} sub="Konta osób, które obsługują program lojalnościowy. Każdy loguje się własnym e-mailem."
        actions={canManage && <button className="btn btn--primary btn--sm" onClick={() => setAdd(true)}><Ic.plus width={15} height={15} /> Dodaj osobę</button>} />
      {!list ? <Loading /> : (
        <div className="ap-grid ap-grid--main">
          <Panel pad>
            {!list.length ? <Empty title="Brak osób" /> : (
              <div className="ap-table-wrap"><table className="ap-table">
                <thead><tr><th>Osoba</th><th>Rola</th><th className="ap-table-hide-sm">Od</th><th /></tr></thead>
                <tbody>{list.map(m => (
                  <tr key={m.user_id}>
                    <td><div className="ap-cell-user"><Avatar name={m.display_name || m.email || '?'} size={32} /><div><b>{m.display_name || m.email?.split('@')[0]}{m.user_id === access.user_id && <small style={{ display: 'inline', marginLeft: 6 }}>(Ty)</small>}</b><small>{m.email}</small></div></div></td>
                    <td><Badge tone={m.role === 'owner' ? 'dark' : m.role === 'manager' ? 'brand' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge></td>
                    <td className="ap-table-hide-sm">{fmtDate(m.created_at)}</td>
                    <td className="num">{canTouch(m) && <Menu items={[
                      ...(['owner', 'manager', 'staff'] as Role[]).filter(r => r !== m.role && (r !== 'owner' || role === 'owner' || impersonating)).map(r => ({ label: `Zmień na: ${ROLE_LABEL[r]}`, onClick: () => void call({ action: 'update_member', user_id: m.user_id, role: r }, 'Zmieniono rolę') })),
                      { label: 'Nowe hasło', icon: <Ic.lock width={15} height={15} />, onClick: async () => { if (await confirm({ title: 'Wygenerować nowe hasło?', text: `Dotychczasowe hasło ${m.email} przestanie działać.`, ok: 'Generuj' })) { const r = await call({ action: 'reset_password', user_id: m.user_id }, 'Wygenerowano nowe hasło'); if (r?.password) setSecret({ email: m.email ?? '', password: r.password }) } } },
                      { label: 'Usuń z zespołu', icon: <Ic.trash width={15} height={15} />, danger: true, onClick: async () => { if (await confirm({ title: 'Usunąć z zespołu?', text: `${m.display_name || m.email} straci dostęp do panelu firmy ${company.name}.`, ok: 'Usuń', danger: true })) void call({ action: 'remove_member', user_id: m.user_id, delete_account: true }, 'Usunięto z zespołu') } },
                    ]} />}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Panel>
          <Panel title="Role">
            <ul className="ap-check-list">{(Object.keys(ROLE_LABEL) as Role[]).map(r => <li key={r}><Badge tone={r === 'owner' ? 'dark' : r === 'manager' ? 'brand' : 'neutral'}>{ROLE_LABEL[r]}</Badge><p className="ap-muted" style={{ marginTop: 6 }}>{ROLE_HINT[r]}</p></li>)}</ul>
          </Panel>
        </div>
      )}
      <AddMember open={add} onClose={() => setAdd(false)} onCreated={(email, password) => { setAdd(false); void load(); if (password) setSecret({ email, password }) }} />
      <Credentials data={secret} onClose={() => setSecret(null)} />
    </>
  )
}

function AddMember({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (email: string, password: string | null) => void }) {
  const { company, role, impersonating } = usePanel()
  const toast = useToast()
  const [f, setF] = useState({ name: '', email: '', role: 'staff' as Role })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF({ name: '', email: '', role: 'staff' }) }, [open])
  const submit = async () => {
    setBusy(true)
    try {
      const r = await fn<{ password: string | null; existing: boolean }>('admin-api', { action: 'create_user', company_id: company.id, email: f.email, name: f.name, role: f.role })
      toast(r.existing ? 'Dodano istniejące konto do zespołu' : 'Utworzono konto'); onCreated(f.email.trim().toLowerCase(), r.password)
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  return (
    <Modal open={open} onClose={onClose} title="Dodaj osobę do zespołu" sub="Utworzymy konto i hasło — przekaż je tej osobie."
      footer={<><button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={busy || !f.email.includes('@')} onClick={submit}>{busy ? 'Tworzę…' : 'Utwórz konto'}</button></>}>
      <div className="ap-form">
        <Field label="Imię i nazwisko"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="E-mail (login)"><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Rola" hint={ROLE_HINT[f.role]}>
          <select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>
            <option value="staff">Obsługa</option><option value="manager">Menedżer</option>{(role === 'owner' || impersonating) && <option value="owner">Właściciel</option>}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

export function Credentials({ data, onClose }: { data: { email: string; password: string } | null; onClose: () => void }) {
  const copy = useCopy()
  const text = data ? `Panel TableFlow: ${window.location.origin}/panel\nLogin: ${data.email}\nHasło: ${data.password}` : ''
  return (
    <Modal open={!!data} onClose={onClose} title="Dane logowania" sub="Hasło pokazujemy tylko raz — skopiuj je teraz. Osoba może je później zmienić w Ustawieniach."
      footer={<><button className="btn btn--ghost btn--sm" onClick={() => copy(text, 'Skopiowano dane logowania')}><Ic.copy width={14} height={14} /> Kopiuj wszystko</button><button className="btn btn--primary btn--sm" onClick={onClose}>Gotowe</button></>}>
      <dl className="ap-kv"><dt>Adres</dt><dd className="ap-mono">{window.location.origin}/panel</dd><dt>Login</dt><dd className="ap-mono">{data?.email}</dd></dl>
      <div className="ap-secret"><span>{data?.password}</span><button onClick={() => copy(data?.password ?? '', 'Skopiowano hasło')} aria-label="Kopiuj hasło"><Ic.copy width={16} height={16} /></button></div>
    </Modal>
  )
}
