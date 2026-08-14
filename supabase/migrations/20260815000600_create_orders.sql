-- Orders and immutable order-item snapshots.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  fulfilment_type text not null,
  pickup_campus_id uuid references public.campuses(id) on delete restrict,
  delivery_address text,
  status text not null default 'new',
  total_amount numeric(12, 2) not null,
  currency text not null default 'ZAR',
  pickup_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_non_negative check (total_amount >= 0),
  constraint orders_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint orders_fulfilment_type_valid
    check (fulfilment_type in ('campus_pickup', 'delivery')),
  constraint orders_fulfilment_details_valid check (
    (fulfilment_type = 'campus_pickup' and pickup_campus_id is not null and delivery_address is null)
    or
    (
      fulfilment_type = 'delivery'
      and pickup_campus_id is null
      and coalesce(length(trim(delivery_address)), 0) > 0
    )
  ),
  constraint orders_status_valid
    check (status in ('new', 'preparing', 'ready', 'completed', 'cancelled'))
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12, 2) not null,
  quantity integer not null,
  line_total numeric(12, 2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  constraint order_items_product_name_not_blank check (length(trim(product_name)) > 0),
  constraint order_items_unit_price_non_negative check (unit_price >= 0),
  constraint order_items_quantity_positive check (quantity > 0)
);

create index orders_buyer_id_created_at_idx on public.orders(buyer_id, created_at desc);
create index orders_shop_id_created_at_idx on public.orders(shop_id, created_at desc);
create index order_items_order_id_idx on public.order_items(order_id);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "buyers and shop owners can read orders"
on public.orders for select
to authenticated
using (
  buyer_id = (select auth.uid())
  or exists (
    select 1
    from public.shops
    where shops.id = orders.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

create policy "buyers can create their own orders"
on public.orders for insert
to authenticated
with check (buyer_id = (select auth.uid()));

create policy "shop owners can update orders"
on public.orders for update
to authenticated
using (
  exists (
    select 1
    from public.shops
    where shops.id = orders.shop_id
      and shops.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.shops
    where shops.id = orders.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

create policy "order participants can read order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    join public.shops on shops.id = orders.shop_id
    where orders.id = order_items.order_id
      and (
        orders.buyer_id = (select auth.uid())
        or shops.owner_id = (select auth.uid())
      )
  )
);

create policy "buyers can create items for their orders"
on public.order_items for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.buyer_id = (select auth.uid())
      and orders.status = 'new'
  )
);

grant select, insert, update on public.orders to authenticated;
grant select, insert on public.order_items to authenticated;

