import { json, supabase, timingSafeEqual } from '../_shared.js';
import { fulfillPaystackReference, repairRecordedPaidOrder } from '../_fulfillment.js';

const referencePattern = /^SSS-[A-F0-9]{12}$/i;
const safeReason = value => ({
  paystack_reference_mismatch: 'paystack_reference_mismatch',
  paystack_verification_unavailable: 'paystack_verification_unavailable',
  paystack_transaction_not_found: 'paystack_transaction_not_found',
  'Payment amount mismatch': 'payment_amount_or_currency_mismatch',
  payment_amount_or_currency_mismatch: 'payment_amount_or_currency_mismatch',
  ticket_fulfillment_rejected: 'ticket_fulfillment_rejected',
  confirmation_email_failed: 'confirmation_email_failed',
  confirmation_email_not_configured: 'confirmation_email_not_configured'
}[value] || 'fulfillment_failed');

function ticketCount(order) {
  const relation = order.tickets;
  if (Array.isArray(relation) && relation.length === 0) return 0;
  if (relation === null) return 0;
  const value = Array.isArray(relation) ? relation[0]?.count : relation?.count;
  return value === undefined || value === null ? null : Number(value);
}

function activeEmailLease(order, now = Date.now()) {
  const claimedAt = Date.parse(order.email_claimed_at || '');
  return order.email_sending === true && Number.isFinite(claimedAt) && claimedAt > now - 24 * 60 * 60 * 1000;
}

async function readTargetReference(request) {
  const url = new URL(request.url);
  const queryReference = url.searchParams.get('reference');
  if (queryReference) return queryReference.trim().toUpperCase();
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return '';
  const body = await request.json().catch(() => ({}));
  return typeof body?.reference === 'string' ? body.reference.trim().toUpperCase() : '';
}

export async function onRequestPost({ request, env }) {
  const expected = env.PAYMENT_RECONCILE_SECRET || '';
  const supplied = request.headers.get('x-payment-reconcile-secret') || '';
  if (expected.length < 32 || !timingSafeEqual(supplied, expected)) return json({ error: 'Unauthorized.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.PAYSTACK_SECRET_KEY || !env.QR_SIGNING_SECRET) return json({ error: 'Payment reconciliation is not configured.' }, 503);

  const reference = await readTargetReference(request);
  if (reference && !referencePattern.test(reference)) return json({ error: 'Invalid payment reference.' }, 400);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fields = 'reference,status,email_sent,email_sending,email_claimed_at,quantity,total,created_at,tickets(count)';
  const paths = reference
    ? [`rest/v1/orders?select=${fields}&reference=eq.${encodeURIComponent(reference)}&limit=1`]
    : [
        `rest/v1/orders?select=${fields}&status=eq.paid&email_sent=eq.false&order=created_at.asc&limit=25`,
        `rest/v1/orders?select=${fields}&status=in.(pending,cancelled,paid)&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=25`
      ];
  const orderResults = await Promise.all(paths.map(path => supabase(env, path)));
  if (orderResults.some(result => !result.ok || !Array.isArray(result.data))) return json({ error: 'Could not load orders for reconciliation.' }, 503);
  const scannedOrders = [...new Map(orderResults.flatMap(result => result.data).map(order => [order.reference, order])).values()];
  if (reference && scannedOrders.length === 0) return json({ error: 'Order not found.' }, 404);

  const summary = { scanned: scannedOrders.length, confirmed: 0, unpaid: 0, email_pending: 0, email_locked: 0, needs_review: 0, review_orders: [], email_pending_orders: [], email_locked_orders: [] };
  for (const order of scannedOrders) {
    try {
      if (order.status === 'paid') {
        const count = ticketCount(order);
        const missingEmail = order.email_sent !== true;
        if (!Number.isFinite(count) && !missingEmail) {
          summary.needs_review++;
          summary.review_orders.push({ reference: order.reference, reason: 'ticket_count_unavailable' });
          continue;
        }
        const missingTickets = Number.isFinite(count) && count < Number(order.quantity);
        if (!missingTickets && !missingEmail) continue;

        // A paid DB row is the trusted result of the verified payment flow. The
        // row-locked RPC can safely repair missing tickets without re-verifying
        // against Paystack, whose current fee/amount rules may differ from checkout.
        const repaired = await repairRecordedPaidOrder(order.reference, env);
        if (!repaired.ok) {
          summary.needs_review++;
          summary.review_orders.push({ reference: order.reference, reason: safeReason(repaired.reason) });
          continue;
        }
        summary.confirmed++;
        if (repaired.emailLocked || (missingEmail && activeEmailLease(order))) {
          summary.email_locked++;
          summary.email_locked_orders.push({ reference: order.reference, reason: 'fresh_email_sending_lease' });
        } else if (repaired.emailPending) {
          summary.email_pending++;
          summary.email_pending_orders.push({ reference: order.reference, reason: safeReason(repaired.reason) });
        }
        continue;
      }

      const result = await fulfillPaystackReference(order.reference, env);
      const body = await result.response.clone().json().catch(() => ({}));
      if (body.verified) {
        summary.confirmed++;
        if (body.email_pending) {
          summary.email_pending++;
          summary.email_pending_orders.push({ reference: order.reference, reason: 'confirmation_email_pending' });
        }
      } else if (result.response.status === 402) {
        summary.unpaid++;
      } else {
        summary.needs_review++;
        const review = { reference: order.reference, reason: safeReason(body.reason || body.error) };
        if (Number.isInteger(body.upstream_status)) review.upstream_status = body.upstream_status;
        if (typeof body.upstream_error === 'string') review.upstream_error = body.upstream_error;
        summary.review_orders.push(review);
      }
    } catch {
      summary.needs_review++;
      summary.review_orders.push({ reference: order.reference, reason: 'unexpected_reconciliation_error' });
    }
  }
  const requiresAttention = summary.needs_review > 0 || summary.email_pending > 0;
  return json({ ...summary, ok: !requiresAttention }, requiresAttention ? 503 : 200);
}
