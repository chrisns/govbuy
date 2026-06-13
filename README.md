# govbuy — the UK public-procurement co-pilot

Ask your AI assistant **how to buy** a thing across the UK public sector, **where to sell it** as a
vendor, or **how public money flows** as a researcher — and get a complete, **source-anchored**,
decision-grade answer. govbuy fuses three layers no other tool holds together:

- **Route** — 3,200 frameworks & dynamic markets, **117,829** catalogue listings, the lots, mechanics and documents a compliant purchase needs — and where a framework publishes no supplier list or mechanic, **backfilled from real awards** (who's *actually* been awarded call-offs on it).
- **Reality** — **658k** real tender awards joined on Companies House CRN: who actually wins the work, what buyers really pay, what's live, what's *coming* (29k forward pipeline notices), and what's *expiring* (re-procurement deadlines + incumbent-displacement windows).
- **Statute** — the **Procurement Act 2023** mechanics (standstill, competitive flexible procedure, exclusions, debarment) so the route isn't just available but *defensible*.

That makes it **decisive** — ask `buy` and one verb returns the opinionated brief *and* a head-to-head
decision matrix of the alternative routes (speed × competition × price × supplier depth × runway), not a
database dump — and **bulletproof**: every supplier is exclusion-checked against **both** PA2023 limbs — a **live
Companies House** insolvency check *and* the **s.62 debarment register** — and every claim ships its
source URL. Route × reality × statute, for buyers, suppliers and researchers alike.

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

## The co-pilot in action

<details>
<summary><b>"I'm a council. I need to host a containerised web app for ~£80k/year. Just tell me how to buy it." — one call to <code>buy</code></b></summary>

> *(Real `claude -p` — `buy` composes route + shortlist + price + exclusion + alternatives + PA2023 into one brief.)*
>
> **Route:** call off **[G-Cloud 14 (`RM1557.14`)](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/)** — call-off without further competition (expires **28 Oct 2026**, award before then). A GPC card / marketplace billing is **not** a route.
> **Shortlist** (real listings, CRN-matched delivery record): [Platform.sh Managed Cloud Hosting](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/559499857886093) — CTI Digital £1.85m/3 call-offs; Nublue £149k/2; [Dell Cloud Hosting (OpenShift)](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/966032847531194) — **£182.7m / 491 call-offs**. None carry an exclusion flag.
> **What it should cost** (19,319 comparable CPV-72 call-offs): p25 £60.6k · **median £176k** · p75 £707k — your £80k/yr sits above p25; a 3-yr call-off (~£240k) lands near the median.
> **Compliance steps:** a framework call-off is NOT a statutory direct award (ss.41/43 don't apply); check the [s.62 debarment register](https://www.legislation.gov.uk/ukpga/2023/54/section/62) + Sch 6/7 exclusions + each supplier's live Companies House status; standstill not required for a straight call-off; keep a most-economically-advantageous audit note. Indicative — not legal advice; you run the assessment.
</details>

<details>
<summary><b>"I need a managed SOC for a council. Compare the viable routes and tell me which to pick." — <code>buy</code> returns the decision matrix</b></summary>

> *(Real `claude -p` — `buy`'s alternative_routes score each route on speed × supplier-depth × runway × real price.)*
>
> The purpose-built route is the **[Cyber Security Services 3 DPS (RM3764.3)](https://www.gca.gov.uk/agreements/RM3764.3)**: 26 cyber-specialist suppliers, ~32 months' runway, but as a dynamic market it needs a **further competition** (competitive flexible procedure + 8-day standstill) — moderate speed, no direct award. For speed over specialism, direct-call-off a managed-security line from **[Technology Services 4 (RM6190)](https://www.gca.gov.uk/agreements/RM6190)** (open framework, 345 suppliers, ~24 months) or **[Network Services 3 (RM6116)](https://www.gca.gov.uk/agreements/RM6116)** (176 suppliers, only ~13 months' runway — re-procure sooner). Price anchor: real CPV-72 call-offs run a **median ~£176k** (n≈19,300). **Pick RM3764.3** — the only route with a genuine SOC supplier pool and the longest clean runway; the further-competition step buys the price tension + assurance evidence a council needs for something this sensitive. Caveat it volunteers: it's a legacy DPS, so plan around the **dynamic-markets sunset (Feb 2029)** — comfortably inside your window, but don't sign a call-off that outlives a successor without a transition plan.
</details>

<details>
<summary><b>"We're about to award to a supplier called TAD Architects. Are they safe?" — the exclusion gate</b></summary>

> **⚠️ Stop — do not award without re-checking.** govbuy's **two-limb** exclusion check flags **Companies House status: `liquidation`** ([CRN OC347430](https://find-and-update.company-information.service.gov.uk/company/OC347430)) — a **PA2023 Schedule 6/7 (insolvency) ground** a contracting authority must consider — *and* confirms the firm is **not on the s.62 debarment register** (checked, with a source). For a single supplier the insolvency status is a **live Companies House lookup at query time** (`exclusion.insolvency.source = live_companies_house`), not a stale snapshot. Plus **no delivery record** in 658k awards (£0 / 0 call-offs) — absence of evidence, not proof of incapacity, but nothing to lean on either. (`buy` will find compliant alternatives.) **No other procurement tool stops you here.**
</details>

<details>
<summary><b>"A statutory direct award under PA2023 — when is it allowed, and is it the same as buying off G-Cloud?" — statutorily precise</b></summary>

> Straight from `framework` (the call-off path), source-anchored to legislation.gov.uk: a **statutory direct award** is "no competition, by exception" — lawful only on a **Schedule 5** ground **and** a **[s.44 transparency notice](https://www.legislation.gov.uk/ukpga/2023/54/section/44)** published first. Buying off G-Cloud is a **framework call-off under s.45** — you apply the framework's own award mechanism; you do **not** invoke Schedule 5 or publish that notice. The mandatory **[8-working-day standstill (s.51)](https://www.legislation.gov.uk/ukpga/2023/54/section/51)** applies to competitive awards but is exempt for call-offs. **Bottom line: don't call a G-Cloud purchase a "direct award" in your business case — call it a framework call-off, or you'll fail an audit on the labelling alone.** This was the model's hardest question; now it's nailed.
</details>

## What's inside

| | |
|---|---|
| Framework operators | **147** — GCA/CCS, G-Cloud, every HE consortium, local-gov POs, NHS national + regional + pharma hubs, BlueLight Commercial, Defence Digital, Scotland / Wales / NI CPD, combined authorities, the housing / construction / highways / education consortia layers |
| Frameworks, DPS & dynamic markets | **3,207** (3,108 live for call-off) |
| Suppliers | **28,272** — 99.2% resolved to a Companies House CRN |
| Appointed-supplier edges | **57,055** (77% of frameworks carry a supplier list) |
| Catalogue **listings** (what suppliers actually sell) | **117,829** across 6 buying catalogues — G-Cloud 14 (43,733), Azure Marketplace (38,928), YPO (23,459), ESPO (11,621), NHS Buying Catalogue (48), NDX (40) — each a citable listing URL with a full description, searchable by capability via `buy`. All crawlers are deterministic + token-free re-runnable. |
| Real awards **fused in** (route × reality) | **658k** award lines across **461k** awarded processes and **11.9k** buyers, from the UK Tenders corpus, welded on Companies House CRN — powering proof-of-delivery, price benchmarks, live pipelines and spend x-rays ([fusion ACs](docs/fusion-acceptance.md)) |
| Forward **pipeline** + **expiry radar** | **29,306** planned notices (what's *coming*) + every contract's end date (what's *expiring*) — `sell` (and `buy`'s alternatives) turn the latter into seller displacement windows and buyer re-procurement deadlines ([top-5 ACs](docs/top5-acceptance.md)) |
| **Procurement Act 2023** engine | 15 sourced statutory rules (standstill, competitive flexible procedure, Schedule 5 direct-award grounds, debarment, KPI duty, payment-method-blind) make `framework` / `buy` *defensible*, not just available |
| **Exclusion** gate (two PA2023 limbs) | **1,790** suppliers flagged dissolved / in liquidation / administration (Sch 6/7) — and for a single supplier a **live Companies House** status check at query time — *plus* the **s.62 debarment register** (published by gov.uk; currently blank, checked anyway so govbuy can state *not debarred* with a source). A ⚠ "can I even use this supplier?" gate. |
| **Observed-from-awards** backfill | **3,910** supplier×framework edges + observed call-off mechanics mined from the 658k awards — so a framework with **no published supplier list or mechanic** still shows who's *really* won call-offs on it and how (`framework`'s `observed_from_awards`), clearly labelled inferred-not-official |
| Supplier identity | **28,272** suppliers, 99.2% CRN-resolved; **5,181** split identities (same company under the GCA spine *and* the Digital Marketplace) collapsed by a **canonical-CRN map**, so a supplier's full framework footprint shows in one profile |
| How-to-call-off mechanics | direct award vs further competition on **71%** of frameworks (more where observed-from-awards backfills it) |
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

## Tools — five verbs, the way you think

The surface is **five intent verbs**, not a database of knobs — so any MCP client (and you) routes by what
you're actually trying to do. Each takes `depth: "brief" | "full"`. Behind them sit the deduped capability
functions the verbs compose.

| Verb | What it does |
|------|--------------|
| `buy({need, cpv?, budget_gbp?, depth?})` | **Buyer — "how do I buy X?"** One opinionated, source-anchored brief: recommended route + PA2023-correct call-off mechanic, a ranked shortlist of real catalogue listings (each with CRN delivery record + a two-limb exclusion check), an indicative market price, forward-pipeline notices, **alternative routes** (a decision matrix on speed / competition / supplier-depth / expiry-runway / real price), and a compliance checklist. Falls back to a route-first brief for DPS/framework-only needs with no catalogue listing. `depth:"full"` adds the candidate-route list, the by-channel price distribution, and the PA2023 mechanic detail. |
| `sell({product, cpv?, open_only?, depth?})` | **Seller — "how do I sell X / get on a framework?"** Frameworks & live DPS you can JOIN, frameworks ranked by REAL call-off spend, LIVE + FORWARD opportunities, incumbents to displace (contract-end windows), and resellers/thin-primes who can carry you in. |
| `supplier({query, depth?})` | **Buyer/Researcher — one firm** by name or CRN: a **two-limb PA2023 exclusion check** (a **live Companies House** insolvency status + the **s.62 debarment register**), the canonical-reconciled framework footprint, `frameworks_evidenced_by_awards`, and the CRN-matched delivery record (call-off £, concentration, competitive-vs-direct mix, CPV footprint, contract-ends). |
| `framework({id?, rm_reference?, depth?})` | **One instrument:** lots, lifecycle, appointed suppliers, `observed_from_awards` backfill (who's really won call-offs where the official list is absent — labelled inferred), a `coverage` signal, AND the PA2023-precise call-off path (permitted mechanics + the statutory rules; a call-off is **not** a statutory direct award). RM lookups return the canonical GCA agreement. |
| `research({sql?, cpv?, schema?, status?})` | **Researcher — the power surface:** a single read-only BigQuery `SELECT`/`WITH` over `govbuy_public` (byte-capped); or a **spend & competition x-ray** for a CPV division (channel mix + top-5 concentration); or the `schema` / freshness + `status`. |

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

> A one-liner via `research({sql})` returned 119 rows; deduped, the national headliners are
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
> (low-five-figures/yr). **How to buy it compliantly** (`framework`): G-Cloud 14 (`RM1557.14`) permits
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
  crash/rate-limit-resilient; rebuilds never re-hit the CH API. For a *single* supplier (the `supplier` verb) the exclusion gate additionally does a **live CH status lookup at query time** (when the
  service holds a CH key), so an about-to-award check sees the current status, not the snapshot.
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
