# Ingest harness ships as a portable, unscheduled script (API stays cloud-deployed)

**Status:** accepted (2026-06-06)

The read API deploys to cloud like the sibling (Cloud Run over BigQuery, custom domain). The **ingest
harness does not**: it ships as a **portable, idempotent, resumable orchestration script kept in the
repo**, with a clear entrypoint, and **no cron/scheduler is provisioned** — the operator hosts and
triggers it wherever they choose. Two operational requirements travel with it: a **liveness alert**
(a separate dead-man's-switch script that fires if no successful run has completed within a threshold,
pointed at an operator-chosen channel) and **per-run cost reporting** (LLM token spend + estimated £,
emitted every run).

**Why:** the harness has an LLM in the loop (ADR-0002), so its cost is variable and its runtime/
credentials are not yet decided by the operator; binding it to a specific cloud scheduler now would
be premature. Keeping orchestration as version-controlled code makes it portable and reviewable. There
is house precedent for a hand-run, non-cloud-scheduled ingest step (the sibling refreshes eTendersNI
from macOS rather than the cloud).

**Considered and rejected:** (a) Cloud Run Job + Cloud Scheduler mirroring the sibling's nightly —
cleanest ops, but presumes a runtime the operator has not chosen and hides cost; (b) a scheduled
Claude Code workflow — fine for dev-time backfills (the sibling uses one) but ties a production
pipeline to an interactive runtime/credentials.

**Consequences:** there is no automatic guarantee the index stays fresh — freshness depends on the
operator actually running the script, which is precisely why the liveness alert is mandatory; cost
visibility is built in rather than inferred from cloud billing.
