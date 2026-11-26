import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { onRequestGet as healthGet } from '../functions/api/health.js';
import { onRequestGet as inventoryGet } from '../functions/api/inventory.js';
import { onRequestGet as eventsGet } from '../functions/api/events/index.js';
import { onRequestGet as eventGet } from '../functions/api/events/[slug].js';
import { onRequestGet as adminEventsGet, onRequestPost as adminEventsPost } from '../functions/api/admin/events.js';
import { onRequestPut as adminEventPut } from '../functions/api/admin/events/[id].js';
import { onRequestPost as checkoutPost } from '../functions/api/checkout.js';
import { onRequestPost as gatePost } from '../functions/api/gate.js';
import { onRequestPost as passesPost } from '../functions/api/passes.js';
import { onRequestPost as webhookPost } from '../functions/api/paystack-webhook.js';
import { onRequestGet as verifyPaymentGet } from '../functions/api/verify-payment.js';
import { onRequestGet as ticketQrGet } from '../functions/api/ticket-qr.js';
import { onRequestPost as adminResendTicketEmailPost } from '../functions/api/admin/resend-ticket-email.js';
import { sign } from '../functions/api/_shared.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const env = {
  PAYSTACK_SECRET_KEY: 'paystack-test-secret',
  ORGANIZER_SUBACCOUNT_CODE: 'ACCT_TEST',
  SUPABASE_URL: 'https://unit-test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  GATE_PIN: '2468',
  ADMIN_PIN: '1357',
  QR_SIGNING_SECRET: 'q'.repeat(64)
};
const event = {
  id: 'e83c65b1-e94d-4a5a-9ad3-4229f8c695e8', slug: 'sample-event', title: 'Sample Event',
  tagline: 'A sample night', description: 'Event details', event_date: 'Saturday, 5 June 2027', venue: 'Lagos',
  banner_url: null, early_bird_price: 3000, early_bird_limit: 200, regular_price: 5000, is_active: true
};
const stats = [{ paid_count: 12, active_phase: 'Early Bird', current_price: 3000, early_bird_remaining: 188 }];
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const request = (url, method = 'GET', body, headers = {}) => new Request(url, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
async function withFetch(handler, callback) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  try { await callback(); } finally { globalThis.fetch = previous; }
}
function rpcName(url) { return new URL(url).pathname.split('/').at(-1); }

test('health endpoint reports ok', async () => {
  const result = await healthGet();
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'ok' });
});

test('event listing returns only configured active rows with ticket stats', async () => withFetch(async url => {
  if (String(url).includes('/rest/v1/events?')) return response([event]);
  if (String(url).includes('/rest/v1/rpc/get_event_ticket_stats')) return response(stats);
  throw new Error(`Unexpected request ${url}`);
}, async () => {
  const result = await eventsGet({ env });
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.events[0].stats.early_bird_remaining, 188);
}));

test('event slug endpoint returns a matching active event and 404 for missing event', async () => withFetch(async url => {
  if (String(url).includes('/rest/v1/events?')) {
    assert.match(String(url), /slug=eq\./);
    return response(String(url).includes('slug=eq.missing') ? [] : [event]);
  }
  if (String(url).includes('/rest/v1/rpc/get_event_ticket_stats')) return response(stats);
  throw new Error(`Unexpected request ${url}`);
}, async () => {
  const found = await eventGet({ env, params: { slug: event.slug } });
  assert.equal(found.status, 200);
  assert.equal((await found.json()).event.title, event.title);
  const missing = await eventGet({ env, params: { slug: 'missing' } });
  assert.equal(missing.status, 404);
}));

test('admin event listing enforces ADMIN_PIN and returns per-event stats', async () => {
  const denied = await adminEventsGet({ request: request('https://example.test/api/admin/events'), env });
  assert.equal(denied.status, 401);
  await withFetch(async url => {
    if (String(url).includes('/rest/v1/events?')) return response([event]);
    if (String(url).includes('/rest/v1/rpc/get_event_ticket_stats')) return response(stats);
    throw new Error(`Unexpected request ${url}`);
  }, async () => {
    const result = await adminEventsGet({ request: request('https://example.test/api/admin/events', 'GET', undefined, { 'x-admin-pin': env.ADMIN_PIN }), env });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).events[0].stats.paid_count, 12);
  });
});

test('admin create validates fields and persists a normalized event', async () => withFetch(async (url, init) => {
  assert.equal(String(url), `${env.SUPABASE_URL}/rest/v1/events`);
  assert.equal(init.method, 'POST');
  const saved = JSON.parse(init.body);
  assert.equal(saved.slug, 'sample-event-2027');
  assert.equal(saved.early_bird_price, 3000);
  return response([{ ...event, ...saved }], 201);
}, async () => {
  const validBody = { title: 'Sample Event 2027', event_date: 'Saturday', venue: 'Lagos', regular_price: 5000, gate_pin: '9876', is_active: true };
  const invalid = await adminEventsPost({ request: request('https://example.test/api/admin/events', 'POST', { ...validBody, banner_url: 'http://bad.test/image.jpg' }, { 'x-admin-pin': env.ADMIN_PIN }), env });
  assert.equal(invalid.status, 400);
  const created = await adminEventsPost({ request: request('https://example.test/api/admin/events', 'POST', validBody, { 'x-admin-pin': env.ADMIN_PIN }), env });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).event.slug, 'sample-event-2027');
}));

test('admin event update enforces the PIN and updates requested fields', async () => withFetch(async (url, init) => {
  assert.match(String(url), /events\?id=eq\./);
  assert.equal(init.method, 'PATCH');
  assert.deepEqual(JSON.parse(init.body), { is_active: false });
  return response([{ ...event, is_active: false }]);
}, async () => {
  const result = await adminEventPut({ request: request('https://example.test/api/admin/events/id', 'PUT', { is_active: false }, { 'x-admin-pin': env.ADMIN_PIN }), params: { id: event.id }, env });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).event.is_active, false);
}));

test('checkout uses current server price, reserves inventory, and sends Paystack split metadata', async () => {
  const calls = [];
  await withFetch(async (input, init = {}) => {
    const url = String(input); calls.push({ url, init });
    if (url.includes('/rest/v1/events?')) return response([{ id: event.id, title: event.title, is_active: true }]);
    if (url.includes('/rest/v1/rpc/get_event_ticket_stats')) return response(stats);
    if (url.includes('/rest/v1/rpc/reserve_event_tickets')) return response({ ok: true, ticket_phase: 'Early Bird', unit_price: 3000 });
    if (url === 'https://api.paystack.co/transaction/initialize') return response({ status: true, data: { authorization_url: 'https://paystack.test/checkout', access_code: 'ACCESS' } });
    if (url.includes('/rest/v1/orders?reference=')) return response([{ reference: 'saved' }]);
    throw new Error(`Unexpected request ${url}`);
  }, async () => {
    const result = await checkoutPost({ request: request('https://tickets.test/api/checkout', 'POST', { event_id: event.id, fullName: 'Ada Guest', email: 'ada@example.test', phone: '+2348000000000', quantity: 2, tier: 'regular', price: 1 }), env });
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.unit_price, 3000);
    const paystack = calls.find(call => call.url.includes('api.paystack.co'));
    const payload = JSON.parse(paystack.init.body);
    assert.equal(payload.amount, 619_300);
    assert.equal(payload.subaccount, env.ORGANIZER_SUBACCOUNT_CODE);
    assert.equal(payload.metadata.event_id, event.id);
    assert.equal(payload.metadata.ticket_phase, 'Early Bird');
    assert.equal(payload.metadata.quantity, 2);
    assert.equal(payload.callback_url, `https://planetworldentetainment.com.ng/payment/complete?reference=${payload.reference}`);
    assert.equal(calls.find(call => call.url.includes('reserve_event_tickets')).init.method, 'POST');
  });
});

test('gate endpoint validates config, PIN attempts, and signed QR redemption', async () => {
  const invalidConfig = await gatePost({ request: request('https://tickets.test/api/gate', 'POST', { pin: '2468', token: 'x' }), env: { ...env, QR_SIGNING_SECRET: 'short' } });
  assert.equal(invalidConfig.status, 503);
  await withFetch(async url => {
    if (String(url).includes('/rpc/gate_auth_attempt')) return response({ allowed: true });
    if (String(url).includes('/rpc/redeem_ticket')) return response({ ok: true, ticket: { code: 'SSS-123456' } });
    throw new Error(`Unexpected request ${url}`);
  }, async () => {
    const result = await gatePost({ request: request('https://tickets.test/api/gate', 'POST', { pin: env.GATE_PIN, token: 'signed-token' }), env });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).ticket.code, 'SSS-123456');
  });
});

test('inventory endpoint reads the seeded event inventory RPC', async () => withFetch(async url => {
  assert.match(String(url), /rpc\/early_bird_remaining/);
  return response({ remaining: 177 });
}, async () => {
  const result = await inventoryGet({ env });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { remaining: 177 });
}));

test('pass lookup validates email/reference and returns valid tickets', async () => {
  const bad = await passesPost({ request: request('https://tickets.test/api/passes', 'POST', { email: 'bad', reference: 'invalid' }), env });
  assert.equal(bad.status, 400);
  await withFetch(async url => {
    assert.match(String(url), /status=eq.valid/);
    return response([{ code: 'SSS-123456', qr_token: 'signed-qr' }]);
  }, async () => {
    const result = await passesPost({ request: request('https://tickets.test/api/passes', 'POST', { email: 'ADA@example.test', reference: 'SSS-ABCDEF012345' }), env });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).passes[0].code, 'SSS-123456');
  });
});

test('Paystack webhook verifies the signature and transaction, then fulfills one order and email', async () => {
  const raw = JSON.stringify({ event: 'charge.success', data: { status: 'success', reference: 'SSS-ABCDEF012345', amount: 300000, currency: 'NGN' } });
  const invalid = await webhookPost({ request: new Request('https://tickets.test/api/paystack-webhook', { method: 'POST', body: raw, headers: { 'x-paystack-signature': 'bad' } }), env });
  assert.equal(invalid.status, 401);
  const signature = await sign(env.PAYSTACK_SECRET_KEY, raw, 'SHA-512');
  const qrPayload = 'SSS-123456.SSS-ABCDEF012345';
  const qrToken = `${qrPayload}.${await sign(env.QR_SIGNING_SECRET, qrPayload)}`;
  const calls = [];
  const brevoEnv = { ...env, BREVO_API_KEY: 'brevo-test-key' };
  await withFetch(async (url, init = {}) => {
    const target = String(url); calls.push({ target, init });
    if (target.includes('/transaction/verify/')) return response({ status: true, data: { status: 'success', reference: 'SSS-ABCDEF012345', amount: 300000, currency: 'NGN' } });
    if (target.includes('/rpc/confirm_ticket_order')) return response({ ok: true });
    if (target.includes('/rpc/claim_order_email')) return response({ claimed: true });
    if (target.includes('/rest/v1/orders?')) return response([{ reference: 'SSS-ABCDEF012345', full_name: 'Ada Guest', email: 'ada@example.test', quantity: 1, ticket_phase: 'Early Bird', event_id: event.id }]);
    if (target.includes('/rest/v1/events?')) return response([{ title: event.title, event_date: event.event_date, venue: event.venue, slug: event.slug }]);
    if (target.includes('/rest/v1/tickets?')) return response([{ code: 'SSS-123456', qr_token: qrToken }]);
    if (target === 'https://api.brevo.com/v3/smtp/email') { assert.equal(init.headers['api-key'], 'brevo-test-key'); assert.match(JSON.parse(init.body).htmlContent, /api\/ticket-qr\?token=/); return response({ messageId: 'brevo-message' }, 201); }
    if (target.includes('/rpc/finish_order_email')) { assert.equal(JSON.parse(init.body).p_sent, true); return response({ ok: true }); }
    throw new Error(`Unexpected request ${target}`);
  }, async () => {
    const result = await webhookPost({ request: new Request('https://tickets.test/api/paystack-webhook', { method: 'POST', body: raw, headers: { 'x-paystack-signature': signature } }), env: brevoEnv });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { received: true });
    assert.equal(calls.filter(c => c.target.includes('/rpc/confirm_ticket_order')).length, 1);
    assert.match(JSON.parse(calls.find(c => c.target === 'https://api.brevo.com/v3/smtp/email').init.body).sender.email, /tickets@planetworldentetainment\.com\.ng/);
  });
});

test('payment verification endpoint rejects missing and malformed references', async () => {
  const missing = await verifyPaymentGet({ request: new Request('https://tickets.test/api/verify-payment'), env });
  assert.equal(missing.status, 400);
  const invalid = await verifyPaymentGet({ request: new Request('https://tickets.test/api/verify-payment?reference=bad'), env });
  assert.equal(invalid.status, 400);
});

test('payment verification does not resend an already claimed order email', async () => {
  let emailCalls = 0;
  const emailEnv = { ...env, BREVO_API_KEY: 'brevo-test-key' };
  await withFetch(async url => {
    const target = String(url);
    if (target.includes('/transaction/verify/')) return response({ status: true, data: { status: 'success', reference: 'SSS-ABCDEF012345', amount: 300000, currency: 'NGN' } });
    if (target.includes('/rpc/confirm_ticket_order')) return response({ ok: true, idempotent: true });
    if (target.includes('/rpc/claim_order_email')) return response({ claimed: false });
    if (target.includes('api.brevo.com')) emailCalls++;
    throw new Error(`Unexpected request ${target}`);
  }, async () => {
    const result = await verifyPaymentGet({ request: new Request('https://tickets.test/api/verify-payment?reference=SSS-ABCDEF012345'), env: emailEnv });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).email_pending, false);
    assert.equal(emailCalls, 0);
  });
});

test('ticket QR image endpoint only renders correctly signed ticket tokens', async () => {
  const payload = 'SSS-123456.SSS-ABCDEF012345';
  const token = `${payload}.${await sign(env.QR_SIGNING_SECRET, payload)}`;
  const invalid = await ticketQrGet({ request: new Request('https://tickets.test/api/ticket-qr?token=bad'), env });
  assert.equal(invalid.status, 404);
  const result = await ticketQrGet({ request: new Request(`https://tickets.test/api/ticket-qr?token=${encodeURIComponent(token)}`), env });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await result.text(), /<svg/);
});

test('admin can deliberately resend a paid ticket email with its QR image', async () => {
  const unauthorized = await adminResendTicketEmailPost({ request: request('https://tickets.test/api/admin/resend-ticket-email','POST',{reference:'SSS-ABCDEF012345'}), env });
  assert.equal(unauthorized.status, 401);
  const payload='SSS-123456.SSS-ABCDEF012345';
  const qrToken=`${payload}.${await sign(env.QR_SIGNING_SECRET,payload)}`;
  const emailEnv={...env,BREVO_API_KEY:'brevo-test-key'};
  await withFetch(async (url,init={})=>{
    const target=String(url);
    if(target.includes('/rpc/prepare_ticket_email_resend'))return response({ok:true});
    if(target.includes('/rpc/claim_order_email'))return response({claimed:true});
    if(target.includes('/rest/v1/orders?'))return response([{reference:'SSS-ABCDEF012345',full_name:'Ada Guest',email:'ada@example.test',quantity:1,ticket_phase:'Early Bird',event_id:event.id}]);
    if(target.includes('/rest/v1/events?'))return response([{title:event.title,event_date:event.event_date,venue:event.venue,slug:event.slug}]);
    if(target.includes('/rest/v1/tickets?'))return response([{code:'SSS-123456',qr_token:qrToken}]);
    if(target==='https://api.brevo.com/v3/smtp/email'){const body=JSON.parse(init.body);assert.match(body.htmlContent,/api\/ticket-qr\?token=/);assert.match(body.htmlContent,/https:\/\/wa\.me\/2349157428112/);assert.match(body.htmlContent,/tel:07057642817/);assert.doesNotMatch(body.htmlContent,/Open event and retrieve pass/);return response({messageId:'brevo-resend'},201);}
    if(target.includes('/rpc/finish_order_email'))return response({ok:true});
    throw new Error(`Unexpected request ${target}`);
  },async()=>{
    const result=await adminResendTicketEmailPost({request:request('https://tickets.test/api/admin/resend-ticket-email','POST',{reference:'SSS-ABCDEF012345'},{'x-admin-pin':emailEnv.ADMIN_PIN}),env:emailEnv});
    assert.equal(result.status,200);
    assert.equal((await result.json()).sent,true);
  });
});
