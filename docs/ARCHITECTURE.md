# Architecture

`frontend/` uses Next.js App Router. Same-origin `/api/*` proxies to NestJS. Session cookies are HTTP-only. Wishlists are browser-local, carts are server-persisted. Socket.IO authenticates sessions and joins customer/vendor-specific rooms.

`backend/` uses NestJS, Zod and Prisma 7's PostgreSQL driver adapter. `Db.atomic` retries serializable transaction conflicts. Authorization reloads roles from PostgreSQL, then scopes store access to owners or assigned staff.

## Checkout and settlement

1. Validate the customer's address and authoritative cart. All products/vendors must be active.
2. In one serializable transaction, snapshot titles/prices/commission, create a master and per-vendor shipments, and conditionally reserve every variant. Any shortage rolls back all writes.
3. Create an intent outside the transaction; compensate failures by releasing reservations. Idempotency keys return the original result. Interrupted CREATED intents can resume.
4. Verified online success consumes stock and clears purchased cart quantities. Failure releases reservations. Unique provider/event pairs prevent replay; amounts/references must match.
5. COD consumes stock at confirmation but credits no vendor before delivery. Unique delivery ledger references prevent duplicate credit.
6. Payout preparation moves available earnings to pending with a unique item per shipment. Operator-confirmed external transfer completes the batch.
7. Received returns enqueue idempotent refunds. Settled/reconciled refunds claw back earnings and restock goods. Paid vendors may acquire negative available balances.

Money uses integer minor units. Coupon rounding remainders go to the final vendor. Platform-funded promotions leave vendor earnings unchanged. Shipping snapshots ৳80 per vendor.

## Background, search and security

BullMQ/Redis schedules maintenance every ten seconds. Without Redis, a single-process timer runs it. Outbox events retry up to twenty times; notification IDs are unique. Socket.IO delivery may repeat, so clients reload authoritative records.

`SearchDriver` abstracts parameterized PostgreSQL full-text/substring search, filtering, ordering and pagination. A GIN expression index supports text matching. Elasticsearch is optional and unimplemented.

Bank details use AES-256-GCM and are omitted from responses. Stripe validates raw signatures; SSLCommerz performs authenticated server validation. Browser returns never settle payment. Helmet, origin checks and per-process request buckets protect the API. Migrations enforce uniqueness, foreign keys and inventory/refund bounds. Replicas require shared rate limiting and Socket.IO routing.
