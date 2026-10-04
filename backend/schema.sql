-- =====================================================================
-- CivicPulse: Supabase setup script (hackathon MVP)
-- Paste into Supabase Dashboard > SQL Editor and click Run.
-- Safe to re-run: tables use IF NOT EXISTS, policies are dropped and recreated.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

create table if not exists public.issues (
  id             uuid primary key default gen_random_uuid(),
  ref_no         text unique not null,
  category       text not null,
  lat            float8 not null,
  lng            float8 not null,
  status         text not null default 'submitted',
  affected_count int  not null default 1,
  created_at     timestamptz not null default now(),
  constraint issues_category_check
    check (category in ('streetlight', 'bin', 'road', 'drain')),
  constraint issues_status_check
    check (status in ('submitted', 'under_review', 'resolved'))
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references public.issues(id) on delete cascade,
  description text,
  photo_url   text,
  created_at  timestamptz not null default now()
);

create table if not exists public.status_events (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references public.issues(id) on delete cascade,
  status      text not null,
  note        text,
  created_at  timestamptz not null default now(),
  constraint status_events_status_check
    check (status in ('submitted', 'under_review', 'resolved'))
);

-- ---------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------

create index if not exists issues_category_status_idx
  on public.issues (category, status);

create index if not exists reports_issue_id_idx
  on public.reports (issue_id);

-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- WARNING: THESE POLICIES ARE DEMO-ONLY AND NOT PRODUCTION SAFE.
-- They let anyone with the public anon key read and insert on every table,
-- and update any issue. Before a real launch, replace them with policies
-- tied to authenticated users or server-side functions, and restrict
-- status updates to moderators.
-- ---------------------------------------------------------------------

alter table public.issues        enable row level security;
alter table public.reports       enable row level security;
alter table public.status_events enable row level security;

-- issues: select, insert, update
drop policy if exists "demo_issues_select" on public.issues;
create policy "demo_issues_select" on public.issues
  for select to anon, authenticated using (true);

drop policy if exists "demo_issues_insert" on public.issues;
create policy "demo_issues_insert" on public.issues
  for insert to anon, authenticated with check (true);

drop policy if exists "demo_issues_update" on public.issues;
create policy "demo_issues_update" on public.issues
  for update to anon, authenticated using (true) with check (true);

-- reports: select, insert
drop policy if exists "demo_reports_select" on public.reports;
create policy "demo_reports_select" on public.reports
  for select to anon, authenticated using (true);

drop policy if exists "demo_reports_insert" on public.reports;
create policy "demo_reports_insert" on public.reports
  for insert to anon, authenticated with check (true);

-- status_events: select, insert
drop policy if exists "demo_status_events_select" on public.status_events;
create policy "demo_status_events_select" on public.status_events
  for select to anon, authenticated using (true);

drop policy if exists "demo_status_events_insert" on public.status_events;
create policy "demo_status_events_insert" on public.status_events
  for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------
-- 4. STORAGE BUCKET: report-photos (public read, public upload)
-- ---------------------------------------------------------------------
-- Also demo-only: anyone can upload files to this bucket.

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "demo_report_photos_read" on storage.objects;
create policy "demo_report_photos_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'report-photos');

drop policy if exists "demo_report_photos_upload" on storage.objects;
create policy "demo_report_photos_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'report-photos');
