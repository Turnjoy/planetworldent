import { adminAuthorized, json, readJson, supabase } from '../_shared.js';
import { eventSlug } from '../../_shared.js';

export async function onRequestPut({ request, params, env }) {
  if (!adminAuthorized(request, env)) return json({ error: 'Enter the admin PIN to continue.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Admin service is not configured.' }, 503);
  try {
    const body = await readJson(request, 12_000);
    const slug = body.slug !== undefined || body.title !== undefined ? eventSlug(body.slug || body.title) : undefined;
    const update = {};
    for (const key of ['title','tagline','description','event_date','venue','banner_url','early_bird_price','early_bird_limit','regular_price','gate_pin','is_active']) if (body[key] !== undefined) update[key] = body[key];
    if (slug) update.slug = slug;
    if (update.title !== undefined && !String(update.title).trim()) return json({ error: 'Add a valid event title.' }, 400);
    if (update.slug !== undefined && !update.slug) return json({ error: 'Add a valid event title.' }, 400);
    if (update.banner_url && !/^https:\/\//i.test(String(update.banner_url))) return json({ error: 'Banner URL must use HTTPS.' }, 400);
    for (const key of ['early_bird_price','early_bird_limit','regular_price']) if (update[key] !== undefined && (!Number.isSafeInteger(Number(update[key])) || Number(update[key]) < 0 || (key === 'regular_price' && Number(update[key]) === 0))) return json({ error: 'Prices and limits must be valid whole Naira amounts.' }, 400); else if (update[key] !== undefined) update[key] = Number(update[key]);
    if (update.is_active !== undefined) update.is_active = update.is_active === true || update.is_active === 'true';
    if (update.gate_pin !== undefined) update.gate_pin = String(update.gate_pin).trim();
    if (update.gate_pin === '') return json({ error: 'Event gate PIN cannot be empty.' }, 400);
    const result = await supabase(env, `rest/v1/events?id=eq.${encodeURIComponent(params.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update) });
    if (!result.ok) return json({ error: result.data?.code === '23505' ? 'That event slug already exists.' : 'Could not update event.' }, 400);
    if (!result.data?.length) return json({ error: 'Event not found.' }, 404);
    return json({ event: result.data[0] });
  } catch (error) { return json({ error: error.status === 413 ? 'Request is too large.' : 'Invalid event details.' }, error.status || 400); }
}
