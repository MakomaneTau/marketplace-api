begin;
select plan(18);

select has_table('public', 'admin_members', 'admin membership table exists');
select ok(not has_table_privilege('authenticated', 'public.admin_members', 'select'), 'ordinary users cannot list admins');
select ok(not has_table_privilege('authenticated', 'public.account_restrictions', 'select'), 'ordinary users cannot list restrictions');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_events', 'select'), 'ordinary users cannot read audit records');
select ok(not has_function_privilege('authenticated', 'public.admin_set_account_restriction(uuid,uuid,boolean,text)', 'execute'), 'ordinary users cannot execute restriction RPC');
select ok(not has_function_privilege('authenticated', 'public.admin_decide_report(uuid,uuid,text,text)', 'execute'), 'ordinary users cannot execute report decision RPC');

insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-4333-8333-333333333331', 'moderator-test@example.com', '{"role":"buyer","firstName":"Moderator","lastName":"Test"}'::jsonb),
  ('33333333-3333-4333-8333-333333333332', 'reporter-test@example.com', '{"role":"buyer","firstName":"Reporter","lastName":"Test"}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'seller-test@example.com', '{"role":"seller","isStudent":false,"firstName":"Seller","lastName":"Test"}'::jsonb);

insert into public.admin_members(user_id) values ('33333333-3333-4333-8333-333333333331');
insert into public.shops(owner_id, name, slug, is_open) values
  ('33333333-3333-4333-8333-333333333333', 'Moderation test shop', 'moderation-test-shop', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333332', true);
select lives_ok(
  $$insert into public.safety_reports(reporter_id, subject_user_id, category, details)
    values ('33333333-3333-4333-8333-333333333332', '33333333-3333-4333-8333-333333333333', 'scam', 'A listing appeared to request payment off platform.')$$,
  'reporter can submit their own report'
);
select results_eq('select count(*)::bigint from public.safety_reports', array[1::bigint], 'reporter sees own report');
select throws_ok(
  $$insert into public.admin_members(user_id) values ('33333333-3333-4333-8333-333333333332')$$,
  '42501', null, 'reporter cannot self-promote to admin'
);
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select results_eq('select count(*)::bigint from public.safety_reports', array[0::bigint], 'report subject cannot see private report');

reset role;
set local role service_role;
select lives_ok(
  $$select public.admin_set_account_restriction('33333333-3333-4333-8333-333333333331', '33333333-3333-4333-8333-333333333333', true, 'Suspected unsafe marketplace conduct')$$,
  'admin can suspend seller'
);
select results_eq(
  $$select count(*)::bigint from public.shops where slug = 'moderation-test-shop' and not is_open$$,
  array[1::bigint], 'suspension closes seller shop'
);
select results_eq(
  $$select count(*)::bigint from public.admin_audit_events where action = 'user_suspended'$$,
  array[1::bigint], 'suspension records an audit event'
);
select throws_ok(
  $$select public.admin_set_account_restriction('33333333-3333-4333-8333-333333333332', '33333333-3333-4333-8333-333333333331', true, 'Attempted privilege escalation')$$,
  '42501', 'ADMIN_REQUIRED', 'service role alone does not make a non-admin actor authorized'
);
select throws_ok(
  $$select public.admin_set_account_restriction('33333333-3333-4333-8333-333333333331', '33333333-3333-4333-8333-333333333331', true, 'Attempted admin suspension')$$,
  '42501', 'ADMIN_TARGET_FORBIDDEN', 'admin cannot suspend another admin here'
);
select lives_ok(
  $$select public.admin_decide_report('33333333-3333-4333-8333-333333333331', id, 'resolved', 'Reviewed the listing and restricted the seller')
    from public.safety_reports where reporter_id = '33333333-3333-4333-8333-333333333332'$$,
  'admin can resolve an open report'
);
select results_eq(
  $$select count(*)::bigint from public.admin_audit_events where action = 'report_resolved'$$,
  array[1::bigint], 'report decision writes an audit event'
);
select results_eq(
  $$select count(*)::bigint from public.safety_reports where status = 'resolved' and handled_by = '33333333-3333-4333-8333-333333333331'$$,
  array[1::bigint], 'report decision records the acting admin'
);

select * from finish();
rollback;
