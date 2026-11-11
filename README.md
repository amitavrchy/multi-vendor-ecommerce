# Bazaar · Multi-vendor marketplace

A Next.js storefront and NestJS commerce API built from [Project_spec.md](Project_spec.md): customer shopping, seller/admin workspaces, transactional checkout, and a PostgreSQL financial ledger.

## Start locally

Requires Node.js 24+, npm and running Docker Desktop with Linux containers.

```sh
npm ci
npm run setup
npm run dev
```

Open **http://localhost:3187**. API: **http://localhost:4187/api**. PostgreSQL/Redis bind to loopback ports **55871/56871**. Setup creates ignored environment files with fresh session/encryption keys, applies migrations, and seeds demo data; existing configuration is preserved.

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
- Full-text search, filters/sort/paging, categories, details, related products and browser-saved wishlists.
- Registration, HTTP-only sessions, role/store scoping, profiles, addresses and notifications.
- KYC document links, admin approval/suspension, team assignment, catalog drafts/editing/moderation and inventory.
- Multi-store bags, coupons, integer BDT totals, split orders, atomic reservations, TTL expiry and idempotent checkout.
- COD, configured Stripe Checkout and configured SSLCommerz with server-validated IPN.
- Fulfillment/tracking, cancellation, verified reviews, shipment returns, refund outbox, ledger clawbacks and manual payouts.

## Integration boundaries

This is a runnable development product, **not a certified live-money deployment**. Stripe/SSLCommerz require merchant credentials, public HTTPS callbacks and sandbox/live certification. **bKash/Nagad are disabled placeholder adapters**, not completed integrations. KYC accepts secure document URLs; direct S3 uploads remain. Notifications are in-app/Socket.IO; SMTP/SMS and scheduled review emails remain.

Returns cover an entire vendor shipment within 14 days, without restocking fees or original-shipping refunds. Coupons are platform-funded. Payouts require actual external transfers and manual confirmation. COD/SSLCommerz and pending Stripe refunds require reconciliation before ledger adjustment. Late successful payments on expired orders require operator review.

See [coverage](docs/COVERAGE.md), [architecture](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), and [asset credits](ASSETS.md).

## Validation

```sh
npm run typecheck
npm test
npm run test:integration
npm run build
npx playwright install chromium
# Keep npm run dev running in another terminal:
npm run test:e2e
npm audit
```

Integration tests use a separate **bazaar_test** database and never reset development data. Browser tests create uniquely named demo records on the running development app. Override `E2E_PASSWORD` if you changed the seed password. GitHub Actions uses fresh service containers.

Production build locally: `npm run build`, then `npm run start -w backend` and `npm run start -w frontend` in separate terminals. `npm run format:check` verifies formatting.
