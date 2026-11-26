// Supabase Edge Function: photos  (deploy with verify_jwt = false; the handler authenticates the caller itself with auth.getUser()).
// Secrets to set in Supabase → Edge Functions → Secrets:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET   (optional: ALLOWED_ORIGINS="https://site1,https://site2")
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { createHandler, r2Settings } from './handler.mjs';

const env = Deno.env.toObject();

function makeR2() {
  // values are trimmed/validated by r2Settings(); wrong or missing secrets -> null, and `status` / `check` report which one
  const { cfg, problems } = r2Settings(env);
  if (problems.length) return null;
  const aws = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: 's3', region: 'auto' });
  const base = (key: string) => `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const presign = async (method: string, key: string, ttl: number, contentType?: string) => {
    const url = new URL(base(key));
    url.searchParams.set('X-Amz-Expires', String(ttl));
    const signed = await aws.sign(url.toString(), { method, headers: contentType ? { 'Content-Type': contentType } : {}, aws: { signQuery: true } });
    return signed.url;
  };
  return {
    presignPut: (key: string, ct: string, ttl: number) => presign('PUT', key, ttl, ct),
    presignGet: (key: string, ttl: number) => presign('GET', key, ttl),
    // One signed GET of a key that never exists: 404 NoSuchKey proves host + bucket + credentials are all valid.
    check: async () => {
      try {
        const r = await aws.fetch(base('__clc_check__'), { method: 'GET', signal: AbortSignal.timeout(8000) });
        const t = await r.text();
        const m = /<Code>([^<]+)<\/Code>/.exec(t);
        return { status: r.status, code: m ? m[1] : '' };
      } catch (e) {
        return { error: String((e && (e as Error).message) || e) };
      }
    },
    head: async (key: string) => {
      const r = await aws.fetch(base(key), { method: 'HEAD' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('R2 HEAD failed: ' + r.status);
      return { bytes: Number(r.headers.get('content-length') || 0), contentType: (r.headers.get('content-type') || '').split(';')[0].trim() };
    },
    del: async (key: string) => {
      const r = await aws.fetch(base(key), { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error('R2 DELETE failed: ' + r.status);
    }
  };
}

Deno.serve(createHandler(async (req: Request) => {
  const deps: any = { env, rand: () => crypto.randomUUID().replace(/-/g, '').slice(0, 16), auth: null };
  const authz = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/i.test(authz) || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return deps;
  // Every DB call runs AS THE CALLER (their JWT) so the table's RLS policies stay in force.
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: authz } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await sb.auth.getUser();
  if (ue || !u?.user) return deps;
  const { data: role } = await sb.rpc('clc_role');
  const T = () => sb.from('delivery_photos');
  deps.auth = {
    role: role || null,
    r2: makeR2(),
    db: {
      getByPlanSlot: async (plan_id: string, slot: number) => (await T().select('*').eq('plan_id', plan_id).eq('slot', slot).maybeSingle()).data,
      listByPlan: async (plan_id: string) => { const { data, error } = await T().select('*').eq('plan_id', plan_id).order('slot'); if (error) throw error; return data || []; },
      upsert: async (row: any) => {
        const { data, error } = await T().upsert(row, { onConflict: 'plan_id,slot' }).select().single();
        if (error) { if (error.code === '23503') return { error: 'plan_not_found' }; throw error; }
        return data;
      },
      remove: async (plan_id: string, slot: number) => { const { error } = await T().delete().eq('plan_id', plan_id).eq('slot', slot); if (error) throw error; },
      removeAll: async (plan_id: string) => { const { error } = await T().delete().eq('plan_id', plan_id); if (error) throw error; }
    }
  };
  return deps;
}));
