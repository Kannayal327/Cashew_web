# FarmDirect Cashews

A complete two-application monorepo for a single-origin cashew store. The frontend targets Vercel; the API, PostgreSQL, Redis, and reservation cron target Railway. No live services or payment accounts are created by this source bundle.

The included catalog, prices, ingredient descriptions, and packaging are samples. Certifications, origin location, customer reviews, and legal policies are not invented. The UI publishes supplied certificate details and real, moderated reviews, and provides honest empty states otherwise.

## Stack

| Application | Implementation | Deployment target |
| --- | --- | --- |
| `/frontend` | Next.js 16.4.2 App Router, React 19, TypeScript, Tailwind 4, shadcn-style Radix components, Zustand, Zod | Vercel |
| `/backend` | FastAPI, Pydantic 2, SQLAlchemy 2, Alembic, psycopg 3, PostgreSQL | Railway |
| Rate limits | SlowAPI with shared Redis storage in production | Railway Redis |
| Reservation cleanup | A separate every-five-minutes cron service using the backend image | Railway |
| Payments | Razorpay Orders REST API and Standard Checkout browser SDK | Razorpay |

Python dependencies are pinned in `backend/requirements.lock`; JavaScript dependencies are pinned in `frontend/package-lock.json`. Use Python 3.12 and Node.js 22 or newer.

## Complete folder structure

```text
farmdirect-cashews/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
├── README.md
├── VALIDATION.md
├── docker-compose.yml
├── backend/
│   ├── .dockerignore
│   ├── .env.example
│   ├── Dockerfile
│   ├── Procfile
│   ├── railway.json
│   ├── railway.cron.json
│   ├── requirements.txt
│   ├── requirements.lock
│   ├── alembic.ini
│   ├── pytest.ini
│   ├── app/
│   │   ├── __init__.py
│   │   ├── catalog.seed.json
│   │   ├── cli.py
│   │   ├── commerce.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── gateway.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── security.py
│   ├── migrations/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 23a039b8ba7d_initial_commerce_schema.py
│   │       └── b253b7deb817_verified_purchase_reviews.py
│   └── tests/
│       ├── conftest.py
│       └── test_commerce.py
└── frontend/
    ├── .env.example
    ├── components.json
    ├── next-env.d.ts
    ├── next.config.ts
    ├── package.json
    ├── package-lock.json
    ├── postcss.config.mjs
    ├── tsconfig.json
    ├── vercel.json
    ├── vitest.config.ts
    ├── public/
    │   └── images/
    │       └── cashews-hero.png
    └── src/
        ├── app/
        │   ├── globals.css
        │   ├── icon.svg
        │   ├── layout.tsx
        │   ├── page.tsx
        │   ├── loading.tsx
        │   ├── error.tsx
        │   ├── not-found.tsx
        │   ├── robots.ts
        │   ├── sitemap.ts
        │   ├── admin/page.tsx
        │   ├── help/page.tsx
        │   ├── policies/page.tsx
        │   ├── products/[slug]/page.tsx
        │   ├── shop/page.tsx
        │   └── track/page.tsx
        ├── components/
        │   ├── admin-dashboard.tsx
        │   ├── cart-drawer.tsx
        │   ├── catalog.tsx
        │   ├── footer.tsx
        │   ├── header.tsx
        │   ├── product-artwork.tsx
        │   ├── product-card.tsx
        │   ├── product-detail.tsx
        │   ├── reviews.tsx
        │   ├── tracking.tsx
        │   └── ui/
        │       ├── button.tsx
        │       └── sheet.tsx
        ├── data/catalog.json
        ├── lib/
        │   ├── api.ts
        │   ├── catalog.ts
        │   ├── razorpay.ts
        │   ├── types.ts
        │   └── utils.ts
        ├── stores/
        │   ├── cart.ts
        │   └── cart.test.ts
        └── test-setup.ts
```

## Local quick start

### Recommended: PostgreSQL, Redis, and the API in Docker

From the repository root:

```bash
docker compose up --build -d
```

This starts PostgreSQL, Redis, the API, and a local reservation worker. It applies migrations and inserts eight sample products with three weights each. The seed command inserts missing products and never resets existing prices or inventory.

In a second terminal:

```bash
cd frontend
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. API health is at `http://localhost:8000/health`; interactive API docs are at `http://localhost:8000/docs` in development.

The local Docker stack uses `PAYMENT_PROVIDER=mock`. Submit checkout with a configured PIN such as `600001`; then explicitly select **Simulate successful payment**. No payment SDK or real charge is used for this development flow. Production settings reject the mock gateway, and its endpoint does not exist in production.

Create an administrator interactively; there is no default password:

```bash
docker compose exec api python -m app.cli create-admin --email owner@example.com
```

Open `/admin` and sign in. Administrator JWTs stay in browser memory and expire after 30 minutes by default. A page refresh requires signing in again.

### Without Docker: SQLite development

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.lock
cp .env.example .env
```

For this local-only option, set the following in `backend/.env`:

```dotenv
APP_ENV=development
DATABASE_URL=sqlite:///./farmdirect.db
PAYMENT_PROVIDER=mock
REDIS_URL=
```

Then:

```bash
alembic upgrade head
python -m app.cli seed
python -m app.cli create-admin --email owner@example.com
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run the frontend as above. Without the Docker worker, periodically run `python -m app.cli expire-reservations` from `backend` to reconcile expired checkouts. SQLite is a convenience for development, not a substitute for PostgreSQL concurrency validation.

### Frontend-only design preview

Set `NEXT_PUBLIC_DEMO_CATALOG=true` in `frontend/.env.local`, then run `npm run dev`. This uses the checked-in catalog fixture, clearly labels the store as a preview, and disables checkout. With demo mode false, API failures produce an error state rather than invented live stock.

## Storefront functionality

- Landing page with the farm-to-table brand story, cashew grade comparison, configurable certifications, customer review section, gifting, and FAQs.
- Five categories: whole kernels, flavoured snacks, culinary/pieces, cashew butter, and festive hampers.
- Product pages and quick-add cards with 250 g, 500 g, and 1 kg variants, quantity controls, and dynamic prices.
- Search, category and grade filters, and ascending/descending price sorting.
- Persistent Zustand shopping bag and an accessible Radix dialog drawer with focus management and keyboard controls.
- Single-form checkout: contact details, Indian address, PIN serviceability, coupon validation, quote, and Razorpay payment.
- Private order tracking, chronological status updates, and review submission after delivery.
- JWT-protected inventory, order fulfilment, and review moderation screens.
- Responsive layouts, reduced-motion support, semantic headings, loading/error states, metadata, sitemap, and robots configuration.

Prices are integer paise throughout. The default sample coupon `FARM10` gives 10% off orders of at least ₹499, capped at ₹150. It is a reusable promotional code, not a one-use or first-customer-only coupon. Default delivery is ₹69, free from ₹999 **after discounts**. The backend owns these rules; quotes and created orders are authoritative.

## API contract

| Method | Path | Authentication / behavior |
| --- | --- | --- |
| GET | `/health` | Database/schema readiness and configured Redis connectivity |
| GET | `/api/products?category=whole-kernels&grade=W-320&limit=30&offset=0` | Active products with variants; up to 100 per page |
| GET | `/api/products/{slug}` | Product details; 404 for unavailable products |
| GET | `/api/delivery/{pincode}` | Explicit configured serviceability and delivery rules |
| POST | `/api/checkout/quote` | Reprices the bag, validates stock, PIN, and coupon |
| POST | `/api/orders/create` | Requires a unique `Idempotency-Key` header |
| POST | `/api/payments/verify` | Razorpay browser callback, with `X-Order-Token` |
| POST | `/api/payments/verify-webhook` | Razorpay raw-body HMAC signature |
| GET | `/api/orders/{id}/track` | Requires private `X-Order-Token`; excludes PII |
| POST | `/api/admin/auth/login` | Email/password; returns short-lived JWT |
| GET | `/api/admin/inventory` | Administrator bearer JWT; paginated |
| PATCH | `/api/admin/inventory/{variant_id}` | Administrator JWT; stock concurrency guard |
| GET | `/api/admin/orders` | Administrator JWT; optional payment status filter, pagination |
| PATCH | `/api/admin/orders/{id}/status` | Paid orders only; sequential fulfilment |
| GET | `/api/reviews?product_slug=everyday-whole-w320` | Published verified-purchase reviews only |
| POST | `/api/products/{slug}/reviews` | Delivered/paid order token; one review per product/order |
| GET | `/api/admin/reviews?approved=false` | Administrator JWT; review moderation queue |
| PATCH | `/api/admin/reviews/{id}` | Administrator JWT; publish/unpublish |

All administrator calls except login use `Authorization: Bearer <access_token>`. Inventory and order lists support `limit` and `offset`. The development mock-payment route is intentionally excluded from the production contract.

Example order creation, using the included W-320 250 g variant:

```http
POST /api/orders/create
Content-Type: application/json
Idempotency-Key: 0f275c2c-dc7e-43a6-83c8-53966d9b474f

{
  "items": [
    { "variant_id": "REPLACE_WITH_VARIANT_ID_FROM_GET_PRODUCTS", "quantity": 2 }
  ],
  "email": "buyer@example.com",
  "address": {
    "name": "Example Buyer",
    "phone": "9876543210",
    "line1": "12 Example Street",
    "line2": "",
    "city": "Chennai",
    "state": "Tamil Nadu",
    "pincode": "600001"
  },
  "coupon": "FARM10"
}
```

The response includes `id`, `reference`, server-calculated totals, `razorpay_order_id`, the public `razorpay_key_id`, a private `order_token`, payment state, and reservation expiry. The public key comes from the API response, so no Razorpay secret or frontend key environment variable is required.

Reuse the same idempotency key for a retry of the same checkout payload. Changing the payload with that key returns 409. Never send client-calculated prices. Tracking uses the full order UUID plus access key, not only the shorter display reference.

Inventory updates require both `stock_on_hand` and `expected_stock_on_hand`; a stale expected value returns 409. Reserved stock cannot be removed. Status changes follow `PLACED → PACKED → SHIPPED → DELIVERED`; shipping requires `carrier` and `tracking_number`.

## Stock and payment correctness

1. The server aggregates duplicate variant lines, verifies serviceability/coupon, locks variants in a consistent order, and takes prices from the database.
2. Unique idempotency keys and conditional stock updates prevent duplicate reservations and overselling. The address, order, items, and reservation commit together.
3. Gateway creation is serialized per order. A gateway timeout leaves a durable reservation for safe retries. A provider order created during an ambiguous timeout can be orphaned; only its committed ID is offered to checkout. Unmatched captures return 503 and log an operational error for reconciliation.
4. The browser callback verifies HMAC of the **stored** provider order ID and payment ID with the Razorpay API secret, then fetches the payment from Razorpay. Authorization alone never marks an order paid.
5. Webhooks verify HMAC-SHA256 over the **unchanged raw bytes**, using the separate webhook secret. `payment.captured` and `order.paid` both validate order ID, amount, currency, payment ID, and captured state.
6. Event receipts and unique provider payment IDs make duplicate and out-of-order notifications safe. Stock is consumed once. A second capture is recorded and moves the order to `REVIEW` instead of consuming inventory again.
7. The cron reconciler checks the provider before releasing expired reservations. Authorized payments keep their reservation. Provider failures fail the job without releasing stock.
8. A capture arriving after release reacquires available stock atomically, or moves the order to `REVIEW`. Review orders cannot be fulfilled; the operator must reconcile or refund them through the provider and maintain an appropriate operational record. Automated refunds and a review-resolution workflow are outside this implementation.

The reservation timer does not expire the provider's Razorpay Order. Delayed payments are deliberately handled by the late-capture path. Monitor prolonged authorizations, review orders, unmatched captures, failed cron runs, and webhook delivery failures.

## Deploy the backend to Railway

1. Put this monorepo in your Git repository. Create a Railway project with PostgreSQL, Redis, and an API service connected to the repo.
2. Set the API service **Root Directory** to `/backend`. Set its config file path to `/backend/railway.json` when connecting from the monorepo root. The Dockerfile path inside that config is relative to the service build context.
3. Set the variables from `backend/.env.example`. For production these are required:

   ```dotenv
   APP_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   CORS_ORIGINS=https://your-store.vercel.app,https://your-custom-domain.example
   JWT_SECRET=<independent-random-secret-at-least-40-characters>
   ORDER_TOKEN_SECRET=<different-random-secret-at-least-40-characters>
   PAYMENT_PROVIDER=razorpay
   RAZORPAY_KEY_ID=<your-key-id>
   RAZORPAY_KEY_SECRET=<your-api-secret>
   RAZORPAY_WEBHOOK_SECRET=<your-separate-webhook-secret>
   SERVICEABLE_PINCODES=<your-carrier-verified-comma-separated-PIN-codes>
   ```

   Railway reference names must match your actual service names. Standard `postgres://` and `postgresql://` URLs are normalized for psycopg. Generate each app secret independently, for example with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Enter secrets in the platform environment settings, never commit them.

4. `railway.json` runs `alembic upgrade head` as a pre-deploy command and checks `/health`. The Docker image defaults to production, so missing production secrets cause startup to fail visibly. It runs as a non-root user and honors Railway's `PORT`.
5. Seed once with `python -m app.cli seed` using the service environment. Replace sample products, prices, ingredients, and stock with the farm's real catalog. Create the administrator using `python -m app.cli create-admin` in a secure interactive service session.
6. Create a second service from the same repo/root for reservations. Select `/backend/railway.cron.json` as its config. Share the same production database, payment provider, and application secrets/environment values. It runs `python -m app.cli expire-reservations` every five minutes and exits. Do not configure the API health check on this cron service.
7. Generate the API HTTPS domain and check `/health`. Configure trusted proxy addresses in `FORWARDED_ALLOW_IPS` for your deployment topology so rate limits see real clients. Do not trust arbitrary forwarded headers on a directly reachable origin.

The sample compose database credentials are local development values. The production database must be managed PostgreSQL; shared Redis is enforced for production rate limits. Use platform-managed database backups and configure service/cron error alerts.

## Deploy the frontend to Vercel

Import the same Git repository as a Vercel project. Set **Root Directory** to `frontend` and Framework Preset to Next.js. The included `frontend/vercel.json` uses `npm ci`, `npm run build`, and the `bom1` region.

Set:

```dotenv
NEXT_PUBLIC_API_URL=https://your-api.up.railway.app
API_URL=https://your-api.up.railway.app
NEXT_PUBLIC_SITE_URL=https://your-store.vercel.app
NEXT_PUBLIC_DEMO_CATALOG=false
NEXT_PUBLIC_FSSAI_LICENSE=<verified-license-if-applicable>
NEXT_PUBLIC_ORGANIC_CERTIFICATE_URL=<verified-HTTPS-certificate-link-if-applicable>
NEXT_PUBLIC_ORIGIN_NAME=<verified-farm-location>
NEXT_PUBLIC_SUPPORT_EMAIL=<store-support-email>
```

Public environment variables are built into browser bundles; redeploy after changes. Razorpay API and webhook secrets belong exclusively on Railway. `next.config.ts` includes security headers and an API/Razorpay content security policy. Exercise the payment methods you enable in a real staging browser before launch; no live Razorpay transaction was made during source validation.

Configure stable staging origins explicitly in the API CORS list; arbitrary Vercel preview domains are not automatically trusted. A fixture preview is blocked from indexing by robots rules.

## Razorpay setup

In the Razorpay dashboard:

1. Start with Test Mode API credentials and configure automatic payment capture.
2. Add the HTTPS webhook `https://your-api.up.railway.app/api/payments/verify-webhook`.
3. Use a separate webhook secret matching `RAZORPAY_WEBHOOK_SECRET`; subscribe to `payment.captured` and `order.paid`.
4. Complete a test checkout and confirm stock, payment state, tracking, webhook retries, and fulfilment in the admin screen. Simulate failed/closed checkout, delayed capture, and retry scenarios too.
5. When the real store details and policies are ready, configure the Live Mode keys and corresponding Live Mode webhook. Retain the previous webhook secret in `RAZORPAY_PREVIOUS_WEBHOOK_SECRET` during rotation if earlier events can still retry.

The application never takes card numbers. The private tracking key is displayed after checkout and saved in session storage; there is no transactional email integration in this scope. If email receipts and cross-device recovery are required, integrate a provider before opening orders and send tracking access privately.

## Validation

From `backend`:

```bash
pip install -r requirements.lock
alembic upgrade head
alembic check
pytest -q
```

For row-lock/concurrency validation, set `TEST_DATABASE_URL` to a **disposable** PostgreSQL database and run the same tests. The fixture drops and recreates application tables; never point it at a production or shared database. The GitHub Actions workflow supplies a separate PostgreSQL 16 service and runs those tests automatically when installed in a repo.

From `frontend`:

```bash
npm ci
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

See `VALIDATION.md` for observed results and verification limits. Browser/device QA, live payment validation, and actual Railway/Vercel deployment remain environment-specific release checks.

## Brand content and image

Set only verified FSSAI and organic information. The review section starts empty; delivered customers can submit a review through `/track`, and administrators can publish it through `/admin`. Complete the prelaunch policy page with the business's legal identity, privacy/retention details, contact information, shipping commitments, cancellations, returns, and refund terms before accepting live orders.

`frontend/public/images/cashews-hero.png` was created with the built-in image generation tool as illustrative marketing art. It is not evidence of the real farm or final packaging. Product pouches, jars, and the gift box are code-native illustrations and are labelled accordingly.

Image prompt: “Editorial hero photograph for a premium farm-direct cashew e-commerce storefront. Photorealistic landscape still life, 3:2 aspect ratio: a generous shallow rustic handmade ivory ceramic bowl filled with large creamy natural whole cashew kernels on a warm light beige stone tabletop; a handful of cashews scattered on soft oatmeal linen in foreground; a small fresh green cashew tree leaf branch entering at upper right. Close, slightly overhead angle, bowl center-right, negative space around edges. Warm natural side sunlight from left, soft organic shadows, tactile minimal premium food magazine photography, subtle film grain, muted earthy forest green and cream. No text, lettering, logos, packaging, people, seals, or certification marks. Illustrative marketing image, not documentation of a real farm.”

## Primary integration references

- [Razorpay Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Razorpay webhook signature, replay, and event ordering guidance](https://razorpay.com/docs/webhooks/validate-test/)
- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Railway monorepo deployments](https://docs.railway.com/deployments/monorepo)
- [Vercel monorepo configuration](https://vercel.com/docs/monorepos)
