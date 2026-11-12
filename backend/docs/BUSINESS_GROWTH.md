# Business, subscriptions and growth

The two-folder layout is unchanged. All functionality uses the existing authenticated API, PostgreSQL transactions, provider adapters, reservations and outbox delivery. No external charge or email was sent during implementation tests.

## Business buying

Customers apply at `/business` with legal name, registration number and billing address. Administrators review the application in Admin → Business verification. Updating a business profile resets approval. Business approval changes pricing eligibility, not the user's security role.

Seller → Business sales manages quantity tiers and incoming quote requests. Thresholds are unique, prices decrease as quantities increase, and prices cannot exceed retail. Only approved business buyers receive tier prices. Checkout snapshots authoritative server prices and financial allocations; the cart/checkout preview uses the same pricing rules. If retail becomes cheaper than a tier or agreed offer, checkout uses the lower retail price.

Verified buyers request quotes from a product page. Only that product's store owner can offer a price and an expiry of 1–14 days. The buyer accepts or declines. Accepted, unexpired quotes open their own checkout, reserve stock, and create a single-vendor order without replacing the ordinary bag. Quote orders are single-use; repeated requests return the existing checkout. Unpaid cancellation releases the quote for retry. Unavailable products and revoked business approval block new quote checkouts. Quote quantities support 2–999 units, subject to actual stock and the order value limit.

## Replenishment subscriptions

Product pages offer schedules of 14, 30, 60 or 90 days, 1–99 units. Customers manage schedules at `/subscriptions`: pause, resume, skip a due renewal or cancel future renewals. Placed orders are managed separately in Orders.

Maintenance creates one due renewal and an account/email notification per cycle; serializable transactions prevent duplicate cycles. Only one unpaid due renewal is retained for a schedule. Renewals do not automatically charge or reserve stock. Customers review current prices, shipping and stock, choose an address/payment provider and explicitly check out. Quote and renewal checkouts reuse provider idempotency, refunds, coupons and inventory protection. A cancelled unpaid checkout releases its renewal for retry. Cancelling a schedule skips its outstanding due renewals.

This is a customer-approved replenishment subscription. Off-session recurring card billing is not enabled or represented as available for COD/mobile gateways.

## Loyalty and referrals

The Rewards page shows account-owned points, vouchers and ledger entries. Completed delivery earns one point per ৳100 of eligible net goods, excluding shipping, cancelled goods and returned goods (including any retained restocking fee). All shipments must reach a terminal delivered/cancelled state and payment must be settled. Replayed delivery earns nothing extra.

Redeeming 100 points creates a personal, platform-funded ৳100 voucher, valid for 90 days on goods of at least ৳100. Serializable ledger reads prevent concurrent overspending. Vouchers are single-use and bound to the owning account; an unpaid cancelled order releases its voucher. Fully cancelled shipments also release it. Returns recalculate earned points. An already-redeemed reward can leave a negative points balance; redemption and use of outstanding reward vouchers stay blocked until future earnings recover the balance.

Each shopper has a private referral code to share. A new shopper claims one other person's code before placing their first order. Self-referral and repeated claims are rejected. The first qualifying completed delivery of at least ৳1,000 in eligible goods awards 100 points to each person. If returns reduce that qualifying order below the threshold, both bonuses reverse once. Rewards are store benefits, not withdrawable cash.

## Consent-based marketing

The landing page and `/newsletter` collect explicit email opt-in. SMTP must be configured before accepting subscriptions. Confirmation links expire after 24 hours; only confirmed subscribers are eligible for campaigns. Repeated confirmation is idempotent. Confirmation/unsubscribe tokens are hashed for lookup and encrypted for durable email delivery; retain the bank encryption key and re-encrypt these tokens during key rotation.

Admin → Marketing creates drafts, selects all confirmed subscribers or verified businesses, schedules delivery and cancels remaining delivery. Maintenance queues recipients in batches of 50 with stable per-campaign/subscriber event IDs. `QUEUED` means preparation finished; successful email delivery is counted separately using receipts. Unsubscribe and campaign cancellation are checked again at dispatch. Removing SMTP configuration retains eligible messages for retry instead of silently dropping them. Delivery retries use the existing receipt leases and deduplication. Emails contain an unsubscribe link; order/account notifications are separate.

Marketing drafts and audience counts are administrator-only. Public subscribe/confirm/unsubscribe responses never disclose the subscriber list. Tests use isolated databases, mocked delivery and synthetic addresses.
