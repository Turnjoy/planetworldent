import { json, supabase, timingSafeEqual } from '../_shared.js';
import { fulfillPaystackReference } from '../_fulfillment.js';

export async function onRequestPost({ request, env }) {
  const expected = env.PAYMENT_RECONCILE_SECRET || '';
  const supplied = request.headers.get('x-payment-reconcile-secret') || '';
  if (expected.length < 32 || !timingSafeEqual(supplied, expected)) return json({ error: 'Unauthorized.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.PAYSTACK_SECRET_KEY || !env.QR_SIGNING_SECRET) return json({ error: 'Payment reconciliation is not configured.' }, 503);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const orders = await supabase(env, `rest/v1/orders?select=reference,status,email_sent&or=(status.eq.pending,status.eq.cancelled,and(status.eq.paid,email_sent.eq.false))&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=25`);
  if (!orders.ok || !Array.isArray(orders.data)) return json({ error: 'Could not load recent orders.' }, 503);

  const summary = { scanned: orders.data.length, confirmed: 0, unpaid: 0, email_pending: 0, needs_review: 0 };
  for (const order of orders.data) {
    try {
      const result = await fulfillPaystackReference(order.reference, env);
      const body = await result.response.clone().json().catch(() => ({}));
      if (body.verified) {
        summary.confirmed++;
        if (body.email_pending) summary.email_pending++;
      } else if (result.response.status === 402) summary.unpaid++;
      else summary.needs_review++;
    } catch { summary.needs_review++; }
  }
  const requiresAttention = summary.needs_review > 0 || summary.email_pending > 0;
  return json({ ...summary, ok: !requiresAttention }, requiresAttention ? 503 : 200);
}
