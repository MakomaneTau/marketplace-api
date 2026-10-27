# Buyer and seller modes

One account can buy and sell. Student status and university are optional for both.

- `POST /api/v1/auth/login` accepts an optional `role` (`buyer` or `seller`).
  Without it, login restores the last selected mode. Admins continue to the admin experience.
- `POST /api/v1/auth/switch-role` requires a valid session and a body containing
  only `role`. It returns `{ data: { user, profile } }`, with the same account ID.
  Admin and suspended accounts cannot switch marketplace modes.
- `profile.role` in the API is the current mode. `profile.canSell` indicates
  whether seller capability has been enabled.

The database `profiles.role` retains seller capability once enabled. It must
not be downgraded when the owner switches to buying: shop availability, product
ownership, verification and existing seller workflows depend on it.
`profiles.active_role` stores the selected mode. NULL falls back to the original
role for existing accounts and new signups. Mode is an account-wide preference,
so changing it also affects other sessions; the web app rechecks visible tabs
and restored browser pages. Seller capability does not bypass shop ownership,
verification, suspension, or self-purchase checks.

Apply `20261027113518_dual_buyer_seller_modes.sql` before deploying the API and
web changes. Deploy both applications together: older clients do not expose the
mode switch. The migration does not change existing student flags, shops,
listings, orders, favourites, or verification status. Browser database writes
remain disabled; mode changes go through the authenticated API.

Validation:

```powershell
npm.cmd run check
node scripts/smoke-account-modes.js
```

The smoke test refuses remote Supabase URLs. It creates disposable local
fixtures, verifies switching and access boundaries against the real API and
database, and removes its accounts and listings afterward.
