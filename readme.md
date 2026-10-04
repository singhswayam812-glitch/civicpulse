# 📍 CivicPulse

**Evidence-based local issue tracking for communities.**

🔗 **Live demo:** https://civicpulse-wcc.netlify.app/
💻 **Source code:** https://github.com/singhswayam812-glitch/civicpulse

> CivicPulse is a community tool. It is not affiliated with any government body, and submitting a report does not mean it has reached a government department.

## The problem

Everyday local issues such as overflowing bins, broken streetlights, potholes and water leaks are usually reported through scattered channels: phone calls, social media posts and word of mouth. Reports rarely come with proof, nobody can see whether the same problem has already been reported, and residents have no way to follow what happened next. As a result, one problem is reported many times in different places, while the real number of people affected stays invisible.

## Our solution

CivicPulse gives every local issue a single, trackable, evidence-backed record. Residents report an issue with a photo, location and category, and receive a reference number. The community can see all issues on a map, follow each case's status history, and back existing reports instead of filing duplicates. An impact dashboard shows how many issues and residents are affected, so problems are measured, not guessed.

## Features

- **Report with evidence:** photo, map location and category for every issue
- **Reference number:** each report gets a unique ID (for example `CP-2026-90009`) for tracking
- **Status history:** every case shows its full timeline from submission to resolution
- **Duplicate detector:** flags similar nearby reports so residents can support an existing issue
- **Impact dashboard:** total issues, residents affected, open vs resolved, and category breakdown
- **Map and list views:** browse, search and filter all issues
- **Honest labeling:** unverified submissions are clearly marked, and the app never claims a report reached a government department

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Database and file storage | Supabase (Postgres and Storage) |
| Map | Leaflet with OpenStreetMap |
| Hosting | Netlify |

## Project structure

```
backend/
  schema.sql        database tables and policies
  demo_data.sql     sample data for the demo
frontend/
  index.html        issues list and map
  report.html       report an issue
  issue.html        single case page
  dashboard.html    impact dashboard
  css/              styles
  js/               page scripts, API and config
netlify.toml        tells Netlify to publish the frontend folder
```

## Run it locally

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase SQL Editor, run `backend/schema.sql`, then `backend/demo_data.sql` (optional sample data).
3. Create a public Storage bucket for report photos, using the bucket name the code expects.
4. Open `frontend/js/config.js` and paste your Supabase Project URL and **anon (public) key**. Never put the `service_role` key in the frontend.
5. Open the `frontend` folder in VS Code and start it with the Live Server extension (Go Live).

## Security notes

- Only the public anon key is used in the browser.
- Row Level Security controls what the public can read and insert.
- Photos are stored in Supabase Storage.
## Team

| Member | Role |
| --- | --- |
| Unnati Bajpai | Frontend |
| Swayam Singh | Backend and database |


Built for **WCC Launchpad 30**.