-- Persist dismissible, versioned onboarding preferences per account.

create table public.user_onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version smallint not null default 1,
  welcome_seen_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_onboarding_version_positive check (version > 0)
);

create trigger user_onboarding_set_updated_at
before update on public.user_onboarding
for each row execute function public.set_updated_at();

alter table public.user_onboarding enable row level security;

revoke all on table public.user_onboarding from anon, authenticated;
grant select, insert, update on table public.user_onboarding to authenticated;

create policy "users read their own onboarding"
on public.user_onboarding for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users create their own onboarding"
on public.user_onboarding for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update their own onboarding"
on public.user_onboarding for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
