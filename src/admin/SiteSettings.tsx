import { useEffect, useState } from 'react'
import { errText, fn, get, rpc, upsert } from '../app/api'
import { Badge, Field, Ic, Loading, PageHead, Panel, Segmented, Toggle, fmtAgo, useConfirm, useToast } from '../app/ui'
import { LOCALE_NAMES, type Locale } from '../i18n/types'

export interface Announcement { enabled: boolean; text: Partial<Record<Locale, string>>; link: string; style: 'brand' | 'dark' }
interface AnalyticsCfg { enabled: boolean; retention_days: number }
const TARGETS: Locale[] = ['en', 'ru', 'fr', 'es']

export function SiteSettings() {
  const toast = useToast(), confirm = useConfirm()
  const [ann, setAnn] = useState<Announcement | null>(null)
  const [an, setAn] = useState<AnalyticsCfg | null>(null)
  const [content, setContent] = useState<{ locale: string; status: string; updated_at: string }[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    void get<{ key: string; value: unknown }[]>('site_settings?select=key,value').then(rows => {
      setAnn({ enabled: false, text: {}, link: '', style: 'brand', ...(rows.find(r => r.key === 'announcement')?.value as object) })
      setAn({ enabled: true, retention_days: 395, ...(rows.find(r => r.key === 'analytics')?.value as object) })
    })
    void get<{ locale: string; status: string; updated_at: string }[]>('site_content?select=locale,status,updated_at&order=updated_at.desc').then(setContent).catch(() => {})
  }, [])

  const saveAnn = async () => {
    if (!ann) return
    setBusy('ann')
    try {
      const pl = (ann.text.pl ?? '').trim()
      const text: Announcement['text'] = { pl }
      if (pl) {
        await Promise.all(TARGETS.map(async l => {
          try { const r = await fn<{ translations: Record<string, string> }>('translate', { target: l, items: [{ path: 'announcement', text: pl }] }); text[l] = r.translations.announcement || pl } catch { text[l] = pl }
        }))
      }
      const value = { ...ann, text }
      await upsert('site_settings', { key: 'announcement', value, public: true, updated_at: new Date().toISOString() }, 'key')
      setAnn(value); toast(ann.enabled ? 'Pasek opublikowany (przetłumaczony na 4 języki)' : 'Zapisano')
    } catch (e) { toast(errText(e), 'err') }
    setBusy(null)
  }
  const saveAn = async (v: AnalyticsCfg) => {
    setAn(v)
    try { await upsert('site_settings', { key: 'analytics', value: v, public: false, updated_at: new Date().toISOString() }, 'key'); toast('Zapisano') } catch (e) { toast(errText(e), 'err') }
  }
  const purge = async () => {
    if (!an || !await confirm({ title: 'Usunąć stare dane analityki?', text: `Usuniemy wizyty starsze niż ${an.retention_days} dni.`, ok: 'Usuń', danger: true })) return
    try { const n = await rpc<number>('admin_purge_visits', { p_days: an.retention_days }); toast(`Usunięto ${n} wizyt`) } catch (e) { toast(errText(e), 'err') }
  }
  const pub = (l: string) => content.find(c => c.locale === l && c.status === 'published')

  if (!ann || !an) return <Loading />
  return (
    <>
      <PageHead title="Strona" sub="Treści, komunikaty i ustawienia strony tableflow.pl." />
      <div className="ap-grid ap-grid--2">
        <Panel title="Edytor treści" sub="Edycja tekstów bezpośrednio na stronie — po polsku, pozostałe języki tłumaczy AI przy publikacji.">
          <ul className="ad-locales">{(Object.keys(LOCALE_NAMES) as Locale[]).map(l => <li key={l}><span>{LOCALE_NAMES[l]}</span>{pub(l) ? <small>opublikowano {fmtAgo(pub(l)!.updated_at)}</small> : <small>treść domyślna</small>}</li>)}</ul>
          {content.some(c => c.status === 'draft' && c.locale === 'pl' && (!pub('pl') || c.updated_at > pub('pl')!.updated_at)) && <div className="ap-note ap-note--warn" style={{ marginTop: 12 }}><Ic.edit width={16} height={16} /><span>Jest niepublikowana wersja robocza.</span></div>}
          <div className="ap-row" style={{ marginTop: 16 }}><a className="btn btn--primary btn--sm" href="/edit-mod"><Ic.edit width={15} height={15} /> Otwórz edytor</a><a className="btn btn--ghost btn--sm" href="/" target="_blank" rel="noreferrer"><Ic.external width={14} height={14} /> Zobacz stronę</a></div>
        </Panel>

        <Panel title="Pasek ogłoszeń" sub="Krótki komunikat nad menu na całej stronie — np. premiera, promocja, wydarzenie." actions={ann.enabled ? <Badge tone="ok">Włączony</Badge> : <Badge>Wyłączony</Badge>}>
          <div className="ap-form">
            <Toggle checked={ann.enabled} onChange={v => setAnn({ ...ann, enabled: v })} label="Pokazuj pasek na stronie" />
            <Field label="Treść (po polsku)" hint="Przy zapisie AI przetłumaczy ją na EN, RU, FR i ES."><input className="input" maxLength={120} value={ann.text.pl ?? ''} onChange={e => setAnn({ ...ann, text: { ...ann.text, pl: e.target.value } })} placeholder="Startujemy 1 listopada — zapisz się na listę!" /></Field>
            <Field label="Link (opcjonalnie)" hint="Np. /#waitlist albo pełny adres."><input className="input" value={ann.link} onChange={e => setAnn({ ...ann, link: e.target.value })} placeholder="/#waitlist" /></Field>
            <Segmented value={ann.style} onChange={v => setAnn({ ...ann, style: v })} options={[{ v: 'brand', label: 'Gradient marki' }, { v: 'dark', label: 'Czarny' }]} size="sm" />
            {ann.text.pl && <div className={`ad-ann-preview ${ann.style === 'brand' ? 'g' : ''}`}><span>{ann.text.pl}</span>{ann.link && <b>→</b>}</div>}
            {Object.keys(ann.text).length > 1 && <details className="ap-muted"><summary>Tłumaczenia</summary><ul style={{ marginTop: 6 }}>{TARGETS.map(l => <li key={l}><b>{l.toUpperCase()}</b>: {ann.text[l]}</li>)}</ul></details>}
            <div className="ap-row ap-row--end"><button className="btn btn--primary btn--sm" disabled={busy === 'ann'} onClick={saveAnn}>{busy === 'ann' ? 'Tłumaczę i zapisuję…' : 'Zapisz pasek'}</button></div>
          </div>
        </Panel>

        <Panel title="Analityka odwiedzin" sub="Liczymy wizyty bez cookies i bez zapisywania adresu IP (dzienny, anonimowy skrót). Dlatego nie potrzeba zgody w banerze.">
          <div className="ap-form">
            <Toggle checked={an.enabled} onChange={v => void saveAn({ ...an, enabled: v })} label="Zbieraj statystyki odwiedzin" hint="Wyłączenie natychmiast zatrzymuje zapisywanie nowych wizyt." />
            <Field label="Przechowuj dane przez"><select className="input" value={an.retention_days} onChange={e => void saveAn({ ...an, retention_days: +e.target.value })}>{[[90, '3 miesiące'], [180, '6 miesięcy'], [395, '13 miesięcy'], [730, '2 lata']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <div className="ap-row ap-row--end"><button className="btn btn--ghost btn--sm" onClick={purge}><Ic.trash width={14} height={14} /> Usuń starsze dane teraz</button></div>
          </div>
        </Panel>

        <Panel title="SEO i narzędzia" sub="Szybkie linki.">
          <ul className="ad-links">
            <li><a href="/sitemap.xml" target="_blank" rel="noreferrer"><Ic.doc width={16} height={16} />sitemap.xml</a></li>
            <li><a href="/robots.txt" target="_blank" rel="noreferrer"><Ic.doc width={16} height={16} />robots.txt</a></li>
            <li><a href="/llms.txt" target="_blank" rel="noreferrer"><Ic.doc width={16} height={16} />llms.txt (dla asystentów AI)</a></li>
            <li><a href="https://search.google.com/search-console?resource_id=sc-domain:tableflow.pl" target="_blank" rel="noreferrer"><Ic.search width={16} height={16} />Google Search Console</a></li>
            <li><a href="https://supabase.com/dashboard/project/ahtjgghocwegyepxoeru" target="_blank" rel="noreferrer"><Ic.settings width={16} height={16} />Supabase — baza danych</a></li>
          </ul>
        </Panel>
      </div>
    </>
  )
}
