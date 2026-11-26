// Container photos API (Supabase Edge Function "photos"). Image files live in a PRIVATE Cloudflare R2 bucket:
// the browser uploads/downloads directly with short-lived presigned URLs that this function hands out after checking the caller's role.
// Pure logic – all I/O comes in through `getDeps`, so it is unit-tested in Node (tests/photos.test.js).
export const MAX_BYTES = 3_000_000;
export const WRITE_ROLES = ['admin', 'logistics', 'warehouse'];
export const UPLOAD_TTL = 600, VIEW_TTL = 900;
const DEFAULT_ORIGINS = ['https://nattapongfc11-max.github.io', 'http://localhost:8000', 'http://localhost:8080', 'http://127.0.0.1:8000'];

export const safeId = s => String(s).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
export const keyPrefix = (planId, slot) => `plans/${safeId(planId)}/slot${slot}-`;

function cors(req, env) {
  const origins = (env.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS).split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_ORIGINS);
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': origins.includes(o) ? o : origins[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

export function createHandler(getDeps) {
  return async function handler(req) {
    const deps = await getDeps(req);
    const H = { ...cors(req, deps.env || {}), 'Content-Type': 'application/json' };
    const send = (status, body) => new Response(JSON.stringify(body), { status, headers: H });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });

    let body;
    try { body = await req.json(); } catch { return send(400, { error: 'bad_json' }); }
    const action = body && body.action;

    if (!deps.auth) return send(401, { error: 'unauthorized', message: 'Please sign in again' });
    const { role, db, r2 } = deps.auth;
    if (!role) return send(403, { error: 'no_role', message: 'Your account has no role yet' });
    const canWrite = WRITE_ROLES.includes(role);

    if (action === 'status') return send(200, { configured: !!r2, role, canWrite, maxBytes: MAX_BYTES });
    if (!r2) return send(503, { error: 'r2_not_configured', message: 'Cloudflare R2 is not configured (see README: container photos)' });

    const planId = body.planId == null ? '' : String(body.planId).trim();
    const slot = Number(body.slot);
    const needPlan = () => (!planId || planId.length > 100) ? 'planId required' : null;
    const needSlot = () => (!Number.isInteger(slot) || slot < 1 || slot > 5) ? 'slot must be 1-5' : null;
    const needWrite = () => canWrite ? null : 'forbidden';
    const bad = m => send(400, { error: 'bad_request', message: m });

    try {
      if (action === 'sign-upload') {
        if (needWrite()) return send(403, { error: 'forbidden', message: 'Your role cannot upload photos' });
        if (needPlan() || needSlot()) return bad(needPlan() || needSlot());
        if (body.contentType !== 'image/jpeg') return bad('contentType must be image/jpeg');
        const key = keyPrefix(planId, slot) + deps.rand() + '.jpg';
        const url = await r2.presignPut(key, 'image/jpeg', UPLOAD_TTL);
        return send(200, { key, url, expires: UPLOAD_TTL, headers: { 'Content-Type': 'image/jpeg' }, /* not part of the signature: type + size are verified in 'commit' */ maxBytes: MAX_BYTES });
      }

      if (action === 'commit') {
        if (needWrite()) return send(403, { error: 'forbidden', message: 'Your role cannot upload photos' });
        if (needPlan() || needSlot()) return bad(needPlan() || needSlot());
        const key = String(body.key || '');
        if (!key.startsWith(keyPrefix(planId, slot)) || key.includes('..')) return bad('key does not match plan/slot');
        const head = await r2.head(key);
        if (!head) return send(404, { error: 'object_missing', message: 'Upload not found in R2' });
        if (head.bytes > MAX_BYTES) { await r2.del(key); return send(413, { error: 'too_large', message: 'Photo is larger than ' + MAX_BYTES + ' bytes' }); }
        if (head.contentType !== 'image/jpeg') { await r2.del(key); return send(415, { error: 'bad_type', message: 'Only JPEG photos are accepted' }); }
        const prev = await db.getByPlanSlot(planId, slot);
        const saved = await db.upsert({ plan_id: planId, slot, object_key: key, content_type: 'image/jpeg', bytes: head.bytes });
        if (saved && saved.error === 'plan_not_found') { await r2.del(key); return send(404, { error: 'plan_not_found', message: 'Plan ' + planId + ' does not exist' }); }
        if (prev && prev.object_key && prev.object_key !== key) await r2.del(prev.object_key);
        return send(200, { photo: saved });
      }

      if (action === 'sign-view') {
        if (needPlan()) return bad(needPlan());
        const rows = await db.listByPlan(planId);
        const photos = await Promise.all(rows.map(async r => ({ slot: r.slot, bytes: r.bytes, uploaded_at: r.uploaded_at, url: await r2.presignGet(r.object_key, VIEW_TTL) })));
        return send(200, { photos, expires: VIEW_TTL });
      }

      if (action === 'delete') {
        if (needWrite()) return send(403, { error: 'forbidden', message: 'Your role cannot delete photos' });
        if (needPlan() || needSlot()) return bad(needPlan() || needSlot());
        const row = await db.getByPlanSlot(planId, slot);
        if (!row) return send(404, { error: 'not_found' });
        await r2.del(row.object_key);
        await db.remove(planId, slot);
        return send(200, { deleted: true });
      }

      if (action === 'purge') { // used before a plan is deleted, so no orphan files stay in R2
        if (needWrite()) return send(403, { error: 'forbidden', message: 'Your role cannot delete photos' });
        if (needPlan()) return bad(needPlan());
        const rows = await db.listByPlan(planId);
        for (const r of rows) await r2.del(r.object_key);
        await db.removeAll(planId);
        return send(200, { purged: rows.length });
      }

      return bad('unknown action');
    } catch (e) {
      return send(502, { error: 'upstream_error', message: String((e && e.message) || e) });
    }
  };
}
