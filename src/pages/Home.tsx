import { Hero } from '../components/Hero'
import { Voices } from '../components/Voices'
import { Stats } from '../components/Stats'
import { Platform } from '../components/Platform'
import { Industries } from '../components/Industries'
import { History } from '../components/History'
import { Loyalty } from '../components/Loyalty'
import { AppSection } from '../components/AppSection'
import { Faq } from '../components/Faq'
import { Waitlist } from '../components/Waitlist'
import { useReveal } from '../lib/useReveal'
import { useParallax } from '../lib/useParallax'
import { useDesync } from '../lib/useDesync'
import { useI18n } from '../i18n'

export function Home({ ready }: { ready: boolean }) {
  const { locale } = useI18n()
  useReveal(`${ready}-${locale}`)
  useParallax(`${ready}-${locale}`)
  useDesync(`${ready}-${locale}`)
  return (
    <main>
      <Hero ready={ready} />
      <Voices />
      <Stats />
      <Platform />
      <Industries />
      <History />
      <Loyalty />
      <AppSection />
      <Faq />
      <Waitlist />
    </main>
  )
}
