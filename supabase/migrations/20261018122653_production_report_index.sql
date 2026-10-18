begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create index if not exists safety_reports_handled_by_idx
  on public.safety_reports(handled_by);
commit;
