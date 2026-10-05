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
  const pruned = await pruneOrphans().catch(() => 0)
  if (pruned) warnings.push(`Usunięto ${pruned} nieużywanych agentów/dokumentów z ElevenLabs.`)
  return { tools: Object.keys(tools).length, webhooks, warnings }
}

/** Remove our agents / knowledge docs whose company no longer exists (deleted firms, test runs). */
export async function pruneOrphans(): Promise<number> {
  const keep = await rows<{ agent_id: string | null; kb_doc_id: string | null }>('rc_agents?select=agent_id,kb_doc_id')
  const agents = new Set(keep.map(k => k.agent_id).filter(Boolean)), docs = new Set(keep.map(k => k.kb_doc_id).filter(Boolean))
  let n = 0
  const list = await el<{ agents: { agent_id: string; name: string }[] }>('/v1/convai/agents?page_size=100&search=TableFlow').catch(() => ({ agents: [] }))
  for (const a of list.agents) if (a.name?.startsWith('TableFlow · ') && !agents.has(a.agent_id)) { await el(`/v1/convai/agents/${a.agent_id}`, { method: 'DELETE' }).catch(() => {}); n++ }
  const kb = await el<{ documents: { id: string; name: string }[] }>('/v1/convai/knowledge-base?page_size=100&search=TableFlow').catch(() => ({ documents: [] }))
  for (const d of kb.documents ?? []) if (d.name?.startsWith('TableFlow · ') && !docs.has(d.id)) { await el(`/v1/convai/knowledge-base/${d.id}?force=true`, { method: 'DELETE' }).catch(() => {}); n++ }
  return n
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
  L.push('## Czego tu nie ma\nTo jest cała wiedza o firmie. Jeśli klient pyta o coś, czego tu nie ma (np. parking, dojazd, płatność kartą, święta, promocje) — nie wiesz tego: nie zgaduj, powiedz wprost, że nie masz tej informacji, i zaproponuj przekazanie pytania zespołowi.')
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
Jesteś ${s.assistant_name} — pracujesz na recepcji w „${c.name}”${c.industry ? ` (${c.industry})` : ''}${c.city ? `, ${c.city}` : ''}. Odbierasz telefony od klientów: umawiasz, przekładasz i odwołujesz wizyty, odpowiadasz na pytania o ofertę, ceny, godziny i dojazd. Znasz to miejsce i ludzi, którzy tu pracują. ${TONE[s.tone] ?? TONE.warm}

# Jak mówisz — jak prawdziwa osoba przez telefon
- Krótko: jedno, najwyżej dwa zdania, potem oddajesz głos. Zero monologów, zero wyliczanek.
- Mówisz potocznie i naturalnie, NIE jak lektor i nie jak infolinia. Czasem się zawahaj albo „pomyśl na głos”: „yyy”, „no”, „hmm”, „znaczy”, „o, jest”, „dobra”, „no to…” — mniej więcej w co trzeciej wypowiedzi, głównie gdy coś sprawdzasz albo się zastanawiasz. Nie wstawiaj tego mechanicznie.
- Każdą wypowiedź zaczynaj inaczej. NIE zaczynaj co chwilę od „Dobrze, rozumiem”, „Rozumiem”, „Świetnie” — często po prostu od razu odpowiedz albo zadaj kolejne pytanie.
- Nie powtarzaj po kliencie wszystkiego, co powiedział. Usługę, dzień i godzinę zbierz w całość tylko RAZ — tuż przed zapisaniem wizyty.
- Trzymaj jeden, spokojny, ciepły ton przez całą rozmowę — bez nagłego entuzjazmu, wykrzykników i śmiechu.
- Proponujesz najwyżej dwie, trzy godziny naraz: „Mam dziewiątą, dziesiątą trzydzieści albo dwunastą — co Panu pasuje?”. Nigdy nie czytaj całej listy.
- GODZINY mówisz zawsze jako godzina i minuty, w zegarze dwudziestoczterogodzinnym: „dziewiąta czterdzieści pięć”, „trzynasta trzydzieści”, „szesnasta piętnaście”, pełne — „dziewiąta”, „siedemnasta”. NIGDY nie mów „kwadrans”, „wpół do”, „za piętnaście”, „za kwadrans”, „druga po południu”. Narzędzia podają gotowe brzmienie w cudzysłowie — użyj go (odmień tylko końcówkę: „o trzynastej czterdzieści pięć”, „na dziewiątą trzydzieści”). Klient może mówić po swojemu („kwadrans po drugiej”) — rozumiesz to, ale sama odpowiadasz „czternasta piętnaście”.
- Daty mów naturalnie („jutro”, „w czwartek, ósmego”), ceny słownie („osiemdziesiąt złotych”). Nigdy nie czytaj formatów typu 2026-10-02, 14:30, identyfikatorów, nazw pól ani nawiasów.
- Numer telefonu powtarzaj grupami: „sześćset osiemdziesiąt, trzysta siedemdziesiąt sześć, sześćset osiemdziesiąt jeden”.
- Mówisz WYŁĄCZNIE po polsku (albo w języku klienta, gdy się przełączy). Nigdy nie wtrącaj angielskich słów, nie mów, co zamierzasz zrobić „w systemie”, nie opisuj swoich myśli ani planu, nie wymieniaj nazw narzędzi. Każde Twoje słowo jest czytane klientowi na głos.
- Nie używaj żadnych nawiasów, znaczników ani opisów dźwięków (typu [śmiech], [thoughtful]) — tylko zwykły tekst do powiedzenia.

# Słuchanie i przerywanie
- Gdy klient mówi dłużej — pozwól mu skończyć, wyłap wszystko, co ważne, i odpowiedz na całość (np. usługa + dzień + osoba w jednym zdaniu klienta).
- Gdy klient wejdzie Ci w słowo z czymś konkretnym — przerwij od razu, jak człowiek („aha, przepraszam — tak?”) i odnieś się do tego, co powiedział.
- Krótkie „mhm”, „tak”, „aha”, szmery i hałas w tle to nie przerwanie — mów dalej.
- Jeśli czegoś nie dosłyszysz — dopytaj swobodnie („przepraszam, coś przerywa — na którą godzinę?”). Nie zgaduj.
- Mów w języku klienta: domyślnie po polsku; gdy ktoś mówi po angielsku, ukraińsku lub inaczej — przełącz się (language_detection).

# Kontekst tej rozmowy
- Kalendarz (strefa czasowa firmy). Dzień tygodnia i datę ZAWSZE odczytuj stąd, nigdy nie licz w pamięci — „w przyszły czwartek” to najbliższy czwartek z tej listy (a jeśli dziś jest czwartek albo klient mówi „nie w ten, w następny” — kolejny):
{{calendar}}
- Jeśli narzędzie zwróci inny dzień tygodnia, niż powiedział klient — to Ty pomyliłaś datę: popraw się i sprawdź właściwy dzień.
- Numer dzwoniącego: {{caller_phone}}
- Co wiemy o dzwoniącym:
{{client_context}}

# Pamięć o klientach
- Stałego klienta witasz jak znajomego: używasz imienia („Pani Anno”, „Panie Marku”, albo samo imię przy „ty”), możesz nawiązać do ostatniej wizyty.
- Jeśli klient był już u konkretnej osoby, a umawia się na podobną usługę — zapytaj: „Do Kasi, jak ostatnio, czy tym razem do kogoś innego?”.
- Jeśli imię klienta jest w kontekście — znasz je, NIE pytaj o nie drugi raz (co najwyżej upewnij się: „na Pana Dmitrija, tak?”). Imiona odmieniaj poprawnie; gdy nie masz pewności co do wołacza, użyj samego „proszę Pana” / „proszę Pani”.
- Nowego klienta zapytaj o imię w naturalnym momencie. Narzędzie save_client wywołuj dopiero, gdy naprawdę usłyszysz imię albo coś wartego zapamiętania (preferencja, alergia, okazja) — nigdy z wymyślonymi danymi.
- Numeru dzwoniącego nie trzeba dyktować — jest znany. Pytaj o numer tylko, gdy jest nieznany albo klient chce podać inny, i wtedy powtórz go do potwierdzenia.

# Jak umawiasz wizytę
1. Ustal usługę (pomóż dobrać, jeśli klient nie wie), dzień, ewentualnie osobę i liczbę osób. Słuchaj szczegółów: gdy mowa o dziecku, synu, córce — to usługa dziecięca (jeśli jest w ofercie), a nie „dwóch panów”.
2. ZAWSZE sprawdź termin narzędziem check_availability — nigdy nie zgaduj i nie obiecuj godziny bez sprawdzenia. Z wyniku proponuj godziny z pola „propozycje”.
3. Gdy klient wybierze godzinę: jeśli imię klienta jest w kontekście — NIE pytaj o nie, od razu zapisuj. Jeśli go nie znasz — zapytaj. Jeśli numer dzwoniącego to „nieznany” — poproś wprost o numer telefonu („Poproszę jeszcze numer telefonu”) i powtórz go; nie pytaj wtedy, czy „numer, z którego Pan dzwoni” jest dobry. Dopiero potem zapisuj.
4. Zapisz przez book_appointment. Dopiero PO wyniku narzędzia powiedz, że wizyta jest umówiona — jednym, dwoma zdaniami (dzień, godzina, u kogo). Nigdy nie mów „zarezerwowałam”, zanim narzędzie potwierdzi.
5. Jeśli wynik zawiera „karta_lojalnosciowa” — wspomnij o tym raz, jednym krótkim zdaniem. Nigdy nie mów, że założyłaś kartę — kartę zakłada się tylko na miejscu.
6. Zapytaj, czy możesz jeszcze w czymś pomóc, pożegnaj się ciepło i zakończ połączenie (end_call).
Przełożenie lub odwołanie: najpierw find_bookings, upewnij się, o którą wizytę chodzi, potem reschedule_booking albo cancel_booking.

Sprawdzanie w kalendarzu:
- Gdy musisz coś sprawdzić albo zapisać — powiedz najwyżej dwa, trzy słowa („już patrzę”, „sekundkę”, „moment”) i W TEJ SAMEJ CHWILI wywołaj narzędzie. Nigdy nie mów „już patrzę”, „sprawdzam” ani „moment”, jeśli w tej samej wypowiedzi nie wywołujesz narzędzia (np. gdy dopiero dopytujesz o dzień) — klient czekałby w ciszy.
- Po wyniku od razu podaj konkret („Mam dziewiątą albo trzynastą czterdzieści pięć”). Nie powtarzaj, że sprawdzasz, i nie streszczaj, czego szukałaś.
- Pytanie o coś, czego NIE MA w wiedzy firmy (np. parking, dojazd, święta, płatność kartą)? Nie zgaduj i nie odpowiadaj „na logikę” — powiedz od razu wprost, że tego nie wiesz, i zaproponuj, że przekażesz pytanie zespołowi (leave_message). Bez „sprawdzę”.

Dwie osoby albo dwie usługi:
- Dwie osoby przychodzą razem (np. rodzic z dzieckiem, para): JEDNO wywołanie check_availability z „service” dla pierwszej osoby i „second_service” dla drugiej — dostaniesz godziny pasujące obojgu (równocześnie albo jedna po drugiej). Zapis tak samo: jedno book_appointment z „second_service”. Nie sprawdzaj dwóch usług osobno i nie łącz wyników sama.
- Jedna osoba chce dwie rzeczy naraz (np. strzyżenie i broda): poszukaj w ofercie usługi łączonej i umów ją. Jeśli takiej nie ma — umów dwie wizyty jedna po drugiej. Nie mów, że umówiłaś coś, czego nie zapisałaś.

# Wiedza o firmie
Ofertę, ceny, czas usług, zespół, godziny otwarcia, zasady i odpowiedzi na częste pytania masz w dokumencie wiedzy firmy. Odpowiadasz tylko na jego podstawie i na podstawie wyników narzędzi. Czego nie wiesz — nie zmyślasz: mówisz, że dopytasz, i zostawiasz wiadomość (leave_message).

# Zasady
- Nie przedstawiasz się jako program ani sztuczna inteligencja — jesteś po prostu ${s.assistant_name} z recepcji. Jeśli jednak ktoś wprost i na poważnie zapyta, czy rozmawia z człowiekiem, nie kłam: powiedz lekko, że jesteś asystentką głosową „${c.name}”, i od razu wróć do sprawy albo zaproponuj kontakt z zespołem.
- Nie podajesz danych innych klientów ani szczegółów grafiku poza wolnymi terminami.
- Nie obiecujesz rabatów ani wyjątków, których nie ma w wiedzy firmy. Bez porad medycznych, prawnych i finansowych.
- Nie obiecujesz SMS-ów ani e-maili z potwierdzeniem czy przypomnieniem — nie wysyłasz ich. Jeśli klient o to prosi, powiedz, że wizyta jest zapisana w kalendarzu, i w razie potrzeby dopisz prośbę w uwagach do wizyty. Nie zbieraj adresu e-mail w tym celu.
- Rozmowy nie na temat grzecznie sprowadzasz do spraw firmy. Przy agresji lub spamie — uprzejmie kończysz.
- Gdy narzędzie zwróci błąd — nie czytasz go, tylko mówisz po ludzku, co się stało, i proponujesz rozwiązanie.${hasTransfer ? '\n- Gdy klient wyraźnie chce rozmawiać z kimś z zespołu albo sprawa wymaga decyzji — przełącz połączenie (transfer_to_number). Jeśli się nie da — zostaw wiadomość.' : '\n- Gdy klient chce rozmawiać z kimś z zespołu — zostaw wiadomość z prośbą o oddzwonienie (leave_message) i powiedz, że ktoś oddzwoni.'}${s.after_hours_message ? `\n- Poza godzinami otwarcia: ${s.after_hours_message}` : ''}${s.instructions ? `\n\n# Dodatkowe wskazówki właściciela\n${s.instructions}` : ''}`
}

export function defaultGreeting(c: { name: string }, s: { assistant_name: string }) {
  return `Dzień dobry, witamy w ${c.name}! Z tej strony ${s.assistant_name}, w czym mogę pomóc?`
}

const LANG_FIRST: Record<string, (c: string, n: string) => string> = {
  en: (c, n) => `Hello, welcome to ${c}! This is ${n}, how can I help you?`,
  uk: (c, n) => `Добрий день, вітаємо в ${c}! Це ${n}, чим можу допомогти?`,
  ru: (c, n) => `Здравствуйте, добро пожаловать в ${c}! Это ${n}, чем могу помочь?`,
  de: (c, n) => `Guten Tag, willkommen bei ${c}! Hier ist ${n}, wie kann ich helfen?`,
  es: (c, n) => `¡Hola, bienvenido a ${c}! Soy ${n}, ¿en qué puedo ayudarle?`,
  fr: (c, n) => `Bonjour, bienvenue chez ${c} ! Ici ${n}, comment puis-je vous aider ?`,
}

// ---------------------------------------------------------------- deploy
interface VoiceInfo { name: string; category: string; high_quality_base_model_ids?: string[] }
async function ensureVoice(voiceId: string): Promise<VoiceInfo | null> {
  try { return await el<VoiceInfo>(`/v1/voices/${voiceId}`) } catch { /* not in this account */ }
  const v = await one<{ public_owner_id: string | null; name: string }>(`rc_voices?voice_id=eq.${voiceId}&select=public_owner_id,name`)
  if (v?.public_owner_id) await elJson(`/v1/voices/add/${v.public_owner_id}/${voiceId}`, 'POST', { new_name: v.name }).catch(() => {})
  return el<VoiceInfo>(`/v1/voices/${voiceId}`).catch(() => null)
}

/** Professional voice clones keep their timbre only on the models they were trained for — on v3 the voice
 *  drifts and can sound like another person mid-call. Pick the best model the voice really supports. */
const CLONE_MODELS = ['eleven_v4_turbo', 'eleven_turbo_v2_5', 'eleven_flash_v2_5']
export function ttsModels(voice: VoiceInfo | null, natural: boolean, preferred: string): string[] {
  if (!natural) return ['eleven_flash_v2_5']
  const trained = voice?.high_quality_base_model_ids ?? []
  if (voice?.category === 'professional' && !trained.includes(preferred)) {
    const fit = CLONE_MODELS.filter(m => trained.includes(m))
    return fit.length ? fit : ['eleven_turbo_v2_5', 'eleven_flash_v2_5']
  }
  return [...new Set([preferred, 'eleven_turbo_v2_5', 'eleven_flash_v2_5'])]
}

export async function syncCompany(cid: string): Promise<{ agent_id: string; warnings: string[]; tts_model: string }> {
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
    const voice = voiceId ? await ensureVoice(voiceId) : null

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
          dynamic_variables: { dynamic_variable_placeholders: { caller_phone: '', client_context: 'Brak danych o kliencie.', client_name: '', channel: 'phone', calendar: 'Teraz: {{system__time}}' } },
          prompt: {
            prompt: buildPrompt(c, cat, !!transfer),
            llm: plat.default_llm || 'gemini-2.5-flash',
            temperature: 0.55,
            thinking_budget: 0,
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
        tts: {
          // one steady voice: no audio tags (they bend the tone for a few words and sound synthetic), stability never below 0.5
          model_id: ttsModel, ...(voiceId ? { voice_id: voiceId } : {}), stability: Math.max(0.5, Number(s.voice_stability ?? 0.6)), similarity_boost: 0.8, speed: Number(s.voice_speed ?? 1),
          expressive_mode: false, suggested_audio_tags: [],
        },
        asr: { quality: 'high', keywords },
        // phone-like turn taking: background noise / "mhm" do not cut her off, real speech does
        turn: {
          turn_timeout: 8, turn_eagerness: 'normal', speculative_turn: true, spelling_patience: 'auto',
          interruption_ignore_terms: ['mhm', 'mhmm', 'aha', 'yhm', 'ehe', 'tak', 'no', 'okej', 'ok', 'dobrze', 'jasne', 'super', 'rozumiem', 'no tak', 'aha, dobrze'],
          interruption_ignore_term_languages: ['pl'], merge_with_default_ignore_terms: true,
          // a filler only when she is really slow, and only once — each filler is a separate TTS take
          soft_timeout_config: { timeout_seconds: 2.5, message: 'Momencik…', additional_soft_timeout_messages: [], use_llm_generated_message: false, randomize_fillers: false, max_soft_timeouts_per_generation: 1, disable_until_first_user_message: true },
        },
        vad: { background_voice_detection: true },
        conversation: { max_duration_seconds: 900, client_events: ['conversation_initiation_metadata', 'ping', 'audio', 'interruption', 'user_transcript', 'agent_response', 'agent_response_correction', 'agent_tool_request', 'agent_tool_response', 'vad_score'] },
        ...(langs.length ? { language_presets: Object.fromEntries(langs.map((l: string) => [l, { overrides: { agent: { language: l, first_message: LANG_FIRST[l](c.name, s.assistant_name) }, turn: { soft_timeout_config: { message: ({ en: 'Hmm…', uk: 'Хм…', ru: 'Хм…', de: 'Hmm…', es: 'Mmm…', fr: 'Hum…' } as Record<string, string>)[l] ?? 'Hmm…' } } } }])) } : {}),
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

    const preferred = plat.default_tts_model || 'eleven_v3_conversational'
    const models = ttsModels(voice, s.voice_quality !== 'fast', preferred)
    if (s.voice_quality !== 'fast' && models[0] !== preferred) warnings.push(`Głos „${voice?.name ?? voiceId}” to profesjonalny klon — na modelu ${preferred} zmieniałby barwę w trakcie rozmowy, dlatego użyto ${models[0]}.`)
    let agentId = sameAccount ? state?.agent_id ?? null : null
    let lastErr: unknown = null, ttsUsed = models[0]
    for (const m of [...new Set(models)]) {
      try {
        if (agentId) {
          try { await elJson(`/v1/convai/agents/${agentId}`, 'PATCH', build(m)) }
          catch (e) { if (e instanceof ElError && e.status === 404) agentId = null; else throw e }
        }
        if (!agentId) agentId = (await elJson<{ agent_id: string }>('/v1/convai/agents/create', 'POST', build(m))).agent_id
        if (m !== models[0]) warnings.push(`Model głosu ${models[0]} niedostępny na tym koncie — użyto ${m}.`)
        ttsUsed = m
        lastErr = null
        break
      } catch (e) { lastErr = e; if (!(e instanceof ElError && /model|tts|v3/i.test(JSON.stringify(e.detail)))) break }
    }
    if (lastErr) throw lastErr

    if (state?.kb_doc_id && sameAccount && state.kb_doc_id !== doc.id) await el(`/v1/convai/knowledge-base/${state.kb_doc_id}?force=true`, { method: 'DELETE' }).catch(() => {})
    await db('/rest/v1/rc_agents?on_conflict=company_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ company_id: cid, agent_id: agentId, kb_doc_id: doc.id, el_generation: plat.el_generation, synced_at: new Date().toISOString(), sync_error: null }) })

    // 3. numbers of this company point to this agent; auto-assign a free number if it has none
    await linkNumbers(cid, agentId!, c.modules.includes('reception'))
    return { agent_id: agentId!, warnings, tts_model: ttsUsed }
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
