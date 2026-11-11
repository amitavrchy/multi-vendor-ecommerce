# Validation report · 11 November 2026

All checks below passed locally. GitHub Actions also passed for the implementation source; follow the repository's latest run for the current committed revision.

| Check | Result |
| --- | --- |
| Next.js and NestJS production builds | Passed |
| TypeScript checks in both workspaces | Passed |
| Prettier source checks | Passed |
| Unit/payment adapter contracts | 11 passed |
| PostgreSQL commerce integration tests | 14 passed |
| Chromium browser workflows against production builds | 9 passed |
| npm audit | 0 vulnerabilities |
| Mobile typography/layout audit at 390 × 844 | 16 routes passed; no horizontal overflow or visible text below 14px |

Browser workflows cover storefront search/wishlist, two-vendor checkout, delivery/review/return, seller/admin authorization, KYC onboarding/moderation, private file access, product uploads and variants, support conversations, vendor-funded promotion settings, and immediate staff-access revocation.

Database tests verify stock rollback/oversell protection, webhook replay, COD settlement, post-payout clawbacks, partial-return quantities/fees, exact financial allocation, late-payment refunds, dispute scoping, SMTP retry/deduplication, commission/coupon funding, reservation expiry, delayed reviews and weekly payout idempotency.

The mobile audit covered storefront, shop, stores, help, sell, login, wishlist, product detail, account, orders, cart, checkout, support, vendor, admin and policy settings. Desktop/mobile photographs and representative screens were visually reviewed. Local screenshots are in ignored `artifacts/`.

Tests used demo data, a separate integration database and mocked external transports. No real merchant charge, refund, bank transfer, email or SMS was sent. Production merchant certification and service credentials are deployment configuration, not outcomes of these tests.
