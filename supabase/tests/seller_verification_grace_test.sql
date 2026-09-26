begin;
select plan(10);

insert into auth.users(id, email, raw_user_meta_data) values
  ('44444444-4444-4444-8444-444444444441', 'grace-seller@example.com', '{"role":"seller","isStudent":false,"firstName":"Grace","lastName":"Seller"}'::jsonb),
  ('44444444-4444-4444-8444-444444444442', 'grace-buyer@example.com', '{"role":"buyer","firstName":"Grace","lastName":"Buyer"}'::jsonb);

select ok(private.seller_can_sell('44444444-4444-4444-8444-444444444441'), 'new seller may sell before approval');
select lives_ok(
  $$insert into public.shops(owner_id, name, slug, is_open)
    values ('44444444-4444-4444-8444-444444444441', 'Grace test shop', 'grace-test-shop', true)$$,
  'new seller may open a shop'
);

update public.profiles set created_at = now() - interval '7 days' - interval '1 second'
where id = '44444444-4444-4444-8444-444444444441';

select ok(not private.seller_can_sell('44444444-4444-4444-8444-444444444441'), 'unapproved seller is ineligible after seven days');
select results_eq(
  $$select sellable(s) from public.shops s where slug = 'grace-test-shop'$$,
  array[false], 'expired shop is not sellable even while its open flag remains true'
);

set local role anon;
select results_eq(
  $$select count(*)::bigint from public.shops where slug = 'grace-test-shop'$$,
  array[0::bigint], 'expired shop is hidden from anonymous browsing'
);
reset role;

select throws_ok(
  $$update public.shops set is_open = true where slug = 'grace-test-shop'$$,
  'P0001', 'SELLER_APPROVAL_REQUIRED', 'expired seller cannot reopen a shop'
);
select throws_ok(
  $$insert into public.orders(buyer_id, shop_id, fulfilment_type, delivery_address, total_amount)
    select '44444444-4444-4444-8444-444444444442', id, 'delivery', 'Test address', 10
    from public.shops where slug = 'grace-test-shop'$$,
  'P0001', 'SELLER_APPROVAL_REQUIRED', 'expired seller cannot receive a new order'
);

update public.profiles set verification_status = 'verified'
where id = '44444444-4444-4444-8444-444444444441';
select ok(private.seller_can_sell('44444444-4444-4444-8444-444444444441'), 'admin approval restores eligibility');

set local role anon;
select results_eq(
  $$select count(*)::bigint from public.shops where slug = 'grace-test-shop'$$,
  array[1::bigint], 'approved shop becomes visible again'
);
reset role;

select lives_ok(
  $$insert into public.orders(buyer_id, shop_id, fulfilment_type, delivery_address, total_amount)
    select '44444444-4444-4444-8444-444444444442', id, 'delivery', 'Test address', 10
    from public.shops where slug = 'grace-test-shop'$$,
  'approved seller can receive a new order'
);

select * from finish();
rollback;
