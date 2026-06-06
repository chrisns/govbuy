# govbuy — UK route-to-market index

A structured, queryable index of the UK public sector's **standing buying instruments** —
frameworks, dynamic markets, their lots, the suppliers appointed to them, the routes by which a
buyer transacts through them, and the reseller/prime relationships that let third-party products
reach the public sector. It answers two flagship questions: **"how can I (a public buyer) buy
*X*?"** and **"I have *X* to sell — which instruments should I list on, and through which
resellers/primes?"**. Sibling to, and distinct from, [`find-tender-mcp`](../cddo/find-tender-mcp)
(the demand side — tenders and awards).

> Glossary grounded in the domain-research workflow (2026-06-06) — see
> [`docs/research/2026-06-06-domain-map.md`](docs/research/2026-06-06-domain-map.md). Regime:
> Procurement Act 2023 (PA2023), in force 24 Feb 2025.

## Language

### Spine

**Route to market** (a.k.a. **RTM**):
The documented path by which a public-sector buyer can lawfully purchase a given thing — naming the
**instrument**, **lot**, **award mechanic**, eligible **appointed suppliers / resellers**, and the
documentation the purchase requires. The thing govbuy exists to surface. govbuy **documents** the
route; it does not assemble the purchase or author the buyer's business case, and it is **not legal
advice**.

**Instrument**:
A standing commercial vehicle a buyer can use — a **framework agreement** or a **dynamic market**.
The top-level entity of the index.
_Avoid_: "contract" (an instrument is not itself a purchase); "framework" for the general concept (a
dynamic market is not a framework).

**Instrument status** (lifecycle):
Where an **instrument** sits in its life — principally **live-for-call-off** (a buyer can place new
call-offs now), **closed-to-new-call-off** (superseded; existing call-offs run out their term but no
new ones), or **expired**. The field that answers "can I actually buy from this today?". Successive
iterations (e.g. G-Cloud 12 → 13 → 14 → 15) are **distinct instruments**, usually only the latest
live-for-call-off, with the others closed but still carrying live call-offs.
_Avoid_: treating "exists" as "buyable".

**Lot**:
A subdivision of an **instrument** scoping a category of goods/services/works and carrying its own
sub-list of **appointed suppliers**. A buyer shops within the lot that fits the need.

**Appointed supplier** (a.k.a. **framework supplier**, **member**):
A supplier admitted to an **instrument** (and specific **lots**), eligible to receive **call-offs**.
Membership is **as-of-a-date** (suppliers join/leave; dynamic markets are permanently open).
_Avoid_: "winner", "awardee", "bidder" — those are demand-side (find-tender) award concepts; being
appointed is not winning a contract.

**Call-off (contract)**:
The binding contract a buyer forms with an **appointed supplier** under an **instrument/lot** to
make a purchase; itself a public contract. The point at which the demand side (find-tender) records
an **award**.

### Buying tools (standing vehicles)

**Framework agreement**:
A pre-let agreement with a fixed supplier list providing for future **call-offs**; sets terms,
guarantees no spend (PA2023 s45).

**Closed framework**:
A framework whose supplier base is fixed at award; max 4 years (8 for defence/utilities). The
default form. _Avoid_: "standard framework".

**Open framework**:
**New (PA2023 s49):** a scheme of successive frameworks on substantially the same terms, up to 8
years, reopened on schedule to admit new suppliers. _Avoid_: confusing with the **open procedure**.

**Dynamic market**:
**New (PA2023 ss34–40):** a permanently-open list of pre-qualified suppliers for any
goods/services/works; awards run via the **competitive flexible procedure** only. Replaces both the
DPS and utilities qualification systems. _Avoid_: "DPS" for new ones.

**Dynamic Purchasing System (DPS)**:
The **legacy** (PCR2015) open electronic supplier list, limited to off-the-shelf goods. Abolished
prospectively; existing DPSs deemed to end by **23 Feb 2029**. Treat an operator still saying "DPS"
as likely legacy.

**Catalogue / marketplace buying**:
Buying from a priced electronic catalogue that sits **on** a framework (e.g. G-Cloud); usually a
**call-off without further competition**.
_Avoid_: confusing the GOV.UK Digital Marketplace catalogue with a commercial **hyperscaler
marketplace** (AWS/Azure/Google) — the latter is an adjacent RTM, not a legal route on its own.

### Award mechanics (how an order is placed)

**Call-off without further competition**:
Awarding a call-off straight to a framework supplier via the framework's objective mechanism (single
supplier / ranked / catalogue price).
_Avoid_: "direct award off the framework" — colloquial and routinely confused with the statutory
**direct award** below. They are different things; always say which.

**Further competition** (a.k.a. **mini-competition**):
A second-stage competition among a lot's **appointed suppliers**, using only the original framework
award criteria (PA2023 s46).

**Direct award (statutory)**:
Awarding a **whole public contract** with no competition under PA2023 ss41–43 (Schedule 5 grounds);
requires a transparency notice and usually an 8-working-day standstill. **Cannot** be used to place a
framework call-off — that is a *call-off without further competition*.

**Competitive flexible procedure (CFP)**:
**New:** a bespoke, authority-designed multi-stage procedure replacing the whole PCR2015 menu
(restricted/dialogue/negotiation/innovation partnership); the mandatory route for **dynamic market**
awards.

**Spot buy**:
Informal, non-statutory label for a one-off ad-hoc purchase; in practice a **regulated
below-threshold** RFQ (~£12k central / £30k sub-central, PA2023 Part 6). A behaviour, not a legal
route — never treat it as one.

**Payment mechanism (settlement)**:
*How* a purchase is paid for — **orthogonal to the route**. The set: **purchase order / invoice**
(the default *and preferred* Requisition-to-Pay path), **GPC** (card), **expenses / reimbursement**,
petty cash/imprest, direct debit/standing order, hyperscaler **marketplace** consumption billing, and
inter-entity recharge / shared services. None is a procurement route: a compliant **route** is still
required above the relevant thresholds, whatever the payment method — PA2023 is **payment-method-blind**
(it triggers on contract *value*, not on how you pay). HMT *Managing Public Money* governs the
authority layer and does not even name these mechanisms; they sit in departmental finance policy.
Recorded as an attribute of a purchase, never as a route. See
[`docs/research/2026-06-06-payment-mechanisms.md`](docs/research/2026-06-06-payment-mechanisms.md).

**Government Procurement Card (GPC)**:
A Visa/Mastercard **charge** card (no credit; settled monthly) issued to public-sector staff to
**pay** for low-value, high-volume purchases (incl. small SaaS/AI subscriptions). A **payment
mechanism, never a route** — it sets *how* you pay, not *whether or from whom* you may buy. The
purchase must still be compliant under the **regulated below-threshold** regime (PA2023 is
payment-method-blind) and the buyer's card policy; since the March 2025 crackdown, card use is
**banned where a procurement route exists**, and central-gov transactions ≥£500 are
transparency-published. Provided under GCA's Payment Solutions framework (RM6248 → RM6383). See
[`docs/research/2026-06-06-gpc.md`](docs/research/2026-06-06-gpc.md).
_Accept_: Procurement Card, Purchasing Card, P-Card, ePCS. _Avoid_: "government credit card" (it is a
charge card, no credit); "buying via GPC" as if it were a route.

**Expenses / reimbursement**:
An employee buying with personal funds and reclaiming the cost — a **payment mechanism, not a route**,
and for procuring goods/services generally **non-compliant** beyond trivial incidental spend (it
bypasses procurement controls, VAT recovery and data/security checks). Reimbursement is positively
scoped to costs "actually and necessarily incurred" on official duties (travel, subsistence,
accommodation, de-minimis hospitality, essential subscriptions); **no positive threshold authorises
"procure-by-expense-claim"**. The classic **shadow-IT/AI** backdoor; subject to the same thresholds,
spend controls and AI-data rules as any other purchase. See
[`docs/research/2026-06-06-payment-mechanisms.md`](docs/research/2026-06-06-payment-mechanisms.md).
_Avoid_: treating "I'll just expense it" as a legitimate buying route.

### Actors & channel

**Contracting authority** (a.k.a. **buyer**):
The public body making the purchase (central gov, local gov, NHS, ALBs, some utilities).

**Operator** (a.k.a. **central purchasing body / CPB**, **centralised procurement authority**,
**professional buying organisation / PBO**):
The body that establishes and runs an **instrument** for others to use — e.g. **GCA** (Crown
Commercial Service's successor), or a non-CCS operator such as Bloom, YPO, ESPO, NHS SBS, Jisc.
Funded by a **rebate/levy** (free to buyer; a % of supplier turnover). _Avoid_: "owner".

**Government Commercial Agency (GCA)**:
The central-government CPB; **the renamed Crown Commercial Service (CCS)** from 1 Apr 2026 — same
continuing body, RM-numbered references unchanged. Use GCA canonically; treat **CCS** as the former
name (pre-Apr-2026 sources saying "CCS" mean GCA). _Avoid_ conflating "GCA" with **GCF** (Government
Commercial Function — the profession), **GCO** (Government Commercial Organisation — the employer of
senior commercial staff), or **GCCO** (Government Chief Commercial Officer — the post).

**Thin-prime** (a.k.a. **aggregator supplier**):
An **appointed supplier** that delivers nothing itself — it holds the framework and the call-off as
prime and sub-contracts all delivery to partners who are not on the framework (Bramble Hub's own
term, and the user's "mostly there to prime you in" pattern). Distinct from a delivering ("fat")
prime.

**Value-Added Reseller (VAR)**:
An **appointed supplier** that resells an OEM's products (licences/cloud/hardware) with wrapped
services, as the named framework supplier and an OEM channel partner (e.g. Bytes, Softcat, Phoenix).
Distinct from a **thin-prime** (a VAR sells a defined product set; a thin-prime provides a route for
arbitrary partners).

**Vendor** (a.k.a. **OEM**, **ISV**):
The originator of a product/service, reaching the public sector directly (if itself an **appointed
supplier**) or indirectly via a **reseller/prime**.

**Inbound scope**:
The set of vendors/products a **reseller/prime** can sell through its appointment — a VAR's OEM
authorisations × its lots, or a thin-prime's onboarded partners × its frameworks' categories. The
key field for "which reseller can give me access to *X*".

**Priming in** (a.k.a. **partner onboarding**):
A framework-listed **prime** bringing an unlisted **vendor** onto a deal as its **subcontractor**.
Colloquial; the statute says "subcontractor".

### Identity

**Company number (CRN)**:
The 8-character Companies House identifier; the **durable identity key** for an **appointed
supplier** (names change, numbers don't). govbuy resolves each supplier to a CRN best-effort.

**Registered name vs trading name**:
Companies House holds only the **registered** name — there is no register of trading ("DBA") names.
The single biggest cause of supplier-identity mismatch, since framework lists use trading names.

**MoU / OGVA / SPA24**:
Supplier-level memoranda (e.g. AWS OGVA, Microsoft SPA24) giving preferential pricing. **Not
procurement routes** — a compliant **instrument** is still required on top. Recorded as an attribute
of a route, never as a route itself.

## Relationships

- An **operator** establishes one or more **instruments**.
- An **instrument** has one or more **lots**; each **lot** has its own **appointed suppliers** (as of
  a date), reachable via one or more permitted **award mechanics**.
- An **appointed supplier** receives **call-offs** under a **lot**; a **call-off** corresponds to an
  **award** on the demand side (find-tender).
- A **reseller/prime** is an **appointed supplier** carrying an **inbound scope** of **vendors**.
- Every **appointed supplier** is best-effort resolved to a **company number (CRN)**.

## Boundary with find-tender-mcp

govbuy indexes the **standing instruments and who is appointed to them** (supply side / route to
market). find-tender indexes the **transactions** (demand side / tenders and awards) and models
**no** framework, lot, or appointed-supplier concept, nor any normalised supplier identity. They
share the `govreposcrape` GCP project; govbuy's read-only API reads find-tender's
`uk_tenders_public` dataset to answer combined questions (e.g. "what was actually called off under
G-Cloud 14, and by whom?"), but govbuy does **not** re-ingest tenders or awards. The
instrument/lot/appointed-supplier model and the supplier-identity (CRN) resolution are **govbuy's to
build** — neither exists upstream. Cross-link keys: instrument/RM reference and supplier (CRN)
identity.

## Example dialogue

> **Buyer:** "Can I just buy an off-the-shelf AI assistant directly, or do I have to run a
> competition?"
> **Domain expert:** "Depends on the **instrument**. On G-Cloud's Cloud Software **lot** you can do a
> **call-off without further competition** — pick the service against published terms. That's *not* a
> statutory **direct award**; it's the framework's own objective mechanism. If you went to the AI
> **DPS** instead, that's **further competition** only."
> **Seller:** "I'm a tiny ISV with one AI product. Which **instrument** do I list on?"
> **Domain expert:** "You may not need to be **appointed** yourself — a **thin-prime** like Bramble
> Hub can **prime you in** as a **subcontractor** on frameworks it already holds. Its **inbound
> scope** is exactly that: partners it can route to market."

## Flagged ambiguities

- **"CCS" vs "GCA"** — *resolved*: GCA is the renamed CCS (1 Apr 2026), same body; GCA canonical, CCS
  = former name. Do **not** conflate with GCF / GCO / GCCO (distinct entities).
- **"direct award"** — *resolved*: two distinct meanings. Within a framework → **call-off without
  further competition**. A whole contract with no competition → **statutory direct award** (ss41–43).
  Never use "direct award" unqualified.
- **"framework"** — reserved for the closed-admission agreement type; use **instrument** for the
  general concept (frameworks + dynamic markets).
- **"appointed supplier"** (govbuy) vs **award party** (find-tender) — being on a framework ≠ having
  won a call-off.
- **"marketplace"** — the GOV.UK Digital Marketplace (a framework catalogue) vs a commercial
  hyperscaler marketplace (AWS/Azure/Google) are different things; qualify which.
- **"aggregation"** — combining *buyers'* demand (collective buying) vs an *aggregator supplier*
  (a prime aggregating *vendors*). Different concepts.
