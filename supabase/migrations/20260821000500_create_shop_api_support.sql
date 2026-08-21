-- One managed shop per seller, public marketplace imagery, and atomic pickup
-- area replacement for the trusted API.

create unique index shops_owner_id_unique on public.shops(owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-images',
  'marketplace-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, update, delete on public.shops, public.shop_pickup_areas
  to service_role;

create or replace function public.replace_shop_pickup_areas(
  p_shop_id uuid,
  p_owner_id uuid,
  p_campus_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.shops
    where id = p_shop_id and owner_id = p_owner_id
  ) then
    raise exception 'Shop ownership is required' using errcode = '42501';
  end if;

  delete from public.shop_pickup_areas where shop_id = p_shop_id;

  insert into public.shop_pickup_areas (shop_id, campus_id, sort_order)
  select p_shop_id, campus_id, ordinality - 1
  from unnest(p_campus_ids) with ordinality as selected(campus_id, ordinality);
end;
$$;

revoke all on function public.replace_shop_pickup_areas(uuid, uuid, uuid[]) from public;
grant execute on function public.replace_shop_pickup_areas(uuid, uuid, uuid[])
  to service_role;
