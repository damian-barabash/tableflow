/**
 * Minimal rich-text model for dictionary strings: a whitelisted inline markup
 *   <g>…</g>            brand gradient (animated)      → <span class="grad-text">
 *   <b>, <i>, <br>
 *   <span style="color:…;font-size:…;font-weight:…">
 * Everything else is stripped on sanitize. Plain strings pass through untouched.
 */
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|var\(--[a-z0-9-]+\)|[a-z]+)$/i
const SIZE_RE = /^\d+(\.\d+)?(em|rem|px|%)$/
const WEIGHT_RE = /^(400|500|600|700|bold|normal)$/

export function hasMarkup(s: string) { return /<\/?[a-z][^>]*>/i.test(s) }

/** Sanitize an HTML fragment (from contentEditable) into the compact model above. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement
  const out = walk(root)
  return out.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function walk(el: Node): string {
  let out = ''
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === Node.TEXT_NODE) { out += esc(n.nodeValue || ''); continue }
    if (n.nodeType !== Node.ELEMENT_NODE) continue
    const e = n as HTMLElement; const tag = e.tagName.toLowerCase()
    const inner = walk(e)
    if (tag === 'br') { out += '<br>'; continue }
    if (tag === 'g' || (tag === 'span' && e.classList.contains('grad-text'))) { out += inner ? `<g>${inner}</g>` : ''; continue }
    if (tag === 'b' || tag === 'strong') { out += inner ? `<b>${inner}</b>` : ''; continue }
    if (tag === 'i' || tag === 'em') { out += inner ? `<i>${inner}</i>` : ''; continue }
    if (tag === 'font' && e.getAttribute('color')) { out += inner ? `<span style="color:${e.getAttribute('color')}">${inner}</span>` : ''; continue }
    if (tag === 'span') {
      const st: string[] = []
      const c = e.style.color, fs = e.style.fontSize, fw = e.style.fontWeight
      if (c && COLOR_RE.test(c)) st.push(`color:${c}`)
      if (fs && SIZE_RE.test(fs)) st.push(`font-size:${fs}`)
      if (fw && WEIGHT_RE.test(fw)) st.push(`font-weight:${fw}`)
      out += st.length && inner ? `<span style="${st.join(';')}">${inner}</span>` : inner
      continue
    }
    if (tag === 'div' || tag === 'p') { out += (out && !out.endsWith('<br>') ? '<br>' : '') + inner; continue }
    out += inner
  }
  return out
}

/** Model → renderable HTML (only our tags, already safe; `<g>` becomes the gradient span). */
export function toRenderHtml(model: string): string {
  if (!hasMarkup(model)) return esc(model)
  // re-sanitize defensively (content comes from the DB) and expand <g>
  return sanitizeHtml(model.replace(/<g>/g, '<span class="grad-text">').replace(/<\/g>/g, '</span>'))
    .replace(/<g>/g, '<span class="grad-text">').replace(/<\/g>/g, '</span>')
}
