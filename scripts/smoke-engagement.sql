\set ON_ERROR_STOP on
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'order-smoke-seller@example.test', extensions.crypt('SmokePassword123!', extensions.gen_salt('bf')), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}', '{"role":"seller","isStudent":false,"firstName":"Order","lastName":"Seller","display_name":"Order Seller"}', now(), now()),
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
  'good', 250, 5, array['https://example.test/order-smoke.png'], 'Local campus', true, true, 'active'
);


insert into public.shop_pickup_areas(shop_id,campus_id) select '90000000-0000-4000-8000-000000000004',id from public.campuses limit 1;
set local role service_role;
do $$
declare
 seller uuid:='90000000-0000-4000-8000-000000000001'; buyer uuid:='90000000-0000-4000-8000-000000000002';
 product uuid:='90000000-0000-4000-8000-000000000005'; shop uuid:='90000000-0000-4000-8000-000000000004';
 c uuid; offer uuid; ord uuid; wanted uuid; campus uuid; n integer;
begin
 if has_function_privilege('authenticated','public.market_checkout_offer(uuid,uuid,text,uuid,text,text)','EXECUTE') then raise exception 'RPC_EXPOSED'; end if;
 insert into shop_follows(user_id,shop_id) values(buyer,shop);
 insert into saved_searches(user_id,name,filters) values(buyer,'Textbooks','{"q":"textbook","max_price":"300"}');
 perform market_bulk_products(seller,array[product],'paused');
 perform market_bulk_products(seller,array[product],'active');
 select count(*) into n from notifications where user_id=buyer and title='A new listing for you';
 if n<>1 then raise exception 'ALERT_DEDUP_FAILED count=%',n; end if;
 insert into wanted_posts(buyer_id,title,details,budget) values(buyer,'Need a textbook','Looking for a good used textbook',300) returning id into wanted;
 perform market_reply_wanted(seller,wanted,product);
 perform market_reply_wanted(seller,wanted,product);
 select count(*) into n from wanted_replies where wanted_id=wanted;
 if n<>1 then raise exception 'WANTED_DUPLICATE'; end if;
 insert into favourites(user_id,product_id) values(buyer,product);
 update products set price=225 where id=product;
 if (select count(*) from notifications where user_id=buyer and title='A saved item dropped in price')<>1 then raise exception 'PRICE_DROP_MISSING';end if;
 c:=start_marketplace_conversation(buyer,product);
 begin perform market_offer(seller,c,200,1);raise exception 'SELLER_OFFER_ALLOWED';exception when insufficient_privilege then null;end;
 offer:=market_offer(buyer,c,200,2);
 begin perform market_decide_offer(buyer,offer,'accepted');raise exception 'BUYER_ACCEPT_ALLOWED';exception when insufficient_privilege then null;end;
 perform market_decide_offer(seller,offer,'accepted');
 select campus_id into campus from shop_pickup_areas where shop_id=shop limit 1;
 if campus is null then raise exception 'TEST_REQUIRES_SEEDED_CAMPUS';end if;
 ord:=market_checkout_offer(buyer,offer,'campus_pickup',campus,null,'Library');
 if (select total_amount from orders where id=ord)<>400 or (select sum(line_total) from order_items where order_id=ord)<>400 then raise exception 'OFFER_TOTAL_WRONG';end if;
 if market_checkout_offer(buyer,offer,'campus_pickup',campus,null,'Library')<>ord then raise exception 'OFFER_NOT_IDEMPOTENT';end if;
 if (select stock_quantity from products where id=product)<>3 then raise exception 'STOCK_WRONG';end if;
 perform market_pickup(buyer,ord,'propose',now()+interval '2 hours','Library entrance');
 begin perform market_pickup(buyer,ord,'confirm');raise exception 'SELF_CONFIRM_ALLOWED';exception when invalid_parameter_value then null;end;
 perform market_pickup(seller,ord,'confirm');
 perform market_pickup_reminders(buyer);perform market_pickup_reminders(seller);
 select count(*) into n from notifications where title='Pickup in the next 24 hours' and user_id in(buyer,seller);
 if n<>2 then raise exception 'REMINDERS_NOT_IDEMPOTENT';end if;
 perform transition_marketplace_order(ord,seller,'preparing');perform transition_marketplace_order(ord,seller,'ready');
 perform market_pickup(buyer,ord,'collect');
 if (select status from orders where id=ord)<>'completed' then raise exception 'COLLECTION_FAILED';end if;
 raise notice 'Engagement smoke passed: restricted RPCs, deduplicated alerts and replies, offer roles/prices/idempotency/stock, pickup confirmation/reminders/collection';
end $$;
reset role;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select instance_id,replace(id::text,'000000000002','000000000006')::uuid,aud,role,'queue-admin-a@example.test',encrypted_password,email_confirmed_at,'','','','',raw_app_meta_data,raw_user_meta_data,created_at,updated_at from auth.users where id='90000000-0000-4000-8000-000000000002';
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select instance_id,replace(id::text,'000000000002','000000000007')::uuid,aud,role,'queue-admin-b@example.test',encrypted_password,email_confirmed_at,'','','','',raw_app_meta_data,raw_user_meta_data,created_at,updated_at from auth.users where id='90000000-0000-4000-8000-000000000002';
insert into admin_members(user_id) values('90000000-0000-4000-8000-000000000006'),('90000000-0000-4000-8000-000000000007');
insert into safety_reports(id,reporter_id,category,details) values('90000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000002','other','A temporary queue smoke test report.');
set local role service_role;
do $$ declare a uuid:='90000000-0000-4000-8000-000000000006';b uuid:='90000000-0000-4000-8000-000000000007';r uuid:='90000000-0000-4000-8000-000000000008';begin
 perform market_claim_queue(a,'report',r,false);
 begin perform market_decide_queue(b,'report',r,'resolved','Resolved smoke test report.');raise exception 'OTHER_ADMIN_DECISION_ALLOWED';exception when insufficient_privilege then null;end;
 perform market_claim_queue(a,'report',r,true);
 perform market_decide_queue(b,'report',r,'dismissed','Dismissed smoke test report.');
 if (select count(*) from admin_queue_claims where target_id=r)<>0 then raise exception 'CLAIM_NOT_RELEASED';end if;
 if not exists(select 1 from admin_audit_events where target_report_id=r and actor_id=b) then raise exception 'AUDIT_MISSING';end if;
 raise notice 'Admin queue smoke passed: exclusive assignment, release, decision and audit history';
end $$;
rollback;
