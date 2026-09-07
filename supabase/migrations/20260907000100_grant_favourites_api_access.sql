-- Trusted favourites endpoints scope every operation to the authenticated user.
-- Bypassing RLS does not grant the API role table privileges.
grant select, insert, delete on public.favourites to service_role;
