# "Make the MCP better" — acceptance criteria & status

The ten improvements from the strategy review, each with acceptance criteria and honest delivery status.
Legend: ✅ shipped & verified · 🟡 foundation laid (needs data/credentials/infra to complete) · ⛔ blocked.

---

## 1. `draft` — from "documents the route" to "drafts the artifact" ✅
**AC:** a `draft` verb that, given a need or RM, returns editable scaffolding: a real-dated procurement
timetable, a MEAT evaluation-matrix skeleton, a specification outline, the route-correct PA2023 compliance
steps, and — for a statutory direct award — a Schedule 5 justification scaffold + s.44 transparency-notice
fields. Framed as scaffolding, not legal advice; never presents a direct award as the default.
**Status:** Shipped. `draft({need?|rm_reference?|instrument_id?, route?, budget_gbp?})` composes the
PA2023-precise mechanic from `capCompliantPath`; working-day date maths from today; three route templates
(framework_call_off / further_competition / direct_award). Verified live: further-competition returns a
7-step dated timetable + MEAT matrix; direct_award returns the Schedule 5 + s.44 stub. `scaffolding_only`
banner on every response.

## 2. Lot-level supplier membership 🟡→✅ (exposure shipped; deeper extraction is follow-on)
**AC:** `framework()` returns who is appointed to each lot, not just the agreement as a whole.
**Status:** `appointed_supplier.lot_id` already exists in schema; `framework()` now emits a `suppliers_by_lot`
rollup (grouped by lot, joined to lot titles; instrument-wide appointments bucketed separately). Verified live.
*Follow-on:* many sources only publish instrument-wide membership, so per-lot depth is bounded by what each
source states — extracting more per-lot data from source pages is incremental ingest work.

## 3. Expanded eval + release gate + freshness SLA ✅
**AC:** (a) the golden set grows materially and covers the new verbs; (b) the eval becomes a gate that fails
on regression; (c) `get_status` makes the freshness SLA explicit.
**Status:** Shipped. `eval/golden_questions.json` 27 → **49** (adds draft, watch, per-lot, SME lens, defence/
devolved coverage honesty, PA2023 edge cases, GPC-is-not-a-route, semantic search, archived citations).
**Critical fix:** the harness allowed the *old* 17 tool names (dead surface) — corrected to the seven verbs.
Harness now returns a `gate` (pass-rate vs a `PASS_FLOOR`, default 70%); `scripts/release-gate.sh` consumes
the result JSON and exits non-zero on regression (tested both ways). `freshness()` now emits `data_is_stale`
+ `freshness_sla{threshold_hours, oldest_source_age_hours, within_sla}`.

## 4. Canonical identity at ingest + corporate-group rollups 🟡
**AC:** one canonical `supplier_id` per `company_number` resolved at ingest; "how much has the whole group won"
rolls subsidiaries up to a parent.
**Status:** Canonical CRN reconciliation already exists (`supplier_crn_canonical`) and the read path UNIONs
across split identities, so answers are correct *today*. Pushing the dedup into the projection is a low-marginal,
higher-risk refactor — deferred deliberately. **Parent-group rollups are blocked on data we don't hold:** the
Companies House capture is snapshot-only (ADR-0001 — CRN + status, no corporate-structure/PSC), so a true
parent→subsidiary rollup needs a new CH corporate-structure feed. Not faked.

## 5. Credentialed ingest for the login-walled lists 🟡 (path ready; ⛔ on credentials)
**AC:** a fetch path that authenticates to portals (hunterpcm.uk → ~98 HE frameworks, then Pagabo/YPO/NHS LPP)
and loads their appointed lists through the verbatim gate.
**Status:** `ingestion/.../login_walled.py` adds the credentialed-session path + a per-portal registry, wired
as the `credentialed-sync` CLI mode; rows flow through `materialize_official_appointments` (same gate as the
durable manifest). Credentials come from env (`HUNTER_PCM_USER/PASS`, …), never committed or printed; with no
creds it's a safe no-op. **Blocked:** entering credentials / completing each portal's login flow needs the
account keys (operator-supplied) — I won't enter credentials on anyone's behalf. The per-portal `_fetch_*` is a
documented stub until then.

## 6. SME / social-value / regional lens ✅ (per-supplier; aggregate is follow-on)
**AC:** surface whether a supplier is an SME and where it's based, and treat social value correctly.
**Status:** Shipped with **no new crawl** — the *same* live Companies House call the exclusion gate already
makes now also yields SIC codes, company type, registered-office region and filed-accounts category. `supplier()`
emits a `size_and_locality` lens (`sme_likely` with its accounts-category basis, region, SIC) as a CH *signal*,
never a definitive SME determination; social value is framed as a PA2023 duty to evidence, not a fabricated
score. Verified live (Softcat → plc, group accounts, Buckinghamshire). *Follow-on:* aggregate regional/SME spend
analytics need bulk size data (a CH bulk feed), out of scope here.

## 7. Archived source snapshots ✅
**AC:** every citation survives the live page changing/404ing.
**Status:** Shipped. Every evidence block now carries `archived_url` (a Wayback "latest snapshot" link)
alongside `source_url`, in both the SQL evidence struct (`EVAGG`, used everywhere) and the JS resolver.
Verified present in live `framework()` evidence.

## 8. MCP prompts + resources (not just tools) ✅
**AC:** the server exposes curated prompts and reference resources, not only tools.
**Status:** Shipped. Prompts: `compliant-buy`, `due-diligence`, `market-entry`. Resources: `govbuy://glossary`,
`govbuy://guide`. Verified live via `prompts/list` and `resources/list`; capabilities advertised on initialize.

## 9. Abuse protection + hot-query cache ✅
**AC:** the public, unauthenticated endpoint is rate-limited and repeated reads are cheap.
**Status:** Rate limiting already existed (`index.ts`, 60/min, `RATE_LIMIT_PER_MIN`). Added a TTL memo for the
static reference reads every call re-hits (PA2023 rules, payment caveats, schema) — cuts BigQuery cost/latency
with zero staleness risk on reference data.

## 10. `watch` — re-runnable saved queries ✅
**AC:** a subscription-feel for "tell me when X changes" within MCP's request/response model.
**Status:** Shipped. `watch({what:'expiry'|'pipeline', cpv?, keyword?, supplier?, horizon_months?})` returns the
current matches + a `saved_query` block (the exact re-run args, a diff-against-last-run method, a cadence
suggestion). Verified live (CPV-72 expiry → 30 matches + saved query).

---

### Net
Seven verbs now (buy, sell, supplier, framework, research, **draft**, **watch**); richer supplier/framework
answers (per-lot, SME/locality, archived citations); a real eval gate + freshness SLA; prompts + resources;
and a ready credentialed-ingest path. The two genuinely-blocked items (parent-group rollups, running the
credentialed crawl) are blocked on data/credentials we don't hold — documented, not faked.
