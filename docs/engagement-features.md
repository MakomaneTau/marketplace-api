# Discovery and engagement

Apply both `20261016000100_marketplace_engagement.sql` and
`20261016000200_engagement_rpc_permissions.sql` before deploying this API.
Local setup: `npx.cmd supabase migration up --local`.

Buyer features include campus/price/fulfilment search, paginated results, public
shops and reviews, saved searches, followed shops, price-drop alerts, wanted
requests, offers in inquiry conversations and agreed pickup plans.

Notifications are in-app. New listing and favourite price-drop alerts are generated
by database triggers. Pickup reminders are generated once when either participant
loads notifications within 24 hours of the confirmed pickup. There is no email,
push delivery or background reminder scheduler in this release.

Offers expire 48 hours after creation. Acceptance does not reserve stock. Checkout
atomically reserves stock and applies the agreed unit price and quantity. Reusing
a checked-out offer returns the existing order. A pickup proposal must be confirmed
by the other party; a buyer can record collection when the order is ready.

Admin queues use exclusive claims and existing decision audit events. An admin may
claim/release their own review; another admin cannot decide a claimed review.
Pending queues show oldest requests first.

The browser basket stores product IDs and quantities per account in local storage.
Prices, availability and permissions are checked again by the API. Each shop has
its own checkout. Draft duplication intentionally excludes photos to avoid shared
image deletion. Sellers add photos before publication.

## Verification

With local Supabase and the API running:

```powershell
node scripts/smoke-engagement-api.js
Get-Content -Raw scripts/smoke-engagement.sql | docker exec -i supabase_db_marketplace-api psql -v ON_ERROR_STOP=1 -U postgres -d postgres
```

The API test creates disposable accounts and deletes its fixtures in `finally`.
The database test runs as `service_role` with temporary fixtures and rolls back.
It verifies alert/reply deduplication, offer role restrictions, totals, stock,
idempotency, pickup confirmation/reminders/collection and admin claim isolation.
