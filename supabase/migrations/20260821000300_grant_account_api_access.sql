-- Profile access used by trusted account endpoints. Managed fields remain
-- protected from direct authenticated-client updates by the prior migration.

grant select, update on public.profiles to service_role;
