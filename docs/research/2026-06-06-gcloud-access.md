# Measured/researched: G-Cloud & Digital Marketplace programmatic access

> Research workflow run 2026-06-06 (`digital-marketplace-api-access`, 4 finders + synthesis).
> Web-sourced June 2026; verify before treating figures as authoritative.

## Bottom line for the "API key form" question

**There is no form. Stop looking for a Digital Marketplace API key.** Confirmed across all four
research passes: the official Digital Marketplace Data API (`/services`, `/suppliers`) is
bearer-token-gated and **internal-only** — no developer portal, no self-service application, no
public token issuance, and the 2019 API docs site is 404. A non-government person cannot get a key.
(A privileged internal token would also sit awkwardly under a *public, unauthenticated* index.)

## The marketplace-count premise — half right

The hunch "there are multiple digital marketplaces because there are concurrent G-Clouds" is **wrong
on the mechanism but right that there's plurality**:

- **Only one G-Cloud iteration is buyable at a time.** As of June 2026 that's **G-Cloud 14
  (RM1557.14)**, extended to **28 Oct 2026**. **G-Cloud 13 is closed** (existing call-offs run out
  their term; no new call-offs). **G-Cloud 15** is awarded (applications closed 30 Jan 2026) but
  **not live for buying until ~Sept 2026**. So it's one buyable catalogue, not three.
- **The true plurality is in *platforms*, not G-Cloud versions:**
  1. **Public browse catalogue** — `applytosupply.digitalmarketplace.service.gov.uk` (public, HTML,
     no login). The priced service/supplier catalogue.
  2. **Contract Award Service (CAS) via the Public Procurement Gateway (PPG) login** — where buyers
     actually run call-offs/awards. Buyer-only; not a data source. ("Public Procurement Gateway" is
     the SSO login, *not* a separate marketplace — blog claims otherwise are inaccurate.)
  3. **PA2023 Central Digital Platform (CDP) = enhanced Find a Tender** — notices + a gated supplier
     registry, **not** a priced catalogue.
  4. **Third-party operator marketplaces** (Bloom NEPRO3, etc.) — commercial, not government.
- **The legitimate sense in which the hunch is true:** call-off contracts under *several past G-Cloud
  generations* (12/13/14…) run concurrently at any moment — buyers bought at different times. So
  govbuy must model **each iteration as a distinct instrument** with its own supplier list and
  validity window, even though only the latest is buyable (see "Instrument status" in CONTEXT.md).

## Ingestion posture (refines ADR-0002)

| Slice | Route | Type | Auth | Verdict |
|---|---|---|---|---|
| Notices + awards (incl. G-Cloud call-off awards: supplier + value) | Find a Tender OCDS API `…/api/1.0/ocdsReleasePackages` | **Deterministic API** | none (OGL) | **Backbone.** Incremental via `updatedFrom`/`updatedTo`+cursor. Already reachable via the sibling. |
| Same, bulk backfill/seed | OCP Data Registry `data.open-contracting.org/en/publication/41`; data.gov.uk monthly XML | **Open bulk** | none | Seed, then switch to API deltas. JSONL cleanest. |
| G-Cloud priced **catalogue** (service descriptions, pricing, lots, supplier A-Z) | scrape `applytosupply.digitalmarketplace.service.gov.uk/g-cloud/search`, `/g-cloud/services/{id}`, `/g-cloud/suppliers` | **Scrape-only** | none (no login) | **Only option.** HTML-only, brittle, ToS/rate-limit risk; stable numeric service IDs help. Best-effort sidecar, not authoritative. Reference impl: open-source "UK Digital Marketplace Data Extractor" (tractorjuice, Python, no key). |
| Digital Marketplace Data API | `/services`,`/suppliers` | API but token-gated | bearer (internal) | **Unavailable — do not pursue.** |
| CDP supplier register (financials, connected persons, PPON, exclusions) | CDP data-sharing | gated | per-authority key + supplier share code | **Unavailable to non-gov.** Surfaces publicly only when embedded in a published award notice — i.e. it arrives via OCDS anyway. |

**Posture:** Find a Tender OCDS is the deterministic backbone (seeded from OCP/data.gov.uk bulk);
the **G-Cloud catalogue is a separate scrape-only sidecar with no SLA** — it *will* break when
applytosupply HTML changes and when G-Cloud 15 goes live. Architect nothing around a catalogue API
token.

## Diary

- **~Sept 2026 (G-Cloud 15 go-live):** re-check whether GC15 is publicly browsable on applytosupply
  or only via CAS/PPG, and whether GCA finally publishes an open catalogue dataset/OCDS feed. Most
  likely event to break the scraper and/or open a better route.

## Dead ends (don't waste time)

2013 CloudStore data.gov.uk dataset (stale); archived 2019 API docs (404); DOS `opportunity-data.csv`
(DOS not G-Cloud, stale ~2016); any CDP supplier-register access for non-gov (closed).
