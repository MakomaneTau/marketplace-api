create extension if not exists pgcrypto with schema extensions;

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  acronym text not null,
  slug text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint universities_name_not_blank check (length(trim(name)) > 0),
  constraint universities_acronym_not_blank check (length(trim(acronym)) > 0),
  constraint universities_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint universities_name_unique unique (name),
  constraint universities_slug_unique unique (slug)
);

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  name text not null,
  address text,
  city text,
  province text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campuses_name_not_blank check (length(trim(name)) > 0),
  constraint campuses_university_name_unique unique (university_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  phone text,
  avatar_url text,
  role text not null default 'buyer',
  is_student boolean not null default true,
  university_id uuid references public.universities(id) on delete set null,
  campus_id uuid references public.campuses(id) on delete set null,
  student_number text,
  verification_status text not null default 'pending',
  rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint profiles_last_name_not_blank check (length(trim(last_name)) > 0),
  constraint profiles_display_name_not_blank check (length(trim(display_name)) > 0),
  constraint profiles_role_valid check (role in ('buyer', 'seller')),
  constraint profiles_buyer_is_student check (role <> 'buyer' or is_student),
  constraint profiles_student_number_not_blank
    check (student_number is null or length(trim(student_number)) > 0),
  constraint profiles_verification_status_valid
    check (verification_status in ('pending', 'verified', 'rejected')),
  constraint profiles_rating_valid check (rating between 0 and 5),
  constraint profiles_review_count_non_negative check (review_count >= 0)
);

create table public.seller_verifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  selfie_path text not null,
  identity_document_path text not null,
  status text not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_verifications_selfie_path_not_blank
    check (length(trim(selfie_path)) > 0),
  constraint seller_verifications_identity_document_path_not_blank
    check (length(trim(identity_document_path)) > 0),
  constraint seller_verifications_status_valid
    check (status in ('pending', 'verified', 'rejected')),
  constraint seller_verifications_rejection_reason_valid
    check (
      (status = 'rejected' and coalesce(length(trim(rejection_reason)), 0) > 0)
      or (status <> 'rejected' and rejection_reason is null)
    )
);

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

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text not null,
  is_featured boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint categories_description_not_blank check (length(trim(description)) > 0),
  constraint categories_sort_order_non_negative check (sort_order >= 0),
  constraint categories_name_unique unique (name),
  constraint categories_slug_unique unique (slug)
);

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

create index campuses_university_id_idx on public.campuses(university_id);
create index profiles_university_id_idx on public.profiles(university_id);
create index profiles_campus_id_idx on public.profiles(campus_id);
create index seller_verifications_seller_id_created_at_idx
  on public.seller_verifications(seller_id, created_at desc);
create unique index seller_verifications_one_pending_per_seller_idx
  on public.seller_verifications(seller_id)
  where status = 'pending';
create index shops_owner_id_idx on public.shops(owner_id);
create index shop_pickup_areas_campus_id_idx on public.shop_pickup_areas(campus_id);
create index products_shop_id_idx on public.products(shop_id);
create index products_category_id_idx on public.products(category_id);
create index products_active_created_at_idx
  on public.products(created_at desc)
  where status = 'active';
create index favourites_product_id_idx on public.favourites(product_id);
create index orders_buyer_id_created_at_idx on public.orders(buyer_id, created_at desc);
create index orders_shop_id_created_at_idx on public.orders(shop_id, created_at desc);
create index order_items_order_id_idx on public.order_items(order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger universities_set_updated_at
before update on public.universities
for each row execute function public.set_updated_at();

create trigger campuses_set_updated_at
before update on public.campuses
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger seller_verifications_set_updated_at
before update on public.seller_verifications
for each row execute function public.set_updated_at();

create trigger shops_set_updated_at
before update on public.shops
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    avatar_url,
    role,
    is_student,
    student_number
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'firstName'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Marketplace'
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'lastName'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
      'User'
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(
        trim(concat_ws(
          ' ',
          new.raw_user_meta_data ->> 'firstName',
          new.raw_user_meta_data ->> 'lastName'
        )),
        ''
      ),
      nullif(split_part(new.email, '@', 1), ''),
      'Marketplace user'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    case
      when new.raw_user_meta_data ->> 'role' = 'seller' then 'seller'
      else 'buyer'
    end,
    case
      when new.raw_user_meta_data ->> 'role' = 'buyer' then true
      when lower(new.raw_user_meta_data ->> 'isStudent') in ('true', '1') then true
      else false
    end,
    nullif(trim(new.raw_user_meta_data ->> 'studentNumber'), '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.universities enable row level security;
alter table public.campuses enable row level security;
alter table public.profiles enable row level security;
alter table public.seller_verifications enable row level security;
alter table public.shops enable row level security;
alter table public.shop_pickup_areas enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.favourites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "universities are publicly readable"
on public.universities for select
to anon, authenticated
using (true);

create policy "campuses are publicly readable"
on public.campuses for select
to anon, authenticated
using (true);

create policy "categories are publicly readable"
on public.categories for select
to anon, authenticated
using (true);

create policy "users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "sellers can read their verification submissions"
on public.seller_verifications for select
to authenticated
using ((select auth.uid()) = seller_id);

create policy "sellers can submit verification documents"
on public.seller_verifications for insert
to authenticated
with check (
  (select auth.uid()) = seller_id
  and exists (
    select 1
    from public.profiles
    where profiles.id = seller_verifications.seller_id
      and profiles.role = 'seller'
  )
);

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

grant select on public.universities, public.campuses, public.categories to anon, authenticated;
grant select on public.shops, public.shop_pickup_areas, public.products to anon;
grant select, insert, update, delete
  on public.shops, public.shop_pickup_areas, public.products
  to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.seller_verifications to authenticated;
grant select, insert, delete on public.favourites to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert on public.order_items to authenticated;

revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
