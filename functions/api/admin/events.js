import { adminAuthorized, eventSlug, json, readJson, supabase, eventStats } from './_shared.js';

const fields = 'id,slug,title,tagline,description,event_date,venue,banner_url,early_bird_price,early_bird_limit,regular_price,gate_pin,is_active,created_at';
function validEvent(body, partial = false) {
  const title = String(body.title || '').trim().slice(0, 140);
  const slug = eventSlug(body.slug || title);
  const event_date = String(body.event_date || '').trim().slice(0, 100);
  const venue = String(body.venue || '').trim().slice(0, 180);
  const early_bird_price = Number(body.early_bird_price ?? 3000);
  const early_bird_limit = Number(body.early_bird_limit ?? 200);
  const regular_price = Number(body.regular_price);
  const gate_pin = String(body.gate_pin || '').trim().slice(0, 64);
  const banner_url = String(body.banner_url || '').trim().slice(0, 1000);
  if ((!partial || body.title !== undefined) && (!title || !slug)) return { error: 'Add a valid event title.' };
  if ((!partial || body.event_date !== undefined) && !event_date) return { error: 'Add the event date.' };
  if ((!partial || body.venue !== undefined) && !venue) return { error: 'Add the event venue.' };
  if (![early_bird_price, early_bird_limit, regular_price].every(Number.isSafeInteger) || early_bird_price < 0 || early_bird_limit < 0 || regular_price < 0 || regular_price === 0) return { error: 'Prices and ticket limits must be valid non-negative whole Naira amounts; Regular Price must be above zero.' };
  if (!gate_pin) return { error: 'Add an event gate PIN.' };
  if (banner_url && !/^https:\/\//i.test(banner_url)) return { error: 'Banner URL must use HTTPS.' };
  return {
    ...(body.title !== undefined || !partial ? { title, slug } : {}),
    ...(body.tagline !== undefined || !partial ? { tagline: String(body.tagline || '').trim().slice(0, 180) || null } : {}),
    ...(body.description !== undefined || !partial ? { description: String(body.description || '').trim().slice(0, 5000) || null } : {}),
    ...(body.event_date !== undefined || !partial ? { event_date } : {}),
    ...(body.venue !== undefined || !partial ? { venue } : {}),
    ...(body.banner_url !== undefined || !partial ? { banner_url: banner_url || null } : {}),
    ...(body.early_bird_price !== undefined || !partial ? { early_bird_price } : {}),
    ...(body.early_bird_limit !== undefined || !partial ? { early_bird_limit } : {}),
    ...(body.regular_price !== undefined || !partial ? { regular_price } : {}),
    ...(body.gate_pin !== undefined || !partial ? { gate_pin } : {}),
    ...(body.is_active !== undefined || !partial ? { is_active: body.is_active === true || body.is_active === 'true' } : {})
  };
}

export async function onRequestGet({ request, env }) {
  if (!adminAuthorized(request, env)) return json({ error: 'Enter the admin PIN to continue.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Admin service is not configured.' }, 503);
  const result = await supabase(env, `rest/v1/events?select=${fields}&order=created_at.desc`);
  if (!result.ok) return json({ error: 'Could not load events.' }, 503);
  return json({ events: await Promise.all(result.data.map(async event => ({ ...event, stats: await eventStats(env, event.id) }))) });
}

export async function onRequestPost({ request, env }) {
  if (!adminAuthorized(request, env)) return json({ error: 'Enter the admin PIN to continue.' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Admin service is not configured.' }, 503);
  try {
    const body = await readJson(request, 12_000);
    const event = validEvent(body);
    if (event.error) return json({ error: event.error }, 400);
    const result = await supabase(env, 'rest/v1/events', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(event) });
    if (!result.ok) return json({ error: result.data?.code === '23505' ? 'That event slug already exists.' : 'Could not create event.' }, 400);
    return json({ event: result.data[0] }, 201);
  } catch (error) { return json({ error: error.status === 413 ? 'Request is too large.' : 'Invalid event details.' }, error.status || 400); }
}
