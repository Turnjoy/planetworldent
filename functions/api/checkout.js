import { json, readJson, supabase, rpc } from './_shared.js';

export async function onRequestPost({ request, env }) {
  try {
    if (!env.PAYSTACK_SECRET_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.ORGANIZER_SUBACCOUNT_CODE) return json({ error: 'Checkout is not configured yet. Please contact the organizer.' }, 503);
    const body = await readJson(request, 16_384);
    const fullName = String(body.fullName || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
    const phone = String(body.phone || '').trim().slice(0, 32);
    const eventId = String(body.event_id || '');
    const quantity = Number(body.quantity);
    if (!fullName || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 7 || !/^[0-9a-f-]{36}$/i.test(eventId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return json({ error: 'Check your details and ticket quantity, then try again.' }, 400);
    const eventResult = await supabase(env, `rest/v1/events?select=id,title,is_active&id=eq.${encodeURIComponent(eventId)}&limit=1`);
    const event = eventResult.data?.[0];
    if (!eventResult.ok || !event || !event.is_active) return json({ error: 'This event is not currently available.' }, 404);
    // The RPC owns the inventory lock and determines the phase and price. Client pricing is never accepted.
    const stats = await rpc(env, 'get_event_ticket_stats', { p_event_id: eventId });
    const row = Array.isArray(stats.data) ? stats.data[0] : stats.data;
    if (!stats.ok || !row) return json({ error: 'Current ticket pricing is unavailable. Please try again.' }, 503);
    const subtotal = Number(row.current_price) * quantity;
    const bankCharges = Math.min(2000, Math.ceil(((subtotal + 100) / (1 - 0.015)) - subtotal));
    const total = subtotal + bankCharges;
    const ref = `SSS-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    const hold = await rpc(env, 'reserve_event_tickets', { p_event_id: eventId, p_reference: ref, p_full_name: fullName, p_email: email, p_phone: phone, p_quantity: quantity, p_subtotal: subtotal, p_fee: bankCharges, p_total: total });
    if (!hold.ok || hold.data?.ok === false) return json({ error: hold.data?.message || hold.message || 'Ticket inventory changed. Please refresh and try again.' }, hold.status >= 400 ? hold.status : 409);
    const phase = hold.data.ticket_phase;

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        email, amount: total * 100, reference: ref, currency: 'NGN',
        callback_url: `${String(env.SITE_URL || 'https://planetworldentetainment.com.ng').replace(/\/$/, '')}/payment/complete?reference=${encodeURIComponent(ref)}`,
        subaccount: env.ORGANIZER_SUBACCOUNT_CODE, transaction_charge: bankCharges * 100, bearer: 'account',
        metadata: { event_id: eventId, event_title: event.title, ticket_phase: phase, buyer_name: fullName, quantity, custom_fields: [
          { display_name: 'Event', variable_name: 'event_title', value: event.title },
          { display_name: 'Ticket phase', variable_name: 'ticket_phase', value: phase },
          { display_name: 'Guest', variable_name: 'guest_name', value: fullName }
        ], reference: ref }
      })
    });
    const result = await response.json();
    if (!response.ok || !result.status) { await rpc(env, 'cancel_ticket_hold', { p_reference: ref }); return json({ error: result.message || 'Payment provider could not start checkout.' }, 502); }
    const saved = await supabase(env, `rest/v1/orders?reference=eq.${encodeURIComponent(ref)}`, { method: 'PATCH', body: JSON.stringify({ paystack_access_code: result.data.access_code }) });
    if (!saved.ok) { await rpc(env, 'cancel_ticket_hold', { p_reference: ref }); return json({ error: 'Could not save checkout. Please retry.' }, 503); }
    return json({ authorization_url: result.data.authorization_url, reference: ref, ticket_phase: phase, unit_price: Number(hold.data.unit_price), event_title: event.title });
  } catch (error) { return json({ error: error.status === 413 ? 'Request is too large.' : error.status === 400 ? 'Invalid checkout request.' : 'Unable to start checkout. Please try again.' }, error.status || 500); }
}
