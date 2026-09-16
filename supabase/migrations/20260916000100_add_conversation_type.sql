alter table public.conversations
  add column if not exists conversation_type text not null default 'message_seller',
  add constraint conversations_type_check
    check (conversation_type in ('message_seller', 'delivery'));

