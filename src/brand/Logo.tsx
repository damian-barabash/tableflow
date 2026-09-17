import { motion } from 'motion/react'
import './logo.css'

/**
 * Brand mark: a bare glyph (no tile) — long diagonal "flow" stroke, a chevron on the right,
 * a short stroke and a dot bottom-left. Inherits `currentColor`; transparent background.
 */
const STROKES = [
  'M10 44 L40 14',        // main diagonal
  'M54 16 L42 28 L54 40', // chevron
  'M22 50 L32 40',        // short stroke
]
const DOT = { cx: 10, cy: 30, r: 4.6 }

export function Mark({ size = 32, animate = false, className = '', color }: { size?: number; animate?: boolean; className?: string; color?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg className={`tf-mark ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={color ? { color } : undefined}>
      {STROKES.map((d, i) => animate
        ? <motion.path key={i} d={d} {...common} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: .7, delay: .2 + i * .16, ease: [.22, 1, .36, 1] }} />
        : <path key={i} d={d} {...common} />)}
      {animate
        ? <motion.circle {...DOT} fill="currentColor" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: .45, delay: .75, ease: [.22, 1, .36, 1] }} style={{ transformOrigin: `${DOT.cx}px ${DOT.cy}px` }} />
        : <circle {...DOT} fill="currentColor" />}
    </svg>
  )
}

/** Text wordmark (HTML, Inter). "AI" is plain text with an animated gradient underline. */
export function Wordmark({ className = '', ai = true }: { className?: string; ai?: boolean }) {
  return (
    <span className={`tf-word ${className}`}>
      <span className="tf-word__t">TableFlow</span>
      {ai && <span className="tf-word__ai">AI<i className="g" /></span>}
    </span>
  )
}

export function Logo({ size = 28, className = '', light = false }: { size?: number; className?: string; light?: boolean }) {
  return (
    <span className={`tf-logo ${light ? 'tf-logo--light' : ''} ${className}`}>
      <Mark size={size} />
      <Wordmark />
    </span>
  )
}

/** Gradient "thinking" orb used by the language assistant. */
export function Orb({ size = 28, active = true }: { size?: number; active?: boolean }) {
  return <span className={`tf-orb ${active ? 'is-active' : ''}`} style={{ width: size, height: size }} aria-hidden="true" />
}
