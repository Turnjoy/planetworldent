import { json, readJson, supabase } from './_shared.js';

export async function onRequestPost({ request, env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Pass lookup is temporarily unavailable.' }, 503);
  try {
    const { email, reference } = await readJson(request, 4_096);
    if (!/^\S+@\S+\.\S+$/.test(String(email || '')) || !/^SSS-[A-F0-9]{12}$/i.test(String(reference || ''))) return json({ error: 'Enter the checkout email and order reference.' }, 400);
    const rows = await supabase(env, `rest/v1/tickets?select=code,tier,guest_name,qr_token,created_at&email=eq.${encodeURIComponent(String(email).trim().toLowerCase())}&order_reference=eq.${encodeURIComponent(String(reference).toUpperCase())}&status=eq.valid&order=created_at.desc`);
    if (!rows.ok) return json({ error: 'Pass lookup is temporarily unavailable.' }, 503);
    return json({ passes: rows.data });
  } catch { return json({ error: 'Pass lookup is temporarily unavailable.' }, 500); }
}
