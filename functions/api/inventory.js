import { json, rpc } from './_shared.js';
export async function onRequestGet({ env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ remaining: null }, 503);
  const result = await rpc(env, 'early_bird_remaining', {});
  if (!result.ok || typeof result.data?.remaining !== 'number') return json({ remaining: null }, 503);
  return json({ remaining: result.data.remaining });
}
