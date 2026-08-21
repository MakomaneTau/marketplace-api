-- Atomic checkout and controlled order lifecycle transitions for the API.

create or replace function public.create_marketplace_order(
  p_buyer_id uuid,
  p_items jsonb,
  p_fulfilment_type text,
  p_pickup_campus_id uuid default null,
  p_delivery_address text default null,
  p_pickup_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_shop_id uuid;
  v_owner_id uuid;
  v_currency text;
  v_total numeric(12, 2);
  v_requested_count integer;
  v_product_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception using errcode = '22023', message = 'ORDER_ITEMS_INVALID';
  end if;

  select count(*), count(distinct product_id)
  into v_requested_count, v_product_count
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  where product_id is not null and quantity between 1 and 99;
  if v_requested_count <> jsonb_array_length(p_items) or v_product_count <> v_requested_count then
    raise exception using errcode = '22023', message = 'ORDER_ITEMS_INVALID';
  end if;

  perform product.id
  from public.products product
  join jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    on item.product_id = product.id
  order by product.id
  for update;

  select count(*), (array_agg(product.shop_id))[1], (array_agg(shop.owner_id))[1], min(product.currency),
         sum(product.price * item.quantity)::numeric(12, 2)
  into v_product_count, v_shop_id, v_owner_id, v_currency, v_total
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  join public.products product on product.id = item.product_id
  join public.shops shop on shop.id = product.shop_id
  where product.status = 'active'
    and product.stock_quantity >= item.quantity
    and shop.is_open;

  if v_product_count <> v_requested_count then
    raise exception using errcode = 'P0001', message = 'ORDER_PRODUCT_UNAVAILABLE';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    join public.products product on product.id = item.product_id
    where product.shop_id <> v_shop_id or product.currency <> v_currency
  ) then
    raise exception using errcode = '22023', message = 'ORDER_SINGLE_SHOP_REQUIRED';
  end if;
  if v_owner_id = p_buyer_id then
    raise exception using errcode = '22023', message = 'ORDER_OWN_SHOP_FORBIDDEN';
  end if;

  if p_fulfilment_type = 'campus_pickup' then
    if p_pickup_campus_id is null or p_delivery_address is not null
       or not exists (
         select 1 from public.shop_pickup_areas
         where shop_id = v_shop_id and campus_id = p_pickup_campus_id
       )
       or exists (
         select 1 from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
         join public.products product on product.id = item.product_id
         where not product.allows_campus_pickup
       ) then
      raise exception using errcode = '22023', message = 'ORDER_FULFILMENT_INVALID';
    end if;
  elsif p_fulfilment_type = 'delivery' then
    if p_pickup_campus_id is not null or coalesce(length(trim(p_delivery_address)), 0) = 0
       or exists (
         select 1 from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
         join public.products product on product.id = item.product_id
         where not product.allows_delivery
       ) then
      raise exception using errcode = '22023', message = 'ORDER_FULFILMENT_INVALID';
    end if;
  else
    raise exception using errcode = '22023', message = 'ORDER_FULFILMENT_INVALID';
  end if;

  insert into public.orders (
    buyer_id, shop_id, fulfilment_type, pickup_campus_id, delivery_address,
    total_amount, currency, pickup_notes
  ) values (
    p_buyer_id, v_shop_id, p_fulfilment_type, p_pickup_campus_id,
    nullif(trim(p_delivery_address), ''), v_total, v_currency,
    nullif(trim(p_pickup_notes), '')
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  select v_order_id, product.id, product.title, product.price, item.quantity
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  join public.products product on product.id = item.product_id;

  update public.products product
  set stock_quantity = product.stock_quantity - requested.quantity,
      status = case when product.stock_quantity - requested.quantity = 0 then 'sold' else product.status end
  from (
    select product_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    group by product_id
  ) requested
  where product.id = requested.product_id;

  return v_order_id;
end;
$$;

create or replace function public.transition_marketplace_order(
  p_order_id uuid,
  p_actor_id uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_is_seller boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND'; end if;

  select exists (
    select 1 from public.shops where id = v_order.shop_id and owner_id = p_actor_id
  ) into v_is_seller;
  if not v_is_seller and v_order.buyer_id <> p_actor_id then
    raise exception using errcode = '42501', message = 'ORDER_ACCESS_FORBIDDEN';
  end if;
  if p_status = v_order.status then return v_order.id; end if;

  if v_is_seller then
    if not (
      (v_order.status = 'new' and p_status in ('preparing', 'cancelled'))
      or (v_order.status = 'preparing' and p_status in ('ready', 'cancelled'))
      or (v_order.status = 'ready' and p_status in ('completed', 'cancelled'))
    ) then raise exception using errcode = '22023', message = 'ORDER_STATUS_TRANSITION_INVALID'; end if;
  elsif not (v_order.status = 'new' and p_status = 'cancelled') then
    raise exception using errcode = '42501', message = 'ORDER_STATUS_SELLER_REQUIRED';
  end if;

  if p_status = 'cancelled' then
    update public.products product
    set stock_quantity = product.stock_quantity + item.quantity,
        status = case when product.status = 'sold' then 'active' else product.status end
    from public.order_items item
    where item.order_id = v_order.id and item.product_id = product.id;
  end if;

  update public.orders set status = p_status where id = v_order.id;
  return v_order.id;
end;
$$;

revoke all on function public.create_marketplace_order(uuid, jsonb, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.transition_marketplace_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_marketplace_order(uuid, jsonb, text, uuid, text, text) to service_role;
grant execute on function public.transition_marketplace_order(uuid, uuid, text) to service_role;
grant select on public.orders, public.order_items to service_role;
