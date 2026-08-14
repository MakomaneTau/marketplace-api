-- Marketplace profiles and seller verification submissions.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  phone text,
  avatar_url text,
  role text not null default 'buyer',
  is_student boolean not null default true,
  university_id uuid references public.universities(id) on delete set null,
  campus_id uuid references public.campuses(id) on delete set null,
  student_number text,
  verification_status text not null default 'pending',
  rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint profiles_last_name_not_blank check (length(trim(last_name)) > 0),
  constraint profiles_display_name_not_blank check (length(trim(display_name)) > 0),
  constraint profiles_role_valid check (role in ('buyer', 'seller')),
  constraint profiles_buyer_is_student check (role <> 'buyer' or is_student),
  constraint profiles_student_number_not_blank
    check (student_number is null or length(trim(student_number)) > 0),
  constraint profiles_verification_status_valid
    check (verification_status in ('pending', 'verified', 'rejected')),
  constraint profiles_rating_valid check (rating between 0 and 5),
  constraint profiles_review_count_non_negative check (review_count >= 0)
);

create table public.seller_verifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  selfie_path text not null,
  identity_document_path text not null,
  status text not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_verifications_selfie_path_not_blank
    check (length(trim(selfie_path)) > 0),
  constraint seller_verifications_identity_document_path_not_blank
    check (length(trim(identity_document_path)) > 0),
  constraint seller_verifications_status_valid
    check (status in ('pending', 'verified', 'rejected')),
  constraint seller_verifications_rejection_reason_valid
    check (
      (status = 'rejected' and coalesce(length(trim(rejection_reason)), 0) > 0)
      or (status <> 'rejected' and rejection_reason is null)
    )
);

create index profiles_university_id_idx on public.profiles(university_id);
create index profiles_campus_id_idx on public.profiles(campus_id);
create index seller_verifications_seller_id_created_at_idx
  on public.seller_verifications(seller_id, created_at desc);
create unique index seller_verifications_one_pending_per_seller_idx
  on public.seller_verifications(seller_id)
  where status = 'pending';

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger seller_verifications_set_updated_at
before update on public.seller_verifications
for each row execute function public.set_updated_at();

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
      when new.raw_user_meta_data ->> 'role' = 'buyer' then true
      when lower(new.raw_user_meta_data ->> 'isStudent') in ('true', '1') then true
      else false
    end,
    nullif(trim(new.raw_user_meta_data ->> 'studentNumber'), '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.seller_verifications enable row level security;

create policy "users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "sellers can read their verification submissions"
on public.seller_verifications for select
to authenticated
using ((select auth.uid()) = seller_id);

create policy "sellers can submit verification documents"
on public.seller_verifications for insert
to authenticated
with check (
  (select auth.uid()) = seller_id
  and exists (
    select 1
    from public.profiles
    where profiles.id = seller_verifications.seller_id
      and profiles.role = 'seller'
  )
);

grant select, update on public.profiles to authenticated;
grant select, insert on public.seller_verifications to authenticated;

revoke all on function public.handle_new_user() from public;

