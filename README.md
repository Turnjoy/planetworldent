# Plannet World Entertainment

Multi-event ticketing for Plannet World Entertainment. Built with React, Vite, Cloudflare Pages Functions, Supabase Postgres and Paystack.

## Local development

1. Install Node.js 22+ and dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` to set the public social links used by the Vite build.
3. Run `npm run dev` for the UI. Run the built site with Cloudflare Pages Functions using `npm run build` followed by `npx wrangler pages dev dist` with server bindings configured locally.
4. Deploy to Cloudflare Pages with build command `npm run build` and output directory `dist`.

## Cloudflare Pages variables and secrets

Add server values in **Settings → Variables and Secrets**. Store credentials and PINs as secrets. These exact names are read from `context.env` in Pages Functions:

| Name | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | Initializes Paystack payments and verifies webhook signatures. |
| `ORGANIZER_SUBACCOUNT_CODE` | Paystack subaccount for organizer settlement. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase access for Pages Functions. |
| `GATE_PIN` | Gate check-in PIN and fallback for admin authentication. |
| `ADMIN_PIN` | Admin API PIN; falls back to `GATE_PIN` when unset. |
| `QR_SIGNING_SECRET` | Long random HMAC key used to sign ticket QR payloads. |

The only Vite variables are public social links, read from `import.meta.env`:

| Name | Purpose |
| --- | --- |
| `VITE_ORGANIZER_TIKTOK_URL` | Organizer TikTok profile URL. |
| `VITE_ORGANIZER_INSTAGRAM_URL` | Organizer Instagram profile URL. |

Never put server credentials in `.env.local`, a `VITE_` variable, source code, Docker build arguments or Git. `.env.example` and `.env.docker.example` use empty values and contain no credentials.

## Database setup

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. It is safe to rerun on the original single-event schema. It creates `events`, seeds Soakers Splash Squad 2027, backfills existing orders and tickets, adds event/phase/amount fields, enables RLS, and installs the server-side RPCs. `get_event_ticket_stats(p_event_id)` returns `paid_count`, `active_phase`, `current_price` and `early_bird_remaining`.

Checkout obtains pricing on the server and reserves tickets under an event inventory lock. Early Bird pricing changes to Regular when the paid ticket count reaches the event's configured limit. Active checkout holds prevent concurrent checkouts from exceeding the Early Bird allocation. Event banners use external HTTPS URLs or built-in gradients; this project does not use Supabase Storage.

Configure Paystack's webhook URL as `https://YOUR_DOMAIN/api/paystack-webhook`. The handler validates the raw signature and confirms amount and currency before issuing tickets. QR payloads use HMAC-SHA256. The gate endpoint validates and atomically redeems each ticket, with failed PIN attempts rate limited by hashed client IP.

## Routes

- `/` lists every active event with a live ticket phase, price and remaining Early Bird inventory.
- `/events/:slug` shows event details and checkout. The browser submits guest details and quantity; the function determines the price and sends `event_id` and `ticket_phase` in Paystack metadata with the organizer subaccount split.
- `/admin` provides PIN-protected event creation, editing, activation and ticket sales stats.
- `/api/admin/*` endpoints independently verify `ADMIN_PIN`, falling back to `GATE_PIN` when unset.

The admin PIN is sent in an `x-admin-pin` request header and checked by the server for every admin API call. The browser stores it only for the current tab session.

## Seed event

**Soakers Splash Squad 2027** · Friday, 1 January 2027 · 10:00 PM till dawn · Igbekon, Ado-Odo, Ota, Ogun State. Artwork uses CSS gradients by default.
