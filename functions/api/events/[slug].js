import { json, supabase, eventStats } from '../_shared.js';

export async function onRequestGet({ params, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Event is temporarily unavailable.' }, 503);
  const result = await supabase(env, `rest/v1/events?select=id,slug,title,tagline,description,event_date,venue,banner_url,early_bird_price,early_bird_limit,regular_price,is_active&id=eq.${encodeURIComponent(params.slug)}&is_active=eq.true&limit=1`);
  const event = result.data?.[0];
  if (!result.ok) return json({ error: 'Event is temporarily unavailable.' }, 503);
  if (!event) return json({ error: 'Event not found.' }, 404);
  return json({ event: { ...event, stats: await eventStats(env, event.id) } });
}
