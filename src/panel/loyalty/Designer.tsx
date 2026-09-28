import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { errText, fn, publicUrl, update, upload } from '../../app/api'
import { ColorField, Field, Ic, Modal, Segmented, Toggle, useToast, EASE } from '../../app/ui'
import { GRADIENTS, STAMP_ICONS, STAMP_KEYS, normalizeDesign, type Design, type Info } from '../../loyalty/design'
import { buildAssets, prepareUpload } from '../../loyalty/render'
import { ApplePass, GooglePass, StampGlyph, WebCard } from '../../loyalty/CardVisual'
import { usePanel } from '../PanelApp'
import type { Program } from './types'

type Section = 'basics' | 'background' | 'colors' | 'logo' | 'stamps' | 'info'

export function Designer({ program, onSaved }: { program: Program; onSaved: (p: Program) => void }) {
  const { company, wallet } = usePanel()
  const toast = useToast()
  const [d, setD] = useState<Design>(() => normalizeDesign(program.design))
  const [basics, setBasics] = useState({ name: program.name, reward: program.reward, stamps_required: program.stamps_required })
  const [info, setInfo] = useState<Info>(program.info ?? {})
  const [open, setOpen] = useState<Section>('basics')
  const [preview, setPreview] = useState<'apple' | 'google' | 'web'>('apple')
  const [pv, setPv] = useState(Math.min(3, program.stamps_required))
  const [saving, setSaving] = useState(false)
  const [pub, setPub] = useState<null | { step: string; done: number; all: number; ok?: boolean }>(null)
  const initial = useRef(JSON.stringify([normalizeDesign(program.design), program.name, program.reward, program.stamps_required, program.info ?? {}]))
  const dirty = JSON.stringify([d, basics.name, basics.reward, basics.stamps_required, info]) !== initial.current
  const set = <K extends keyof Design>(k: K, v: Design[K]) => setD(x => ({ ...x, [k]: v }))
  useEffect(() => { setPv(v => Math.min(v, basics.stamps_required)) }, [basics.stamps_required])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const payload = () => ({ name: basics.name.trim() || 'Karta stałego klienta', reward: basics.reward.trim() || 'Nagroda', stamps_required: basics.stamps_required, design: d, info })
  const save = async () => {
    setSaving(true)
    try {
      const [p] = await update<Program>('loyalty_programs', `id=eq.${program.id}`, payload())
      initial.current = JSON.stringify([d, basics.name, basics.reward, basics.stamps_required, info]); onSaved(p); toast('Zapisano szkic projektu')
    } catch (e) { toast(errText(e), 'err') }
    setSaving(false)
  }

  /** Render every wallet image, upload a new asset version, activate the program, refresh passes. */
  const publish = async () => {
    const version = (program.assets?.version ?? 0) + 1
    const base = `c/${company.id}/p/${program.id}/v${version}`
    try {
      setPub({ step: 'Renderuję grafiki karty…', done: 0, all: 1 })
      const assets = await buildAssets(d, basics.stamps_required, company.name, (done, all) => setPub({ step: 'Renderuję grafiki karty…', done, all }))
      let n = 0
      setPub({ step: 'Wysyłam do portfeli…', done: 0, all: assets.length })
      const queue = [...assets]
      await Promise.all(Array.from({ length: 5 }, async () => {
        for (let a = queue.shift(); a; a = queue.shift()) { await upload(`${base}/${a.name}`, a.blob, 'image/png'); setPub({ step: 'Wysyłam do portfeli…', done: ++n, all: assets.length }) }
      }))
      setPub({ step: 'Publikuję kartę…', done: 1, all: 1 })
      const [p] = await update<Program>('loyalty_programs', `id=eq.${program.id}`, {
        ...payload(), status: program.status === 'archived' ? 'archived' : 'active', published_at: new Date().toISOString(),
        assets: { version, base: publicUrl(base), strips: basics.stamps_required + 1 },
      })
      initial.current = JSON.stringify([d, basics.name, basics.reward, basics.stamps_required, info]); onSaved(p)
      void fn('wallet/sync', { program_id: program.id }).catch(() => {})
      setPub({ step: 'Karta opublikowana', done: 1, all: 1, ok: true })
      setTimeout(() => setPub(null), 1800)
    } catch (e) { setPub(null); toast(errText(e), 'err') }
  }

  const card = { name: basics.name, reward: basics.reward, required: basics.stamps_required, company: company.name, stamps: pv, customer: 'Anna Kowalska' }
  const sec = (id: Section, title: string, icon: ReactNode, children: ReactNode, hint?: string) => (
    <section className={`dz-sec ${open === id ? 'is-open' : ''}`}>
      <button className="dz-sec__head" onClick={() => setOpen(open === id ? ('' as Section) : id)} aria-expanded={open === id}><span className="dz-sec__i">{icon}</span><span><b>{title}</b>{hint && <small>{hint}</small>}</span><Ic.chevron width={16} height={16} /></button>
      <AnimatePresence initial={false}>{open === id && <motion.div className="dz-sec__body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .3, ease: EASE }}><div>{children}</div></motion.div>}</AnimatePresence>
    </section>
  )

  return (
    <div className="dz">
      <div className="dz__controls">
        {sec('basics', 'Program', <Ic.card width={17} height={17} />, (
          <div className="ap-form">
            <Field label="Nazwa karty"><input className="input" maxLength={40} value={basics.name} onChange={e => setBasics({ ...basics, name: e.target.value })} /></Field>
            <Field label="Nagroda" hint="Co klient dostaje po zebraniu wszystkich pieczątek."><input className="input" maxLength={60} value={basics.reward} onChange={e => setBasics({ ...basics, reward: e.target.value })} /></Field>
            <Field label={`Liczba pieczątek: ${basics.stamps_required}`}>
              <input type="range" className="dz-range" min={3} max={20} value={basics.stamps_required} onChange={e => setBasics({ ...basics, stamps_required: +e.target.value })} />
            </Field>
            <Field label="Tekst obok logo" hint="Na karcie w Apple Wallet, np. nazwa lokalu."><input className="input" maxLength={24} value={d.logo_text} onChange={e => set('logo_text', e.target.value)} /></Field>
          </div>
        ), `${basics.stamps_required} pieczątek · ${basics.reward}`)}

        {sec('background', 'Tło i gradient', <Ic.palette width={17} height={17} />, (
          <div className="ap-form">
            <Segmented value={d.bg_mode} onChange={v => set('bg_mode', v)} options={[{ v: 'gradient', label: 'Gradient' }, { v: 'solid', label: 'Kolor' }, { v: 'image', label: 'Zdjęcie' }]} />
            {d.bg_mode === 'gradient' && <>
              <div className="dz-presets">
                {GRADIENTS.map(g => (
                  <button key={g.id} className={`dz-preset ${d.gradient.join() === g.stops.join() ? 'is-on' : ''}`} onClick={() => setD(x => ({ ...x, gradient: g.stops, angle: g.angle, pass_bg: g.pass, fg: g.fg, label: g.label, stamp_icon_color: x.stamp_style === 'filled' ? g.pass : x.stamp_icon_color }))} title={g.name}>
                    <i style={{ background: `linear-gradient(${g.angle}deg, ${g.stops.join(', ')})` }} /><span>{g.name}</span>
                  </button>
                ))}
              </div>
              <div className="dz-stops">
                {d.gradient.map((c, i) => (
                  <div key={i} className="dz-stop">
                    <ColorField label={`Kolor ${i + 1}`} value={c} onChange={v => set('gradient', d.gradient.map((x, j) => j === i ? v : x))} />
                    {d.gradient.length > 2 && <button className="ap-icon-btn" onClick={() => set('gradient', d.gradient.filter((_, j) => j !== i))} aria-label="Usuń kolor"><Ic.close width={14} height={14} /></button>}
                  </div>
                ))}
                {d.gradient.length < 5 && <button className="btn btn--ghost btn--xs" onClick={() => set('gradient', [...d.gradient, d.gradient[d.gradient.length - 1]])}><Ic.plus width={13} height={13} /> Dodaj kolor</button>}
              </div>
              <Field label={`Kierunek: ${d.angle}°`}><input type="range" className="dz-range" min={0} max={360} value={d.angle} onChange={e => set('angle', +e.target.value)} /></Field>
            </>}
            {d.bg_mode === 'solid' && <ColorField label="Kolor tła" value={d.bg} onChange={v => setD(x => ({ ...x, bg: v, pass_bg: v }))} />}
            {d.bg_mode === 'image' && <>
              <ImagePick label="Zdjęcie tła pieczątek" hint="Najlepiej poziome, min. 1200×400 px." value={d.bg_image ?? null} onChange={v => set('bg_image', v)} />
              <Field label={`Przyciemnienie: ${Math.round(d.bg_dim * 100)}%`}><input type="range" className="dz-range" min={0} max={70} value={Math.round(d.bg_dim * 100)} onChange={e => set('bg_dim', +e.target.value / 100)} /></Field>
            </>}
            <Toggle checked={d.grain} onChange={v => set('grain', v)} label="Ziarno (tekstura)" hint="Delikatny szum jak na stronie TableFlow." />
            <Toggle checked={d.animated} onChange={v => set('animated', v)} disabled={d.bg_mode !== 'gradient'} label="Animowany gradient na karcie online" hint="Apple i Google Wallet nie obsługują animacji — tam gradient jest statyczny, na karcie online płynnie się przelewa." />
          </div>
        ), d.bg_mode === 'gradient' ? 'Gradient' : d.bg_mode === 'solid' ? 'Jednolity kolor' : 'Zdjęcie')}

        {sec('colors', 'Kolory karty', <Ic.sparkle width={17} height={17} />, (
          <div className="ap-form ap-form--2">
            <ColorField label="Tło karty w portfelu" value={d.pass_bg} onChange={v => set('pass_bg', v)} />
            <ColorField label="Tekst" value={d.fg} onChange={v => set('fg', v)} />
            <ColorField label="Etykiety" value={d.label} onChange={v => set('label', v)} />
            <p className="ap-muted span-2">Apple i Google pokazują jednolity kolor karty — gradient i pieczątki są na pasku z grafiką.</p>
          </div>
        ))}

        {sec('logo', 'Logo', <Ic.image width={17} height={17} />, (
          <ImagePick label="Logo firmy" hint="PNG z przezroczystym tłem lub SVG. Pojawi się na karcie, ikonie powiadomień i w Google Wallet." value={d.logo_url ?? null} onChange={v => set('logo_url', v)} dark={d.pass_bg} />
        ), d.logo_url ? 'Własne logo' : 'Bez logo')}

        {sec('stamps', 'Pieczątki', <Ic.star width={17} height={17} />, (
          <div className="ap-form">
            <div className="dz-icons">
              {STAMP_KEYS.map(k => <button key={k} className={`dz-icon ${d.stamp_icon === k && !d.stamp_img ? 'is-on' : ''}`} onClick={() => setD(x => ({ ...x, stamp_icon: k, stamp_img: null }))} title={STAMP_ICONS[k].name}><StampGlyph icon={k} size={22} /></button>)}
            </div>
            <Segmented value={d.stamp_style} onChange={v => set('stamp_style', v)} options={[{ v: 'filled', label: 'Wypełnione' }, { v: 'outline', label: 'Kontur' }, { v: 'icon', label: 'Sama ikona' }]} size="sm" />
            <Segmented value={d.stamp_shape} onChange={v => set('stamp_shape', v)} options={[{ v: 'circle', label: 'Koło' }, { v: 'rounded', label: 'Kwadrat' }]} size="sm" />
            <div className="ap-form ap-form--2">
              <ColorField label="Pieczątka" value={d.stamp_color} onChange={v => set('stamp_color', v)} />
              {d.stamp_style === 'filled' && <ColorField label="Ikona na pieczątce" value={d.stamp_icon_color} onChange={v => set('stamp_icon_color', v)} />}
              <ColorField label="Puste pole" value={d.empty_color} onChange={v => set('empty_color', v)} />
            </div>
            <div className="ap-divider" />
            <ImagePick label="Własny obrazek pieczątki (zebrana)" hint="Kwadratowy PNG — zastępuje ikonę." value={d.stamp_img ?? null} onChange={v => set('stamp_img', v)} square />
            <ImagePick label="Własny obrazek pustego pola" hint="Opcjonalnie — np. szary odcisk pieczątki." value={d.empty_img ?? null} onChange={v => set('empty_img', v)} square />
          </div>
        ), d.stamp_img ? 'Własny obrazek' : STAMP_ICONS[d.stamp_icon].name)}

        {sec('info', 'Informacje na odwrocie', <Ic.doc width={17} height={17} />, (
          <div className="ap-form">
            <Field label="Opis programu"><textarea className="input" maxLength={300} value={info.description ?? ''} onChange={e => setInfo({ ...info, description: e.target.value })} placeholder="Za każdą wizytę dostajesz pieczątkę…" /></Field>
            <Field label="Godziny otwarcia"><input className="input" value={info.hours ?? ''} onChange={e => setInfo({ ...info, hours: e.target.value })} placeholder="pn–pt 8:00–20:00, sb 9:00–16:00" /></Field>
            <div className="ap-form ap-form--2">
              <Field label="Adres"><input className="input" value={info.address ?? ''} onChange={e => setInfo({ ...info, address: e.target.value })} /></Field>
              <Field label="Telefon"><input className="input" value={info.phone ?? ''} onChange={e => setInfo({ ...info, phone: e.target.value })} /></Field>
            </div>
            <Field label="Strona www / Instagram"><input className="input" value={info.website ?? ''} onChange={e => setInfo({ ...info, website: e.target.value })} /></Field>
            <Field label="Regulamin" hint="Np. „1 pieczątka za wizytę powyżej 30 zł. Nagroda ważna 30 dni.”"><textarea className="input" maxLength={600} value={info.terms ?? ''} onChange={e => setInfo({ ...info, terms: e.target.value })} /></Field>
          </div>
        ))}
      </div>

      <div className="dz__preview">
        <div className="dz__sticky">
          <div className="ap-row ap-row--between">
            <Segmented value={preview} onChange={setPreview} options={[{ v: 'apple', label: <><Ic.apple width={13} height={13} /> Apple</> }, { v: 'google', label: 'Google' }, { v: 'web', label: 'Online' }]} size="sm" />
            <label className="dz-pv"><span>{pv}/{basics.stamps_required}</span><input type="range" min={0} max={basics.stamps_required} value={pv} onChange={e => setPv(+e.target.value)} aria-label="Podgląd liczby pieczątek" /></label>
          </div>
          <div className="dz__stage">
            <AnimatePresence mode="wait">
              <motion.div key={preview} initial={{ opacity: 0, y: 10, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .35, ease: EASE }} style={{ width: '100%', display: 'grid', placeItems: 'center' }}>
                {preview === 'apple' ? <ApplePass design={d} data={card} /> : preview === 'google' ? <GooglePass design={d} data={card} /> : <WebCard design={d} data={card} />}
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="dz__hint">{preview === 'web' ? 'Karta online — działa u każdego klienta, także bez portfela.' : preview === 'apple' ? `Apple Wallet ${wallet?.apple ? '· aktywny' : '· zostanie włączony po konfiguracji certyfikatu'}` : `Google Wallet ${wallet?.google ? '· aktywny' : '· zostanie włączony po konfiguracji konta wydawcy'}`}</p>
          <div className="dz__bar">
            <span className={`dz__state ${dirty ? 'is-dirty' : ''}`}><i />{dirty ? 'Niezapisane zmiany' : program.published_at ? 'Opublikowano' : 'Szkic'}</span>
            <button className="btn btn--ghost btn--sm" onClick={save} disabled={saving || !dirty}>{saving ? 'Zapisuję…' : 'Zapisz szkic'}</button>
            <button className="btn btn--primary btn--sm" onClick={publish} disabled={!!pub}>Opublikuj kartę <Ic.arrowUp width={14} height={14} /></button>
          </div>
        </div>
      </div>

      <Modal open={!!pub} onClose={() => {}} title={pub?.ok ? 'Gotowe!' : 'Publikuję kartę'} sub={pub?.step}>
        <div className="dz-prog"><i style={{ width: `${pub ? Math.round((pub.done / Math.max(1, pub.all)) * 100) : 0}%` }} className="g" /></div>
        <p className="ap-muted">{pub?.ok ? 'Klienci mogą już dodać kartę. Karty w portfelach odświeżą się automatycznie.' : `Tworzę grafiki dla Apple Wallet (1×, 2×, 3×) i Google Wallet — ${pub?.done ?? 0} / ${pub?.all ?? 0}`}</p>
      </Modal>
    </div>
  )
}

/** Upload → downscale → storage (company folder) → URL. */
function ImagePick({ label, hint, value, onChange, square, dark }: { label: string; hint?: string; value: string | null; onChange: (v: string | null) => void; square?: boolean; dark?: string }) {
  const { company } = usePanel()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const pick = async (f: File | undefined) => {
    if (!f) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) { toast('Obsługiwane formaty: PNG, JPG, WEBP, SVG', 'err'); return }
    if (f.size > 8 * 1024 * 1024) { toast('Plik jest za duży (max 8 MB)', 'err'); return }
    setBusy(true)
    try {
      const blob = await prepareUpload(f, square ? 512 : 1400)
      const ext = blob.type === 'image/svg+xml' ? 'svg' : 'png'
      onChange(await upload(`c/${company.id}/u/${crypto.randomUUID()}.${ext}`, blob, blob.type || 'image/png'))
    } catch (e) { toast(errText(e), 'err') }
    setBusy(false)
  }
  const bg = useMemo(() => dark ? { background: dark } : undefined, [dark])
  return (
    <div className="dz-img">
      <div className={`dz-img__thumb ${square ? 'is-square' : ''}`} style={bg} onClick={() => input.current?.click()}>
        {value ? <img src={value} alt="" /> : <Ic.image width={20} height={20} />}
      </div>
      <div className="dz-img__t">
        <b>{label}</b>{hint && <small>{hint}</small>}
        <div className="ap-row">
          <button className="btn btn--ghost btn--xs" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Wysyłam…' : value ? 'Zmień' : 'Wybierz plik'}</button>
          {value && <button className="btn btn--ghost btn--xs" onClick={() => onChange(null)}>Usuń</button>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}
