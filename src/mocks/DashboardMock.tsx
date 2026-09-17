import { Mark } from '../brand/Logo'
import { I } from '../components/Icons'
import { useI18n } from '../i18n'
import './mocks.css'

const ICONS = [I.home, I.calendar, I.phone, I.users, I.card, I.analytics, I.users, I.settings]
// [staffIndex, startRow (0=9:00, each row 30min), spanRows, bookingIndex, highlight?]
const BLOCKS: [number, number, number, number, boolean?][] = [
  [0, 0, 2, 3], [0, 3, 1, 1], [0, 6, 2, 5], [0, 11, 2, 0, true],
  [1, 1, 3, 2], [1, 6, 1, 4], [1, 9, 2, 6],
  [2, 0, 1, 1], [2, 4, 2, 5], [2, 8, 2, 7],
  [3, 2, 2, 6], [3, 7, 1, 4], [3, 10, 2, 3],
]
const HOURS = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']

/** Right hero visual: browser window with the staff calendar dashboard. */
export function DashboardMock() {
  const { t } = useI18n()
  const d = t.demo.dashboard
  return (
    <div className="db" aria-hidden="true">
      <div className="db__chrome"><span /><span /><span /><div className="db__url"><svg width="9" height="10" viewBox="0 0 9 10"><rect x="1" y="4" width="7" height="5.5" rx="1" fill="#8a867e" /><path d="M2.5 4V3a2 2 0 0 1 4 0v1" fill="none" stroke="#8a867e" /></svg>{d.url}</div></div>
      <div className="db__body">
        <aside className="db__side">
          <div className="db__logo"><Mark size={18} /><span>TableFlow</span></div>
          <div className="db__sec">{d.section1}</div>
          {d.sidebar.slice(0, 4).map((s, i) => { const Ic = ICONS[i]; return <div key={s} className={`db__item ${i === 1 ? 'is-active' : ''}`}><Ic width={13} height={13} />{s}{i === 2 && <b>12</b>}</div> })}
          <div className="db__sec">{d.section2}</div>
          {d.sidebar.slice(4).map((s, i) => { const Ic = ICONS[i + 4]; return <div key={s} className="db__item"><Ic width={13} height={13} />{s}</div> })}
        </aside>
        <main className="db__main">
          <div className="db__top">
            <div className="db__title">{d.title} <span className="db__today">{d.today}</span></div>
            <div className="db__stats">{d.stats.map(([k, v]) => <div key={k} className="db__stat"><span>{k}</span><b>{v}</b></div>)}</div>
          </div>
          <div className="db__cal">
            <div className="db__hours">{HOURS.map(h => <span key={h}>{h}</span>)}</div>
            {d.staff.map((name, si) => (
              <div key={name} className="db__col">
                <div className="db__staff"><i style={{ background: ['#a784a3', '#6f6396', '#464f96', '#d3b5bd'][si] }} />{name}</div>
                <div className="db__grid">
                  {BLOCKS.filter(b => b[0] === si).map(([, r, span, bi, hi], i) => (
                    <div key={i} className={`db__blk ${hi ? 'is-new' : ''}`} style={{ top: `${r * 6.25}%`, height: `${span * 6.25}%` }}>{d.bookings[bi]}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="db__toast"><Mark size={20} /><div><b>{d.newBooking}</b><span>{d.source}</span></div></div>
        </main>
      </div>
    </div>
  )
}
