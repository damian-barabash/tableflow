/**
 * Industry landing pages (PL only — they target Polish search queries).
 * Read by the app (IndustryPage, lazy) and by scripts/prerender.mjs (Node type stripping).
 * Copy rule: describe only what the product really does (no SMS promises, no invented numbers or testimonials).
 */
import { INDUSTRIES as META, type IndustryMeta } from './industries.ts'

export interface IndustryPageData extends IndustryMeta {
  /** rich: <g>…</g> = gradient words */
  h1: string
  lead: string
  intro: string[]
  pains: { t: string; d: string }[]
  call: { who: 'client' | 'ai'; text: string }[]
  callResult: string
  steps: { t: string; d: string }[]
  features: { t: string; d: string }[]
  faq: { q: string; a: string }[]
}

const FAQ_AI = { q: 'Czy klient wie, że rozmawia z asystentem AI?', a: 'Asystentka przedstawia się imieniem i nazwą Twojej firmy. Na bezpośrednie pytanie zawsze odpowiada zgodnie z prawdą, że jest asystentką głosową — tak wymaga unijny AI Act. W praktyce klientom zależy głównie na tym, żeby szybko umówić termin.' }
const FAQ_BOOKSY = { q: 'Korzystam z Booksy lub Versum. Czy muszę rezygnować?', a: 'Nie. Integracja z Booksy i Versum jest w przygotowaniu: kalendarz będzie synchronizowany w obie strony, więc zespół zostanie przy swoim narzędziu. Do tego czasu możesz prowadzić grafik w kalendarzu TableFlow.' }
const FAQ_START = { q: 'Od kiedy mogę zacząć?', a: 'TableFlow AI jest przed premierą i uruchamiamy pierwsze firmy etapami. Zapisz się na listę oczekujących — odezwiemy się, pomożemy wpisać usługi i grafik, a numer telefonu podłączymy za Ciebie.' }

const meta = (slug: string): IndustryMeta => { const m = META.find(i => i.slug === slug); if (!m) throw new Error(`industry meta missing: ${slug}`); return m }

export const INDUSTRIES: IndustryPageData[] = [
  {
    ...meta('recepcja-ai-barbershop'),
    h1: 'Recepcja AI dla barbershopu. <g>Strzyżesz, a telefon odbiera się sam.</g>',
    lead: 'TableFlow AI odbiera połączenia, sprawdza grafik każdego barbera i zapisuje klienta na wolny termin — także wieczorem i w niedzielę, kiedy lokal jest zamknięty.',
    intro: [
      'W barbershopie telefon dzwoni zwykle wtedy, kiedy masz w ręku maszynkę. Odbierzesz — klient na fotelu czeka. Nie odbierzesz — dzwoniący zapisze się gdzie indziej. Recepcja AI rozwiązuje ten problem bez zatrudniania recepcjonisty.',
      'Asystentka zna Waszą ofertę, czas trwania usług i grafik każdej osoby w zespole. Klient może poprosić o konkretnego barbera („do Marka, jak ostatnio”) albo o najbliższy wolny termin — a wizyta od razu pojawia się w kalendarzu.',
    ],
    pains: [
      { t: 'Przerywane strzyżenia', d: 'Każdy telefon w trakcie usługi to przerwa dla klienta na fotelu i nerwowe zerkanie na grafik.' },
      { t: 'Telefony po zamknięciu', d: 'Wieczorem i w niedzielę klienci dzwonią najczęściej — a wtedy nikt już nie odbiera.' },
      { t: 'Ręczne przekładanie', d: '„Czy mogę przesunąć na czwartek?” — każda zmiana to kolejna rozmowa i ryzyko podwójnej rezerwacji.' },
    ],
    call: [
      { who: 'client', text: 'Dzień dobry, chciałbym się ostrzyc u Marka, najlepiej jutro po pracy.' },
      { who: 'ai', text: 'Jasne. Marek ma jutro wolne o siedemnastej trzydzieści i o osiemnastej piętnaście. Która godzina pasuje?' },
      { who: 'client', text: 'Siedemnasta trzydzieści. I jeszcze broda.' },
      { who: 'ai', text: 'Zapisuję strzyżenie z brodą jutro o siedemnastej trzydzieści u Marka, potrwa około godziny. Do zobaczenia!' },
    ],
    callResult: 'Wizyta u Marka w kalendarzu, z usługą i czasem trwania.',
    steps: [
      { t: 'Wpisujesz usługi i zespół', d: 'Strzyżenie, broda, combo, golenie — z czasem trwania i ceną. Każdy barber ma swój grafik i urlopy.' },
      { t: 'Podłączamy numer', d: 'Przekierowujesz numer lokalu albo dostajesz nowy. Asystentka odbiera od pierwszego sygnału.' },
      { t: 'AI umawia wizyty', d: 'Sprawdza wolne terminy na żywo, proponuje dwie–trzy godziny i zapisuje do właściwej osoby.' },
      { t: 'Ty widzisz wszystko w kalendarzu', d: 'Nowe wizyty, przeniesienia, nagrania i streszczenia rozmów — w panelu na telefonie i komputerze.' },
    ],
    features: [
      { t: 'Zapis do konkretnego barbera', d: 'Rozumie odmianę imion: „do Tomka”, „u Kuby” — i pamięta, do kogo klient chodził ostatnio.' },
      { t: 'Bez podwójnych rezerwacji', d: 'Ten sam termin nie zostanie zajęty dwa razy, nawet gdy dwie osoby dzwonią jednocześnie.' },
      { t: 'Ojciec z synem, dwóch kolegów', d: 'Umawia dwie osoby naraz — równolegle u dwóch barberów albo jedna po drugiej.' },
      { t: 'Przenoszenie i odwołania', d: 'Klient sam zmienia termin przez telefon, a zwolnione miejsce wraca do grafiku.' },
      { t: 'Pamięć stałych klientów', d: 'Rozpoznaje numer, wita po imieniu i nie pyta drugi raz o te same dane.' },
      { t: 'Karta lojalnościowa w Wallet', d: 'Pieczątki za wizyty w Apple Wallet i Google Wallet, skanowane telefonem w lokalu.' },
    ],
    faq: [
      { q: 'Czy asystentka zapisze klienta do wybranego barbera?', a: 'Tak. Każda osoba w zespole ma własny grafik. Klient może poprosić o konkretnego barbera albo o najbliższy wolny termin u kogokolwiek — asystentka sprawdzi dostępność na żywo.' },
      { q: 'Co, jeśli klient pyta o coś nietypowego?', a: 'Asystentka korzysta z wiedzy, którą wpiszesz w panelu (cennik, parking, płatność kartą). Jeśli nie zna odpowiedzi, nie zgaduje — zapisuje prośbę o oddzwonienie, którą widzisz w panelu.' },
      FAQ_AI, FAQ_BOOKSY, FAQ_START,
    ],
  },
  {
    ...meta('recepcja-ai-salon-fryzjerski'),
    h1: 'Wirtualna recepcjonistka dla salonu fryzjerskiego. <g>Każdy telefon kończy się wizytą.</g>',
    lead: 'Koloryzacja trwa inaczej niż strzyżenie, a każda stylistka ma swój grafik. TableFlow AI to wszystko wie — odbiera połączenia i zapisuje klientki na właściwą usługę i właściwy czas.',
    intro: [
      'W salonie fryzjerskim rezerwacja przez telefon to nie tylko „która godzina”. Trzeba dopytać o usługę, długość włosów, czasem o konkretną stylistkę — i znaleźć w grafiku okno, w którym zmieści się dwugodzinna koloryzacja.',
      'Recepcja AI prowadzi taką rozmowę naturalnie, po polsku. Zna Wasz cennik i czas trwania usług, sprawdza wolne terminy na żywo i wpisuje wizytę do kalendarza. Nieodebrane połączenia przestają być straconymi klientkami.',
    ],
    pains: [
      { t: 'Ręce w farbie', d: 'Nie da się odebrać telefonu w trakcie koloryzacji — a klientka, która nie dodzwoniła się raz, często nie dzwoni drugi raz.' },
      { t: 'Źle policzony czas', d: 'Zapisanie koloryzacji w okienku na strzyżenie rozbija cały dzień w grafiku.' },
      { t: 'Odwołania na ostatnią chwilę', d: 'Wolny termin, o którym nikt się nie dowiedział, to strata dla salonu.' },
    ],
    call: [
      { who: 'client', text: 'Dzień dobry, chciałabym umówić koloryzację i strzyżenie u Pani Kasi.' },
      { who: 'ai', text: 'Dzień dobry! Koloryzacja ze strzyżeniem to około dwóch i pół godziny. Kasia ma wolne w środę o dziesiątej albo w piątek o trzynastej.' },
      { who: 'client', text: 'Środa o dziesiątej.' },
      { who: 'ai', text: 'Zapisuję środę, dziesiąta, koloryzacja i strzyżenie u Kasi. Do zobaczenia!' },
    ],
    callResult: 'Wizyta z właściwym czasem trwania w grafiku Kasi.',
    steps: [
      { t: 'Cennik i czasy usług', d: 'Strzyżenie, koloryzacja, refleksy, modelowanie — każda usługa ma czas trwania, przerwę na sprzątanie i listę osób, które ją wykonują.' },
      { t: 'Grafik zespołu', d: 'Godziny pracy, przerwy i urlopy każdej stylistki. Asystentka nigdy nie zapisze na wolne.' },
      { t: 'Numer salonu', d: 'Przekierowujesz numer albo dostajesz nowy. Asystentka odbiera całą dobę.' },
      { t: 'Kalendarz i rozmowy w panelu', d: 'Widzisz nowe wizyty, streszczenia rozmów i prośby o oddzwonienie.' },
    ],
    features: [
      { t: 'Właściwy czas dla każdej usługi', d: 'Dwugodzinna koloryzacja dostaje dwugodzinne okno, z przerwą na sprzątanie stanowiska.' },
      { t: 'Zapis do ulubionej stylistki', d: '„Do Pani Kasi, jak ostatnio” — asystentka pamięta, do kogo klientka chodziła.' },
      { t: 'Przenoszenie bez dzwonienia do salonu', d: 'Klientka sama przekłada wizytę, a termin wraca do grafiku.' },
      { t: 'Klientki w jednym miejscu', d: 'Historia wizyt, notatki i telefony każdej klientki w bazie klientów.' },
      { t: 'Wiedza o salonie', d: 'Parking, płatność kartą, produkty — odpowiada na podstawie tego, co wpiszesz.' },
      { t: 'Karta stałej klientki', d: 'Pieczątki w Apple Wallet i Google Wallet zamiast papierowych kartoników.' },
    ],
    faq: [
      { q: 'Skąd asystentka wie, ile trwa usługa?', a: 'Z panelu: każda usługa ma czas trwania i opcjonalną przerwę po niej. Asystentka szuka w grafiku okna, w którym zmieści się cała usługa, więc nie zapisze koloryzacji w okienku na grzywkę.' },
      { q: 'Czy może zapisać dwie osoby na raz?', a: 'Tak, np. mamę z córką — równolegle u dwóch stylistek albo jedna po drugiej, zależnie od grafiku.' },
      FAQ_AI, FAQ_BOOKSY, FAQ_START,
    ],
  },
  {
    ...meta('recepcja-ai-salon-kosmetyczny'),
    h1: 'Recepcja AI dla salonu kosmetycznego. <g>Zabieg trwa, a wizyty same się umawiają.</g>',
    lead: 'Manicure, brwi, depilacja, zabiegi na twarz — TableFlow AI odbiera telefony w trakcie zabiegów, zapisuje do właściwej kosmetyczki i przenosi wizyty bez Twojego udziału.',
    intro: [
      'W salonie beauty każda rozmowa telefoniczna w trakcie zabiegu to rękawiczki do zdjęcia i przerwa dla klientki. Dlatego wiele salonów odbiera tylko między wizytami — a dzwoniące klientki trafiają na pocztę głosową.',
      'Recepcja AI odbiera każde połączenie, zna Waszą ofertę i grafik każdej osoby, a wizyty zapisuje od razu do kalendarza. Klientki mogą też same przełożyć albo odwołać termin — bez dzwonienia drugi raz.',
    ],
    pains: [
      { t: 'Rękawiczki i telefon', d: 'W trakcie zabiegu nie da się odebrać — a nieodebrane połączenie to często stracona klientka.' },
      { t: 'Przekładanie wizyt', d: 'Najwięcej telefonów to zmiany terminów, które zajmują czas, a nie przynoszą nowych wizyt.' },
      { t: 'Puste okienka', d: 'Odwołana wizyta, o której nikt się nie dowiedział, zostaje pusta w grafiku.' },
    ],
    call: [
      { who: 'client', text: 'Muszę przełożyć jutrzejszy manicure na przyszły tydzień.' },
      { who: 'ai', text: 'Już patrzę. Odwołuję jutro dwunastą. Ola ma wolne we wtorek o dwunastej albo w czwartek o szesnastej.' },
      { who: 'client', text: 'Czwartek będzie super.' },
      { who: 'ai', text: 'Gotowe — manicure w czwartek o szesnastej u Oli. Miłego dnia!' },
    ],
    callResult: 'Wizyta przeniesiona, jutrzejszy termin znów wolny w grafiku.',
    steps: [
      { t: 'Oferta salonu', d: 'Zabiegi z czasem trwania i ceną (od–do), a do tego informacja, kto je wykonuje.' },
      { t: 'Grafik i urlopy', d: 'Godziny pracy każdej kosmetyczki, przerwy, dni wolne salonu.' },
      { t: 'Numer telefonu', d: 'Przekierowanie numeru salonu albo nowy numer. Odbiór 24/7.' },
      { t: 'Panel dla zespołu', d: 'Kalendarz, lista klientek, rozmowy ze streszczeniem i prośby o oddzwonienie.' },
    ],
    features: [
      { t: 'Umawianie, przenoszenie, odwołania', d: 'Cały ruch telefoniczny wokół wizyt bez udziału zespołu.' },
      { t: 'Właściwa osoba do zabiegu', d: 'Asystentka zapisuje tylko do tych osób, które wykonują daną usługę.' },
      { t: 'Pamięć klientki', d: 'Rozpoznaje numer, wita po imieniu, zna historię wizyt.' },
      { t: 'Odpowiedzi na pytania', d: 'Ceny, przeciwwskazania, przygotowanie do zabiegu — na podstawie Twojej wiedzy w panelu.' },
      { t: 'Prośby o oddzwonienie', d: 'Gdy sprawa wymaga człowieka, asystentka zapisuje notatkę — nic nie ginie.' },
      { t: 'Karta lojalnościowa', d: 'Pieczątki w Apple Wallet i Google Wallet, nagroda za N wizyt.' },
    ],
    faq: [
      { q: 'Czy asystentka odpowie na pytania o zabiegi?', a: 'Tak, w zakresie wiedzy, którą wpiszesz w panelu: ceny, czas trwania, przygotowanie, przeciwwskazania. Nie wymyśla odpowiedzi — gdy czegoś nie wie, zapisuje prośbę o kontakt.' },
      { q: 'Jak klientka przełoży wizytę?', a: 'Dzwoni na numer salonu. Asystentka odnajduje jej wizytę po numerze telefonu, zwalnia stary termin i proponuje nowe.' },
      FAQ_AI, FAQ_BOOKSY, FAQ_START,
    ],
  },
  {
    ...meta('recepcja-ai-restauracja'),
    h1: 'Rezerwacje stolików przez telefon. <g>W godzinach szczytu i po zamknięciu.</g>',
    lead: 'TableFlow AI przyjmuje rezerwacje, dobiera stolik do liczby gości i zapisuje notatki dla sali — także w piątkowy wieczór, kiedy obsługa nie ma czasu podejść do telefonu.',
    intro: [
      'Najwięcej telefonów z prośbą o stolik przychodzi dokładnie wtedy, kiedy restauracja jest pełna. Kelner przy telefonie to kelner, którego nie ma przy gościach — a nieodebrane połączenie to wolny stolik w sobotę.',
      'Recepcja AI zna Wasz plan sali: liczbę miejsc przy stolikach, godziny otwarcia i dni zamknięcia. Przyjmuje rezerwację, dopisuje notatkę („urodziny”, „krzesełko dla dziecka”) i od razu pokazuje ją w kalendarzu.',
    ],
    pains: [
      { t: 'Telefon w szczycie', d: 'Piątek, 19:30, pełna sala — i telefon, którego nikt nie odbiera.' },
      { t: 'Kartka przy kasie', d: 'Rezerwacje zapisywane na kartce gubią się, a stolik bywa obiecany dwa razy.' },
      { t: 'Pytania o to samo', d: 'Godziny otwarcia, parking, opcje wegańskie — w kółko te same rozmowy.' },
    ],
    call: [
      { who: 'client', text: 'Stolik dla sześciu osób w piątek około dwudziestej, mamy urodziny.' },
      { who: 'ai', text: 'Mam stolik dla sześciu osób w piątek o dwudziestej w sali głównej. Dopisać notatkę „urodziny”?' },
      { who: 'client', text: 'Tak, poproszę.' },
      { who: 'ai', text: 'Zapisane: piątek, dwudziesta, sześć osób, notatka o urodzinach. Do zobaczenia!' },
    ],
    callResult: 'Rezerwacja stolika z notatką widoczna w kalendarzu sali.',
    steps: [
      { t: 'Plan sali', d: 'Stoliki z liczbą miejsc (minimalną i maksymalną), sale, ogródek.' },
      { t: 'Godziny i zasady', d: 'Czas trwania rezerwacji, godziny otwarcia, dni zamknięcia, limit gości.' },
      { t: 'Numer restauracji', d: 'Przekierowanie numeru albo nowy numer do rezerwacji.' },
      { t: 'Kalendarz stolików', d: 'Kolumna dla każdego stolika, rezerwacje z notatkami, rozmowy i prośby o kontakt.' },
    ],
    features: [
      { t: 'Dobór stolika do liczby gości', d: 'Dla dwóch osób nie zajmie stolika na osiem — wybiera najmniejszy pasujący.' },
      { t: 'Notatki dla sali i kuchni', d: 'Urodziny, alergie, krzesełko dla dziecka — zapisane przy rezerwacji.' },
      { t: 'Bez podwójnych rezerwacji', d: 'Jeden stolik nie zostanie zarezerwowany dwa razy na tę samą godzinę.' },
      { t: 'Zmiany i odwołania', d: 'Gość sam przesuwa godzinę albo odwołuje — stolik wraca do puli.' },
      { t: 'Odpowiedzi o lokalu', d: 'Menu, parking, dojazd, opcje dla dzieci — na podstawie wiedzy z panelu.' },
      { t: 'Program lojalnościowy', d: 'Karta stałego gościa w Apple Wallet i Google Wallet.' },
    ],
    faq: [
      { q: 'Czy AI rozumie, że stolik dla 6 osób to inny stolik niż dla 2?', a: 'Tak. Każdy stolik ma w panelu liczbę miejsc. Asystentka wybiera najmniejszy stolik, przy którym zmieszczą się goście, więc duże stoliki zostają dla większych grup.' },
      { q: 'Czy obsłuży większe wydarzenia i catering?', a: 'Tak — usługa może wymagać rezerwacji z wyprzedzeniem (np. 7 dni) i mieć limit gości. Rozbudowane zapytania asystentka zapisuje jako prośbę o kontakt dla menedżera.' },
      FAQ_AI, FAQ_START,
    ],
  },
  {
    ...meta('recepcja-ai-kawiarnia'),
    h1: 'Asystent telefoniczny dla kawiarni. <g>Barista parzy kawę, AI odbiera telefon.</g>',
    lead: 'Rezerwacje stolików, zapisy na warsztaty i degustacje, pytania o godziny otwarcia — TableFlow AI odbiera połączenia, a stałych gości zaprasza do cyfrowej karty lojalnościowej.',
    intro: [
      'W kawiarni przy kolejce do kasy nie ma czasu na rozmowy telefoniczne. Tymczasem goście dzwonią z pytaniami o stolik na sobotę, tort na zamówienie albo warsztaty latte art.',
      'Recepcja AI odpowiada za Was: zna godziny otwarcia, ofertę i wydarzenia, przyjmuje rezerwacje z limitem miejsc i zapisuje je w kalendarzu. Do tego cyfrowa karta lojalnościowa w telefonie gościa zamiast papierowej pieczątki.',
    ],
    pains: [
      { t: 'Kolejka i telefon', d: 'Barista nie może jednocześnie obsługiwać kolejki i odbierać połączeń.' },
      { t: 'Zapisy na wydarzenia', d: 'Warsztaty i degustacje mają limit miejsc — łatwo przyjąć o jedną osobę za dużo.' },
      { t: 'Papierowe karty', d: 'Kartoniki z pieczątkami się gubią, a Ty nie wiesz, kim są stali goście.' },
    ],
    call: [
      { who: 'client', text: 'Robicie zapisy na warsztaty z latte art w sobotę?' },
      { who: 'ai', text: 'Tak, w sobotę o jedenastej zostały dwa miejsca. Zapisać Panią?' },
      { who: 'client', text: 'Tak, poproszę jedno miejsce.' },
      { who: 'ai', text: 'Gotowe, sobota, jedenasta. Jeśli nie ma Pani jeszcze naszej karty stałego gościa, przy wizycie wystarczy poprosić baristę.' },
    ],
    callResult: 'Miejsce na warsztatach zarezerwowane, limit pilnowany automatycznie.',
    steps: [
      { t: 'Stoliki i wydarzenia', d: 'Stoliki z liczbą miejsc albo wydarzenia z limitem uczestników.' },
      { t: 'Godziny i wiedza', d: 'Godziny otwarcia, menu, oferta tortów, informacje o dojeździe.' },
      { t: 'Numer kawiarni', d: 'Przekierowanie numeru albo nowy numer.' },
      { t: 'Karta lojalnościowa', d: 'Projektujesz kartę w panelu, goście dodają ją do Apple Wallet lub Google Wallet przez kod QR.' },
    ],
    features: [
      { t: 'Rezerwacje z limitem miejsc', d: 'Warsztaty i degustacje bez przepełnienia.' },
      { t: 'Odpowiedzi na pytania', d: 'Godziny, menu, alergeny, torty na zamówienie — z wiedzy w panelu.' },
      { t: 'Karta w Apple i Google Wallet', d: 'Pieczątki w telefonie gościa, skanowane aparatem telefonu baristy.' },
      { t: 'Wiadomości do stałych gości', d: 'Powiadomienie na karcie w Wallet, np. o nowym sezonowym napoju.' },
      { t: 'Baza gości', d: 'Kto przychodzi, jak często i ile pieczątek zebrał.' },
      { t: 'Działa 24/7', d: 'Rezerwacje także wtedy, gdy kawiarnia jest zamknięta.' },
    ],
    faq: [
      { q: 'Czy karta lojalnościowa działa bez aplikacji?', a: 'Tak. Gość skanuje kod QR z plakatu, podaje imię i numer telefonu i dodaje kartę do Apple Wallet albo Google Wallet. Nie trzeba instalować żadnej aplikacji.' },
      { q: 'Jak zbiera się pieczątki?', a: 'Barista skanuje kod z karty gościa aparatem telefonu albo w panelu. Karta w Wallet aktualizuje się sama, a po zebraniu kompletu pokazuje nagrodę.' },
      FAQ_AI, FAQ_START,
    ],
  },
  {
    ...meta('recepcja-ai-gabinet'),
    h1: 'Rejestracja telefoniczna dla gabinetu. <g>Specjalista pracuje, rejestracja działa.</g>',
    lead: 'Fizjoterapia, psycholog, dietetyk, gabinet stomatologiczny — TableFlow AI odbiera połączenia, zapisuje pacjentów do właściwego specjalisty i przenosi wizyty, gdy jesteś w trakcie sesji.',
    intro: [
      'W małym gabinecie nie ma rejestratorki, więc telefon odbiera specjalista — między pacjentami albo wcale. Pacjenci, którzy nie mogą się dodzwonić, szukają innego gabinetu.',
      'Recepcja AI przejmuje rejestrację telefoniczną: umawia na pierwszą wizytę i kontrolną, przenosi terminy i odpowiada na pytania organizacyjne. Nie udziela porad medycznych — sprawy wymagające specjalisty zapisuje jako prośbę o kontakt.',
    ],
    pains: [
      { t: 'Telefon w trakcie sesji', d: 'Odebranie połączenia w trakcie terapii jest nieprofesjonalne, nieodebrane — kosztuje pacjenta.' },
      { t: 'Różne rodzaje wizyt', d: 'Pierwsza konsultacja trwa inaczej niż wizyta kontrolna — trzeba to uwzględnić w grafiku.' },
      { t: 'Odwołania', d: 'Pacjent, który nie mógł się dodzwonić, żeby odwołać, po prostu nie przychodzi.' },
    ],
    call: [
      { who: 'client', text: 'Dzień dobry, chciałbym umówić pierwszą wizytę u fizjoterapeuty, boli mnie kręgosłup.' },
      { who: 'ai', text: 'Pierwsza konsultacja trwa godzinę. Najbliższe terminy u Pani Anny to czwartek o ósmej albo piątek o piętnastej.' },
      { who: 'client', text: 'Piątek.' },
      { who: 'ai', text: 'Zapisuję pierwszą konsultację w piątek o piętnastej u Pani Anny. Proszę zabrać ze sobą wyniki badań, jeśli Pan je ma.' },
    ],
    callResult: 'Pierwsza wizyta z właściwym czasem trwania w grafiku specjalisty.',
    steps: [
      { t: 'Rodzaje wizyt', d: 'Konsultacja, wizyta kontrolna, terapia — każda z czasem trwania i listą specjalistów.' },
      { t: 'Grafik specjalistów', d: 'Godziny przyjęć, przerwy, urlopy, minimalne wyprzedzenie rezerwacji.' },
      { t: 'Numer gabinetu', d: 'Przekierowanie numeru albo nowy numer rejestracji.' },
      { t: 'Panel rejestracji', d: 'Kalendarz, kartoteka kontaktowa pacjentów, rozmowy i prośby o oddzwonienie.' },
    ],
    features: [
      { t: 'Różne czasy wizyt', d: 'Konsultacja 60 min, kontrola 30 min — grafik zawsze się zgadza.' },
      { t: 'Zapis do specjalisty', d: 'Pacjent wybiera osobę albo najbliższy wolny termin.' },
      { t: 'Bez porad medycznych', d: 'Asystentka zajmuje się organizacją wizyt. Pytania o leczenie przekazuje specjaliście.' },
      { t: 'Przenoszenie i odwołania', d: 'Zwolnione terminy od razu wracają do grafiku.' },
      { t: 'Prośby o kontakt', d: 'Sprawy pilne lub nietypowe trafiają na listę „do oddzwonienia”.' },
      { t: 'Przekierowanie do człowieka', d: 'Jeśli ustawisz numer, asystentka może przełączyć rozmowę do osoby z zespołu.' },
    ],
    faq: [
      { q: 'Czy asystentka udziela porad medycznych?', a: 'Nie. Zajmuje się wyłącznie organizacją: terminami, przeniesieniami i informacjami o gabinecie. Pytania o leczenie zapisuje jako prośbę o kontakt ze specjalistą.' },
      { q: 'Jakie dane pacjenta są zapisywane?', a: 'Dane kontaktowe potrzebne do wizyty: imię, numer telefonu, termin i krótkie streszczenie rozmowy. Nie prowadzimy dokumentacji medycznej.' },
      FAQ_AI, FAQ_START,
    ],
  },
  {
    ...meta('recepcja-ai-warsztat-samochodowy'),
    h1: 'Recepcja AI dla warsztatu samochodowego. <g>Ręce w silniku, telefon odebrany.</g>',
    lead: 'Wymiana opon, przegląd, serwis klimatyzacji — TableFlow AI odbiera połączenia, sprawdza wolne stanowiska i zapisuje klienta na konkretną godzinę. W sezonie oponiarskim także wieczorem.',
    intro: [
      'W warsztacie nikt nie odbiera telefonu brudnymi rękami spod auta. W sezonie wymiany opon dzwoni kilkadziesiąt osób dziennie — a każda chce wiedzieć „kiedy najszybciej”.',
      'Recepcja AI zna Wasze usługi i czas ich trwania, widzi stanowiska i ich obłożenie, i umawia klienta na wolny termin. Może też dopytać o markę i model auta, żeby mechanik wiedział, czego się spodziewać.',
    ],
    pains: [
      { t: 'Sezon opon', d: 'Dziesiątki telefonów dziennie z tym samym pytaniem — a mechanicy mają pełne ręce.' },
      { t: 'Zeszyt z terminami', d: 'Ręczne zapisy w zeszycie kończą się dwoma autami na jednym stanowisku.' },
      { t: 'Brak informacji o aucie', d: 'Klient przyjeżdża, a dopiero wtedy wychodzi, że trzeba zamówić część.' },
    ],
    call: [
      { who: 'client', text: 'Wymiana opon na zimowe, kiedy najszybciej?' },
      { who: 'ai', text: 'Najbliższy wolny termin to jutro o dziewiątej, wymiana trwa około czterdziestu minut. Pasuje?' },
      { who: 'client', text: 'Tak. Mam opony u was w przechowalni.' },
      { who: 'ai', text: 'Zapisuję jutro o dziewiątej i dopisuję notatkę o oponach z przechowalni. Poproszę jeszcze numer rejestracyjny.' },
    ],
    callResult: 'Wizyta na stanowisku z notatką dla mechanika.',
    steps: [
      { t: 'Usługi i stanowiska', d: 'Wymiana opon, przegląd, diagnostyka — z czasem trwania. Stanowiska jako zasoby z własnym grafikiem.' },
      { t: 'Godziny pracy', d: 'Także sezonowe, z przerwami i dniami zamknięcia.' },
      { t: 'Numer warsztatu', d: 'Przekierowanie numeru albo nowy numer.' },
      { t: 'Kalendarz stanowisk', d: 'Kolumna dla każdego stanowiska, notatki o autach, rozmowy i prośby o kontakt.' },
    ],
    features: [
      { t: 'Wolne stanowiska na żywo', d: 'Asystentka widzi, które stanowisko jest wolne, i nie zapisze dwóch aut na jedno miejsce.' },
      { t: 'Notatki o aucie', d: 'Marka, model, numer rejestracyjny, opony w przechowalni — zapisane przy wizycie.' },
      { t: 'Szybkie terminy', d: 'Na pytanie „kiedy najszybciej” proponuje najbliższe wolne godziny.' },
      { t: 'Wyceny i pytania', d: 'Ceny orientacyjne (od–do) i odpowiedzi na podstawie wiedzy z panelu.' },
      { t: 'Prośby o oddzwonienie', d: 'Wyceny wymagające mechanika trafiają na listę „do oddzwonienia”.' },
      { t: 'Stali klienci', d: 'Asystentka rozpoznaje numer i pamięta poprzednie wizyty.' },
    ],
    faq: [
      { q: 'Czy asystentka poda cenę naprawy?', a: 'Poda ceny orientacyjne, które wpiszesz w panelu (np. wymiana opon od–do). Wyceny, które wymagają obejrzenia auta, zapisuje jako prośbę o kontakt dla mechanika.' },
      { q: 'Jak działają stanowiska?', a: 'Każde stanowisko to zasób z grafikiem. Usługa może być wykonywana na wybranych stanowiskach, a jedno stanowisko nigdy nie dostanie dwóch aut na tę samą godzinę.' },
      FAQ_AI, FAQ_BOOKSY, FAQ_START,
    ],
  },
]

export const industryContent = (slug: string) => INDUSTRIES.find(i => i.slug === slug) ?? null
