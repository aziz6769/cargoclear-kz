# Security

## Model
- The browser holds only the project URL and the **publishable** key. Authorisation is enforced by PostgreSQL Row Level Security with `auth.uid()`, not by the front end.
- No `service_role` key, database password or other privileged secret exists in the repository or in any `VITE_*` variable. `.env*` is git-ignored; `.env.example` has empty values.
- `anon` has no table privileges. `authenticated` has CRUD on its own rows only; `UPDATE` policies use `WITH CHECK`, so `user_id` cannot be changed to another user.
- Cross-user references are blocked twice: RLS and composite foreign keys.
- Storage: private bucket, size/MIME limits at bucket level and in the client (`validateFileMeta`), object path must start with the caller's `auth.uid()`, signed URLs expire in 60 s.
- Password reset gives the same answer for known and unknown addresses (no account enumeration). Server error text is mapped to translated messages and never shown verbatim in auth forms.
- Expired/revoked sessions: the app returns to the login page with an explanation; unsynchronised changes stay in the per-user local cache and sync after re-login. Private routes are not rendered without a session.
- Duplicate submissions: forms disable the submit button while pending; the migration refuses a second start while running; writes are idempotent upserts by id.
- No secrets or personal data are logged. Unexpected errors go to `console.error` without request bodies.

## What has been tested, and what has NOT
| Layer | How | Proves |
|---|---|---|
| SQL schema, constraints, RLS policies, storage policies | `packages/core/test/rls.test.js` on **pglite** (real PostgreSQL in WASM) with *stubbed* `auth`/`storage` schemas and roles | The SQL itself isolates users, rejects cross-user references and bad paths/sizes. |
| Cloud adapter, outbox, sync, migration | `packages/core/test/cloud.test.js` against a **fake** Supabase client | Our logic: ordering, offline queue, no silent loss, idempotent import, verification. |
| Auth UI, protected routes | `apps/web/src/__tests__` with the fake client | Our UI behaviour. |
| **Real Supabase** (JWT validation, PostgREST, Storage service, e-mail) | **Not tested.** | Nothing. Run the checklist below. |

The emulation cannot show that Supabase's JWT/PostgREST/Storage services behave as assumed (for example the exact `upsert`/`on conflict` semantics or `storage.foldername`). Treat the cloud features as **unverified until the checklist passes**.

## Real-Supabase verification checklist (do this with two test accounts)
Create users **A** and **B** (Authentication → Users, or via the app). Keep each user's access token (browser devtools → Application → Local Storage → `sb-…-auth-token`) and the project URL + anon key.

1. **Anonymous denied.** `curl "$URL/rest/v1/shipments?select=*" -H "apikey: $ANON"` → must return `401/403` or `[]`; never rows. Repeat for `carriers, comparisons, offers, documents, events, profiles`.
2. **Own rows.** As A, create a shipment in the app. As A via REST (`Authorization: Bearer $TOKEN_A`) `GET /rest/v1/shipments` → 1 row with `user_id` = A.
3. **Isolation read.** As B, `GET /rest/v1/shipments` → `[]`. `GET /rest/v1/shipments?id=eq.<A's id>` → `[]`.
4. **Isolation write.** As B, `PATCH /rest/v1/shipments?id=eq.<A's id>` with `{"data":{}}` → 0 rows changed (check as A that nothing changed). `DELETE …?id=eq.<A's id>` → 0 rows; A still has it.
5. **Forged owner.** As B, `POST /rest/v1/shipments` with `"user_id":"<A's id>"` → `403/42501`. Omitting `user_id` must store B's id.
6. **Cross-user parent.** As B, create a `comparisons` row with `shipment_id` = A's shipment → rejected (foreign key / RLS).
7. **Change owner.** As A, `PATCH` own shipment setting `user_id` to B's id → rejected.
8. **Profiles.** A can read/update only A's profile; `GET /rest/v1/profiles` as A returns exactly 1 row. `app_migrations` is not reachable via the API.
9. **Storage isolation.** As A upload `documents/<A id>/<doc id>/x.pdf` through the app. As B: list/download/delete that object → denied. As B upload to `<A id>/…` → denied. Upload a 4 MB file and a `.exe` → rejected. Confirm `GET /storage/v1/object/public/documents/…` → not found (bucket is private).
10. **Signed URL.** In the app download the document → works; the URL contains `/sign/` and stops working after ≈ 60 s.
11. **Multi-device.** Sign in as A in two browsers; edit in one, wait ≤ 60 s (or switch tabs) in the other → change appears; delete propagates; offline edit syncs after reconnect.
12. **Registration / reset e-mail.** Register a new user; confirm the e-mail; trigger "forgot password", open the link, set a new password, sign in with it. Check the redirect URLs in Authentication → URL Configuration if the link fails.
13. **Secrets.** `grep -R "service_role" apps/ packages/ dist` finds nothing; the built bundle contains only the URL and the publishable key.

Record the date and result of each step in the deployment notes. Do not claim the cloud features work until all 13 pass.

## Known limitations
- Conflict policy is **last write wins per record** (no field-level merge). Two devices editing the same record offline: the later push overwrites the earlier.
- `data jsonb` is canonical; direct SQL edits to typed columns are not reflected in the app.
- Local IndexedDB cache is not encrypted; anyone with access to the unlocked browser profile can read cached data of the signed-in account. Signing out keeps the per-user cache (so pending changes are not lost); clear site data on shared computers.
- Assistant chat history and the assistant endpoint setting stay device-local and are not synced.
- Supabase Free projects pause when inactive; the app then shows the offline/error state and keeps working from the cache.
