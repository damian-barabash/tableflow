import { useRef, useState } from 'react'
import { errText, update, upload } from '../app/api'
import { Avatar, Badge, Field, Ic, PageHead, Panel, useToast } from '../app/ui'
import { AccountPanel } from '../app/profile'
import { prepareUpload } from '../loyalty/render'
import { usePanel, type Company } from './PanelApp'

export function SettingsPage() {
  const { company, canManage, reloadCompany, reloadAccess, access, wallet } = usePanel()
  const toast = useToast()
  const [f, setF] = useState<Company>(company)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const set = (k: keyof Company, v: string) => setF(x => ({ ...x, [k]: v }))
  const dirty = (['name', 'industry', 'email', 'phone', 'address', 'city', 'website', 'nip'] as const).some(k => (f[k] ?? '') !== (company[k] ?? ''))

  const save = async () => {
    setBusy(true)
    try {
      await update('companies', `id=eq.${company.id}`, { name: f.name.trim(), industry: f.industry || null, email: f.email || null, phone: f.phone || null, address: f.address || null, city: f.city || null, website: f.website || null, nip: f.nip || null })
      await reloadCompany(); toast('Zapisano dane firmy')
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const logo = async (fl: File | undefined) => {
    if (!fl) return
    try {
      const blob = await prepareUpload(fl, 600)
      const url = await upload(`c/${company.id}/logo-${Date.now()}.${blob.type === 'image/svg+xml' ? 'svg' : 'png'}`, blob, blob.type || 'image/png')
      await update('companies', `id=eq.${company.id}`, { logo_url: url }); await reloadCompany(); toast('Zmieniono logo')
    } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <>
      <PageHead title="Ustawienia" sub="Dane firmy, Twoje konto i integracje." />
      <div className="ap-grid ap-grid--main">
        <Panel title="Firma" sub={canManage ? 'Dane widoczne dla klientów na karcie i w portfelu.' : 'Tylko właściciel lub menedżer może zmieniać dane firmy.'}>
          <div className="ap-row" style={{ marginBottom: 16 }}>
            <Avatar name={company.name} src={company.logo_url} size={56} />
            {canManage && <><button className="btn btn--ghost btn--sm" onClick={() => file.current?.click()}><Ic.image width={14} height={14} /> {company.logo_url ? 'Zmień logo' : 'Dodaj logo'}</button><input ref={file} hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => { void logo(e.target.files?.[0]); e.target.value = '' }} /></>}
          </div>
          <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="ap-form ap-form--2">
              <Field label="Nazwa firmy" className="span-2"><input className="input" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
              <Field label="Branża"><input className="input" value={f.industry ?? ''} onChange={e => set('industry', e.target.value)} placeholder="np. Kawiarnia" /></Field>
              <Field label="NIP"><input className="input" value={f.nip ?? ''} onChange={e => set('nip', e.target.value)} /></Field>
              <Field label="E-mail"><input className="input" type="email" value={f.email ?? ''} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Telefon"><input className="input" value={f.phone ?? ''} onChange={e => set('phone', e.target.value)} /></Field>
              <Field label="Adres"><input className="input" value={f.address ?? ''} onChange={e => set('address', e.target.value)} /></Field>
              <Field label="Miasto"><input className="input" value={f.city ?? ''} onChange={e => set('city', e.target.value)} /></Field>
              <Field label="Strona www" className="span-2"><input className="input" value={f.website ?? ''} onChange={e => set('website', e.target.value)} /></Field>
            </div>
          </fieldset>
          {canManage && <div className="ap-row ap-row--end" style={{ marginTop: 16 }}><button className="btn btn--primary btn--sm" disabled={!dirty || busy || !f.name.trim()} onClick={save}>{busy ? 'Zapisuję…' : 'Zapisz'}</button></div>}
        </Panel>
        <div className="ap-stack">
          <AccountPanel access={access} onChanged={reloadAccess} />
          <Panel title="Pakiet i integracje">
            <ul className="ap-check-list">
              <li className="ap-row ap-row--between"><span>Karty lojalnościowe</span>{company.modules.includes('loyalty') ? <Badge tone="ok">Aktywne</Badge> : <Badge>Niedostępne</Badge>}</li>
              <li className="ap-row ap-row--between"><span><Ic.apple width={14} height={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Apple Wallet</span>{wallet?.apple ? <Badge tone="ok">Połączony</Badge> : <Badge tone="warn">W konfiguracji</Badge>}</li>
              <li className="ap-row ap-row--between"><span>Google Wallet</span>{wallet?.google ? <Badge tone="ok">Połączony</Badge> : <Badge tone="warn">W konfiguracji</Badge>}</li>
              <li className="ap-row ap-row--between"><span>Recepcja AI, kalendarz, rozmowy</span><Badge><Ic.lock width={11} height={11} /> Wkrótce</Badge></li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  )
}
