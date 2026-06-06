# Separate codebase, shared GCP project, read the sibling's dataset

**Status:** accepted (2026-06-06)

govbuy is its own repo, codebase and hostname (`govbuy.run.cns.me/mcp`) but deploys into the **same
`govreposcrape` GCP project** as the sibling `find-tender-mcp`. govbuy ingests only the new
route-to-market layer (instruments, lots, appointed suppliers, routes, resellers) into its own
`govbuy_raw`/`govbuy_public` datasets. The read-only API service account is granted `dataViewer` on
**`govbuy_public` only** — **not** on the sibling's `uk_tenders_public`. Combined questions ("what was
actually called off under G-Cloud 14, and by whom?") are answered through a **harness-materialised
snapshot table** in `govbuy_public` (`sibling_call_off_awards`): the ingest SA builds it from
`uk_tenders_public` (projecting the **safe, non-PII** award columns + the §14 framework-reference keys
— RM-stem / relatedProcesses-OCID / call-off flag — and **dropping `parties[].contactPoint`**); the
API reads the snapshot, never the sibling. Materialising it (rather than a live authorised view) keeps
the same least-privilege boundary AND makes the per-query byte cap meaningful — the heavy `compiled_json`
parse happens once at ingest (~3 GB scan), so a 2 GiB cap both protects the public endpoint and lets
cross-dataset joins run cheaply (~single-digit MB). The "superset" is at the answer layer; the join
surface is curated; no public front door onto the sibling's PII.

**Why:** the sibling already holds ~677k tenders/awards behind five fragile portal adapters;
re-ingesting them would duplicate the hardest, most brittle data and double the maintenance. Reading
its query-serving dataset read-only gives the combined experience for free.

**Considered and rejected:** (a) a self-contained superset that re-ingests tenders/awards — duplicates
the sibling and contradicts the "different codebase" intent; (b) loose coupling via MCP only (compose
at the assistant level, no shared SQL) — loses server-side cross-dataset analytics like ranking
suppliers by call-off value.

**Consequences:** a cross-product schema dependency — the sibling's `uk_tenders_public` shape (notably
`compiled_process.awards[]`/`compiled_json`) becomes a consumed contract read by the materialise step;
a breaking change there breaks the snapshot refresh. The snapshot is as fresh as the last
`materialize-sibling` run (acceptable — the sibling refreshes nightly too). The supplier join is two-tier (Companies House CRN where present — only ~21% of
award lines — else govbuy's resolved publisher-id/name clusters), so combined answers depend on
govbuy's matcher running over the sibling side too. A deploy-time IAM assertion checks the API SA can
read only the two named public datasets, never any `*_raw`. Tolerable because both live in one project
under one owner.
