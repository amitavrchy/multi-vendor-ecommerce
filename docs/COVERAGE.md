# Specification coverage

| Area | Implementation |
| --- | --- |
| Auth/profile/addresses | Implemented, browser tested |
| Customer/owner/staff/support/admin | Role and store scoping |
| Vendor KYC | Apply, private upload/document URL, review/resubmit/suspend |
| Catalog | Products, categories, media upload, variants, drafts/edit/archive and moderation |
| Checkout/inventory | Atomic reservations, TTL, compensation, snapshots, idempotency |
| Order split | Master and independently fulfilled/cancelled vendor shipments |
| COD | Implemented, settlement after delivery |
| Stripe | Checkout, signatures, idempotent refunds and verified settlement polling; merchant certification required |
| SSLCommerz | Sessions, validated IPN, browser return, refund initiation/status verification; legacy or uncertain transactions enter manual review; merchant certification required |
| bKash/Nagad | Implemented checkout and server verification, protocol/crypto contract tests; merchant credentials/certification required |
| Commission | Vendor/category override UI, snapshots and integer allocation; configurable payment fee share |
| Coupons | Platform/vendor-funded percentage/minimum/cap/expiry and administration |
| Payouts | Ledger, balances, weekly idempotent batches, protected account instructions and reconciled external transfers |
| Returns | Partial-line quantities, configurable window/restocking, approval/receipt/refund/clawback |
| Disputes | Scoped conversations for customer/vendor/support, resolution and reopening |
| Reviews | Verified delivery, one per product/user, seven-day edit window |
| Search/recommendations | Indexed PostgreSQL, filters/sort/paging and related categories; no Elasticsearch |
| Notifications | Inbox, Socket.IO Redis adapter, SMTP/SMS delivery receipts/retries and scheduled review requests |
| Jobs | Expiry, fair mobile payment reconciliation, leased refund settlement checks, late-payment refunds, outbox retries, review requests and weekly payout preparation |
| Cache | Redis category/product cache, mutation invalidation, CDN surrogate tag/purge adapter and Redis rate buckets |

## Acceptance evidence

PostgreSQL integration tests cover two-vendor split/snapshots, wait-for-payment stock consumption, all-or-nothing reservation, failure release, concurrent oversell prevention, webhook replay, delivery-only COD credit, negative-balance refund clawback, suspended search visibility and provider pluggability.

Additional database tests cover partial-return fees/quantity limits, late-payment refunds, scoped dispute threads and SMTP retry/deduplication. Browser tests also exercise private file authorization, public product uploads, variant selection, support conversations and vendor-funded coupon settings. Contract tests exercise bKash grant/query verification and Nagad encrypted/signed handshakes, plus Stripe signatures and SSLCommerz validation. No test made a real external charge or transfer.

Refund tests also cover asynchronous settlement, concurrent worker claims, stale-worker responses, ambiguous submissions, explicit failed-refund escalation and expired idempotency windows. Production admin bootstrap tests verify password hashing and refusal to promote or reset an existing account. Container deployment includes PostgreSQL/Redis persistence, health checks and Caddy HTTPS routing; see [Deployment](DEPLOYMENT.md).

External merchant certification, actual bank transfers, mail/SMS accounts, storage credentials and deployment infrastructure require operator configuration. Elasticsearch remains optional; PostgreSQL search is the implemented driver.
