import { useState } from 'react'
import { errText, remove, update } from '../../app/api'
import { Field, Ic, Panel, Toggle, useConfirm, useToast } from '../../app/ui'
import { joinUrl, type FieldMode, type Program } from './types'

export function ProgramSettings({ program, onSaved, onDeleted }: { program: Program; onSaved: (p: Program) => void; onDeleted: () => void }) {
  const toast = useToast(), confirm = useConfirm()
  const [rules, setRules] = useState<Program['rules']>(() => Object.assign({ cooldown_minutes: 60, max_per_scan: 3 }, program.rules))
  const [fields, setFields] = useState<Program['join_fields']>(() => Object.assign({ email: 'optional', phone: 'required', birthday: 'off' }, program.join_fields))
  const [busy, setBusy] = useState(false)
  const save = async (patch: Partial<Program>, msg = 'Zapisano ustawienia') => {
    setBusy(true)
    try { const [p] = await update<Program>('loyalty_programs', `id=eq.${program.id}`, patch); onSaved(p); toast(msg) } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const del = async () => {
    if (!await confirm({ title: 'Usunąć program?', text: 'Wszystkie karty klientów, pieczątki i historia tego programu zostaną trwale usunięte. Tej operacji nie można cofnąć.', ok: 'Usuń program', danger: true, typeToConfirm: program.name })) return
    try { await remove('loyalty_programs', `id=eq.${program.id}`); toast('Usunięto program'); onDeleted() } catch (e) { toast(errText(e), 'err') }
  }
  const mode = (k: 'email' | 'phone', v: FieldMode) => setFields(f => ({ ...f, [k]: v }))
  const invalid = false

  return (
    <div className="ap-grid ap-grid--2">
      <Panel title="Zasady pieczątek" sub="Chronią przed przypadkowym lub nieuczciwym nabijaniem.">
        <div className="ap-form">
          <Field label="Blokada między pieczątkami" hint="Obsługa nie przybije kolejnej pieczątki tej samej karcie przed upływem tego czasu (menedżer może to obejść).">
            <select className="input" value={rules.cooldown_minutes} onChange={e => setRules({ ...rules, cooldown_minutes: +e.target.value })}>
              {[[0, 'Brak blokady'], [15, '15 minut'], [30, '30 minut'], [60, '1 godzina'], [120, '2 godziny'], [240, '4 godziny'], [720, '12 godzin'], [1440, '24 godziny']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Maks. pieczątek za jednym razem (obsługa)">
            <select className="input" value={rules.max_per_scan} onChange={e => setRules({ ...rules, max_per_scan: +e.target.value })}>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select>
          </Field>
          <div className="ap-row ap-row--end"><button className="btn btn--primary btn--sm" disabled={busy} onClick={() => save({ rules })}>Zapisz zasady</button></div>
        </div>
      </Panel>
      <Panel title="Formularz dołączenia" sub="Czego wymagamy od klienta, gdy zakłada kartę.">
        <div className="ap-form">
          <p className="ap-muted">Imię i numer telefonu są zawsze wymagane — karta pojawia się u klienta dopiero po ich podaniu. Po telefonie odnajdziesz też kartę, gdy klient zmieni telefon.</p>
          <Field label="E-mail">
            <select className="input" value={fields.email} onChange={e => mode('email', e.target.value as FieldMode)}><option value="required">Wymagany</option><option value="optional">Opcjonalny</option><option value="off">Nie pytaj</option></select>
          </Field>
          <Toggle checked={fields.birthday === 'optional'} onChange={v => setFields(f => ({ ...f, birthday: v ? 'optional' : 'off' }))} label="Pytaj o datę urodzin" hint="Opcjonalnie — przyda się do życzeń i prezentów urodzinowych." />
          <div className="ap-row ap-row--end"><button className="btn btn--primary btn--sm" disabled={busy || invalid} onClick={() => save({ join_fields: { ...fields, phone: 'required' } })}>Zapisz formularz</button></div>
        </div>
      </Panel>
      <Panel title="Status programu">
        <div className="ap-form">
          <Toggle checked={program.status === 'active'} disabled={!program.published_at} onChange={v => save({ status: v ? 'active' : 'archived' }, v ? 'Program aktywny' : 'Program zarchiwizowany')}
            label="Program aktywny" hint={program.published_at ? 'Wyłączenie zatrzymuje wydawanie nowych kart. Istniejące karty zostają.' : 'Najpierw opublikuj projekt karty.'} />
          <dl className="ap-kv"><dt>Adres dołączenia</dt><dd className="ap-mono">{joinUrl(program.slug)}</dd></dl>
        </div>
      </Panel>
      <Panel title="Strefa niebezpieczna">
        <p className="ap-muted" style={{ marginBottom: 12 }}>Usunięcie programu kasuje wszystkie karty klientów i historię pieczątek.</p>
        <button className="btn btn--ghost btn--sm" style={{ color: '#b1321f' }} onClick={del}><Ic.trash width={15} height={15} /> Usuń program</button>
      </Panel>
    </div>
  )
}
