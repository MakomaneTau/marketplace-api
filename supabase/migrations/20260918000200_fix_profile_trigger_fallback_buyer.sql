-- Keep Auth -> profile provisioning valid for users without explicit role metadata.
--
-- Buyer is the safe/default marketplace role, and buyers must always satisfy
-- profiles_buyer_is_student. Sellers preserve their explicit isStudent metadata.

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

revoke all on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
