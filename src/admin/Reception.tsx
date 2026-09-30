import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { errText, fn, remove, rpc, update } from '../app/api'
import { Badge, Empty, Field, Ic, Loading, Menu, Modal, PageHead, Panel, Spinner, Toggle, fmtAgo, fmtNum, useConfirm, useToast } from '../app/ui'
import { prettyPhone } from '../panel/reception/model'
import '../panel/reception/reception.css'

interface Platform { el_key_hint: string | null; el_account: string | null; el_status: 'missing' | 'ok' | 'error'; el_error: string | null; el_checked_at: string | null; el_generation: number; tools: Record<string, string>; webhooks_ok: boolean; default_llm: string; default_tts_model: string; twilio_sid_hint: string | null }
interface Num { id: string; phone_number: string; label: string | null; el_phone_id: string | null; company_id: string | null; company: string | null; assigned_at: string | null; last_error: string | null; note: string | null }
interface Co { id: string; name: string; modules: string[]; agent_id: string | null; synced_at: string | null; config_changed_at: string | null; sync_error: string | null; el_generation: number | null; voice: string | null; services: number; resources: number; calls_30d: number; minutes_30d: number; numbers: string[] }
interface V { voice_id: string; name: string; gender: string | null; accent: string | null; description: string | null; preview_url: string | null; enabled: boolean; sort: number; public_owner_id?: string | null; source?: string; use_case?: string | null }
interface Data { platform: Platform; numbers: Num[]; companies: Co[]; voices: V[] }

const call = <T,>(action: string, body: Record<string, unknown> = {}) => fn<T>('reception', { action, ...body })
const LLMS = ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gpt-5.4-mini', 'gpt-4.1-mini', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'gpt-5.4']
const TTS = [['eleven_v3_conversational', 'Eleven v3 Conversational — najbardziej ludzki'], ['eleven_flash_v2_5', 'Flash v2.5 — najszybszy'], ['eleven_turbo_v2_5', 'Turbo v2.5'], ['eleven_multilingual_v2', 'Multilingual v2']]

export function Reception() {
  const toast = useToast(), confirm = useConfirm()
  const [d, setD] = useState<Data | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [key, setKey] = useState(''), [same, setSame] = useState(false)
  const [tw, setTw] = useState({ sid: '', token: '' })
  const [imp, setImp] = useState(false)
  const [lib, setLib] = useState(false)
  const [report, setReport] = useState<string[]>([])
  const load = useCallback(async () => { const x = await rpc<Data>('admin_reception').catch(() => null); if (x?.platform) setD(x) }, [])
  useEffect(() => { void load() }, [load])
  const run = async (id: string, action: string, body: Record<string, unknown> = {}, ok?: string) => {
    setBusy(id)
    try { const r = await call<{ report?: unknown[]; warnings?: string[] }>(action, body); await load(); if (ok) toast(ok); return r }
    catch (e) { toast(errText(e), 'err'); await load(); return null }
    finally { setBusy(null) }
  }
  if (!d) return <Loading />
  const p = d.platform
  const withReception = d.companies.filter(c => c.modules.includes('reception'))
  return (
    <>
      <PageHead title="Recepcja AI" sub="Jedno konto ElevenLabs dla wszystkich firm: klucz, numery Twilio, głosy do wyboru i asystenci poszczególnych firm."
        actions={<button className="btn btn--ghost btn--sm" onClick={() => run('all', 'admin_sync_all', {}, 'Zaktualizowano asystentów')} disabled={!!busy || p.el_status !== 'ok'}>{busy === 'all' ? <Spinner size={14} /> : <Ic.refresh width={14} height={14} />} Wgraj wszystkich asystentów</button>} />
      <div className="ap-grid ap-grid--2" style={{ marginBottom: 20 }}>
        <Panel title="Konto ElevenLabs" sub="Klucz jest zaszyfrowany w Supabase Vault — nie trafia do przeglądarki." actions={<Badge tone={p.el_status === 'ok' ? 'ok' : p.el_status === 'error' ? 'err' : 'warn'}>{p.el_status === 'ok' ? 'Połączone' : p.el_status === 'error' ? 'Błąd' : 'Brak klucza'}</Badge>}>
          <dl className="ap-kv" style={{ marginBottom: 14 }}>
            <dt>Klucz</dt><dd className="ap-mono">{p.el_key_hint ?? '—'}</dd>
            <dt>Konto</dt><dd>{p.el_account ?? '—'}</dd>
            <dt>Narzędzia</dt><dd>{Object.keys(p.tools ?? {}).length}/7 {p.webhooks_ok ? '· webhooki OK' : '· webhooki: brak'}</dd>
            <dt>Sprawdzono</dt><dd>{fmtAgo(p.el_checked_at)}</dd>
          </dl>
          {p.el_error && <div className="ap-note ap-note--warn" style={{ marginBottom: 12 }}><span>{p.el_error}</span></div>}
          <div className="ap-form">
            <Field label={p.el_key_hint ? 'Nowy klucz API' : 'Klucz API'} hint="ElevenLabs → Developers → API Keys. Uprawnienia: ElevenLabs Agents (zapis), Voices (odczyt i zapis), Models (odczyt), Text to Speech, Workspace webhooks; opcjonalnie User (odczyt).">
              <input className="input ap-mono" type="password" autoComplete="off" placeholder="sk_…" value={key} onChange={e => setKey(e.target.value)} />
            </Field>
            {p.el_key_hint && <Toggle checked={same} onChange={setSame} label="To samo konto — tylko nowy klucz" hint="Wyłączone = przenosiny na inne konto: numery zostaną zaimportowane ponownie (dane Twilio są w sejfie), a asystenci wszystkich firm odtworzeni na nowym koncie. Nic nie ginie — konfiguracja jest w naszej bazie." />}
            <div className="ap-row">
              <button className="btn btn--primary btn--sm" disabled={!key.trim() || !!busy} onClick={async () => { if (p.el_key_hint && !same && !await confirm({ title: 'Przenieść na nowe konto ElevenLabs?', text: 'Wszystkie numery zostaną zaimportowane na nowe konto, a asystenci odtworzeni. Najpierw przenieś numery w Twilio/ElevenLabs, jeśli to konieczne. Na starym koncie nic nie usuwamy.', ok: 'Przenieś' })) return; const r = await run('key', 'admin_set_key', { key: key.trim(), same_account: same }, 'Zapisano klucz'); if (r) { setKey(''); setReport((r.report as string[]) ?? []) } }}>{busy === 'key' ? 'Sprawdzam…' : 'Zapisz i połącz'}</button>
              {p.el_key_hint && <button className="btn btn--ghost btn--sm" disabled={!!busy} onClick={() => run('check', 'admin_check', {}, 'Sprawdzono')}>{busy === 'check' ? <Spinner size={14} /> : null} Sprawdź</button>}
              {p.el_status === 'ok' && <button className="btn btn--ghost btn--sm" disabled={!!busy} onClick={async () => { const r = await run('setup', 'admin_setup', {}, 'Skonfigurowano narzędzia i webhooki'); if (r?.warnings?.length) setReport(r.warnings) }}>{busy === 'setup' ? <Spinner size={14} /> : null} Konfiguruj ponownie</button>}
            </div>
            {report.length > 0 && <div className="ap-note ap-note--warn"><div>{report.map((r, i) => <div key={i}>{r}</div>)}</div></div>}
          </div>
        </Panel>
        <div className="ap-stack">
          <Panel title="Modele" sub="Dla wszystkich asystentów. Po zmianie kliknij „Wgraj wszystkich asystentów”.">
            <div className="ap-form">
              <Field label="Model językowy (mózg)" hint="Gemini 2.5 Flash — najszybszy, ludzkie tempo rozmowy. Większe modele są mądrzejsze, ale odpowiadają wolniej."><select className="input" value={p.default_llm} onChange={async e => { await update('rc_platform', 'id=eq.1', { default_llm: e.target.value }).catch(err => toast(errText(err), 'err')); await load() }}>{[...new Set([p.default_llm, ...LLMS])].map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
              <Field label="Model głosu (tryb „Naturalna”)" hint="Klient wybiera w panelu Naturalna/Szybka. Jeśli model jest niedostępny na koncie, asystent automatycznie użyje Flash v2.5."><select className="input" value={p.default_tts_model} onChange={async e => { await update('rc_platform', 'id=eq.1', { default_tts_model: e.target.value }).catch(err => toast(errText(err), 'err')); await load() }}>{TTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            </div>
          </Panel>
          <Panel title="Twilio" sub="Dane konta Twilio do importu numerów (i ponownego importu przy zmianie konta ElevenLabs). Trzymane w Vault." actions={<Badge tone={p.twilio_sid_hint ? 'ok' : 'neutral'}>{p.twilio_sid_hint ?? 'nie zapisano'}</Badge>}>
            <div className="ap-form ap-form--2">
              <Field label="Account SID"><input className="input ap-mono" autoComplete="off" placeholder="AC…" value={tw.sid} onChange={e => setTw({ ...tw, sid: e.target.value })} /></Field>
              <Field label="Auth Token"><input className="input ap-mono" type="password" autoComplete="off" value={tw.token} onChange={e => setTw({ ...tw, token: e.target.value })} /></Field>
            </div>
            <div className="ap-row ap-row--end" style={{ marginTop: 12 }}><button className="btn btn--ghost btn--sm" disabled={!tw.sid || !tw.token || !!busy} onClick={async () => { if (await run('tw', 'admin_twilio', tw, 'Zapisano dane Twilio')) setTw({ sid: '', token: '' }) }}>Zapisz</button></div>
          </Panel>
        </div>
      </div>

      <Panel title="Numery telefonów" sub="Firma z włączoną Recepcją AI bez numeru dostaje automatycznie najstarszy wolny numer (przy pierwszym wgraniu asystenta). Możesz też przypisać ręcznie — kilka numerów do jednej firmy."
        actions={<div className="ap-row"><button className="btn btn--ghost btn--sm" disabled={!!busy || p.el_status !== 'ok'} onClick={() => run('pull', 'numbers_pull', {}, 'Pobrano numery z ElevenLabs')}>{busy === 'pull' ? <Spinner size={14} /> : <Ic.refresh width={14} height={14} />} Pobierz z ElevenLabs</button><button className="btn btn--primary btn--sm" disabled={p.el_status !== 'ok'} onClick={() => setImp(true)}><Ic.plus width={14} height={14} /> Importuj z Twilio</button></div>}>
        {!d.numbers.length ? <Empty icon={<Ic.phone width={22} height={22} />} title="Brak numerów" text="Kup numer w Twilio (z obsługą połączeń głosowych, najlepiej polski +48), potem zaimportuj go tutaj. Do tego czasu firmy korzystają z rozmowy testowej w panelu." /> : (
          <div className="ap-table-wrap"><table className="ap-table">
            <thead><tr><th>Numer</th><th>Firma</th><th className="ap-table-hide-sm">Stan</th><th /></tr></thead>
            <tbody>{d.numbers.map(n => (
              <tr key={n.id}>
                <td><b className="ap-mono" style={{ fontSize: 14 }}>{prettyPhone(n.phone_number)}</b><small>{n.label}</small></td>
                <td><select className="input ap-select" value={n.company_id ?? ''} disabled={!!busy} onChange={e => run(n.id, 'number_assign', { number_id: n.id, target: e.target.value || null }, e.target.value ? 'Przypisano numer' : 'Zwolniono numer')}>
                  <option value="">— wolny —</option>{d.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>{n.note && <small>{n.note}</small>}</td>
                <td className="ap-table-hide-sm">{busy === n.id ? <Spinner size={14} /> : n.last_error ? <Badge tone="err">{n.last_error.slice(0, 60)}</Badge> : n.el_phone_id ? <Badge tone="ok">W ElevenLabs</Badge> : <Badge tone="warn">Do importu</Badge>}</td>
                <td className="num"><Menu items={[
                  { label: 'Usuń tylko z TableFlow', icon: <Ic.close width={15} height={15} />, onClick: async () => { if (await confirm({ title: 'Usunąć numer z listy?', text: 'Numer zostanie w ElevenLabs i Twilio.', ok: 'Usuń' })) void run(n.id, 'number_delete', { number_id: n.id }, 'Usunięto') } },
                  { label: 'Usuń też z ElevenLabs', icon: <Ic.trash width={15} height={15} />, danger: true, onClick: async () => { if (await confirm({ title: 'Usunąć numer z ElevenLabs?', text: 'Połączenia przestaną trafiać do asystenta. Numer w Twilio zostaje.', ok: 'Usuń', danger: true })) void run(n.id, 'number_delete', { number_id: n.id, remote: true }, 'Usunięto') } },
                ]} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>

      <div className="ap-grid ap-grid--main" style={{ marginTop: 20 }}>
        <Panel title="Asystenci firm" sub={`${withReception.length} firm z Recepcją AI`}>
          {!d.companies.length ? <Empty title="Żadna firma nie ma jeszcze Recepcji AI" text="Włącz moduł w zakładce Firmy." action={<Link className="btn btn--ghost btn--sm" to="/admin/firmy">Firmy</Link>} /> : (
            <div className="ap-table-wrap"><table className="ap-table">
              <thead><tr><th>Firma</th><th>Asystent</th><th className="ap-table-hide-sm">30 dni</th><th /></tr></thead>
              <tbody>{d.companies.map(c => {
                const stale = !c.synced_at || (c.config_changed_at && c.config_changed_at > c.synced_at) || c.el_generation !== p.el_generation
                return (
                  <tr key={c.id}>
                    <td><b>{c.name}</b><small>{c.services} usług · {c.resources} zasobów · {c.numbers.length ? c.numbers.map(prettyPhone).join(', ') : 'bez numeru'}</small></td>
                    <td>{c.sync_error ? <Badge tone="err">Błąd</Badge> : !c.agent_id ? <Badge>Nie wgrany</Badge> : stale ? <Badge tone="warn">Zmiany czekają</Badge> : <Badge tone="ok">Aktualny</Badge>}<small>{c.voice ?? 'głos domyślny'}{c.synced_at ? ` · ${fmtAgo(c.synced_at)}` : ''}</small>{c.sync_error && <small style={{ color: '#b1321f' }}>{c.sync_error.slice(0, 120)}</small>}</td>
                    <td className="ap-table-hide-sm">{fmtNum(c.calls_30d)} rozmów<small>{fmtNum(c.minutes_30d)} min</small></td>
                    <td className="num"><div className="ap-row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button className="btn btn--ghost btn--xs" disabled={!!busy || p.el_status !== 'ok'} onClick={() => run(`c${c.id}`, 'admin_sync_company', { target: c.id }, 'Wgrano asystenta')}>{busy === `c${c.id}` ? <Spinner size={12} /> : 'Wgraj'}</button>
                      <Link className="btn btn--ghost btn--xs" to={`/panel/asystent?firma=${c.id}`}>Panel</Link>
                    </div></td>
                  </tr>
                )
              })}</tbody>
            </table></div>
          )}
        </Panel>
        <Panel title="Głosy dla klientów" sub="Tylko te głosy klienci widzą w panelu. Pierwszy na liście jest domyślny." actions={<button className="btn btn--ghost btn--sm" disabled={p.el_status !== 'ok'} onClick={() => setLib(true)}><Ic.plus width={14} height={14} /> Dodaj</button>}>
          {!d.voices.length ? <Empty title="Brak głosów" text="Dodaj kilka polskich głosów z biblioteki ElevenLabs (kobiece i męskie)." /> : (
            <div className="rc-list">{d.voices.map(v => (
              <div key={v.voice_id} className="rc-li" style={{ opacity: v.enabled ? 1 : .5 }}>
                <PlayBtn url={v.preview_url} />
                <div><b>{v.name}</b><small>{[v.gender, v.accent, v.description].filter(Boolean).join(' · ')}</small></div>
                <Toggle checked={v.enabled} onChange={async on => { await update('rc_voices', `voice_id=eq.${v.voice_id}`, { enabled: on }).catch(e => toast(errText(e), 'err')); await load() }} />
                <Menu items={[
                  { label: 'Na górę (domyślny)', onClick: async () => { await update('rc_voices', `voice_id=eq.${v.voice_id}`, { sort: Math.min(...d.voices.map(x => x.sort)) - 1 }); await load() } },
                  { label: 'Usuń z listy', danger: true, icon: <Ic.trash width={15} height={15} />, onClick: async () => { await remove('rc_voices', `voice_id=eq.${v.voice_id}`).catch(e => toast(errText(e), 'err')); await load() } },
                ]} />
              </div>
            ))}</div>
          )}
        </Panel>
      </div>

      <ImportNumber open={imp} hasTwilio={!!p.twilio_sid_hint} onClose={() => setImp(false)} onDone={() => { setImp(false); void load() }} />
      <VoiceLibrary open={lib} have={d.voices.map(v => v.voice_id)} onClose={() => setLib(false)} onAdded={() => void load()} />
    </>
  )
}

function PlayBtn({ url }: { url: string | null }) {
  const [on, setOn] = useState(false)
  const a = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => a.current?.pause(), [])
  if (!url) return <span className="rc-play" style={{ opacity: .3 }}>▶</span>
  return <button className={`rc-play ${on ? 'is-on' : ''}`} onClick={() => { if (on) { a.current?.pause(); setOn(false); return } a.current = new Audio(url); a.current.onended = () => setOn(false); void a.current.play(); setOn(true) }} aria-label="Odsłuchaj">{on ? '❚❚' : '▶'}</button>
}

function ImportNumber({ open, hasTwilio, onClose, onDone }: { open: boolean; hasTwilio: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({ phone_number: '', label: '', sid: '', token: '', remember: true })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF({ phone_number: '', label: '', sid: '', token: '', remember: true }) }, [open])
  const submit = async () => {
    setBusy(true)
    try { await call('number_import', { ...f, sid: f.sid || undefined, token: f.token || undefined }); toast('Zaimportowano numer'); onDone() } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  return (
    <Modal open={open} onClose={onClose} title="Importuj numer z Twilio" sub="Numer musi być na koncie Twilio (z obsługą Voice). ElevenLabs sam ustawi przekierowanie połączeń do asystenta."
      footer={<><button className="btn btn--ghost btn--sm" onClick={onClose}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={busy || f.phone_number.replace(/\D/g, '').length < 9 || (!hasTwilio && (!f.sid || !f.token))} onClick={submit}>{busy ? 'Importuję…' : 'Importuj'}</button></>}>
      <div className="ap-form">
        <Field label="Numer (format międzynarodowy)"><input className="input ap-mono" placeholder="+48 22 123 45 67" value={f.phone_number} onChange={e => setF({ ...f, phone_number: e.target.value })} autoFocus /></Field>
        <Field label="Etykieta"><input className="input" placeholder="np. Warszawa #1" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} /></Field>
        <div className="ap-form ap-form--2">
          <Field label="Twilio Account SID" hint={hasTwilio ? 'Puste = zapisane dane.' : undefined}><input className="input ap-mono" placeholder="AC…" value={f.sid} onChange={e => setF({ ...f, sid: e.target.value })} /></Field>
          <Field label="Auth Token"><input className="input ap-mono" type="password" value={f.token} onChange={e => setF({ ...f, token: e.target.value })} /></Field>
        </div>
        {f.sid && <Toggle checked={f.remember} onChange={v => setF({ ...f, remember: v })} label="Zapamiętaj dane Twilio" hint="Potrzebne do automatycznego przeniesienia numerów przy zmianie konta ElevenLabs." />}
      </div>
    </Modal>
  )
}

function VoiceLibrary({ open, have, onClose, onAdded }: { open: boolean; have: string[]; onClose: () => void; onAdded: () => void }) {
  const toast = useToast()
  const [q, setQ] = useState({ search: '', gender: '', language: 'pl' })
  const [list, setList] = useState<V[] | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const search = useCallback(async () => { setList(null); setList((await call<{ voices: V[] }>('voices_library', q).catch(e => { toast(errText(e), 'err'); return { voices: [] } })).voices) }, [q, toast])
  useEffect(() => { if (open) void search() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} wide="xl" title="Dodaj głosy" sub="Biblioteka ElevenLabs (głosy społeczności) i głosy z konta. Wybieraj naturalne, konwersacyjne głosy — odsłuchaj przed dodaniem.">
      <div className="ap-row">
        <label className="ap-search"><Ic.search width={16} height={16} /><input className="input" placeholder="Szukaj (np. calm, young, conversational)" value={q.search} onChange={e => setQ({ ...q, search: e.target.value })} onKeyDown={e => e.key === 'Enter' && search()} /></label>
        <select className="input ap-select" value={q.gender} onChange={e => setQ({ ...q, gender: e.target.value })}><option value="">Każdy</option><option value="female">Kobiece</option><option value="male">Męskie</option></select>
        <select className="input ap-select" value={q.language} onChange={e => setQ({ ...q, language: e.target.value })}><option value="pl">Polski</option><option value="uk">Ukraiński</option><option value="en">Angielski</option></select>
        <button className="btn btn--ghost btn--sm" onClick={search}>Szukaj</button>
      </div>
      {!list ? <Loading /> : !list.length ? <Empty title="Brak wyników" /> : (
        <div className="rc-list">{list.map(v => (
          <div key={v.voice_id + (v.source ?? '')} className="rc-li">
            <PlayBtn url={v.preview_url} />
            <div><b>{v.name} <Badge>{v.source === 'library' ? 'biblioteka' : 'konto'}</Badge></b><small>{[v.gender, v.accent, v.use_case, v.description].filter(Boolean).join(' · ')}</small></div>
            {have.includes(v.voice_id) ? <Badge tone="ok">Dodany</Badge> : <button className="btn btn--ghost btn--xs" disabled={!!adding} onClick={async () => { setAdding(v.voice_id); try { await call('voice_add', { voice: v }); onAdded(); toast(`Dodano: ${v.name}`) } catch (e) { toast(errText(e), 'err') } setAdding(null) }}>{adding === v.voice_id ? <Spinner size={12} /> : <><Ic.plus width={12} height={12} /> Dodaj</>}</button>}
          </div>
        ))}</div>
      )}
    </Modal>
  )
}
