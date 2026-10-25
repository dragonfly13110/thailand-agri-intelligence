# M5: D1 numeric read side

Updated 25 October 2026.

- The existing records, series, and series-observation routes select D1 when the catalog is on D1; PostgreSQL remains available when it is the configured database.
- D1 reads require metadata visible to the catalog, an active numeric run, and a resource with `approved_public` plus `project_publication_approved=1`. Both `succeeded` and `partial` active runs are readable; partial runs return `meta.completeness=partial` with a coverage warning.
- Observation mapping parses D1 JSON `dimensions`, keeps null values and grid locations, and does not assign grid cells a province.
- `meta.sourceRetrievedAt` comes from `sync_runs.source_retrieved_at`; `meta.retrievedAt` remains the API response time.

Checks: `node --experimental-strip-types --test tests/d1-observation-mapping.test.ts` passed 2/2; `npm.cmd run typecheck` and scoped ESLint passed. A live D1 response and preview deployment were not checked in this lane.
