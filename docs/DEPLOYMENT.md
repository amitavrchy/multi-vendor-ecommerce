# Production deployment

Use a Linux server with Docker Compose, ports 80/443 available, and a domain pointing at the server. The production stack contains PostgreSQL, authenticated Redis, the API, the web application and Caddy. Only Caddy exposes host ports.

1. Copy `.env.production.example` to `.env.production` and replace every placeholder. Use a bare hostname for `SITE_HOST`, independently generated URL-safe hexadecimal database/Redis passwords, a random JWT secret of at least 32 characters, and a 64-character hexadecimal bank encryption key. Keep this ignored file private and back up the encryption key securely.
2. Configure private S3 storage supporting AES256 server-side encryption. Set its bucket, region, endpoint if needed, and credentials (or the server's IAM identity). Production uploads deliberately require durable private storage. Configure SMTP and SMS transports for notifications and enable payment providers using merchant credentials; unconfigured gateways remain unavailable.
3. Build and start the stack:

   ```sh
   docker compose --env-file .env.production -f compose.production.yml up -d --build
   docker compose --env-file .env.production -f compose.production.yml ps
   ```

   The API applies checked-in migrations before starting. Dependency health checks gate startup; `/api/health` checks PostgreSQL and Redis without exposing credentials. Caddy obtains and renews certificates for `SITE_HOST`. DNS and inbound ports must be ready for certificate issuance. Changing the public hostname requires rebuilding the web image because browser socket configuration is embedded at build time.

4. Create the first platform administrator interactively:

   ```sh
   docker compose --env-file .env.production -f compose.production.yml exec api npm run admin:create -w backend
   ```

   The password prompt is hidden. Supply a unique email and a password of at least 12 characters, at most 72 UTF-8 bytes. The command refuses existing emails and never promotes or resets accounts. Automation can supply a JSON object containing `name`, `email`, `password` on standard input with `exec -T`; do not put passwords in command arguments or shell history. Demo seeding is disabled in production.

5. Sign in, configure marketplace policy/categories, and exercise customer registration, seller verification, private uploads, checkout, delivery, returns, support and notifications. Register gateway callbacks listed in [Operations](OPERATIONS.md), complete merchant sandbox certification, and verify an actual refund before opening live checkout.

PostgreSQL, Redis and Caddy certificates use named volumes. Back up PostgreSQL and private object storage, and test restoration with the same bank encryption key. Take a database backup before upgrades; deploy updated images with the same Compose command. Inspect service logs with `docker compose --env-file .env.production -f compose.production.yml logs --tail=100 api web edge`. Never remove production volumes as an upgrade step.

Local development still uses `npm run setup` and `npm run dev`. Integration tests use a separate database named `bazaar_test` on the configured PostgreSQL server; set `TEST_DATABASE_URL` to another database on that server with `test` in its name when needed. Tests reject the application's own database URL.

Building images and validating local containers does not provision a public server or certify merchant accounts. Domain, private storage, notification transport and live payment credentials are supplied by the deployment operator.
