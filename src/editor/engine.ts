/**
 * Visual editing engine (Elementor-like), on top of React-rendered DOM:
 *  - plain leaves: element text == dictionary leaf → contentEditable="plaintext-only"
 *  - rich blocks ([data-rich="path"], rendered by <Rich>): contentEditable HTML; the selection
 *    toolbar can bold / resize / colour / toggle the brand gradient; value stored as sanitized markup
 *  - changes are recorded as {dictPath: text}; a MutationObserver re-marks re-mounted nodes
 */
import { sanitizeHtml } from '../lib/rich'

export type Changes = Record<string, string>
export interface SelectionInfo { rect: DOMRect; el: HTMLElement; grad: boolean; bold: boolean }
export interface EngineOptions {
  root: HTMLElement
  values: Map<string, string>
  onChange: (changes: Changes) => void
  onFocusPath: (path: string | null) => void
  onSelection: (info: SelectionInfo | null) => void
}
const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'BR'])
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

export function createEngine(o: EngineOptions) {
  const changes: Changes = {}
  const byValue = new Map<string, string[]>()
  for (const [p, v] of o.values) { const k = norm(v); if (!k) continue; const arr = byValue.get(k) || []; arr.push(p); byValue.set(k, arr) }

  function pathsFor(el: HTMLElement, text: string): string[] {
    const cands = byValue.get(norm(text)) || []
    if (cands.length <= 1) return cands
    const inNav = !!el.closest('header.nav'), inFoot = !!el.closest('footer')
    const pref = cands.filter(p => inNav ? p.startsWith('nav.') : inFoot ? p.startsWith('footer.') : !(p.startsWith('nav.') || p.startsWith('footer.')))
    return pref.length ? pref : cands
  }
  function isLeaf(el: HTMLElement) {
    if (SKIP.has(el.tagName) || el.closest('.ed-bar, .ed-pop, .ed-tb, .ed-progress')) return false
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.ELEMENT_NODE) { const e = n as HTMLElement; if (e.tagName !== 'BR' && (e.textContent || '').trim()) return false }
    }
    return !!(el.textContent || '').trim()
  }
  function mark(el: HTMLElement) {
    if (el.dataset.ed) return
    if (el.closest('.ed-bar, .ed-pop, .ed-tb, .ed-progress')) return
    if (el.dataset.rich) {                       // rich block: path is explicit
      const path = el.dataset.rich
      el.dataset.ed = path; el.contentEditable = 'true'; el.spellcheck = false; el.classList.add('ed-item', 'ed-item--rich')
      const pending = changes[path]
      if (pending !== undefined) el.innerHTML = pending.replace(/<g>/g, '<span class="grad-text">').replace(/<\/g>/g, '</span>')
      return
    }
    if (el.closest('[data-rich]')) return          // inner spans of a rich block are handled by the block
    if (!isLeaf(el)) return
    const paths = pathsFor(el, el.textContent || '')
    if (!paths.length) return
    el.dataset.ed = paths.join('|'); el.contentEditable = 'plaintext-only'; el.spellcheck = false; el.classList.add('ed-item')
    const pending = changes[paths[0]]
    if (pending !== undefined && el.textContent !== pending) el.textContent = pending
  }
  function scan(node: ParentNode) {
    const els = node instanceof HTMLElement ? [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))] : Array.from(node.querySelectorAll<HTMLElement>('*'))
    for (const el of els) mark(el)
  }
  function record(el: HTMLElement) {
    const val = el.dataset.rich ? sanitizeHtml(el.innerHTML) : (el.textContent || '').replace(/ /g, ' ')
    for (const p of el.dataset.ed!.split('|')) changes[p] = val
    o.onChange({ ...changes })
  }

  // ---------- selection / formatting ----------
  let selEl: HTMLElement | null = null
  function reportSelection() {
    const s = window.getSelection()
    if (!s || s.rangeCount === 0 || s.isCollapsed) { o.onSelection(null); return }
    const r = s.getRangeAt(0)
    const el = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer as HTMLElement : r.commonAncestorContainer.parentElement)?.closest<HTMLElement>('[data-rich][data-ed]') || null
    if (!el || !o.root.contains(el)) { o.onSelection(null); return }
    selEl = el
    const rect = r.getBoundingClientRect()
    const anc = (n: Node) => (n.nodeType === 1 ? n as HTMLElement : n.parentElement)
    o.onSelection({ rect, el, grad: !!anc(r.startContainer)?.closest('.grad-text'), bold: !!anc(r.startContainer)?.closest('b, strong') })
  }
  const currentRange = (): Range | null => { const s = window.getSelection(); if (!s || s.rangeCount === 0 || s.isCollapsed || !selEl) return null; const r = s.getRangeAt(0); return selEl.contains(r.commonAncestorContainer) ? r : null }
  function selectNode(n: Node) { const s = window.getSelection(); if (!s) return; const r = document.createRange(); r.selectNodeContents(n); s.removeAllRanges(); s.addRange(r) }
  function unwrap(el: Element) { const p = el.parentNode; if (!p) return; while (el.firstChild) p.insertBefore(el.firstChild, el); el.remove() }
  type Kind = 'grad' | 'size' | 'color'
  const matches = (e: Element, k: Kind) => k === 'grad' ? e.classList.contains('grad-text') : k === 'size' ? !!(e as HTMLElement).style?.fontSize : !!(e as HTMLElement).style?.color || e.tagName === 'FONT'
  function stripKind(frag: Node, k: Kind) {
    const els = Array.from((frag as ParentNode).querySelectorAll ? (frag as ParentNode).querySelectorAll<HTMLElement>('span, font') : [])
    for (const e of els) {
      if (!matches(e, k)) continue
      if (k === 'grad') e.classList.remove('grad-text')
      if (k === 'size') e.style.fontSize = ''
      if (k === 'color') { e.style.color = ''; if (e.tagName === 'FONT') { unwrap(e); continue } }
      if (!e.getAttribute('style') && !e.className) unwrap(e)
    }
  }
  function removeKind(range: Range, k: Kind) {
    const start = range.startContainer.nodeType === 1 ? range.startContainer as HTMLElement : range.startContainer.parentElement!
    let anc: HTMLElement | null = start
    while (anc && anc !== selEl && !matches(anc, k)) anc = anc.parentElement
    if (anc && anc !== selEl) {
      // split ancestor into [before][mid][after]; mid loses the kind
      const r2 = document.createRange(); r2.setStart(range.endContainer, range.endOffset); r2.setEndAfter(anc.lastChild!)
      const after = r2.extractContents()
      const mid = range.extractContents()
      const r1 = document.createRange(); r1.setStartBefore(anc.firstChild!); r1.setEnd(range.startContainer, range.startOffset)
      const before = r1.extractContents()
      const parent = anc.parentNode!
      const b = anc.cloneNode(false) as HTMLElement; b.appendChild(before)
      const a = anc.cloneNode(false) as HTMLElement; a.appendChild(after)
      stripKind(mid, k)
      const holder = document.createElement('span'); holder.appendChild(mid)
      parent.insertBefore(b, anc); parent.insertBefore(holder, anc); parent.insertBefore(a, anc); anc.remove()
      if (!b.textContent) b.remove(); if (!a.textContent) a.remove()
      const nodes = Array.from(holder.childNodes); unwrap(holder)
      if (nodes.length) { const s = window.getSelection(); const r = document.createRange(); r.setStartBefore(nodes[0]); r.setEndAfter(nodes[nodes.length - 1]); s?.removeAllRanges(); s?.addRange(r) }
    } else {
      const frag = range.extractContents(); stripKind(frag, k)
      const holder = document.createElement('span'); holder.appendChild(frag); range.insertNode(holder)
      const nodes = Array.from(holder.childNodes); unwrap(holder)
      if (nodes.length) { const s = window.getSelection(); const r = document.createRange(); r.setStartBefore(nodes[0]); r.setEndAfter(nodes[nodes.length - 1]); s?.removeAllRanges(); s?.addRange(r) }
    }
  }
  function wrapKind(range: Range, k: Kind, value?: string) {
    const frag = range.extractContents(); stripKind(frag, k)
    const w = document.createElement('span')
    if (k === 'grad') w.className = 'grad-text'
    if (k === 'size') w.style.fontSize = value || '1.2em'
    if (k === 'color') w.style.color = value || 'inherit'
    w.appendChild(frag); range.insertNode(w); selectNode(w)
  }
  function format(cmd: 'bold' | 'grad-on' | 'grad-off' | 'size' | 'size-reset' | 'color' | 'color-reset', value?: string) {
    const r = currentRange(); if (!r || !selEl) return
    if (cmd === 'bold') document.execCommand('bold')
    else if (cmd === 'grad-on') wrapKind(r, 'grad')
    else if (cmd === 'grad-off') removeKind(r, 'grad')
    else if (cmd === 'size') wrapKind(r, 'size', value)
    else if (cmd === 'size-reset') removeKind(r, 'size')
    else if (cmd === 'color') wrapKind(r, 'color', value)
    else if (cmd === 'color-reset') removeKind(r, 'color')
    // normalise: sanitize → re-render inside the block so the DOM matches the stored model
    const model = sanitizeHtml(selEl.innerHTML)
    selEl.innerHTML = model.replace(/<g>/g, '<span class="grad-text">').replace(/<\/g>/g, '</span>')
    record(selEl)
    o.onSelection(null)
  }

  // ---------- events ----------
  const onInput = (e: Event) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'); if (el) record(el) }
  const onFocusIn = (e: Event) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'); o.onFocusPath(el ? el.dataset.ed!.split('|')[0] : null) }
  const onFocusOut = () => { o.onFocusPath(null) }
  const onKey = (e: KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'); if (!el) return
    const block = el.dataset.rich !== undefined || /^(P|LI|TD|DIV)$/.test(el.tagName)
    if (e.key === 'Enter' && !(block && e.shiftKey)) { e.preventDefault(); el.blur() }
    if (e.key === 'Escape') el.blur()
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && el.dataset.rich !== undefined) { e.preventDefault(); format('bold') }
  }
  const onPaste = (e: ClipboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'); if (!el) return
    e.preventDefault(); document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '')
  }
  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('.ed-bar, .ed-pop, .ed-tb, .ed-progress')) return
    if (t.closest('a, button, [role="tab"]')) { e.preventDefault(); e.stopPropagation() }
  }
  const onSel = () => { reportSelection() }

  const r = o.root
  r.addEventListener('input', onInput); r.addEventListener('focusin', onFocusIn); r.addEventListener('focusout', onFocusOut)
  r.addEventListener('keydown', onKey); r.addEventListener('paste', onPaste); r.addEventListener('click', onClick, true)
  document.addEventListener('selectionchange', onSel)
  scan(r)
  let t = 0
  const mo = new MutationObserver(() => { if (t) return; t = window.setTimeout(() => { t = 0; scan(r) }, 120) })
  mo.observe(r, { childList: true, subtree: true })

  return {
    changes, format,
    destroy() {
      mo.disconnect(); if (t) clearTimeout(t)
      r.removeEventListener('input', onInput); r.removeEventListener('focusin', onFocusIn); r.removeEventListener('focusout', onFocusOut)
      r.removeEventListener('keydown', onKey); r.removeEventListener('paste', onPaste); r.removeEventListener('click', onClick, true)
      document.removeEventListener('selectionchange', onSel)
      r.querySelectorAll<HTMLElement>('[data-ed]').forEach(el => { el.removeAttribute('contenteditable'); el.classList.remove('ed-item', 'ed-item--rich'); delete el.dataset.ed })
    },
    count() { return r.querySelectorAll('[data-ed]').length },
  }
}
