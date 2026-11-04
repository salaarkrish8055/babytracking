# Krish Baby

A private, installable baby-care tracker for feeding, sleep, diaper changes, and other care moments. It is a static web app, so GitHub Pages hosts the interface; Supabase Auth and Postgres store each signed-in account's profile and logs.

Use **Today & activity** for the daily overview and the full activity timeline together. **Health records** is a separate page for vaccinations, appointments, test results, and follow-ups.

Use **Health records** to keep vaccination details and pediatrician, specialist, hospital, or lab visit records together. Use **+ Appointment** under Upcoming care to add a future visit with its date, time, provider, and facility. Add dose and lot details, results or care notes, and recommended next-dose or follow-up dates and times. Upcoming care shows the visit name, date, weekday, and time when provided. Deleting a health record soft-deletes it in Supabase by recording a deletion timestamp; it is hidden in the app but retained in the database. Upcoming dates are shown in the app; they are not push notifications or medical guidance.

The **Vaccination reference** guide is populated from [`vaccination-reference.json`](./vaccination-reference.json). It includes vaccine and combination-product details, products, schedule notes, and source links. This reference is not personalized medical advice; confirm the current schedule and a child's eligibility with their clinician. The app does not calculate vaccine eligibility or due dates from this dataset.

Use the overview date controls to browse daily totals for today or any earlier date.

Sleep logs can be saved as soon as a baby falls asleep; edit the entry after wake-up to add the end time and calculate the nap duration. Overnight sleep is split across calendar days in the overview totals, while Recent activity shows the full duration and the wake-up date when it differs from the asleep date.

In Recent activity, choose **Edit** or **Delete** to reveal per-entry actions. Individual deletes and **Clear all** require an explicit yes/no confirmation.

Use **Log activities** to select several categories, enter their details, and save them together with a shared time and note. The individual quick-log cards remain available.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The local Supabase settings are in `.env.local` (ignored by Git). `.env.production` contains only the Supabase project URL and **public publishable key** needed by the static app. A publishable key is not a secret; never put a `service_role` or secret key in this app or repository. Database row-level security is what protects private data.

## Initialize Supabase

1. In the Supabase dashboard for this project, open **SQL Editor**.
2. Run [`supabase/migrations/20261103000000_initial_schema.sql`](./supabase/migrations/20261103000000_initial_schema.sql), then [`supabase/migrations/20261103000001_custom_log_types.sql`](./supabase/migrations/20261103000001_custom_log_types.sql), [`supabase/migrations/20261103000002_quick_log_order.sql`](./supabase/migrations/20261103000002_quick_log_order.sql), [`supabase/migrations/20261103000003_health_records.sql`](./supabase/migrations/20261103000003_health_records.sql), [`supabase/migrations/20261103000004_health_record_times.sql`](./supabase/migrations/20261103000004_health_record_times.sql), [`supabase/migrations/20261103000005_health_record_soft_deletes.sql`](./supabase/migrations/20261103000005_health_record_soft_deletes.sql), [`supabase/migrations/20261103000006_breastfeeding_side_durations.sql`](./supabase/migrations/20261103000006_breastfeeding_side_durations.sql), and [`supabase/migrations/20261103000007_default_urine_stool_logs.sql`](./supabase/migrations/20261103000007_default_urine_stool_logs.sql). They create the baby profile, care-log, and private health-record tables, enable row-level security, support profile-specific custom log options and dashboard ordering, store appointment and care times, retain soft-deleted health records, track breastfeeding durations by side, and include default Urine and Stool quick logs.
3. Under **Authentication → Providers**, enable Email/password sign-in. Email confirmation can remain enabled.
4. Under **Authentication → URL Configuration**, set the Site URL to `https://salaarkrish8055.github.io/babytracking/` and add these Redirect URLs:
   - `https://salaarkrish8055.github.io/babytracking/`
   - `http://localhost:5173/` (for local development)
5. Confirm the app's Supabase URL and public publishable key in `.env.production`. The same public key is embedded in the browser build; this is expected. Do not use a secret/service-role key.

Existing deployments should run all follow-up migrations in the SQL Editor before using the updated app.

Each account gets a private baby profile. Caregivers who need access should use the same account for now; separate-account caregiver invitations are not enabled.

## Deploy to GitHub Pages

The workflow at [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) builds and deploys the `main` branch on every push, and can also be started manually.

1. In the repository's **Settings → Pages**, set the build/deployment source to **GitHub Actions**.
2. Push the app to `main` (or run **Deploy Krish Baby to GitHub Pages** from the **Actions** tab).
3. Open `https://salaarkrish8055.github.io/babytracking/`.

The Vite build uses the `/babytracking/` project-site path, and the PWA manifest and service worker are included in the deployment.

## Install on a phone

- **iPhone/iPad:** Open the deployed site in Safari, tap **Install app** (or Share), then choose **Add to Home Screen**.
- **Android:** Open the site in Chrome and tap **Install app**; if prompted, confirm **Install**.

The installed app caches its interface for fast loading. Sign-in, syncing, and saving logs require an internet connection.
