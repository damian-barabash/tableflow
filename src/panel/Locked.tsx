import { DashboardMock } from '../mocks/DashboardMock'
import { Ic, PageHead } from '../app/ui'
import type { TabId } from './PanelApp'

const INFO: Partial<Record<TabId, { title: string; lead: string; points: string[]; icon: keyof typeof Ic }>> = {
  dzisiaj: { title: 'Dzisiaj', icon: 'home', lead: 'Podsumowanie dnia: wizyty, połączenia odebrane przez AI, nowe rezerwacje i to, co wymaga Twojej uwagi.', points: ['Plan dnia całego zespołu w jednym miejscu', 'Połączenia i rezerwacje z ostatnich godzin', 'Alerty: odwołania, spóźnienia, wolne okna'] },
  kalendarz: { title: 'Kalendarz', icon: 'calendar', lead: 'Kalendarz zespołu, do którego recepcja AI zapisuje klientów bezpośrednio z telefonu.', points: ['Kolumny pracowników i usługi z czasem trwania', 'Rezerwacje z telefonu, Booksy i Versum w jednym widoku', 'Powiadomienia push dla zespołu'] },
  rozmowy: { title: 'Rozmowy', icon: 'phone', lead: 'Każde połączenie odebrane przez AI: nagranie, transkrypcja i uzasadnienie decyzji.', points: ['Transkrypcje i streszczenia rozmów', 'Dlaczego AI podjęła daną decyzję', 'Oznaczanie rozmów do oddzwonienia'] },
  uslugi: { title: 'Usługi i grafik', icon: 'list', lead: 'Oferta z czasem trwania usług, zespół lub stoliki, grafiki pracy i dni wolne — podstawa kalendarza i recepcji AI.', points: ['Każda branża: ludzie, stoliki, sale, ekipy', 'Grafiki, przerwy i urlopy', 'Szablony dla Twojej branży'] },
  asystent: { title: 'Asystent AI', icon: 'sparkle', lead: 'Recepcja AI odbiera telefony, zapisuje klientów do kalendarza i pamięta ich przy kolejnym telefonie.', points: ['Naturalny, ludzki głos', 'Zna ofertę, ceny i wolne terminy na żywo', 'Rozmowa testowa w przeglądarce'] },
  klienci: { title: 'Klienci', icon: 'users', lead: 'Baza klientów budowana automatycznie z rozmów, rezerwacji i kart lojalnościowych.', points: ['Historia wizyt i rozmów klienta', 'Notatki i preferencje', 'Segmenty do kampanii'] },
  lojalnosc: { title: 'Lojalność', icon: 'card', lead: 'Karty lojalnościowe w Apple Wallet i Google Wallet nie są jeszcze włączone w Twoim pakiecie.', points: ['Własny projekt karty i pieczątek', 'Skaner dla obsługi na telefonie i laptopie', 'Powiadomienia push do klientów'] },
}

export function Locked({ tab, enabledButNotLive }: { tab: TabId; enabledButNotLive: boolean }) {
  const i = INFO[tab] ?? INFO.dzisiaj!
  const Icon = Ic[i.icon]
  return (
    <>
      <PageHead title={i.title} chip={<><Ic.lock width={13} height={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Zablokowany</>} />
      <div className="ap-locked">
        <div className="ap-locked__preview" aria-hidden="true"><DashboardMock /></div>
        <div className="ap-locked__card">
          <span className="ap-lock-ico g"><Icon width={24} height={24} /></span>
          <h2>Moduł niedostępny w Twoim pakiecie</h2>
          <p>{i.lead}</p>
          <ul>{i.points.map(p => <li key={p}><Ic.check width={15} height={15} />{p}</li>)}</ul>
          <p style={{ fontSize: 13 }}>{enabledButNotLive ? 'Moduł jest w Twoim pakiecie — włączymy go automatycznie, gdy będzie gotowy.' : 'Chcesz go włączyć? Napisz do nas: hello@tableflow.pl'}</p>
          <a className="btn btn--ghost btn--sm" href={`mailto:hello@tableflow.pl?subject=${encodeURIComponent(`TableFlow — moduł ${i.title}`)}`}>Zapytaj o dostęp</a>
        </div>
      </div>
    </>
  )
}
