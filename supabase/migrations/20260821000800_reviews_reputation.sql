create table public.reviews (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict, shop_id uuid not null references public.shops(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade, rating smallint not null, comment text not null,
  created_at timestamptz not null default now(), constraint reviews_rating_valid check(rating between 1 and 5),
  constraint reviews_comment_length check(length(trim(comment)) between 10 and 1000), unique(order_id,product_id)
);
create index reviews_product_created_idx on public.reviews(product_id,created_at desc); create index reviews_shop_created_idx on public.reviews(shop_id,created_at desc);
alter table public.reviews enable row level security; create policy "reviews are public" on public.reviews for select to anon,authenticated using(true); grant select on public.reviews to anon,authenticated,service_role; grant insert on public.reviews to service_role;
create or replace function public.submit_marketplace_review(p_order_id uuid,p_product_id uuid,p_reviewer_id uuid,p_rating integer,p_comment text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype; v_id uuid; v_seller uuid;
begin select * into v_order from public.orders where id=p_order_id and buyer_id=p_reviewer_id and status='completed';
if not found then raise exception using errcode='42501',message='REVIEW_COMPLETED_ORDER_REQUIRED'; end if;
if not exists(select 1 from public.order_items where order_id=p_order_id and product_id=p_product_id) then raise exception using errcode='22023',message='REVIEW_PRODUCT_INVALID'; end if;
if p_rating not between 1 and 5 or coalesce(length(trim(p_comment)),0) not between 10 and 1000 then raise exception using errcode='22023',message='REVIEW_CONTENT_INVALID'; end if;
insert into public.reviews(order_id,product_id,shop_id,reviewer_id,rating,comment) values(p_order_id,p_product_id,v_order.shop_id,p_reviewer_id,p_rating,trim(p_comment)) returning id into v_id;
update public.shops s set rating=x.rating,review_count=x.review_count from(select round(avg(rating)::numeric,1) rating,count(*) review_count from public.reviews where shop_id=v_order.shop_id)x where s.id=v_order.shop_id;
select owner_id into v_seller from public.shops where id=v_order.shop_id;
update public.profiles p set rating=x.rating,review_count=x.review_count from(select round(avg(r.rating)::numeric,1) rating,count(*) review_count from public.reviews r join public.shops s on s.id=r.shop_id where s.owner_id=v_seller)x where p.id=v_seller;
insert into public.notifications(user_id,type,title,body,href) values(v_seller,'review','New review','A buyer left a '||p_rating||'-star review.','/seller'); return v_id;
exception when unique_violation then raise exception using errcode='23505',message='REVIEW_ALREADY_EXISTS'; end $$;
revoke all on function public.submit_marketplace_review(uuid,uuid,uuid,integer,text) from public,anon,authenticated; grant execute on function public.submit_marketplace_review(uuid,uuid,uuid,integer,text) to service_role;
