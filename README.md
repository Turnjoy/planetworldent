# Soakers Splash Squad 2027

Luxury pool-party event landing page and ticket checkout for Plannet World Entertainment. Built with React, Vite, Cloudflare Pages Functions, Supabase and Paystack.

## Local development

1. Install Node.js 20+ and dependencies with `npm install`.
2. Copy the public options in `.env.example` to `.env.local` if you want to customize social URLs.
3. Run `npm run dev` for the visual page. Checkout and pass lookup need Cloudflare Pages Functions and configured server secrets; run with Wrangler (`npx wrangler pages dev dist`) after building to exercise those endpoints.
4. Deploy the project as a Cloudflare Pages project with build command `npm run build` and output directory `dist`.

## Docker test environment

Docker builds the production bundle, then runs the same Cloudflare Pages Functions adapter used for local Pages testing. The container runs as the unprivileged Node user, is read-only except for temporary Wrangler state, drops Linux capabilities, and binds only to loopback.

```powershell
Copy-Item .env.docker.example .env.docker
docker compose up --build
```

Open `http://localhost:8788`. The health endpoint is `http://localhost:8788/api/health`. Without server credentials, the UI loads but payment and gate APIs return a configuration error. For end-to-end payment testing, put only Paystack **test** credentials plus a non-production Supabase project in the ignored `.env.docker` file. Never add live credentials to Docker build args, image layers, Git, or client-side `VITE_` variables. Stop the container with `docker compose down`.

The dependency versions are pinned and `package-lock.json` is committed so local, CI, and Docker installs use the same package tree.

## Cloudflare Pages variables and secrets

Add these in **Settings → Variables and Secrets** for the Pages project. Mark all credentials as secrets. Do not expose server keys through `VITE_` variables.

| Name | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | Initializes payments and validates Paystack webhook signatures. |
| `ORGANIZER_SUBACCOUNT_CODE` | Paystack subaccount used for organizer settlement. |
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only access for the Pages Functions. |
| `GATE_PIN` | Gate-tool PIN; local `localhost` dev fallback is `2027`. Required in production. |
| `QR_SIGNING_SECRET` | Long random HMAC key that signs each ticket QR payload. |

Optional public build variables: `VITE_ORGANIZER_TIKTOK_URL` and `VITE_ORGANIZER_INSTAGRAM_URL`.

## Database setup

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor. It creates orders and tickets, protects tables with RLS, and adds atomic stock reservation and payment confirmation RPCs. The early-bird cap counts paid tickets and unexpired checkout holds so concurrent checkouts cannot oversell the tier. Expired holds are ignored for stock calculations.

In Paystack dashboard, configure a webhook URL at `https://YOUR_DOMAIN/api/paystack-webhook`. The handler verifies the raw request body using the Paystack secret, then checks the paid amount and currency before issuing passes. The QR payload has an HMAC-SHA256 signature. The PIN-protected `/api/gate` endpoint verifies the signature server-side and atomically marks each ticket as used. Failed PIN attempts are keyed by a one-way IP hash and limited to ten per ten-minute window. Re-run the schema when deploying this rate limit to an existing database.

## Checkout notes

Ticket prices and quantity are validated again on the server. The fee uses the gross-up calculation from the event brief (1.5% + ₦100, capped at ₦2,000). Paystack is initialized with the organizer subaccount, the fee as `transaction_charge`, and `bearer: account` so the ticket subtotal is allocated to the organizer subaccount while the main account bears processing charges. Confirm the main account and subaccount split arrangement in Paystack test mode before launch. Guests retrieve passes from **My Pass** using the receipt reference and checkout email; automatic email delivery is not configured.

## Event details

**Soakers Splash Squad 2027** · Friday, 1 January 2027 · 10:00 PM till dawn · Igbekon, Ado-Odo, Ota, Ogun State.

The hero artwork is composed in CSS.
