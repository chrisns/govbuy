# Payment / settlement mechanisms vs procurement route — working brief

> Synthesis of 2 finder agents (2026-06-06): (1) how a UK public body *settles* a purchase vs the
> *route* to buy; (2) buying SaaS/AI on personal expenses or personal card ("shadow IT/AI").
> Companion to [`2026-06-06-gpc.md`](2026-06-06-gpc.md). Regime: Procurement Act 2023 (PA2023), in
> force 24 Feb 2025. Authority layer: HM Treasury *Managing Public Money* (MPM), April 2026 edition.

## 1. The orthogonality principle (route ⊥ payment)

Every public-sector purchase answers two **independent** questions:

- **ROUTE** — the *legal authority and vehicle* to commit public money: a contract let under PA2023,
  a call-off from a GCA (ex-CCS) framework / dynamic market, G-Cloud, a statutory direct award, or
  genuine below-threshold buying within delegated authority.
- **PAYMENT / SETTLEMENT** — *how the money physically moves* once a valid commitment exists.

**A payment mechanism confers no authority to procure.** Whatever the settlement method, the
underlying acquisition must independently satisfy the procurement framework and the four Accounting
Officer standards — **regularity, propriety, value for money, feasibility** (MPM §3.3.3). Tellingly,
MPM **never names** petty cash, imprest, procurement card or purchase order: it governs the
authority layer and delegates the settlement-mechanism detail to departmental finance policy and the
GCS/GCA framework. Route and payment are orthogonal axes; govbuy records the payment mechanism as an
**attribute of a purchase, never as a route**.

## 2. Payment mechanisms — none is a route

| Mechanism | A route? | Permitted for *procurement*? | Governing source | Conf |
|---|---|---|---|---|
| **Purchase order / invoice (P2P / R2P)** | No | **Yes — the default & preferred settlement channel** for committed spend. No inherent value cap; limits come from delegated authority + procurement thresholds, not from P2P. | MPM Annex 4.6 (sound control, separation of duties, prompt payment); GPC policy positions itself *as an alternative to* the PO route | high |
| **Government Procurement Card (GPC)** | No | Narrowly — low-value official purchases within local single-txn + monthly limits; **central/call-off contracts must be used first; banned where a route exists** (Mar 2025); no transaction-splitting, no cash, no personal items; txns ≥£500 published | TNA/Pan-Gov GPC policy; Mar 2025 Cabinet Office crackdown. See [`2026-06-06-gpc.md`](2026-06-06-gpc.md) | high |
| **Personal expense reimbursement** | No | **No** — not a sanctioned way to procure. Confined to costs "actually and necessarily incurred" on official duties (travel, subsistence, accommodation, de-minimis hospitality >£25, essential medical/professional subs). No positive threshold authorises "procure-by-expense-claim". | Civil Service Management Code; departmental/HMT expenses policy; MPM AO standards | high |
| **Petty cash / imprest** | No | Only de-minimis urgent items where a PO is impractical; tightly capped by *local* financial regs (illustrative ~£250 float ceiling); never salaries/employee expenses. Not a vehicle for material procurement. | Local financial regulations (MPM is silent — does not mention petty cash/imprest) | high (low-value convenience) / med (exact caps) |
| **Direct debit / standing order** | No | Settles recurring committed liabilities (utilities, rates, leases, subs) once the contract exists. No value limit on the instrument itself. | Government Banking rails — BACS, Faster Payments (≤£250k), CHAPS (≥£250k); MPM references holding balances in Government Banking | high |
| **Hyperscaler consumption / PAYG billing** | No | A *billing model* that sits **on top of** a route (G-Cloud framework, or aggregation agreement e.g. AWS OGVA). Value control comes from the call-off, budget and cloud spend governance, not the meter. | G-Cloud (RM1557.x, let under PA2023); AWS OGVA (commercial/aggregation vehicle). cf. MoU/OGVA/SPA24 in CONTEXT.md | high |
| **Inter-entity recharge / shared-service billing** | No | Internal *cost recovery* between public bodies for services provided, normally at full cost; documented by SLA/MoU. Neither creates nor substitutes for a procurement decision. | MPM Chapter 6 (charging; standard approach = full-cost recovery, Annex 6.1) | high |

**Corollary (payment-method-blind regime):** PA2023's regulated below-threshold duties trigger on
contract *value* (≈£12k inc VAT central gov incl. NHS trusts; ≈£30k other authorities, ss.84–86) —
**not** on how you pay. A purchase above the floor carries the same notice/transparency duties
regardless of settlement method.

## 3. Verdict — personal-expense / personal-card SaaS-AI buying ("shadow IT / shadow AI")

**Not permitted as a way to procure.** There is no single statutory ban, but the practice is
**cumulatively non-compliant** and is the textbook definition of shadow IT/AI:

- **No route.** A personal subscription has no PA2023-compliant route, no competed/framework
  contract, no enterprise terms, no Data Processing Agreement (DPA), no security/Secure-by-Design
  assurance. The settlement method (personal card + reclaim, or even a GPC) **cannot cure the
  absence of a route**.
- **Regularity & propriety risk** under MPM's AO standards; bypasses POs, competition, call-off,
  delegated-authority controls and the audit trail.
- **AI overlay decisive.** The *AI Playbook for the UK Government* (10 Feb 2025): *"you must not
  enter official information unless it has been published or is cleared for publication"* — with
  narrow exceptions only for tools under suitable commercial licences (e.g. Microsoft Copilot).
  Consumer LLMs may train on prompts; no DPA, no forensic record → UK GDPR/DPA 2018 controller
  exposure.

**VAT angle (why expensing destroys recovery):** HMRC requires a **valid VAT invoice in the body's
name** and that **the body, not the individual, bears the cost**; VAT on anything for personal use is
never recoverable. A personal consumer subscription receipt is typically a non-UK B2C receipt with no
proper UK VAT invoice — exactly where recovery breaks. For most central government the relevant
mechanism is **not** ordinary input-tax recovery at all but the **Section 41 VATA 1994 Contracted Out
Services (COS)** refund scheme — narrow (~76 categories), document-dependent, and a personal consumer
receipt falls outside it. (Section 41 reform is under HMT consultation — treat the 76-category figure
as subject to change.)

**Compliant alternative:** buy through the body's commercial/digital function on an approved
framework (e.g. **G-Cloud** Cloud Software lot, **AI agreement RM6200**, **Back Office Software 2
RM6285**) with **enterprise terms, a DPA and security/data assurance**, settled by the
**organisation's own invoice or a properly-authorised GPC** — never personal purchase and
reimbursement. The supply is then genuinely *to the body in its name*, which also fixes the VAT
treatment.

**June 2026 control-landscape nuance:** most Cabinet Office spend controls (incl. the old GDS-run
digital & technology control) ceased as a *mandatory central* requirement on **1 Apr 2026**, folded
into a reformed framework where departments own approvals under Delegated Authority Limits with HMT
oversight via the Treasury Approvals Process (TAP); only Advertising/Marketing/Communications
remains. This removed a central *gateway* but **did not legitimise personal-card software buying** —
PA2023, UK GDPR/DPA 2018, security policy and the AI Playbook all still apply.

## 4. CONTEXT.md glossary — confirmation / correction

Both provisional definitions already in CONTEXT.md are **confirmed correct** by this research:

- **Payment mechanism (settlement)** — confirmed. *Orthogonal to the route*; the set listed (PO/
  invoice, GPC, expenses, petty cash, direct debit/standing order, marketplace consumption billing,
  inter-entity recharge) is accurate; none is a route; a compliant route is still required above
  thresholds whatever the payment method. **One refinement worth adding:** name PO/invoice as the
  *default & preferred* channel, and add the "payment-method-blind" corollary (PA2023 triggers on
  value, not payment method). No correction needed to the existing wording.
- **Expenses / reimbursement** — confirmed; the `_(provisional — research pending)_` flag can be
  **removed**. Research substantiates every clause: it is a payment mechanism not a route;
  non-compliant for procuring goods/services beyond trivial incidental spend; the classic shadow-IT/
  AI backdoor; bypasses procurement controls, VAT recovery and data/security checks; subject to the
  same thresholds, spend controls and AI-data rules as any other purchase. **One precision to fold
  in:** reimbursement is *positively scoped* to costs "actually and necessarily incurred" on official
  duties (travel/subsistence/accommodation/de-minimis hospitality/essential subs) — there is **no
  positive threshold** that authorises procure-by-expense-claim.

## 5. The one rule govbuy applies

> **A payment/settlement mechanism is *how* a purchase is paid for, never *whether or from whom* it
> may be bought.** Classify PO/invoice, GPC, expenses/reimbursement, petty cash, direct debit,
> consumption billing and inter-entity recharge as **settlement mechanisms — never procurement
> routes**, and never present any of them (least of all "I'll just expense it") as an alternative to
> a compliant route. A compliant route is still required above the PA2023 thresholds, whatever the
> payment method.

## Sources

MPM April 2026 (Annex 4.6 Procurement; §3.3.3 AO standards; Chapter 6 charging; Annex 6.1 full-cost
recovery) — assets.publishing.service.gov.uk/media/69e0b17861d2e8e9b9e42e13/Managing_Public_Money_-_April_2026.pdf;
TNA/Pan-Gov GPC policy; Civil Servants' Business Expenses guide + HMT travel & subsistence policy;
Government Banking Service (gov.uk/government/groups/government-banking-service-gbs); G-Cloud
(gca.gov.uk RM1557.x); AWS OGVA blog; AI Playbook for the UK Government
(assets.publishing.service.gov.uk/media/67aca2f7e400ae62338324bd/AI_Playbook_for_the_UK_Government__12_02_.pdf);
HMRC reclaim-VAT guidance (gov.uk/charge-reclaim-record-vat/reclaim-vat-business-expenses); HMRC VAT
Government & Public Bodies manual VATGPB9340 / VATGPB9720 (Section 41 COS); Cabinet Office Controls
collection + spending-control reform paper + PublicTechnology (8 Apr 2026, GDS spend controls retired).

## Staleness flags (for the harness to re-check)

1. **No single consolidated post-Apr-2025 central GPC policy PDF** confirming a £500 *single-
   transaction* limit government-wide — the £500 figure is the **hospitality cap / publication
   threshold**, not a national txn limit (see [`2026-06-06-gpc.md`](2026-06-06-gpc.md) watch-out).
2. **Section 41 VATA 1994 COS reform** under HMT consultation — verify the ~76-category figure and
   recovery scope before relying on specifics.
3. **De-minimis "buy-and-reclaim" exception** — no central positive threshold found; check whether
   any department has codified one as an explicit exception to the PO/contract route.
4. **AWS OGVA / Microsoft / Google equivalents** — confirm whether, post-PA2023, these are callable
   commercial agreements or non-binding MoUs sitting alongside G-Cloud as the actual call-off route.
5. **Petty cash / imprest float ceilings** in central-gov departmental financial regulations (vs the
   illustrative ~£250 local-authority figure) — not in MPM; confirm per-department.
6. **MPM April 2026 exact paragraph numbers** for regularity/propriety and NCR treatment of
   off-framework/expensed IT spend — pin against the April 2026 PDF.
