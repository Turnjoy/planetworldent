import { json, readJson, supabase, rpc } from './_shared.js';

const PRICES = { early: 3000, regular: 5000 };
export async function onRequestPost({ request, env }) {
  try {
    if (!env.PAYSTACK_SECRET_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.ORGANIZER_SUBACCOUNT_CODE) {
      return json({ error: 'Checkout is not configured yet. Please contact the organizer.' }, 503);
    }
    const body = await readJson(request, 16_384);
    const fullName = String(body.fullName || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
    const phone = String(body.phone || '').trim().slice(0, 32);
    const tier = body.tier;
    const quantity = Number(body.quantity);
    if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 7 || !PRICES[tier] || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return json({ error: 'Check your details and ticket quantity, then try again.' }, 400);
    const amount = PRICES[tier] * quantity;
    const bankCharges = Math.min(2000, Math.ceil(((amount + 100) / (1 - 0.015)) - amount));
    const total = amount + bankCharges;
    const ref = `SSS-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    const hold = await rpc(env, 'reserve_tickets', { p_reference: ref, p_full_name: fullName, p_email: email, p_phone: phone, p_tier: tier, p_quantity: quantity, p_subtotal: amount, p_fee: bankCharges, p_total: total });
    if (!hold.ok || hold.data?.ok === false) return json({ error: hold.data?.message || hold.message || 'Early Bird passes just sold out. Please choose Regular.' }, hold.status >= 400 ? hold.status : 409);

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, amount: total * 100, reference: ref, currency: 'NGN', callback_url: new URL('/?payment=complete', request.url).toString(), subaccount: env.ORGANIZER_SUBACCOUNT_CODE, transaction_charge: bankCharges * 100, bearer: 'account', metadata: { custom_fields: [{ display_name: 'Ticket type', variable_name: 'ticket_type', value: tier }, { display_name: 'Guest', variable_name: 'guest_name', value: fullName }], reference: ref } })
    });
    const result = await response.json();
    if (!response.ok || !result.status) { await rpc(env, 'cancel_ticket_hold', { p_reference: ref }); return json({ error: result.message || 'Payment provider could not start checkout.' }, 502); }
    const saved = await supabase(env, `rest/v1/orders?reference=eq.${encodeURIComponent(ref)}`, { method: 'PATCH', body: JSON.stringify({ paystack_access_code: result.data.access_code }) });
    if (!saved.ok) { await rpc(env, 'cancel_ticket_hold', { p_reference: ref }); return json({ error: 'Could not save checkout. Please retry.' }, 503); }
    return json({ authorization_url: result.data.authorization_url, reference: ref });
  } catch (error) { return json({ error: error.status === 413 ? 'Request is too large.' : error.status === 400 ? 'Invalid checkout request.' : 'Unable to start checkout. Please try again.' }, error.status || 500); }
}
