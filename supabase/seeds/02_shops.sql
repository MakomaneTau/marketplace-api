insert into public.shops (
  id,
  owner_id,
  name,
  slug,
  tagline,
  description,
  is_open
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Campus Essentials',
  'campus-essentials',
  'Useful products for student life',
  'A reusable local development shop owned by the seeded seller.',
  true
);

insert into public.shop_pickup_areas (shop_id, campus_id, sort_order)
select
  '20000000-0000-4000-8000-000000000001',
  campuses.id,
  0
from public.campuses
join public.universities on universities.id = campuses.university_id
where universities.slug = 'university-of-pretoria'
  and campuses.name = 'Hatfield Campus';
