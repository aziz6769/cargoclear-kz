# Moving local (IndexedDB) data to the cloud

Where: sign in → account menu → **Import local data** (`/migrate`). Cloud mode only.

## What happens
1. The tool reads the browser's legacy database (`cargoclear-kz`, the Phase 1–3 data) — read-only.
2. It builds a plan: **demo records are never uploaded** (`isDemo`). A demo record that a real record depends on is included as a dependency and reported. Offers that belong to no comparison are skipped and counted. Anything that would leave a dangling reference is a *blocker* and the import cannot start.
3. You must tick the confirmation box and press **Start import**.
4. Records are uploaded parents-first (carriers → shipments → comparisons → offers → documents → events) in batches; offers are then linked to their comparison; document files go to the private bucket.
5. **Verification**: every uploaded record (and file) is read back and compared. The report shows verified / failed / missing counts.
6. Only after a fully verified report does **Delete local copy** appear. It is a separate confirmation; the import itself never changes or deletes local data.

## IDs and retries
Local ids (`shp_…`) are mapped to UUIDs with a deterministic UUIDv5 of `userId|oldId`; the old id is kept as `legacyId`. Re-running after a failure or reload produces the same ids, and uploads are upserts, so **no duplicates** are created. Event payload references (`comparisonId`, `documentId`) are remapped too.

## Failure behaviour
A failed batch stops the run and is listed in the report with the table and error; parents already uploaded are kept, children of the failed batch are not half-written. Press **Retry import** to continue.

## Not covered
Assistant chat history and the assistant endpoint stay on the device. Documents larger than 3 MB or with unsupported types are rejected by the server and reported.
