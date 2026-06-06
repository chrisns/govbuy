# govbuy — Consolidated Domain Map

> Internal working document. Synthesised from an 8-agent parallel research workflow run on
> 2026-06-06 (`govbuy-domain-research`). Currency: June 2026. Governing regime: Procurement Act
> 2023 (PA2023), in force 24 Feb 2025. Claims are research-sourced (web, June 2026) and should be
> spot-verified against primary sources before being treated as authoritative in the index.

---

## 1. CCS vs GCA verdict (decided)

Use **Government Commercial Agency (GCA)** as the canonical entity; treat **Crown Commercial Service
(CCS)** as its former name (same continuing body, not a separate org). CCS was renamed/restructured
into GCA effective **1 April 2026** (announced 9 Feb 2026), merging CCS with several Cabinet Office
central commercial teams. GOV.UK's CCS page now states "It has been replaced by Government
Commercial Agency." `crowncommercial.gov.uk` 301-redirects to `gca.gov.uk`. **RM-numbered framework
references are unchanged** (e.g. RM1557.x, RM6190); existing frameworks, call-offs and contracts
remain legally valid. Any source dated before 1 Apr 2026 saying "CCS" means GCA.

**Do NOT conflate "GCA" with:**
- **GCF** — Government Commercial Function (the cross-government commercial profession/network,
  ~6,000 people, est. 2015): people, not a buying body.
- **GCO** — Government Commercial Organisation (central employer of senior Grade-7+ commercial staff
  within GCF).
- **GCCO** — Government Chief Commercial Officer (the post/person; Andrew Forzani).
- GCA leadership: CEO/Accounting Officer Sam Ulyatt, under GCCO Forzani. Legal status: trading fund +
  executive agency of the Cabinet Office (carried over from CCS).

---

## 2. Buying-route taxonomy (the spine)

Distinguish **commercial tools** (standing vehicles) from **award mechanics** (how you place an
order). The conflation of "framework", "DPS", "direct award" and "marketplace" is the dominant
terminology trap.

```
A. COMMERCIAL TOOLS (standing vehicles)
   ├─ Framework agreement (PA2023 s45)
   │    ├─ Closed framework  (fixed supplier list; 4yr / 8yr defence-utilities)  [default + legacy]
   │    └─ Open framework    (NEW: reopenable, ≤8yr scheme of frameworks)        [s49]
   ├─ Dynamic market (NEW: ss34-40; permanently open; awards via CFP only)       [replaces ↓]
   │    ├─ Dynamic Purchasing System (DPS)      [LEGACY PCR2015; ends ≤23 Feb 2029]
   │    └─ Qualification system (utilities)      [LEGACY UCR2016]
   └─ Catalogue / online marketplace             [usually sits ON a framework]

B. AWARD MECHANICS
   Within a framework:
     ├─ Call-off WITHOUT further competition  (single supplier / objective mechanism / catalogue price)
     │       ⚠ colloquially "direct award off the framework" — NOT statutory direct award
     └─ Further competition / mini-competition  (re-compete among framework suppliers; s46 criteria only)
   Within a dynamic market:
     └─ Competitive flexible procedure (CFP) — mandatory
   For a whole public contract (no standing tool):
     ├─ Open procedure                          (single-stage, all suppliers)
     ├─ Competitive flexible procedure (CFP)    (bespoke multi-stage)
     └─ Direct award (statutory, ss41-43)       (Schedule 5 grounds / s42 regs / s43 switch)

C. VALUE BANDS / INFORMAL
   ├─ Regulated below-threshold (Part 6; ~£12k central / £30k sub-central)
   └─ "Spot buy"  — informal label; maps onto a below-threshold RFQ/purchase
```

**Key PA2023 deltas vs legacy PCR2015:** (1) only two competitive procedures (open + CFP) — old menu
folded into CFP; (2) "open framework" is new; (3) "dynamic market" replaces DPS *and* qualification
systems, broader scope, permanently open; (4) statutory direct award tightly codified
(transparency-notice + standstill). Legacy PCR2015 frameworks/DPSs commenced before 24 Feb 2025
continue under transitional/saving provisions (SI 2024/716).

---

## 3. Framework-operator landscape

### GCA (formerly CCS) — central-government CPB

Tech/digital/AI agreements relevant to govbuy (RM references unchanged by the rename):

| Agreement | RM | Type | AI/tech relevance | Buying route |
|---|---|---|---|---|
| G-Cloud 14 | RM1557.14 | Framework (PCR2015) | **Primary route for off-the-shelf AI/LLM SaaS** (Lot 2 Cloud Software) | Direct call-off Lots 1–3; Lot 4 further-comp only. Expires 28/10/2026 |
| G-Cloud 15 | RM1557.15 | **Open framework (PA2023)** | Successor; not live as of June 2026 (award ~Sept 2026) | TBC |
| AI DPS | RM6200 | **Legacy DPS** | Purpose-built AI route (discovery/customisation/end-to-end) | **Further competition ONLY**; extended to 23/02/2029 |
| Big Data & Analytics | RM6195 | Framework | Lot 2 COTS incl. ML/AI software | Call-off + further comp. Expires 08/08/2026 |
| Technology Services 4 | RM6190 | **Open framework (PA2023)** | AI/automation as ancillary service; 9 lots | Both routes (Lots 1–5). Live 12/12/2025 |
| DOS7 | RM1043.9 | Framework (PA2023) | AI as bespoke build/specialists; consolidates DOS6 (RM1043.8) + DSP (RM6263) | Mostly further comp; some direct for specialists. Live 01/04/2026 |
| Vertical Application Solutions | RM6259 | Framework | Embedded/sector AI | Both. Closes 06/03/2027 |
| Back Office Software 2 | RM6285 | Framework | AI in ERP/HR/CRM/finance | Both. To 17/08/2027 |
| Public Sector Software Solutions | RM6396 | Framework (PA2023) | Formalises direct-contracting + aggregation | Tender docs ~Summer 2026 |

**Reference-number traps:** Technology Services 4 = **RM6190** (not RM6116 = Network Services 3); Big
Data = **RM6195** (not RM6202).

### Non-CCS operators (grouped by ownership/funding)

**(1) Local-authority-owned PBOs** (free-to-buyer; sub-1% supplier rebate): **YPO** (13 councils;
100+ frameworks incl. ICT; Apr 2026 10-yr Pagabo partnership), **ESPO** (6 authorities; 100+
frameworks incl. ICT/software), **NEPO** (12 NE councils; **owns NEPRO, the solution Bloom
operates** — NEPO is the legal contracting authority behind Bloom), **KCS / Commercial Services
(Kent)** (education + IT/tech; linked to Everything ICT), **Central Buying Consortium** (lower-
profile; verify).

**(2) Sector consortia:** **Procurement for Housing (PfH)** (social housing, operated by Inprova;
some tech), **UKUPC** (federation of 8 HE consortia: APUC, HEPCW, LUPC, NEUPC, NWUPC, SUPC, TEC,
TUCO; shared IT/software/AV), **Jisc** (education/research; strong native digital/network/cloud
frameworks + dynamic markets; AI mostly advisory via National Centre for AI), **Everything ICT**
(DfE-approved education ICT; KCS lineage).

**(3) NHS bodies:** **NHS Supply Chain / SCCL** (DHSC-owned; clinical/non-clinical goods & logistics,
not general tech), **NHS SBS** (DHSC + Sopra Steria JV; strong tech/digital/cyber frameworks), **NOE
CPC** (NHS-hosted; has a Digital & Technology Solutions category), **HealthTrust Europe** (private
GPO; some IT/clinical-tech).

**(4) Managed/commercial marketplaces & framework businesses:** **Bloom** (operates **NEPRO3**, owned
by NEPO; managed professional-services marketplace with a Technology category; **5% supplier-paid
fee**, free to buyer; NEPRO3 runs to 31 Aug 2027, NEPRO4 re-procurement underway), **Pagabo**
(construction/infra/consultancy; pay-as-you-go; some tech/platform scope), **Fusion21** (social
enterprise; works/housing; limited tech).

**Tech/AI operators worth flagging:** GCA, Bloom (Technology), YPO, ESPO, KCS, NOE CPC, NHS SBS,
Jisc, Everything ICT, UKUPC, Pagabo.

---

## 4. Reseller / prime model

Three structurally distinct intermediary types; boundary is **purpose + IP ownership**; many firms
are hybrids.

**(a) Aggregator / thin-prime** — sells nothing of its own; exists purely to be a compliant
route-to-market, sub-contracting all delivery to unlisted partners.
- **Bramble Hub Ltd** (canonical; CH no. 04136381, inc. 2001, ~£27m turnover). Self-described
  "thin-prime"; sits on ~20 frameworks (G-Cloud 14, TS4/RM6190, DOS7, MCF4/RM6309, VAS, BOS2, Cyber
  Security Services 3, Big Data, NHS frameworks); 100+ partners "fully responsible for delivery";
  provides the commercial/legal/compliance/billing wrapper.
- Contrast (NOT a prime): **Advice Cloud** — a consultancy that helps vendors write their own
  G-Cloud listings; holds no place on others' behalf.
- Candidates needing verification as thin-primes: ROC Technologies, Primenet UK, Smarter
  Technologies, Creative Networks.

**(b) Value-Added Resellers (VARs)** — resell OEM products (Microsoft/AWS/Adobe/VMware) with
services; themselves the named supplier. Public-sector market ~£3.7bn (Tussell FY23/24). Top 10 by
public-sector revenue (FY end 31 Mar 2024): Bytes (incl. Phoenix) £824m, Softcat £628m, Insight
£369m, CDW UK £350m, Computacenter £327m, SCC £306m, boxxe £259m, Trustmarque £252m, XMA £112m,
Centerprise £31m. (ANS, SoftwareONE also VAR/MSP; revenue unconfirmed.)

**(c) Vendors / OEMs / ISVs** — own the IP (Microsoft, AWS, Oracle; SME SaaS publishers). >90% of
G-Cloud suppliers are SMEs listing their own services; hyperscalers sell direct *and* via 450+
reseller partners.

**"Inbound scope":** a VAR's scope = OEM products it is authorised to resell × its framework lots; a
thin-prime's scope = onboarded partners' offerings × the service categories of its frameworks.
PA2023/G-Cloud 15 don't abolish the model but increase subcontracting disclosure and tighten
pass-through of third-party vendor terms.

---

## 5. Hyperscaler marketplace routes

Public bodies **cannot** treat a hyperscaler marketplace as a standalone legal route. Every purchase
needs **(i)** a compliant procurement vehicle (framework call-off — G-Cloud, Cloud Compute 2/RM6292,
or TePAS2/RM6098) **plus (ii)** a transactional mechanism on the platform.

- **Platforms:** AWS Marketplace; **Microsoft Marketplace** (Sept 2025 merger of Azure Marketplace +
  AppSource); Google Cloud Marketplace.
- **Transaction mechanism:** **private offers** (negotiated pricing, EULA-as-PDF, time-bound
  discounts). Reseller variants: Microsoft multiparty private offers (MPO), Google channel private
  offers, AWS partner-resold offers.
- **Committed-spend retirement** (the on-platform incentive): AWS **EDP/PPA** (Marketplace retires
  ~25% of commitment; from 1 May 2025 only SaaS deployed on AWS qualifies); Microsoft **MACC** (100%
  of eligible Marketplace purchases count); Google **CUDs / spend commitments**.
- **GCA MoUs (preferential pricing, NOT routes):** AWS **OGVA 2.0** (Oct 2023–Oct 2026); Microsoft
  **SPA24** (1 Nov 2024–31 Oct 2029, ~£9bn/5yr). Common error: Microsoft has no OGVA; OGVA is
  AWS-only.
- **Live policy risk:** CMA cloud investigation recommended Strategic Market Status investigations
  into AWS and Microsoft.

**govbuy implication: document these routes, don't transact them.**

---

## 6. Source inventory & machine-accessibility verdict

**Bottom line: ingestion must be HYBRID. Only the FTS/Contracts Finder OCDS spine is genuinely
deterministic. Everything else is HTML-scrape + PDF/XLSX extraction or gated/account-scoped APIs,
plus a mandatory supplier-identity-resolution layer.**

| Source | Format | Machine-accessible | Verdict |
|---|---|---|---|
| Find a Tender (FTS) — OCDS API | OCDS 1.1.5 JSON REST; OGL | **Yes** | Deterministic spine. Framework award notices list suppliers, often per-lot. ⚠ CH ids missing for most parties; per-lot lists sometimes only in PDF attachments; no first-class "current members of framework X" object. |
| FTS/Contracts Finder — bulk OCDS download | JSON/JSONL, Excel, CSV (~240k awards) | **Yes** | Best single deterministic source. Same id-gap caveats. |
| FTS — daily notice XML | TED-based XML daily ZIP (data.gov.uk) | **Yes** | Alternative deterministic feed. |
| Contracts Finder — OCDS API | OCDS JSON REST | **Yes** | Below-threshold/historical; CH/charity numbers present more often than FTS but inconsistent. |
| Digital Marketplace / G-Cloud — public catalogue | HTML per service/supplier; "export your search" only | **Partial** | Scrape. ~tens of thousands of services. No confirmed open bulk dump. |
| digitalmarketplace-api (GitHub) | JSON REST (/services, /suppliers); **bearer-token** | **Partial** | Real structured API but effectively internal. If a token is obtainable, G-Cloud becomes deterministic. |
| GCA supplier search (gca.gov.uk/suppliers) | HTML search; filter by framework + lot; no export/API | **No** | Scrape. ~2,600 suppliers / 80+ frameworks. Excludes DPS/G-Cloud/DOS suppliers. |
| GCA agreement pages (RM-numbered) | HTML + PDF/XLSX attachments; DPS lists via authenticated buyer export | **Partial** | Agentic extraction. Appointed-supplier-by-lot is human-oriented. |
| Bloom NEPRO3 | HTML + PDF category list; no public supplier register | **No** | Managed service; selection internal. Scrape/extract only. |
| ESPO / YPO / NEPO | HTML + PDF quick-start + PDF award-by-lot | **No** | Per-operator agentic scraping; supplier-by-lot often only in PDFs. |
| AWS Marketplace Catalog API | AWS SDK; authenticated, account/seller-scoped | **Partial** | Not an open enumeration of all sellers. Full catalogue = scrape. |
| Google Cloud Marketplace / Catalog API | Cloud Catalog = Google's own SKUs; account-scoped | **Partial** | No open third-party listing API. |
| Azure Marketplace | HTML; Partner Center APIs seller-scoped | **Unknown/No** | Full catalogue = scrape. |
| Companies House Public Data API | REST/JSON; HTTP Basic (key as username); OGL v3.0 | **Yes** | Deterministic, free. 600 req/5 min per key; ~2,000/5min per IP. |
| CH bulk products | Company Data CSV (monthly), PSC JSON, Accounts iXBRL | **Yes** | Build offline match index. ⚠ Snapshot omits dissolved firms — live API still needed for dissolution/renaming. |

**Architecture verdict:**
1. **Deterministic spine:** FTS + Contracts Finder OCDS (API + bulk) for award/framework-notice data.
2. **Agentic/scraping required:** GCA agreement/lot/supplier pages, G-Cloud catalogue, and *all*
   non-CCS operators (HTML + PDF/XLSX). No clean current-membership lists exist as structured data
   anywhere.
3. **Mandatory layer:** supplier-identity resolution (trading name → CRN), because OCDS org
   identifiers are largely absent. Pipeline: normalise → candidate-generate via
   `/advanced-search/companies` (filter by status/location/SIC/incorporation date) → score against
   registered name *and* `previous_company_names` → confirm with corroborating attributes → persist
   `company_number` → revalidate. Top failure modes: trading-vs-registered mismatch (biggest),
   homonyms, dissolved/renamed entities, group-vs-subsidiary mis-attribution, non-CH suppliers (sole
   traders/partnerships/charities), suffix noise.
4. Hyperscaler marketplaces: account-scoped APIs only; document, don't ingest as catalogue.

---

## 7. Top open questions (ranked — for product-owner decision)

1. Is there a first-class "framework/dynamic-market membership" object anywhere, or must govbuy
   reconstruct current appointed-supplier-by-lot lists from award notices + scraping? (No clean
   source found — this is the core data-model decision.)
2. Does the sibling `find-tender-mcp` already normalise framework↔supplier relationships and supplier
   identity? **(Answered from code: NO — it models no framework/lot/appointed-supplier concept and no
   normalised supplier identity. govbuy must own both.)**
3. Can govbuy obtain a Digital Marketplace Data API token (accredited buyer/partner), or is it
   strictly internal? Decides whether G-Cloud ingestion is deterministic or scrape-based.
4. What proportion of FTS/Contracts Finder supplier parties carry CH identifiers post-PA2023? Sizes
   the entity-resolution build (the single largest engineering cost).
5. Should GCA be a first-class indexed entity or context? Pin canonicalisation on "GCA" with "CCS"
   alias.
6. Scope boundary: only RTM vehicles, or also suppliers/spend/marketplace catalogues?
7. How reliably do award notices expose per-lot supplier lists as structured fields vs PDF
   attachments? Sizes the PDF-extraction burden.
8. PA2023 transition state per operator/agreement — which are now open frameworks / dynamic markets
   vs legacy? (Mid-flight June 2026; operator sites lag.)
9. Will RM6200 (AI) be re-let as a PA2023 dynamic market before 23/02/2029, and will any successor
   add a direct-call-off catalogue for off-the-shelf AI? Affects the canonical "how to buy AI" answer.
10. Exact G-Cloud 15 go-live and buyer-facing catalogue name (sources conflict March vs Sept 2026).
11. Which non-CCS operators expose any machine-readable supplier register behind an authenticated
    buyer portal an accredited integration could reach?
12. Are there other true thin-prime aggregators of Bramble Hub's type (ROC Technologies, Primenet,
    Smarter Technologies, Creative Networks unconfirmed)?
