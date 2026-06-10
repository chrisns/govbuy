# govbuy — status & gaps

_UK public-sector route-to-market MCP. Sibling of find-tender-mcp; same `govreposcrape` GCP project,
distinct hostname `govbuy.run.cns.me/mcp` and codebase._

## Where we are

| | |
|---|---|
| Operators (with ≥1 framework) | **147** (185 rows incl. catalogue-blocked) |
| Frameworks / DPS / dynamic markets | **3,207** (3,108 live for call-off) |
| Suppliers | **28,247** — **28,031 CRN-matched (99.2%)** via Companies House |
| Appointed-supplier edges | **57,055** |
| Frameworks with a supplier list | **2,455 (77%)** |
| Frameworks with how-to-call-off mechanics | **2,289 (71%)** |
| Spend coverage (RM-attributable) | **91.4%** |
| Acceptance | **11/11 (AC-1..11)** |

**Coverage spans every route a UK public buyer would use:** CCS/GCA + G-Cloud (deterministic, via
API + Digital Marketplace); all HE purchasing consortia; local-gov POs; NHS national + regional +
pharma hubs; BlueLight Commercial + police/fire; Defence Digital; devolved nations (Scotland/Wales/
NI CPD); combined authorities; the full housing / construction / highways / education consortia
layers; and a deep tail of council- and trust-led frameworks.

**How it's built (hybrid):** deterministic where an API exists (GCA frameworks + suppliers, G-Cloud
directory); agentic everywhere else (fetch → extract → **verbatim-substring gate** → load). The gate
is the anti-fabrication anchor: a supplier/framework name not present in the archived source is
quarantined, never published. Companies House matching is incremental + crash/429-resilient.
Extraction workflows run on **Haiku** (gate-protected, cheap); re-discovery on Sonnet.

## What's missing (and why)

### Supplier lists — 752 of 3,207 frameworks still have none, by reason ([details](access-barriers.md))
- **Login-walled — 328 frameworks. Needs credentials (actionable).** Highest-value single credential
  is **`hunterpcm.uk`** (Hunter CSM portal) → ~98 HE-consortia frameworks (NEUPC 72, APUC 21, LUPC 5).
  Then Pagabo (23), YPO (15), NHS LPP (13), TPPL (11), advantageswtenders.co.uk (10), CHIC (9).
- **No public list — 950.** Page loads but genuinely names no suppliers (managing-agent/DPS models
  that don't publish membership, e.g. 2buy2, Bloom-style pools). Not retrievable from the public web.
- **Blocked — 137.** JS-only/anti-bot pages (some transient and recovered on re-sweep; some are
  in-tend/carepulse portals that are effectively login-walled).
- **Dead link — 29.** Stale official_url.

### Award mechanics — 918 frameworks have no call-off route
The page and any linked user-guide PDF don't state direct-award vs further-competition. Inferring a
route would be fabrication (the gate forbids it). PDF user guides were the big unlock (44% → 71%).

### Capability search — service-level descriptions (DONE for G-Cloud; expanding)
govbuy now indexes per-listing **service descriptions**, so "find a supplier that hosts open-source
LLM apps / runs Kubernetes / offers X capability" resolves to concrete, citable listings via the
`find_services` tool (and the `service` table). Coverage:
- **G-Cloud 14 — 43,733 services** (every live listing: name, supplier, lot, full description), 99.9%
  supplier-resolved to a CRN. Deterministic crawl of the public Digital Marketplace search.
- **NHS Buying Catalogue (48)** and **NDX / National Digital Exchange (40)** — the other open digital
  catalogues.

Still to ingest (per [marketplaces.md](marketplaces.md)) — all JS-rendered, so each needs its backend
product API discovered (browser-assisted) then crawled: **ESPO** (~28k physical goods), **YPO** (~23k),
and the hyperscaler marketplaces (**AWS** static / **Azure** + **GCP** JS). Features/benefits
enrichment of the G-Cloud descriptions (Stage 2, detail pages) is a quality follow-up.

### Structural / upstream limits
- **GCA DPS & dynamic markets (27 live):** rolling membership not exposed by the GCA suppliers API.
- **No-public-catalogue bodies:** DE&S/DIO/AWE (defence), NHS commissioning support units, individual
  police forces, National Highways, Network Rail, NI departments, crown dependencies. They advertise
  per-tender on **Find-a-Tender** — that's the sibling find-tender-mcp's job, not framework-indexable.
- **Intelligence / classified procurement:** no public catalogue — genuinely unindexable.
- **Lot-level supplier membership:** captured at framework level; per-lot membership is partial.
- **Operator long tail:** breadth converged (genuinely-new/round 45→36→20→8→~5; re-discovery now
  returns Pagabo host-shells/dups). More minor single-framework council bodies always exist, but each
  is increasingly marginal.

## Next steps
1. **Credentials** for the login-walled portals (start with hunterpcm.uk) → unlocks ~98 + the rest.
2. Optional: headless-browser pass for the genuinely-JS `blocked` subset.
3. Nightly: `govbuy-ingest refresh` (deterministic GCA+G-Cloud spine) + the saved agentic workflows;
   no scheduler in infra — operator-hosted, cost-metered, with a liveness alert.

_Generated after the breadth/depth sweeps; figures from `govbuy_public`. Not the authority of record._
