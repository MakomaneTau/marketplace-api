-- The onboarding API uses the service-role client for reads and preference upserts.
-- New tables are not automatically exposed to that role in this project.
grant select, insert, update on table public.user_onboarding to service_role;
