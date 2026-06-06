# Hybrid ingestion with an agentic frontier harness (LLMs in the ingest path)

**Status:** accepted (2026-06-06)

govbuy ingests via two paths: a **deterministic OCDS spine** (framework award-notice data, taken
from the sibling's `uk_tenders_public` and, where needed, FTS/Contracts Finder directly) and an
**agentic frontier harness** for everything else — GCA agreement/lot/supplier pages, the G-Cloud
catalogue, and every non-CCS operator (Bloom, YPO, ESPO…), which exist only as heterogeneous
HTML + PDF/XLSX with no structured API. The harness is a **deterministic scheduler over a registry
("frontier") of known sources**; LLM agents perform two bounded jobs at the leaves — (1) extract
source-anchored structured facts from a fetched document, (2) **adversarially verify** that each
extracted claim is actually supported by its cited excerpt before commit — with a cross-check against
the deterministic spine where possible. A **separate, lower-frequency discovery sweep** hunts for new
operators/instruments and *proposes* frontier additions (review-gated), so coverage grows without the
nightly path becoming unbounded.

**Why this deviates from the house pattern:** the sibling deliberately keeps **zero LLMs in its
ingest path** (deterministic, golden-file-tested, idempotent) so it can never be wrong. govbuy cannot
honour that — its sources require reading and interpreting prose. So intelligence is admitted, but
**confined to bounded, verifiable extraction tasks** rather than autonomous crawling, to retain as
much determinism, testability and cost-control as possible.

**Considered and rejected:** (a) a fully autonomous nightly agent given only goals — maximally
adaptive but non-deterministic, hard to test, hard to cost-bound, prone to night-to-night drift;
(b) hand-written deterministic scrapers per operator with no autonomy — most predictable but every
new operator and site redesign is manual engineering, so "catalogue as many as possible" stalls on
human throughput.

**Consequences:** extraction is testable via golden files (document → expected facts) but is
probabilistic, not exact; the verify step and confidence scoring (see ADR-0004) are load-bearing, not
optional. Per-run cost is variable and must be measured (see ADR-0005).
