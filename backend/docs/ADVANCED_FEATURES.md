# Shopping intelligence and storefront upgrade

The marketplace includes shopping discovery, seller reporting and business/growth workflows. See [Business and growth](BUSINESS_GROWTH.md) for B2B pricing/quotes, replenishment subscriptions, loyalty/referrals and consent-based campaigns. Auctions, live shopping and native apps remain separate product tracks.

| Capability | Behavior |
| --- | --- |
| Account favourites | PostgreSQL persistence, idempotent guest merge, cross-device access, ownership-scoped removal, unavailable products hidden |
| Comparison | Up to four products, current price range, rating/count, store, stock, variants and first-variant attributes; browser persistence |
| Price alerts | Shopper-defined target in integer minor units; a one-shot watch triggers when an active variant reaches the target |
| Restock alerts | Counts stock minus reservations, only activates for out-of-stock variants; does not advertise suspended listings |
| Shopping radar | Cancel account-owned alerts, inspect triggered watches and unfollow stores |
| Followed stores | Account-owned following list; active followed stores influence recommendations |
| Recommendations | Saved categories and followed stores first, featured/new available products as fallback; saved products excluded |
| Recent history | Up to twelve local product visits with explicit clearing |
| Search suggestions | Debounced title and category matches linked directly to real product/category pages |
| Price observations | Actual seller price changes recorded transactionally; rolling 90-day chart; no invented historical data |
| Seller reporting | Dhaka calendar dates, 14/30/90-day periods, booked sales, ledger earnings, followers, popular variants, low-stock SKUs, CSV and accessible daily table |
| Landing page | Editorial hero, shoppable collections, live category counts, interactive product edits, maker story, shopping tools, seller invitation and FAQ |

Price/stock watch evaluation uses serializable transactions and outbox IDs keyed by alert generation. The watch is disabled and the event created atomically. Notification creation and email retries reuse existing event/receipt idempotency. Re-arming a watch increments its generation, so a subsequent legitimate price drop can notify again. No gateway charge or new financial liability is introduced by these tools.

Both applications now own their dependencies and builds. All source, scripts, specs, docs, test artifacts and infrastructure files are inside `frontend` or `backend`. The hidden `.git` directory remains Git's repository metadata. The development Compose project name preserves existing local volumes during the move.
