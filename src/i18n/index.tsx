import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dict, Locale } from './types'
import { LOCALES, LOCALE_NAMES } from './types'
import { pl } from './pl'
import { applyOverrides, fetchPublished, type Overrides } from '../lib/content'

export type { Locale, Dict }
export { LOCALES, LOCALE_NAMES }

const loaders: Record<Locale, () => Promise<Dict>> = {
  pl: async () => pl,
  en: () => import('./en').then(m => m.en),
  ru: () => import('./ru').then(m => m.ru),
  fr: () => import('./fr').then(m => m.fr),
  es: () => import('./es').then(m => m.es),
}
const cache: Partial<Record<Locale, Dict>> = { pl }
export async function loadDict(l: Locale): Promise<Dict> {
  if (!cache[l]) cache[l] = await loaders[l]()
  return cache[l] as Dict
}
export const DEFAULT_LOCALE: Locale = 'pl'
const STORAGE_KEY = 'tf_lang'

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as string[]).includes(x)
}

export function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLocale(v) ? v : null
  } catch { return null }
}

export interface Detection {
  code: string          // raw BCP-47 primary tag, e.g. "de"
  name: string          // English display name, e.g. "German"
  nativeName: string    // display name in its own language
  supported: Locale | null
}

/** Reads navigator.languages and maps to a supported locale (or null). */
export function detectLanguage(): Detection {
  const langs = (typeof navigator !== 'undefined' && navigator.languages?.length ? navigator.languages : [navigator?.language || 'pl'])
  const primary = (langs[0] || 'pl').toLowerCase()
  const code = primary.split('-')[0]
  let supported: Locale | null = null
  for (const l of langs) {
    const p = l.toLowerCase().split('-')[0]
    if (isLocale(p)) { supported = p; break }
  }
  let name = code.toUpperCase(); let nativeName = name
  try {
    name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || name
    nativeName = new Intl.DisplayNames([code], { type: 'language' }).of(code) || name
  } catch { /* ignore */ }
  return { code, name, nativeName, supported }
}

interface Ctx {
  locale: Locale
  t: Dict
  /** base dictionary without overrides (the editor needs it for path lookup) */
  base: Dict
  overrides: Overrides
  setLocale: (l: Locale, opts?: { animate?: boolean; persist?: boolean }) => Promise<void>
  switching: boolean
  editMode: boolean
  setEditMode: (v: boolean) => void
  /** editor: inject draft overrides for the current locale (bypasses the published cache) */
  setEditorOverrides: (l: Locale, ov: Overrides | null) => void
}
const I18nContext = createContext<Ctx | null>(null)

function applyDocument(l: Locale, d: Dict) {
  document.documentElement.lang = l
  document.title = d.meta.title
  const m = document.querySelector('meta[name="description"]')
  if (m) m.setAttribute('content', d.meta.description)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)
  const [dict, setDict] = useState<Dict>(pl)
  const [switching, setSwitching] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [published, setPublished] = useState<Partial<Record<Locale, Overrides>>>({})
  const [editorOv, setEditorOv] = useState<Partial<Record<Locale, Overrides>>>({})
  const busy = useRef(false)

  // published content overrides (CMS) for the current locale
  useEffect(() => {
    let alive = true
    fetchPublished(locale).then(ov => { if (alive && Object.keys(ov).length) setPublished(p => ({ ...p, [locale]: ov })) })
    return () => { alive = false }
  }, [locale])
  const setEditorOverrides = useCallback((l: Locale, ov: Overrides | null) => { setEditorOv(p => ({ ...p, [l]: ov ?? undefined })) }, [])

  // Stored choice from a previous visit: load the chunk (hidden behind the intro) and apply without animation.
  useEffect(() => {
    const stored = readStoredLocale()
    if (!stored || stored === DEFAULT_LOCALE) return
    let alive = true
    loadDict(stored).then(d => { if (alive) { setDict(d); setLocaleState(stored) } })
    return () => { alive = false }
  }, [])
  const overrides = useMemo<Overrides>(() => editorOv[locale] ?? published[locale] ?? {}, [editorOv, published, locale])
  const t = useMemo(() => applyOverrides(dict, overrides), [dict, overrides])
  useEffect(() => { applyDocument(locale, t) }, [locale, t])

  const setLocale = useCallback(async (l: Locale, opts?: { animate?: boolean; persist?: boolean }) => {
    const animate = opts?.animate ?? true
    const persist = opts?.persist ?? true
    if (persist) { try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ } }
    if (l === locale) return
    const d = await loadDict(l)
    if (!animate || busy.current) { setDict(d); setLocaleState(l); return }
    busy.current = true
    setSwitching(true)
    const root = document.documentElement
    root.classList.add('lang-out')
    await new Promise(r => setTimeout(r, 460))
    setDict(d); setLocaleState(l)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    root.classList.remove('lang-out')
    await new Promise(r => setTimeout(r, 460))
    setSwitching(false)
    busy.current = false
  }, [locale])

  const value = useMemo<Ctx>(() => ({ locale, t, base: dict, overrides, setLocale, switching, editMode, setEditMode, setEditorOverrides }), [locale, t, dict, overrides, setLocale, switching, editMode, setEditorOverrides])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): Ctx {
  const c = useContext(I18nContext)
  if (!c) throw new Error('useI18n outside provider')
  return c
}
export function useT(): Dict { return useI18n().t }
