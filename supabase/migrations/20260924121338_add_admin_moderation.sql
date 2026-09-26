-- Admin access is provisioned explicitly by a database operator. Signup roles
-- remain buyer/seller and cannot grant moderation privileges.
create table public.admin_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.account_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null,
  suspended_at timestamptz not null default now(),
  suspended_by uuid not null references public.admin_members(user_id),
  constraint account_restrictions_reason_length check (length(trim(reason)) between 10 and 500)
);

create table public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  subject_user_id uuid references public.profiles(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  category text not null,
  details text not null,
  status text not null default 'open',
  resolution_note text,
  handled_by uuid references public.admin_members(user_id),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint safety_reports_category_valid check (category in ('scam', 'harassment', 'unsafe_listing', 'other')),
  constraint safety_reports_details_length check (length(trim(details)) between 20 and 2000),
  constraint safety_reports_status_valid check (status in ('open', 'resolved', 'dismissed')),
  constraint safety_reports_resolution_valid check (
    (status = 'open' and resolution_note is null and handled_by is null and handled_at is null)
    or (status <> 'open' and length(trim(resolution_note)) between 10 and 1000 and handled_by is not null and handled_at is not null)
  )
);

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.admin_members(user_id),
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_report_id uuid references public.safety_reports(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index safety_reports_status_created_idx on public.safety_reports(status, created_at desc);
create index safety_reports_reporter_created_idx on public.safety_reports(reporter_id, created_at desc);
create index safety_reports_subject_user_idx on public.safety_reports(subject_user_id) where subject_user_id is not null;
create index safety_reports_product_idx on public.safety_reports(product_id) where product_id is not null;
create index account_restrictions_suspended_by_idx on public.account_restrictions(suspended_by);
create index admin_audit_actor_created_idx on public.admin_audit_events(actor_id, created_at desc);
create index admin_audit_target_user_idx on public.admin_audit_events(target_user_id) where target_user_id is not null;
create index admin_audit_target_report_idx on public.admin_audit_events(target_report_id) where target_report_id is not null;

alter table public.admin_members enable row level security;
alter table public.account_restrictions enable row level security;
alter table public.safety_reports enable row level security;
alter table public.admin_audit_events enable row level security;

revoke all on public.admin_members, public.account_restrictions, public.safety_reports, public.admin_audit_events from anon, authenticated;
grant select, insert on public.safety_reports to authenticated;

create policy "reporters read their own reports"
on public.safety_reports for select to authenticated
using ((select auth.uid()) = reporter_id);

create policy "reporters submit their own reports"
on public.safety_reports for insert to authenticated
with check ((select auth.uid()) = reporter_id and status = 'open' and handled_by is null);

grant select, insert, update, delete on public.admin_members, public.account_restrictions, public.admin_audit_events to service_role;
grant select, insert, update on public.safety_reports to service_role;
grant select, update on public.profiles, public.seller_verifications to service_role;

-- These transactions keep each moderation decision and its audit event together.
create function public.admin_set_account_restriction(
  p_actor uuid, p_target uuid, p_suspend boolean, p_reason text
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.admin_members where user_id = p_actor) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception using errcode = 'P0002', message = 'USER_NOT_FOUND';
  end if;
  if exists (select 1 from public.admin_members where user_id = p_target) then
    raise exception using errcode = '42501', message = 'ADMIN_TARGET_FORBIDDEN';
  end if;
  if length(trim(p_reason)) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'REASON_INVALID';
  end if;

  if p_suspend then
    insert into public.account_restrictions(user_id, reason, suspended_by)
    values (p_target, trim(p_reason), p_actor)
    on conflict (user_id) do update
      set reason = excluded.reason, suspended_at = now(), suspended_by = excluded.suspended_by;
    -- Keep a suspended seller's active listings out of public browsing.
    -- Restoring account access does not reopen the shop automatically.
    update public.shops set is_open = false where owner_id = p_target;
  else
    delete from public.account_restrictions where user_id = p_target;
  end if;

  insert into public.admin_audit_events(actor_id, action, target_user_id, reason)
  values (p_actor, case when p_suspend then 'user_suspended' else 'user_restored' end, p_target, trim(p_reason));
end;
$$;

create function public.admin_decide_report(
  p_actor uuid, p_report uuid, p_status text, p_note text
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.admin_members where user_id = p_actor) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('resolved', 'dismissed') or length(trim(p_note)) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'REPORT_DECISION_INVALID';
  end if;

  update public.safety_reports
  set status = p_status, resolution_note = trim(p_note), handled_by = p_actor, handled_at = now()
  where id = p_report and status = 'open';
  if not found then
    raise exception using errcode = 'P0002', message = 'OPEN_REPORT_NOT_FOUND';
  end if;

  insert into public.admin_audit_events(actor_id, action, target_report_id, reason)
  values (p_actor, 'report_' || p_status, p_report, trim(p_note));
end;
$$;

create function public.admin_review_verification(
  p_actor uuid, p_verification uuid, p_status text, p_reason text
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_seller uuid;
begin
  if not exists (select 1 from public.admin_members where user_id = p_actor) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('verified', 'rejected') or
    (p_status = 'rejected' and length(trim(p_reason)) not between 10 and 500) then
    raise exception using errcode = '22023', message = 'VERIFICATION_DECISION_INVALID';
  end if;

  update public.seller_verifications
  set status = p_status,
      rejection_reason = case when p_status = 'rejected' then trim(p_reason) else null end,
      reviewed_at = now()
  where id = p_verification and status = 'pending'
  returning seller_id into v_seller;
  if not found then
    raise exception using errcode = 'P0002', message = 'PENDING_VERIFICATION_NOT_FOUND';
  end if;

  update public.profiles set verification_status = p_status where id = v_seller;
  insert into public.admin_audit_events(actor_id, action, target_user_id, reason)
  values (p_actor, 'verification_' || p_status, v_seller,
          case when p_status = 'rejected' then trim(p_reason) else 'Seller identity approved' end);
end;
$$;

revoke all on function public.admin_set_account_restriction(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_decide_report(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_review_verification(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_account_restriction(uuid, uuid, boolean, text) to service_role;
grant execute on function public.admin_decide_report(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_review_verification(uuid, uuid, text, text) to service_role;
