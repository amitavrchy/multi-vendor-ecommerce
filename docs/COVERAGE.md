# Specification coverage

| Area | Implementation |
| --- | --- |
| Auth/profile/addresses | Implemented, browser tested |
| Customer/owner/staff/support/admin | Role and store scoping |
| Vendor KYC | Apply, document URL, review/resubmit/suspend; no direct upload |
| Catalog | Products, categories, variants in schema/API, draft/edit/moderation; no media pipeline or variant-builder UI |
| Checkout/inventory | Atomic reservations, TTL, compensation, snapshots, idempotency |
| Order split | Master and independently fulfilled/cancelled vendor shipments |
| COD | Implemented, settlement after delivery |
| Stripe | Checkout, signatures, refunds; merchant certification required |
| SSLCommerz | Sessions, validated IPN, browser return, manual refunds; merchant certification required |
| bKash/Nagad | Disabled placeholders; protocol implementation/certification remain |
| Commission | Vendor rate, category override in schema, snapshot/rounding; no category commission administration UI |
| Coupons | Platform-funded percentage/minimum/cap/expiry; no vendor-funded promotions |
| Payouts | Ledger, balances, idempotent batches and manual reconciliation; no transfer API or weekly automation |
| Returns | Shipment RMA, 14-day window, approval/receipt/refund/clawback; no partial-line RMA/restocking fee |
| Disputes | Support order/return mediation; no independent case/conversation model |
| Reviews | Verified delivery, one per product/user, seven-day edit window |
| Search/recommendations | Indexed PostgreSQL, filters/sort/paging and related categories; no Elasticsearch |
| Notifications | Inbox and Socket.IO; no SMTP/SMS or scheduled review email |
| Jobs | Expiry and outbox/refund retries; operator-triggered payouts |
| Cache | Next static delivery; dedicated category Redis cache/CDN tag invalidation remain |

## Acceptance evidence

PostgreSQL integration tests cover two-vendor split/snapshots, wait-for-payment stock consumption, all-or-nothing reservation, failure release, concurrent oversell prevention, webhook replay, delivery-only COD credit, negative-balance refund clawback, suspended search visibility and provider pluggability.

Browser tests cover search/wishlist/mobile typography, two-store checkout, review/return, seller/admin roles, API authorization, and seller application through KYC/product publication. Unit tests cover money, coupons, master states, authenticated encryption and COD semantics. No test made a real external charge or transfer.

This is not a claim that every original specification item is production complete.
