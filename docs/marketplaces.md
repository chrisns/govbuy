# Catalogue & marketplace coverage — what we ingest vs. what we've missed

govbuy now ingests **per-listing service descriptions** from the one UK public marketplace that
publishes them at scale and in the open: the **Digital Marketplace / G-Cloud 14** (43,733 services,
each a citable `applytosupply.../g-cloud/services/<id>` listing). This is what lets a capability
question ("host this app", "an M365 mailbox", "a service desk") resolve to concrete services, not
just a framework name.

Below is the inventory of the *other* per-item catalogues — the next ingest targets, and the ones
that aren't worth it (and why). "Per-item" = browsable listings of individual services/products,
the analogue of a G-Cloud service page.

## Ingest targets (public, structured, per-item) — ranked

| Catalogue | URL | Public listings? | Scale | Domain | Difficulty |
|---|---|---|---|---|---|
| **NHS Buying Catalogue** (Digital Care Services, ex-GP IT Futures) | `buyingcatalogue.digital.nhs.uk` | Yes — browse + per-solution pages open; only ordering is walled | ~48 solutions, very rich (capabilities, hosting type, list price, standards) | Clinical IT (GP systems, online consult, video, analytics) | Easy structured HTML. **Caveat:** underlying frameworks expired; a Digital Primary Care successor is due ~Apr 2026 — treat as transitional. |
| **NDX — National Digital Exchange** | `ndx.digital.cabinet-office.gov.uk/catalogue/` | Yes — catalogue browsable; login only for sandbox | ~42 products now, designed to grow (DSIT, beta Jun 2025) | Cloud infra, AI tools, ITSM, CRM, citizen engagement; local-gov focus | Easy structured HTML. **This is the stated G-Cloud successor** ("app store for gov"); highest strategic value to track. |
| **ESPO online catalogue** | `espo.org/products` | Yes — category tree + item pages public; *prices* may be login-walled | ~28,000 products | Physical goods (furniture, stationery, catering, AV/ICT) for schools/councils/NHS | Medium. Consistent URL patterns; item name/SKU/description crawlable, pricing uncertain. |
| **YPO online catalogue** | `ypo.co.uk/products` | Yes — category tree + item pages public; prices likely login-walled | ~23,000 products | Physical goods (art, curriculum, FM, ICT) for public sector | Medium. Same shape as ESPO. |
| **AWS Marketplace** | `aws.amazon.com/marketplace` | Yes — per-product pages fully public | 12,000+ listings | Cloud SaaS/AMI/containers/pro-services; many G-Cloud suppliers also list here | Medium-hard. Rich static product pages; large scale; cross-references enrich G-Cloud supplier profiles. |
| **Azure / AppSource** | `marketplace.microsoft.com` | Yes — browse public | 5,000+ apps | Cloud apps; overlap with G-Cloud suppliers | Medium-hard. JS-heavy SPA — needs headless rendering. |
| **Google Cloud Marketplace** | `cloud.google.com/marketplace` | Yes — product pages public | 2,000+ | GCP VMs/SaaS/data | Medium-hard. JS-heavy console UI. |

The three hyperscaler marketplaces matter for a specific reason: G-Cloud *consumption* often bills
through them, and the same suppliers list in both places — so they enrich, not replace, the G-Cloud
service index.

## Not worth ingesting (and why)

- **Login-walled** (register to see items): GCA eMarketplace, GCA Purchasing Platform, GCA Print
  Marketplace, **NHS Supply Chain** catalogue (pricing behind NHS auth; a public pilot exists at
  `pilot.supplychain.nhs.uk` — revisit if it opens), **BlueLight Procurement Database**, **Spark DPS**.
- **Framework-level only** (no per-item listings — already covered by govbuy's framework layer):
  DfE *Get Help Buying for Schools* (aggregates ESPO/YPO), Scotland Excel contract directory, NEUPC,
  NOE CPC, Sell2Wales (a tender-notice portal, not a catalogue).
- **Not a catalogue**: **DOS / DOS7** (RM1043.9) — an opportunities board where buyers post needs
  and suppliers respond; there are no per-service listings to ingest. Crown Hosting (bespoke quotes).
- **Expired / closed**: NHS Health Systems Support Framework (HSSF).
- **Member-walled**: Jisc services and subscriptions catalogues (403 to anonymous fetch).

## Backend-API findings — and what got ingested

All the JS-rendered catalogues turned out to sit on **public, replayable SaaS search APIs** (the keys
are client-side config, shipped to every browser — not secrets). Captured via Playwright network
inspection, then replayed server-side as deterministic, **token-free** crawlers:

- **ESPO** → **Klevu** v2 search (`eucs32v2.ksearchnet.com/cs/v2/search`, apiKey `klevu-169116356914516627`). **INGESTED: 11,621 products.**
- **YPO** → **Sitecore Discover** (`discover-euc1.sitecorecloud.io/discover/v2/245100621`, `Authorization` = the public `VITE_API_KEY` from `/dist/config.json`, entity `ypocontent`, widget `rfkid_7`). **INGESTED: 10,000** (Discover caps deep pagination at ~10k).
- **Azure Marketplace** → gallery pages (`marketplace.microsoft.com/en-gb/marketplace/apps?page=N`) are SSR with embedded `"bigId"`s (needs a browser UA); the public `catalogapi.azure.com/products?$filter=bigId in (…)&storefront=any` enriches them to full objects (name/summary/description/publisher/categories). **INGESTED** — tagged `catalogue="azure"`, capability-search only (see below).
- **AWS Marketplace** → client-rendered; search runs on a Coral RPC at `discovery.marketplace.us-east-1.amazonaws.com` that needs an `X-Amz-Target` operation header (and likely SigV4 signing) — no clean token-free replay. **NOT ingested.**
- **GCP Marketplace** → the public `cloud.google.com/marketplace` page is SSR but exposes only ~72 *featured* products; the full catalogue lives in `console.cloud.google.com/marketplace`, which is auth-walled. No token-free full enumeration. **NOT ingested.**

### Hyperscaler marketplaces are a catalogue, never a route
govbuy's model classifies hyperscaler marketplaces as **`marketplace_consumption` — explicitly NOT a
route** (consumption bills *on top of* a route like G-Cloud; it isn't itself a way to procure). So
Azure listings are ingested ONLY as a capability-searchable catalogue (tagged `catalogue="azure"`),
making "what's on Azure that does X" findable — but `find_routes`/`instrument` never treat it as a
route. AWS/GCP stay out purely because they expose no token-free enumeration.

## Takeaway

For *digital/technology* capability search, G-Cloud (done) + NHS Buying Catalogue + NDX cover the
publicly-catalogued ground; the hyperscaler marketplaces are enrichment. For *physical goods*, ESPO
and YPO are the two large open catalogues. Everything else is either login-walled, framework-level
(already indexed), or not a catalogue at all.

_Sources verified by fetch June 2026. Not the authority of record._
