-- Engagement features remain API-owned: clients cannot bypass role or ownership checks.
create table public.saved_searches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80), filters jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table public.shop_follows (
 user_id uuid references public.profiles(id) on delete cascade, shop_id uuid references public.shops(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,shop_id)
);
create table public.wanted_posts (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(length(trim(title)) between 5 and 100), details text not null check(length(trim(details)) between 10 and 1000),
 budget numeric(12,2) not null check(budget>0), campus_id uuid references public.campuses(id),
 status text not null default 'open' check(status in ('open','closed')),
 expires_at timestamptz not null default now()+interval '30 days', created_at timestamptz not null default now()
);
create table public.wanted_replies (
 id uuid primary key default gen_random_uuid(), wanted_id uuid not null references public.wanted_posts(id) on delete cascade,
 seller_id uuid not null references public.profiles(id) on delete cascade, product_id uuid not null references public.products(id) on delete cascade,
 created_at timestamptz not null default now(), unique(wanted_id,product_id)
);
create table public.marketplace_offers (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
 buyer_id uuid not null references public.profiles(id), seller_id uuid not null references public.profiles(id),
 product_id uuid not null references public.products(id), unit_price numeric(12,2) not null check(unit_price>0),
 quantity integer not null check(quantity between 1 and 99),
 status text not null default 'pending' check(status in ('pending','accepted','declined','withdrawn','expired','used')),
 expires_at timestamptz not null default now()+interval '48 hours', order_id uuid references public.orders(id),
 created_at timestamptz not null default now()
);
create unique index marketplace_one_pending_offer on public.marketplace_offers(conversation_id) where status='pending';
create table public.pickup_plans (
 order_id uuid primary key references public.orders(id) on delete cascade,
 proposed_by uuid not null references public.profiles(id), meeting_at timestamptz not null,
 location text not null check(length(trim(location)) between 3 and 200),
 status text not null default 'proposed' check(status in ('proposed','confirmed','collected')),
 reminder_sent_at timestamptz, updated_at timestamptz not null default now()
);
create table public.admin_queue_claims (
 kind text not null check(kind in ('report','verification')), target_id uuid not null,
 assigned_to uuid not null references public.admin_members(user_id), claimed_at timestamptz not null default now(),
 primary key(kind,target_id)
);
create index wanted_posts_open_created on public.wanted_posts(created_at desc) where status='open';
create index offers_buyer_created on public.marketplace_offers(buyer_id,created_at desc);
create index offers_seller_created on public.marketplace_offers(seller_id,created_at desc);
create index saved_searches_user on public.saved_searches(user_id);
create index shop_follows_shop on public.shop_follows(shop_id);
do $$ declare t text; begin
 foreach t in array array['saved_searches','shop_follows','wanted_posts','wanted_replies','marketplace_offers','pickup_plans','admin_queue_claims'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;

create function public.market_require_buyer(p_user uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from profiles where id=p_user and role='buyer')
 or exists(select 1 from admin_members where user_id=p_user) then
 raise exception using errcode='42501',message='BUYER_REQUIRED'; end if;
end $$;

create function public.market_product_alerts() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_new boolean; v_drop boolean; v_category text;
begin
 v_new := tg_op='INSERT';
 if tg_op='UPDATE' then v_new := old.status <> 'active' and new.status='active'; end if;
 v_drop := false;
 if tg_op='UPDATE' then v_drop := new.price < old.price; end if;
 if new.status <> 'active' or not (v_new or v_drop) or not exists(select 1 from shops where id=new.shop_id and is_open and sellable) then return new; end if;
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
create trigger marketplace_product_alerts after insert or update of price,status on public.products for each row execute function public.market_product_alerts();

create function public.market_reply_wanted(p_actor uuid,p_wanted uuid,p_product uuid) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare w wanted_posts%rowtype; v_id uuid; v_title text;
begin
 select * into w from wanted_posts where id=p_wanted for update;
 if not found or w.status<>'open' or w.expires_at<=now() then raise exception using errcode='P0002',message='WANTED_NOT_AVAILABLE'; end if;
 select p.title into v_title from products p join shops s on s.id=p.shop_id join profiles u on u.id=s.owner_id
 where p.id=p_product and s.owner_id=p_actor and u.role='seller' and p.status='active' and s.is_open and s.sellable
 and not exists(select 1 from admin_members where user_id=p_actor);
 if not found then raise exception using errcode='42501',message='OWN_ACTIVE_PRODUCT_REQUIRED'; end if;
 insert into wanted_replies(wanted_id,seller_id,product_id) values(p_wanted,p_actor,p_product)
 on conflict(wanted_id,product_id) do nothing returning id into v_id;
 if v_id is not null then insert into notifications(user_id,type,title,body,href) values(w.buyer_id,'system','A seller replied to your request',v_title,'/wanted'); end if;
 return v_id;
end $$;

create function public.market_offer(p_actor uuid,p_conversation uuid,p_price numeric,p_quantity integer) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare c conversations%rowtype; v_id uuid;
begin
 perform market_require_buyer(p_actor);
 select * into c from conversations where id=p_conversation for update;
 if not found or c.buyer_id<>p_actor or c.product_id is null then raise exception using errcode='42501',message='CONVERSATION_ACCESS_FORBIDDEN'; end if;
 if p_price is null or p_price<=0 or p_price>9999999999.99 or p_quantity is null or p_quantity not between 1 and 99 then raise exception using errcode='22023',message='OFFER_INVALID'; end if;
 if not exists(select 1 from products p join shops s on s.id=p.shop_id where p.id=c.product_id and p.status='active' and p.stock_quantity>=p_quantity and s.is_open and s.sellable) then raise exception using errcode='22023',message='PRODUCT_UNAVAILABLE'; end if;
 update marketplace_offers set status='expired' where conversation_id=c.id and status='pending' and expires_at<=now();
 if exists(select 1 from marketplace_offers where conversation_id=c.id and status='pending') then raise exception using errcode='23505',message='OFFER_ALREADY_PENDING'; end if;
 insert into marketplace_offers(conversation_id,buyer_id,seller_id,product_id,unit_price,quantity)
 values(c.id,p_actor,c.seller_id,c.product_id,p_price,p_quantity) returning id into v_id;
 insert into notifications(user_id,type,title,body,href) values(c.seller_id,'system','New offer','A buyer made an offer.','/seller/messages?conversation='||c.id);
 return v_id;
end $$;

create function public.market_decide_offer(p_actor uuid,p_offer uuid,p_status text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare o marketplace_offers%rowtype;
begin
 select * into o from marketplace_offers where id=p_offer for update;
 if not found then raise exception using errcode='P0002',message='OFFER_NOT_FOUND'; end if;
 if o.status<>'pending' or o.expires_at<=now() then raise exception using errcode='22023',message='OFFER_NO_LONGER_PENDING'; end if;
 if not ((p_actor=o.seller_id and p_status in ('accepted','declined')) or (p_actor=o.buyer_id and p_status='withdrawn')) then raise exception using errcode='42501',message='OFFER_ACCESS_FORBIDDEN'; end if;
 update marketplace_offers set status=p_status where id=p_offer;
 insert into notifications(user_id,type,title,body,href) values(case when p_actor=o.buyer_id then o.seller_id else o.buyer_id end,'system','Offer '||p_status,'Your offer conversation has an update.',case when p_actor=o.buyer_id then '/seller/messages?conversation=' else '/messages?conversation=' end||o.conversation_id);
end $$;

create function public.market_checkout_offer(p_actor uuid,p_offer uuid,p_fulfilment text,p_campus uuid,p_address text,p_notes text) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
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

create function public.market_pickup(p_actor uuid,p_order uuid,p_action text,p_at timestamptz default null,p_location text default null) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
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

create function public.market_pickup_reminders(p_user uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare r record;
begin
 for r in select p.*,o.buyer_id,s.owner_id from pickup_plans p join orders o on o.id=p.order_id join shops s on s.id=o.shop_id
 where (o.buyer_id=p_user or s.owner_id=p_user) and p.status='confirmed' and p.reminder_sent_at is null and p.meeting_at between now() and now()+interval '24 hours' and o.status not in ('completed','cancelled') for update of p skip locked loop
  insert into notifications(user_id,type,title,body,href) values(r.buyer_id,'system','Pickup in the next 24 hours',r.location,'/orders'),(r.owner_id,'system','Pickup in the next 24 hours',r.location,'/seller/orders');
  update pickup_plans set reminder_sent_at=now() where order_id=r.order_id;
 end loop;
end $$;

create function public.market_claim_queue(p_actor uuid,p_kind text,p_id uuid,p_release boolean default false) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
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

create function public.market_decide_queue(p_actor uuid,p_kind text,p_id uuid,p_status text,p_note text) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform market_claim_queue(p_actor,p_kind,p_id,false);
 if p_kind='report' then perform admin_decide_report(p_actor,p_id,p_status,p_note);
 else perform admin_review_verification(p_actor,p_id,p_status,p_note); end if;
 delete from admin_queue_claims where kind=p_kind and target_id=p_id;
end $$;

-- Every RPC above takes an explicit actor and is callable only by the trusted API.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('market_require_buyer','market_product_alerts','market_reply_wanted','market_offer','market_decide_offer','market_checkout_offer','market_pickup','market_pickup_reminders','market_claim_queue','market_decide_queue') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- Atomic bulk status changes: reject mixed ownership or incomplete selections.
create function public.market_bulk_products(p_actor uuid,p_ids uuid[],p_status text) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_count integer;
begin
 if p_status not in ('active','paused') or coalesce(cardinality(p_ids),0) not between 1 and 100 then raise exception using errcode='22023',message='PRODUCT_SELECTION_INVALID'; end if;
 if not exists(select 1 from profiles where id=p_actor and role='seller') or exists(select 1 from admin_members where user_id=p_actor) then raise exception using errcode='42501',message='SELLER_REQUIRED'; end if;
 perform p.id from products p where p.id=any(p_ids) order by p.id for update;
 select count(*) into v_count from products p join shops s on s.id=p.shop_id where p.id=any(p_ids) and s.owner_id=p_actor;
 if v_count<>cardinality(p_ids) then raise exception using errcode='42501',message='PRODUCT_OWNERSHIP_REQUIRED'; end if;
 update products set status=p_status where id=any(p_ids);
 return v_count;
end $$;
revoke all on function public.market_bulk_products(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.market_bulk_products(uuid,uuid[],text) to service_role;

