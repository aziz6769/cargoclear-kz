# Phase 4 — cloud infrastructure, authentication and multi-device sync

> **Status: implemented and tested against mocks/emulation only. It has NOT been tested against a real Supabase project.**
> No Supabase project is configured in this repository and no credentials exist in it. Follow `SUPABASE_SETUP.md`, then run the
> checklist in `SECURITY.md` before using real data. Nothing here claims the cloud features work end to end.

## Modes
| Mode | When | Data | UI marker |
|---|---|---|---|
| **Local-only** | `VITE_SUPABASE_*` not set | IndexedDB `cargoclear-kz` + demo seed, no sign-in — identical to Phase 3 | "This device only" |
| **Cloud** | configured and signed in | Supabase (source of truth) + per-user IndexedDB cache `cargoclear-cache-<userId>` (offline/read cache + outbox). Demo seed is **never** loaded or uploaded | sync badge: synchronised / syncing / *not synchronised: N* / offline / error / sign in again |
| **Guest demo** | configured, signed out, "Try the demo" | separate IndexedDB `cargoclear-kz-demo` with demo seed; never connected to the cloud | yellow "Demo" badge + banner |

## Architecture
```
UI (React) → core engine (packages/core, unchanged business rules)
          → repository createRepository(adapter, seed)
          → adapter: Dexie (local/demo)  |  createCloudAdapter (cloud)
                                              ├─ cache adapter (Dexie, per user)   ← reads
                                              ├─ persistent outbox (meta sync.outbox) ← writes: cache + queue
                                              └─ Supabase client (PostgREST + Storage)
```
- Reads come from the cache; every write is applied to the cache immediately and queued; a FIFO flush sends it (batched upserts in dependency order). A change is shown as **saved** only after the server accepted it; until then the badge and the toast say it is not synchronised.
- A rejected change (constraint/RLS) stays in the queue marked *failed*; nothing is dropped silently. Profile → Synchronisation: retry or discard. Network/auth errors keep the queue and retry later.
- Pull (on start, reconnect, tab focus, every 60 s, after flush) replaces cache records from the cloud but **keeps records with pending local changes** and removes records deleted elsewhere only if they have no pending change.
- Conflicts: last write wins per record.
- Business logic stays in `packages/core` (`buildAllViews` etc.); SQL holds no ranking/cost logic. Domain rules are preserved by tests: unknown price is stored as `NULL`, never `0`; incomplete offers are not ranked; differing endpoints are flagged; no currency mixing without a rate.

## What was added
- `supabase/migrations/*` — schema, RLS, private storage bucket (see `DATABASE_SCHEMA.md`).
- `packages/core/src/cloud/` — `cloudAdapter`, `mappers`, `migrate`, `ids` (UUID v4/v5), `files`, `testing/fakeSupabase`. `uid()` now returns UUIDv4.
- `apps/web`: `lib/supabase.js`, `AuthContext`, `Root` (mode switch), pages Login / Register / Forgot password / Reset password / Profile (name, company, language, password, sync panel), sync badge, account menu (initials, sign-out with pending-changes warning), documents (upload to private bucket, signed-URL download, size/type validation), **Import local data** page.
- RU/KK/EN strings for all new UI (`npm run check:i18n`).
- Settings: "Restore demo data" is hidden in cloud mode; "Delete all data" warns that it deletes cloud data too.

## Commands
```bash
npm ci
npm test            # core (node:test, incl. RLS on pglite + cloud adapter) then web (vitest)
npm run check:i18n
npm run build:web
```
Browser regression scripts (need Chrome): `apps/web/scripts/*.mjs` — they run in local-only mode.

## Test results (this environment)
See the delivery report. Real-Supabase verification: **pending** (`SECURITY.md`).

## Known limitations
See `SECURITY.md` (conflicts, unencrypted cache, `data jsonb` canonical, assistant history device-local) and:
- The Supabase JS client is bundled in all modes (~60 kB gzip extra even in local-only mode).
- E-mail confirmation/reset flows depend on Supabase URL/SMTP configuration that could not be exercised here.
- No automatic realtime push; other devices pick changes up within ≈ 60 s or on focus.
