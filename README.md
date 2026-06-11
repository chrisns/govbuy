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

> *"I want Appvia to build me a landing zone. How can I contract them?"* →
> [Appvia](https://find-and-update.company-information.service.gov.uk/company/10653692) (CRN 10653692,
> Companies House auto-matched) is appointed to
> [Technology Services 4 (RM6190)](https://www.gca.gov.uk/agreements/RM6190) and **G-Cloud 14
> (RM1557.14)**; both permit direct award or further competition — each claim carrying a verbatim
> excerpt, and a clickable link, to the operator's own page. (Responses ship the real URLs — the
> official framework page, the Companies House record, the source of every claim — so your assistant
> links you straight to them.)

## What's inside

| | |
|---|---|
| Framework operators | **147** — GCA/CCS, G-Cloud, every HE consortium, local-gov POs, NHS national + regional + pharma hubs, BlueLight Commercial, Defence Digital, Scotland / Wales / NI CPD, combined authorities, the housing / construction / highways / education consortia layers |
| Frameworks, DPS & dynamic markets | **3,207** (3,108 live for call-off) |
| Suppliers | **28,247** — 99.2% resolved to a Companies House CRN |
| Appointed-supplier edges | **57,055** (77% of frameworks carry a supplier list) |
| Catalogue **listings** (what suppliers actually sell) | **117,829** across 6 buying catalogues — G-Cloud 14 (43,733), Azure Marketplace (38,928), YPO (23,459), ESPO (11,621), NHS Buying Catalogue (48), NDX (40) — each a citable listing URL with a full description, searchable by capability via `find_services`. All crawlers are deterministic + token-free re-runnable. |
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
| `find_services` | **Capability search:** given a need ('host an open-source app', 'M365 mailbox', 'service desk'), the specific catalogue **services** that do it — supplier, lot, full description, and the citable `applytosupply.../g-cloud/services/<id>` listing URL. Answers "who can actually do this", not just "which framework". |
| `find_instruments_to_list` | **Seller:** instruments a vendor can be appointed to (open frameworks / dynamic markets) + how-to-apply. |
| `list_resellers` | "Who's like Bramble" — thin-primes & VARs by channel/category/vendor, with their inbound scope. |
| `get_supplier` | One supplier: Companies House match snapshot, frameworks/lots, channel, inbound scope. |
| `query_sql` | Read-only BigQuery over `govbuy_public` (+ the `sibling_call_off_awards` snapshot to join real call-offs). Byte-capped. |
| `get_schema` | Tables/columns + byte cap. |
| `get_status` | Per-source freshness/health, last-run cost (£), spend-coverage %. |

**Everything links out.** Every response carries the *actual URLs*, not just names: the framework's
`official_url`, the operator's `operator_url`, each supplier's `ch_url` (its Companies House record),
the buying/guidance-document URLs, and an `evidence.source_url` on every asserted claim. Each tool
result — and the server's MCP `instructions` — tells the host assistant to render these as clickable
links with the thing's name as the link text, so you get
*"[Appvia](https://find-and-update.company-information.service.gov.uk/company/10653692) is on
[Technology Services 4](https://www.gca.gov.uk/agreements/RM6190)"* rather than a bare list of names.
Naming a framework or supplier without a link to reach it isn't useful; govbuy ships the link. (Every
link in the demos below is a real, verified govbuy URL — Companies House records and operator
framework pages — so you can click straight through.)

## Ask it anything

A route-to-market catalogue — 3,200 frameworks, 28k CRN-matched suppliers and **117,829 searchable
catalogue listings** — answers stranger questions than "which IT framework." Every answer below is the
genuine output of a live `claude -p` run against the MCP (real URLs the tools returned, not
hand-picked). Collapsed — click to expand.

<details>
<summary><b>"How do I get Control Plane (controlplane.io) to run a capture-the-flag exercise for my Kubernetes platform team?"</b></summary>

> ControlPlane is already on **[G-Cloud 14 (`RM1557.14`)](https://www.gca.gov.uk/agreements/RM1557.14)**
> (Cloud support lot) — no fresh tender needed. The listing to call off for a CTF is
> **[Kubernetes, Security and Cloud Native Training](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/501782209736003)**
> — instructor-led hands-on labs, updated per Kubernetes release. Tie it to a wider hardening engagement
> with their **[Penetration Testing](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/204884495589410)**
> (EKS/GKE/AKS, OpenShift, Rancher), **[Security Assessment & Threat Modelling](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/472831284488281)**
> and **[Security Architecture & Engineering](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/729746574668516)**
> listings. Supplier of record **[CONTROL PLANE LIMITED](https://find-and-update.company-information.service.gov.uk/company/10964729)**
> (CRN 10964729, `auto_accept`). Because you can identify the single service that meets your need, you can
> **direct-award** off G-Cloud (record why this service best fits) rather than run a further competition.
</details>

<details>
<summary><b>"I've built an AI triage tool but I'm on no framework. How do I get it in front of the NHS this quarter?"</b></summary>

> "No framework" + "this quarter" points at one answer: get admitted to an **AI dynamic market**, which
> accepts new suppliers continuously — **[Artificial Intelligence DPS (`RM6200`)](https://www.gca.gov.uk/agreements/RM6200)**
> (CCS, NHS bodies buy through it) and **[HealthTrust Europe's AI Solutions DPS](https://www.healthtrusteurope.com/public-sector/artificial-intelligence-solutions-dynamic-purchasing-system-dps-agreement/)**.
> A DPS bars direct award — the buyer runs a short mini-competition — but you're admitted in weeks, not at
> an annual window. In parallel, get listed where NHS commissioners actually shop: the NHS Buying
> Catalogue triage category, alongside your competitors
> **[accuRx Patient Triage](https://buyingcatalogue.digital.nhs.uk/catalogue-solutions/10030-003)** and
> **[myGP Triage](https://buyingcatalogue.digital.nhs.uk/catalogue-solutions/10073-012)**; comparable AI
> tools also sit on **G-Cloud** (e.g. **[Remcare waiting-list prioritisation](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/623915792517803)**).
> Fastest live deployment of all: a warm trust buys a below-threshold paid pilot with no framework at all.
</details>

<details>
<summary><b>"My council is scrapping 200 end-of-life EVs. Who's appointed to take them and can I just direct-award?"</b></summary>

> Route: **[Managed Remarketing of Vehicles & Plant (NEPO202)](https://www.nepo.org/solutions/fleet-and-building-materials/managed-remarketing-of-vehicles-plant)**,
> council-accessible and live — the page states suppliers *"can be accessed via direct award or further
> competition,"* so **a compliant direct award is permitted**. Appointed suppliers you can direct-award to
> include **[Aston Barclay](https://find-and-update.company-information.service.gov.uk/company/01644813)**,
> **[BPI Auctions](https://find-and-update.company-information.service.gov.uk/company/07279488)**,
> **[John Pye](https://find-and-update.company-information.service.gov.uk/company/10499070)** and
> **[Wilsons Auctions](https://find-and-update.company-information.service.gov.uk/company/NI011967)**. Two
> EV-specific checks it flags: route genuine scrap through a licensed **ATF** that can handle lithium-ion
> traction batteries, and the exact-match
> **[BlueLight ELV Auction & Disposal framework](https://bluelightcommercial.police.uk/helping-police/fleet/disposal/)**
> is emergency-services-scoped — confirm your council is an eligible buyer first.
</details>

<details>
<summary><b>"Fire service here — I need drone thermal-imaging kit fast and compliantly."</b></summary>

> Primary vehicle: **[YPO Drones and Associated Services DPS (1148)](https://www.ypo.co.uk/frameworks-home/900632)**
> — live, drone-specific, covers thermal payloads + pilot training; **award mechanic: further competition
> only** (you spec the radiometric payload + CAA operating category, invite the appointed suppliers, award
> on your criteria). For standalone handheld thermal-imaging cameras,
> **[YPO Emergency Response Equipment DPS (900616)](https://www.ypo.co.uk/frameworks-home/900616)**
> (fire-specific). Software/data layer on G-Cloud (direct award or further competition):
> **[CAPE Drone Software](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/559827627897624)**
> (Motorola Solutions). Rather buy aerial-data-as-a-service than own airframes?
> **[Space-Enabled & Geospatial Services (`RM6235`)](https://www.gca.gov.uk/agreements/RM6235)**. (A
> purchasing card is a payment *mechanism*, not a route — it doesn't let you skip the further competition.)
</details>

<details>
<summary><b>"As a vendor, which live frameworks expire in the next six months, so I know what to prepare to re-bid?"</b></summary>

> A one-liner via `query_sql` returned 119 rows; deduped, the national headliners are
> **[Digital Outcomes 6 (`RM1043.8`)](https://www.gca.gov.uk/agreements/RM1043.8)** (27 Jun),
> **[Big Data and Analytics (`RM6195`)](https://www.gca.gov.uk/agreements/RM6195)** (8 Aug),
> **[G-Cloud 14 (`RM1557.14`)](https://www.gca.gov.uk/agreements/RM1557.14)** (28 Oct) and
> **[Cloud Compute 2 (`RM6292`)](https://www.gca.gov.uk/agreements/RM6292)** (27 Nov), plus ~30
> university-consortium tech frameworks (NWUPC B2B CRM, Desktop & Notebook…).
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

> The graph holds **exactly one pure thin-prime** —
> **[Bramble Hub Limited](https://find-and-update.company-information.service.gov.uk/company/04136381)**:
> it sits on the framework and signs the contract; a named partner delivers. It can prime you onto
> **[Technology Services 4 (`RM6190`)](https://www.gca.gov.uk/agreements/RM6190)** and **G-Cloud 14 Lots
> 1–3**, with ~18 specialists behind it (Arcus Global, Hitachi, Advania, Version 1, Faculty (AI),
> BearingPoint…). Honest about its own gaps: govbuy also flags
> **[NTT DATA UK](https://find-and-update.company-information.service.gov.uk/company/03085018)** as a
> *hybrid* (0.6 confidence) and three plain VARs — so this is a near-empty corner of the map, not a full
> census of prime-as-a-service players. The reseller graph tells you what it knows *and what it doesn't*.
</details>

<details>
<summary><b>"Prove it — don't trust the AI. Show me the verbatim source that says G-Cloud 14 allows direct award."</b></summary>

> Verbatim from the official Crown Commercial page: *"You can direct award on G-Cloud 14 after completing
> the buying process set out in the buyer guide."* —
> **[RM1557.14, gca.gov.uk](https://www.gca.gov.uk/agreements/RM1557.14)**. So direct award (call-off
> *without* further competition) is allowed on Lots 1–3 *after* you document the buyer-guide steps; Lot 4
> is further-competition. Framework is `live_for_call_off`, 29 Oct 2024 → 28 Oct 2026. That excerpt passed
> a deterministic substring check against the archived page before it was ever published — nothing the
> source doesn't literally say survives the gate.
</details>

<details>
<summary><b>"What's the most niche thing I can actually buy on a framework?"</b></summary>

> All live lot titles it returned: **"User Research Participants"** — buy *actual humans* to test your
> service on, by the lot — on **[Digital Outcomes and Specialists 7 (`RM1043.9`)](https://www.gca.gov.uk/agreements/RM1043.9)**;
> **"Transportation and Disposal of Firearms, Weapons and Explosives"** (Lot 17,
> **[RM6354](https://www.gca.gov.uk/agreements/RM6354)**); **"Specialist Cleanroom Laundry Services"**
> (**[Healthcare Soft FM RM6331](https://www.gca.gov.uk/agreements/RM6331)**); roadside drug-testing kit;
> a **"Party Wall Surveyor"** lot; and the **"Traditional Uniform Cap"** — the classic police cap, its own
> framework lot. Its pick for most niche: User Research Participants, the only deliverable that is literally
> other people's attention. The catalogue spans the whole of public-sector spend, not just the digital slice.
</details>

<details>
<summary><b>"I rent out a herd of goats that clear invasive scrub and bramble — no mowers, no herbicide. How do I sell conservation grazing to the public sector?"</b></summary>

> Strange product, ordinary route — to a buyer it's a **grounds-maintenance / habitat service** (CPV 77),
> and public buyers already procure exactly this (habitat/scrub work on
> **[Contracts Finder](https://www.contractsfinder.service.gov.uk/Search?keywords=conservation+grazing)**
> is routinely won by Wildlife Trusts and CICs, not just landscapers). Best fit for a small single-service
> supplier are **DPS you can join at any time**:
> **[NH Consortium Grounds Maintenance DM](https://nhcprocurement.org.uk/solutions/dynamic-solutions/grounds-maintenance/)**,
> **[CHIC Grounds Maintenance DPS](https://www.chicltd.co.uk/services/dynamic-purchasing-system-solutions/grounds-maintenance/)**,
> **[HealthTrust Europe Minor Works DPS](https://www.healthtrusteurope.com/public-sector/minor-dps-external-works-grounds-maintenance/)**;
> standing frameworks at renewal include
> **[ESPO 245_25](https://www.espo.org/grounds-maintenance-services-245-25.html)** and
> **[Fusion21](https://www.fusion21.co.uk/frameworks-grounds-maintenance)**. Plus below-threshold direct
> off **[Contracts Finder](https://www.contractsfinder.service.gov.uk/)** (set CPV-77 alerts). The animal
> is novel; the route to market isn't.
</details>

<details>
<summary><b>"I'm a council. I want to commission someone to host & run a government-built open-source AI tool (i.AI's Minute) for me — who can actually do this?"</b></summary>

> *(The genuine `claude -p` output — every listing URL is one `find_services` returned, not hand-picked.)*
>
> Minute is government-built open-source software, so you're not "buying Minute" — you're commissioning a
> supplier to **deploy, host and run** it (a Python/AI app). All real G-Cloud 14 listings (route
> **[G-Cloud / `RM1557.14`](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud)**, direct
> award or further competition), shaped exactly as "take this open-source app and host/run it for us":
>
> *Host **and** run an open-source app:*
> - [Open Source Hosting](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/166034022607510) + [Open Source Support](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/865534885438374) — [Axis12](https://find-and-update.company-information.service.gov.uk/company/07215135): ISO 27001 hosting built for open-source; support covers Minute's stack (Python, Django, Linux).
> - [Open Source Managed Service](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/366728421452886) — [Sirius Open Source](https://find-and-update.company-information.service.gov.uk/company/11014042): a fully managed service for running open-source software.
> - [Open source cloud hosting, maintenance and support](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/843654222495481) — [Tailwind Digital](https://find-and-update.company-information.service.gov.uk/company/13229454): aimed at **local government** end-to-end.
>
> *Build it into a deployment pipeline:*
> - [DevOps, Engineering & Delivery](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/849776947742547) — [Daemon Solutions](https://find-and-update.company-information.service.gov.uk/company/03442937): CI/CD for "any application deployment or migration."
>
> It flags the bit it can't see — Minute needs a speech-to-text/LLM backend, so confirm each supplier
> hosts that AI component and where data sits (UK region). **govbuy now searches what suppliers actually
> sell — 117,829 listings across 6 catalogues — so the answer is concrete services you can open and call
> off, not just a framework name.**
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
