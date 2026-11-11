# Operations

`npm run setup` prepares local configuration, Docker services, migrations and seed data. Named volumes persist records; `docker compose stop` preserves them.

Set `DATABASE_URL`, `JWT_SECRET` (32+ random characters), `BANK_ENCRYPTION_KEY` (64 hex characters), `APP_URL`, `CORS_ORIGINS`, `REDIS_URL` and `PORT` in deployment. Frontend proxy/socket configuration is in its example environment file. Secrets and local runtime files are ignored. Generate Prisma after installing, deploy migrations, then build. Never seed demo accounts in production.

## Payments and reconciliation

Stripe needs secret/webhook keys. Register `/api/payments/webhooks/STRIPE` for Checkout completion, asynchronous success/failure and expiry. Exercise sandbox replay/async flows before real charges. Confirm merchant-account BDT support for selected payment methods.

SSLCommerz needs store ID/password and sandbox/live configuration. IPN uses `/api/payments/webhooks/SSLCOMMERZ`; browser returns use `/api/payments/return`. IPN settles payment; browser returns only navigate. Refund in the merchant panel, then confirm settlement in admin. [Official protocol](https://developer.sslcommerz.com/docs.html).

bKash/Nagad stay disabled regardless of configured keys. Implement/certify merchant protocols before enabling them. Configuration placeholders are not completed integrations.

Admin → Operations shows failed/pending outbox events. Investigate exhausted retries and late payments. There is no dead-letter replay action or automated late-payment refund. Verify provider states before resuming/refunding.

COD/SSLCommerz refunds require an actual external refund, then its confirmation reference. Pending Stripe refunds also need provider reconciliation. Initiation alone does not adjust the ledger.

For payouts, configure encrypted bank details, deliver shipments, then prepare a batch. Available funds move to pending. Complete external transfers before confirming. Automatic weekly bank transfers are not connected.

## Deployment work remaining

Configure HTTPS/secure cookies, private databases, backups, merchant credentials, private KYC storage and a persistent encryption key. Key rotation needs re-encryption. For replicas, add shared rate limiting, trusted proxy/IP rules and Socket.IO adapter/routing.

Complete COVERAGE.md's remaining integrations before treating the original full spec as complete. No external hosting was provisioned or deployed.

CI uses fresh PostgreSQL/Redis and runs typecheck, formatting, unit/integration tests, build, audit and Chromium workflows. Screenshots are ignored under `artifacts/`; failure reports/traces are ignored under `playwright-report/` and `test-results/`.
