-- Universities, campuses, and product categories.

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  acronym text not null,
  slug text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint universities_name_not_blank check (length(trim(name)) > 0),
  constraint universities_acronym_not_blank check (length(trim(acronym)) > 0),
  constraint universities_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint universities_name_unique unique (name),
  constraint universities_slug_unique unique (slug)
);

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  name text not null,
  address text,
  city text,
  province text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campuses_name_not_blank check (length(trim(name)) > 0),
  constraint campuses_university_name_unique unique (university_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text not null,
  is_featured boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint categories_description_not_blank check (length(trim(description)) > 0),
  constraint categories_sort_order_non_negative check (sort_order >= 0),
  constraint categories_name_unique unique (name),
  constraint categories_slug_unique unique (slug)
);

create index campuses_university_id_idx on public.campuses(university_id);

create trigger universities_set_updated_at
before update on public.universities
for each row execute function public.set_updated_at();

create trigger campuses_set_updated_at
before update on public.campuses
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

alter table public.universities enable row level security;
alter table public.campuses enable row level security;

alter table public.categories enable row level security;

create policy "universities are publicly readable"
on public.universities for select
to anon, authenticated
using (true);

create policy "campuses are publicly readable"
on public.campuses for select
to anon, authenticated
using (true);

create policy "categories are publicly readable"
on public.categories for select
to anon, authenticated
using (true);

grant select on public.universities, public.campuses, public.categories to anon, authenticated;

