-- Keep order writes inside the service-only RPCs; do not grant direct table writes.
create or replace function public.market_product_alerts() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_new boolean; v_drop boolean; v_category text;
begin
 v_new := tg_op='INSERT';
 if tg_op='UPDATE' then v_new := old.status <> 'active' and new.status='active'; end if;
 v_drop := false;
 if tg_op='UPDATE' then v_drop := new.price < old.price; end if;
 if new.status <> 'active' or not (v_new or v_drop) or not exists(select 1 from shops s where s.id=new.shop_id and s.is_open and public.sellable(s)) then return new; end if;
 select slug into v_category from categories where id=new.category_id;
 insert into notifications(user_id,type,title,body,href)
 select distinct p.id,'system',case when v_drop then 'A saved item dropped in price' else 'A new listing for you' end,
 new.title || ' · R' || new.price, '/products/' || new.slug
 from profiles p where p.role='buyer' and not exists(select 1 from admin_members a where a.user_id=p.id) and (
 (v_drop and exists(select 1 from favourites f where f.user_id=p.id and f.product_id=new.id))
 or (v_new and exists(select 1 from shop_follows f where f.user_id=p.id and f.shop_id=new.shop_id))
 or (v_new and exists(select 1 from saved_searches s where s.user_id=p.id
   and (coalesce(s.filters->>'q','')='' or position(lower(s.filters->>'q') in lower(new.title||' '||coalesce(new.description,'')))>0)
   and (coalesce(s.filters->>'category','')='' or s.filters->>'category'=v_category)
   and (coalesce(s.filters->>'shop','')='' or exists(select 1 from shops sh where sh.id=new.shop_id and sh.slug=s.filters->>'shop'))
   and (coalesce(s.filters->>'condition','')='' or s.filters->>'condition'=new.condition)
   and (coalesce(s.filters->>'min_price','')='' or new.price >= (s.filters->>'min_price')::numeric)
   and (coalesce(s.filters->>'max_price','')='' or new.price <= (s.filters->>'max_price')::numeric)
   and (coalesce(s.filters->>'campus','')='' or (new.allows_campus_pickup and exists(select 1 from shop_pickup_areas pa where pa.shop_id=new.shop_id and pa.campus_id::text=s.filters->>'campus')))
   and (coalesce(s.filters->>'fulfilment','')='' or (s.filters->>'fulfilment'='delivery' and new.allows_delivery) or (s.filters->>'fulfilment'='campus_pickup' and new.allows_campus_pickup))
  ))
 );
 return new;
end $$;

create or replace function public.market_offer(p_actor uuid,p_conversation uuid,p_price numeric,p_quantity integer) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare c conversations%rowtype; v_id uuid;
begin
 perform market_require_buyer(p_actor);
 select * into c from conversations where id=p_conversation for update;
 if not found or c.buyer_id<>p_actor or c.product_id is null or c.conversation_type<>'message_seller' then raise exception using errcode='42501',message='CONVERSATION_ACCESS_FORBIDDEN'; end if;
 if p_price is null or p_price<=0 or p_price>9999999999.99 or p_quantity is null or p_quantity not between 1 and 99 then raise exception using errcode='22023',message='OFFER_INVALID'; end if;
 if not exists(select 1 from products p join shops s on s.id=p.shop_id where p.id=c.product_id and p.status='active' and p.stock_quantity>=p_quantity and s.is_open and public.sellable(s)) then raise exception using errcode='22023',message='PRODUCT_UNAVAILABLE'; end if;
 update marketplace_offers set status='expired' where conversation_id=c.id and status='pending' and expires_at<=now();
 if exists(select 1 from marketplace_offers where conversation_id=c.id and status='pending') then raise exception using errcode='23505',message='OFFER_ALREADY_PENDING'; end if;
 insert into marketplace_offers(conversation_id,buyer_id,seller_id,product_id,unit_price,quantity)
 values(c.id,p_actor,c.seller_id,c.product_id,p_price,p_quantity) returning id into v_id;
 insert into notifications(user_id,type,title,body,href) values(c.seller_id,'system','New offer','A buyer made an offer.','/seller/messages?conversation='||c.id);
 return v_id;
end $$;

create or replace function public.market_reply_wanted(p_actor uuid,p_wanted uuid,p_product uuid) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare w wanted_posts%rowtype; v_id uuid; v_title text;
begin
 select * into w from wanted_posts where id=p_wanted for update;
 if not found or w.status<>'open' or w.expires_at<=now() then raise exception using errcode='P0002',message='WANTED_NOT_AVAILABLE'; end if;
 select p.title into v_title from products p join shops s on s.id=p.shop_id join profiles u on u.id=s.owner_id
 where p.id=p_product and s.owner_id=p_actor and u.role='seller' and p.status='active' and s.is_open and public.sellable(s)
 and not exists(select 1 from admin_members where user_id=p_actor);
 if not found then raise exception using errcode='42501',message='OWN_ACTIVE_PRODUCT_REQUIRED'; end if;
 insert into wanted_replies(wanted_id,seller_id,product_id) values(p_wanted,p_actor,p_product)
 on conflict(wanted_id,product_id) do nothing returning id into v_id;
 if v_id is not null then insert into notifications(user_id,type,title,body,href) values(w.buyer_id,'system','A seller replied to your request',v_title,'/wanted'); end if;
 return v_id;
end $$;

create or replace function public.market_checkout_offer(p_actor uuid,p_offer uuid,p_fulfilment text,p_campus uuid,p_address text,p_notes text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare o marketplace_offers%rowtype; v_id uuid;
begin
 perform market_require_buyer(p_actor);
 select * into o from marketplace_offers where id=p_offer for update;
 if not found or o.buyer_id<>p_actor then raise exception using errcode='42501',message='OFFER_ACCESS_FORBIDDEN'; end if;
 if o.status='used' then return o.order_id; end if;
 if o.status<>'accepted' or o.expires_at<=now() then raise exception using errcode='22023',message='OFFER_UNAVAILABLE'; end if;
 v_id := create_marketplace_order(p_actor,jsonb_build_array(jsonb_build_object('product_id',o.product_id,'quantity',o.quantity)),p_fulfilment,p_campus,p_address,p_notes);
 update order_items set unit_price=o.unit_price where order_id=v_id;
 update orders set total_amount=o.unit_price*o.quantity where id=v_id;
 update marketplace_offers set status='used',order_id=v_id where id=p_offer;
 return v_id;
end $$;

create or replace function public.market_pickup(p_actor uuid,p_order uuid,p_action text,p_at timestamptz default null,p_location text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype; v_seller uuid; plan pickup_plans%rowtype; recipient uuid;
begin
 select * into o from orders where id=p_order for update;
 if not found then raise exception using errcode='P0002',message='ORDER_NOT_FOUND'; end if;
 select owner_id into v_seller from shops where id=o.shop_id;
 if p_actor not in(o.buyer_id,v_seller) then raise exception using errcode='42501',message='ORDER_ACCESS_FORBIDDEN'; end if;
 if o.fulfilment_type<>'campus_pickup' or o.status in ('completed','cancelled') then raise exception using errcode='22023',message='PICKUP_UNAVAILABLE'; end if;
 select * into plan from pickup_plans where order_id=p_order;
 if p_action='propose' then
  if p_at is null or p_at<=now() or p_at>now()+interval '30 days' or coalesce(length(trim(p_location)),0) not between 3 and 200 then raise exception using errcode='22023',message='PICKUP_DETAILS_INVALID'; end if;
  insert into pickup_plans(order_id,proposed_by,meeting_at,location) values(p_order,p_actor,p_at,trim(p_location))
  on conflict(order_id) do update set proposed_by=p_actor,meeting_at=p_at,location=trim(p_location),status='proposed',reminder_sent_at=null,updated_at=now();
 elsif p_action='confirm' then
  if plan.order_id is null or plan.proposed_by=p_actor or plan.status<>'proposed' or plan.meeting_at<=now() then raise exception using errcode='22023',message='PICKUP_CONFIRMATION_INVALID'; end if;
  update pickup_plans set status='confirmed',updated_at=now() where order_id=p_order;
 elsif p_action='collect' then
  if p_actor<>o.buyer_id or plan.status is distinct from 'confirmed' or o.status<>'ready' then raise exception using errcode='42501',message='PICKUP_COLLECTION_FORBIDDEN'; end if;
  update pickup_plans set status='collected',updated_at=now() where order_id=p_order;
  update orders set status='completed' where id=p_order;
 else raise exception using errcode='22023',message='PICKUP_ACTION_INVALID';
 end if;
 recipient := case when p_actor=o.buyer_id then v_seller else o.buyer_id end;
 insert into notifications(user_id,type,title,body,href) values(recipient,'system','Pickup updated','Check your order for the latest pickup arrangement.',case when recipient=v_seller then '/seller/orders' else '/orders' end);
end $$;

create or replace function public.market_claim_queue(p_actor uuid,p_kind text,p_id uuid,p_release boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed uuid;
begin
 if not exists(select 1 from admin_members where user_id=p_actor) then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
 if p_kind='report' then perform id from safety_reports where id=p_id and status='open' for update;
 elsif p_kind='verification' then perform id from seller_verifications where id=p_id and status='pending' for update;
 else raise exception using errcode='22023',message='QUEUE_KIND_INVALID'; end if;
 if not found then raise exception using errcode='P0002',message='QUEUE_ITEM_UNAVAILABLE'; end if;
 select assigned_to into claimed from admin_queue_claims where kind=p_kind and target_id=p_id;
 if claimed is not null and claimed<>p_actor then raise exception using errcode='42501',message='QUEUE_ALREADY_ASSIGNED'; end if;
 if p_release then delete from admin_queue_claims where kind=p_kind and target_id=p_id;
 else insert into admin_queue_claims(kind,target_id,assigned_to) values(p_kind,p_id,p_actor) on conflict(kind,target_id) do nothing; end if;
end $$;

