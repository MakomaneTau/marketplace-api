-- A suspended seller cannot regain selling access through the grace window.
create or replace function private.seller_can_sell(p_seller_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_seller_id and p.role = 'seller'
      and (p.verification_status = 'verified' or now() < p.created_at + interval '7 days')
      and not exists (
        select 1 from public.account_restrictions r where r.user_id = p.id
      )
  );
$$;
