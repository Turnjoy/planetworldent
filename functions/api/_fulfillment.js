import { json, rpc, sign, supabase, timingSafeEqual } from './_shared.js';

const SITE_URL_DEFAULT = 'https://planetworldentetainment.com.ng';
const WHATSAPP_URL = `https://wa.me/2349157428112?text=${encodeURIComponent('Hello Plannet World Entertainment, I need help with my Soakers Splash Squad 2027 ticket.')}`;
const PHONE_URL = 'tel:07057642817';
const EMAIL_URL = 'mailto:tickets@planetworldentetainment.com.ng';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const siteUrl = env => String(env.SITE_URL || SITE_URL_DEFAULT).replace(/\/$/, '');

async function verifyPaystack(reference, env) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` }
  });
  const result = await response.json().catch(() => null);
  const data = result?.data;
  if (!response.ok || !result?.status || data?.status !== 'success' || data?.reference !== reference) {
    return { error: result?.message || 'Paystack has not confirmed this payment.' };
  }
  return { data };
}

export async function sendConfirmationEmail(reference, env) {
  if (!env.BREVO_API_KEY) return { sent: false, skipped: true };
  const claimed = await rpc(env, 'claim_order_email', { p_reference: reference });
  if (!claimed.ok) return { error: 'Could not claim confirmation email.' };
  if (!claimed.data?.claimed) return { sent: true, alreadySent: true };

  let mailRequestStarted = false;
  try {
    const orderResult = await supabase(env, `rest/v1/orders?select=reference,full_name,email,quantity,ticket_phase,event_id,subtotal,total&reference=eq.${encodeURIComponent(reference)}&limit=1`);
    const order = orderResult.data?.[0];
    if (!orderResult.ok || !order) throw new Error('Confirmed order details could not be loaded.');
    const [eventResult, ticketsResult] = await Promise.all([
      supabase(env, `rest/v1/events?select=title,event_date,venue,slug&id=eq.${encodeURIComponent(order.event_id)}&limit=1`),
      supabase(env, `rest/v1/tickets?select=code,qr_token&order_reference=eq.${encodeURIComponent(reference)}&order=created_at.asc`)
    ]);
    const event = eventResult.data?.[0];
    const tickets = ticketsResult.data || [];
    if (!eventResult.ok || !event || !ticketsResult.ok || tickets.length !== Number(order.quantity)) throw new Error('Ticket details are not ready for email.');

    const codes = tickets.map(t => {
      const qrUrl = `${siteUrl(env)}/api/ticket-qr?token=${encodeURIComponent(t.qr_token)}`;
      const [code, ref, sig] = String(t.qr_token).split('.');
      const verificationUrl = `${siteUrl(env)}/verify-ticket?reference=${encodeURIComponent(ref)}&code=${encodeURIComponent(code)}&sig=${encodeURIComponent(sig)}`;
      return `<li style="list-style:none;margin:20px 0;padding:16px;background:#f4f8f8;border-radius:12px;text-align:center"><a href="${escapeHtml(verificationUrl)}" style="display:block;text-decoration:none;color:#14202f"><img src="${escapeHtml(qrUrl)}" width="240" height="240" alt="Scan to verify ticket ${escapeHtml(t.code)}" style="display:block;width:240px;height:240px;max-width:100%;margin:0 auto 12px;background:#fff"><strong>${escapeHtml(t.code)}</strong></a></li>`;
    }).join('');
    const support = `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #dce5e8"><p style="margin:0 0 12px;color:#526271;font-size:14px">Need help with your ticket?</p><a href="${WHATSAPP_URL}" style="display:inline-block;margin:0 10px 8px 0;padding:10px 14px;border-radius:8px;background:#e9f8ee;color:#126c37;text-decoration:none;font-weight:bold"><span style="display:inline-grid;place-items:center;width:22px;height:22px;margin-right:6px;border-radius:50%;background:#25d366;color:#fff">☎</span>WhatsApp us</a><a href="${PHONE_URL}" style="display:inline-block;margin:0 10px 8px 0;padding:10px 14px;border-radius:8px;background:#eef3f7;color:#24384b;text-decoration:none;font-weight:bold"><span style="margin-right:6px;color:#087f8c">☎</span>Call 0705 764 2817</a><a href="${EMAIL_URL}" style="display:inline-block;margin-bottom:8px;padding:10px 14px;border-radius:8px;background:#eef3f7;color:#24384b;text-decoration:none;font-weight:bold"><span style="margin-right:6px;color:#087f8c">✉</span>Email tickets@planetworldentetainment.com.ng</a></div>`;
    const htmlContent = `<div style="font:16px/1.6 Arial,sans-serif;color:#14202f;max-width:620px;margin:auto"><h1 style="color:#087f8c">Payment confirmed</h1><p>Hello ${escapeHtml(order.full_name)}, your payment for <strong>${escapeHtml(event.title)}</strong> is confirmed.</p><p>${escapeHtml(event.event_date)}<br>${escapeHtml(event.venue)}<br>${escapeHtml(order.ticket_phase)} · ${escapeHtml(order.quantity)} ticket(s)</p><h2>Your QR ticket${tickets.length === 1 ? '' : 's'}</h2><p>Show the QR code${tickets.length === 1 ? '' : 's'} below at the entrance. No website or app is needed.</p><ul style="padding:0">${codes}</ul><p>Keep this email as your ticket. If your mail app hides images, allow images from this sender to display your QR code.</p>${support}<p>Thank you,<br>SOAKERS SPLASH SQUAD2027</p></div>`;
    const textContent = `Payment confirmed for ${event.title}\n${event.event_date}\n${event.venue}\n${order.ticket_phase} · ${order.quantity} ticket(s)\nTicket code(s): ${tickets.map(t => t.code).join(', ')}\nScan the QR code in the HTML email to open its ticket verification page.\nWhatsApp support: ${WHATSAPP_URL}\nCall: ${PHONE_URL}\nEmail: ${EMAIL_URL}`;
    const senderEmail = env.BREVO_SENDER_EMAIL || 'tickets@planetworldentetainment.com.ng';
    const senderName = env.BREVO_SENDER_NAME || 'SOAKERS SPLASH SQUAD2027';
    mailRequestStarted = true;
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { email: senderEmail, name: senderName }, to: [{ email: order.email, name: order.full_name }], subject: `Your ${event.title} tickets are confirmed`, htmlContent, textContent, tags: ['ticket-confirmation'], headers: { 'X-Mailin-custom': `order-${reference}` } })
    });
    const mail = await response.json().catch(() => null);
    if (!response.ok) {
      await rpc(env, 'finish_order_email', { p_reference: reference, p_sent: false, p_message_id: null });
      throw new Error(mail?.message || 'Brevo could not send the confirmation email.');
    }
    await rpc(env, 'finish_order_email', { p_reference: reference, p_sent: true, p_message_id: mail?.messageId || null });
    return { sent: true };
  } catch (error) {
    // If the network failed after the send request began, keep the lease: Brevo may
    // have accepted it, and releasing immediately could duplicate the message.
    if (!mailRequestStarted) await rpc(env, 'finish_order_email', { p_reference: reference, p_sent: false, p_message_id: null });
    return { error: error.message || 'Confirmation email failed.' };
  }
}

export async function fulfillPaystackReference(reference, env) {
  if (!env.PAYSTACK_SECRET_KEY || !env.QR_SIGNING_SECRET || env.QR_SIGNING_SECRET.length < 32 || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { response: json({ error: 'Payment verification is not configured.' }, 503) };
  }
  if (!/^SSS-[A-F0-9]{12}$/i.test(String(reference || ''))) return { response: json({ error: 'Invalid payment reference.' }, 400) };
  try {
    const verified = await verifyPaystack(reference, env);
    if (verified.error) return { response: json({ error: verified.error }, 402) };
    const transaction = verified.data;
    const saved = await rpc(env, 'confirm_ticket_order', {
      p_reference: reference,
      p_paystack_amount: transaction.amount,
      p_currency: transaction.currency,
      p_signing_secret: env.QR_SIGNING_SECRET
    });
    if (!saved.ok || saved.data?.ok !== true) return { response: json({ error: saved.data?.message || 'Payment could not be recorded.' }, 500) };
    const email = await sendConfirmationEmail(reference, env);
    return { response: json({ verified: true, reference, email_sent: email.sent === true, email_pending: Boolean(email.error || email.skipped), message: 'Payment confirmed.' }) };
  } catch {
    return { response: json({ error: 'Payment verification is temporarily unavailable.' }, 503) };
  }
}

export async function processWebhook(rawEvent, env) {
  if (rawEvent.event === 'charge.success' && rawEvent.data?.status === 'success' && rawEvent.data?.reference) {
    const result = await fulfillPaystackReference(String(rawEvent.data.reference), env);
    const data = await result.response.clone().json().catch(() => ({}));
    if (data.verified && data.email_pending) return { response: json({ error: 'Payment was recorded, but ticket email delivery is pending. Paystack should retry this webhook.' }, 503) };
    return data.verified ? { response: json({ received: true }) } : result;
  }
  if (['charge.failed', 'charge.reversed'].includes(rawEvent.event) && rawEvent.data?.reference) {
    const cancelled = await rpc(env, 'cancel_ticket_hold', { p_reference: rawEvent.data.reference });
    if (!cancelled.ok) return { response: json({ error: 'Could not release payment hold.' }, 500) };
  }
  return { response: json({ received: true }) };
}

export async function verifyPaystackWebhookSignature(request, env, raw) {
  const supplied = request.headers.get('x-paystack-signature') || '';
  const expected = await sign(env.PAYSTACK_SECRET_KEY, raw, 'SHA-512');
  return timingSafeEqual(supplied, expected);
}
