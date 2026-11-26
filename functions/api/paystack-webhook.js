import { json } from './_shared.js';
import { processWebhook, verifyPaystackWebhookSignature } from './_fulfillment.js';

export async function onRequestPost({ request, env }) {
  if (!env.PAYSTACK_SECRET_KEY) return json({ error: 'Webhook is not configured.' }, 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 100_000) return json({ error: 'Payload too large.' }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 100_000) return json({ error: 'Payload too large.' }, 413);
  if (!await verifyPaystackWebhookSignature(request, env, raw)) return json({ error: 'Invalid signature.' }, 401);
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'Invalid payload.' }, 400); }
  return (await processWebhook(event, env)).response;
}
