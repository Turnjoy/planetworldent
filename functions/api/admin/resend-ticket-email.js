import { adminAuthorized, json, readJson, rpc } from '../_shared.js';
import { sendConfirmationEmail } from '../_fulfillment.js';

export async function onRequestPost({ request, env }) {
  if (!adminAuthorized(request, env)) return json({ error: 'Enter the admin PIN to continue.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.BREVO_API_KEY) return json({ error: 'Ticket email service is not configured.' }, 503);
  try {
    const body = await readJson(request, 2_048);
    const reference = String(body.reference || '').trim().toUpperCase();
    if (!/^SSS-[A-F0-9]{12}$/.test(reference)) return json({ error: 'Enter a valid payment reference.' }, 400);
    const prepared = await rpc(env, 'prepare_ticket_email_resend', { p_reference: reference });
    if (!prepared.ok || prepared.data?.ok !== true) return json({ error: 'Paid order not found, or its email is currently being sent.' }, 404);
    const result = await sendConfirmationEmail(reference, env);
    if (!result.sent) return json({ error: result.error || 'Ticket email could not be sent.' }, 502);
    return json({ sent: true, reference });
  } catch (error) {
    return json({ error: error.status === 413 ? 'Request is too large.' : 'Could not resend the ticket email.' }, error.status || 400);
  }
}
