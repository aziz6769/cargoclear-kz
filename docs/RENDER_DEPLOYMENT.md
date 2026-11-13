# Deploying to Render (static site)

CargoClear is a static Vite build; Supabase is the backend. Not yet deployed or verified from this environment.

1. Push the project to GitHub (manually, from the ZIP). Render → **New → Static Site** → select the repository.
2. Settings
   - **Build Command**: `npm ci && npm run build:web`
   - **Publish Directory**: `apps/web/dist`
   - **Node version**: 20 or newer (`NODE_VERSION=20` in environment if needed)
3. **Environment variables** (build-time, because Vite inlines them):
   - `VITE_SUPABASE_URL` = project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable (anon) key
   Never add `service_role`, DB password or any secret as a `VITE_*` variable. Changing a variable requires a **new build**.
4. **Redirects/Rewrites** (needed for React Router deep links and the password-reset link): add a rewrite `/*` → `/index.html` (action *Rewrite*).
5. In Supabase → Authentication → URL Configuration set *Site URL* to the Render URL and add `https://<render-url>/reset-password` and `/login` to *Redirect URLs*.
6. Optional headers (Render → Headers): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
7. Run the checklist in `SECURITY.md` against the deployed URL.

If the variables are missing at build time the site builds in **local-only mode** (no sign-in, data in the browser) — check the sign-in page appears after deploying.
