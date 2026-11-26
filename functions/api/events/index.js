import { json, supabase, eventStats } from '../_shared.js';

export async function onRequestGet({ env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Events are temporarily unavailable.' }, 503);
  const result = await supabase(env, 'rest/v1/events?select=id,slug,title,tagline,description,event_date,venue,banner_url,early_bird_price,early_bird_limit,regular_price,is_active,created_at&is_active=eq.true&order=event_date.asc');
  if (!result.ok) return json({ error: 'Events are temporarily unavailable.' }, 503);
  const events = await Promise.all(result.data.map(async event => ({ ...event, stats: await eventStats(env, event.id) })));
  return json({ events });
}
