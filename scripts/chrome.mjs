import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
export const puppeteer = createRequire(import.meta.url)('puppeteer-core')
export function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const base = join(homedir(), '.cache/puppeteer/chrome')
  if (existsSync(base)) {
    const dirs = readdirSync(base).filter(d => d.startsWith('mac_arm')).sort()
    for (const d of dirs.reverse()) {
      const p = join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
      if (existsSync(p)) return p
    }
  }
  // macOS app, then the Chrome preinstalled on GitHub's ubuntu runners / common Linux paths
  for (const sys of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(sys)) return sys
  }
  throw new Error('No Chrome found')
}
