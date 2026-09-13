\set ON_ERROR_STOP on
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'order-smoke-seller@example.test', extensions.crypt('SmokePassword123!', extensions.gen_salt('bf')), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{"role":"seller","firstName":"Order","lastName":"Seller","display_name":"Order Seller"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'order-smoke-buyer@example.test', extensions.crypt('SmokePassword123!', extensions.gen_salt('bf')), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{"role":"buyer","firstName":"Order","lastName":"Buyer","display_name":"Order Buyer","isStudent":true}', now(), now());

insert into public.categories (id, name, slug, description)
values ('90000000-0000-4000-8000-000000000003', 'Order Smoke', 'order-smoke', 'Disposable order validation category.');
insert into public.shops (id, owner_id, name, slug, is_open)
values ('90000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000001', 'Order Smoke Shop', 'order-smoke-shop', true);
insert into public.products (
  id, shop_id, category_id, title, description, condition, price, stock_quantity,
  image_urls, pickup_location, allows_campus_pickup, allows_delivery, status
) values (
  '90000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000004',
  '90000000-0000-4000-8000-000000000003', 'Order smoke textbook',
  'A disposable product for validating atomic local checkout and cancellation.',
  'good', 250, 2, array['https://example.test/order-smoke.png'], 'Local campus', true, true, 'active'
);

do $$
declare
  first_order uuid;
  second_order uuid;
  current_stock integer;
  current_status text;
  current_total numeric;
  review_id uuid;
  shop_rating numeric;
  seller_notification_count integer;
begin
  first_order := public.create_marketplace_order(
    '90000000-0000-4000-8000-000000000002',
    '[{"product_id":"90000000-0000-4000-8000-000000000005","quantity":1}]',
    'delivery', null, '1 Smoke Test Road', null
  );
  select total_amount into current_total from public.orders where id = first_order;
  if current_total <> 250 then raise exception 'ORDER_TOTAL_ASSERTION_FAILED'; end if;
  select count(*) into seller_notification_count from public.notifications where user_id = '90000000-0000-4000-8000-000000000001' and type = 'order';
  if seller_notification_count <> 1 then raise exception 'ORDER_NOTIFICATION_ASSERTION_FAILED'; end if;
  perform public.transition_marketplace_order(first_order, '90000000-0000-4000-8000-000000000001', 'preparing');
  perform public.transition_marketplace_order(first_order, '90000000-0000-4000-8000-000000000001', 'ready');
  perform public.transition_marketplace_order(first_order, '90000000-0000-4000-8000-000000000001', 'completed');
  review_id := public.submit_marketplace_review(first_order, '90000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000002', 5, 'Excellent smoke-test seller and product.');
  select rating into shop_rating from public.shops where id = '90000000-0000-4000-8000-000000000004';
  if review_id is null or shop_rating <> 5 then raise exception 'ORDER_REVIEW_REPUTATION_ASSERTION_FAILED'; end if;

  insert into public.user_preferences(user_id, notify_new_orders)
  values ('90000000-0000-4000-8000-000000000001', false);

  second_order := public.create_marketplace_order(
    '90000000-0000-4000-8000-000000000002',
    '[{"product_id":"90000000-0000-4000-8000-000000000005","quantity":1}]',
    'delivery', null, '1 Smoke Test Road', null
  );
  select count(*) into seller_notification_count from public.notifications where user_id = '90000000-0000-4000-8000-000000000001' and type = 'order';
  if seller_notification_count <> 1 then raise exception 'ORDER_NOTIFICATION_PREFERENCE_ASSERTION_FAILED'; end if;
  select stock_quantity, status into current_stock, current_status from public.products where id = '90000000-0000-4000-8000-000000000005';
  if current_stock <> 0 or current_status <> 'sold' then raise exception 'ORDER_STOCK_DECREMENT_ASSERTION_FAILED'; end if;
  perform public.transition_marketplace_order(second_order, '90000000-0000-4000-8000-000000000002', 'cancelled');
  select stock_quantity, status into current_stock, current_status from public.products where id = '90000000-0000-4000-8000-000000000005';
  if current_stock <> 1 or current_status <> 'active' then raise exception 'ORDER_STOCK_RESTORE_ASSERTION_FAILED'; end if;
  raise notice 'order smoke passed: totals, transitions, notification preferences, review reputation, stock decrement, cancellation, stock restore';
end;
$$;

rollback;
