# Krish Baby

A private, installable baby-care tracker for feeding, sleep, diaper changes, and other care moments. It is a static web app, so GitHub Pages hosts the interface; Supabase Auth and Postgres store each signed-in account's profile and logs.

Use the overview date controls to browse daily totals for today or any earlier date.

Sleep logs can be saved as soon as a baby falls asleep; edit the entry after wake-up to add the end time and calculate the nap duration.

In Recent activity, choose **Edit** or **Delete** to reveal per-entry actions. Individual deletes and **Clear all** require an explicit yes/no confirmation.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The local Supabase settings are in `.env.local` (ignored by Git). `.env.production` contains only the Supabase project URL and **public publishable key** needed by the static app. A publishable key is not a secret; never put a `service_role` or secret key in this app or repository. Database row-level security is what protects private data.

## Initialize Supabase

1. In the Supabase dashboard for this project, open **SQL Editor**.
2. Run [`supabase/migrations/20261103000000_initial_schema.sql`](./supabase/migrations/20261103000000_initial_schema.sql), then [`supabase/migrations/20261103000001_custom_log_types.sql`](./supabase/migrations/20261103000001_custom_log_types.sql) and [`supabase/migrations/20261103000002_quick_log_order.sql`](./supabase/migrations/20261103000002_quick_log_order.sql). They create the baby profile and care-log tables, enable row-level security, and support profile-specific custom log options and dashboard ordering.
3. Under **Authentication → Providers**, enable Email/password sign-in. Email confirmation can remain enabled.
4. Under **Authentication → URL Configuration**, set the Site URL to `https://salaarkrish8055.github.io/babytracking/` and add these Redirect URLs:
   - `https://salaarkrish8055.github.io/babytracking/`
   - `http://localhost:5173/` (for local development)
5. Confirm the app's Supabase URL and public publishable key in `.env.production`. The same public key is embedded in the browser build; this is expected. Do not use a secret/service-role key.

Existing deployments should run both follow-up migrations in the SQL Editor before using the updated app.

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
