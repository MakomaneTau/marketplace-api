# Admin operations

The admin centre is at `/admin` in `marketplace-web`. Deploy the API migration
`20260924121338_add_admin_moderation.sql` before deploying the API and web
changes. The API requires a server-only Supabase service-role key; never place
that key in the web app or a `NEXT_PUBLIC_` variable.

Admin privileges are separate from the buyer/seller role. There is no default
admin and signup cannot grant admin access. After verifying the intended person's
identity and account UUID through a trusted operator process, a database
operator may grant access with:

```sql
insert into public.admin_members (user_id)
values ('verified-account-uuid');
```

Revocation is a database-operator action. Before removing an admin, reassign or
retain audit references: moderation records reference the acting admin and the
foreign keys intentionally prevent deleting that history. Do not delete audit
events to make revocation work.

The admin centre supports buyer/seller search and suspension, safety report
review, and seller identity verification. Each moderation decision requires a
reason and records an audit event in the same database transaction. Suspended
accounts are denied authenticated API access and login/refresh. Suspending a
seller closes their shop, removing active listings from public browsing; account
restoration deliberately does **not** reopen the shop. The seller must review
and reopen it after access is restored. Existing orders and their history are
retained.

Seller verification has a seven-day grace period measured from the profile's
`created_at`. A seller may open a shop, publish listings and receive orders
before the exact deadline. After that, an unverified seller's open shop and
active listings are hidden from public browsing and checkout refuses new
orders. The seller can still sign in, edit non-selling shop details, submit or
resubmit identity documents, and fulfil existing orders. Admin approval sets
`verification_status` to `verified` and restores eligibility immediately; an
open shop becomes visible again. This does not change the account creation
time or extend the grace period after rejection. The database rule is in
`20260925224008_seller_verification_grace_period.sql`; deploy it after the
admin migration.

Verification images remain in the private bucket. The admin API generates
signed preview links valid for 60 seconds and does not log or store them in the
audit table. Treat these images and safety report details as sensitive.

This workflow does not automate account deletion, refunds, chargebacks, legal
requests, or emergency response. Escalate those through the applicable manual
process. Public reports are for marketplace safety concerns; the contact page
remains the support route for general technical issues.
