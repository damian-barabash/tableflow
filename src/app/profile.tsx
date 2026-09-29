import { useRef, useState } from 'react'
import { getValidSession } from '../lib/auth'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase'
import { errText } from './api'
import { removeAvatar, saveAvatar } from './avatar'
import type { Access } from './session'
import { Avatar, Field, Ic, Modal, Panel, Spinner, useToast } from './ui'

/** Avatar picker: any photo → square WebP (converted in the browser). */
export function AvatarEditor({ access, onChanged, size = 88 }: { access: Access; onChanged: () => void; size?: number }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const pick = async (f: File | undefined) => {
    if (!f) return
    setBusy(true); setPreview(URL.createObjectURL(f))
    try { await saveAvatar(f); toast('Zapisano zdjęcie profilowe'); onChanged() }
    catch (e) { toast(errText(e) === 'bad_image' ? 'Nie udało się odczytać zdjęcia' : errText(e) === 'too_big' ? 'Zdjęcie jest za duże (max 20 MB)' : errText(e), 'err') }
    setBusy(false); setPreview(null)
  }
  const del = async () => { setBusy(true); try { await removeAvatar(); toast('Usunięto zdjęcie'); onChanged() } catch (e) { toast(errText(e), 'err') } setBusy(false) }
  const name = access.name || access.email
  return (
    <div className="ap-avatar-edit">
      <button type="button" className="ap-avatar-edit__pic" onClick={() => input.current?.click()} disabled={busy} aria-label="Zmień zdjęcie profilowe" style={{ width: size, height: size }}>
        {preview ? <img src={preview} alt="" className="ap-avatar" style={{ width: size, height: size }} /> : <Avatar name={name} src={access.avatar} size={size} />}
        <span className="ap-avatar-edit__ov">{busy ? <Spinner size={20} /> : <Ic.camera width={20} height={20} />}</span>
      </button>
      <div>
        <b>{name}</b>
        <small>{access.email}</small>
        <div className="ap-row" style={{ marginTop: 8 }}>
          <button className="btn btn--ghost btn--xs" onClick={() => input.current?.click()} disabled={busy}><Ic.image width={13} height={13} /> {access.avatar ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}</button>
          {access.avatar && <button className="btn btn--ghost btn--xs" onClick={del} disabled={busy}>Usuń</button>}
        </div>
        <small className="ap-avatar-edit__hint">JPG, PNG, HEIC… — zapiszemy jako lekki WebP 512×512.</small>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

export function PasswordForm() {
  const toast = useToast()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false)
  const change = async () => {
    if (pw.length < 8) { toast('Hasło musi mieć min. 8 znaków', 'err'); return }
    if (pw !== pw2) { toast('Hasła nie są takie same', 'err'); return }
    setBusy(true)
    const s = await getValidSession()
    const r = s ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { method: 'PUT', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }) : null
    setBusy(false)
    if (r?.ok) { toast('Zmieniono hasło'); setPw(''); setPw2('') } else toast('Nie udało się zmienić hasła', 'err')
  }
  return (
    <div className="ap-form">
      <div className="ap-form ap-form--2">
        <Field label="Nowe hasło"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Field label="Powtórz hasło"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
      </div>
      <div className="ap-row ap-row--end"><button className="btn btn--ghost btn--sm" disabled={busy || !pw} onClick={change}>Zmień hasło</button></div>
    </div>
  )
}

/** "Mój profil" — opened from the user block at the bottom of the sidebar (panel + admin). */
export function ProfileModal({ open, onClose, access, onChanged }: { open: boolean; onClose: () => void; access: Access; onChanged: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Mój profil" sub="Zdjęcie widzą Twój zespół i administratorzy.">
      <AvatarEditor access={access} onChanged={onChanged} />
      <div className="ap-divider" />
      <PasswordForm />
    </Modal>
  )
}

export function AccountPanel({ access, onChanged }: { access: Access; onChanged: () => void }) {
  return (
    <Panel title="Twoje konto">
      <AvatarEditor access={access} onChanged={onChanged} size={72} />
      <div className="ap-divider" style={{ margin: '16px 0' }} />
      <PasswordForm />
    </Panel>
  )
}
