import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { errText, get, insert, remove, update, upsert } from '../../app/api'
import { Badge, Empty, Field, Ic, Loading, Modal, PageHead, Panel, Segmented, Spinner, Tabs, Toggle, fmtAgo, useConfirm, useToast } from '../../app/ui'
import { usePanel } from '../PanelApp'
import { TestCall } from './TestCall'
import { DEFAULT_SETTINGS, reception, loadSetup, minutesText, prettyPhone, status as fetchStatus, syncAgent, type Knowledge, type Settings, type Setup, type Status, type Voice } from './model'
import './reception.css'

type View = 'polaczenie' | 'glos' | 'wiedza' | 'zasady'

/** Save settings, then push them to the assistant (ElevenLabs) in the background. */
function useAgentSync() {
  const { company } = usePanel()
  const toast = useToast()
  const [st, setSt] = useState<Status | null>(null)
  const [syncing, setSyncing] = useState(false)
  const refresh = useCallback(async () => setSt(await fetchStatus(company.id).catch(() => null)), [company.id])
  useEffect(() => { void refresh() }, [refresh])
  const sync = useCallback(async (quiet = false) => {
    setSyncing(true)
    try { const r = await syncAgent(company.id); if (!quiet) toast('Asystent zaktualizowany'); r.warnings?.forEach(w => toast(w, 'info')) }
    catch (e) { if (!quiet || !/nie jest skonfigurowane/.test(errText(e))) toast(`Asystent: ${errText(e)}`, 'err') }
    setSyncing(false); await refresh()
  }, [company.id, toast, refresh])
  return { st, syncing, sync, refresh }
}

export function AssistantPage() {
  const { company, canManage, href } = usePanel()
  const loc = useLocation(), nav = useNavigate()
  const view = (new URLSearchParams(loc.search).get('v') as View) || 'polaczenie'
  const [s, setS] = useState<Setup | null>(null)
  const agent = useAgentSync()
  const load = useCallback(async () => setS(await loadSetup(company.id)), [company.id])
  useEffect(() => { void load() }, [load])
  const saveSettings = async (patch: Partial<Settings>) => {
    await upsert('rc_settings', { ...(s?.hasSettings ? {} : { ...DEFAULT_SETTINGS }), ...patch, company_id: company.id }, 'company_id')
    await load()
    if (agent.st?.platform_ok) void agent.sync(true)
  }
  if (!s) return <Loading />
  const st = agent.st
  const chip = !st ? undefined : !st.platform_ok ? 'Konfiguracja' : st.test_mode ? 'Tryb testowy' : 'Aktywny'
  return (
    <>
      <PageHead title="Asystent AI" chip={chip} sub={`${s.settings.assistant_name} odbiera telefony, zna Twoją ofertę i kalendarz, zapisuje klientów i pamięta ich przy kolejnym telefonie.`}
        actions={canManage && st?.platform_ok && <button className="btn btn--ghost btn--sm" onClick={() => agent.sync()} disabled={agent.syncing}>{agent.syncing ? <Spinner size={14} /> : <Ic.refresh width={14} height={14} />} {st.stale ? 'Wgraj zmiany' : 'Zaktualizuj'}</button>} />
      {st && !st.platform_ok && <div className="ap-note ap-note--warn" style={{ marginBottom: 20 }}><Ic.bell width={18} height={18} /><span><b>Asystent jest w trakcie uruchamiania.</b> Możesz już ustawić głos, ofertę i zasady — zespół TableFlow podłącza silnik głosowy. Rozmowa testowa zadziała, gdy tylko to zrobimy.</span></div>}
      {st?.platform_ok && st.stale && st.agent?.agent_id && <div className="ap-note" style={{ marginBottom: 20, alignItems: 'center' }}><Ic.sparkle width={18} height={18} /><span>Są zmiany w ofercie lub ustawieniach, których asystent jeszcze nie zna.</span>{canManage && <button className="btn btn--primary btn--sm" onClick={() => agent.sync()} disabled={agent.syncing}>{agent.syncing ? 'Wgrywam…' : 'Wgraj teraz'}</button>}</div>}
      {st?.agent?.sync_error && <div className="ap-note ap-note--warn" style={{ marginBottom: 20 }}><Ic.bell width={18} height={18} /><span><b>Ostatnia aktualizacja nie powiodła się:</b> {st.agent.sync_error}</span></div>}
      <Tabs value={view} onChange={v => nav(href('asystent', { v }))} tabs={[
        { v: 'polaczenie', label: 'Połączenie i test' }, { v: 'glos', label: 'Głos i styl' }, { v: 'wiedza', label: 'Wiedza' }, { v: 'zasady', label: 'Zasady rezerwacji' },
      ]} />
      {view === 'polaczenie' && <Connection s={s} st={st} onTested={() => void agent.refresh()} />}
      {view === 'glos' && <VoiceTab s={s} save={saveSettings} />}
      {view === 'wiedza' && <KnowledgeTab s={s} save={saveSettings} afterChange={() => { if (st?.platform_ok) void agent.sync(true) }} />}
      {view === 'zasady' && <RulesTab s={s} save={saveSettings} />}
    </>
  )
}

// ---------------------------------------------------------------- connection
function Connection({ s, st, onTested }: { s: Setup; st: Status | null; onTested: () => void }) {
  const { href, company } = usePanel()
  const nav = useNavigate()
  const [last, setLast] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const openLast = async () => {
    if (!last) return
    setOpening(true)
    await reception('calls_pull', { company_id: company.id, conversation_id: last }).catch(() => {})
    const [row] = await get<{ id: string }[]>(`rc_calls?conversation_id=eq.${last}&select=id`).catch(() => [])
    setOpening(false)
    nav(href('rozmowy', row ? { f: 'test', c: row.id } : { f: 'test' }))
  }
  const live = st?.numbers.filter(n => n.el_phone_id) ?? []
  const ready = { hours: s.hours.some(h => !h.resource_id), services: s.services.some(x => x.active), resources: s.resources.some(r => r.active) }
  return (
    <div className="ap-stack">
      {(!ready.hours || !ready.services || !ready.resources) && (
        <div className="ap-note ap-note--warn"><Ic.calendar width={18} height={18} /><span>Asystent nie zapisze nikogo, dopóki nie uzupełnisz: {[!ready.hours && 'godzin otwarcia', !ready.resources && 'zespołu lub zasobów', !ready.services && 'usług'].filter(Boolean).join(', ')}.</span><Link className="btn btn--primary btn--sm" to={href('uslugi')}>Uzupełnij</Link></div>
      )}
      {last && <div className="ap-note" style={{ alignItems: 'center' }}><Ic.check width={18} height={18} /><span>Rozmowa zapisana — streszczenie, transkrypcja i nagranie są w zakładce Rozmowy (analiza trwa kilka sekund).</span><button className="btn btn--primary btn--sm" onClick={openLast} disabled={opening}>{opening ? 'Otwieram…' : 'Zobacz'}</button></div>}
      {st?.platform_ok ? <TestCall onEnded={(id) => { onTested(); if (id) setLast(id) }} /> : (
        <Panel><Empty icon={<Ic.mic width={22} height={22} />} title="Rozmowa testowa — wkrótce" text="Gdy zespół TableFlow podłączy silnik głosowy, tutaj porozmawiasz z asystentem przez mikrofon, zanim dostaniesz numer telefonu." /></Panel>
      )}
      <div className="ap-grid ap-grid--2">
        <Panel title="Numer telefonu" sub={live.length ? 'Klienci dzwonią na ten numer — odbiera asystent.' : 'Numer przydziela zespół TableFlow.'}>
          {live.length ? (
            <div className="rc-list">{live.map(n => <div key={n.phone_number} className="rc-li"><span className="rc-ico is-ok"><Ic.phone width={16} height={16} /></span><div><b className="ap-mono" style={{ fontSize: 15 }}>{prettyPhone(n.phone_number)}</b><small>{n.label || 'Recepcja AI'}{n.last_error ? ` · ${n.last_error}` : ''}</small></div><Badge tone={n.last_error ? 'warn' : 'ok'}>{n.last_error ? 'Sprawdź' : 'Aktywny'}</Badge></div>)}</div>
          ) : (
            <div className="ap-stack" style={{ gap: 10 }}>
              <div className="rc-li"><span className="rc-ico is-warn"><Ic.phone width={16} height={16} /></span><div><b>Tryb testowy</b><small>Nie masz jeszcze numeru. Rozmawiaj z asystentem powyżej — działa dokładnie tak jak przez telefon.</small></div></div>
              <p className="ap-muted">Po podłączeniu numeru możesz przekierować na niego swój obecny numer (przekierowanie u operatora, gdy nie odbierasz albo zawsze).</p>
              <a className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} href="mailto:hello@tableflow.pl?subject=Numer%20dla%20recepcji%20AI">Poproś o numer</a>
            </div>
          )}
        </Panel>
        <Panel title="Stan asystenta">
          <dl className="ap-kv">
            <dt>Imię</dt><dd>{s.settings.assistant_name}</dd>
            <dt>Głos</dt><dd>{s.settings.voice_name || 'domyślny'}</dd>
            <dt>Oferta</dt><dd>{s.services.filter(x => x.active).length} usług · {s.resources.filter(r => r.active).length} os./zasobów</dd>
            <dt>Aktualizacja</dt><dd>{st?.agent?.synced_at ? `${fmtAgo(st.agent.synced_at)}${st.stale ? ' · są nowe zmiany' : ''}` : 'jeszcze nie'}</dd>
            <dt>Ostatni test</dt><dd>{fmtAgo(st?.agent?.last_test_at)}</dd>
          </dl>
        </Panel>
      </div>
      <Panel title="Jak to działa">
        <ol className="rc-how">
          <li><span className="g">1</span><b>Klient dzwoni</b>Asystent rozpoznaje numer: wita stałych klientów po imieniu i zna ich historię wizyt.</li>
          <li><span className="g">2</span><b>Sprawdza kalendarz na żywo</b>Wolne terminy liczy z grafiku, urlopów i rezerwacji — nigdy nie zgaduje.</li>
          <li><span className="g">3</span><b>Zapisuje wizytę</b>Rezerwacja od razu jest w Kalendarzu, a klient w bazie Klienci.</li>
          <li><span className="g">4</span><b>Pamięta i dba o lojalność</b>Zapamiętuje preferencje, proponuje kartę lojalnościową, a sprawy nie do załatwienia zostawia Ci do oddzwonienia.</li>
        </ol>
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- voice & style
function VoiceTab({ s, save }: { s: Setup; save: (p: Partial<Settings>) => Promise<void> }) {
  const { company, canManage } = usePanel()
  const toast = useToast()
  const [voices, setVoices] = useState<Voice[] | null>(null)
  const [f, setF] = useState(s.settings)
  const [playing, setPlaying] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => { void get<Voice[]>('rc_voices?enabled=eq.true&select=*&order=sort.asc,name.asc').then(setVoices).catch(() => setVoices([])) }, [])
  useEffect(() => setF(s.settings), [s.settings])
  useEffect(() => () => audio.current?.pause(), [])
  const play = (v: Voice) => {
    audio.current?.pause()
    if (playing === v.voice_id || !v.preview_url) { setPlaying(null); return }
    const a = new Audio(v.preview_url); audio.current = a; setPlaying(v.voice_id)
    a.onended = () => setPlaying(null); void a.play().catch(() => setPlaying(null))
  }
  const greeting = f.greeting ?? ''
  const disclosed = !greeting || /wirtualn|\bAI\b|asystent|sztuczn/i.test(greeting)
  const fields: (keyof Settings)[] = ['assistant_name', 'voice_id', 'voice_speed', 'voice_stability', 'voice_quality', 'tone', 'greeting', 'extra_languages']
  const dirty = fields.some(k => JSON.stringify(f[k]) !== JSON.stringify(s.settings[k]))
  const submit = async () => {
    setBusy(true)
    try { await save({ assistant_name: f.assistant_name.trim() || 'Ania', voice_id: f.voice_id, voice_name: voices?.find(v => v.voice_id === f.voice_id)?.name ?? f.voice_name, voice_speed: f.voice_speed, voice_stability: f.voice_stability, voice_quality: f.voice_quality, tone: f.tone, greeting: greeting.trim() || null, extra_languages: f.extra_languages }); toast('Zapisano — wgrywam do asystenta') }
    catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const langs: [string, string][] = [['en', 'Angielski'], ['uk', 'Ukraiński'], ['ru', 'Rosyjski'], ['de', 'Niemiecki'], ['es', 'Hiszpański'], ['fr', 'Francuski']]
  return (
    <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="ap-stack">
        <Panel title="Głos" sub="Posłuchaj próbek i wybierz głos, który pasuje do Twojej firmy." actions={canManage && <button className="btn btn--primary btn--sm" onClick={submit} disabled={!dirty || busy}>{busy ? 'Zapisuję…' : 'Zapisz'}</button>}>
          {!voices ? <Loading /> : !voices.length ? <p className="ap-muted">Zespół TableFlow przygotowuje listę polskich głosów — do tego czasu asystent używa głosu domyślnego.</p> : (
            <div className="rc-voices">{voices.map(v => (
              <div key={v.voice_id} role="button" tabIndex={0} className={`rc-voice ${f.voice_id === v.voice_id ? 'is-on' : ''}`} onClick={() => canManage && setF({ ...f, voice_id: v.voice_id, voice_name: v.name })} onKeyDown={e => e.key === 'Enter' && canManage && setF({ ...f, voice_id: v.voice_id })}>
                <button type="button" className={`rc-play ${playing === v.voice_id ? 'is-on' : ''}`} onClick={e => { e.stopPropagation(); play(v) }} aria-label={`Posłuchaj: ${v.name}`}>{playing === v.voice_id ? '❚❚' : '▶'}</button>
                <div><b>{v.name}</b><small>{[v.gender === 'female' ? 'kobiecy' : v.gender === 'male' ? 'męski' : v.gender, v.accent, v.description].filter(Boolean).join(' · ')}</small></div>
                {f.voice_id === v.voice_id && <Ic.check className="rc-voice__check" width={16} height={16} />}
              </div>
            ))}</div>
          )}
          <div className="ap-divider" style={{ margin: '18px 0' }} />
          <div className="ap-form ap-form--2">
            <Field label="Jakość głosu" hint={f.voice_quality === 'natural' ? 'Najbardziej ludzki: intonacja, emocje, pauzy. Minimalnie wolniejsza reakcja.' : 'Najszybsze odpowiedzi, trochę mniej ekspresji.'}>
              <Segmented value={f.voice_quality} onChange={v => setF({ ...f, voice_quality: v })} options={[{ v: 'natural', label: 'Naturalna' }, { v: 'fast', label: 'Szybka' }]} />
            </Field>
            <Field label="Tempo mowy"><div className="rc-range"><input type="range" min={0.8} max={1.15} step={0.01} value={f.voice_speed} onChange={e => setF({ ...f, voice_speed: Number(e.target.value) })} /><output>{Math.round(f.voice_speed * 100)}%</output></div></Field>
            <Field label="Ekspresja" hint="Mniej = spokojniej i równo, więcej = żywiej i bardziej emocjonalnie."><div className="rc-range"><input type="range" min={0} max={1} step={0.05} value={1 - f.voice_stability} onChange={e => setF({ ...f, voice_stability: Math.round((1 - Number(e.target.value)) * 100) / 100 })} /><output>{Math.round((1 - f.voice_stability) * 100)}%</output></div></Field>
          </div>
        </Panel>
        <Panel title="Osobowość">
          <div className="ap-form ap-form--2">
            <Field label="Imię asystentki / asystenta" hint="Tak przedstawi się przez telefon."><input className="input" value={f.assistant_name} onChange={e => setF({ ...f, assistant_name: e.target.value })} maxLength={40} /></Field>
            <Field label="Styl rozmowy"><select className="input" value={f.tone} onChange={e => setF({ ...f, tone: e.target.value as Settings['tone'] })}><option value="warm">Ciepły i serdeczny (Pan/Pani)</option><option value="professional">Profesjonalny i elegancki</option><option value="casual">Luźny, na „ty”</option></select></Field>
            <Field label="Powitanie" className="span-2" hint="Pierwsze zdanie po odebraniu. Zostaw puste, aby użyć domyślnego.">
              <textarea className="input" rows={2} value={greeting} onChange={e => setF({ ...f, greeting: e.target.value })} placeholder={`Dzień dobry, ${company.name}, mówi ${f.assistant_name || 'Ania'}, wirtualna asystentka. W czym mogę pomóc?`} />
            </Field>
          </div>
          {!disclosed && <div className="ap-note ap-note--warn" style={{ marginTop: 12 }}><Ic.shield width={18} height={18} /><span>Zgodnie z unijnym AI Act klient powinien wiedzieć, że rozmawia z asystentem AI. Dodaj w powitaniu np. „wirtualna asystentka”.</span></div>}
          <div className="ap-field" style={{ marginTop: 16 }}><span>Języki (oprócz polskiego)</span>
            <div className="rc-checks">{langs.map(([k, l]) => <label key={k} className={`rc-check ${f.extra_languages.includes(k) ? 'is-on' : ''}`}><input type="checkbox" checked={f.extra_languages.includes(k)} onChange={e => setF({ ...f, extra_languages: e.target.checked ? [...f.extra_languages, k] : f.extra_languages.filter(x => x !== k) })} />{l}</label>)}</div>
            <small>Asystent sam przełączy język, gdy klient zacznie mówić inaczej.</small>
          </div>
        </Panel>
      </div>
    </fieldset>
  )
}

// ---------------------------------------------------------------- knowledge
function KnowledgeTab({ s, save, afterChange }: { s: Setup; save: (p: Partial<Settings>) => Promise<void>; afterChange: () => void }) {
  const { company, canManage, href } = usePanel()
  const toast = useToast(), confirm = useConfirm()
  const [list, setList] = useState<Knowledge[] | null>(null)
  const [edit, setEdit] = useState<Partial<Knowledge> | null>(null)
  const [desc, setDesc] = useState(s.settings.business_description ?? '')
  const load = useCallback(async () => setList(await get<Knowledge[]>(`rc_knowledge?company_id=eq.${company.id}&select=*&order=sort.asc,created_at.asc`).catch(() => [])), [company.id])
  useEffect(() => { void load() }, [load])
  const saveItem = async () => {
    if (!edit) return
    try {
      const row = { company_id: company.id, kind: edit.kind ?? 'faq', question: edit.question!.trim(), answer: edit.answer!.trim(), active: edit.active ?? true }
      if (edit.id) await update('rc_knowledge', `id=eq.${edit.id}`, row); else await insert('rc_knowledge', { ...row, sort: list?.length ?? 0 })
      setEdit(null); await load(); afterChange(); toast('Zapisano')
    } catch (e) { toast(errText(e), 'err') }
  }
  const SUGGEST = ['Czy jest parking?', 'Jak do was dojechać?', 'Czy można płacić kartą / BLIKiem?', 'Czy macie bony podarunkowe?', 'Czy można przyjść z dzieckiem / psem?', 'Jak się przygotować do wizyty?']
  return (
    <div className="ap-grid ap-grid--main">
      <div className="ap-stack">
        <Panel title="O firmie" sub="Kilka zdań, które asystent powie, gdy ktoś zapyta „czym się zajmujecie?”. Klimat, specjalność, co Was wyróżnia." actions={canManage && <button className="btn btn--primary btn--sm" disabled={desc === (s.settings.business_description ?? '')} onClick={() => save({ business_description: desc.trim() || null }).then(() => toast('Zapisano')).catch(e => toast(errText(e), 'err'))}>Zapisz</button>}>
          <textarea className="input" rows={4} style={{ width: '100%', height: 'auto', padding: 12, lineHeight: 1.5 }} value={desc} disabled={!canManage} onChange={e => setDesc(e.target.value)} placeholder="np. Barbershop w centrum Mokotowa, od 2015 roku. Specjalizujemy się w klasycznych cięciach i goleniu brzytwą. Kawa dla każdego klienta gratis." />
        </Panel>
        <Panel title="Pytania i odpowiedzi" sub="Wszystko, o co klienci pytają przez telefon. Asystent odpowie dokładnie tak, jak tu napiszesz." actions={canManage && <button className="btn btn--ghost btn--sm" onClick={() => setEdit({ kind: 'faq', question: '', answer: '', active: true })}><Ic.plus width={14} height={14} /> Dodaj</button>}>
          {!list ? <Loading /> : !list.length ? <Empty title="Brak pytań" text="Dodaj odpowiedzi na typowe pytania — np. o parking, płatności czy dojazd." /> : (
            <div className="rc-list">{list.map(k => (
              <button key={k.id} className="rc-li" onClick={() => canManage && setEdit(k)} style={{ opacity: k.active ? 1 : .5 }}>
                <span className="rc-ico is-brand"><Ic.msg width={16} height={16} /></span>
                <div><b>{k.question}</b><small>{k.answer}</small></div>
                {k.kind !== 'faq' && <Badge>{k.kind === 'policy' ? 'zasada' : 'informacja'}</Badge>}
              </button>
            ))}</div>
          )}
          {canManage && <div className="ap-chips" style={{ marginTop: 14 }}>{SUGGEST.filter(q => !list?.some(k => k.question === q)).map(q => <button key={q} className="btn btn--ghost btn--xs" onClick={() => setEdit({ kind: 'faq', question: q, answer: '', active: true })}>+ {q}</button>)}</div>}
        </Panel>
      </div>
      <Panel title="Co jeszcze wie asystent" sub="Te informacje zbiera sam — z reszty panelu.">
        <ul className="ap-check-list">
          <li className="ap-row ap-row--between"><span>Dane firmy, adres, telefon</span><Link to={href('ustawienia')}>Ustawienia</Link></li>
          <li className="ap-row ap-row--between"><span>{s.services.filter(x => x.active).length} usług z cenami i czasem</span><Link to={href('uslugi')}>Usługi</Link></li>
          <li className="ap-row ap-row--between"><span>{s.resources.filter(r => r.active).length} osób / zasobów z grafikami</span><Link to={href('uslugi', { v: 'zasoby' })}>Zespół</Link></li>
          <li className="ap-row ap-row--between"><span>Godziny otwarcia i dni wolne</span><Link to={href('uslugi', { v: 'godziny' })}>Godziny</Link></li>
          <li className="ap-row ap-row--between"><span>Program lojalnościowy</span><Link to={href('lojalnosc')}>Lojalność</Link></li>
          <li className="ap-row ap-row--between"><span>Wolne terminy — na żywo z kalendarza</span><Badge tone="ok">zawsze aktualne</Badge></li>
          <li className="ap-row ap-row--between"><span>Historia i notatki każdego klienta</span><Link to={href('klienci')}>Klienci</Link></li>
        </ul>
      </Panel>
      <Modal open={!!edit} onClose={() => setEdit(null)} wide title={edit?.id ? 'Edytuj odpowiedź' : 'Nowa odpowiedź'}
        footer={<>{edit?.id && <button className="btn btn--ghost btn--sm" style={{ color: '#b1321f', marginRight: 'auto' }} onClick={async () => { if (edit?.id && await confirm({ title: 'Usunąć?', ok: 'Usuń', danger: true })) { await remove('rc_knowledge', `id=eq.${edit.id}`); setEdit(null); await load(); afterChange() } }}><Ic.trash width={14} height={14} /></button>}<button className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>Anuluj</button><button className="btn btn--primary btn--sm" disabled={!edit?.question?.trim() || !edit?.answer?.trim()} onClick={saveItem}>Zapisz</button></>}>
        {edit && <div className="ap-form">
          <Field label="Rodzaj"><Segmented value={edit.kind ?? 'faq'} onChange={v => setEdit({ ...edit, kind: v })} options={[{ v: 'faq', label: 'Pytanie klienta' }, { v: 'info', label: 'Informacja' }, { v: 'policy', label: 'Zasada' }]} /></Field>
          <Field label={edit.kind === 'faq' ? 'Pytanie' : 'Temat'}><input className="input" value={edit.question ?? ''} onChange={e => setEdit({ ...edit, question: e.target.value })} autoFocus /></Field>
          <Field label="Odpowiedź" hint="Pisz tak, jak mówiłbyś przez telefon."><textarea className="input" rows={4} value={edit.answer ?? ''} onChange={e => setEdit({ ...edit, answer: e.target.value })} /></Field>
          <Toggle checked={edit.active ?? true} onChange={v => setEdit({ ...edit, active: v })} label="Aktywna" />
        </div>}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------- rules
function RulesTab({ s, save }: { s: Setup; save: (p: Partial<Settings>) => Promise<void> }) {
  const { company, canManage, href } = usePanel()
  const toast = useToast()
  const [f, setF] = useState(s.settings)
  const [busy, setBusy] = useState(false)
  const [loyalty, setLoyalty] = useState<{ name: string; status: string; published_at: string | null } | null | undefined>(undefined)
  useEffect(() => setF(s.settings), [s.settings])
  useEffect(() => { void get<{ name: string; status: string; published_at: string | null }[]>(`loyalty_programs?company_id=eq.${company.id}&status=eq.active&select=name,status,published_at&limit=1`).then(r => setLoyalty(r[0] ?? null)).catch(() => setLoyalty(null)) }, [company.id])
  const keys: (keyof Settings)[] = ['min_notice_min', 'max_days_ahead', 'slot_step_min', 'ai_booking_status', 'allow_cancel', 'cancel_notice_min', 'allow_reschedule', 'offer_loyalty', 'transfer_phone', 'after_hours_message', 'instructions']
  const dirty = keys.some(k => JSON.stringify(f[k]) !== JSON.stringify(s.settings[k]))
  const submit = async () => {
    setBusy(true)
    try { await save(Object.fromEntries(keys.map(k => [k, typeof f[k] === 'string' ? ((f[k] as string).trim() || null) : f[k]])) as Partial<Settings>); toast('Zapisano — wgrywam do asystenta') } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const notice = [0, 15, 30, 60, 120, 180, 240, 720, 1440, 2880]
  return (
    <fieldset disabled={!canManage} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="ap-grid ap-grid--2">
        <Panel title="Terminy" actions={canManage && <button className="btn btn--primary btn--sm" onClick={submit} disabled={!dirty || busy}>{busy ? 'Zapisuję…' : 'Zapisz'}</button>}>
          <div className="ap-form">
            <Field label="Najwcześniej" hint="Ile czasu przed wizytą najpóźniej można się zapisać."><select className="input" value={f.min_notice_min} onChange={e => setF({ ...f, min_notice_min: Number(e.target.value) })}>{notice.map(m => <option key={m} value={m}>{m === 0 ? 'od ręki' : m < 1440 ? `${minutesText(m)} wcześniej` : `${m / 1440} ${m === 1440 ? 'dzień' : 'dni'} wcześniej`}</option>)}</select></Field>
            <Field label="Najdalej" hint="Na ile dni do przodu przyjmujemy rezerwacje."><select className="input" value={f.max_days_ahead} onChange={e => setF({ ...f, max_days_ahead: Number(e.target.value) })}>{[7, 14, 30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} dni</option>)}</select></Field>
            <Field label="Siatka godzin" hint="Co ile minut mogą zaczynać się wizyty."><select className="input" value={f.slot_step_min} onChange={e => setF({ ...f, slot_step_min: Number(e.target.value) })}>{[5, 10, 15, 20, 30, 60].map(m => <option key={m} value={m}>co {m} min</option>)}</select></Field>
            <Field label="Rezerwacje z telefonu"><Segmented value={f.ai_booking_status} onChange={v => setF({ ...f, ai_booking_status: v })} options={[{ v: 'confirmed', label: 'Od razu potwierdzone' }, { v: 'pending', label: 'Do potwierdzenia' }]} /></Field>
          </div>
        </Panel>
        <Panel title="Zmiany i odwołania">
          <div className="ap-form">
            <Toggle checked={f.allow_cancel} onChange={v => setF({ ...f, allow_cancel: v })} label="Asystent może odwoływać wizyty" hint="Tylko z numeru, na który jest rezerwacja." />
            {f.allow_cancel && <Field label="Najpóźniej"><select className="input" value={f.cancel_notice_min} onChange={e => setF({ ...f, cancel_notice_min: Number(e.target.value) })}>{[0, 60, 120, 180, 360, 720, 1440, 2880].map(m => <option key={m} value={m}>{m === 0 ? 'w każdej chwili' : m < 1440 ? `${minutesText(m)} przed` : `${m / 1440} ${m === 1440 ? 'dzień' : 'dni'} przed`}</option>)}</select></Field>}
            <Toggle checked={f.allow_reschedule} onChange={v => setF({ ...f, allow_reschedule: v })} label="Asystent może przekładać wizyty" />
            <Field label="Przełącz do człowieka" hint="Numer, na który asystent przełączy rozmowę, gdy klient poprosi o człowieka. Puste = asystent zostawi prośbę o oddzwonienie."><input className="input" inputMode="tel" value={f.transfer_phone ?? ''} onChange={e => setF({ ...f, transfer_phone: e.target.value })} placeholder="+48 600 000 000" /></Field>
          </div>
        </Panel>
        <Panel title="Lojalność">
          <Toggle checked={f.offer_loyalty} onChange={v => setF({ ...f, offer_loyalty: v })} label="Proponuj kartę lojalnościową" hint="Po rezerwacji asystent krótko wspomni o karcie i powie, że założy ją pracownik przy wizycie. Stałym klientom przypomni o pieczątkach i nagrodzie." />
          <p className="ap-muted" style={{ marginTop: 12 }}>{loyalty === undefined ? '…' : loyalty?.published_at ? <>Aktywna karta: <b>{loyalty.name}</b> ✓</> : <>Nie masz opublikowanej karty — <Link to={href('lojalnosc')}>zaprojektuj ją</Link>, a asystent zacznie ją proponować.</>}</p>
        </Panel>
        <Panel title="Dodatkowe wskazówki" sub="Rzeczy specyficzne dla Twojej firmy.">
          <div className="ap-form">
            <Field label="Instrukcje dla asystenta"><textarea className="input" rows={4} value={f.instructions ?? ''} onChange={e => setF({ ...f, instructions: e.target.value })} placeholder={'np. Przy koloryzacji zawsze zapytaj o długość włosów.\nNowym klientom poleć Kasię.\nW soboty nie umawiamy dzieci.'} /></Field>
            <Field label="Poza godzinami otwarcia" hint="Co asystent ma dodać, gdy ktoś dzwoni, kiedy jest zamknięte."><input className="input" value={f.after_hours_message ?? ''} onChange={e => setF({ ...f, after_hours_message: e.target.value })} placeholder="np. Przyjmij rezerwację normalnie, a pilne sprawy zapisz do oddzwonienia rano." /></Field>
          </div>
        </Panel>
      </div>
    </fieldset>
  )
}
