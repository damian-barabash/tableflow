import { useEffect, useMemo, useState } from 'react'
import { get } from '../app/api'
import { Badge, Empty, Ic, Loading, PageHead, Panel, fmtDate } from '../app/ui'

export interface AuditRow { id: number; actor: string | null; actor_email: string | null; action: string; target_type: string | null; target_id: string | null; company_id: string | null; detail: { name?: string; changed?: string[]; role?: string; email?: string; deleted?: boolean }; created_at: string }

const TABLE: Record<string, string> = { companies: 'Firma', company_members: 'Członek firmy', loyalty_programs: 'Program lojalnościowy', site_settings: 'Ustawienie strony', waitlist_subscribers: 'Zgłoszenie', admin_profiles: 'Rola w zespole', user: 'Konto' }
const ACTION: Record<string, string> = { insert: 'utworzono', update: 'zmieniono', delete: 'usunięto', create_user: 'utworzono konto', attach_user: 'podłączono konto', reset_password: 'nowe hasło', remove_member: 'odłączono od firmy', delete_user: 'usunięto konto' }
export const AUDIT_LABEL = (l: AuditRow) => `${TABLE[l.target_type ?? ''] ?? l.target_type ?? ''}: ${ACTION[l.action] ?? l.action}${l.detail?.name ? ` — ${l.detail.name}` : l.detail?.email ? ` — ${l.detail.email}` : ''}`

export function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [type, setType] = useState('all')
  useEffect(() => { void get<AuditRow[]>('audit_log?select=*&order=created_at.desc&limit=500').then(setRows).catch(() => setRows([])) }, [])
  const list = useMemo(() => (rows ?? []).filter(r => type === 'all' || r.target_type === type), [rows, type])
  return (
    <>
      <PageHead title="Dziennik zmian" sub="Kto i kiedy zmienił firmy, konta, programy, zgłoszenia i ustawienia strony (ostatnie 500 wpisów)." />
      {!rows ? <Loading /> : (
        <Panel pad>
          <div className="ap-row" style={{ marginBottom: 14 }}><select className="input ap-select" value={type} onChange={e => setType(e.target.value)}><option value="all">Wszystko</option>{Object.entries(TABLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {!list.length ? <Empty icon={<Ic.list width={22} height={22} />} title="Brak wpisów" /> : (
            <div className="ap-table-wrap"><table className="ap-table">
              <thead><tr><th>Kiedy</th><th>Zdarzenie</th><th className="ap-table-hide-sm">Kto</th></tr></thead>
              <tbody>{list.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.created_at, true)}</td>
                  <td><b style={{ fontWeight: 500 }}>{AUDIT_LABEL(r)}</b>{r.detail?.changed?.length ? <small>pola: {r.detail.changed.join(', ')}</small> : null}{r.detail?.role && <small>rola: {r.detail.role}</small>}</td>
                  <td className="ap-table-hide-sm">{r.actor_email ? r.actor_email : <Badge>klient / system</Badge>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
      )}
    </>
  )
}
