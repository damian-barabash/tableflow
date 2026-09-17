/** Generates public/qr-karta.svg — the real QR printed on the loyalty-card mockups. */
import { writeFileSync } from 'node:fs'
import QRCode from 'qrcode'
const url = 'https://tableflow.pl/karta?src=qr'
const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#1a1916', light: '#0000' } })
writeFileSync('public/qr-karta.svg', svg.replace('<svg ', '<svg role="img" aria-label="QR: tableflow.pl/karta" '))
console.log('qr →', url)
