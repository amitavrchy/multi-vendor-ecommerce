# Validation report · 12 November 2026

Checks below passed locally after the two-folder restructuring. The updated GitHub workflow is retained under backend/deploy as a reference; automatic GitHub Actions are inactive because GitHub requires a root .github folder, which the requested layout excludes.

| Check | Result |
| --- | --- |
| Next.js and NestJS production builds | Passed |
| TypeScript checks in both independent applications | Passed |
| Prettier source checks | Passed |
| Unit/payment adapter contracts | 13 passed |
| PostgreSQL commerce integration tests | 34 passed |
| Chromium browser workflows against production builds | 17 passed |
| npm audit | 0 vulnerabilities |
| Desktop/mobile typography and layout audit | 28 route/tab/viewport checks passed; no horizontal overflow or visible text below 14px |

Browser workflows cover storefront search/wishlist, two-vendor checkout, delivery/review/return, seller/admin authorization, KYC onboarding/moderation, private file access, product uploads and variants, support conversations, vendor-funded promotion settings, and immediate staff-access revocation.

Four new browser workflows cover four-product comparison/persistence, guest favourite merge and account synchronization across browser contexts, price alerts/store following/personal discovery, and owner-only analytics with CSV download. Six new database tests cover saved-product privacy, concurrent one-shot price/stock watches, alert ownership/suspension, following/recommendation visibility, real price history and seller-scoped sales/ledger reporting.

The business/growth pass adds four browser workflows: buyer verification through administrator review, seller offer and quote checkout with an empty bag; subscription creation/skip/pause/resume/cancel; rewards/referral safeguards; and administrator campaign drafts with newsletter error handling. Seven additional database tests verify wholesale eligibility/snapshots, quote ownership/expiry/single use, concurrent renewal preparation and failed-checkout release, concurrent points redemption/private vouchers, delivery/refund/referral clawbacks including negative balances, double opt-in and campaign idempotency, and unsubscribe/cancellation checks at dispatch. This gives 64 passing automated tests in total.

Database tests verify stock rollback/oversell protection, webhook replay, COD settlement, post-payout clawbacks, partial-return quantities/fees, exact financial allocation, late-payment refunds, dispute scoping, SMTP retry/deduplication, commission/coupon funding, reservation expiry, delayed reviews and weekly payout idempotency.

The latest audit covered landing, shop, discovery, comparison, stores, product detail, business buying, rewards, subscriptions and newsletter, plus seller Business sales/Analytics and administrator Business verification/Marketing tabs at desktop 1440 × 1000 and mobile 390 × 844. A long-SKU selector overflow found on the seller mobile screen was corrected and the full 28 checks passed. The previous implementation pass also audited account, orders, cart, checkout, help, sell, login, wishlist, support, vendor, admin and policy settings. Screenshots are stored under frontend's ignored `artifacts/`.

Tests used demo data, a separate integration database and mocked external transports. No real merchant charge, refund, bank transfer, email or SMS was sent. Production merchant certification and service credentials are deployment configuration, not outcomes of these tests.

The 12 November pass additionally built both production Docker targets, started them as the non-root node user, verified API readiness and the web-to-API product proxy with HTTP 200, validated the production Compose model and Caddy configuration, and stopped the temporary validation containers. Seven additional database tests cover production admin bootstrap and asynchronous refund recovery/concurrency. Stripe and SSLCommerz refund contract tests use mocked gateway responses. Public HTTPS issuance and live merchant settlement were not exercised.
