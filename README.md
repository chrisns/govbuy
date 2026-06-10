# govbuy — UK route-to-market MCP

Ask your AI assistant **how to buy** a thing across the UK public sector — or, as a vendor, **where
to list it and who can prime you in** — and get a complete, current, **source-anchored** answer:
the frameworks and dynamic markets that fit, their lots, the permitted award mechanics, the
documentation a purchase needs, the appointed suppliers, and the resellers/primes (like Bramble Hub)
whose inbound scope can carry an off-framework product to market.

**Live now:**

```bash
claude mcp add --transport http govbuy https://govbuy.run.cns.me/mcp
```

> *"I want Appvia to build me a landing zone. How can I contract them?"* → Appvia (CRN 10653692,
> Companies House auto-matched) is appointed to **Technology Services 4 (RM6190)** and **G-Cloud 14
> (RM1557.14)**; both permit direct award or further competition — each claim carrying a verbatim
> excerpt from the operator's own page.

## What's inside

| | |
|---|---|
| Framework operators | **147** — GCA/CCS, G-Cloud, every HE consortium, local-gov POs, NHS national + regional + pharma hubs, BlueLight Commercial, Defence Digital, Scotland / Wales / NI CPD, combined authorities, the housing / construction / highways / education consortia layers |
| Frameworks, DPS & dynamic markets | **3,207** (3,108 live for call-off) |
| Suppliers | **28,247** — 99.2% resolved to a Companies House CRN |
| Appointed-supplier edges | **57,055** (77% of frameworks carry a supplier list) |
| How-to-call-off mechanics | direct award vs further competition on **71%** of frameworks |
| Spend coverage | **91.4%** of framework-attributable UK public spend |

GCA and G-Cloud are ingested **deterministically** from their APIs/directories; everything else is
agentic with a hard anti-fabrication gate. [docs/STATUS.md](docs/STATUS.md) is the honest gap map;
[docs/access-barriers.md](docs/access-barriers.md) inventories the login-walled supplier lists.

Sibling to [`find-tender-mcp`](../cddo/find-tender-mcp) (the demand side — tenders & awards). govbuy
is the **supply / route-to-market** side. It **documents** routes; it does **not** assemble the
purchase or give legal advice, and it is not the authority of record. See [VISION.md](VISION.md),
[docs/PRD.md](docs/PRD.md), the [ADRs](docs/adr/) and the glossary in [CONTEXT.md](CONTEXT.md).

## Tools

| Tool | What it does |
|------|--------------|
| `find_routes` | **Buyer:** instruments/lots that fit a need + permitted award mechanics + required docs + GPC/marketplace caveats. Doesn't rank or assemble the buy. |
| `get_instrument` | One framework/dynamic market: lots, lifecycle status, mechanics, buying docs, appointed suppliers (each with a membership qualifier + evidence). RM lookups return the canonical GCA agreement, not a reseller's listing of it. |
| `find_instruments_to_list` | **Seller:** instruments a vendor can be appointed to (open frameworks / dynamic markets) + how-to-apply. |
| `list_resellers` | "Who's like Bramble" — thin-primes & VARs by channel/category/vendor, with their inbound scope. |
| `get_supplier` | One supplier: Companies House match snapshot, frameworks/lots, channel, inbound scope. |
| `query_sql` | Read-only BigQuery over `govbuy_public` (+ the `sibling_call_off_awards` snapshot to join real call-offs). Byte-capped. |
| `get_schema` | Tables/columns + byte cap. |
| `get_status` | Per-source freshness/health, last-run cost (£), spend-coverage %. |

## Ask it anything

A route-to-market catalogue with 3,200 frameworks and 28k CRN-matched suppliers answers stranger
questions than "which IT framework." Answers are collapsed — click to expand.

<details>
<summary><b>"How do I get Control Plane (controlplane.io) to run a capture-the-flag exercise for my Kubernetes platform team?"</b></summary>

> **Control Plane Limited** (CRN **10964729**, Companies House auto-matched, band `auto_accept`) is
> appointed to **G-Cloud 14 (`RM1557.14`)**. A hands-on Kubernetes-security / CTF training engagement
> is a *cloud support / specialist cloud services* buy, so G-Cloud is the clean route: find Control
> Plane on the Digital Marketplace, then either **direct-award** against their published rate card or
> run a **further competition** on the lot — G-Cloud 14 permits both.
>
> If you'd rather a panel competed for it, the adjacent cyber routes are **GCA Cyber Security Services 3
> (`RM3764.3`)** and **BlueLight Commercial's Cyber Security Penetration Testing framework** — but Control
> Plane isn't appointed to those, so you'd be buying a *different* supplier there. govbuy hands you the
> route, the mechanic and the verbatim source line; you place the call-off.
</details>

<details>
<summary><b>"I've built an AI triage tool but I'm on no framework. How do I get it in front of the NHS this quarter?"</b></summary>

> Two parallel routes. `find_instruments_to_list` returns the **open frameworks and dynamic markets you
> can apply to join now** (AI/digital DPS, G-Cloud's scheduled re-opens) with the how-to-apply. In the
> meantime `list_resellers` surfaces the **thin-primes and VARs** — Bramble Hub and its peers — whose
> `inbound_scope` already carries third-party software onto NHS frameworks, so you sell *through* them
> while your own appointment is in flight.
</details>

<details>
<summary><b>"My council is scrapping 200 end-of-life EVs. Who's appointed to take them and can I just direct-award?"</b></summary>

> `find_routes("vehicle disposal")` returns the fleet-disposal routes — **BlueLight Commercial's Auction
> & Disposal of End-of-Life Vehicles** agreement among them — each with the per-lot appointed suppliers
> and whether **direct award** is allowed or a mini-competition is required. govbuy tells you the route
> and the mechanic; it does not run the auction or write your spec.
</details>

<details>
<summary><b>"Fire service here — I need drone thermal-imaging kit fast and compliantly."</b></summary>

> `find_routes("drone thermal imaging")` surfaces **BlueLight Commercial's operational-equipment and
> emergency-response-vehicle frameworks**, plus local-government security-and-surveillance routes (ESPO
> and friends), with appointed suppliers and the call-off method on each — so you can pick the fastest
> compliant lot rather than running a fresh tender.
</details>

<details>
<summary><b>"As a vendor, which live frameworks expire in the next six months, so I know what to prepare to re-bid?"</b></summary>

> A one-liner via `query_sql`:
>
> ```sql
> SELECT rm_reference, operator_id, name, expires_on
> FROM instrument
> WHERE lifecycle_status = 'live_for_call_off'
>   AND expires_on BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 6 MONTH)
> ORDER BY expires_on
> ```
>
> Read-only, byte-capped, scoped to `govbuy_public`. Your re-bid calendar in one query.
</details>

<details>
<summary><b>"Map me the resellers that exist mainly to prime others in — across cloud and cyber."</b></summary>

> `list_resellers` filtered to `channel_type = thin_prime` returns **Bramble Hub** and its peers with the
> `inbound_scope` each one publishes — i.e. *what categories of third-party product they'll carry onto a
> framework*. That's the difference between a value-added reseller and a genuine thin-prime, made
> queryable.
</details>

<details>
<summary><b>"Prove it — don't trust the AI. Show me the verbatim source that says G-Cloud 14 allows direct award."</b></summary>

> Every asserted fact ships an **evidence block**: the verbatim excerpt, the source URL, the licence and
> a confidence score — and that excerpt passed a deterministic substring check against the archived page
> before it was ever published. `get_instrument` returns it inline next to the claim. Nothing the source
> doesn't literally say survives the gate.
</details>

<details>
<summary><b>"What's the most niche thing I can actually buy on a framework?"</b></summary>

> It is not all IT. The lot titles include crematoria solutions, swimming-pool chemicals, body-worn video
> cameras, de-icing salt, period-dignity products, stairlifts and grounds-maintenance machinery.
> `find_routes` (or a `query_sql` over `lot.title`) will find the route for surprisingly specific needs —
> the catalogue spans the whole of public-sector spend, not just the digital slice.
</details>

Every asserted fact carries a **source-anchored evidence block** (a verbatim excerpt that passed a
deterministic substring check, plus the source URL + licence + confidence). Every response says
**not legal advice**.

## Architecture

```
deterministic spine (no LLM): GCA frameworks API + GCA suppliers API + G-Cloud directory
agentic everywhere else (Python harness + workflow agents, Haiku extract / Sonnet discover):
   frontier walk → fetch+archive (HTML & PDF) → extract → DETERMINISTIC verbatim-gate → reconcile → commit
        │  raw event log (govbuy_raw)                    build-and-swap ▼
        └────────────────────────────────────────────► govbuy_public (typed, source-anchored)
                                                              + sibling_call_off_awards (materialised non-PII snapshot)
   AI assistant ──MCP──► Cloud Run (TypeScript, read-only SA on govbuy_public ONLY) ──► BigQuery
```

- **Membership** is evidenced, temporal and confidence-scored; conflicts surfaced ([ADR-0003](docs/adr/0003-evidenced-temporal-membership.md)).
- **Faithfulness**: nothing asserted without a verbatim-verified excerpt — a supplier or call-off
  route the source doesn't literally state is quarantined, never published ([ADR-0004](docs/adr/0004-source-anchored-facts-and-mixed-licensing.md)).
- **Companies House**: match-only point-in-time snapshots, confidence-banded, incremental and
  crash/rate-limit-resilient; rebuilds never re-hit the CH API.
- **Sibling join**: the harness materialises a curated, non-PII snapshot of the sibling's call-off awards into `govbuy_public`; the API reads the snapshot, never the sibling ([ADR-0001](docs/adr/0001-shared-project-read-sibling-dataset.md)).
- **Harness** is portable & unscheduled, with per-run cost reporting + a liveness alert ([ADR-0005](docs/adr/0005-portable-unscheduled-harness.md)).

## Develop

```bash
# API (TypeScript)
cd api && npm install && npm run build
GCP_PROJECT=govreposcrape BQ_PUBLIC_DATASET=govbuy_public node dist/index.js   # needs ADC
node test/smoke.mjs http://localhost:8080/mcp

# Ingestion harness (Python)
cd ingestion && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m pytest tests -q
# GCA + G-Cloud are DETERMINISTIC — sync straight from their APIs/directories (no LLM):
.venv/bin/python -m govbuy_ingest gca-sync
# load a fact bundle (the in-session / workflow path) — gate + project + CH-match + coverage:
.venv/bin/python -m govbuy_ingest load-bundle bundle.json --match
# production nightly (needs ANTHROPIC_API_KEY): walk the frontier and extract for real
.venv/bin/python -m govbuy_ingest refresh
# dead-man's switch (wire to any channel):
.venv/bin/python -m govbuy_ingest liveness || notify "govbuy stale"

# full acceptance (AC-1..AC-11) against a live endpoint
bash scripts/acceptance.sh
```

The agentic sweeps live in [`scripts/workflows/`](scripts/workflows) — supplier-membership,
award-mechanics, operator discovery — all idempotent gap-fillers that emit source-anchored bundles
for `load-bundle`.

## Schema

[`sql/schema.sql`](sql/schema.sql) is the contract: two datasets (`govbuy_raw` write,
`govbuy_public` read), the typed source-anchored tables, the evidenced/temporal membership split
(`appointment_observation` → resolved `appointed_supplier`), and the `sibling_call_off_awards`
snapshot.

## Deploy

```bash
PROJECT=govreposcrape REGION=europe-west1 ./scripts/deploy_api.sh
```

Creates the read-only `govbuy-api` service account (dataset-scoped to `govbuy_public` **only** —
the script fails the deploy if the SA can read `govbuy_raw` or the sibling's datasets), deploys to
Cloud Run, and prints the endpoint. The custom domain `govbuy.run.cns.me` is a one-off Cloud Run
domain mapping. See also [`terraform/`](terraform) (datasets + least-privilege IAM + GCS —
**no scheduler**; the harness is operator-hosted and reports its cost each run).

## License & data

Code: MIT. Facts are not copyrightable and are stored freely; short excerpts are kept for
verification under the UK quotation exception, attributed and linked. OGL v3.0 where applicable. A
published takedown route is the residual control. **Not legal advice; not the authority of record.**
