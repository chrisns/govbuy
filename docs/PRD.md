# govbuy — Product Requirements Document

**Author:** cns
**Date:** 2026-06-06
**Version:** 0.2 (draft for development; revised after adversarial review)
**Repo:** `govbuy` (`/Users/cns/httpdocs/govbuy`)
**Endpoint:** `https://govbuy.run.cns.me/mcp`
**Related:** [CONTEXT.md](../CONTEXT.md) (glossary) · [`sql/schema.sql`](../sql/schema.sql) (the physical schema contract) · ADRs [0001](adr/0001-shared-project-read-sibling-dataset.md) [0002](adr/0002-agentic-hybrid-ingestion.md) [0003](adr/0003-evidenced-temporal-membership.md) [0004](adr/0004-source-anchored-facts-and-mixed-licensing.md) [0005](adr/0005-portable-unscheduled-harness.md) · Research: [domain map](research/2026-06-06-domain-map.md), [CRN coverage](research/2026-06-06-crn-coverage-measurement.md), [G-Cloud access](research/2026-06-06-gcloud-access.md), [GPC](research/2026-06-06-gpc.md), [payment mechanisms](research/2026-06-06-payment-mechanisms.md) · Sibling: [`find-tender-mcp`](../../cddo/find-tender-mcp)

---

## 1. Executive summary

UK public buyers and the suppliers who want to sell to them face the same fog from opposite sides:
**there is no machine-queryable map of how you actually buy (or sell) a given thing.** The standing
buying instruments — frameworks, dynamic markets, their lots, who is appointed to them, the routes by
which you transact, and the reseller/prime relationships that let third-party products reach
government — are scattered across the Government Commercial Agency (GCA, formerly CCS) and dozens of
other operators (Bloom, YPO, ESPO, NHS bodies, university consortia…), published as heterogeneous web
pages, PDFs and spreadsheets, with no supplier-identity spine.

**govbuy** is a remote [Model Context Protocol](https://modelcontextprotocol.io) server that indexes
this **route-to-market** layer and exposes it to AI assistants, answering two flagship questions:

- **Buyer:** *"How can I buy *X* (e.g. an AI product)?"* → the instruments/lots that fit, the permitted
  award mechanics, the appointed suppliers and resellers, and the documentation the purchase requires.
- **Seller:** *"I have *X* to sell — which instruments should I list on, and which resellers/primes
  (like Bramble Hub) can route me to market?"*

govbuy is the **supply / route-to-market side**; the sibling `find-tender-mcp` is the **demand side**
(tenders and awards). They share the `govreposcrape` GCP project. govbuy ingests only the new
instrument/supplier/route layer and reads the sibling's award data **through a curated, non-PII
authorized view** to answer combined questions and to spend-rank coverage
([ADR-0001](adr/0001-shared-project-read-sibling-dataset.md)).

Because the sources are unstructured and heterogeneous, ingestion is a **hybrid agentic harness** — a
deterministic frontier walk with LLM extractors, an adversarial verify step, and a **deterministic
verbatim-excerpt gate** ([ADR-0002](adr/0002-agentic-hybrid-ingestion.md),
[ADR-0004](adr/0004-source-anchored-facts-and-mixed-licensing.md)). Every stored claim is
**source-anchored** (the cited excerpt must be a verbatim substring of the archived source) so govbuy
never asserts a buying rule it cannot quote. govbuy **documents** routes; it does not assemble the
purchase, author the business case, or give legal advice.

---

## 2. Problem & opportunity

- **No route map.** Knowing *that* G-Cloud exists is easy; knowing whether a given AI product can be
  bought by call-off without further competition vs further competition, who's appointed to the right
  lot, what documentation a call-off needs, and whether a reseller can bring in an off-framework
  vendor — is buried in framework schedules and operator pages.
- **No supplier-identity spine.** Award data names suppliers as free text; **only ~21% of award
  lines (and ~26% of distinct supplier names) carry a usable Companies House number** — measured
  against the sibling's corpus ([CRN coverage](research/2026-06-06-crn-coverage-measurement.md)). The
  remaining ~74% need fuzzy name→CRN resolution.
- **No reseller/prime intelligence.** The "thin-prime" model (Bramble Hub and peers) and VAR channels
  are how most SME and off-framework products reach government, yet there is no index of who
  primes/resells what.
- **Terminology traps.** "direct award" means two different things; "DPS" is now legacy; CCS is now
  GCA; a hyperscaler "marketplace" is not a legal route; a procurement card / expense claim is a
  payment mechanism, not a route (see [CONTEXT.md](../CONTEXT.md)).
- **Most of the data is not an API.** The FTS/Contracts Finder OCDS spine is deterministic, and the
  **GCA frameworks API** (`gca.gov.uk/api/frameworks`, discovered during the landscape sweep) makes the
  GCA slice deterministic too — but the G-Cloud per-service priced catalogue and every non-CCS operator
  remain HTML+PDF/XLSX with no usable API ([G-Cloud access](research/2026-06-06-gcloud-access.md)), so
  ingestion is hybrid: deterministic where an API exists, agentic otherwise.

---

## 3. Goals & non-goals

### Goals
1. A **route-to-market index** — instruments, lots, appointed suppliers (evidenced + temporal),
   permitted award mechanics, buying documentation, and reseller/prime inbound-scope — across GCA
   **and** non-CCS operators, **all categories**.
2. Answer the **two flagship journeys** via curated tools, plus an analytics escape hatch.
3. A **supplier-identity spine**: best-effort resolution of every appointed supplier to a Companies
   House number, with a point-in-time match snapshot.
4. **Faithful, source-anchored** content: every claim carries a cited excerpt verified as a verbatim
   substring of its source + a confidence; uncited/unverifiable ⇒ quarantined; not the authority of
   record; not legal advice ([ADR-0004](adr/0004-source-anchored-facts-and-mixed-licensing.md)).
5. **Combined demand+supply answers** via the sibling's curated award view (no re-ingestion).
6. **Spend-weighted coverage** (directional product goal): cover the operators/instruments carrying
   the bulk of public-sector call-off spend, measured against a **frozen denominator** (§5, §15).
7. **Cost-visible, portable ingestion:** a runtime-agnostic harness reporting per-run £, with a
   liveness alert ([ADR-0005](adr/0005-portable-unscheduled-harness.md)).

### Non-goals (v1)
- **Not** a re-index of tenders/awards — the sibling owns those; govbuy reads a curated view.
- **Not** the authority of record — defer to the official source; **not legal advice**.
- **Not** a transaction engine. It documents routes **and the payment/consumption layer that sits on
  them** — hyperscaler-marketplace consumption billing and the GPC are recorded **as settlement
  mechanisms, orthogonal to the route and never a route themselves** (§6; CONTEXT.md). It does not buy,
  run a competition, or author a buyer's business case.
- **Not** a Companies House mirror — match + point-in-time snapshot only; link out for live; no
  officer/PSC bulk personal data at rest.
- **Not** the G-Cloud per-service priced catalogue in v1 — v1 indexes G-Cloud at **supplier + lot
  membership** level only; per-service descriptions/pricing (~44k services, the dominant cost driver)
  are deferred (§11.1).
- **Not** exhaustive of the spend tail in v1.

---

## 4. Primary users & use cases

The consumer is an **AI assistant** calling MCP tools; result shaping (§9.3) keeps responses
token-efficient.

| Persona | Representative question | Tool path |
|---|---|---|
| **Public buyer / commercial** | "How can I buy an off-the-shelf AI assistant compliantly?" | `find_routes` → `get_instrument` (+ GPC/marketplace settlement caveats) |
| **Buyer benchmarking** | "Who's already supplying this, and what was called off?" | `get_supplier`/`list_resellers` + `sibling_call_off_awards` view |
| **Seller (vendor/SME)** | "I have an AI product — which instruments do I list on?" | `find_instruments_to_list` |
| **Seller (route-to-market)** | "Which thin-primes/VARs (like Bramble Hub) can route my product in?" | `list_resellers` |
| **Market analyst** | "Rank suppliers by call-off value across G-Cloud lots." | `query_sql` (govbuy_public ⋈ the sibling view) |

---

## 5. Scope, coverage target & build order

- **Coverage model:** all categories, full depth, **prioritised by spend**. Two distinct v1 gates
  (do not conflate — see M9):
  - **Spend-coverage gate (directional):** index instruments carrying the bulk of call-off spend,
    measured against the **frozen denominator** in §15 (call-off-attributable awarded value in the
    sibling, fixed FY window, GBP). Target ≥80% of *that* denominator, with the known undercount
    logged — **not** "80% of all public-sector spend" (undefined and unmeasurable).
  - **Feature-completeness gate:** at least one fully worked, source-anchored example of **each entity
    type** — a closed framework, an open framework, a dynamic market, a thin-prime (Bramble Hub), a
    VAR, and an inbound-scope edge — so the reseller/route features are demonstrably real even if they
    live in the low-spend SME tail.
- **Minimum operator set v1 indexes regardless of spend:** **GCA** + at least **Bloom** (managed
  marketplace / thin-prime habitat) + one **LA-owned PBO** (YPO or ESPO) + one **NHS** body (NHS SBS).
  Additional operators are added until the spend gate is met.
- **Build order ([ADR-0002](adr/0002-agentic-hybrid-ingestion.md)):** **operator-by-operator, GCA
  first** (most spend, most structured), then the highest-spend operators. Schema + harness are
  **generic**, so adding an operator/agreement is **frontier configuration, not new code** (§7.2, M4).
- **Operator isolation:** each operator/agreement ingests and fails independently; a stale/broken
  source is flagged via `get_status`, never fatal to the rest.

---

## 6. Domain model

Authoritative glossary: [CONTEXT.md](../CONTEXT.md). Spine: **operator** establishes **instruments**
(framework / dynamic market, each with an **instrument status** lifecycle) → **lots** → **appointed
suppliers** (evidenced, temporal) reachable via **award mechanics**:

- **call-off without further competition** and **further competition** (within a framework), and
- **competitive flexible procedure (CFP)** — the mandatory mechanic for **dynamic market** awards.

These are distinct from a statutory **direct award** (a whole contract, no framework). A **call-off**
corresponds to an **award** on the demand side. **Resellers/primes** (thin-prime vs VAR vs vendor)
carry an **inbound scope** of vendors. **Payment mechanisms** (PO/invoice, GPC, expenses, marketplace
consumption billing, …) are **orthogonal to the route** and never a route themselves. Every supplier
is best-effort resolved to a **company number (CRN)**.

Two model invariants that shape the schema:
- **Membership is a derived, evidenced, temporal relation, never ground truth**
  ([ADR-0003](adr/0003-evidenced-temporal-membership.md)): observations carry per-source provenance +
  confidence + `observed_on`; the resolved edge derives the validity window; conflicts are surfaced.
- **Every asserted fact is source-anchored** ([ADR-0004](adr/0004-source-anchored-facts-and-mixed-licensing.md)):
  it links (NOT NULL FK) to a `claim_evidence` row whose excerpt is a **verified verbatim substring**
  of the archived source, or it is not served.

---

## 7. Data sources & ingestion

### 7.1 Source matrix (verdicts from research)

| Source | Format | Access | Role |
|---|---|---|---|
| Find a Tender / Contracts Finder OCDS | JSON REST + bulk | open, no key | **Deterministic spine** for award value + framework-call-off notices; read via the sibling view. |
| **GCA frameworks API** (`gca.gov.uk/api/frameworks`) | structured JSON | **Yes — deterministic** | **Refactored to a deterministic adapter** (`govbuy_ingest.gca_api`, `govbuy-ingest gca-sync`): all live GCA agreements (RM ref, type, regime, lifecycle, dates, lots, category) mapped straight to facts — no LLM, no scraping. GCA left the agentic frontier. (Per-service G-Cloud priced catalogue has no API → separate scrape sidecar if/when in scope.) |
| G-Cloud catalogue (applytosupply) | HTML, no login | **scrape-only, no key exists** | v1: supplier + lot membership only. Per-service catalogue deferred (§11.1). |
| Non-CCS operators (Bloom, YPO, ESPO, NHS, consortia…) | HTML + PDF/XLSX | scrape/extract | Instruments + per-lot suppliers (often PDF). Agentic, per-operator. |
| Supplier marketing pages | HTML | scrape/extract | Reseller channel type + inbound-scope edges. Lowest confidence, highest licensing risk. |
| Companies House Public Data API | JSON REST | API key (in `.env`) | Supplier identity resolution + point-in-time snapshot. |

### 7.2 The agentic harness ([ADR-0002](adr/0002-agentic-hybrid-ingestion.md), [ADR-0005](adr/0005-portable-unscheduled-harness.md))

A **portable, idempotent, resumable orchestration script** (no cron provisioned; operator-hosted),
with modes:

- **`refresh`** (the "nightly" path): deterministically walk the **frontier registry**; for each
  fetched document run **extract → verify → anchor-gate → reconcile → commit**.
  - **Extract** (tier: **Haiku**): document → structured facts conforming to a `fact_type`, **each
    with a cited excerpt + locator** and a confidence.
  - **Verify** (tier: **Sonnet**, adversarial): confirm each claim is supported by its excerpt;
    cross-check against the OCDS spine where possible.
  - **Anchor-gate (deterministic, NON-LLM — B6):** the excerpt **must** be found as a
    whitespace-normalised verbatim substring of the archived raw document (in GCS) at the recorded
    locator, else the fact is **quarantined**. This is what makes "100% source-anchored" mean the
    quote is *real*, not merely that a row exists.
  - **Reconcile**: fold verified facts into `appointment_observation` (the evidenced grain); rebuild
    the resolved `appointed_supplier` edge (derive `appointed_from`/`left_on`, set `conflict`).
  - **Commit**: idempotent `MERGE` into `govbuy_raw.extracted_fact` on **`content_hash` =
    SHA-256(RFC 8785 JCS canonicalisation of `fact_type` + `subject_ref` + `payload`)** (recipe
    versioned). Public tables are **build-and-swap**: built into `*_staging`, then **atomic table
    replace**; a failed/paused run leaves the last good `govbuy_public` intact.
- **`discover`** (lower-frequency; tier: **Opus**): hunt new operators/instruments + changed site
  structures; **propose** frontier additions to a review queue (gated, not auto-committed). Also
  re-checks the §14 staleness flags.
- **`backfill`** (windowed/operator-scoped, resumable per-shard).

**Frontier recipe schema (M4)** — `frontier.recipe` JSON: `{target_fact_types[], fetch:{seed_url,
pagination, follow_rules}, extractor_prompt_id, extractor_prompt_version, locator_strategy, tos_gate}`.
This is the "add an operator = configuration, not code" surface; the harness validates it on load.

**Cost reporting (mandatory):** every run writes tokens + est-£ + `model_tier_breakdown` +
£-per-operator to `harness_run`; a **configurable soft ceiling** (default per §11.1) **warns** then
**pauses** (status `paused_ceiling`) — a paused run does **not** swap, so public stays last-good.
**Liveness (mandatory):** a separate dead-man's-switch script alerts (operator-chosen channel) if no
successful `refresh` completed within a threshold.

**Politeness ([ADR-0004](adr/0004-source-anchored-facts-and-mixed-licensing.md)):** honour
`robots.txt`, a per-source ToS gate at frontier onboarding, rate-limit, identify the crawler by
user-agent, backoff on 429/503.

### 7.3 Supplier-identity resolution

Sized by the measured **~74% of names needing fuzzy matching**
([CRN coverage](research/2026-06-06-crn-coverage-measurement.md)). The **same matcher runs on both
the govbuy side and the sibling-award side** (~547k award lines — budget this; it is the largest
single compute/£ line, and the cross-dataset spend metric depends on it).

1. **Read-through** any usable `GB-COH-<crn>` (free ~21–26%).
2. **Cluster** by publisher-internal id (`GB-FTS-*`/`GB-CFS-*`) — stable within a publisher.
3. **Normalise** name → **candidate-generate** via CH `/advanced-search/companies` (filter
   status/location/SIC/incorporation date) → **score** against registered name *and*
   `previous_company_names` → **confirm** with corroborating attributes.
4. **Bands (N4):** `match_confidence` ∈ [0,1]; **auto_accept ≥ 0.90**, **quarantine 0.60–0.90**
   (human review), **reject < 0.60**, **unresolved** (no candidate). Persist `company_number,
   registered_name, match_confidence, match_band, status_at_match, matched_on, method` — snapshot
   only; link out for live.
5. **Gold set** (AC-4, §15): ≥300 hand-labelled supplier names sampled to represent each named failure
   mode (trading-vs-registered, homonyms, dissolved/renamed, group-vs-subsidiary, non-CH, suffix
   noise); target **precision ≥0.90** on auto_accept; recall reported.

---

## 8. The index — data architecture

**Two BigQuery datasets (EU), least-privilege read boundary**
([ADR-0001](adr/0001-shared-project-read-sibling-dataset.md)). **The physical schema is
[`sql/schema.sql`](../sql/schema.sql) — that file is the contract** (types, nullability, enums-in-
comments, keys, partition/cluster, the appointment grain, the NOT NULL evidence FKs, and the
authorized view). This section is the overview.

```
agentic harness (Python + Anthropic API) ──► gs://…-govbuy-raw  (immutable doc archive; substring-gate source)
                                                  │
   govbuy_raw  (WRITE; ingestion identity only)   │  document · extracted_fact (event log) · claim_evidence
        · frontier · harness_run · supplier_match  │  (verify_status: pending|verified|quarantined)
                                                  │ verify + anchor-gate + reconcile + build-and-swap
                                                  ▼
   govbuy_public (READ; API SA dataViewer on THIS ONLY)
        operator · instrument · lot · award_mechanic · buying_doc
        · appointment_observation (evidenced grain) · appointed_supplier (resolved edge)
        · supplier · reseller_channel · inbound_scope · payment_mechanism · claim_evidence · source_status
        · VIEW sibling_call_off_awards  ◄── authorized on uk_tenders_public (non-PII projection)
                                                  ▲
   Cloud Run: govbuy-mcp (TypeScript) ──read-only SA──┘
```

- **Evidence integrity (M6):** every fact table carries `evidence_id` (or `evidence_ids[]`) as a
  **NOT NULL FK** to `claim_evidence`; a referential-integrity test enforces AC-6. `govbuy_raw.claim_evidence`
  keeps `locator`/`retrieved_on`/`document_id`; the public projection keeps `source_url`/`excerpt`/
  `licence`/`confidence`/`retrieved_on`.
- **Membership grain (B5):** `appointment_observation` is one row per
  `(instrument_id, lot_id, supplier_id, source_id, observed_on)` with `observed_present`, confidence
  and evidence; the resolved `appointed_supplier` derives `appointed_from`/`last_seen_on`/`left_on`/
  `status`/`conflict` from the observations. `left_on` is set when the latest observation across
  sources is `observed_present=FALSE` or absent beyond the staleness window.

### 8.3 Cross-dataset join (B3, M8) — via the authorized view only

Combined answers and the spend metric join `govbuy_public` to the **`sibling_call_off_awards`**
authorized view (which `UNNEST`s `compiled_process.awards` and drops `contactPoint`). The supplier
join is **two-tier**: (1) direct on Companies House CRN where the award line carries one (~21%);
(2) else via govbuy's resolved publisher-id clusters (`GB-FTS-*`/`GB-CFS-*`) and/or normalised name,
**resolved by the same matcher** as §7.3. Unmatched award value is **attributed to "unresolved" and
reported**, never silently dropped — so the §15 metric does not over- or under-state. The
instrument-side join key (framework reference) is **gated by the §14 verification** — pin down
empirically which OCDS field expresses it before relying on it.

---

## 9. MCP tool surface

Journey tools + SQL ([ADR-0001](adr/0001-shared-project-read-sibling-dataset.md)). Shared response
envelope, then per-tool contracts.

### 9.1 Shared shapes
- **`evidence` block** (on every asserted fact in `standard`/`full`): `{source_url, source_kind,
  excerpt, licence, confidence, retrieved_on}`.
- **`freshness` envelope** (every response): `{per_source: [{source_id, last_success_at, health}],
  worst_case_health, spend_coverage_pct}`.
- **`membership` qualifier** (N7): every appointed-supplier item carries `{status, as_of, confidence,
  conflict}`; an edge below the confidence/staleness gate is returned only with an explicit
  `unconfirmed: true` + "verify on the official source" marker — never a bare "is appointed".
- **Error envelope:** `{code, message, hint}`.

### 9.2 Tools
| Tool | Params | Result (minimal → full) | Errors |
|---|---|---|---|
| `find_routes` | `need?`, `keyword?`, `cpv?`, `category?`, `value?`, `buyer_type?`, `resultMode` | candidate `instruments[]` (id, name, operator, lifecycle_status, fitting lots, permitted `award_mechanics[]`, `required_docs[]`, `payment_caveats[]` for GPC/marketplace) — **does not rank/pick or assemble** | `no_match`, `cap_exceeded` |
| `get_instrument` | `id`\|`rm_reference`, `resultMode` | instrument + lots + `award_mechanics[]` + `buying_docs[]` + `appointed_suppliers[]` (each with `membership` qualifier + `evidence`) + operator + dates | `unknown_id`, `ambiguous_id` |
| `find_instruments_to_list` | `product`\|`category`, `openOnly?` | instruments/lots a vendor can be appointed to (esp. open frameworks / dynamic markets `live_for_call_off`) + how-to-apply pointers | `no_match` |
| `list_resellers` | `channel_type?`, `category?`, `vendor?`, `instrument?` | suppliers by channel type with frameworks held + `inbound_scope[]` sample (each with `evidence`) | `no_match` |
| `get_supplier` | `name`\|`crn`, `resultMode` | supplier: CRN match snapshot (`status_at_match`, `match_band`), instruments/lots, channel type, inbound scope, `ch_url` | `unknown`, `ambiguous` |
| `query_sql` | `sql` | read-only rows over `govbuy_public` (+ the `sibling_call_off_awards` view); byte-capped | `dml_refused`, `cap_exceeded` (pre-exec estimate), `timeout`, `syntax` |
| `get_schema` | — | tables/columns + byte cap | — |
| `get_status` | — | per-source freshness/health + last-run cost (`est_gbp`) + spend-coverage % | — |

### 9.3 Result shaping & posture
`resultMode` = `minimal` (ids/names/status/dates/official URL), `standard` (+ lots, mechanics, top
suppliers, `evidence`), `full` (complete + all evidence). Every response: **"not legal advice"** +
`freshness`. Low-confidence/quarantined data is **flagged, never silently omitted**.

---

## 10. Faithfulness, licensing & legal ([ADR-0004](adr/0004-source-anchored-facts-and-mixed-licensing.md))

- **Source-anchored + anti-fabrication:** no claim served without a `claim_evidence` row whose excerpt
  passed the **deterministic verbatim-substring gate** (§7.2). **Not the authority of record; not legal
  advice** — on every response.
- **Mixed licensing:** the primary legal leg is that **facts are not copyrightable** (membership,
  who-resells-whom, RM refs, dates) — stored freely. **Excerpts** are short, attributed, sized to the
  narrow UK quotation exception (CDPA s30(1ZA)) — **not** a broad "fair dealing" claim. Supplier
  **marketing** pages (lowest confidence, highest risk) store locator + timestamp + a short quote, not
  substantial excerpts. Controls: robots.txt, **per-source ToS gate at frontier onboarding**,
  rate-limit, crawler user-agent, published takedown route. **Requires legal sign-off before launch.**
- **Sibling PII (M8):** govbuy does **not** re-publish the sibling's `parties[].contactPoint` — the
  `sibling_call_off_awards` view drops it; the API SA cannot reach `uk_tenders_public` directly. govbuy
  inherits the sibling's data-protection posture for the curated award fields it does surface; takedown
  coverage confirmed.
- **govbuy's own PII:** minimal at rest (CH match snapshot only; no officers/PSC). Framework docs may
  carry contact names — treated as already-published, source-anchored, takedown-covered, write-tier-
  isolated.

---

## 11. Non-functional requirements

- **Cost:** (a) **LLM** — tiered (Haiku extract / Sonnet verify / Opus discover), per-run £ in
  `harness_run`, soft configurable ceiling (default §11.1) that warns then pauses-without-swap.
  (b) **BigQuery** — `maximum_bytes_billed` per query on the API, **applied to the combined
  cross-dataset scan** (sized against the sibling's ~677k-process tables); daily project spend
  cap/alert. (c) Scale-to-zero Cloud Run, single instance.
- **Security:** public read; least-privilege read-only API SA on **`govbuy_public` only** (never
  `*_raw`, never `uk_tenders_public` directly); a **deploy-time IAM assertion** enforces this;
  ingestion writes via a separate identity; per-IP rate limit; byte caps; sanitised errors.
- **Testing:** per-recipe **golden-file extraction** tests (fixture doc → expected facts + evidence);
  a **verify-rejection** set (claims that must be rejected, target ≥0.95 rejected); a **source-anchoring
  test** asserting every served claim's excerpt passes the verbatim-substring check against its
  archived source (not merely that a row exists); **supplier-match evaluation** (gold set §7.3);
  **MCP tool-contract** tests incl. the error envelope and the `membership`/`freshness` shapes; a
  **security test** (read SA cannot mutate, exceed the byte cap, or read `*_raw`/`uk_tenders_public`).
- **Observability:** `harness_run` (cost, counts, quarantine rate), `source_status`
  (green/amber/red — red if no success >36h or last run failed; amber if ran-but-degraded; green
  otherwise; distinguishes ran-no-new from did-not-run), the **liveness alert**, API 5xx/latency/
  rate-limit trips.
- **Data lifecycle:** GCS raw doc archive (replay source + the substring-gate source of truth; retention
  policy); `govbuy_public` fully rebuildable from `govbuy_raw` (reproject without re-scrape);
  reference-data + recipe + canonicalisation versions stamped per derivation; build-and-swap.

### 11.1 Ingestion sizing & cost (pre-sprint-1 go/no-go — M2)
A go/no-go input, to be firmed in a sizing spike before sprint 1. Rough order of magnitude for the
**v1 membership-level** scope (per-service G-Cloud extraction excluded):
- **Doc counts:** GCA ~80 agreements × ~2–5 docs ≈ ~300 docs; the minimum non-CCS operator set adds
  perhaps ~1–3k docs (membership lists + PDFs). v1 full-refresh frontier ≈ **~1–3k documents**.
- **Per doc:** Haiku extract (~8k in / ~2k out) + Sonnet verify on the doc's claims (~2k in / ~0.5k
  out). Illustrative all-in ≈ low single-digit pence/doc.
- **Full refresh ≈ low tens of £** (illustrative — **validate in the spike**); incremental nightly
  refresh far less (only changed docs). The **per-service G-Cloud catalogue (~44k services) is the
  four-figure driver and is explicitly OUT of v1.**
- **Soft ceiling defaults (configurable):** **warn at £50/run, pause at £150/run**; a paused run does
  not build-and-swap. Plus the project daily BigQuery spend cap (§11).

---

## 12. Tech stack & deployment

- **Languages:** **TypeScript** MCP API (Cloud Run); **Python** harness + extractors (Anthropic API,
  tiered models). Mirrors the sibling + [ADR-0002](adr/0002-agentic-hybrid-ingestion.md)/[0006](adr/0006-scheduled-github-actions-refresh.md)
  (supersedes [0005](adr/0005-portable-unscheduled-harness.md)).
- **GCP (`govreposcrape`):** Cloud Run (API, europe-west1 for domain mapping), BigQuery (EU; two
  datasets + the authorized view), GCS (raw doc archive). **No Cloud Scheduler resource** — the
  schedule is a nightly GitHub Actions cron (`.github/workflows/govbuy-refresh.yml`) authenticating
  keyless via Workload Identity Federation.
- **Custom domain:** `govbuy.run.cns.me/mcp` via Cloud Run domain mapping (wildcard already resolves).
- **IaC:** Terraform provisions the two datasets, least-privilege IAM (API SA → `govbuy_public` only;
  the authorized view granted access on `uk_tenders_public`; the deploy-time IAM assertion), GCS, the
  Cloud Run service, and the GitHub Actions WIF pool/provider/binding. Tables created by the harness
  `--bootstrap` from [`sql/schema.sql`](../sql/schema.sql).
- **Secrets:** Companies House + Anthropic keys via `.env` / Secret Manager (CH key already present).
- **Distribution:** `claude mcp add --transport http govbuy https://govbuy.run.cns.me/mcp`; `.mcp.json`;
  health/OpenAPI endpoints; README.

---

## 13. Reference data to ship
Operator registry (seed: the §5 minimum operator set); RM-reference map; PA2023 route taxonomy +
instrument-type/regime lookups; instrument-lifecycle states; payment-mechanism table (`is_route`
always FALSE); channel-type vocabulary; CPV (reuse the sibling's). Each versioned; version stamped per
derivation.

---

## 14. Risks, open questions & gating verifications

- **Gating verification before AC-5/AC-9 (B3):** empirically pin down which OCDS field expresses the
  framework reference on a call-off award notice (`relatedProcesses`? a `frameworkAgreement` block?
  CPV? free text? PDF-only?). The domain map flags framework refs as inconsistent/PDF-bound; the
  cross-dataset spend metric and combined answers depend on this. If no reliable field exists, the
  instrument↔award join falls back to buyer+supplier+value heuristics, with stated recall.
- **Extraction correctness** is probabilistic — mitigated by verify + the deterministic anchor-gate +
  golden tests + confidence/quarantine + OCDS cross-check; never claimed exact.
- **Brittle scrapes** — G-Cloud catalogue + operator PDFs will break; operator isolation + `source_status`
  contain the blast radius.
- **Entity resolution** (~74% fuzzy, both sides) is the largest single cost; gate `match_band` before
  any high-stakes answer.
- **Coverage truthfulness** — measured against a frozen denominator (§15); log what's excluded.
- **Live unknowns the `discover` mode re-checks:** G-Cloud 15 go-live (~Sept 2026 — may break/replace
  the catalogue route); RM6248→RM6383 (GPC framework) post-GCA-rename; AI DPS RM6200 successor; PA2023
  transition state per agreement (operator sites lag); GPC pan-gov policy is pre-PA2023 v4.0 (see the
  GPC/payment-mechanism research staleness flags).

---

## 15. Success metrics (v1) — measurable

- **Spend coverage — denominator = ATTRIBUTABLE spend** (GBP `award_amount` in
  `sibling_call_off_awards` that carries an RM reference, i.e. names a framework — £321.3bn). Metric =
  fraction of that whose framework govbuy has indexed. **Target ≥80% — MET at 86.8%** (£278.9bn covered
  via the top ~30 RM frameworks; sharply Pareto). Call-offs flagged as framework spend but carrying
  **no** RM reference (£222.4bn — unkeyable by anyone from the source) are reported **separately** as
  `unattributable_flagged_gbp_bn`, never charged against coverage. (Award values are framework
  ceilings, not actual spend — some carry placeholder maxima; the metric inherits that caveat.) See
  [`docs/research/2026-06-06-spend-coverage.md`](research/2026-06-06-spend-coverage.md).
- **Feature completeness:** ≥1 worked example of each entity type present and source-anchored (§5).
- **Extraction precision ≥0.90** on the golden set; **verify rejects ≥0.95** of injected-wrong claims.
- **Supplier-match precision ≥0.90** on the gold set (auto_accept band); recall reported.
- **Source-anchoring = 100%** — zero served claims fail the verbatim-substring check (test-enforced).
- **Freshness** per source within target · `source_status`.
- **Cost** per full `refresh` ≤ the §11.1 ceiling · `harness_run`; liveness alert verified.

---

## 16. Acceptance criteria (v1 "done when…")

- **AC-1** `get_instrument("RM1557.14")` returns G-Cloud 14 with lots, `lifecycle_status`
  `live_for_call_off`, permitted award mechanics, buying docs, and appointed suppliers **where
  evidenced** — each carrying an as-of date, confidence, conflict flag and an evidence excerpt+URL
  (per N5, a partial-but-source-anchored supplier list passes; the G-Cloud membership scrape is the source).
- **AC-2** `find_routes("buy an off-the-shelf AI assistant")` returns candidate instruments with their
  mechanics and required docs, making the distinction explicit — e.g. G-Cloud (call-off without
  further competition) **vs AI DPS RM6200 (further-competition only)** — plus the GPC/marketplace
  settlement caveats; it **does not** rank/pick or assemble the purchase; every asserted rule is
  source-anchored.
- **AC-3 (feature gate, independent of spend)** `list_resellers(channel_type="thin_prime")` returns
  Bramble Hub with frameworks held and ≥1 cited inbound-scope edge; `get_supplier("Bramble Hub")`
  shows its CRN match snapshot.
- **AC-4** A supplier appearing only as a trading name resolves to a CRN with `match_band` and
  `status_at_match`; an unresolvable one is `unresolved`, not invented; match precision ≥0.90 on the gold set.
- **AC-5** A `query_sql` join of `govbuy_public.appointed_supplier` with `sibling_call_off_awards`
  returns call-off values for an instrument (subject to the §14 framework-reference verification); a
  DML or >cap query is refused with a structured error and no write; the API SA cannot read
  `uk_tenders_public` directly or any `*_raw` (security test).
- **AC-6** No served claim's excerpt fails the **verbatim-substring** check against its archived source,
  and every fact row has a NOT NULL evidence FK (source-anchoring + referential-integrity tests);
  responses carry "not legal advice" + `freshness`.
- **AC-7** A `refresh` run writes a `harness_run` row with tokens + £ + `model_tier_breakdown` +
  £-per-operator; a run exceeding the pause ceiling stops **without** swapping (public stays last-good);
  the liveness script fires when no successful run completed within the threshold.
- **AC-8** A broken operator scrape surfaces that operator as `red`/stale in `get_status` without
  breaking queries on the others (operator isolation).
- **AC-9 (spend gate) — MET (86.8%):** indexed instruments cover **≥80% of the attributable denominator** (§15), with the
  excluded tail and unresolved-award-value undercount logged.
- **AC-10** `govbuy_public` is fully rebuildable from `govbuy_raw` with no re-scrape (reproject test).
- **AC-11 (ADR-0003 invariant)** Where two sources disagree on a supplier's membership, the resolved
  `appointed_supplier` row carries `conflict=TRUE` and both observations remain in
  `appointment_observation` — the conflict is surfaced, not collapsed.

---

## 17. Appendix — house lineage

govbuy mirrors `find-tender-mcp`'s shape — a TypeScript Cloud Run MCP read API over a managed GCP
BigQuery index, public + unauthenticated, cost-capped, distributed as an MCP endpoint. The defining
differences: (1) it indexes the **supply / route-to-market** layer, not transactions; (2) ingestion is
an **agentic harness** with LLM extractors + adversarial verify + a deterministic verbatim-excerpt gate
([ADR-0002](adr/0002-agentic-hybrid-ingestion.md), [ADR-0004](adr/0004-source-anchored-facts-and-mixed-licensing.md));
(3) it reads the sibling's award data through a **curated non-PII authorized view** for combined
answers and spend-ranking ([ADR-0001](adr/0001-shared-project-read-sibling-dataset.md)); (4) it carries
a **supplier-identity spine** the sibling lacks; (5) its harness is **portable and unscheduled** with
cost reporting + liveness ([ADR-0005](adr/0005-portable-unscheduled-harness.md)).
