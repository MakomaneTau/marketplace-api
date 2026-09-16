-- Remove inherited privileges that bypass RLS and enforce relationships that
-- span more than one table. Application writes continue through the trusted
-- Express API and its service-role functions.

revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables
  from anon, authenticated, service_role;

revoke all on function public.notify_marketplace_order_change()
  from public, anon, authenticated;
revoke all on function public.set_product_public_slug()
  from public, anon, authenticated;

-- Foreign-key indexes keep deletes and relationship lookups predictable as
-- the catalogue grows.
create index orders_pickup_campus_id_idx
  on public.orders(pickup_campus_id)
  where pickup_campus_id is not null;
create index order_items_product_id_idx
  on public.order_items(product_id)
  where product_id is not null;
create index conversations_shop_id_idx on public.conversations(shop_id);
create index messages_sender_id_idx on public.messages(sender_id);
create index reviews_reviewer_id_idx on public.reviews(reviewer_id);

-- The unique owner index added later supersedes the original non-unique one.
drop index public.shops_owner_id_idx;

create or replace function public.validate_profile_campus()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.campus_id is not null and not exists (
    select 1
    from public.campuses
    where id = new.campus_id
      and university_id = new.university_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'PROFILE_CAMPUS_UNIVERSITY_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_campus
before insert or update of university_id, campus_id on public.profiles
for each row execute function public.validate_profile_campus();

create or replace function public.validate_shop_owner_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.owner_id and role = 'seller'
  ) then
    raise exception using errcode = '23514', message = 'SHOP_OWNER_MUST_BE_SELLER';
  end if;
  return new;
end;
$$;

create trigger shops_validate_owner_role
before insert or update of owner_id on public.shops
for each row execute function public.validate_shop_owner_role();

create or replace function public.validate_conversation_relationships()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_seller_id uuid;
begin
  select product.shop_id, shop.owner_id
  into v_shop_id, v_seller_id
  from public.products product
  join public.shops shop on shop.id = product.shop_id
  where product.id = new.product_id;

  if not found
     or new.shop_id <> v_shop_id
     or new.seller_id <> v_seller_id
     or new.buyer_id = new.seller_id then
    raise exception using errcode = '23514', message = 'CONVERSATION_RELATIONSHIP_INVALID';
  end if;
  return new;
end;
$$;

create trigger conversations_validate_relationships
before insert or update of product_id, shop_id, buyer_id, seller_id
on public.conversations
for each row execute function public.validate_conversation_relationships();

create or replace function public.validate_message_sender()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.conversations
    where id = new.conversation_id
      and new.sender_id in (buyer_id, seller_id)
  ) then
    raise exception using errcode = '23514', message = 'MESSAGE_SENDER_NOT_PARTICIPANT';
  end if;
  return new;
end;
$$;

create trigger messages_validate_sender
before insert or update of conversation_id, sender_id on public.messages
for each row execute function public.validate_message_sender();

create or replace function public.validate_order_item_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.product_id is not null and not exists (
    select 1
    from public.orders marketplace_order
    join public.products product on product.id = new.product_id
    where marketplace_order.id = new.order_id
      and marketplace_order.shop_id = product.shop_id
  ) then
    raise exception using errcode = '23514', message = 'ORDER_ITEM_SHOP_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger order_items_validate_product
before insert or update of order_id, product_id on public.order_items
for each row execute function public.validate_order_item_product();

create or replace function public.validate_review_relationships()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.orders marketplace_order
    join public.order_items item
      on item.order_id = marketplace_order.id
     and item.product_id = new.product_id
    where marketplace_order.id = new.order_id
      and marketplace_order.shop_id = new.shop_id
      and marketplace_order.buyer_id = new.reviewer_id
      and marketplace_order.status = 'completed'
  ) then
    raise exception using errcode = '23514', message = 'REVIEW_RELATIONSHIP_INVALID';
  end if;
  return new;
end;
$$;

create trigger reviews_validate_relationships
before insert or update of order_id, product_id, shop_id, reviewer_id
on public.reviews
for each row execute function public.validate_review_relationships();

create or replace function public.validate_seller_verification_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.seller_id and role = 'seller'
  ) then
    raise exception using errcode = '23514', message = 'VERIFICATION_SELLER_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger seller_verifications_validate_owner
before insert or update of seller_id on public.seller_verifications
for each row execute function public.validate_seller_verification_owner();

alter table public.seller_verifications
add constraint seller_verifications_review_state_valid
check (
  (status = 'pending' and reviewed_at is null and rejection_reason is null)
  or (status = 'verified' and reviewed_at is not null and rejection_reason is null)
  or (
    status = 'rejected'
    and reviewed_at is not null
    and coalesce(length(trim(rejection_reason)), 0) > 0
  )
);

revoke all on function public.validate_profile_campus() from public;
revoke all on function public.validate_shop_owner_role() from public;
revoke all on function public.validate_conversation_relationships() from public;
revoke all on function public.validate_message_sender() from public;
revoke all on function public.validate_order_item_product() from public;
revoke all on function public.validate_review_relationships() from public;
revoke all on function public.validate_seller_verification_owner() from public;

-- Respect message-notification preferences and send sellers to their actual
-- messaging route.
create or replace function public.send_marketplace_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation public.conversations%rowtype;
  v_id uuid;
  v_recipient uuid;
  v_href text;
begin
  select * into v_conversation
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CONVERSATION_NOT_FOUND';
  end if;
  if p_sender_id not in (v_conversation.buyer_id, v_conversation.seller_id) then
    raise exception using errcode = '42501', message = 'CONVERSATION_ACCESS_FORBIDDEN';
  end if;
  if coalesce(length(trim(p_body)), 0) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'MESSAGE_BODY_INVALID';
  end if;

  v_recipient := case
    when p_sender_id = v_conversation.buyer_id then v_conversation.seller_id
    else v_conversation.buyer_id
  end;
  v_href := case
    when v_recipient = v_conversation.seller_id then '/seller/messages?conversation='
    else '/messages?conversation='
  end || p_conversation_id;

  insert into public.messages(conversation_id, sender_id, body)
  values (p_conversation_id, p_sender_id, trim(p_body))
  returning id into v_id;

  update public.conversations
  set last_message_at = now()
  where id = p_conversation_id;

  if coalesce((
    select notify_new_messages
    from public.user_preferences
    where user_id = v_recipient
  ), true) then
    insert into public.notifications(user_id, type, title, body, href)
    values (
      v_recipient,
      'message',
      'New message',
      left(trim(p_body), 160),
      v_href
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.send_marketplace_message(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.send_marketplace_message(uuid, uuid, text)
  to service_role;

-- Order-detail routes do not exist in the web app, so order notifications
-- point to the supported buyer orders screen. Seller preferences suppress
-- new-order notifications when requested.
create or replace function public.notify_marketplace_order_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seller uuid;
begin
  select owner_id into v_seller
  from public.shops
  where id = new.shop_id;

  if tg_op = 'INSERT' then
    if coalesce((
      select notify_new_orders
      from public.user_preferences
      where user_id = v_seller
    ), true) then
      insert into public.notifications(user_id, type, title, body, href)
      values (v_seller, 'order', 'New order', 'A buyer placed a new order.', '/seller/orders');
    end if;
  elsif new.status is distinct from old.status then
    insert into public.notifications(user_id, type, title, body, href)
    values (
      new.buyer_id,
      'order_status',
      'Order updated',
      'Your order is now ' || new.status || '.',
      '/orders'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_marketplace_order_change()
  from public, anon, authenticated;
