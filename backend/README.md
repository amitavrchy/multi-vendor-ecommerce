# Bazaar · Multi-vendor marketplace

A Next.js storefront and NestJS commerce API built from [Project_spec.md](docs/Project_spec.md): customer shopping, seller/admin workspaces, transactional checkout, and a PostgreSQL financial ledger. The repository contains only `frontend/` and `backend/` plus Git metadata. Each application installs and builds independently; shared documentation, infrastructure and deployment assets live in this folder.

## Start locally

Requires Node.js 24+, npm and running Docker Desktop with Linux containers.

```sh
npm ci
npm run setup
npm run dev
```

Run these commands from `backend/`. In another terminal, run `npm ci` and `npm run dev` from `frontend/`. Open **http://localhost:3187**. API: **http://localhost:4187/api**. PostgreSQL/Redis bind to loopback ports **55871/56871**. Setup creates ignored environment files with fresh session/encryption keys, applies migrations, and seeds demo data; existing configuration is preserved.

For a configured database, run `db:generate`, `db:migrate` and `db:seed` separately. `db:push` is for experiments; migrations also install search indexes and inventory/financial constraints.

## Demo accounts

Password: **`BazaarDemo2026!`**, or your `SEED_PASSWORD` value.

| Role | Email |
| --- | --- |
| Customer | `customer@bazaar.test` |
| Form & Field owner | `owner@form.test` |
| Sound Studio owner | `owner@sound.test` |
| The Everyday Co. owner | `owner@everyday.test` |
| Platform admin | `admin@bazaar.test` |
| Support | `support@bazaar.test` |

Seed: 3 verified stores, 30 products, an address, and WELCOME10 (10% off goods above ৳1,000, capped at ৳1,000). Production seeding is disabled. Re-seeding preserves orders and vendor edits while updating demo passwords.

## Working features

- Responsive storefront with minimum 14px text, reduced-motion support, keyboard/modal accessibility and local photography.
- Full-text search, live suggestions, filters/sort/paging, categories, details and account-synced wishlists with guest merge.
- Four-product comparison, recorded price history, target-price/restock alerts, followed stores, personalized recommendations and local recently viewed history.
- Seller analytics: 14/30/90-day Dhaka reporting windows, sales chart, accessible daily table, CSV export, top variants, followers and low-stock inventory.
- Editorial landing page with shoppable collections, interactive edits, maker story, seller invitation and expandable FAQs.
- Registration, HTTP-only sessions, role/store scoping, profiles, addresses and notifications.
- Private KYC/product uploads, admin approval/suspension, team access management, product/variant editing, moderation and inventory.
- Multi-store bags, coupons, integer BDT totals, split orders, atomic reservations, TTL expiry and idempotent checkout.
- COD, Stripe Checkout, SSLCommerz IPN, bKash tokenized checkout and Nagad signed/encrypted checkout with server verification.
- Fulfillment, partial returns, configurable return/restocking policies, verified reviews, dispute conversations, refund outbox and ledger clawbacks.
- Category/vendor commissions, platform/vendor-funded coupons, weekly payout batches, SMTP/SMS receipts/retries, delayed review requests, Redis cache/rate limiting and Socket.IO clustering.

## Integration boundaries

The adapters and application workflows are implemented and automatically tested. External services still need your merchant credentials, public HTTPS callback URLs, SMTP/SMS configuration, and private S3-compatible storage for production uploads. Without credentials, payment methods stay unavailable and outbound delivery receipts are marked SKIPPED. Development uploads use ignored local disk storage. No real external charge or transfer was made during testing; merchant sandbox/live certification remains an operational step.

Returns accept individual items/quantities with snapshotted discount and net allocations. Admins configure the return window, restocking fee, review-email delay and payout weekday. Shipping is non-refundable on returns. Payouts prepare weekly or on demand and require actual external transfer confirmation, as the specification permits a stub transfer API. Stripe and SSLCommerz refunds reconcile automatically; SSLCommerz requires the bank transaction reference from a verified payment. COD/mobile-wallet refunds and uncertain submissions require operator confirmation. Ledger adjustments only follow confirmed settlement. Late successful payments on expired orders automatically enter the refund workflow.

Production containers, HTTPS routing, dependency health checks and first-admin setup are documented in [Deployment](docs/DEPLOYMENT.md). Configure your domain, private object storage and service credentials before launch.

See [coverage](docs/COVERAGE.md), [architecture](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), and [asset credits](ASSETS.md).

## Validation

```sh
npm run typecheck
npm test
npm run test:integration
npm run build
npx playwright install chromium
# From frontend/, with both apps running:
npm run test:e2e
npm audit
```

Integration tests use a separate **bazaar_test** database and never reset development data. Browser tests create uniquely named demo records on the running development app. Override `E2E_PASSWORD` if you changed the seed password. `npm run verify` from backend runs both apps' source and build checks plus database tests.

Production build locally: run `npm run build` and `npm start` separately in each application. `npm run format:check` verifies formatting. Browser screenshots and traces stay under frontend's ignored folders.

GitHub only discovers Actions under a root `.github/workflows` folder. To honor the two-folder layout, the updated workflow is retained as a template under `backend/deploy/github/workflows/ci.yml`; automatic Actions are therefore inactive in this layout. All checks can run locally with `npm run verify` and frontend's `npm run test:e2e`.
