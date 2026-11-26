// Edge Function "photos" (container photos in Cloudflare R2): authorisation, validation and key rules with in-memory fakes.
const path = require('path');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

(async () => {
  const { createHandler, keyPrefix, safeId, MAX_BYTES } = await import(path.join(__dirname, '..', 'supabase', 'functions', 'photos', 'handler.mjs'));

  // ---- in-memory fakes -------------------------------------------------------------------
  const mk = (role, o = {}) => {
    const store = o.store || new Map();          // r2 objects: key -> {bytes, contentType}
    const rows = o.rows || [];                   // delivery_photos
    const plans = o.plans || new Set(['CLC-1']);
    const log = [];
    const r2 = o.noR2 ? null : {
      presignPut: async (k, ct, ttl) => `https://r2.test/${k}?put&ct=${ct}&ttl=${ttl}`,
      presignGet: async (k, ttl) => `https://r2.test/${k}?get&ttl=${ttl}`,
      head: async k => store.get(k) || null,
      del: async k => { log.push('del ' + k); store.delete(k); }
    };
    const db = {
      getByPlanSlot: async (p, s) => rows.find(r => r.plan_id === p && r.slot === s) || null,
      listByPlan: async p => rows.filter(r => r.plan_id === p).sort((a, b) => a.slot - b.slot),
      upsert: async row => { if (!plans.has(row.plan_id)) return { error: 'plan_not_found' }; const i = rows.findIndex(r => r.plan_id === row.plan_id && r.slot === row.slot); const full = { ...row, uploaded_at: '2026-11-26T00:00:00Z' }; if (i >= 0) rows[i] = full; else rows.push(full); return full; },
      remove: async (p, s) => { const i = rows.findIndex(r => r.plan_id === p && r.slot === s); if (i >= 0) rows.splice(i, 1); },
      removeAll: async p => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].plan_id === p) rows.splice(i, 1); }
    };
    const handler = createHandler(async () => ({ env: {}, rand: () => 'abc123', auth: role === null ? null : { role: role === 'none' ? null : role, r2, db } }));
    const call = async (body, method = 'POST', hdr = {}) => {
      const res = await handler(new Request('https://fn.test/photos', { method, headers: { origin: 'https://nattapongfc11-max.github.io', ...hdr }, body: method === 'POST' ? JSON.stringify(body) : undefined }));
      let j = null; try { j = await res.json(); } catch {}
      return { s: res.status, j, h: res.headers };
    };
    return { call, store, rows, log };
  };

  // ---- auth & roles ---------------------------------------------------------------------
  ok((await mk(null).call({ action: 'status' })).s === 401, 'no valid session -> 401');
  ok((await mk('none').call({ action: 'status' })).s === 403, 'signed in but no role -> 403');
  const st = (await mk('viewer').call({ action: 'status' })).j;
  ok(st.configured === true && st.canWrite === false && st.role === 'viewer', 'status: viewer can read but not write');
  ok((await mk('warehouse').call({ action: 'status' })).j.canWrite === true, 'status: warehouse can write');
  ok((await mk('admin', { noR2: true }).call({ action: 'status' })).j.configured === false, 'status reports R2 not configured');
  const nr = await mk('admin', { noR2: true }).call({ action: 'sign-upload', planId: 'CLC-1', slot: 1, contentType: 'image/jpeg' });
  ok(nr.s === 503 && nr.j.error === 'r2_not_configured', 'other actions -> 503 until R2 secrets are set');

  // ---- CORS -----------------------------------------------------------------------------
  const pre = await mk('admin').call(null, 'OPTIONS');
  ok(pre.s === 204 && pre.h.get('access-control-allow-origin') === 'https://nattapongfc11-max.github.io' && /authorization/.test(pre.h.get('access-control-allow-headers')), 'CORS preflight allows the GitHub Pages site');
  const evil = await mk('admin').call({ action: 'status' }, 'POST', { origin: 'https://evil.example' });
  ok(evil.h.get('access-control-allow-origin') !== 'https://evil.example', 'unknown origin is not echoed back');
  ok((await mk('admin').call({}, 'GET')).s === 405, 'GET -> 405');

  // ---- sign-upload ----------------------------------------------------------------------
  const v = mk('viewer');
  ok((await v.call({ action: 'sign-upload', planId: 'CLC-1', slot: 1, contentType: 'image/jpeg' })).s === 403, 'viewer cannot upload');
  for (const r of ['admin', 'logistics', 'warehouse']) ok((await mk(r).call({ action: 'sign-upload', planId: 'CLC-1', slot: 3, contentType: 'image/jpeg' })).s === 200, r + ' can upload');
  const w = mk('warehouse');
  const su = await w.call({ action: 'sign-upload', planId: 'CLC-1', slot: 2, contentType: 'image/jpeg' });
  ok(su.j.key === 'plans/CLC-1/slot2-abc123.jpg' && /\?put&ct=image\/jpeg&ttl=600$/.test(su.j.url) && su.j.headers['Content-Type'] === 'image/jpeg', 'sign-upload returns key under plans/<plan>/slot<n>- and a 10 min PUT url');
  ok((await w.call({ action: 'sign-upload', planId: 'CLC-1', slot: 6, contentType: 'image/jpeg' })).s === 400 && (await w.call({ action: 'sign-upload', planId: 'CLC-1', slot: 0, contentType: 'image/jpeg' })).s === 400 && (await w.call({ action: 'sign-upload', planId: '', slot: 1, contentType: 'image/jpeg' })).s === 400, 'slot must be 1-5 and planId required');
  ok((await w.call({ action: 'sign-upload', planId: 'CLC-1', slot: 1, contentType: 'image/png' })).s === 400, 'only image/jpeg accepted');
  ok(safeId('CLC/../x y') === 'CLC_.._x_y' && keyPrefix('a/b', 1) === 'plans/a_b/slot1-', 'plan ids are sanitised inside object keys');

  // ---- commit ---------------------------------------------------------------------------
  const key = 'plans/CLC-1/slot1-abc123.jpg';
  const c = mk('warehouse'); c.store.set(key, { bytes: 480000, contentType: 'image/jpeg' });
  const cm = await c.call({ action: 'commit', planId: 'CLC-1', slot: 1, key });
  ok(cm.s === 200 && cm.j.photo.object_key === key && cm.j.photo.bytes === 480000 && c.rows.length === 1, 'commit verifies the object in R2 and records it');
  ok((await c.call({ action: 'commit', planId: 'CLC-1', slot: 1, key: 'plans/OTHER/slot1-x.jpg' })).s === 400, 'commit rejects a key that does not belong to the plan/slot');
  ok((await c.call({ action: 'commit', planId: 'CLC-1', slot: 4, key: 'plans/CLC-1/slot4-nothing.jpg' })).s === 404, 'commit without an uploaded object -> 404');
  const key2 = 'plans/CLC-1/slot1-new999.jpg'; c.store.set(key2, { bytes: 300000, contentType: 'image/jpeg' });
  await c.call({ action: 'commit', planId: 'CLC-1', slot: 1, key: key2 });
  ok(c.rows.length === 1 && c.rows[0].object_key === key2 && !c.store.has(key) && c.store.has(key2), 'replacing a slot deletes the previous file from R2');
  const big = mk('warehouse'); big.store.set('plans/CLC-1/slot2-big.jpg', { bytes: MAX_BYTES + 1, contentType: 'image/jpeg' });
  const bg = await big.call({ action: 'commit', planId: 'CLC-1', slot: 2, key: 'plans/CLC-1/slot2-big.jpg' });
  ok(bg.s === 413 && !big.store.has('plans/CLC-1/slot2-big.jpg') && big.rows.length === 0, 'oversized upload is rejected and removed from R2');
  const wt = mk('warehouse'); wt.store.set('plans/CLC-1/slot2-t.jpg', { bytes: 1000, contentType: 'text/html' });
  ok((await wt.call({ action: 'commit', planId: 'CLC-1', slot: 2, key: 'plans/CLC-1/slot2-t.jpg' })).s === 415 && !wt.store.has('plans/CLC-1/slot2-t.jpg'), 'non-JPEG upload is rejected and removed');
  const np = mk('warehouse', { plans: new Set() }); np.store.set(key, { bytes: 1000, contentType: 'image/jpeg' });
  ok((await np.call({ action: 'commit', planId: 'CLC-1', slot: 1, key })).s === 404 && !np.store.has(key), 'commit for an unknown plan -> 404 and the file is removed');
  ok((await mk('viewer').call({ action: 'commit', planId: 'CLC-1', slot: 1, key })).s === 403, 'viewer cannot commit');

  // ---- sign-view / delete / purge --------------------------------------------------------
  const rows = [{ plan_id: 'CLC-1', slot: 1, object_key: key2, bytes: 300000, uploaded_at: 'x' }, { plan_id: 'CLC-1', slot: 3, object_key: 'plans/CLC-1/slot3-q.jpg', bytes: 1, uploaded_at: 'y' }, { plan_id: 'CLC-2', slot: 1, object_key: 'plans/CLC-2/slot1-z.jpg', bytes: 1, uploaded_at: 'z' }];
  const sv = await mk('viewer', { rows: rows.map(r => ({ ...r })) }).call({ action: 'sign-view', planId: 'CLC-1' });
  ok(sv.s === 200 && sv.j.photos.length === 2 && sv.j.photos[0].slot === 1 && /\?get&ttl=900$/.test(sv.j.photos[0].url), 'viewer can get 15 min view links, only for that plan');
  const d = mk('warehouse', { rows: rows.map(r => ({ ...r })) }); d.store.set(key2, { bytes: 1, contentType: 'image/jpeg' });
  ok((await d.call({ action: 'delete', planId: 'CLC-1', slot: 1 })).j.deleted === true && d.rows.length === 2 && d.log.includes('del ' + key2), 'delete removes the file and the row');
  ok((await d.call({ action: 'delete', planId: 'CLC-1', slot: 5 })).s === 404, 'delete of an empty slot -> 404');
  ok((await mk('viewer', { rows: rows.map(r => ({ ...r })) }).call({ action: 'delete', planId: 'CLC-1', slot: 1 })).s === 403, 'viewer cannot delete');
  const pg = mk('admin', { rows: rows.map(r => ({ ...r })) });
  const pr = await pg.call({ action: 'purge', planId: 'CLC-1' });
  ok(pr.j.purged === 2 && pg.rows.length === 1 && pg.rows[0].plan_id === 'CLC-2' && pg.log.length === 2, 'purge removes every photo of one plan (before the plan is deleted)');
  ok((await mk('admin').call({ action: 'nope' })).s === 400, 'unknown action -> 400');
  const boom = createHandler(async () => ({ env: {}, rand: () => 'x', auth: { role: 'admin', db: { listByPlan: async () => { throw new Error('db down') } }, r2: {} } }));
  const br = await boom(new Request('https://fn.test/', { method: 'POST', body: JSON.stringify({ action: 'sign-view', planId: 'P' }) }));
  ok(br.status === 502, 'upstream failures are reported as 502, not a crash');

  // ---- presign shape (aws4fetch) ---------------------------------------------------------
  let AwsClient = null; try { ({ AwsClient } = require('aws4fetch')); } catch {}
  if (AwsClient) {
    const aws = new AwsClient({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret', service: 's3', region: 'auto' });
    const u = new URL('https://acct.r2.cloudflarestorage.com/bucket/plans/CLC-1/slot1-a.jpg'); u.searchParams.set('X-Amz-Expires', '600');
    const s = await aws.sign(u.toString(), { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, aws: { signQuery: true } });
    const q = new URL(s.url).searchParams;
    ok(q.get('X-Amz-Expires') === '600' && /AWS4-HMAC-SHA256/.test(q.get('X-Amz-Algorithm')) && q.get('X-Amz-SignedHeaders')==='host' && /^[0-9a-f]{64}$/.test(q.get('X-Amz-Signature')) && /\/auto\/s3\/aws4_request/.test(q.get('X-Amz-Credential')), 'presigned PUT: SigV4 query signature with 10 min expiry (type/size are verified at commit)');
  } else console.log('SKIP presign shape test (aws4fetch not installed)');

  console.log(fail ? 'FAILED ' + fail : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
