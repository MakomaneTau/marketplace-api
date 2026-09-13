\set ON_ERROR_STOP on

begin transaction read only;

do $$
declare
  violation_count integer;
begin
  select count(*) into violation_count
  from pg_tables
  where schemaname = 'public'
    and not rowsecurity;
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % public tables do not have RLS enabled', violation_count;
  end if;

  select count(*) into violation_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated', 'service_role')
    and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % unsafe API-role table grants remain', violation_count;
  end if;

  select count(*) into violation_count
  from pg_constraint
  where connamespace = 'public'::regnamespace
    and not convalidated;
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % constraints are not validated', violation_count;
  end if;

  select count(*) into violation_count
  from pg_index
  where indrelid in (
    select oid from pg_class where relnamespace = 'public'::regnamespace
  )
    and not indisvalid;
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % public indexes are invalid', violation_count;
  end if;

  select count(*) into violation_count
  from pg_constraint foreign_key
  where foreign_key.connamespace = 'public'::regnamespace
    and foreign_key.contype = 'f'
    and not exists (
      select 1
      from pg_index supporting_index
      where supporting_index.indrelid = foreign_key.conrelid
        and supporting_index.indisvalid
        and supporting_index.indkey::smallint[] @> foreign_key.conkey
    );
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % foreign keys lack supporting indexes', violation_count;
  end if;

  select count(*) into violation_count
  from pg_proc routine
  join pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.prosecdef
    and (
      has_function_privilege('anon', routine.oid, 'EXECUTE')
      or has_function_privilege('authenticated', routine.oid, 'EXECUTE')
    );
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % security-definer functions are callable by public API roles', violation_count;
  end if;

  if not (
    has_table_privilege('service_role', 'public.universities', 'SELECT')
    and has_table_privilege('service_role', 'public.campuses', 'SELECT')
    and has_table_privilege('service_role', 'public.categories', 'SELECT')
    and has_table_privilege('service_role', 'public.profiles', 'SELECT, UPDATE')
    and has_table_privilege('service_role', 'public.shops', 'SELECT, INSERT, UPDATE, DELETE')
    and has_table_privilege('service_role', 'public.shop_pickup_areas', 'SELECT, INSERT, UPDATE, DELETE')
    and has_table_privilege('service_role', 'public.products', 'SELECT, INSERT, UPDATE, DELETE')
    and has_table_privilege('service_role', 'public.favourites', 'SELECT, INSERT, DELETE')
    and has_table_privilege('service_role', 'public.orders', 'SELECT')
    and has_table_privilege('service_role', 'public.order_items', 'SELECT')
    and has_table_privilege('service_role', 'public.conversations', 'SELECT, INSERT, UPDATE')
    and has_table_privilege('service_role', 'public.messages', 'SELECT, INSERT, UPDATE')
    and has_table_privilege('service_role', 'public.notifications', 'SELECT, INSERT, UPDATE')
    and has_table_privilege('service_role', 'public.reviews', 'SELECT, INSERT')
    and has_table_privilege('service_role', 'public.seller_verifications', 'SELECT, INSERT')
    and has_table_privilege('service_role', 'public.user_preferences', 'SELECT, INSERT, UPDATE')
  ) then
    raise exception 'DATABASE_AUDIT_FAILED: service_role is missing an API-required table privilege';
  end if;

  select count(*) into violation_count
  from public.profiles profile
  join public.campuses campus on campus.id = profile.campus_id
  where profile.university_id is distinct from campus.university_id;
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % profiles have mismatched campuses', violation_count;
  end if;

  select count(*) into violation_count
  from public.shops shop
  join public.profiles owner_profile on owner_profile.id = shop.owner_id
  where owner_profile.role <> 'seller';
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % shops are not owned by sellers', violation_count;
  end if;

  select count(*) into violation_count
  from public.conversations conversation
  join public.products product on product.id = conversation.product_id
  join public.shops shop on shop.id = product.shop_id
  where conversation.shop_id <> product.shop_id
     or conversation.seller_id <> shop.owner_id
     or conversation.buyer_id = conversation.seller_id;
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % conversations have inconsistent relationships', violation_count;
  end if;

  select count(*) into violation_count
  from public.messages message
  join public.conversations conversation on conversation.id = message.conversation_id
  where message.sender_id not in (conversation.buyer_id, conversation.seller_id);
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % messages were sent by non-participants', violation_count;
  end if;

  select count(*) into violation_count
  from public.orders marketplace_order
  left join lateral (
    select coalesce(sum(item.line_total), 0) as calculated_total
    from public.order_items item
    where item.order_id = marketplace_order.id
  ) total on true
  where marketplace_order.total_amount <> total.calculated_total;
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % order totals do not match their items', violation_count;
  end if;

  select count(*) into violation_count
  from public.order_items item
  join public.orders marketplace_order on marketplace_order.id = item.order_id
  join public.products product on product.id = item.product_id
  where product.shop_id <> marketplace_order.shop_id;
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % order items belong to another shop', violation_count;
  end if;

  select count(*) into violation_count
  from public.reviews review
  join public.orders marketplace_order on marketplace_order.id = review.order_id
  where review.shop_id <> marketplace_order.shop_id
     or review.reviewer_id <> marketplace_order.buyer_id
     or marketplace_order.status <> 'completed'
     or not exists (
       select 1 from public.order_items item
       where item.order_id = review.order_id and item.product_id = review.product_id
     );
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % reviews do not match completed purchases', violation_count;
  end if;

  select count(*) into violation_count
  from public.seller_verifications verification
  join public.profiles seller on seller.id = verification.seller_id
  where seller.role <> 'seller';
  if violation_count > 0 then
    raise exception 'DATABASE_AUDIT_FAILED: % verification records belong to non-sellers', violation_count;
  end if;
end;
$$;

select
  (select count(*) from public.universities) as universities,
  (select count(*) from public.campuses) as campuses,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.shops) as shops,
  (select count(*) from public.products) as products,
  (select count(*) from public.orders) as orders,
  (select count(*) from public.conversations) as conversations,
  (select count(*) from public.messages) as messages;

rollback;

\echo 'Database audit passed.'
