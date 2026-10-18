-- All application mutations go through the authenticated API. RLS alone does
-- not enforce API validation, throttling, moderation or order transitions.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from public, anon, authenticated;

-- Table-level REVOKE does not remove previously granted column privileges.
do $$
declare target record;
begin
  for target in
    select c.relname, string_agg(quote_ident(a.attname), ', ' order by a.attnum) as columns
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    group by c.relname
  loop
    execute format('revoke insert (%s), update (%s), references (%s) on table public.%I from public, anon, authenticated',
      target.columns, target.columns, target.columns, target.relname);
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from public, anon, authenticated;

-- Bound foreign-key checks under load; these were missing in the live audit.
create index if not exists safety_reports_handled_by_idx on public.safety_reports(handled_by);
create index if not exists wanted_posts_buyer_id_idx on public.wanted_posts(buyer_id);
create index if not exists wanted_posts_campus_id_idx on public.wanted_posts(campus_id);
create index if not exists wanted_replies_seller_id_idx on public.wanted_replies(seller_id);
create index if not exists marketplace_offers_product_id_idx on public.marketplace_offers(product_id);
create index if not exists marketplace_offers_order_id_idx on public.marketplace_offers(order_id);
create index if not exists pickup_plans_proposed_by_idx on public.pickup_plans(proposed_by);
create index if not exists admin_queue_claims_assigned_to_idx on public.admin_queue_claims(assigned_to);
commit;
