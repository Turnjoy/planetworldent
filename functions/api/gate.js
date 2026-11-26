import { json, readJson, rpc, sign, timingSafeEqual } from './_shared.js';
export async function onRequestPost({ request, env }) {
  const gatePin = env.GATE_PIN || '';
  if (!gatePin || !env.QR_SIGNING_SECRET || env.QR_SIGNING_SECRET.length < 32 || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Gate check-in is not configured.' }, 503);
  try {
    const { pin, token: rawToken } = await readJson(request, 2_048);
    let token = rawToken;
    if (typeof token !== 'string' || token.length > 1_000) return json({ error: 'Invalid QR payload.' }, 400);
    if (/^https:\/\//i.test(token)) {
      try {
        const scanned = new URL(token);
        if (scanned.hostname !== new URL(env.SITE_URL || 'https://planetworldentetainment.com.ng').hostname || scanned.pathname !== '/verify-ticket') throw new Error('invalid host');
        token = `${scanned.searchParams.get('code')}.${scanned.searchParams.get('reference')}.${scanned.searchParams.get('sig')}`;
      } catch { return json({ error: 'Invalid QR payload.' }, 400); }
    }
    if (token.length > 300) return json({ error: 'Invalid QR payload.' }, 400);
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rateKey = await sign(env.QR_SIGNING_SECRET, ip);
    const auth = await rpc(env, 'gate_auth_attempt', { p_key: rateKey, p_valid: timingSafeEqual(String(pin || ''), gatePin) });
    if (!auth.ok || typeof auth.data?.allowed !== 'boolean') return json({ error: 'Gate service is unavailable.' }, 503);
    if (!auth.data.allowed) return json({ error: 'Too many incorrect PIN attempts. Try again in 10 minutes.' }, 429);
    if (!timingSafeEqual(String(pin || ''), gatePin)) return json({ error: 'Invalid gate PIN.' }, 401);
    const result = await rpc(env, 'redeem_ticket', { p_token: token, p_signing_secret: env.QR_SIGNING_SECRET });
    if (!result.ok || !result.data?.ok) return json({ error: result.data?.message || 'Ticket check-in failed.' }, 400);
    return json({ ticket: result.data.ticket });
  } catch (error) { return json({ error: error.status === 413 ? 'Request is too large.' : error.status === 400 ? 'Invalid request.' : 'Ticket check-in failed.' }, error.status || 500); }
}
