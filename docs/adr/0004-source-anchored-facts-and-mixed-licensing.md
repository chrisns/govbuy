# Source-anchored facts and a mixed-licensing scraping posture

**Status:** accepted (2026-06-06)

Because an LLM harness extracts buying rules from documents (ADR-0002), and a wrong rule could point a
buyer down a non-compliant procurement route, **every structured claim govbuy stores must be
source-anchored**: a provenance pointer (source doc URL + verbatim excerpt/locator) and a confidence.
An uncited claim is dropped or quarantined — the index never asserts a rule it cannot quote.
**Anti-fabrication gate:** the cited excerpt must be a verbatim (whitespace-normalised) **substring of
the archived source document** at the recorded locator, checked **deterministically — not by the LLM —**
before commit; a claim whose excerpt is not found is quarantined. So source-anchoring guarantees the
quote is *real*, not merely that an evidence row exists (an LLM verifier reading only `{claim, excerpt}`
would check the wrong thing). Every answer states it is **not legal advice** and links to the
authoritative source; govbuy is explicitly not the authority of record.

Unlike the sibling (whose sources are uniformly Open Government Licence open data), govbuy's sources
have **mixed licensing**: GCA pages are likely OGL, but operator sites (Bloom/YPO/ESPO) carry their own
terms and supplier marketing pages (e.g. a thin-prime's partner list) are plain copyright. The posture:
the **primary legal leg is that facts are not copyrightable** (membership, who-resells-whom, RM
references, dates) — these are stored freely. Short **excerpts** are kept only for verification, sized
to the narrow UK quotation exception (CDPA s30(1ZA)) — minimal length, attributed — **not** a general
"fair dealing" claim (UK CDPA has no broad fair-dealing exception for systematic commercial
republication). Supplier **marketing** pages (the lowest-confidence, highest-risk source) store
locator + timestamp + a short quote, never substantial excerpts. Controls: **honour `robots.txt`,
rate-limit politely, identify the crawler by user-agent, and apply a per-source ToS "may we scrape
this" gate at frontier onboarding** (not just robots.txt); publish a **takedown route** as the
residual control. **This posture requires legal sign-off before launch.**

**Considered and rejected:** (a) OGL/official sources only — legally safest but guts non-CCS operator
coverage and the reseller inbound-scope feature, both explicitly in scope; (b) facts-only (no excerpts)
for non-OGL sources — lowers copyright exposure but removes the verifiable excerpt for exactly the
lowest-confidence data, undermining the source-anchoring it depends on.

**Consequences:** a takedown process, per-source ToS gating and crawler-politeness controls are launch
requirements, not nice-to-haves; the posture requires legal sign-off before launch; some short-excerpt
re-publication carries residual (low) copyright risk accepted in exchange for coverage and
verifiability.
