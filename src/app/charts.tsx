import { useMemo, useState, type ReactNode } from 'react'
import { fmtNum } from './ui'

/**
 * Minimal SVG/HTML charts in the brand system: one hue (indigo) for magnitude,
 * thin marks with rounded data-ends, recessive grid, hover tooltip on every mark.
 */

const DAY = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' })
const WEEKDAY = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })

export interface Point { d: string; [k: string]: number | string }

/** Daily bars (single measure). A second measure can be shown as a thin line overlay on its own chart — never a dual axis. */
export function Bars({ data, k, label, height = 180, format = fmtNum, empty = 'Brak danych w tym okresie' }: { data: Point[]; k: string; label: string; height?: number; format?: (n: number) => string; empty?: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map(p => Number(p[k]) || 0))
  const nice = niceMax(max)
  const total = data.reduce((s, p) => s + (Number(p[k]) || 0), 0)
  const W = 100 / Math.max(1, data.length)
  const every = Math.ceil(data.length / 7)
  return (
    <div className="ch" style={{ height }}>
      <div className="ch__grid">{[1, .5, 0].map(f => <span key={f} style={{ bottom: `${f * 100}%` }}><em>{format(Math.round(nice * f))}</em></span>)}</div>
      <div className="ch__plot" onMouseLeave={() => setHover(null)}>
        {total === 0 && <div className="ch__empty">{empty}</div>}
        {data.map((p, i) => {
          const v = Number(p[k]) || 0
          return (
            <div key={p.d} className={`ch__col ${hover === i ? 'is-hover' : ''}`} style={{ width: `${W}%` }} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <i style={{ height: `${(v / nice) * 100}%` }} className={v ? '' : 'is-zero'} />
            </div>
          )
        })}
        {hover != null && data[hover] && (
          <div className="ch__tip" style={{ left: `${(hover + .5) * W}%` }}>
            <small>{WEEKDAY.format(new Date(data[hover].d))}</small>
            <b>{format(Number(data[hover][k]) || 0)}</b> <span>{label}</span>
          </div>
        )}
      </div>
      <div className="ch__x">{data.map((p, i) => <span key={p.d} style={{ width: `${W}%` }}>{i % every === 0 ? DAY.format(new Date(p.d)) : ''}</span>)}</div>
    </div>
  )
}

function niceMax(v: number) {
  if (v <= 5) return 5
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

/** Horizontal ranking — the default for categories (pages, sources, devices). */
export function BarList({ items, total, format = fmtNum, limit = 8, empty = 'Brak danych', labelOf }: { items: { k: string; n: number; sub?: string }[]; total?: number; format?: (n: number) => string; limit?: number; empty?: ReactNode; labelOf?: (k: string) => ReactNode }) {
  const [all, setAll] = useState(false)
  const max = Math.max(1, ...items.map(i => i.n))
  const sum = total ?? items.reduce((s, i) => s + i.n, 0)
  const shown = all ? items : items.slice(0, limit)
  if (!items.length) return <div className="bl__empty">{empty}</div>
  return (
    <div className="bl">
      {shown.map(it => (
        <div className="bl__row" key={it.k} title={`${it.k}: ${format(it.n)}`}>
          <i style={{ width: `${(it.n / max) * 100}%` }} />
          <span className="bl__k">{labelOf ? labelOf(it.k) : it.k}{it.sub && <small>{it.sub}</small>}</span>
          <span className="bl__v">{format(it.n)}<small>{sum ? Math.round((it.n / sum) * 100) : 0}%</small></span>
        </div>
      ))}
      {items.length > limit && <button className="bl__more" onClick={() => setAll(v => !v)}>{all ? 'Pokaż mniej' : `Pokaż wszystkie (${items.length})`}</button>}
    </div>
  )
}

/** Weekday × hour heatmap (sequential, one hue). */
export function Heatmap({ cells, label = 'pieczątek', from = 7, to = 22 }: { cells: { dow: number; h: number; n: number }[]; label?: string; from?: number; to?: number }) {
  const [tip, setTip] = useState<string | null>(null)
  const map = useMemo(() => { const m = new Map<string, number>(); cells.forEach(c => m.set(`${c.dow}-${c.h}`, c.n)); return m }, [cells])
  const max = Math.max(1, ...cells.map(c => c.n))
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const days = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
  return (
    <div className="hm">
      <div className="hm__grid" style={{ gridTemplateColumns: `28px repeat(${hours.length}, 1fr)` }} onMouseLeave={() => setTip(null)}>
        <span />
        {hours.map(h => <span key={h} className="hm__h">{h % 3 === 0 ? h : ''}</span>)}
        {days.map((d, di) => (
          <div key={d} style={{ display: 'contents' }}>
            <span className="hm__d">{d}</span>
            {hours.map(h => {
              const n = map.get(`${di + 1}-${h}`) ?? 0
              return <i key={h} style={{ opacity: n ? .18 + .82 * (n / max) : 1 }} className={n ? 'is-on' : ''} onMouseEnter={() => setTip(`${d} ${h}:00–${h + 1}:00 · ${n} ${label}`)} />
            })}
          </div>
        ))}
      </div>
      <p className="hm__tip">{tip ?? 'Najedź na pole, aby zobaczyć szczegóły'}</p>
    </div>
  )
}

/** Stacked 100% bar for 2–3 shares (e.g. Apple / Google / tylko web) with legend + labels. */
export function Share({ parts }: { parts: { label: string; n: number; tone: 'a' | 'b' | 'c' }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0)
  return (
    <div className="sh">
      <div className="sh__bar">{total ? parts.filter(p => p.n).map(p => <i key={p.label} className={`is-${p.tone}`} style={{ width: `${(p.n / total) * 100}%` }} title={`${p.label}: ${p.n}`} />) : <i className="is-none" style={{ width: '100%' }} />}</div>
      <ul className="sh__legend">{parts.map(p => <li key={p.label}><i className={`is-${p.tone}`} />{p.label}<b>{fmtNum(p.n)}</b><small>{total ? Math.round((p.n / total) * 100) : 0}%</small></li>)}</ul>
    </div>
  )
}

/** Tiny inline progress of stamps. */
export function StampDots({ n, of }: { n: number; of: number }) {
  const shown = Math.min(n, of)
  return <span className="sd" aria-label={`${n} z ${of}`}>{Array.from({ length: of }, (_, i) => <i key={i} className={i < shown ? 'is-on' : ''} />)}{n >= of && <b>🎁</b>}</span>
}
