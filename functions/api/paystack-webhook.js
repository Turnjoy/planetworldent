import { json, rpc, sign, timingSafeEqual } from './_shared.js';

export async function onRequestPost({ request, env }) {
  if (!env.PAYSTACK_SECRET_KEY || !env.QR_SIGNING_SECRET || env.QR_SIGNING_SECRET.length < 32 || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Webhook is not configured.' }, 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 100_000) return json({ error: 'Payload too large.' }, 413);
  const raw = await request.text();
  if (raw.length > 100_000) return json({ error: 'Payload too large.' }, 413);
  const supplied = request.headers.get('x-paystack-signature') || '';
  const expected = await sign(env.PAYSTACK_SECRET_KEY, raw, 'SHA-512');
  if (!timingSafeEqual(supplied, expected)) return json({ error: 'Invalid signature' }, 401);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'Invalid payload' }, 400); }
  if (event.event === 'charge.success' && event.data?.status === 'success' && event.data?.reference) {
    const result = await rpc(env, 'confirm_ticket_order', { p_reference: event.data.reference, p_paystack_amount: event.data.amount, p_currency: event.data.currency, p_signing_secret: env.QR_SIGNING_SECRET });
    if (!result.ok || result.data?.ok === false) return json({ error: 'Order confirmation failed' }, 500);
  }
  if (['charge.failed', 'charge.reversed'].includes(event.event) && event.data?.reference) await rpc(env, 'cancel_ticket_hold', { p_reference: event.data.reference });
  return json({ received: true });
}
