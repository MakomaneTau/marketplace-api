alter table public.products
  alter column description drop not null,
  alter column pickup_location drop not null;

alter table public.products
  drop constraint products_description_length,
  add constraint products_description_length check (
    description is null
    or length(trim(description)) between 20 and 2000
  ),
  drop constraint products_pickup_location_not_blank,
  add constraint products_pickup_location_not_blank check (
    pickup_location is null
    or length(trim(pickup_location)) > 0
  );
