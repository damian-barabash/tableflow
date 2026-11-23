/**
 * Industry landing pages — light metadata (in the main bundle: routes, links, <head>).
 * The page content lives in industry-content.ts and loads with the page (lazy chunk).
 */
export interface IndustryMeta {
  slug: string
  /** short name for links and breadcrumbs */
  name: string
  /** home carousel scenario id (industries.scenarios[].id) */
  scenario?: string
  title: string
  description: string
}

export const INDUSTRIES: IndustryMeta[] = [
  { slug: 'recepcja-ai-barbershop', name: 'Barbershop', scenario: 'barber', title: 'Recepcja AI dla barbershopu — telefon odbiera się sam | TableFlow AI', description: 'Asystent głosowy AI dla barbershopu: odbiera telefony 24/7, zapisuje do konkretnego barbera, przenosi i odwołuje wizyty. Ty strzyżesz, telefon nie przerywa.' },
  { slug: 'recepcja-ai-salon-fryzjerski', name: 'Salon fryzjerski', title: 'Wirtualna recepcjonistka dla salonu fryzjerskiego | TableFlow AI', description: 'Recepcja AI dla salonu fryzjerskiego: odbiera telefony, dobiera czas usługi (koloryzacja, strzyżenie, modelowanie) i zapisuje do stylistki. Działa 24/7.' },
  { slug: 'recepcja-ai-salon-kosmetyczny', name: 'Salon kosmetyczny', scenario: 'beauty', title: 'Recepcja AI dla salonu kosmetycznego i beauty | TableFlow AI', description: 'Asystent AI dla salonu kosmetycznego: odbiera telefony, umawia manicure, zabiegi i depilację, przenosi wizyty i pamięta stałe klientki. Bez przerywania zabiegów.' },
  { slug: 'recepcja-ai-restauracja', name: 'Restauracja', scenario: 'resto', title: 'Rezerwacja stolików przez telefon z AI — restauracja | TableFlow AI', description: 'Recepcja AI dla restauracji: przyjmuje rezerwacje stolików przez telefon 24/7, dobiera stolik do liczby gości, zapisuje notatki (urodziny, alergie) i odpowiada na pytania.' },
  { slug: 'recepcja-ai-kawiarnia', name: 'Kawiarnia', scenario: 'cafe', title: 'Asystent telefoniczny AI dla kawiarni — rezerwacje i warsztaty | TableFlow AI', description: 'Recepcja AI dla kawiarni: rezerwuje stoliki i miejsca na warsztaty, odpowiada na pytania o godziny i ofertę, a stałych gości zaprasza do karty lojalnościowej w Wallet.' },
  { slug: 'recepcja-ai-gabinet', name: 'Gabinet', title: 'Rejestracja telefoniczna AI dla gabinetu i fizjoterapii | TableFlow AI', description: 'Wirtualna rejestracja dla gabinetu, fizjoterapii, psychologa czy dietetyka: AI odbiera telefony, zapisuje na wizyty do specjalisty, przenosi terminy i zostawia prośby o kontakt.' },
  { slug: 'recepcja-ai-warsztat-samochodowy', name: 'Warsztat samochodowy', scenario: 'garage', title: 'Recepcja AI dla warsztatu i wulkanizacji — umawianie przez telefon | TableFlow AI', description: 'Asystent AI dla warsztatu samochodowego i wulkanizacji: odbiera telefony, umawia wymianę opon, przegląd i serwis na wolne stanowisko, w sezonie też po godzinach.' },
]

export const industryBySlug = (slug: string) => INDUSTRIES.find(i => i.slug === slug) ?? null
export const industryByScenario = (id: string) => INDUSTRIES.find(i => i.scenario === id) ?? null
