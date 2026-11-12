# Operations

`npm run setup` prepares local configuration, Docker services, migrations and seed data. Named volumes persist records; `docker compose stop` preserves them.

Set `DATABASE_URL`, `JWT_SECRET` (32+ random characters), `BANK_ENCRYPTION_KEY` (64 hex characters), `APP_URL`, `CORS_ORIGINS`, `REDIS_URL` and `PORT` in deployment. Frontend proxy/socket configuration is in its example environment file. Secrets and local runtime files are ignored. Generate Prisma after installing, deploy migrations, then build. Never seed demo accounts in production.

## Payments and reconciliation

Stripe needs secret/webhook keys. Register `/api/payments/webhooks/STRIPE` for Checkout completion, asynchronous success/failure and expiry. Exercise sandbox replay/async flows before real charges. Confirm merchant-account BDT support for selected payment methods.

SSLCommerz needs store ID/password and sandbox/live configuration. IPN uses `/api/payments/webhooks/SSLCOMMERZ`; browser returns use `/api/payments/return`. IPN settles payment; browser returns only navigate. Verified IPNs persist the bank transaction ID for automatic refund submission and subsequent status queries. Older payments without that reference require merchant-panel reconciliation. [Official protocol](https://developer.sslcommerz.com/doc/v4/).

bKash needs its app key/secret, merchant username/password and checkout base URL. Nagad needs its merchant ID, merchant private key, gateway public key, API base URL and (where required) whitelisted server IP. Both use `/api/payments/webhooks/<CODE>` for browser callbacks. Callbacks are verified against persisted payment amounts/order references; untrusted browser success flags never settle orders. The worker retries pending mobile-payment reconciliation. Complete merchant sandbox certification before live use. See [bKash merchant sandbox](https://merchantdemo.sandbox.bka.sh/tokenized-checkout/version/v1.2.0-beta) and the [Nagad official plugin protocol reference](https://github.com/common-repository/nagad-payment-gateway).

Admin → Operations shows failed/pending events and offers explicit retry. Late successful payments automatically enqueue a full refund without reviving cancelled shipments. Verify uncertain provider states before reconciling.

Stripe and SSLCommerz refund submissions are polled until the gateway confirms settlement. Initiation alone does not adjust the ledger or restock returns. Maintenance uses database leases and ownership tokens to prevent concurrent submissions or stale responses overwriting settlement. Transient failures back off; uncertain non-idempotent submissions, expired retry windows and repeated verification failures enter manual review. Admin → Refunds shows the last error and next check, and offers an immediate gateway recheck for pending/processing refunds. Failed refunds require an explicit move to manual review before external settlement can be confirmed.

COD/bKash/Nagad refunds require an actual external refund, then its confirmation reference. For every manual-review refund, inspect the merchant history before sending money again. A manual confirmation is blocked while an active gateway worker holds the lease.

For payouts, configure encrypted bank details and deliver shipments. Admin → Marketplace settings can enable weekly batch preparation on a selected Dhaka weekday. Batch IDs are unique per schedule day. Available funds move to pending. Review protected account instructions, complete external transfers, then confirm. The bank-transfer boundary intentionally uses the specification's stub/manual transfer path.

## Deployment work remaining

Configure HTTPS/secure cookies, private databases, backups, merchant credentials and a persistent encryption key. Key rotation needs re-encryption. Redis supplies shared rate limits/cache and Socket.IO pub/sub; configure trusted proxy hops and load-balancer routing for the deployment.

Set S3_BUCKET/REGION/ENDPOINT and credentials for private uploads. Local disk is development-only. KYC reads require owner/admin authentication; product images are public. Set SMTP_URL/SMTP_FROM to deliver email and SMS_URL/SMS_AUTH_TOKEN for an HTTP SMS transport accepting `{to, body, idempotencyKey}`. The SMS endpoint must honor that idempotency key. Missing transports record SKIPPED; failed transports retry using durable receipts. SMTP is at least once, with stable Message-ID values.

Optional CDN_PURGE_URL accepts a JSON POST `{tags:["catalog"]}` with an optional bearer token. Catalog responses carry the surrogate tag. Purge failures queue durable retries. Configure CDN cache rules for the intended public endpoints; personalized responses must remain private. No external hosting was provisioned or deployed.

CI uses fresh PostgreSQL/Redis and runs typecheck, formatting, unit/integration tests, build, audit and Chromium workflows. Screenshots are ignored under `artifacts/`; failure reports/traces are ignored under `playwright-report/` and `test-results/`.
