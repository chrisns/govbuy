# Forward-pipeline fix + framework coverage backfill — acceptance criteria

Triggered by the DOS7 finding: govbuy holds many frameworks as *routes* but not their *activity* (no
supplier list, no attributable call-offs, a thin/stale forward pipeline). Fix the forward look, then audit
**every** tracked framework for the same class of gap and fill what's deterministically fillable.

## 1 — Forward-look pipeline, fixed & honest (AC-FWD)
- **AC-FWD1** `buy.pipeline_to_watch` and `sell.coming_soon_pipeline` filter `pipeline_notice` to
  `expected_date >= now` and order **soonest-first** (today they order oldest-first with no future filter,
  surfacing 2015 notices as "coming soon").
- **AC-FWD2** Every "forward pipeline" number on the site + README reports the **genuine future count**
  (~866 ahead of today), not 29,306 planned-notices-as-"coming". Honest labelling.
- **AC-FWD3** Deepen the forward look where the corpus allows: capture Find-a-Tender / PA2023 **s.93
  planned-procurement (pipeline) notices** with future dates into `pipeline_notice` (more than the current
  866 if the sibling holds them). Verified live via `sell`/`buy`.

## 2 — Coverage audit across ALL frameworks (AC-AUDIT) — *workflow*
- **AC-AUDIT1** A workflow classifies **every live framework with no supplier list (690)** into:
  `fillable_public` (a public appointed-supplier list exists at the official source), `fillable_api`
  (CCS/Digital-Marketplace API/directory), `login_walled`, `dynamic_no_public_list` (neutral-vendor/DPS by
  design), `dead_link`. Source-anchored; written to `docs/coverage-backlog.md` (+ a `coverage_backlog` table).
- **AC-AUDIT2** The DOS7-class — route present, supplier list deterministically fillable — is explicitly
  enumerated beyond DOS (the 43 CCS RM + any public-list frameworks the audit finds), prioritised by live
  call-off £ / breadth.

## 3 — Fill the deterministically-fillable gaps (AC-FILL) — *workflow(s)*
- **AC-FILL1** For the top fillable frameworks (DOS7 RM1043.9 + the family + others the audit flags
  `fillable_public`/`fillable_api`), a workflow fetches the official source, extracts the appointed-supplier
  list under the **verbatim-substring gate**, and emits source-anchored bundles; bundles are loaded and
  `appointed_supplier` re-materialised. Nothing un-gated is published.
- **AC-FILL2** Measurable lift: `no_official_list` (currently 690) drops materially; DOS7 shows a supplier
  list; `framework({rm_reference:"RM1043.9"})` and `sell` return real members. The honest residual
  (login-walled / dynamic-by-design) is recorded, not hidden.

## Definition of done (AC-DONE)
- Forward-look fix deployed + verified; audit backlog committed; fillable gaps filled + re-materialised +
  verified live through the verbs; README/STATUS/site updated with the true numbers; everything pushed.
  Multiple workflows used (audit, fill, verify). No fabricated data — every added supplier/notice
  source-anchored.
