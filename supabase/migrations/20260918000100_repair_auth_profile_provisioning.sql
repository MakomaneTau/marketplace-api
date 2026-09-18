-- Repair Auth -> profile provisioning and backfill any orphaned Auth users.
--
-- This migration is intentionally idempotent:
-- - the trigger function is replaced with the canonical implementation;
-- - the trigger is recreated in case it was removed or disabled;
-- - existing auth.users rows missing public.profiles are backfilled;
-- - existing profiles are never overwritten.

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
    case
      when new.raw_user_meta_data ->> 'role' = 'seller'
        then lower(new.raw_user_meta_data ->> 'isStudent') in ('true', '1')
      else true
    end,
    nullif(trim(new.raw_user_meta_data ->> 'studentNumber'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
select
  auth_user.id,
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'firstName'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'first_name'), ''),
    nullif(split_part(auth_user.email, '@', 1), ''),
    'Marketplace'
  ),
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'lastName'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'last_name'), ''),
    'User'
  ),
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
    nullif(
      trim(concat_ws(
        ' ',
        auth_user.raw_user_meta_data ->> 'firstName',
        auth_user.raw_user_meta_data ->> 'lastName'
      )),
      ''
    ),
    nullif(split_part(auth_user.email, '@', 1), ''),
    'Marketplace user'
  ),
  nullif(trim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
  case
    when auth_user.raw_user_meta_data ->> 'role' = 'seller' then 'seller'
    else 'buyer'
  end,
  case
    when auth_user.raw_user_meta_data ->> 'role' = 'seller'
      then lower(auth_user.raw_user_meta_data ->> 'isStudent') in ('true', '1')
    else true
  end,
  nullif(trim(auth_user.raw_user_meta_data ->> 'studentNumber'), '')
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where profile.id is null
on conflict (id) do nothing;

revoke all on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
