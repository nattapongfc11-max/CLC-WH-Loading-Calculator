// Container photos API (Supabase Edge Function "photos"). Image files live in a PRIVATE Cloudflare R2 bucket:
// the browser uploads/downloads directly with short-lived presigned URLs that this function hands out after checking the caller's role.
// Pure logic – all I/O comes in through `getDeps`, so it is unit-tested in Node (tests/photos.test.js).
export const MAX_BYTES = 3_000_000;
export const WRITE_ROLES = ['admin', 'logistics', 'warehouse'];
export const UPLOAD_TTL = 600, VIEW_TTL = 900;
const DEFAULT_ORIGINS = ['https://nattapongfc11-max.github.io', 'http://localhost:8000', 'http://localhost:8080', 'http://127.0.0.1:8000'];

// ---- R2 secrets: normalised + validated here (pure; the result NEVER contains a secret value, only names / lengths) ----
const clean = v => String(v == null ? '' : v).trim();
export function r2Settings(env = {}) {
  const raw = clean(env.R2_ACCOUNT_ID);
  // tolerate a pasted endpoint (https://<id>.r2.cloudflarestorage.com[/bucket]) and stray spaces / new lines
  const accountId = raw.replace(/^https?:\/\//i, '').replace(/\.r2\.cloudflarestorage\.com.*$/i, '').replace(/[/\s]+$/, '');
  const cfg = { accountId, accessKeyId: clean(env.R2_ACCESS_KEY_ID), secretAccessKey: clean(env.R2_SECRET_ACCESS_KEY), bucket: clean(env.R2_BUCKET) };
  const problems = [], p = (name, message) => problems.push({ name, message });
  if (!raw) p('R2_ACCOUNT_ID', 'ยังไม่ได้ตั้งค่า');
  else if (!/^[0-9a-f]{32}$/i.test(accountId)) p('R2_ACCOUNT_ID', 'ต้องเป็นรหัส 32 ตัว (0-9, a-f) แต่ค่าที่ตั้งไว้ยาว ' + accountId.length + ' ตัว' + (/[^0-9a-f]/i.test(accountId) ? ' และมีอักขระอื่นปน' : ''));
  if (!cfg.accessKeyId) p('R2_ACCESS_KEY_ID', 'ยังไม่ได้ตั้งค่า');
  else if (/\s/.test(cfg.accessKeyId) || cfg.accessKeyId.length < 16) p('R2_ACCESS_KEY_ID', 'รูปแบบไม่ถูกต้อง (ยาว ' + cfg.accessKeyId.length + ' ตัว หรือมีช่องว่างปน)');
  if (!cfg.secretAccessKey) p('R2_SECRET_ACCESS_KEY', 'ยังไม่ได้ตั้งค่า');
  else if (/\s/.test(cfg.secretAccessKey) || cfg.secretAccessKey.length < 32) p('R2_SECRET_ACCESS_KEY', 'รูปแบบไม่ถูกต้อง (ยาว ' + cfg.secretAccessKey.length + ' ตัว หรือมีช่องว่างปน)');
  if (!cfg.bucket) p('R2_BUCKET', 'ยังไม่ได้ตั้งค่า');
  else if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(cfg.bucket)) p('R2_BUCKET', 'ชื่อ bucket ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และ - เท่านั้น (3–63 ตัว)');
  return { cfg, problems };
}
const problemText = pr => pr.map(x => x.name + ': ' + x.message).join('; ');

// Turns the raw answer of a signed test request to R2 (see makeR2().check in index.ts) into a human message.
export function interpretCheck(res = {}) {
  const { status, code, error } = res;
  if (error) return { ok: false, code: 'network', message: 'ต่อ Cloudflare R2 ไม่ได้ — ชื่อโฮสต์ผิด (ตรวจ R2_ACCOUNT_ID) หรือเซิร์ฟเวอร์ R2 ไม่ตอบ' };
  if (status === 200 || (status === 404 && code === 'NoSuchKey')) return { ok: true, code: 'ok', status, message: '✅ ฟังก์ชันต่อ R2 ได้ — Account ID, bucket และ Access Key ถูกต้อง' };
  const known = {
    NoSuchBucket: 'ไม่พบ bucket ตามชื่อใน R2_BUCKET (หรือ R2_ACCOUNT_ID เป็นของคนละบัญชี)',
    InvalidAccessKeyId: 'R2_ACCESS_KEY_ID ไม่ถูกต้อง (หรือ token ถูกลบ/หมดอายุ)',
    SignatureDoesNotMatch: 'R2_SECRET_ACCESS_KEY ไม่ถูกต้อง หรือไม่ตรงกับ Access Key ID',
    AccessDenied: 'token ไม่มีสิทธิ์ใช้ bucket นี้ — ต้องเป็น Object Read & Write และเลือก bucket นี้ (หรือ bucket ไม่มีอยู่)'
  };
  if (known[code]) return { ok: false, code, status, message: known[code] };
  if (status === 403) return { ok: false, code: code || 'forbidden', status, message: known.AccessDenied };
  return { ok: false, code: code || 'http_' + status, status, message: 'R2 ตอบ HTTP ' + status + (code ? ' (' + code + ')' : '') };
}

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

    const problems = r2 ? [] : r2Settings(deps.env || {}).problems;
    if (action === 'status') return send(200, { configured: !!r2, role, canWrite, maxBytes: MAX_BYTES, problems });
    if (action === 'check') { // self-test of the R2 secrets: format first, then one signed request to R2 (reports which secret is wrong, never its value)
      if (!canWrite) return send(403, { error: 'forbidden', message: 'Your role cannot run the R2 check' });
      if (!r2) return send(200, { ok: false, code: 'config', message: 'ตั้งค่า secrets ของ R2 ไม่ครบหรือรูปแบบไม่ถูกต้อง', problems });
      let res; try { res = await r2.check(); } catch (e) { res = { error: String((e && e.message) || e) }; }
      return send(200, interpretCheck(res));
    }
    if (!r2) return send(503, { error: 'r2_not_configured', message: 'Cloudflare R2 is not configured' + (problems.length ? ' — ' + problemText(problems) : ' (see README: container photos)'), problems });

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
