-- =====================================================================
-- CivicPulse: DEMO DATA (20 issues)
-- Open the Supabase Dashboard > SQL Editor, paste this whole script
-- and click Run. It is a single statement.
--
-- AREA: all issues are placed around ONE centre point, set in the
-- "params" block below (default 28.6139, 77.2090, the same spot test.html
-- uses). Change those two numbers to move the whole demo elsewhere.
-- Issue positions are stored as metre offsets (north_m / east_m)
-- relative to that centre point.
--
-- Demo rows are identifiable by:
--   * ref_no  CP-<year>-90001 ... CP-<year>-90020
--   * every report description starting with "[Demo]"
-- Use cleanup_demo.sql to remove exactly these rows.
--
-- Running it twice is safe: if demo reports already exist, nothing is
-- inserted and all three counts at the end are 0.
--
-- Contents: 20 issues (5 streetlight, 5 bin, 4 road, 6 drain),
--   10 submitted / 6 under_review / 4 resolved,
--   3 clusters of 3 nearby issues (60-130 m apart, so they were NOT merged)
--   with affected_count 3 to 6, and 4 resolved issues that took
--   2.5, 6, 9.5 and 13.5 days to resolve.
-- Invariant kept throughout: affected_count = number of reports rows.
-- =====================================================================

with
params as (
  select 28.6139::float8 as center_lat,   -- <-- change to your area
         77.2090::float8 as center_lng    -- <-- change to your area
),

-- One row per demo issue.
-- n: 1-20 (becomes ref 90000+n)  | north_m / east_m: metres relative to the centre
-- age_days / age_hours: how long ago it was created
-- resolve_days: days between creation and the 'resolved' event (resolved rows only)
-- tpl_offset: which description template the first report uses (0-5)
spec (n, category, status, north_m, east_m, affected_count, age_days, age_hours, resolve_days, place, tpl_offset) as (
  values
    -- Cluster A: streetlights along a service road
    ( 1, 'streetlight', 'under_review',  450, -300, 6, 12,  5, null::numeric, 'near the bus stop on the service road', 0),
    ( 2, 'streetlight', 'submitted',     450, -230, 4,  9,  3, null,          'outside the community hall on the service road', 2),
    ( 3, 'streetlight', 'submitted',     510, -270, 3,  4,  8, null,          'by the tea stall at the corner', 4),
    -- Cluster B: blocked drains in a market lane
    ( 4, 'drain',       'submitted',    -400,  350, 5,  7,  2, null,          'near the market lane junction', 0),
    ( 5, 'drain',       'under_review', -340,  400, 4, 14,  6, null,          'outside the sweet shop in the market lane', 3),
    ( 6, 'drain',       'submitted',    -470,  420, 3,  2,  4, null,          'by the back gate of the market', 1),
    -- Cluster C: overflowing bins around a park
    ( 7, 'bin',         'submitted',     150,  700, 6, 10,  9, null,          'next to the park boundary wall', 1),
    ( 8, 'bin',         'submitted',     210,  740, 5,  6,  1, null,          'at the main entrance of the park', 3),
    ( 9, 'bin',         'under_review',  100,  760, 3, 16,  7, null,          'near the kids play area in the park', 5),
    -- Scattered open issues
    (10, 'road',        'submitted',    -150, -500, 2,  3, 10, null,          'near the school gate on the main road', 0),
    (11, 'road',        'under_review',  300,  120, 1,  8,  4, null,          'just before the flyover turn', 2),
    (12, 'road',        'submitted',    -650, -100, 1,  1,  6, null,          'outside the dispensary', 4),
    (13, 'streetlight', 'submitted',    -250,   40, 2,  5, 11, null,          'near the temple', 1),
    (14, 'bin',         'under_review', -100, -250, 2, 11,  2, null,          'outside the apartment society gate', 2),
    (15, 'drain',       'submitted',     600,  500, 1,  0,  3, null,          'near the bus stop', 5),
    (16, 'drain',       'under_review', -550,  700, 1, 18,  5, null,          'behind the old community centre', 4),
    -- Resolved issues (2 to 14 day resolution times)
    (17, 'streetlight', 'resolved',       80, -420, 2, 25,  6, 2.5,           'near the petrol pump', 3),
    (18, 'bin',         'resolved',     -380, -120, 1, 21,  3, 6,             'outside the vegetable market', 0),
    (19, 'road',        'resolved',      260, -650, 3, 27,  8, 9.5,           'near the post office', 1),
    (20, 'drain',       'resolved',     -200,  560, 2, 29, 10, 13.5,          'near the colony entrance', 2)
),

-- Resident-style descriptions: 6 per category, each with a %s for the place.
templates (category, idx, tpl) as (
  values
    ('streetlight', 0, '[Demo] The streetlight %s has been dead for over a week. It is pitch dark after 7 pm and I do not feel safe walking home.'),
    ('streetlight', 1, '[Demo] Light %s keeps flickering on and off all night. The whole stretch is dim.'),
    ('streetlight', 2, '[Demo] The road %s has no working light. Two-wheelers cannot see the potholes and there was a near miss yesterday.'),
    ('streetlight', 3, '[Demo] Same problem here, the pole %s is completely off. Women and kids avoid this road after dark now.'),
    ('streetlight', 4, '[Demo] Streetlight %s stays on during the day and goes off at night. Looks like the timer or wiring is faulty.'),
    ('streetlight', 5, '[Demo] Dark patch %s since last Tuesday. Tuition kids walk through here in the evening, please check this soon.'),

    ('bin', 0, '[Demo] The dustbin %s is overflowing and has not been cleared in days. Strays are scattering the garbage onto the road.'),
    ('bin', 1, '[Demo] Garbage piled up %s. The smell is unbearable, especially in the afternoon heat.'),
    ('bin', 2, '[Demo] The bin %s is broken and tilted. Waste keeps spilling out whenever it rains.'),
    ('bin', 3, '[Demo] Plastic and food waste dumped %s, flies everywhere. Shopkeepers nearby are also complaining.'),
    ('bin', 4, '[Demo] Open dumping continues %s. People throw bags out of passing vehicles at night.'),
    ('bin', 5, '[Demo] The bin %s has not been emptied since last weekend. It is blocking part of the footpath now.'),

    ('drain', 0, '[Demo] The drain %s is clogged and dirty water flows onto the road after even light rain.'),
    ('drain', 1, '[Demo] Open drain %s has no cover. A child nearly fell in last week.'),
    ('drain', 2, '[Demo] Waterlogging %s every time it rains. Water stays for two days and mosquitoes are breeding.'),
    ('drain', 3, '[Demo] Sewage smell and overflow %s. The drain looks blocked with plastic and silt.'),
    ('drain', 4, '[Demo] Drain cover missing %s. Someone put a branch there as a warning, but it is dangerous at night.'),
    ('drain', 5, '[Demo] Stagnant water %s since the last rain. Worried about dengue, please get this checked.'),

    ('road', 0, '[Demo] Big pothole %s. Bikes keep skidding and cars brake suddenly, causing jams.'),
    ('road', 1, '[Demo] Road surface is badly broken %s after the rains. Loose gravel everywhere.'),
    ('road', 2, '[Demo] Deep crater %s, filled with water so you cannot see it. An auto driver damaged his wheel here.'),
    ('road', 3, '[Demo] The patch work %s has come off already. The road is uneven and hard on elderly walkers.'),
    ('road', 4, '[Demo] Cracks and a sunken road %s, getting worse each week. It needs fixing before someone gets hurt.'),
    ('road', 5, '[Demo] Manhole edge sticking out %s on the road. Dangerous for two-wheelers, especially at night.')
),

new_issues as (
  insert into public.issues (ref_no, category, lat, lng, status, affected_count, created_at)
  select
    'CP-' || date_part('year', now())::int || '-' || lpad((90000 + s.n)::text, 5, '0'),
    s.category,
    p.center_lat + s.north_m / 111000.0,
    p.center_lng + s.east_m / (111000.0 * cos(radians(p.center_lat))),
    s.status,
    s.affected_count,
    now() - s.age_days * interval '1 day' - s.age_hours * interval '1 hour'
  from spec s
  cross join params p
  where not exists (
    select 1 from public.reports r where r.description like '[Demo]%'
  )
  returning id, ref_no, created_at, status
),

-- One report per affected resident, spread over the hours after the first report.
new_reports as (
  insert into public.reports (issue_id, description, photo_url, created_at)
  select
    ni.id,
    format(t.tpl, s.place),
    null::text,
    ni.created_at + (g.j - 1) * interval '9 hours'
  from new_issues ni
  join spec s on s.n = right(ni.ref_no, 5)::int - 90000
  cross join lateral generate_series(1, s.affected_count) as g(j)
  join templates t
    on t.category = s.category
   and t.idx = (s.tpl_offset + g.j - 1) % 6
  returning id
),

new_events as (
  insert into public.status_events (issue_id, status, note, created_at)
  select ni.id, 'submitted',
         'Report received ' || 'from' || ' a community member.',
         ni.created_at + interval '1 minute'
  from new_issues ni
  union all
  select ni.id, 'under_review', '[Demo] Community moderators are reviewing this report.',
         ni.created_at + interval '1 day 3 hours'
  from new_issues ni
  where ni.status in ('under_review', 'resolved')
  union all
  select ni.id, 'resolved', '[Demo] Marked resolved after residents confirmed the problem was fixed.',
         ni.created_at + s.resolve_days::float8 * interval '1 day'
  from new_issues ni
  join spec s on s.n = right(ni.ref_no, 5)::int - 90000
  where ni.status = 'resolved'
  returning id
)

select
  (select count(*) from new_issues)  as issues_inserted,   -- expect 20
  (select count(*) from new_reports) as reports_inserted,  -- expect 57
  (select count(*) from new_events)  as events_inserted;   -- expect 34
