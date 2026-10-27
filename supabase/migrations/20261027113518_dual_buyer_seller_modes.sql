-- The stored role retains seller capability; active_role selects the workspace.
-- NULL preserves the original mode for existing accounts and signup defaults.
alter table public.profiles add column active_role text
  constraint profiles_active_role_valid check (active_role in ('buyer', 'seller'));
alter table public.profiles add constraint profiles_seller_mode_requires_capability
  check (active_role is distinct from 'seller' or role = 'seller');
alter table public.profiles drop constraint profiles_buyer_is_student;
alter table public.profiles alter column is_student set default false;
comment on column public.profiles.active_role is 'Account-wide buyer/seller workspace preference; role retains seller capability.';
-- API-owned writes remain service-only, including the newly added column.
revoke update (active_role) on public.profiles from anon, authenticated;
grant update (active_role) on public.profiles to service_role;

create or replace function public.market_require_buyer(p_user uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from profiles where id=p_user and coalesce(active_role,role)='buyer')
 or exists(select 1 from admin_members where user_id=p_user) then
 raise exception using errcode='42501',message='BUYER_REQUIRED'; end if;
end $$;

-- Student status is supplied explicitly, independent of marketplace mode.
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
    coalesce(lower(new.raw_user_meta_data ->> 'isStudent') in ('true', '1'), false),
    nullif(trim(new.raw_user_meta_data ->> 'studentNumber'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- Saved alerts continue to reach dual-role accounts in either workspace.
create or replace function public.market_product_alerts() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_new boolean; v_drop boolean; v_category text;
begin
 v_new := tg_op='INSERT';
 if tg_op='UPDATE' then v_new := old.status <> 'active' and new.status='active'; end if;
 v_drop := false;
 if tg_op='UPDATE' then v_drop := new.price < old.price; end if;
 if new.status <> 'active' or not (v_new or v_drop) or not exists(select 1 from shops s where s.id=new.shop_id and s.is_open and public.sellable(s)) then return new; end if;
 select slug into v_category from categories where id=new.category_id;
 insert into notifications(user_id,type,title,body,href)
 select distinct p.id,'system',case when v_drop then 'A saved item dropped in price' else 'A new listing for you' end,
 new.title || ' · R' || new.price, '/products/' || new.slug
 from profiles p where not exists(select 1 from admin_members a where a.user_id=p.id) and (
 (v_drop and exists(select 1 from favourites f where f.user_id=p.id and f.product_id=new.id))
 or (v_new and exists(select 1 from shop_follows f where f.user_id=p.id and f.shop_id=new.shop_id))
 or (v_new and exists(select 1 from saved_searches s where s.user_id=p.id
   and (coalesce(s.filters->>'q','')='' or position(lower(s.filters->>'q') in lower(new.title||' '||coalesce(new.description,'')))>0)
   and (coalesce(s.filters->>'category','')='' or s.filters->>'category'=v_category)
   and (coalesce(s.filters->>'shop','')='' or exists(select 1 from shops sh where sh.id=new.shop_id and sh.slug=s.filters->>'shop'))
   and (coalesce(s.filters->>'condition','')='' or s.filters->>'condition'=new.condition)
   and (coalesce(s.filters->>'min_price','')='' or new.price >= (s.filters->>'min_price')::numeric)
   and (coalesce(s.filters->>'max_price','')='' or new.price <= (s.filters->>'max_price')::numeric)
   and (coalesce(s.filters->>'campus','')='' or (new.allows_campus_pickup and exists(select 1 from shop_pickup_areas pa where pa.shop_id=new.shop_id and pa.campus_id::text=s.filters->>'campus')))
   and (coalesce(s.filters->>'fulfilment','')='' or (s.filters->>'fulfilment'='delivery' and new.allows_delivery) or (s.filters->>'fulfilment'='campus_pickup' and new.allows_campus_pickup))
  ))
 );
 return new;
end $$;
