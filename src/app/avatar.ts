/**
 * Profile pictures: any image → centred square 512×512 → WebP in the browser → storage "avatars/{uid}/avatar.webp"
 * (the bucket accepts image/webp only) → URL in auth user_metadata.avatar_url.
 * Canvas WebP encoding is native in Chrome/Firefox/Edge; Safari can't encode WebP, so there the
 * @jsquash/webp WASM encoder is loaded on demand.
 */
import { getValidSession, refresh } from '../lib/auth'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabase'
import { ApiError } from './api'

const SIZE = 512

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* older Safari */ }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new ApiError('bad_image')); i.src = url })
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
}

let nativeWebp: boolean | null = null
function canEncodeWebp() {
  if (nativeWebp == null) { const c = document.createElement('canvas'); c.width = c.height = 1; nativeWebp = c.toDataURL('image/webp').startsWith('data:image/webp') }
  return nativeWebp
}

export async function toWebpAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) throw new ApiError('bad_image')
  if (file.size > 20 * 1024 * 1024) throw new ApiError('too_big')
  const img = await decode(file)
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width, h = 'naturalHeight' in img ? img.naturalHeight : img.height
  const side = Math.min(w, h), out = Math.min(SIZE, side)
  const c = document.createElement('canvas'); c.width = c.height = out
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out)
  if (canEncodeWebp()) {
    const b = await new Promise<Blob | null>(r => c.toBlob(r, 'image/webp', .85))
    if (b && b.type === 'image/webp') return b
  }
  const { default: encode } = await import('@jsquash/webp/encode')
  const buf = await encode(ctx.getImageData(0, 0, out, out), { quality: 85 })
  return new Blob([buf], { type: 'image/webp' })
}

async function setMeta(token: string, avatar_url: string | null) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { method: 'PUT', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { avatar_url } }) })
  if (!r.ok) throw new ApiError('profile_failed')
}

export async function saveAvatar(file: File): Promise<string> {
  const webp = await toWebpAvatar(file)
  const s = await getValidSession(); if (!s) throw new ApiError('no_session')
  const path = `${s.user.id}/avatar.webp`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, { method: 'POST', body: webp, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'image/webp', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' } })
  if (!res.ok) throw new ApiError(res.status === 413 ? 'too_big' : 'upload_failed')
  const url = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`
  await setMeta(s.access_token, url)
  await refresh()
  return url
}

export async function removeAvatar(): Promise<void> {
  const s = await getValidSession(); if (!s) throw new ApiError('no_session')
  await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${s.user.id}/avatar.webp`, { method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}` } })
  await setMeta(s.access_token, null)
  await refresh()
}
