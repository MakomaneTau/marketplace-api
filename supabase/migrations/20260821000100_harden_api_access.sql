-- Grant the server-side API client only the privileges used by the current
-- product vertical and prevent authenticated clients from changing managed
-- profile state through the public Data API.

grant select on public.profiles, public.categories, public.shops
  to service_role;

grant select, insert, update, delete on public.products
  to service_role;

revoke update on public.profiles from authenticated;

grant update (
  first_name,
  last_name,
  display_name,
  phone,
  avatar_url,
  is_student,
  university_id,
  campus_id,
  student_number
) on public.profiles to authenticated;
