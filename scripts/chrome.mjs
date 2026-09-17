import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
export const puppeteer = createRequire(import.meta.url)('puppeteer-core')
export function chromePath() {
  const base = join(homedir(), '.cache/puppeteer/chrome')
  if (existsSync(base)) {
    const dirs = readdirSync(base).filter(d => d.startsWith('mac_arm')).sort()
    for (const d of dirs.reverse()) {
      const p = join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
      if (existsSync(p)) return p
    }
  }
  const sys = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (existsSync(sys)) return sys
  throw new Error('No Chrome found')
}
