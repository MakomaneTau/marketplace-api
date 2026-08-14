-- Seller shops and their supported campus pickup areas.

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  tagline text,
  description text,
  logo_url text,
  banner_url text,
  is_open boolean not null default false,
  rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  total_sales integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shops_name_not_blank check (length(trim(name)) > 0),
  constraint shops_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint shops_tagline_not_blank check (tagline is null or length(trim(tagline)) > 0),
  constraint shops_rating_valid check (rating between 0 and 5),
  constraint shops_review_count_non_negative check (review_count >= 0),
  constraint shops_total_sales_non_negative check (total_sales >= 0),
  constraint shops_slug_unique unique (slug)
);

create table public.shop_pickup_areas (
  shop_id uuid not null references public.shops(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (shop_id, campus_id),
  constraint shop_pickup_areas_sort_order_non_negative check (sort_order >= 0)
);

create index shops_owner_id_idx on public.shops(owner_id);
create index shop_pickup_areas_campus_id_idx on public.shop_pickup_areas(campus_id);

create trigger shops_set_updated_at
before update on public.shops
for each row execute function public.set_updated_at();

alter table public.shops enable row level security;
alter table public.shop_pickup_areas enable row level security;

create policy "active shops are publicly readable"
on public.shops for select
to anon, authenticated
using (is_open or (select auth.uid()) = owner_id);

create policy "users can create their own shops"
on public.shops for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.profiles
    where profiles.id = shops.owner_id
      and profiles.role = 'seller'
  )
);

create policy "owners can update their shops"
on public.shops for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "owners can delete their shops"
on public.shops for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy "pickup areas for open shops are publicly readable"
on public.shop_pickup_areas for select
to anon, authenticated
using (
  exists (
    select 1
    from public.shops
    where shops.id = shop_pickup_areas.shop_id
      and (shops.is_open or shops.owner_id = (select auth.uid()))
  )
);

create policy "shop owners can add pickup areas"
on public.shop_pickup_areas for insert
to authenticated
with check (
  exists (
    select 1
    from public.shops
    where shops.id = shop_pickup_areas.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

create policy "shop owners can update pickup areas"
on public.shop_pickup_areas for update
to authenticated
using (
  exists (
    select 1
    from public.shops
    where shops.id = shop_pickup_areas.shop_id
      and shops.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.shops
    where shops.id = shop_pickup_areas.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

create policy "shop owners can remove pickup areas"
on public.shop_pickup_areas for delete
to authenticated
using (
  exists (
    select 1
    from public.shops
    where shops.id = shop_pickup_areas.shop_id
      and shops.owner_id = (select auth.uid())
  )
);

grant select on public.shops, public.shop_pickup_areas to anon;
grant select, insert, update, delete
  on public.shops, public.shop_pickup_areas
  to authenticated;
