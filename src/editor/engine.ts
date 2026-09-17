/**
 * Visual editing engine (Elementor-like): finds DOM elements whose text equals a dictionary leaf,
 * makes them contentEditable and records changes as {dictPath: newText}. Composite elements
 * (a heading assembled from an array of strings, e.g. hero.h1) open a small parts popover.
 * Works on top of React-rendered DOM without changing components; new nodes are picked up by a
 * MutationObserver, so animated/re-mounted parts stay editable.
 */
export type Changes = Record<string, string>
export interface EngineOptions {
  root: HTMLElement
  /** path → current value (base dict merged with overrides) */
  values: Map<string, string>
  onChange: (changes: Changes) => void
  onFocusPath: (path: string | null) => void
  onComposite: (req: { el: HTMLElement; parts: { path: string; value: string }[]; apply: (vals: string[]) => void }) => void
}
const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'BR'])

export function createEngine(o: EngineOptions) {
  const changes: Changes = {}
  const byValue = new Map<string, string[]>()
  for (const [p, v] of o.values) { const k = norm(v); if (!k) continue; const arr = byValue.get(k) || []; arr.push(p); byValue.set(k, arr) }
  // composites: arrays of strings whose joined text can appear inside one element
  const composites = new Map<string, string[]>()   // joined text → paths (in order)
  const groups = new Map<string, { i: number; p: string }[]>()
  for (const p of o.values.keys()) { const m = p.match(/^(.*)\.(\d+)$/); if (m) { const g = groups.get(m[1]) || []; g.push({ i: +m[2], p }); groups.set(m[1], g) } }
  for (const [, items] of groups) {
    items.sort((a, b) => a.i - b.i)
    const joined = norm(items.map(it => o.values.get(it.p) || '').join(''))
    if (joined && items.length > 1 && joined.length > 12) composites.set(joined, items.map(it => it.p))
  }

  function pathsFor(el: HTMLElement, text: string): string[] {
    const cands = byValue.get(norm(text)) || []
    if (cands.length <= 1) return cands
    const inNav = !!el.closest('header.nav'), inFoot = !!el.closest('footer')
    const pref = cands.filter(p => inNav ? p.startsWith('nav.') : inFoot ? p.startsWith('footer.') : !(p.startsWith('nav.') || p.startsWith('footer.')))
    return pref.length ? pref : cands
  }

  function isLeaf(el: HTMLElement) {
    if (SKIP.has(el.tagName) || el.closest('.ed-bar, .ed-pop')) return false
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.ELEMENT_NODE) { const e = n as HTMLElement; if (e.tagName !== 'BR' && (e.textContent || '').trim()) return false }
    }
    return !!(el.textContent || '').trim()
  }

  function mark(el: HTMLElement) {
    if (el.dataset.ed || el.dataset.edc) return
    const text = el.textContent || ''
    if (isLeaf(el)) {
      const paths = pathsFor(el, text)
      if (!paths.length) return
      el.dataset.ed = paths.join('|')
      el.contentEditable = 'plaintext-only'
      el.spellcheck = false
      el.classList.add('ed-item')
      const pending = changes[paths[0]]
      if (pending !== undefined && el.textContent !== pending) el.textContent = pending
      return
    }
    // composite: whole element text equals an array joined
    const parts = composites.get(norm(text))
    if (parts && !el.querySelector('[data-ed]')) {
      el.dataset.edc = parts.join('|')
      el.classList.add('ed-item', 'ed-item--multi')
    }
  }

  function scan(node: ParentNode) {
    const els = node instanceof HTMLElement ? [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))] : Array.from(node.querySelectorAll<HTMLElement>('*'))
    for (const el of els) mark(el)
  }

  const onInput = (e: Event) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'); if (!el) return
    const val = (el.textContent || '').replace(/ /g, ' ')
    for (const p of el.dataset.ed!.split('|')) changes[p] = val
    o.onChange({ ...changes })
  }
  const onFocusIn = (e: Event) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'); o.onFocusPath(el ? el.dataset.ed!.split('|')[0] : null) }
  const onFocusOut = () => o.onFocusPath(null)
  const onKey = (e: KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'); if (!el) return
    const block = /^(P|LI|TD|DIV)$/.test(el.tagName)
    if (e.key === 'Enter' && !(block && e.shiftKey)) { e.preventDefault(); el.blur() }
    if (e.key === 'Escape') { el.blur() }
  }
  const onPaste = (e: ClipboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'); if (!el) return
    e.preventDefault(); const txt = e.clipboardData?.getData('text/plain') || ''; document.execCommand('insertText', false, txt)
  }
  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('.ed-bar, .ed-pop')) return
    const multi = t.closest<HTMLElement>('[data-edc]')
    if (multi && !t.closest('[data-ed]')) {
      e.preventDefault(); e.stopPropagation()
      const paths = multi.dataset.edc!.split('|')
      o.onComposite({
        el: multi,
        parts: paths.map(p => ({ path: p, value: changes[p] ?? o.values.get(p) ?? '' })),
        apply: (vals) => { paths.forEach((p, i) => { changes[p] = vals[i] }); o.onChange({ ...changes }); rewriteComposite(multi, paths, vals) },
      })
      return
    }
    // block navigation & React handlers on links/buttons while editing (text stays editable: focus happens on mousedown)
    if (t.closest('a, button, [role="tab"]')) { e.preventDefault(); e.stopPropagation() }
  }
  function rewriteComposite(el: HTMLElement, paths: string[], vals: string[]) {
    // walk text nodes in order and map each to the part whose old value it matched
    const olds = paths.map(p => o.values.get(p) ?? '')
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []; let n: Node | null
    while ((n = walker.nextNode())) nodes.push(n as Text)
    const remaining = olds.map((v, i) => ({ v: norm(v), i }))
    for (const tn of nodes) {
      const k = norm(tn.nodeValue || ''); if (!k) continue
      const hit = remaining.find(r => r.v === k)
      if (hit) { tn.nodeValue = vals[hit.i]; remaining.splice(remaining.indexOf(hit), 1) }
    }
  }

  const r = o.root
  r.addEventListener('input', onInput)
  r.addEventListener('focusin', onFocusIn)
  r.addEventListener('focusout', onFocusOut)
  r.addEventListener('keydown', onKey)
  r.addEventListener('paste', onPaste)
  r.addEventListener('click', onClick, true)
  scan(r)
  let t = 0
  const mo = new MutationObserver(() => { if (t) return; t = window.setTimeout(() => { t = 0; scan(r) }, 120) })
  mo.observe(r, { childList: true, subtree: true })

  return {
    changes,
    destroy() {
      mo.disconnect(); if (t) clearTimeout(t)
      r.removeEventListener('input', onInput); r.removeEventListener('focusin', onFocusIn); r.removeEventListener('focusout', onFocusOut)
      r.removeEventListener('keydown', onKey); r.removeEventListener('paste', onPaste); r.removeEventListener('click', onClick, true)
      r.querySelectorAll<HTMLElement>('[data-ed],[data-edc]').forEach(el => { el.removeAttribute('contenteditable'); el.classList.remove('ed-item', 'ed-item--multi'); delete el.dataset.ed; delete el.dataset.edc })
    },
    count() { return r.querySelectorAll('[data-ed],[data-edc]').length },
  }
}
function norm(s: string) { return s.replace(/\s+/g, ' ').trim() }
