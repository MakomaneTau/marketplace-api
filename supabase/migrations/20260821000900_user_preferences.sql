create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notify_new_orders boolean not null default true, notify_new_messages boolean not null default true,
  notify_listing_updates boolean not null default true, notify_marketplace_tips boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger user_preferences_set_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
alter table public.user_preferences enable row level security;
create policy "users read preferences" on public.user_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy "users create preferences" on public.user_preferences for insert to authenticated with check(user_id=(select auth.uid()));
create policy "users update preferences" on public.user_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update on public.user_preferences to authenticated,service_role;
