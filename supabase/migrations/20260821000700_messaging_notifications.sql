-- Participant-scoped conversations, messages, and durable notifications.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversations_participants_distinct check (buyer_id <> seller_id),
  constraint conversations_buyer_product_unique unique (buyer_id, product_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_body_length check (length(trim(body)) between 1 and 2000)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_valid check (type in ('message', 'order', 'order_status', 'review', 'system')),
  constraint notifications_title_not_blank check (length(trim(title)) > 0),
  constraint notifications_body_not_blank check (length(trim(body)) > 0)
);

create index conversations_buyer_last_idx on public.conversations(buyer_id, last_message_at desc);
create index conversations_seller_last_idx on public.conversations(seller_id, last_message_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index messages_unread_idx on public.messages(conversation_id, read_at) where read_at is null;
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications(user_id, read_at) where read_at is null;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create policy "participants read conversations" on public.conversations for select to authenticated
using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));
create policy "participants read messages" on public.messages for select to authenticated
using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()))));
create policy "users read notifications" on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy "users update notifications" on public.notifications for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.start_marketplace_conversation(p_buyer_id uuid, p_product_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_shop_id uuid; v_seller_id uuid;
begin
  select p.shop_id, s.owner_id into v_shop_id, v_seller_id
  from public.products p join public.shops s on s.id = p.shop_id
  where p.id = p_product_id and p.status = 'active' and s.is_open;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
  if p_buyer_id = v_seller_id then raise exception using errcode = '22023', message = 'CONVERSATION_OWN_PRODUCT_FORBIDDEN'; end if;
  insert into public.conversations(product_id, shop_id, buyer_id, seller_id)
  values (p_product_id, v_shop_id, p_buyer_id, v_seller_id)
  on conflict (buyer_id, product_id) do update set product_id = excluded.product_id
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.send_marketplace_message(p_conversation_id uuid, p_sender_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_conversation public.conversations%rowtype; v_id uuid; v_recipient uuid;
begin
  select * into v_conversation from public.conversations where id = p_conversation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'CONVERSATION_NOT_FOUND'; end if;
  if p_sender_id not in (v_conversation.buyer_id, v_conversation.seller_id) then raise exception using errcode = '42501', message = 'CONVERSATION_ACCESS_FORBIDDEN'; end if;
  if coalesce(length(trim(p_body)), 0) not between 1 and 2000 then raise exception using errcode = '22023', message = 'MESSAGE_BODY_INVALID'; end if;
  v_recipient := case when p_sender_id = v_conversation.buyer_id then v_conversation.seller_id else v_conversation.buyer_id end;
  insert into public.messages(conversation_id, sender_id, body) values (p_conversation_id, p_sender_id, trim(p_body)) returning id into v_id;
  update public.conversations set last_message_at = now() where id = p_conversation_id;
  insert into public.notifications(user_id, type, title, body, href)
  values (v_recipient, 'message', 'New message', left(trim(p_body), 160), '/messages?conversation=' || p_conversation_id);
  return v_id;
end; $$;

revoke all on function public.start_marketplace_conversation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.send_marketplace_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.start_marketplace_conversation(uuid, uuid) to service_role;
grant execute on function public.send_marketplace_message(uuid, uuid, text) to service_role;
grant select, insert, update on public.conversations, public.messages, public.notifications to service_role;

create or replace function public.notify_marketplace_order_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_seller uuid;
begin
  select owner_id into v_seller from public.shops where id = new.shop_id;
  if tg_op = 'INSERT' then
    insert into public.notifications(user_id, type, title, body, href)
    values (v_seller, 'order', 'New order', 'A buyer placed a new order.', '/seller/orders');
  elsif new.status is distinct from old.status then
    insert into public.notifications(user_id, type, title, body, href)
    values (new.buyer_id, 'order_status', 'Order updated', 'Your order is now ' || new.status || '.', '/orders/' || new.id);
  end if;
  return new;
end; $$;
create trigger orders_create_notification after insert or update of status on public.orders
for each row execute function public.notify_marketplace_order_change();
