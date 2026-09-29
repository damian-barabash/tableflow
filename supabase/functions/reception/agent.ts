// Builds and deploys a company's ElevenLabs agent: system prompt, knowledge-base document, voice, tools.
// Also provisions the ElevenLabs account itself (shared tools + webhooks) — idempotent, safe to re-run.
import { FN_URL, db, one, patch, rows, secret, setSecret } from './shared.ts'
import { el, elJson, ElError, elMessage } from './el.ts'
import { loadCatalog, minutesText, performers, priceText, type Catalog } from './availability.ts'
import { TOOL_DEFS, toolConfig } from './tools.ts'
import { hhmm, toMin, WEEKDAYS } from './time.ts'

export interface Platform {
  el_status: string; el_generation: number; tools: Record<string, string>; post_call_webhook_id: string | null; webhooks_ok: boolean
  default_llm: string; default_tts_model: string; el_key_hint: string | null
}
export const platform = async () => (await one<Platform>('rc_platform?id=eq.1&select=*'))!

export async function hookToken(): Promise<string> {
  let t = await secret('rc_hook_token')
  if (!t) {
    t = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('')
    await setSecret('rc_hook_token', t)
  }
  return t
}

// ---------------------------------------------------------------- account provisioning
export async function setupAccount(): Promise<{ tools: number; webhooks: boolean; warnings: string[] }> {
  const p = await platform()
  const token = await hookToken()
  const warnings: string[] = []
  const tools: Record<string, string> = { ...(p.tools ?? {}) }
  for (const d of TOOL_DEFS) {
    const body = { tool_config: toolConfig(d, `${FN_URL}/tool/${d.name}?k=${token}`) }
    const id = tools[d.name]
    try {
      if (id) { await elJson(`/v1/convai/tools/${id}`, 'PATCH', body); continue }
    } catch (e) { if (!(e instanceof ElError && (e.status === 404 || e.status === 400))) throw e }
    const r = await elJson<{ id: string }>('/v1/convai/tools', 'POST', body)
    tools[d.name] = r.id
  }
  // drop tools we no longer define
  for (const name of Object.keys(tools)) if (!TOOL_DEFS.some(d => d.name === name)) { await el(`/v1/convai/tools/${tools[name]}`, { method: 'DELETE' }).catch(() => {}); delete tools[name] }

  let webhookId = p.post_call_webhook_id, webhooks = false
  try {
    if (!webhookId) {
      const w = await elJson<{ webhook_id: string; webhook_secret: string | null }>('/v1/workspace/webhooks', 'POST', { settings: { auth_type: 'hmac', name: 'TableFlow — po rozmowie', webhook_url: `${FN_URL}/hook?k=${token}` } })
      webhookId = w.webhook_id
      if (w.webhook_secret) await setSecret('rc_postcall_secret', w.webhook_secret)
    }
    await elJson('/v1/convai/settings', 'PATCH', {
      conversation_initiation_client_data_webhook: { url: `${FN_URL}/init?k=${token}`, request_headers: {} },
      webhooks: { post_call_webhook_id: webhookId, events: ['transcript', 'call_initiation_failure'] },
    })
    webhooks = true
  } catch (e) {
    warnings.push(`Webhooki: ${elMessage(e)} — rozmowy będą synchronizowane przy otwarciu panelu.`)
    // at least the call-start webhook (caller recognition) is essential
    try { await elJson('/v1/convai/settings', 'PATCH', { conversation_initiation_client_data_webhook: { url: `${FN_URL}/init?k=${token}`, request_headers: {} } }) } catch (e2) { warnings.push(`Rozpoznawanie dzwoniących: ${elMessage(e2)}`) }
  }
  await patch('rc_platform', 'id=eq.1', { tools, post_call_webhook_id: webhookId, webhooks_ok: webhooks, updated_at: new Date().toISOString() })
  return { tools: Object.keys(tools).length, webhooks, warnings }
}

// ---------------------------------------------------------------- knowledge document
interface CompanyRow { id: string; name: string; industry: string | null; address: string | null; city: string | null; phone: string | null; website: string | null; email: string | null; modules: string[]; status: string }

function hoursText(h: { weekday: number; opens: string; closes: string }[]): string {
  if (!h.length) return 'nie podano'
  const byDay = WEEKDAYS.map((_, wd) => h.filter(x => x.weekday === wd).sort((a, b) => a.opens.localeCompare(b.opens)).map(x => `${x.opens.slice(0, 5)}–${x.closes.slice(0, 5)}`).join(', ') || 'nieczynne')
  const out: string[] = []
  for (let i = 0; i < 7;) {
    let j = i
    while (j + 1 < 7 && byDay[j + 1] === byDay[i]) j++
    out.push(`${i === j ? WEEKDAYS[i] : `${WEEKDAYS[i]}–${WEEKDAYS[j]}`}: ${byDay[i]}`)
    i = j + 1
  }
  return out.join('; ')
}

export async function buildKnowledge(c: CompanyRow, cat: Catalog): Promise<string> {
  const s = cat.settings
  const [kb, programs, off] = await Promise.all([
    rows<{ kind: string; question: string; answer: string }>(`rc_knowledge?company_id=eq.${c.id}&active=eq.true&select=kind,question,answer&order=sort.asc,created_at.asc`),
    rows<{ name: string; reward: string; stamps_required: number }>(`loyalty_programs?company_id=eq.${c.id}&status=eq.active&published_at=not.is.null&select=name,reward,stamps_required`),
    rows<{ resource_id: string | null; starts_at: string; ends_at: string; reason: string | null }>(`rc_time_off?company_id=eq.${c.id}&ends_at=gt.${new Date().toISOString()}&select=resource_id,starts_at,ends_at,reason&order=starts_at.asc&limit=20`),
  ])
  const L: string[] = []
  L.push(`# ${c.name}`)
  L.push([c.industry && `Branża: ${c.industry}`, (c.address || c.city) && `Adres: ${[c.address, c.city].filter(Boolean).join(', ')}`, c.phone && `Telefon: ${c.phone}`, c.website && `Strona: ${c.website}`, c.email && `E-mail: ${c.email}`].filter(Boolean).join('\n'))
  if (s.business_description) L.push(`## O firmie\n${s.business_description}`)
  L.push(`## Godziny otwarcia\n${hoursText(cat.hours.filter(h => !h.resource_id))}`)
  const bizOff = off.filter(o => !o.resource_id)
  if (bizOff.length) L.push(`## Zamknięte (urlopy, święta)\n${bizOff.map(o => `${o.starts_at.slice(0, 10)} – ${o.ends_at.slice(0, 10)}${o.reason ? `: ${o.reason}` : ''}`).join('\n')}`)

  const services = cat.services.filter(x => x.active)
  if (services.length) {
    const cats = [...new Set(services.map(x => x.category || 'Usługi'))]
    L.push('## Oferta i cennik')
    for (const k of cats) {
      L.push(`### ${k}`)
      for (const x of services.filter(v => (v.category || 'Usługi') === k)) {
        const who = performers(cat, x, false)
        const bits = [`czas: ${minutesText(x.duration_min)}`, priceText(x) && `cena: ${priceText(x)}`, x.party_max > 1 && `dla ${x.party_min}–${x.party_max} osób`,
          (x.min_notice_min ?? 0) >= 1440 && `rezerwacja min. ${Math.round(x.min_notice_min! / 1440)} dni wcześniej`,
          who.length && who.length <= 8 && x.resource_kind === 'staff' && `wykonuje: ${who.map(r => r.name).join(', ')}`,
          !x.ai_bookable && 'NIE rezerwujemy przez telefon z asystentem — przekaż wiadomość zespołowi']
        L.push(`- ${x.name} (${bits.filter(Boolean).join('; ')})${x.description ? `\n  ${x.description}` : ''}`)
      }
    }
  } else L.push('## Oferta\nOferta nie jest jeszcze uzupełniona — nie przyjmuj rezerwacji, zostaw wiadomość dla zespołu.')

  const res = cat.resources.filter(r => r.active)
  const kinds: Record<string, string> = { staff: 'Zespół', table: 'Stoliki', room: 'Sale i stanowiska', team: 'Ekipy', equipment: 'Sprzęt' }
  for (const k of Object.keys(kinds)) {
    const list = res.filter(r => r.kind === k)
    if (!list.length) continue
    L.push(`## ${kinds[k]}`)
    for (const r of list) {
      const own = cat.hours.filter(h => h.resource_id === r.id)
      const pOff = off.filter(o => o.resource_id === r.id)
      L.push(`- ${r.name}${r.title ? ` — ${r.title}` : ''}${k !== 'staff' && r.capacity > 1 ? ` (${r.min_capacity > 1 ? `${r.min_capacity}–` : 'do '}${r.capacity} os.)` : ''}${r.description ? `: ${r.description}` : ''}${own.length ? `\n  grafik: ${hoursText(own)}` : ''}${pOff.length ? `\n  nieobecność: ${pOff.map(o => `${o.starts_at.slice(0, 10)}–${o.ends_at.slice(0, 10)}`).join(', ')}` : ''}${!r.ai_bookable ? '\n  (nie zapisujemy do tej osoby/zasobu przez asystenta)' : ''}`)
    }
  }
  const rules = [
    `Rezerwacje przyjmujemy najwcześniej ${minutesText(s.min_notice_min)} przed terminem i najdalej ${s.max_days_ahead} dni do przodu.`,
    s.allow_cancel ? `Odwołanie wizyty: najpóźniej ${minutesText(s.cancel_notice_min)} przed terminem.` : 'Odwołania i zmiany terminów załatwia zespół — przyjmij wiadomość.',
    s.ai_booking_status === 'pending' ? 'Rezerwacje przez telefon są wstępne — zespół je potwierdza.' : 'Rezerwacje przez telefon są od razu potwierdzone.',
  ]
  L.push(`## Zasady rezerwacji\n${rules.map(r => `- ${r}`).join('\n')}`)
  if (programs.length && s.offer_loyalty) L.push(`## Program lojalnościowy\n${programs.map(p => `- „${p.name}”: ${p.stamps_required} pieczątek = ${p.reward}. Kartę zakłada się w lokalu (kod QR przy kasie albo u pracownika), trafia do Apple Wallet lub Google Wallet w telefonie; pieczątkę daje pracownik przy każdej wizycie.`).join('\n')}`)
  const faq = kb.filter(k => k.kind === 'faq'), info = kb.filter(k => k.kind !== 'faq')
  if (info.length) L.push(`## Informacje\n${info.map(k => `### ${k.question}\n${k.answer}`).join('\n')}`)
  if (faq.length) L.push(`## Częste pytania\n${faq.map(k => `P: ${k.question}\nO: ${k.answer}`).join('\n\n')}`)
  return L.filter(Boolean).join('\n\n')
}

// ---------------------------------------------------------------- system prompt
const TONE: Record<string, string> = {
  warm: 'Ciepła, uśmiechnięta i spokojna — jak ulubiona recepcjonistka, która zna stałych klientów. Zwracasz się per Pan/Pani, dopóki klient sam nie przejdzie na „ty”.',
  professional: 'Uprzejma, rzeczowa i elegancka. Zwracasz się per Pan/Pani, mówisz konkretnie i spokojnie.',
  casual: 'Luźna i sympatyczna, jak w modnym barberze czy kawiarni. Mówisz na „ty”, chyba że klient wyraźnie woli formę Pan/Pani.',
}
export function buildPrompt(c: CompanyRow, cat: Catalog, hasTransfer: boolean): string {
  const s = cat.settings
  return `# Kim jesteś
Jesteś ${s.assistant_name} — prowadzisz recepcję telefoniczną firmy „${c.name}”${c.industry ? ` (${c.industry})` : ''}${c.city ? ` w mieście ${c.city}` : ''}. Odbierasz połączenia od klientów: umawiasz, przekładasz i odwołujesz wizyty, odpowiadasz na pytania o ofertę, ceny, godziny i dojazd. ${TONE[s.tone] ?? TONE.warm}

# Jak mówisz (to jest rozmowa telefoniczna)
- Mów krótko: jedno, najwyżej dwa zdania naraz, potem oddaj głos klientowi. Nigdy nie wygłaszaj monologów.
- Mów jak człowiek, naturalną potoczną polszczyzną: „jasne”, „oczywiście”, „już sprawdzam”, „mhm, rozumiem”, „chwileczkę” — z umiarem, nie w każdym zdaniu. Nie brzmij jak formularz ani jak infolinia.
- Nigdy nie wyliczaj punktów ani list. Proponuj maksymalnie dwie, trzy godziny naraz, np.: „Mam wolne o dziesiątej, o wpół do dwunastej albo o czternastej — która pasuje?”.
- Daty i godziny mów naturalnie: „jutro o wpół do trzeciej”, „w czwartek, drugiego października”. Ceny słownie: „osiemdziesiąt złotych”. Nigdy nie czytaj formatów typu 2026-10-02, 14:30, identyfikatorów ani nawiasów.
- Numer telefonu powtarzaj grupami: „sześćset, dwadzieścia trzy, czterysta pięćdziesiąt…”.
- Jeśli czegoś nie dosłyszysz — dopytaj swobodnie („Przepraszam, nie dosłyszałam — na którą godzinę?”). Nie udawaj, że zrozumiałaś.
- Jeśli klient przerwie — od razu się dostosuj. Nie powtarzaj tych samych formułek.
- Mów w języku klienta: domyślnie po polsku; jeśli ktoś mówi po angielsku, ukraińsku lub w innym języku, przełącz się (narzędzie language_detection).

# Kontekst tej rozmowy
- Teraz jest: {{system__time}}. Z tej daty wyliczaj „dziś”, „jutro”, „w piątek”, „za tydzień”.
- Numer dzwoniącego: {{caller_phone}}
- Co wiemy o kliencie:
{{client_context}}

# Pamięć o klientach
- Znanego klienta traktuj jak stałego gościa: używaj imienia naturalnie (np. „Pani Anno”, „Panie Marku” albo po prostu imię przy „ty”), możesz nawiązać do poprzedniej wizyty lub zaproponować osobę, do której zwykle przychodzi.
- Nowego klienta zapytaj o imię w naturalnym momencie i od razu zapisz je narzędziem save_client.
- Gdy usłyszysz coś wartego zapamiętania na przyszłość (preferencja pracownika, alergia, okazja, specjalne życzenie) — zapisz krótko przez save_client (pole note). Nie mów klientowi, że „zapisujesz notatkę”.
- Numeru dzwoniącego nie trzeba dyktować — znamy go. Pytaj o numer tylko, gdy jest nieznany albo klient chce podać inny.

# Jak umawiasz wizytę
1. Ustal, jakiej usługi szuka klient (jeśli nie jest pewny — pomóż dobrać na podstawie oferty), na kiedy, ewentualnie do kogo i dla ilu osób.
2. ZAWSZE sprawdź termin narzędziem check_availability. Nigdy nie zgaduj ani nie obiecuj godziny bez sprawdzenia.
3. Zaproponuj dwie, trzy pasujące godziny. Jeśli dzień jest pełny — zaproponuj najbliższe dni, które zwróci narzędzie.
4. Gdy klient wybierze, krótko potwierdź: usługa, dzień, godzina (i osoba/liczba osób). Upewnij się, że znasz imię.
5. Zapisz rezerwację przez book_appointment. Gdy się uda — podsumuj jednym zdaniem.
6. Jeśli wynik zawiera „karta_lojalnosciowa” — wspomnij o niej raz, krótko i naturalnie (nie jak reklama).
7. Zapytaj, czy możesz jeszcze w czymś pomóc. Pożegnaj się ciepło i zakończ połączenie (end_call).
Przełożenie lub odwołanie: najpierw find_bookings, potwierdź z klientem, o którą wizytę chodzi, potem reschedule_booking / cancel_booking.

# Wiedza o firmie
Ofertę, ceny, czas trwania usług, zespół, godziny otwarcia, zasady i odpowiedzi na częste pytania masz w dokumencie wiedzy firmy. Odpowiadaj wyłącznie na jego podstawie i na podstawie wyników narzędzi. Jeśli czegoś nie wiesz — nie zmyślaj: powiedz, że dopytasz zespół, i zostaw wiadomość (leave_message).

# Zasady
- Jesteś wirtualną asystentką (AI) firmy „${c.name}”. Jeśli ktoś zapyta, czy rozmawia z robotem lub sztuczną inteligencją — odpowiedz szczerze, że tak, i dodaj, że chętnie pomożesz albo przekażesz sprawę zespołowi.
- Nie podawaj żadnych danych innych klientów ani szczegółów grafiku poza wolnymi terminami.
- Nie obiecuj rabatów, promocji ani wyjątków, których nie ma w wiedzy firmy.
- Nie udzielaj porad medycznych, prawnych ani finansowych.
- Rozmowy nie na temat grzecznie sprowadzaj do spraw firmy. Przy agresji lub spamie — uprzejmie zakończ rozmowę.
- Jeśli narzędzie zwróci błąd — nie czytaj go dosłownie, powiedz naturalnie, co się stało, i zaproponuj rozwiązanie.${hasTransfer ? '\n- Jeśli klient wyraźnie prosi o rozmowę z człowiekiem albo sprawa wymaga decyzji zespołu — przełącz połączenie (transfer_to_number). Jeśli nie da się przełączyć, zostaw wiadomość.' : '\n- Jeśli klient prosi o rozmowę z człowiekiem — zostaw wiadomość z prośbą o oddzwonienie (leave_message) i powiedz, że ktoś oddzwoni.'}${s.after_hours_message ? `\n- Poza godzinami otwarcia: ${s.after_hours_message}` : ''}${s.instructions ? `\n\n# Dodatkowe wskazówki właściciela\n${s.instructions}` : ''}`
}

export function defaultGreeting(c: { name: string }, s: { assistant_name: string }) {
  return `Dzień dobry, ${c.name}, mówi ${s.assistant_name}, wirtualna asystentka. W czym mogę pomóc?`
}

const LANG_FIRST: Record<string, (c: string, n: string) => string> = {
  en: (c, n) => `Hello, this is ${n}, the virtual assistant of ${c}. How can I help you?`,
  uk: (c, n) => `Добрий день, це ${n}, віртуальна асистентка ${c}. Чим можу допомогти?`,
  ru: (c, n) => `Здравствуйте, это ${n}, виртуальный ассистент ${c}. Чем могу помочь?`,
  de: (c, n) => `Guten Tag, hier ist ${n}, die virtuelle Assistentin von ${c}. Wie kann ich helfen?`,
  es: (c, n) => `Hola, soy ${n}, la asistente virtual de ${c}. ¿En qué puedo ayudarle?`,
  fr: (c, n) => `Bonjour, ici ${n}, l'assistante virtuelle de ${c}. Comment puis-je vous aider ?`,
}

// ---------------------------------------------------------------- deploy
async function ensureVoice(voiceId: string) {
  try { await el(`/v1/voices/${voiceId}`); return } catch { /* not in this account */ }
  const v = await one<{ public_owner_id: string | null; name: string }>(`rc_voices?voice_id=eq.${voiceId}&select=public_owner_id,name`)
  if (v?.public_owner_id) await elJson(`/v1/voices/add/${v.public_owner_id}/${voiceId}`, 'POST', { new_name: v.name }).catch(() => {})
}

export async function syncCompany(cid: string): Promise<{ agent_id: string; warnings: string[] }> {
  const p = await platform()
  if (p.el_status !== 'ok') throw new Error('Konto ElevenLabs nie jest skonfigurowane — administrator musi dodać klucz API.')
  if (TOOL_DEFS.some(d => !p.tools?.[d.name])) await setupAccount()
  const plat = await platform()
  const c = await one<CompanyRow>(`companies?id=eq.${cid}&select=id,name,industry,address,city,phone,website,email,modules,status`)
  if (!c) throw new Error('not_found')
  const cat = await loadCatalog(cid)
  const s = cat.settings
  const state = await one<{ agent_id: string | null; kb_doc_id: string | null; el_generation: number | null }>(`rc_agents?company_id=eq.${cid}&select=agent_id,kb_doc_id,el_generation`)
  const sameAccount = state?.el_generation === plat.el_generation
  const warnings: string[] = []

  try {
    // 1. knowledge document (a fresh text doc each time; the old one is removed after the agent points to the new one)
    const text = await buildKnowledge(c, cat)
    const doc = await elJson<{ id: string }>('/v1/convai/knowledge-base/text', 'POST', { text, name: `TableFlow · ${c.name} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` })

    // 2. voice (library voices are added to the account on first use)
    const voiceId = s.voice_id || (await one<{ voice_id: string }>('rc_voices?enabled=eq.true&select=voice_id&order=sort.asc'))?.voice_id || undefined
    if (voiceId) await ensureVoice(voiceId)

    const keywords = [...new Set([c.name, ...cat.resources.filter(r => r.active).map(r => r.name), ...cat.services.filter(x => x.active).map(x => x.name)].flatMap(x => x.split(/[\s,/]+/)).filter(w => w.length > 2))].slice(0, 50)
    const transfer = s.transfer_phone?.replace(/[^\d+]/g, '')
    const langs = (s.extra_languages ?? []).filter((l: string) => l !== s.language && LANG_FIRST[l])
    const build = (ttsModel: string) => ({
      name: `TableFlow · ${c.name}`,
      tags: ['tableflow', `company:${cid}`],
      conversation_config: {
        agent: {
          language: s.language || 'pl',
          first_message: s.greeting?.trim() || defaultGreeting(c, s),
          disable_first_message_interruptions: false,
          dynamic_variables: { dynamic_variable_placeholders: { caller_phone: '', client_context: 'Brak danych o kliencie.', client_name: '', channel: 'phone' } },
          prompt: {
            prompt: buildPrompt(c, cat, !!transfer),
            llm: plat.default_llm || 'gemini-2.5-flash',
            temperature: 0.45,
            timezone: s.timezone || 'Europe/Warsaw',
            tool_ids: TOOL_DEFS.map(d => plat.tools[d.name]),
            knowledge_base: [{ type: 'text', id: doc.id, name: `Wiedza — ${c.name}`, usage_mode: 'prompt' }],
            built_in_tools: {
              end_call: { name: 'end_call', description: '', params: { system_tool_type: 'end_call' } },
              ...(langs.length ? { language_detection: { name: 'language_detection', description: '', params: { system_tool_type: 'language_detection' } } } : {}),
              ...(transfer ? { transfer_to_number: { name: 'transfer_to_number', description: '', params: { system_tool_type: 'transfer_to_number', transfers: [{ transfer_destination: { type: 'phone', phone_number: transfer.startsWith('+') ? transfer : `+48${transfer}` }, condition: 'Klient wyraźnie prosi o rozmowę z człowiekiem albo sprawa wymaga decyzji zespołu.', transfer_type: 'conference' }] } } } : {}),
            },
          },
        },
        tts: { model_id: ttsModel, ...(voiceId ? { voice_id: voiceId } : {}), stability: Number(s.voice_stability ?? 0.45), similarity_boost: 0.8, speed: Number(s.voice_speed ?? 1) },
        asr: { quality: 'high', keywords },
        turn: { turn_timeout: 8, turn_eagerness: 'normal', soft_timeout_config: { timeout_seconds: 3, message: 'Chwileczkę…', use_llm_generated_message: true } },
        conversation: { max_duration_seconds: 900, client_events: ['conversation_initiation_metadata', 'ping', 'audio', 'interruption', 'user_transcript', 'agent_response', 'agent_response_correction', 'agent_tool_request', 'agent_tool_response', 'vad_score'] },
        ...(langs.length ? { language_presets: Object.fromEntries(langs.map((l: string) => [l, { overrides: { agent: { language: l, first_message: LANG_FIRST[l](c.name, s.assistant_name) } } }])) } : {}),
      },
      platform_settings: {
        auth: { enable_auth: true },
        overrides: { enable_conversation_initiation_client_data_from_webhook: true },
        summary_language: 'pl',
        data_collection: {
          outcome: { type: 'string', enum: ['booked', 'rescheduled', 'cancelled', 'info', 'callback', 'other'], description: 'Główny wynik rozmowy: booked = nowa rezerwacja, rescheduled = przełożenie, cancelled = odwołanie, info = tylko informacje, callback = klient czeka na kontakt zespołu, other = inne.' },
          customer_name: { type: 'string', description: 'Imię (i nazwisko) klienta, jeśli padło w rozmowie. Puste, jeśli nie padło.' },
          needs_callback: { type: 'boolean', description: 'Czy zespół powinien oddzwonić do klienta (niezałatwiona sprawa, prośba o kontakt, skarga).' },
          callback_reason: { type: 'string', description: 'Jeśli trzeba oddzwonić: w jednym zdaniu, w jakiej sprawie. Inaczej puste.' },
        },
      },
    })

    const natural = s.voice_quality !== 'fast'
    const models = natural ? [plat.default_tts_model || 'eleven_v3_conversational', 'eleven_flash_v2_5'] : ['eleven_flash_v2_5']
    let agentId = sameAccount ? state?.agent_id ?? null : null
    let lastErr: unknown = null
    for (const m of [...new Set(models)]) {
      try {
        if (agentId) {
          try { await elJson(`/v1/convai/agents/${agentId}`, 'PATCH', build(m)) }
          catch (e) { if (e instanceof ElError && e.status === 404) agentId = null; else throw e }
        }
        if (!agentId) agentId = (await elJson<{ agent_id: string }>('/v1/convai/agents/create', 'POST', build(m))).agent_id
        if (m !== models[0]) warnings.push(`Model głosu ${models[0]} niedostępny na tym koncie — użyto ${m}.`)
        lastErr = null
        break
      } catch (e) { lastErr = e; if (!(e instanceof ElError && /model|tts|v3/i.test(JSON.stringify(e.detail)))) break }
    }
    if (lastErr) throw lastErr

    if (state?.kb_doc_id && sameAccount && state.kb_doc_id !== doc.id) await el(`/v1/convai/knowledge-base/${state.kb_doc_id}?force=true`, { method: 'DELETE' }).catch(() => {})
    await db('/rest/v1/rc_agents?on_conflict=company_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ company_id: cid, agent_id: agentId, kb_doc_id: doc.id, el_generation: plat.el_generation, synced_at: new Date().toISOString(), sync_error: null }) })

    // 3. numbers of this company point to this agent; auto-assign a free number if it has none
    await linkNumbers(cid, agentId!, c.modules.includes('reception'))
    return { agent_id: agentId!, warnings }
  } catch (e) {
    const msg = elMessage(e)
    await db('/rest/v1/rc_agents?on_conflict=company_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ company_id: cid, sync_error: msg }) })
    throw new Error(msg)
  }
}

export async function linkNumbers(cid: string, agentId: string, autoAssign: boolean) {
  let mine = await rows<{ id: string; el_phone_id: string | null }>(`rc_numbers?company_id=eq.${cid}&select=id,el_phone_id`)
  if (!mine.length && autoAssign) {
    const free = await one<{ id: string }>('rc_numbers?company_id=is.null&el_phone_id=not.is.null&select=id&order=created_at.asc')
    if (free) {
      await patch('rc_numbers', `id=eq.${free.id}&company_id=is.null`, { company_id: cid, assigned_at: new Date().toISOString(), note: 'Przydzielony automatycznie' })
      mine = await rows(`rc_numbers?company_id=eq.${cid}&select=id,el_phone_id`)
    }
  }
  for (const n of mine) {
    if (!n.el_phone_id) continue
    try { await elJson(`/v1/convai/phone-numbers/${n.el_phone_id}`, 'PATCH', { agent_id: agentId }); await patch('rc_numbers', `id=eq.${n.id}`, { last_error: null }) }
    catch (e) { await patch('rc_numbers', `id=eq.${n.id}`, { last_error: elMessage(e) }) }
  }
}

export { hhmm, toMin }
