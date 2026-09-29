import { useEffect, useRef, useState } from 'react'
import { errText } from '../../app/api'
import { Field, Ic, Panel, Spinner, useToast } from '../../app/ui'
import { usePanel } from '../PanelApp'
import { TOOL_LABEL, reception } from './model'

type Line = { id: number; kind: 'agent' | 'user' | 'tool'; text: string; state?: 'live' | 'ok' | 'err' }
type Conv = { endSession: () => Promise<void>; getId: () => string; getInputVolume: () => number; getOutputVolume: () => number }

/**
 * Talk to the company's assistant in the browser (microphone) — same agent, same tools, same memory as a
 * real phone call. Used while no phone number is connected ("tryb testowy") and for trying changes.
 */
export function TestCall({ onEnded, compact }: { onEnded?: (conversationId: string | null) => void; compact?: boolean }) {
  const { company } = usePanel()
  const toast = useToast()
  const [state, setState] = useState<'idle' | 'connecting' | 'live' | 'ending'>('idle')
  const [mode, setMode] = useState<'listening' | 'speaking'>('listening')
  const [lines, setLines] = useState<Line[]>([])
  const [phone, setPhone] = useState('')
  const conv = useRef<Conv | null>(null)
  const orb = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const convId = useRef<string | null>(null)
  const seq = useRef(0)
  const push = (l: Omit<Line, 'id'>) => setLines(v => [...v, { ...l, id: ++seq.current }])

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }) }, [lines])
  useEffect(() => () => { void conv.current?.endSession().catch(() => {}) }, [])
  // orb reacts to the voices
  useEffect(() => {
    if (state !== 'live') return
    let raf = 0
    const tick = () => {
      const c = conv.current
      if (c) {
        const v = Math.min(1, Math.max(c.getOutputVolume(), c.getInputVolume() * .7))
        if (orb.current) orb.current.style.transform = `scale(${1 + v * .22})`
        if (ring.current) { ring.current.style.transform = `scale(${1 + v * .5})`; ring.current.style.opacity = String(.25 + v) }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state])

  const start = async () => {
    setState('connecting'); setLines([]); convId.current = null
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()))
    } catch { toast('Zezwól przeglądarce na użycie mikrofonu, aby porozmawiać z asystentem.', 'err'); setState('idle'); return }
    try {
      const [{ Conversation }, sess] = await Promise.all([
        import('@elevenlabs/client'),
        reception<{ signed_url: string; dynamic_variables: Record<string, string> }>('test_session', { company_id: company.id, caller_phone: phone || null }),
      ])
      const c = await Conversation.startSession({
        signedUrl: sess.signed_url,
        dynamicVariables: { ...sess.dynamic_variables, channel: 'test' },
        onConnect: ({ conversationId }) => { convId.current = conversationId; setState('live'); void reception('test_started', { company_id: company.id, conversation_id: conversationId, caller_phone: phone || null }).catch(() => {}) },
        onMessage: ({ message, role }) => { if (message) push({ kind: role === 'agent' ? 'agent' : 'user', text: message }) },
        onModeChange: ({ mode: m }) => setMode(m === 'speaking' ? 'speaking' : 'listening'),
        onAgentToolRequest: (t) => push({ kind: 'tool', text: t.tool_name, state: 'live' }),
        onAgentToolResponse: (t) => setLines(v => { const i = [...v].reverse().findIndex(l => l.kind === 'tool' && l.text === t.tool_name && l.state === 'live'); if (i < 0) return v; const idx = v.length - 1 - i; const n = [...v]; n[idx] = { ...n[idx], state: t.is_error ? 'err' : 'ok' }; return n }),
        onError: (m) => toast(`Asystent: ${m}`, 'err'),
        onDisconnect: () => { conv.current = null; setState('idle'); const id = convId.current; setTimeout(() => onEnded?.(id), 400) },
      }) as unknown as Conv
      conv.current = c
    } catch (e) { toast(errText(e), 'err'); setState('idle') }
  }
  const stop = async () => { setState('ending'); await conv.current?.endSession().catch(() => {}); conv.current = null; setState('idle') }

  const stage = (
    <div className="rc-test__stage mesh g">
      <span className="mesh__b" /><span className="mesh__g" />
      <div className={`rc-orb ${state === 'live' ? (mode === 'speaking' ? 'is-speaking' : '') : 'is-idle'}`}>
        <div className="rc-orb__ring" ref={ring} style={{ opacity: state === 'live' ? .5 : 0 }} />
        <div className="rc-orb__core" ref={orb} />
      </div>
      <div>
        <h3>{state === 'live' ? (mode === 'speaking' ? 'Asystent mówi…' : 'Słucham…') : state === 'connecting' ? 'Łączę…' : 'Rozmowa testowa'}</h3>
        <p>{state === 'live' ? 'Mów normalnie, jak klient przez telefon. Możesz przerywać.' : 'Ten sam asystent, kalendarz i pamięć klientów co przy prawdziwym połączeniu. Rezerwacje z testu są oznaczone „TEST”.'}</p>
      </div>
      <div className="rc-test__btns">
        {state === 'live' || state === 'ending'
          ? <button className="rc-test__call is-end" onClick={stop} disabled={state === 'ending'}><Ic.phone width={18} height={18} /> Zakończ</button>
          : <button className="rc-test__call" onClick={start} disabled={state === 'connecting'}>{state === 'connecting' ? <Spinner size={16} /> : <Ic.mic width={18} height={18} />} {state === 'connecting' ? 'Łączę…' : 'Porozmawiaj z asystentem'}</button>}
      </div>
    </div>
  )
  if (compact) return stage
  return (
    <div className="rc-test">
      <div className="ap-stack" style={{ gap: 12 }}>
        {stage}
        <Field label="Udawaj, że dzwonisz z numeru" hint="Opcjonalnie — wpisz numer klienta z bazy, żeby sprawdzić, czy asystent go rozpozna i pamięta historię.">
          <input className="input" inputMode="tel" placeholder="np. 600 123 456" value={phone} disabled={state !== 'idle'} onChange={e => setPhone(e.target.value)} />
        </Field>
      </div>
      <Panel title="Przebieg rozmowy" sub="Na żywo — z tym, co asystent robi w kalendarzu.">
        <div className="rc-test__log">
          {!lines.length ? <div className="rc-test__empty"><div><Ic.msg width={28} height={28} style={{ margin: '0 auto 10px', display: 'block', opacity: .4 }} />Tu pojawi się transkrypcja.<br />Spróbuj: „Chciałbym się umówić na jutro po południu”.</div></div> : (
            <div className="rc-tx" ref={log}>{lines.map(l => l.kind === 'tool'
              ? <span key={l.id} className={`rc-toolchip ${l.state === 'live' ? 'is-live' : ''} ${l.state === 'err' ? 'is-err' : ''}`}>{l.state === 'live' ? <Spinner size={11} /> : l.state === 'err' ? '!' : <Ic.check width={12} height={12} />} {TOOL_LABEL[l.text] ?? l.text}</span>
              : <div key={l.id} className={`rc-bubble is-${l.kind}`}>{l.text}</div>)}
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
