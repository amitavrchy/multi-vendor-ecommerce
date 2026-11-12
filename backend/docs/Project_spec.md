# Multi-Vendor E-Commerce Marketplace — Project Spec

> Stack: **Next.js + NestJS + Prisma + PostgreSQL + Redis/BullMQ + Elasticsearch(optional) + Socket.IO**  
> Multi-vendor marketplace with **pluggable multi-payment** (Stripe, SSLCommerz, bKash, Nagad, COD), split payouts/commission, vendor KYC, per-vendor order splitting, returns/refunds, search, reviews.

---

## 1. Overview & Goals

Build a production-shaped marketplace (think mini-Daraz): customers buy a cart mixing vendors; platform splits orders; collects payment via multiple BD + international gateways; settles vendor payouts minus commission; handles returns.

### Engineering goals
- `PaymentProvider` adapter pattern with unified intents + webhooks.
- Order split + **saga / outbox** for stock reservation across vendors.
- Commission rules engine; payout ledger with idempotent transfers.
- Vendor onboarding KYC state machine.
- Search: Postgres full-text first; interface for ES later.

---

## 2. Roles & Permissions

| Role | Scope |
|------|-------|
| `PLATFORM_ADMIN` | Vendors, commissions, disputes, payouts, catalog moderation |
| `VENDOR_OWNER` | Store settings, team, payout bank, catalog, orders |
| `VENDOR_STAFF` | Orders, inventory (limited) |
| `CUSTOMER` | Cart, checkout, orders, reviews, returns |
| `SUPPORT_AGENT` | Read orders, mediate disputes |

---

## 3. Feature Modules

1. Auth / profiles / addresses  
2. Vendor onboarding & KYC  
3. Catalog (vendor products, variants, media, categories)  
4. Inventory reservation  
5. Cart & checkout  
6. Order split & fulfillment  
7. Payments (multi-gateway)  
8. Payouts & commission  
9. Returns / refunds / disputes  
10. Reviews & ratings (verified purchase)  
11. Search & recommendations (basic)  
12. Notifications  
13. Admin moderation  

---

## 4. Advanced Business Logic

### 4.1 Checkout saga (stock + payment)
```
1. Validate cart; group lines by vendorId
2. BEGIN: create Order(MASTER) + child VendorOrders (PENDING_PAYMENT)
3. Reserve stock per vendor (row locks); write Reservation(expiresAt)
4. Create PaymentIntent via selected provider (amount = grand total)
5. Outbox event PAYMENT_STARTED
On webhook SUCCEEDED:
  mark payment; VendorOrders → PAID/AWAITING_FULFILLMENT; convert reservations → decrements; clear cart
On fail/expire:
  release reservations; cancel orders
```
Use transactional outbox table processed by worker.

### 4.2 Payment adapter interface
```ts
interface PaymentProvider {
  code: 'STRIPE'|'SSLCOMMERZ'|'BKASH'|'NAGAD'|'COD';
  createIntent(input: CreateIntentInput): Promise<IntentResult>; // redirectUrl | clientSecret | instructions
  parseWebhook(req): Promise<NormalizedEvent>;
  refund(providerRef, amountMinor, idempotencyKey): Promise<RefundResult>;
  supportsPartialRefund: boolean;
}
```
COD: intent auto-succeeds as `COD_PENDING`; captures on delivery confirm.

### 4.3 Commission & payout
- Rules: `% of item`, category override, vendor custom rate, promo funded by platform vs vendor.
- On order delivery: compute `vendorNet = goods - vendorFundedDiscount - commission - paymentFeeShare`.
- Ledger: `VendorBalance` + `LedgerEntry`; payout batch weekly via bKash/bank file (stub transfer API).
- Idempotency: `payoutItem` unique on `vendorOrderId`.

### 4.4 Returns
- Window N days; reasons; RMA; restocking fee.
- Refund path: payment.refund partial; adjust vendor balance (clawback if already paid → negative balance).

### 4.5 Edge cases
- One vendor cancels after multi-vendor paid → partial refund + other vendors ship.
- Price change after cart add → lock price snapshot on order line.
- Flash sale oversell → reservation TTL 10–15 min.
- Review bombing → one review per customer per product; edit window.
- KYC reject → products unpublished.

---

## 5. State Machines

**Vendor**: `APPLIED → KYC_PENDING → ACTIVE | REJECTED | SUSPENDED`  
**MasterOrder**: `PENDING_PAYMENT → PAID → PARTIALLY_FULFILLED → FULFILLED | CANCELLED | RETURNED`  
**VendorOrder**: `PENDING_PAYMENT → AWAITING_FULFILLMENT → PROCESSING → SHIPPED → DELIVERED | CANCELLED`  
**Payment**: `CREATED → REQUIRES_ACTION → SUCCEEDED | FAILED | CANCELLED` → refunds  
**ReturnRequest**: `REQUESTED → APPROVED → ITEM_RECEIVED → REFUNDED | REJECTED`  
**Payout**: `OPEN → PROCESSING → PAID | FAILED`

---

## 6. Prisma Schema Draft (core)

```prisma
model User { id String @id @default(cuid()) email String @unique role String passwordHash String }
model Vendor {
  id String @id @default(cuid())
  slug String @unique
  storeName String
  status String
  commissionBps Int @default(1000) // 10%
  ownerId String
}
model VendorKyc {
  vendorId String @id
  documents Json
  status String
  reviewedAt DateTime?
}
model Product {
  id String @id @default(cuid())
  vendorId String
  title String
  slug String
  description String
  status String // DRAFT ACTIVE REJECTED
  categoryId String?
  searchVector Unsupported("tsvector")?
  @@unique([vendorId, slug])
}
model ProductVariant {
  id String @id @default(cuid())
  productId String
  sku String
  priceMinor Int
  compareAtMinor Int?
  stockQty Int
  attrs Json
  @@unique([productId, sku])
}
model Cart { id String @id @default(cuid()) userId String @unique }
model CartItem {
  id String @id @default(cuid())
  cartId String
  variantId String
  qty Int
  @@unique([cartId, variantId])
}
model Order {
  id String @id @default(cuid())
  userId String
  status String
  currency String @default("BDT")
  goodsMinor Int
  shippingMinor Int
  discountMinor Int
  taxMinor Int
  grandMinor Int
  shippingAddress Json
}
model VendorOrder {
  id String @id @default(cuid())
  orderId String
  vendorId String
  status String
  goodsMinor Int
  shippingMinor Int
  commissionMinor Int @default(0)
  vendorNetMinor Int @default(0)
  @@index([vendorId, status])
}
model OrderLine {
  id String @id @default(cuid())
  vendorOrderId String
  variantId String
  titleSnapshot String
  unitPriceMinor Int
  qty Int
}
model StockReservation {
  id String @id @default(cuid())
  variantId String
  qty Int
  orderId String
  expiresAt DateTime
  status String
  @@index([expiresAt, status])
}
model Payment {
  id String @id @default(cuid())
  orderId String @unique
  provider String
  status String
  amountMinor Int
  providerRef String?
  idempotencyKey String @unique
  raw Json?
}
model Refund {
  id String @id @default(cuid())
  paymentId String
  amountMinor Int
  status String
  reason String?
}
model ReturnRequest {
  id String @id @default(cuid())
  vendorOrderId String
  status String
  reason String
  lines Json
}
model Review {
  id String @id @default(cuid())
  productId String
  userId String
  orderId String
  rating Int
  body String?
  @@unique([productId, userId])
}
model VendorBalance {
  vendorId String @id
  availableMinor Int @default(0)
  pendingMinor Int @default(0)
}
model VendorLedgerEntry {
  id String @id @default(cuid())
  vendorId String
  type String
  amountMinor Int
  refType String?
  refId String?
  createdAt DateTime @default(now())
}
model PayoutBatch {
  id String @id @default(cuid())
  status String
  scheduledFor DateTime
}
model PayoutItem {
  id String @id @default(cuid())
  batchId String
  vendorId String
  vendorOrderId String @unique
  amountMinor Int
}
model OutboxEvent {
  id String @id @default(cuid())
  type String
  payload Json
  createdAt DateTime @default(now())
  processedAt DateTime?
}
model WebhookEvent {
  id String @id @default(cuid())
  provider String
  providerEventId String
  payload Json
  processedAt DateTime?
  @@unique([provider, providerEventId])
}
```

---

## 7. REST API

- Vendors: apply, KYC upload, admin review  
- Catalog CRUD + admin moderate  
- Cart CRUD  
- `POST /checkout/session` → order + payment intent  
- `POST /payments/webhooks/:provider`  
- Vendor: `GET /vendor/orders`, `POST /vendor/orders/:id/ship`  
- Customer: orders, `POST /returns`  
- Admin: `POST /payouts/run`, disputes  
- `GET /search?q=`  

---

## 8. Real-time

- Customer: `order.status_changed`  
- Vendor dashboard: new order sound/event  

---

## 9. Jobs

- Expire stock reservations  
- Outbox publisher  
- Webhook retries  
- Weekly payout batch  
- Review request email T+delivery  

---

## 10. Security

- Vendor cannot edit others' products (scoped guards).  
- Webhook signature verification per provider.  
- Idempotency keys on checkout & refund.  
- Payout bank details encrypted.

---

## 11. Caching

- Category tree; product detail CDN cache with tag invalidation.  
- Redis cart optional.

---

## 12. Testing

- Multi-vendor checkout: stock reserved for both or neither.  
- Webhook replay idempotent.  
- Commission math fixtures.  
- Partial cancel refund amounts.  
- Provider adapter contract tests (mirrors).

---

## 13. Folder Structure

```
multi-vendor-ecommerce/
  Project_spec.md
  frontend/  # storefront + vendor portal + admin
  backend/
    src/modules/payments/providers/{stripe,sslcommerz,bkash,nagad,cod}.provider.ts
```

---

## 14. Env vars

`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `APP_URL`, `CORS_ORIGINS`, `S3_*`, `SMTP_URL`, `SMS_*`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_IS_LIVE`, `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_BASE_URL`, `NAGAD_MERCHANT_ID`, `NAGAD_PRIVATE_KEY`, `NAGAD_BASE_URL`, `DEFAULT_COMMISSION_BPS`, `RESERVATION_TTL_SECONDS`, `SEARCH_DRIVER`

---

## 15. Milestones

1. Auth + vendor KYC skeleton + catalog  
2. Cart + stock reservation + master/vendor orders  
3. Payment adapters (COD+Stripe stub + one BD gateway)  
4. Fulfillment + notifications  
5. Returns/refunds  
6. Commission ledger + payouts  
7. Search, reviews, harden  

---

## 16. Acceptance Criteria

- [ ] Cart with 2 vendors creates 1 master + 2 vendor orders.  
- [ ] Payment success releases no stock until webhook; failure releases reservation.  
- [ ] Duplicate webhook does not double-pay vendor ledger.  
- [ ] COD order pays vendor only after delivery confirm.  
- [ ] Return clawback adjusts vendor balance correctly.  
- [ ] Suspended vendor products hidden from search.  
- [ ] Pluggable provider: adding fake provider needs only new class + registry entry.

---

## 17. Agent Notes

- Never branch business logic on provider strings outside adapter factory.  
- Snapshot title/price/commissionBps on order lines.  
- Seed: 3 vendors, 30 products, commission 10%, sample coupons.
