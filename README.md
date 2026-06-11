# govbuy — UK route-to-market MCP

Ask your AI assistant **how to buy** a thing across the UK public sector, **where to list it and who
can prime you in** as a vendor, or **how public money actually flows** as a researcher — and get a
complete, current, **source-anchored** answer. govbuy maps the **route** (the frameworks and dynamic
markets that fit, their lots, permitted award mechanics, the documents a purchase needs, the appointed
suppliers, and the resellers/primes like Bramble Hub that can carry an off-framework product to market)
and **fuses it with the reality** — 658k real tender awards joined on Companies House CRN — so every
answer also knows **who actually wins the work, what buyers really pay, and what's open to bid right
now**. Route × reality, for buyers, suppliers and researchers alike.

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
| Suppliers | **28,272** — 99.2% resolved to a Companies House CRN |
| Appointed-supplier edges | **57,055** (77% of frameworks carry a supplier list) |
| Catalogue **listings** (what suppliers actually sell) | **117,829** across 6 buying catalogues — G-Cloud 14 (43,733), Azure Marketplace (38,928), YPO (23,459), ESPO (11,621), NHS Buying Catalogue (48), NDX (40) — each a citable listing URL with a full description, searchable by capability via `find_services`. All crawlers are deterministic + token-free re-runnable. |
| Real awards **fused in** (route × reality) | **658k** award lines across **461k** awarded processes and **11.9k** buyers, from the UK Tenders corpus, welded on Companies House CRN — powering proof-of-delivery, price benchmarks, live pipelines and spend x-rays ([fusion ACs](docs/fusion-acceptance.md)) |
| How-to-call-off mechanics | direct award vs further competition on **71%** of frameworks |
| Spend coverage | **91.4%** of framework-attributable UK public spend |

GCA and G-Cloud are ingested **deterministically** from their APIs/directories; everything else is
agentic with a hard anti-fabrication gate. [docs/STATUS.md](docs/STATUS.md) is the honest gap map;
[docs/access-barriers.md](docs/access-barriers.md) inventories the login-walled supplier lists.

Built on, and now **fused with**, [`find-tender-mcp`](../cddo/find-tender-mcp) (the UK Tenders corpus —
every tender & award): govbuy holds the **route** and welds it to that **reality** on Companies House
CRN, so it serves buyers, suppliers *and* researchers from one place. It **documents** routes; it does
**not** assemble the purchase or give legal advice, and it is not the authority of record. See
[VISION.md](VISION.md), [docs/PRD.md](docs/PRD.md), the [ADRs](docs/adr/), the glossary in
[CONTEXT.md](CONTEXT.md), the [fusion acceptance criteria](docs/fusion-acceptance.md) and the
[marketplace inventory](docs/marketplaces.md).

## Tools

| Tool | What it does |
|------|--------------|
| `find_routes` | **Buyer:** instruments/lots that fit a need + permitted award mechanics + required docs + GPC/marketplace caveats. Doesn't rank or assemble the buy. |
| `get_instrument` | One framework/dynamic market: lots, lifecycle status, mechanics, buying docs, appointed suppliers (each with a membership qualifier + evidence). RM lookups return the canonical GCA agreement, not a reseller's listing of it. |
| `find_services` | **Capability search (semantic + proof):** given a need ('host an open-source app', 'transcribe meetings', 'a desk'), the specific catalogue **listings** that do it — by meaning (vector search, so it matches with no shared keyword) and keyword. Each carries the citable listing URL, the supplier's **real call-off track record** (£ won on that framework), an indicative price, and months-to-expiry. Answers "who can actually do this *and delivers it*", not just "which framework". |
| `compliant_path` | **How to actually buy it:** instrument/RM → the permitted award mechanic (direct award vs further competition) + conditions + buying documents + the "a GPC card / marketplace is **not** a route" caveats. The next steps. |
| `benchmark_price` | **Buyer:** the real £ distribution the public sector actually paid for a category (median, p25–p75, overall + by channel) from 658k awards — list price → market price. |
| `due_diligence` | **Buyer:** is this supplier safe? CRN-matched delivery record — call-off £, customer concentration, competitive-vs-direct mix, CPV footprint, contract-end dates. |
| `find_instruments_to_list` | **Seller:** instruments a vendor can be appointed to (open frameworks / dynamic markets) + how-to-apply. |
| `supplier_pipeline` | **Seller:** the whole go-to-market in one call — live opportunities to bid, frameworks ranked by *real* call-off spend, incumbents to displace + contract-end windows, and resellers who could carry you in. |
| `spend_xray` | **Researcher:** how public money flows in a category (framework call-off vs open tender vs direct award) + market concentration (top-5 share). |
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

> Strange product, **honest** answer — and the honesty is the point. Searching 658k real awards for
> grazing/goats returns **18 rows, almost all false positives** (Mountain Goat = a Cumbria tour operator,
> Dancing Goat = coffee); the one genuine conservation-grazing award is **Precision Grazing → Rothamsted,
> ~£9,940 — a below-threshold quote**. There's **no grazing framework** and no live grazing tender, because
> the work is sub-£30k, let locally, or sits in agri-environment *grants* (ELM / Countryside Stewardship)
> outside procurement. The tendered money flows through grounds-maintenance (CPV 77) primes — **idverde
> ~£189m, Glendale ~£200m, Tivoli ~£97m, Ground Control ~£46m**. So the route is: set
> **[Contracts Finder](https://www.contractsfinder.service.gov.uk/)** alerts for sub-threshold local
> notices, **subcontract** to those primes, and go direct to Wildlife Trusts / National Parks / MoD. The
> animal's absurd; the answer is rigorous — including telling you where the money *isn't*.
</details>

<details>
<summary><b>"I'm a council. I want to commission someone to host & run a government-built open-source AI tool (i.AI's Minute) for me — who can actually do this?"</b></summary>

> *(The genuine `claude -p` output — fused across catalogue, 658k real awards and Companies House.)*
>
> One call returns the whole decision. The precise-fit listing is
> **[Python/Django Hosting & Application Support](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/780052264537990)**
> from **[Torchbox Ltd](https://find-and-update.company-information.service.gov.uk/company/03983354)** (the
> Wagtail/Django shop — Minute is a Django app). Its **CRN-matched delivery record**: £3.46m across **18
> public-sector call-offs, 100% won competitively (0% direct award)**, 6 buyers, top buyer ONS at 41.7%
> (no single-customer risk), active to Apr 2027. **What comparable hosting costs:** the seven-figure
> medians are multi-year programmes — hosting one Django app for a council sits at the low end
> (low-five-figures/yr). **How to buy it compliantly** (`compliant_path`): G-Cloud 14 (`RM1557.14`) permits
> **call-off with no further competition** — but record the most-economically-advantageous assessment, sign
> the call-off contract (that *is* the procurement) **before it expires 28 Oct 2026**, and a GPC card is not
> a route. Service → real cost → proven, competitively-won delivery → compliant next step, end to end.
</details>

## Route × reality — the questions that need every source

Fused with the UK Tenders corpus (**658k real awards**) on Companies House CRN, govbuy answers what
neither a framework directory nor a tender database could alone. All real `claude -p` output.

<details>
<summary><b>"Is the public sector overpaying by buying IT through framework call-offs instead of open competition?"</b></summary>

> For the *typical* buy, yes: in IT services the median **framework call-off is £174,740 vs £107,800 for
> open tender** — a ~62% "convenience premium" — and **70.8% of the £22.9bn flows through call-offs, just
> 5.4% through open tender**. But it inverts at the top: open-tender *means* are higher (£3.3m vs £1.6m)
> because the genuinely huge programmes go to open competition. So frameworks aren't overpaying for the
> mega-deals — the leakage is the **routine £60k–£700k middle** that dominates the flow, where the lever is
> forcing a real further-competition at call-off rather than a direct award. Concentration is low (top-5 ≈
> 8% of spend), so it's broad competition — just happening *inside* the frameworks, not in the open market.
</details>

<details>
<summary><b>"Map the 'thin-prime' economy — who fronts other companies onto public frameworks, and how much money flows to that layer?"</b></summary>

> govbuy traces **~£4.0bn of call-off spend to 17 resellers** selling other firms' products:
> **[Softcat](https://find-and-update.company-information.service.gov.uk/company/02174990) £972m**,
> [Phoenix Software](https://find-and-update.company-information.service.gov.uk/company/02548628) £775m,
> [CDW](https://find-and-update.company-information.service.gov.uk/company/02465350) £556m,
> [Computacenter](https://find-and-update.company-information.service.gov.uk/company/01584718) £410m,
> [boxxe](https://find-and-update.company-information.service.gov.uk/company/02109168) £260m,
> [Bramble Hub](https://find-and-update.company-information.service.gov.uk/company/04136381) £109m… Two
> models: the big VARs (Softcat/Phoenix/CDW) are Microsoft/Dell/Cisco licence-and-hardware conduits; the
> pure thin-primes — [Bramble Hub carries **18 vendors**](https://www.bramblehub.co.uk/partners/) incl.
> Faculty (AI), Version 1, NEC — are contracting vehicles for SMEs that can't hold framework compliance
> alone. The public buyer often never contracts the firm that actually does the work.
</details>

<details>
<summary><b>"I'm a challenger cloud SME — find me an incumbent on a big contract that's expiring, and tell me how to compete."</b></summary>

> **AWS** holds the biggest G-Cloud 14 cloud-hosting call-off: **£18.1m from ICS (for DSIT/DESNZ), ending
> 30 Sep 2027** — your displacement window (re-competes start ~12 months out). It's won ~£28m across these
> buyers, and a tell: AWS bills via a foreign branch
> (**[CH FC034225](https://find-and-update.company-information.service.gov.uk/company/FC034225)**) as
> **direct call-offs, no further competition** — spend awarded without a competition you could bid into.
> Your way in: get on **G-Cloud 15** (G-Cloud 14 closes 28 Oct 2026 and is shut to new entrants), or ride
> in *now* via thin-prime
> **[Bramble Hub](https://find-and-update.company-information.service.gov.uk/company/04136381)** — then push
> those buyers to run a *further competition* at renewal instead of re-awarding by default.
</details>

<details>
<summary><b>"Which 'live' tech frameworks are dead paper — appointed suppliers but no real spend — so I don't waste a bid?"</b></summary>

> **[Transport Technology (`RM6347`)](https://www.gca.gov.uk/agreements/RM6347)** — 191 appointed
> suppliers, **not one traceable call-off**, live to 2027. **[Cloud Compute 2 (`RM6292`)](https://www.gca.gov.uk/agreements/RM6292)**
> — 91 suppliers, £81k, while cloud demand pours through G-Cloud 14 (~£835m). And the intellectually-honest
> part govbuy volunteers unprompted: this is "no call-off we can *attribute*" — most awards carry no
> framework reference, so a flagship like **[TS4 (`RM6190`)](https://www.gca.gov.uk/agreements/RM6190)**
> showing only £332k is an attribution gap, **not** dead paper. It tells you what it can prove *and what it
> can't*.
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
