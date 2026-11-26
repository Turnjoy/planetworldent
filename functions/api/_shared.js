export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()'
} });

export async function supabase(env, path, init = {}) {
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/${path}`;
  const response = await fetch(url, { ...init, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', prefer: 'return=representation', ...(init.headers || {}) } });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data, message: data?.message || data?.hint };
}
export async function rpc(env, name, body) { return supabase(env, `rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }); }
export async function readJson(request, maxBytes) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) { const error = new Error('payload too large'); error.status = 413; throw error; }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) { const error = new Error('payload too large'); error.status = 413; throw error; }
  try { return JSON.parse(raw); } catch { const error = new Error('invalid JSON'); error.status = 400; throw error; }
}
export async function sign(secret, value, algorithm = 'SHA-256') {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return [...sig].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function adminAuthorized(request, env) {
  const expected = env.ADMIN_PIN || env.GATE_PIN || '';
  const supplied = request.headers.get('x-admin-pin') || '';
  return expected.length >= 4 && timingSafeEqual(supplied, expected);
}

export function eventSlug(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

export async function eventStats(env, id) {
  const stats = await rpc(env, 'get_event_ticket_stats', { p_event_id: id });
  const row = Array.isArray(stats.data) ? stats.data[0] : stats.data;
  return stats.ok && row ? {
    paid_count: Number(row.paid_count || 0),
    active_phase: row.active_phase,
    current_price: Number(row.current_price || 0),
    early_bird_remaining: Number(row.early_bird_remaining || 0)
  } : { paid_count: 0, active_phase: 'Early Bird', current_price: 0, early_bird_remaining: 0 };
}
