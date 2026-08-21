\set ON_ERROR_STOP on
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','authenticated','authenticated','message-seller@example.test',extensions.crypt('SmokePassword123!',extensions.gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}','{"role":"seller","firstName":"Message","lastName":"Seller","display_name":"Message Seller"}',now(),now()),
('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000002','authenticated','authenticated','message-buyer@example.test',extensions.crypt('SmokePassword123!',extensions.gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}','{"role":"buyer","firstName":"Message","lastName":"Buyer","display_name":"Message Buyer","isStudent":true}',now(),now());
insert into public.categories(id,name,slug,description) values('91000000-0000-4000-8000-000000000003','Message Smoke','message-smoke','Disposable messaging validation category.');
insert into public.shops(id,owner_id,name,slug,is_open) values('91000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','Message Smoke Shop','message-smoke-shop',true);
insert into public.products(id,shop_id,category_id,title,description,condition,price,stock_quantity,image_urls,pickup_location,status) values('91000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000003','Message smoke product','A disposable active product for validating conversations and notifications.','good',50,1,array['https://example.test/message.png'],'Local campus','active');
do $$ declare c uuid; m uuid; n integer; begin
c:=public.start_marketplace_conversation('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000005');
if c<>public.start_marketplace_conversation('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000005') then raise exception 'CONVERSATION_IDEMPOTENCY_FAILED'; end if;
m:=public.send_marketplace_message(c,'91000000-0000-4000-8000-000000000002','Is this available?');
select count(*) into n from public.notifications where user_id='91000000-0000-4000-8000-000000000001' and type='message';
if m is null or n<>1 then raise exception 'MESSAGE_NOTIFICATION_FAILED'; end if;
raise notice 'messaging smoke passed: idempotent conversation, participant message, recipient notification'; end $$;
rollback;
