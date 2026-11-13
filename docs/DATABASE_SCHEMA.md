# Database schema

Versioned SQL lives in `supabase/migrations/`. Every user-owned table has `id uuid primary key`, `user_id uuid not null references auth.users on delete cascade`,
`created_at`, `updated_at` (trigger-maintained) and an index on `user_id`.

| Table | Purpose | Notable columns |
|---|---|---|
| `profiles` | One row per user, created by trigger on `auth.users` | `full_name`, `company_name`, `email`, `preferred_language` (ru/kk/en), `settings jsonb` (currency, FX rates; **no secrets**) |
| `carriers` | Carrier directory | `name`, `contact_person`, `phone`, `email`, `website`, `notes`, `data jsonb` |
| `shipments` | Cargo and route | `title`, `origin`, `destination`, `cargo_description`, `cargo_weight` (kg), `cargo_volume` (m³), `currency`, `status`, `data jsonb` |
| `comparisons` | A comparison of offers for one shipment | `shipment_id`, `name`, `data jsonb` (includes `offerIds`) |
| `offers` | Carrier offer | `shipment_id`, `carrier_id`, `comparison_id` (nullable), `base_price` **NULL = unknown, never 0**, `currency`, `cost_breakdown jsonb`, `delivery_endpoint`, `estimated_delivery` |
| `documents` | Document metadata | `shipment_id`/`offer_id`/`carrier_id` (`ON DELETE SET NULL`), `storage_path`, `file_name`, `file_type`, `file_size` (≤ 3 MB) |
| `events` | Append-only history | `shipment_id` (cascade), `entity_type`, `entity_id`, `event_type`, `description`, `metadata jsonb`, `created_at` |
| `app_migrations` | Applied migration versions | RLS on, no policies (not reachable from the API) |

## Design decisions
- **Typed columns + `data jsonb`.** The full domain record is stored in `data` (canonical, used to rebuild the record on any device); typed columns are a queryable projection. No domain-engine field is dropped. Consequence: editing a typed column directly in SQL does not change what the app shows — always change data through the app.
- **Composite foreign keys** `(parent_id, user_id) → parent(id, user_id)` make it impossible, at database level, for a row to reference another user's parent row, independently of RLS.
- **Deletes**: carriers with offers and shipments with comparisons/offers are `RESTRICT` (the app shows "in use"); events cascade with their shipment; document links are nulled.
- **Offers and comparisons** reference each other: offers are saved first (nullable `comparison_id`), then linked after the comparison is upserted.
- **IDs** are UUIDv4 generated in the browser (`uid()`); migrated legacy ids are mapped with a deterministic UUIDv5 so retries do not duplicate (see `LOCAL_DATA_MIGRATION.md`).
- **Business logic is not in SQL.** Ranking, completeness and cost totals stay in `packages/core`; the database stores inputs and validates shape/ownership only.

## Storage
Private bucket `documents` (3 MB limit, MIME allow-list: PDF, PNG, JPEG, DOCX, XLSX, TXT). Object path `<user_id>/<document_id>/<safe file name>`; policies require the first folder to equal `auth.uid()`. Downloads use signed URLs valid for 60 seconds; there are no public URLs.
