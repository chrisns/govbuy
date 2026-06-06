# govbuy — product vision

## The problem, from both sides

A public servant who needs to buy a thing — say an AI assistant — faces a maze: dozens of framework
operators, hundreds of agreements, thousands of lots, a tangle of award rules, and a supplier base
that reaches government through resellers and primes as often as directly. A vendor with something to
sell faces the mirror image: *which* of those instruments should I list on, and if I can't get on
one, *who* can route me in? Today both questions are answered by tribal knowledge, consultants, and
days of reading PDFs. The information exists — it is just **fragmented, unstructured, and not
machine-queryable.**

The sibling [`find-tender-mcp`](../cddo/find-tender-mcp) already answers the *demand* side — who
bought what. **govbuy answers the supply / route-to-market side**: how you buy, and how you sell.

## What govbuy is

A remote MCP server an AI assistant can call to answer, with sources attached:

- **"How can I buy *X*?"** → the instruments and lots that fit, the permitted award mechanics
  (call-off vs further competition vs CFP), the documents a purchase requires, the appointed
  suppliers, and the payment-mechanism caveats (a procurement card or a marketplace is *not* a
  route) — every rule quoted from, and linked to, its source.
- **"I have *X* to sell — where do I list, and who primes me in?"** → the instruments a vendor can
  join (open frameworks, dynamic markets), and the thin-primes and VARs (the Bramble Hubs) whose
  *inbound scope* can carry an off-framework product to market.

It **documents** routes; it never assembles the purchase, authors the business case, or gives legal
advice. It is not the authority of record.

## The three convictions that shape it

1. **There is no clean source, so honesty is the architecture.** No register lists "who is on
   framework X today." govbuy reconstructs membership from imperfect, disagreeing, differently-timed
   sources — and says so: every membership edge is *evidenced, temporal, and confidence-scored*, and
   conflicts are surfaced, never silently merged.
2. **An index that can be wrong about a buying rule is dangerous, so nothing is asserted that cannot
   be quoted.** Every fact carries a source excerpt that has passed a deterministic verbatim check
   against the archived source. If it can't be quoted, it isn't served.
3. **The data is prose, not an API, so ingestion must be intelligent — but bounded.** A frontier of
   known sources is walked deterministically; LLMs do the bounded job of reading a document into
   structured, cited facts; an adversarial step and a deterministic gate keep them honest; a separate
   discovery sweep grows the frontier. Adding an operator is configuration, not code.

## Identity is the spine

Supplier names are chaos; company numbers are forever. govbuy resolves every supplier to a Companies
House number (best-effort, banded by confidence, point-in-time) — the join key that lets it answer
"who really supplies this, under what name, through which reseller," and that lets it cross-join the
sibling's award data to show what was *actually* called off under a framework.

## North star

A civil servant, or the AI sat beside them, can ask in plain language how to buy any product
compliantly — or how to sell one — and get a complete, current, source-anchored route in seconds,
across the whole UK public-sector buying landscape, weighted to where the spend actually is. The long
tail fills in as the harness runs; the capability is there from day one.

## Non-negotiables

Public and free over MCP. Cost-capped and cost-visible. Faithful and attributed. Minimal personal
data at rest. A published takedown route. Never a substitute for the official source, professional
commercial advice, or the buyer's own judgement.
