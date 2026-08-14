-- Marketplace products and buyer favourites.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  title text not null,
  description text not null,
  condition text not null,
  price numeric(12, 2) not null,
  currency text not null default 'ZAR',
  stock_quantity integer not null default 0,
  image_urls text[] not null default '{}',
  pickup_location text not null,
  allows_campus_pickup boolean not null default true,
  allows_delivery boolean not null default false,
  view_count integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_title_not_blank check (length(trim(title)) between 5 and 100),
  constraint products_description_length check (length(trim(description)) between 20 and 2000),
  constraint products_condition_valid check (condition in ('new', 'like_new', 'good', 'fair')),
  constraint products_price_positive check (price > 0),
  constraint products_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint products_stock_non_negative check (stock_quantity >= 0),
  constraint products_image_count_valid check (cardinality(image_urls) <= 6),
  constraint products_active_listing_ready check (
    status <> 'active'
    or (stock_quantity > 0 and cardinality(image_urls) between 1 and 6)
  ),
  constraint products_pickup_location_not_blank check (length(trim(pickup_location)) > 0),
  constraint products_has_fulfilment_method check (allows_campus_pickup or allows_delivery),
  constraint products_view_count_non_negative check (view_count >= 0),
  constraint products_status_valid check (status in ('draft', 'active', 'sold', 'paused'))
);

create table public.favourites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index products_shop_id_idx on public.products(shop_id);
create index products_category_id_idx on public.products(category_id);
create index products_active_created_at_idx
  on public.products(created_at desc)
  where status = 'active';
create index favourites_product_id_idx on public.favourites(product_id);

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.favourites enable row level security;

create policy "active products are publicly readable"
on public.products for select
to anon, authenticated
using (
  (
    status = 'active'
    and exists (
      select 1
      from public.shops
      where shops.id = products.shop_id
        and shops.is_open
    )
  )
  or exists (
    select 1
    from public.shops
    where shops.id = products.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

create policy "shop owners can create products"
on public.products for insert
to authenticated
with check (
  exists (
    select 1
    from public.shops
    where shops.id = products.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

create policy "shop owners can update products"
on public.products for update
to authenticated
using (
  exists (
    select 1
    from public.shops
    where shops.id = products.shop_id
      and shops.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.shops
    where shops.id = products.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

create policy "shop owners can delete products"
on public.products for delete
to authenticated
using (
  exists (
    select 1
    from public.shops
    where shops.id = products.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

create policy "users can read their own favourites"
on public.favourites for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users can save products"
on public.favourites for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can remove their favourites"
on public.favourites for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, delete on public.favourites to authenticated;

