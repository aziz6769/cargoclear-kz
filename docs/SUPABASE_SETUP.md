# Supabase setup

Status: **written but not yet run against a real Supabase project.** The SQL was executed on PostgreSQL (pglite) with
emulated `auth`/`storage` schemas; see `SECURITY.md` for what that does and does not prove. Follow this guide once and then run
the checklist in `SECURITY.md` before trusting the deployment with real data.

## 1. Create the project
1. Create a project at supabase.com (PostgreSQL 15 or newer — the schema uses `ON DELETE SET NULL (column)`).
2. Save the database password in a password manager. It is never used by the app.

## 2. Apply the migrations (in order)
Open **SQL Editor** and run each file once, in this order, or use the Supabase CLI (`supabase link` + `supabase db push`):

1. `supabase/migrations/20261113000001_core_schema.sql` — tables, constraints, indexes, `handle_new_user()` trigger.
2. `supabase/migrations/20261113000002_rls.sql` — revokes all grants from `anon`, enables RLS and own-row policies.
3. `supabase/migrations/20261113000003_storage.sql` — private `documents` bucket and its `storage.objects` policies.

The files are idempotent where practical (`if not exists`, `drop policy if exists`). The table `public.app_migrations` records applied versions.

## 3. Authentication settings (Authentication → …)
- **Providers → Email**: enabled. Keep **Confirm email** on for production. With it on, registration shows "check your email"; with it off, the user is signed in immediately. Both paths are handled.
- **URL Configuration**
  - *Site URL*: your Render URL, e.g. `https://cargoclear-kz.onrender.com` (for local dev: `http://localhost:5173`).
  - *Redirect URLs*: add `https://<your-domain>/reset-password`, `https://<your-domain>/login`, and the `http://localhost:5173/...` equivalents.
  Without this the password-reset e-mail link is rejected by Supabase.
- **Password policy**: the app requires ≥ 8 characters; raise the minimum in Supabase if you want stricter rules.
- **SMTP**: the built-in mailer is rate-limited and meant for testing. Configure a custom SMTP provider before real users.

## 4. Get the two public values
**Project Settings → API**: copy the *Project URL* and the *publishable (anon)* key. Do **not** copy the `service_role` key anywhere in this project.

## 5. Local development
```bash
cp .env.example apps/web/.env.local     # then fill in the two values
npm ci
npm run dev:web                          # http://localhost:5173
```
Without the two variables the app runs in local-only mode (Phase 3 behaviour).

## 6. Verify
Run the real-Supabase security checklist in `SECURITY.md` with two test accounts. Do not store real customer data until it passes.
