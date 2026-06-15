# govbuy — the UK public-procurement co-pilot (Claude plugin)

Install once, and your assistant can answer **how to buy** across the UK public sector, **where to sell** as a
vendor, **whether a supplier is safe to award to**, and **how public money flows** — source-anchored across
3,200+ frameworks, 117k catalogue listings and 658k real tender awards, with the **Procurement Act 2023** built in.

## Install

```
/plugin marketplace add chrisns/govbuy
/plugin install govbuy@cns
```

On install, Claude Code asks you to approve the bundled **govbuy** MCP server (a free, remote, unauthenticated
HTTP server at `https://govbuy.run.cns.me/mcp`). Approve it, then run `/govbuy:start`.

## What you get

- **The govbuy MCP server** — seven verbs: `buy`, `sell`, `supplier`, `framework`, `draft`, `watch`, `research`.
- **A skill** (`uk-procurement`) that auto-activates on procurement questions and keeps every answer decisive,
  source-anchored and compliant (it never invents a figure, framework or URL).
- **Slash commands**:
  - `/govbuy:start` — what it can do, with live examples
  - `/govbuy:buy <need>` — a full buying brief (route + mechanic + shortlist + price + alternatives + checklist)
  - `/govbuy:check-supplier <name|CRN>` — exclusion / insolvency / debarment + SME + corporate group
  - `/govbuy:sell <product>` — a vendor's route to market
  - `/govbuy:draft <need|RM>` — procurement scaffolding (timetable, evaluation matrix, Schedule 5 / standstill)
  - `/govbuy:watch expiry|pipeline` — a re-runnable saved query for expiries / the forward pipeline

It documents routes and links the official source for every claim — it is **not** legal advice and does not
assemble the purchase. By [cns.me](https://cns.me) · [govbuy.run.cns.me](https://govbuy.run.cns.me).
