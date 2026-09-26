-- Seven days from profile creation to sell before identity approval is required.
-- The private helper can read profiles without exposing them to anonymous users.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create function private.seller_can_sell(p_seller_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_seller_id and p.role = 'seller'
      and (p.verification_status = 'verified' or now() < p.created_at + interval '7 days')
  );
$$;
revoke all on function private.seller_can_sell(uuid) from public;
grant execute on function private.seller_can_sell(uuid) to anon, authenticated, service_role;

-- Computed field so PostgREST can filter public shops and embedded products
-- before pagination, rather than filtering a page in application code.
create function public.sellable(public.shops)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.seller_can_sell(($1).owner_id);
$$;
revoke all on function public.sellable(public.shops) from public;
grant execute on function public.sellable(public.shops) to anon, authenticated, service_role;

drop policy "active shops are publicly readable" on public.shops;
create policy "active shops are publicly readable"
on public.shops for select to anon, authenticated
using ((is_open and private.seller_can_sell(owner_id)) or (select auth.uid()) = owner_id);

create function private.enforce_shop_approval()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.is_open and not private.seller_can_sell(new.owner_id) then
    raise exception using errcode = 'P0001', message = 'SELLER_APPROVAL_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_shop_approval() from public;
create trigger shops_require_seller_approval
before insert or update of is_open on public.shops
for each row execute function private.enforce_shop_approval();

create function private.enforce_listing_approval()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'active' and not exists (
    select 1 from public.shops s
    where s.id = new.shop_id and private.seller_can_sell(s.owner_id)
  ) then
    raise exception using errcode = 'P0001', message = 'SELLER_APPROVAL_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_listing_approval() from public;
create trigger products_require_seller_approval
before insert or update of status on public.products
for each row execute function private.enforce_listing_approval();

create function private.enforce_order_seller_approval()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.shops s
    where s.id = new.shop_id and private.seller_can_sell(s.owner_id)
  ) then
    raise exception using errcode = 'P0001', message = 'SELLER_APPROVAL_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_order_seller_approval() from public;
create trigger orders_require_seller_approval
before insert on public.orders
for each row execute function private.enforce_order_seller_approval();
