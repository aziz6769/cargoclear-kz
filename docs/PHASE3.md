# Phase 3 — summary

- Data: Dexie schema v2 (`documents`, `events`), idempotent `repo.migrate()`, append-only event log (shipment history, carrier interactions).
- Shipments: search / status filter / sort (URL params), change history, linked documents.
- Documents: metadata + optional file (<= 3 MB, MIME allow-list) in IndexedDB. No content recognition.
- Carriers: routes, services, notes, interaction log, offer history. No reliability rating.
- Analytics: portfolio tab (filters: dates, route, carrier) + single-comparison tab. Unknown costs are counted, never priced.
- Dashboard: spend dynamics, contextual Assistant card.
- Assistant: explicit comparison selection; with several comparisons and no choice it asks instead of using the latest.
- Performance: lazy routes, manual chunks, charts isolated.

Browser scripts (from apps/web after `npm run build`): `node scripts/{e2e,jury-flow,assistant-flow,phase3-flow,responsive,dexie-migration}.mjs`.
