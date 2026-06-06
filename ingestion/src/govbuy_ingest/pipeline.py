"""Production refresh orchestration (PRD §7.2): walk the frontier -> fetch -> extract (Haiku)
-> verify (Sonnet) -> deterministic gate -> load. Tiered cost metered; soft ceiling pauses
WITHOUT a build-and-swap (public stays last-good). In-session, the same bundles are produced by
the workflow/agent layer and loaded via `load-bundle` (no ANTHROPIC_API_KEY needed)."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone

from . import config, bq, frontier
from .fetch import fetch, document_id
from .cost import CostMeter


def refresh(operator: str | None = None, max_docs: int | None = None) -> int:
    if not config.ANTHROPIC_API_KEY:
        print("refresh needs ANTHROPIC_API_KEY (prod path). In-session, use the workflow to produce a "
              "bundle and `govbuy-ingest load-bundle`.")
        return 1
    from .extract import AnthropicExtractor
    extractor = AnthropicExtractor(config.MODEL_EXTRACT)
    run_id = "run_" + uuid.uuid4().hex[:12]
    meter = CostMeter()
    documents, facts, n = [], [], 0
    paused = False
    for src in frontier.sources(operator):
        for url in src["seed_urls"]:
            if max_docs and n >= max_docs:
                break
            doc = fetch(url)
            if not doc["text"]:
                continue
            doc["document_id"] = document_id(url, doc["text"])
            doc["source_id"] = src["source_id"]
            doc["operator_id"] = src["operator_id"]
            doc["licence"] = src["recipe"].get("tos_gate", "unknown")
            doc["fetched_at"] = datetime.now(timezone.utc).isoformat()
            extracted = extractor.extract(doc, meter=meter)
            documents.append({k: doc[k] for k in ("document_id", "source_id", "operator_id", "url", "content_type", "http_status", "robots_ok", "licence", "fetched_at", "text")})
            facts.extend(extracted)
            n += 1
            if meter.status() == "pause":
                paused = True
                break
        if paused:
            break
    bundle = {"run_id": run_id, "mode": "refresh", "documents": documents, "facts": facts}
    stats = bq.load_bundle(bundle)
    if paused:
        print(f"PAUSED at cost ceiling £{meter.gbp()} — NOT rebuilding public (last-good retained).")
        bq.write_status(run_id, "refresh", stats, {"spend_coverage_pct": 0.0, "denominator_gbp_bn": 0, "covered_gbp_bn": 0},
                        est_gbp=meter.gbp(), status="paused_ceiling", tier_breakdown=meter.breakdown())
        return 3
    bq.rebuild_public()
    bq.ch_match_suppliers()
    cov = bq.coverage()
    bq.write_status(run_id, "refresh", stats, cov, est_gbp=meter.gbp(), tier_breakdown=meter.breakdown())
    print(f"refresh ok: {stats} coverage={cov['spend_coverage_pct']}% cost=£{meter.gbp()}")
    return 0
