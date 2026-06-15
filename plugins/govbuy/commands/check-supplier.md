---
description: Pre-award due diligence on a supplier — exclusion, insolvency, debarment, SME, corporate group
argument-hint: <supplier name or Companies House number>
---

Run pre-award due diligence on: **$ARGUMENTS**

Call the govbuy `supplier` tool. Then report, in this order:

1. **Exclusion first.** If `exclusion.flagged` is true, LEAD with the ⚠ and name the limb: insolvency
   (PA2023 Schedule 6/7, from the live Companies House status) vs the **s.62 debarment register**.
   `exclusion.insolvency.source = live_companies_house` means it was checked live just now.
2. **Framework footprint** + `frameworks_evidenced_by_awards` (RMs the firm has actually won call-offs under).
3. **Delivery record** — call-off £ won, customer concentration (top_buyer_pct_of_calloff > 50% = single-customer
   risk), competitive-vs-direct mix.
4. **Size & locality** (`size_and_locality`) — the SME signal (with its filed-accounts basis) and registered-office
   region, as Companies House *signals* — never a definitive SME determination. Social value is a PA2023 duty to
   evidence, not a supplier attribute.
5. **Corporate group** (`corporate_group`) — the parent company and other govbuy suppliers under it, with the
   group's combined call-off £ (a concentration/conflict signal).

Link the Companies House record (`ch_url`). NULL/absent figures mean no matched data, not proof of incapacity.
This is not legal advice — confirm on the sources linked.
