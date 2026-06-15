---
description: Get a compliant buying brief for a need — route, mechanic, shortlist, price, alternatives, checklist
argument-hint: <what you need to buy> [budget] [as a <buyer type>]
---

The user wants to buy something across the UK public sector: **$ARGUMENTS**

Call the govbuy `buy` tool with `depth:"full"`, passing the need (and a `cpv` 2-digit division and
`budget_gbp` if you can infer them). Then give a decisive, source-anchored brief:

- **Recommended route** (link its `official_url`) + the PA2023-correct call-off mechanic.
- **Shortlist** of real listings — link each listing URL and Companies House `ch_url`, show the CRN-matched
  call-off track record, and **LEAD with a ⚠ if any supplier carries an exclusion flag**.
- **What it should cost** — the real p25 / median / p75 range, labelled indicative (a range, not a quote).
- **Alternative routes** — a tight comparison on speed × competition × supplier depth × expiry runway × price.
- **Compliance checklist** — verbatim from the tool.

Every £ figure, framework/RM reference, supplier name and URL must come verbatim from the tool result — never
invent one. A framework call-off is NOT a statutory direct award; a GPC card is not a route. End by offering to
`/govbuy:draft` the procurement documents. This is indicative, not legal advice — tell them to confirm on the
official source you link.
