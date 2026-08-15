insert into public.products (
  id,
  shop_id,
  category_id,
  title,
  description,
  condition,
  price,
  currency,
  stock_quantity,
  image_urls,
  pickup_location,
  allows_campus_pickup,
  allows_delivery,
  status
)
select
  product_seed.id,
  '20000000-0000-4000-8000-000000000001'::uuid,
  categories.id,
  product_seed.title,
  product_seed.description,
  product_seed.condition,
  product_seed.price,
  'ZAR',
  product_seed.stock_quantity,
  product_seed.image_urls,
  product_seed.pickup_location,
  true,
  false,
  product_seed.status
from (
  values
    (
      '30000000-0000-4000-8000-000000000001'::uuid,
      'textbooks',
      'Calculus Study Guide',
      'A clean calculus study guide with worked examples and practice exercises.',
      'good',
      250.00::numeric,
      1,
      array['https://images.unsplash.com/photo-1544947950-fa07a98d237f'],
      'Hatfield Campus library',
      'active'
    ),
    (
      '30000000-0000-4000-8000-000000000002'::uuid,
      'calculators',
      'Scientific Calculator',
      'A reliable scientific calculator saved as a draft for seller-only testing.',
      'like_new',
      180.00::numeric,
      1,
      array['https://images.unsplash.com/photo-1587145820266-a5951ee6f620'],
      'Hatfield Campus student centre',
      'draft'
    )
) as product_seed(
  id,
  category_slug,
  title,
  description,
  condition,
  price,
  stock_quantity,
  image_urls,
  pickup_location,
  status
)
join public.categories on categories.slug = product_seed.category_slug;
