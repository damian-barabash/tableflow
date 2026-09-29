// Supabase Edge Function: account & membership management for /admin and /panel (Zespół).
// Uses the service role for the Auth Admin API; every action re-checks the caller's rights:
//  - platform admins (admin_profiles.role owner|admin) can do everything;
//  - company owners/managers can manage members of their own company (never platform roles).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (error: string, status = 400) => json({ error }, status)

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { ...svc, ...(init.headers || {}) } })
  const text = await r.text()
  let body: unknown = null; try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: r.ok, status: r.status, body: body as any }
}

async function caller(auth: string | null) {
  if (!auth) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: auth } })
  if (!r.ok) return null
  const u = await r.json()
  const adm = await rest(`/rest/v1/admin_profiles?select=role&user_id=eq.${u.id}`)
  const members = await rest(`/rest/v1/company_members?select=company_id,role&user_id=eq.${u.id}`)
  return { id: u.id as string, email: u.email as string, platform: (adm.body?.[0]?.role ?? null) as string | null, companies: (members.body ?? []) as { company_id: string; role: string }[] }
}
type Caller = NonNullable<Awaited<ReturnType<typeof caller>>>
const isSuper = (c: Caller) => c.platform === 'owner' || c.platform === 'admin'
const companyRole = (c: Caller, cid: string) => c.companies.find(m => m.company_id === cid)?.role ?? null
const canManage = (c: Caller, cid: string) => isSuper(c) || ['owner', 'manager'].includes(companyRole(c, cid) ?? '')

function password() {
  const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const b = crypto.getRandomValues(new Uint8Array(14))
  const s = Array.from(b, x => a[x % a.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}${'!#%*'[b[12] % 4]}${b[13] % 10}`
}
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && e.length <= 254
const ROLES = ['owner', 'manager', 'staff']

async function audit(c: Caller, action: string, target_type: string, target_id: string, detail: Record<string, unknown>, company_id?: string) {
  await rest('/rest/v1/audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor: c.id, actor_email: c.email, action, target_type, target_id, company_id: company_id ?? null, detail }) })
}
async function userByEmail(email: string) {
  // GoTrue has no direct lookup by e-mail: search the (small) user list
  for (let page = 1; page < 50; page++) {
    const r = await rest(`/auth/v1/admin/users?page=${page}&per_page=200`)
    const users = (r.body?.users ?? []) as { id: string; email: string }[]
    const u = users.find(x => x.email?.toLowerCase() === email.toLowerCase())
    if (u) return u
    if (users.length < 200) return null
  }
  return null
}
async function addMember(cid: string, uid: string, role: string, name: string | null, email: string) {
  return rest('/rest/v1/company_members?on_conflict=company_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ company_id: cid, user_id: uid, role, display_name: name, email }) })
}
/** a company must always keep at least one owner */
async function ownersLeft(cid: string, exceptUser: string) {
  const r = await rest(`/rest/v1/company_members?select=user_id&company_id=eq.${cid}&role=eq.owner&user_id=neq.${exceptUser}`)
  return (r.body ?? []).length
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('method', 405)
  const c = await caller(req.headers.get('Authorization'))
  if (!c) return fail('unauthorized', 401)
  let body: Record<string, any> = {}
  try { body = await req.json() } catch { return fail('bad_json') }
  const action = String(body.action ?? '')

  try {
    switch (action) {
      // ---------- create an account (optionally attached to a company) ----------
      case 'create_user': {
        const email = String(body.email ?? '').trim().toLowerCase()
        const name = String(body.name ?? '').trim().slice(0, 80) || null
        const cid = body.company_id ? String(body.company_id) : null
        const role = ROLES.includes(body.role) ? body.role : 'staff'
        const platformRole = body.platform_role ? String(body.platform_role) : null
        if (!emailOk(email)) return fail('invalid_email')
        if (cid ? !canManage(c, cid) : !isSuper(c)) return fail('forbidden', 403)
        if (platformRole && !isSuper(c)) return fail('forbidden', 403)
        if (cid && role === 'owner' && !isSuper(c) && companyRole(c, cid) !== 'owner') return fail('forbidden', 403)
        if (platformRole && !['admin', 'moderator', 'viewer'].includes(platformRole)) return fail('invalid_role')
        const existing = await userByEmail(email)
        let uid: string, pw: string | null = null
        if (existing) {
          if (!cid) return fail('exists', 409)
          uid = existing.id   // attach the existing account, keep its password
        } else {
          pw = typeof body.password === 'string' && body.password.length >= 8 ? body.password : password()
          const r = await rest('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: name } }) })
          if (!r.ok) return fail(r.body?.msg || r.body?.message || 'create_failed', 400)
          uid = r.body.id
        }
        if (cid) { const m = await addMember(cid, uid, role, name, email); if (!m.ok) return fail('member_failed', 400) }
        if (platformRole) await rest('/rest/v1/admin_profiles?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: uid, role: platformRole, display_name: name }) })
        await audit(c, existing ? 'attach_user' : 'create_user', 'user', uid, { email, role: cid ? role : platformRole }, cid ?? undefined)
        return json({ user_id: uid, email, password: pw, existing: !!existing })
      }

      // ---------- membership ----------
      case 'update_member': {
        const cid = String(body.company_id), uid = String(body.user_id)
        if (!canManage(c, cid)) return fail('forbidden', 403)
        const patch: Record<string, unknown> = {}
        if (body.role !== undefined) {
          if (!ROLES.includes(body.role)) return fail('invalid_role')
          if ((body.role === 'owner' || companyRole(c, cid) === 'manager') && !isSuper(c) && companyRole(c, cid) !== 'owner') return fail('forbidden', 403)
          if (body.role !== 'owner' && !(await ownersLeft(cid, uid))) {
            const cur = await rest(`/rest/v1/company_members?select=role&company_id=eq.${cid}&user_id=eq.${uid}`)
            if (cur.body?.[0]?.role === 'owner') return fail('last_owner')
          }
          patch.role = body.role
        }
        if (body.name !== undefined) patch.display_name = String(body.name).slice(0, 80)
        const r = await rest(`/rest/v1/company_members?company_id=eq.${cid}&user_id=eq.${uid}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
        if (body.name !== undefined) await rest(`/auth/v1/admin/users/${uid}`, { method: 'PUT', body: JSON.stringify({ user_metadata: { full_name: patch.display_name } }) })
        return r.ok ? json({ ok: true }) : fail('update_failed')
      }
      case 'remove_member': {
        const cid = String(body.company_id), uid = String(body.user_id)
        if (!canManage(c, cid)) return fail('forbidden', 403)
        const cur = await rest(`/rest/v1/company_members?select=role&company_id=eq.${cid}&user_id=eq.${uid}`)
        const role = cur.body?.[0]?.role
        if (role === 'owner' && !isSuper(c) && companyRole(c, cid) !== 'owner') return fail('forbidden', 403)
        if (role === 'owner' && !(await ownersLeft(cid, uid))) return fail('last_owner')
        await rest(`/rest/v1/company_members?company_id=eq.${cid}&user_id=eq.${uid}`, { method: 'DELETE' })
        // accounts that only existed for this company are deleted with it (staff logins)
        const other = await rest(`/rest/v1/company_members?select=company_id&user_id=eq.${uid}`)
        const adm = await rest(`/rest/v1/admin_profiles?select=role&user_id=eq.${uid}`)
        let deleted = false
        if (body.delete_account && !(other.body ?? []).length && !(adm.body ?? []).length && uid !== c.id) {
          await rest('/storage/v1/object/avatars', { method: 'DELETE', body: JSON.stringify({ prefixes: [`${uid}/avatar.webp`] }) })
          await rest(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' }); deleted = true
        }
        await audit(c, 'remove_member', 'user', uid, { deleted }, cid)
        return json({ ok: true, deleted })
      }

      // ---------- passwords ----------
      case 'reset_password': {
        const uid = String(body.user_id)
        if (!isSuper(c)) {
          // a manager may reset passwords only of accounts that belong solely to their companies
          const m = await rest(`/rest/v1/company_members?select=company_id&user_id=eq.${uid}`)
          const cids = (m.body ?? []).map((x: { company_id: string }) => x.company_id)
          const adm = await rest(`/rest/v1/admin_profiles?select=role&user_id=eq.${uid}`)
          if (!cids.length || (adm.body ?? []).length || !cids.every((id: string) => canManage(c, id))) return fail('forbidden', 403)
        }
        const pw = password()
        const r = await rest(`/auth/v1/admin/users/${uid}`, { method: 'PUT', body: JSON.stringify({ password: pw }) })
        if (!r.ok) return fail('reset_failed')
        await audit(c, 'reset_password', 'user', uid, {})
        return json({ password: pw })
      }

      // ---------- platform (admin only) ----------
      case 'set_platform_role': {
        if (!isSuper(c)) return fail('forbidden', 403)
        const uid = String(body.user_id), role = body.role ? String(body.role) : null
        if (uid === c.id) return fail('self')
        if (role && !['owner', 'admin', 'moderator', 'viewer'].includes(role)) return fail('invalid_role')
        if (role) await rest('/rest/v1/admin_profiles?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: uid, role }) })
        else await rest(`/rest/v1/admin_profiles?user_id=eq.${uid}`, { method: 'DELETE' })
        return json({ ok: true })
      }
      case 'delete_user': {
        if (!isSuper(c)) return fail('forbidden', 403)
        const uid = String(body.user_id)
        if (uid === c.id) return fail('self')
        await rest('/storage/v1/object/avatars', { method: 'DELETE', body: JSON.stringify({ prefixes: [`${uid}/avatar.webp`] }) })
        const r = await rest(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' })
        await audit(c, 'delete_user', 'user', uid, { email: body.email ?? null })
        return r.ok ? json({ ok: true }) : fail('delete_failed')
      }
      default: return fail('unknown_action')
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'error', 500)
  }
})
