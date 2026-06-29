import { createAdminClient } from '@/lib/supabase/admin';

// Resolve secrets/config from an env var first, then the Supabase `server_config`
// key-value table (cached for the worker's lifetime). This lets us configure
// things like VAPID push keys entirely from the DB — no Vercel env edit + redeploy
// needed. Mirrors the gemini.ts pattern, generalized.
const cache = new Map<string, string | null>();

export async function getServerConfig(key: string, envVar?: string): Promise<string | null> {
  if (envVar) {
    const v = process.env[envVar];
    if (v && v.length > 0) return v;
  }
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('server_config')
      .select('value')
      .eq('key', key)
      .single();
    // Only cache on a successful read — a transient DB error must not pin a null
    // for the rest of this worker's life.
    if (!error) cache.set(key, data?.value ?? null);
  } catch {
    // swallow — next call retries
  }
  return cache.get(key) ?? null;
}
