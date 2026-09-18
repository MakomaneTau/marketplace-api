-- Supabase Auth inserts auth.users rows as supabase_auth_admin.
-- The profile provisioning trigger must be executable by that role.
grant execute on function public.handle_new_user() to supabase_auth_admin;
