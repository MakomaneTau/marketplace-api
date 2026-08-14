insert into public.categories (name, slug, description, is_featured, sort_order)
values
  ('Textbooks', 'textbooks', 'Academic books, study guides and course materials.', true, 1),
  ('Laptops', 'laptops', 'Laptops, chargers, computer accessories and parts.', true, 2),
  ('Phones', 'phones', 'Smartphones, phone cases, chargers and accessories.', true, 3),
  ('Calculators', 'calculators', 'Scientific, financial and graphing calculators.', true, 4),
  ('Furniture', 'furniture', 'Desks, chairs, shelves and residence furniture.', false, 5),
  ('Clothing', 'clothing', 'Everyday clothing, formal wear, shoes and accessories.', true, 6),
  ('Gaming', 'gaming', 'Consoles, games, controllers and gaming accessories.', false, 7),
  ('Audio', 'audio', 'Headphones, speakers, microphones and audio equipment.', true, 8),
  ('Sports', 'sports', 'Sportswear, gym equipment and sporting accessories.', false, 9),
  ('Transport', 'transport', 'Bicycles, skateboards and student transport accessories.', false, 10),
  ('Kitchen', 'kitchen', 'Cookware, appliances and residence kitchen essentials.', false, 11),
  ('Other', 'other', 'Useful student items that do not fit another category.', false, 12)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order;

