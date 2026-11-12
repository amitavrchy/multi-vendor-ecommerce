# Architecture

`frontend/` uses Next.js App Router. Same-origin `/api/*` proxies to NestJS. Session cookies are HTTP-only. Guest wishlists merge into account-owned PostgreSQL favourites at sign-in; comparison/recent history stay browser-local. Carts, alerts and store follows are server-persisted. Socket.IO authenticates sessions and joins customer/vendor-specific rooms.

`backend/` uses NestJS, Zod and Prisma 7's PostgreSQL driver adapter. `Db.atomic` retries serializable transaction conflicts. Authorization reloads roles from PostgreSQL, then scopes store access to owners or assigned staff.

## Checkout and settlement

1. Validate the customer's address and authoritative cart. All products/vendors must be active.
2. In one serializable transaction, snapshot titles/prices/commission, create a master and per-vendor shipments, and conditionally reserve every variant. Any shortage rolls back all writes.
3. Create an intent outside the transaction; compensate failures by releasing reservations. Idempotency keys return the original result. Interrupted CREATED intents can resume.
4. Verified online success consumes stock and clears purchased cart quantities. Failure releases reservations. Unique provider/event pairs prevent replay; amounts/references must match.
5. COD consumes stock at confirmation but credits no vendor before delivery. Unique delivery ledger references prevent duplicate credit.
6. Payout preparation moves available earnings to pending with a unique item per shipment. Operator-confirmed external transfer completes the batch.
7. Received returns enqueue idempotent refunds. Settled/reconciled refunds claw back earnings and restock goods. Paid vendors may acquire negative available balances.

Money uses integer minor units with exact BigInt-backed largest-remainder allocation. Coupon funding, vendor net and per-return unit allocations preserve every minor unit. Platform-funded promotions leave vendor earnings unchanged; vendor-funded promotions and configured payment fee shares reduce them. Shipping snapshots ৳80 per vendor.

## Background, search and security

BullMQ/Redis schedules maintenance every ten seconds. Without Redis, a single-process timer runs it. Jobs expire stock, reconcile mobile payments, queue delayed review requests and prepare weekly payout batches. Outbox events retry up to twenty times; notification IDs are unique. SMTP/SMS receipts deduplicate successful attempts and lease interrupted attempts. Socket.IO uses a Redis adapter and may deliver repeated events, so clients reload authoritative records.

Price/restock watches rotate by last-check time. A serializable transaction atomically disables a triggered watch and writes an outbox event keyed by alert generation; concurrent workers cannot notify twice. Restock calculations subtract reservations. Suspended/draft listings never trigger. Email uses the same durable delivery receipts as orders, while in-account notifications and sockets expose the event to the shopper. Seller price edits append real observations, with no fabricated historic prices. Recommendations combine saved categories and followed stores, exclude saved/unavailable products, and fill remaining slots with available featured finds.

Seller analytics scopes every query to the owner’s store, uses Dhaka calendar boundaries, and separates booked sales from ledger earnings. Charts, accessible tables and CSV share the same daily data. Categories, store pages and product details link into shopping tools rather than maintaining separate mock data.

`SearchDriver` abstracts parameterized PostgreSQL full-text/substring search, filtering, ordering and pagination. A GIN expression index supports text matching. Elasticsearch is optional and unimplemented.

Bank details use AES-256-GCM; only protected administrator payout instructions decrypt them. Stripe validates raw signatures, SSLCommerz validates server-to-server, bKash queries authoritative payment state, and Nagad authenticates its encrypted/signed handshake before server verification. Browser success flags never settle payment. Helmet, origin checks and shared Redis rate buckets protect the API. Migrations enforce uniqueness, foreign keys and inventory/refund bounds. Redis caches categories/product details; successful mutations invalidate the catalog generation and optionally purge configured CDN surrogate tags, with durable retry on failure.
