import { json, sign, supabase, timingSafeEqual } from './_shared.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const reference = (url.searchParams.get('reference') || '').toUpperCase();
  const code = (url.searchParams.get('code') || '').toUpperCase();
  const signature = (url.searchParams.get('sig') || '').toLowerCase();
  if (!env.QR_SIGNING_SECRET || env.QR_SIGNING_SECRET.length < 32 || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Ticket verification is unavailable.' }, 503);
  if (!/^SSS-[A-F0-9]{12}$/.test(reference) || !/^SSS-[A-F0-9]{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(signature)) return json({ valid: false, status: 'INVALID' }, 400);
  const expected = await sign(env.QR_SIGNING_SECRET, `${code}.${reference}`);
  if (!timingSafeEqual(expected, signature)) return json({ valid: false, status: 'INVALID' }, 200);
  try {
    const [ticketResult, orderResult] = await Promise.all([
      supabase(env, `rest/v1/tickets?select=code,order_reference,tier,ticket_phase,status,event_id&code=eq.${encodeURIComponent(code)}&order_reference=eq.${encodeURIComponent(reference)}&limit=1`),
      supabase(env, `rest/v1/orders?select=reference,full_name,quantity,status,event_id&reference=eq.${encodeURIComponent(reference)}&limit=1`)
    ]);
    if (!ticketResult.ok || !orderResult.ok) return json({ error: 'Ticket verification is temporarily unavailable.' }, 503);
    const ticket = ticketResult.data?.[0];
    const order = orderResult.data?.[0];
    if (!ticket || !order || order.status !== 'paid') return json({ valid: false, status: 'INVALID' });
    const valid = ticket.status === 'valid';
    const result = { valid, status: valid ? 'VALID' : ticket.status === 'used' ? 'ALREADY USED' : 'INVALID', ticket_type: ticket.ticket_phase || ticket.tier || 'Standard', buyer_name: order.full_name, quantity: Number(order.quantity || 1), ticket_code: ticket.code };
    if (ticket.event_id) {
      const eventResult = await supabase(env, `rest/v1/events?select=title,event_date,venue&id=eq.${encodeURIComponent(ticket.event_id)}&limit=1`);
      if (eventResult.ok && eventResult.data?.[0]) result.event = eventResult.data[0];
    }
    return json(result);
  } catch { return json({ error: 'Ticket verification is temporarily unavailable.' }, 503); }
}
