-- Stable, readable public product URLs while UUIDs remain the internal identity.

alter table public.products
add column slug text;

create or replace function public.build_product_public_slug(
  product_title text,
  product_id uuid
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select
    coalesce(
      nullif(
        trim(
          both '-' from regexp_replace(lower(product_title), '[^a-z0-9]+', '-', 'g')
        ),
        ''
      ),
      'product'
    ) || '-' || split_part(product_id::text, '-', 1);
$$;

update public.products
set slug = public.build_product_public_slug(title, id);

alter table public.products
alter column slug set not null;

alter table public.products
add constraint products_slug_format
check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$');

alter table public.products
add constraint products_slug_unique unique (slug);

create or replace function public.set_product_public_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.slug := public.build_product_public_slug(new.title, new.id);
  return new;
end;
$$;

create trigger products_set_public_slug
before insert on public.products
for each row execute function public.set_product_public_slug();
