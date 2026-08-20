# Ingest harness runs on a nightly GitHub Actions schedule (supersedes ADR-0005)

**Status:** accepted (2026-08-20)

**Supersedes:** [ADR-0005](0005-portable-unscheduled-harness.md).

The harness stayed unscheduled from 2026-06-06. Freshness depended on an operator running it by
hand, and in practice no one did — the index went stale. `govbuy-ingest refresh` now runs on a
scheduled `.github/workflows/govbuy-refresh.yml` job, plus `workflow_dispatch` for an on-demand
run, at two cadences (03:00 UTC both times):

- **Nightly, Mon-Sat — deterministic-only** (`refresh --operator gca`): the GCA + G-Cloud spine,
  no LLM call, no Anthropic spend.
- **Weekly, Sunday — full run** (`refresh`): also walks the LLM-based agentic frontier
  (bramble_hub/bloom/ypo/nhs_sbs) via the Haiku extractor.

The split keeps the free deterministic spine fresh every day while capping LLM usage to once a
week, rather than paying the (small, ceiling-bounded) Anthropic cost on every run. `workflow_dispatch`
defaults to deterministic-only; pass `full=true` to exercise the full path on demand.

The job authenticates to GCP with Workload Identity Federation (no long-lived key), impersonating
the existing `govbuy-ingest` service account (`terraform/main.tf`). The job's last step runs
`govbuy-ingest liveness`; a failed job is itself the dead-man's-switch signal, so a missed or
failing refresh shows up as a red GitHub Actions run.

**Why:** ADR-0005 correctly named the cost/runtime uncertainty as the reason to defer scheduling.
That uncertainty is resolved: the per-run cost ceiling (`GOVBUY_CEILING_PAUSE_GBP`) already bounds
spend, and `refresh` is the documented nightly command (PRD §7.2, STATUS.md). GitHub Actions was
chosen over a Cloud Run Job + Cloud Scheduler pairing because it needs no new GCP compute resource,
keeps the schedule next to the code it runs, and reuses secrets/variables already managed via `gh`
rather than a second console.

**Considered and rejected:** (a) Cloud Run Job + Cloud Scheduler — the cleanest ops story and what
ADR-0005 flagged as the likely eventual choice, but adds a second deploy surface for no extra
benefit at this scale; (b) a scheduled Claude Code routine — fast to wire up, but ties a production
data pipeline to an interactive runtime and its credentials, which ADR-0005 already rejected for
this same reason.

**Consequences:** `ANTHROPIC_API_KEY` and `COMPANIES_HOUSE_API` now live as GitHub Actions secrets
(`GOVBUY_ANTHROPIC_API_KEY`, `GOVBUY_COMPANIES_HOUSE_API`), not only in the operator's local `.env`.
The WIF pool/provider/binding in `terraform/main.tf` must be applied once, and the resulting
provider name set as the `GOVBUY_WIF_PROVIDER` repo variable, before the workflow can authenticate.
A stale index now surfaces as a failed scheduled run in GitHub Actions rather than silence.
