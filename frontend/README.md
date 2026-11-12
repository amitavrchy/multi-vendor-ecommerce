# Bazaar storefront

Next.js 16 / React 19 storefront, editorial landing page and customer, seller and administrator workspaces. The repository root contains only `frontend` and `backend` (plus Git metadata); each application has its own manifest, lockfile, dependencies and Dockerfile.

## Run locally

Install dependencies separately with `npm ci` in this folder and in `../backend`. Run `npm run setup` from `../backend` to prepare PostgreSQL, Redis, environment files and demo data. Then run `npm run dev` in each app's terminal.

Storefront: <http://localhost:3187>. The API is proxied to <http://localhost:4187/api>. Setup preserves existing environment configuration. Demo credentials and commerce operations are in [backend documentation](../backend/README.md).

## Shopping tools

- `/` — responsive editorial landing with shoppable collections, live product edits and expandable FAQs.
- `/discover` — recommendations informed by saved products and followed stores, plus local recently viewed history.
- `/compare` — up to four products with live price, rating, stock and variant details; comparison persists in this browser.
- `/wishlist` — guest favourites merge into an account on sign-in and sync across devices.
- Product pages — follow stores, view actual recorded price changes, set price targets and request restock alerts.
- `/activity` — manage account-owned price/stock alerts and followed stores.
- Seller → Analytics — 14/30/90-day sales chart, accessible daily data, CSV, top variants, followers and inventory watchlist.

## Check and build

`npm run typecheck`, `npm run format:check`, `npm run build`, `npm audit --audit-level=high`. With both apps running, use `npm run test:e2e` for browser workflows and `node scripts/visual-audit.mjs` for desktop/mobile text and overflow checks. Browser artifacts stay inside this folder and are ignored by Git.

Production orchestration is in [backend/deploy](../backend/docs/DEPLOYMENT.md). Run Docker builds with this folder as the web build context. Asset credits: [ASSETS.md](ASSETS.md).
