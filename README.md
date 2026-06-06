# govbuy — UK route-to-market MCP

Ask your AI assistant **how to buy** a thing across the UK public sector — or, as a vendor, **where
to list it and who can prime you in** — and get a complete, current, **source-anchored** answer:
the frameworks and dynamic markets that fit, their lots, the permitted award mechanics, the
documentation a purchase needs, the appointed suppliers, and the resellers/primes (like Bramble Hub)
whose inbound scope can carry an off-framework product to market.

Sibling to [`find-tender-mcp`](../cddo/find-tender-mcp) (the demand side — tenders & awards). govbuy
is the **supply / route-to-market** side. It **documents** routes; it does **not** assemble the
purchase or give legal advice, and it is not the authority of record. See [VISION.md](VISION.md),
[docs/PRD.md](docs/PRD.md), the [ADRs](docs/adr/) and the glossary in [CONTEXT.md](CONTEXT.md).

## Use it

```bash
# local
claude mcp add --transport http govbuy http://localhost:8080/mcp
# production (when deployed)
claude mcp add --transport http govbuy https://govbuy.run.cns.me/mcp
```

## Tools

| Tool | What it does |
|------|--------------|
| `find_routes` | **Buyer:** instruments/lots that fit a need + permitted award mechanics + required docs + GPC/marketplace caveats. Doesn't rank or assemble the buy. |
| `get_instrument` | One framework/dynamic market: lots, lifecycle status, mechanics, buying docs, appointed suppliers (each with a membership qualifier + evidence). |
| `find_instruments_to_list` | **Seller:** instruments a vendor can be appointed to (open frameworks / dynamic markets) + how-to-apply. |
| `list_resellers` | "Who's like Bramble" — thin-primes & VARs by channel/category/vendor, with their inbound scope. |
| `get_supplier` | One supplier: Companies House match snapshot, frameworks/lots, channel, inbound scope. |
| `query_sql` | Read-only BigQuery over `govbuy_public` (+ the `sibling_call_off_awards` view to join real call-offs). Byte-capped. |
| `get_schema` | Tables/columns + byte cap. |
| `get_status` | Per-source freshness/health, last-run cost (£), spend-coverage %. |

Every asserted fact carries a **source-anchored evidence block** (a verbatim excerpt that passed a
deterministic substring check, plus the source URL + licence + confidence). Every response says
**not legal advice**.

## Architecture

```
agentic harness (Python + Anthropic API, tiered Haiku/Sonnet/Opus)
   frontier walk → fetch+archive → extract → verify → DETERMINISTIC verbatim-gate → reconcile → commit
        │  raw event log (govbuy_raw)                    build-and-swap ▼
        └────────────────────────────────────────────► govbuy_public (typed, source-anchored)
                                                              + sibling_call_off_awards (materialised non-PII snapshot)
   AI assistant ──MCP──► Cloud Run (TypeScript, read-only SA on govbuy_public ONLY) ──► BigQuery
```

- **Membership** is evidenced, temporal and confidence-scored; conflicts surfaced ([ADR-0003](docs/adr/0003-evidenced-temporal-membership.md)).
- **Faithfulness**: nothing asserted without a verbatim-verified excerpt ([ADR-0004](docs/adr/0004-source-anchored-facts-and-mixed-licensing.md)).
- **Sibling join**: the harness materialises a curated, non-PII snapshot of the sibling's call-off awards into `govbuy_public`; the API reads the snapshot, never the sibling ([ADR-0001](docs/adr/0001-shared-project-read-sibling-dataset.md)).
- **Harness** is portable & unscheduled, with per-run cost reporting + a liveness alert ([ADR-0005](docs/adr/0005-portable-unscheduled-harness.md)).

## Develop

```bash
# API (TypeScript)
cd api && npm install && npm run build
GCP_PROJECT=govreposcrape BQ_PUBLIC_DATASET=govbuy_public node dist/index.js   # needs ADC
node test/smoke.mjs http://localhost:8080/mcp

# Ingestion harness (Python)
cd ingestion && python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m pytest tests -q
# GCA is DETERMINISTIC — sync all live agreements straight from the GCA frameworks API (no LLM):
.venv/bin/python -m govbuy_ingest gca-sync
# load a fact bundle (the in-session / workflow path) — gate + project + CH-match + coverage:
.venv/bin/python -m govbuy_ingest load-bundle bundle.json --match
# production nightly (needs ANTHROPIC_API_KEY): walk the frontier and extract for real
.venv/bin/python -m govbuy_ingest refresh
# dead-man's switch (wire to any channel):
.venv/bin/python -m govbuy_ingest liveness || notify "govbuy stale"
```

## Schema

[`sql/schema.sql`](sql/schema.sql) is the contract: two datasets (`govbuy_raw` write,
`govbuy_public` read), the typed source-anchored tables, the evidenced/temporal membership split
(`appointment_observation` → resolved `appointed_supplier`), and the `sibling_call_off_awards`
authorized view.

## Deploy

See [`terraform/`](terraform) (datasets + least-privilege IAM + the authorized-view grant + GCS +
Cloud Run — **no scheduler**; the harness is operator-hosted) and `scripts/`. The harness is run
wherever you choose; it reports its cost each run and ships a liveness alert.

## License & data

Code: MIT. Facts are not copyrightable and are stored freely; short excerpts are kept for
verification under the UK quotation exception, attributed and linked. OGL v3.0 where applicable. A
published takedown route is the residual control. **Not legal advice; not the authority of record.**
