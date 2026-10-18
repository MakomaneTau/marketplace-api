begin;
set local lock_timeout = '5s';
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.security_rate_limits (
  bucket text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
alter table private.security_rate_limits enable row level security;
create index if not exists security_rate_limits_expiry_idx
  on private.security_rate_limits(expires_at);

-- A single atomic upsert coordinates all API instances. No user identifiers
-- are persisted: callers submit a SHA-256 digest and a fixed policy namespace.
create or replace function public.consume_security_limit(p_bucket text, p_window_ms integer, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_row private.security_rate_limits%rowtype; now_at timestamptz := clock_timestamp();
begin
  if length(p_bucket) not between 1 and 160 or p_window_ms not between 1000 and 3600000
    or p_limit not between 1 and 100000 then
    raise exception 'Invalid rate limit policy';
  end if;
  -- Bounded cleanup, safe under concurrent callers; no full-table lock/sweep.
  delete from private.security_rate_limits where bucket in (
    select bucket from private.security_rate_limits where expires_at < now_at
    order by expires_at limit 100 for update skip locked
  );
  insert into private.security_rate_limits as limits(bucket,hits,expires_at)
  values(p_bucket,1,now_at + p_window_ms * interval '1 millisecond')
  on conflict(bucket) do update set
    hits = case when limits.expires_at <= now_at then 1 else least(limits.hits + 1,p_limit + 1) end,
    expires_at = case when limits.expires_at <= now_at then excluded.expires_at else limits.expires_at end
  returning * into current_row;
  return jsonb_build_object('allowed',current_row.hits <= p_limit,
    'remaining',greatest(0,p_limit-current_row.hits),
    'retryAfter',greatest(1,ceil(extract(epoch from current_row.expires_at-now_at))));
end $$;
revoke all on function public.consume_security_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_security_limit(text,integer,integer) to service_role;
commit;
