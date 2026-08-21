-- Read-only privileges used by the Express reference-data API.

grant select on public.universities, public.campuses
  to service_role;
