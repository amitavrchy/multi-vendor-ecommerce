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
- Private KYC/product uploads, admin approval/suspension, team access management, product/variant editing, moderation and inventory.
- Multi-store bags, coupons, integer BDT totals, split orders, atomic reservations, TTL expiry and idempotent checkout.
- COD, Stripe Checkout, SSLCommerz IPN, bKash tokenized checkout and Nagad signed/encrypted checkout with server verification.
- Fulfillment, partial returns, configurable return/restocking policies, verified reviews, dispute conversations, refund outbox and ledger clawbacks.
- Category/vendor commissions, platform/vendor-funded coupons, weekly payout batches, SMTP/SMS receipts/retries, delayed review requests, Redis cache/rate limiting and Socket.IO clustering.

## Integration boundaries

The adapters and application workflows are implemented and automatically tested. External services still need your merchant credentials, public HTTPS callback URLs, SMTP/SMS configuration, and private S3-compatible storage for production uploads. Without credentials, payment methods stay unavailable and outbound delivery receipts are marked SKIPPED. Development uploads use ignored local disk storage. No real external charge or transfer was made during testing; merchant sandbox/live certification remains an operational step.

Returns accept individual items/quantities with snapshotted discount and net allocations. Admins configure the return window, restocking fee, review-email delay and payout weekday. Shipping is non-refundable on returns. Payouts prepare weekly or on demand and require actual external transfer confirmation, as the specification permits a stub transfer API. COD/SSLCommerz/mobile-wallet and pending Stripe refunds are operator-reconciled before ledger adjustment. Late successful payments on expired orders automatically enter the refund workflow.

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
