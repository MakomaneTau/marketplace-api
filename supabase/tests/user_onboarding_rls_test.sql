begin;
select plan(10);

select has_table('public', 'user_onboarding', 'user onboarding table exists');
select ok(not has_table_privilege('anon', 'public.user_onboarding', 'select'), 'anon cannot read onboarding state');
select ok(has_table_privilege('authenticated', 'public.user_onboarding', 'select'), 'authenticated users can read onboarding state');
select ok(has_table_privilege('authenticated', 'public.user_onboarding', 'insert'), 'authenticated users can create onboarding state');
select ok(has_table_privilege('authenticated', 'public.user_onboarding', 'update'), 'authenticated users can update onboarding state');
select ok(not has_table_privilege('authenticated', 'public.user_onboarding', 'delete'), 'authenticated users cannot delete onboarding state');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'onboarding-owner@example.com', '{"role":"buyer","firstName":"Owner","lastName":"Test"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'onboarding-other@example.com', '{"role":"buyer","firstName":"Other","lastName":"Test"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select lives_ok(
  $$insert into public.user_onboarding (user_id, welcome_seen_at)
    values ('11111111-1111-1111-1111-111111111111', now())$$,
  'a user can create their own onboarding state'
);

select results_eq(
  $$select count(*)::bigint from public.user_onboarding$$,
  array[1::bigint],
  'a user can read their own onboarding state'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select results_eq(
  $$select count(*)::bigint from public.user_onboarding$$,
  array[0::bigint],
  'another user cannot read onboarding state they do not own'
);

select results_eq(
  $$with changed as (
      update public.user_onboarding set dismissed_at = now()
      returning user_id
    )
    select count(*)::bigint from changed$$,
  array[0::bigint],
  'another user cannot update onboarding state they do not own'
);

select * from finish();
rollback;
