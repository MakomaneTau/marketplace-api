# Marketplace security controls

## Changes implemented on 18 October 2026

- Authentication attempts are limited to 10 per account and operation per 15 minutes. Normalized account identifiers are hashed in memory; changing IP or email casing does not reset the account bucket.
- Authenticated writes are limited to 30 per user per minute. Uploads have a separate 10-per-user-per-minute limit before multipart parsing. In production, these limits and account login limits use atomic PostgreSQL counters shared across API instances; the API fails closed if this store is unavailable. Existing global IP limits remain configurable and process-local. Local counters provide an additional bounded fast check.
- Admin data and decisions require a verified TOTP factor and a server-verified `aal2` access token. Password-only sessions can access the enrollment/verification flow, but cannot read moderation data or make admin decisions. Existing verified factors cannot be replaced using only a password. MFA tokens pass through the web gateway into HttpOnly cookies and are stripped from browser JSON.
- JSON is limited to 1 MB, compressed bodies are rejected, and HTTP header/body timeouts constrain slow requests. Supabase HTTP calls have a 15-second deadline and preserve caller cancellation. File uploads still enforce 5 MB per image, MIME allowlists and file signatures.
- API responses are non-cacheable, deny framing/content sniffing, and do not advertise Express. Unapproved browser origins receive 403. Query strings are omitted from request logs.
- Proxy trust requires explicit source IPs/CIDRs using `TRUST_PROXY_CIDRS`. A bare `TRUST_PROXY=true` fails startup rather than trusting spoofed forwarding headers.
- Storage cleanup verifies the configured storage origin and the current owner's listing/shop directory before deleting an object. Invalid, foreign and encoded traversal paths are ignored.
- Product search values are quoted for PostgREST's filter grammar, including embedded quotes and backslashes.
- Migration `20261018000100_api_owned_writes.sql` revokes direct public/client writes to application tables, including column grants. All mutations must pass through API authorization and validation. Service-role privileges and existing read policies remain. Eight missing foreign-key indexes support bounded checks under load.
- A scheduled GitHub workflow audits production dependencies on Mondays and on pushes/PRs. It activates when these files are pushed.

## Verified production status on 18 October 2026

- Confirmed storefront: `https://marketplace-web-pearl.vercel.app`, Vercel project `marketplace-web` in team `just-me-04e2`.
- API: `https://marketplace-api-b1rr.onrender.com`, Render service `srv-daf1k5pt0dsc73c5og00`.
- Supabase project `jepzoqbhxfeukyjuejwz`: applied `20261018121526_production_access_hardening.sql` and `20261018122232_shared_security_limits.sql`. These two migrations are compatible with the older deployed schema. Verification found zero client table/column write grants and zero public execution grants on privileged functions. The API's service-role access remains intact.
- Applied `20261018122653_production_report_index.sql` for the missing `safety_reports.handled_by` foreign-key index. The complete read-only database audit now passes against both production and local Supabase.
- Hosted Security Advisor no longer reports exposed privileged functions. Its remaining warning is leaked-password protection disabled. The four no-policy RLS notices describe intentionally server-only tables and do not require adding client access policies.
- Public storefront and API respond successfully and have HSTS. The deployed storefront still uses the older permissive script policy. New application controls, including MFA enforcement and shared-limit consumption, are implemented and tested locally but are not yet released.
- Vercel project and deployment reads return `403: Not authorized` under `just-me-04e2`. No local Vercel CLI credential is available. Restore the connector's access to this team before releasing the web/API pair. Do not deploy MFA enforcement on the API before its web enrollment flow is available.
- The deployed schema predates local engagement migrations. Reconcile and validate the intended release's migration history before deploying the full dirty checkout; do not automatically push unrelated feature migrations or reset the hosted database.

## Deploy and verify

1. Deploy the API and web changes together and apply `supabase/migrations/20261018000100_api_owned_writes.sql` through the normal migration process. It was applied and audited locally, not against a hosted database. Existing mobile/direct-Supabase clients must migrate their writes to the API first.
2. Set production `CORS_ORIGINS` to exact HTTPS web origins. Set `TRUST_PROXY_CIDRS` only when requests actually arrive from those proxies; leave it empty for direct connections. Keep the Supabase secret/service-role key server-only.
3. Restrict API ingress to the intended gateway/network. Configure TLS, body/time limits and per-IP abuse rules at the hosting edge. The Next gateway does not forward untrusted client IP headers: aggregate API IP limits may need tuning for the gateway's shared address.
4. The shared-limit migration must be applied before starting this API in production. Continue using edge/WAF per-IP protection: application counters cannot stop attacks that saturate the network or overwhelm the database. Monitor latency and 503s from the shared limiter. Counters expire and cleanup is bounded per request.
5. Configure hosted Supabase email confirmation, password policies, leaked-password protection where available, authentication abuse controls, and TOTP enrollment/verification. The connected database tools cannot change hosted Auth settings. Local `supabase/config.toml` enables TOTP, but its remaining development-friendly auth settings are not a production security profile. CAPTCHA requires matching client integration before enabling it.
6. Keep verification storage private; retain short-lived signed URLs and restricted access. Image signatures do not constitute malware scanning. Add isolated scanning/decoding if the deployment's document-upload threat model requires it.
7. Monitor spikes in 401/403/413/429/5xx responses and authentication failures; alert on unusual admin decisions. Test backups/restores and rotate exposed credentials through the provider, not source control.

Run from this package in PowerShell:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run audit:production
node scripts/smoke-admin-mfa.js # Local-only; temporary account is removed after the test
Get-Content -Raw scripts/audit-database.sql | docker exec -i supabase_db_marketplace-api psql -v ON_ERROR_STOP=1 -U postgres -d postgres
```

The database audit checks RLS, direct client writes, privileged function exposure, API grants, indexes and existing data invariants. Run it against the intended environment after applying migrations. Local end-to-end MFA verification covers enrollment, wrong-code rejection, upgraded admin access and factor-replacement protection. Browser interaction, production sign-in, full production configuration and traffic have not been assessed.

## Admin authenticator recovery

Keep an independently secured Supabase owner account and a second enrolled Marketplace administrator available. When an admin loses their authenticator, the platform owner must verify their identity through a separate trusted channel, revoke their Auth sessions, remove the lost factor through Supabase Auth administration, and require fresh password login plus enrollment. Record the recovery outside the affected account. Do not email a setup secret, use the password-only session as proof of identity, or add an MFA bypass endpoint. Existing `aal2` tokens also require a currently verified factor before accessing admin data.

References: [OWASP REST security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), [PostgREST filter grammar](https://docs.postgrest.org/en/v16/references/api/url_grammar.html).
