-- Restrict direct execution of the Auth -> profile provisioning function.
-- Supabase Auth receives its explicit execute grant in a later migration.
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
