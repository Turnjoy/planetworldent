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
