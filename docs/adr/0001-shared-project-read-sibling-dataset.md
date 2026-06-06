# Separate codebase, shared GCP project, read the sibling's dataset

**Status:** accepted (2026-06-06)

govbuy is its own repo, codebase and hostname (`govbuy.run.cns.me/mcp`) but deploys into the **same
`govreposcrape` GCP project** as the sibling `find-tender-mcp`. govbuy ingests only the new
route-to-market layer (instruments, lots, appointed suppliers, routes, resellers) into its own
`govbuy_raw`/`govbuy_public` datasets. The read-only API service account is granted `dataViewer` on
**`govbuy_public` only** — **not** on the sibling's `uk_tenders_public`. Combined questions ("what was
actually called off under G-Cloud 14, and by whom?") are answered through a single **authorized view**
in `govbuy_public` (`sibling_call_off_awards`) that projects the **safe, non-PII** award columns
(value, supplier identity) from `uk_tenders_public` and **drops `parties[].contactPoint`**. (A
framework-reference column is deferred until the PRD §14 verification pins which OCDS field carries
it — the instrument↔award join key is not yet a settled contract.) Because the view is authorized on the sibling dataset, it reads it without
the API SA holding direct access — so the "superset" is at the answer layer, the join surface is
curated, and a second public front door onto the sibling's PII is avoided.

**Why:** the sibling already holds ~677k tenders/awards behind five fragile portal adapters;
re-ingesting them would duplicate the hardest, most brittle data and double the maintenance. Reading
its query-serving dataset read-only gives the combined experience for free.

**Considered and rejected:** (a) a self-contained superset that re-ingests tenders/awards — duplicates
the sibling and contradicts the "different codebase" intent; (b) loose coupling via MCP only (compose
at the assistant level, no shared SQL) — loses server-side cross-dataset analytics like ranking
suppliers by call-off value.

**Consequences:** a cross-product schema dependency — the sibling's `uk_tenders_public` shape (notably
`compiled_process.awards[]`) becomes a consumed contract via the authorized view; a breaking change
there breaks the view. The supplier join is two-tier (Companies House CRN where present — only ~21% of
award lines — else govbuy's resolved publisher-id/name clusters), so combined answers depend on
govbuy's matcher running over the sibling side too. A deploy-time IAM assertion checks the API SA can
read only the two named public datasets, never any `*_raw`. Tolerable because both live in one project
under one owner.
