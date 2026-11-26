import { json } from './_shared.js';
import { fulfillPaystackReference } from './_fulfillment.js';

export async function onRequestGet({ request, env }) {
  const reference = new URL(request.url).searchParams.get('reference');
  if (!reference) return json({ error: 'Payment reference is required.' }, 400);
  return (await fulfillPaystackReference(reference, env)).response;
}
