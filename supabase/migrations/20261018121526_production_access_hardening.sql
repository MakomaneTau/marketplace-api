-- Compatible with the currently deployed schema as well as newer local features.
-- Browser mutations are authorized by Express using its service-role client.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from public, anon, authenticated;

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

  -- The production-only event trigger may not exist in local installations.
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('replace_shop_pickup_areas', 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', target.signature);
    execute format('grant execute on function %s to service_role', target.signature);
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from public, anon, authenticated;

commit;
