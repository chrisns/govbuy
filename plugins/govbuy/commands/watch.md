---
description: Watch for contract expiries or the forward pipeline — a re-runnable saved query
argument-hint: expiry|pipeline [cpv division] [keyword] [horizon months]
---

The user wants to watch for procurement changes: **$ARGUMENTS**

Call the govbuy `watch` tool. Set `what` to `expiry` (contracts ending — re-procurement deadlines for buyers,
displacement windows for sellers) or `pipeline` (forward planned-procurement notices). Pass `cpv` (2-digit
division), `keyword`, `supplier`, and `horizon_months` if given. Then:

- Show the **current matches**, linking each `official_url` (for expiries: supplier, value, end date, months-to-end).
- State the **saved_query** plainly — the exact arguments to re-run and the suggested cadence — and explain that
  govbuy is request/response, so this is a saved query to re-run and **diff against last time**, not a push alert.

Every figure and name comes verbatim from the tool result.
