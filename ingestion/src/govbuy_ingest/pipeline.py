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
    run_id = "run_" + uuid.uuid4().hex[:12]
    meter = CostMeter()
    documents, facts, n = [], [], 0
    paused = False
    # Deterministic GCA estate via structured sources (no LLM, no scraping of free text, no
    # fabrication risk): frameworks API + appointed-supplier API + the Digital Marketplace
    # (G-Cloud) public supplier directory. Together these are the complete deterministic spine.
    if operator in (None, "gca"):
        from .gca_api import fetch_all, to_bundle
        from .gca_suppliers import sync as gca_sup_sync
        from .gcloud_dm import sync as gcloud_sync
        gb = to_bundle(fetch_all(), run_id)
        documents += gb["documents"]; facts += gb["facts"]
        sb, _ = gca_sup_sync(run_id)
        documents += sb["documents"]; facts += sb["facts"]
        gcb, _ = gcloud_sync(run_id)
        documents += gcb["documents"]; facts += gcb["facts"]
    # Agentic operators (no structured API) — need the LLM extractor.
    agentic = [] if operator == "gca" else [s for s in frontier.sources(operator) if s["source_id"] != "gca"]
    if agentic and not config.ANTHROPIC_API_KEY:
        print("agentic operators need ANTHROPIC_API_KEY — ingested the deterministic GCA slice only. "
              "In-session, drive non-GCA operators via the workflow + `govbuy-ingest load-bundle`.")
    elif agentic:
        from .extract import AnthropicExtractor
        extractor = AnthropicExtractor(config.MODEL_EXTRACT)
        for src in agentic:
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
                extracted = extractor.extract(doc, meter=meter, operator=src["operator_id"] or src["source_id"])
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
                        est_gbp=meter.gbp(), status="paused_ceiling", tier_breakdown=meter.breakdown(), by_operator=meter.by_operator())
        return 3
    bq.rebuild_public()
    bq.materialize_sibling()
    bq.materialize_track_record()
    bq.materialize_fusion()
    bq.materialize_observed()
    bq.ch_match_suppliers()
    cov = bq.coverage()
    bq.write_status(run_id, "refresh", stats, cov, est_gbp=meter.gbp(), tier_breakdown=meter.breakdown(), by_operator=meter.by_operator())
    print(f"refresh ok: {stats} coverage={cov['spend_coverage_pct']}% cost=£{meter.gbp()} per-operator={meter.by_operator()}")
    return 0


def discover() -> int:
    """Lower-frequency autonomous sweep (Opus tier): propose NEW operators/instruments/changed
    structures for the frontier. Outputs PROPOSALS to a review queue — never auto-committed
    (PRD §7.2). Requires ANTHROPIC_API_KEY."""
    if not config.ANTHROPIC_API_KEY:
        print("discover needs ANTHROPIC_API_KEY (Opus tier). It proposes frontier additions for review; "
              "in-session, frontier curation is done via the workflow layer.")
        return 1
    from anthropic import Anthropic
    client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
    known = ", ".join(s["source_id"] for s in frontier.sources())
    msg = client.messages.create(model=config.MODEL_DISCOVER, max_tokens=2048,
        messages=[{"role": "user", "content": f"Known govbuy frontier sources: {known}. Propose UK public-sector framework operators / standing instruments NOT in that list that run technology/AI agreements, as JSON [{{operator, why, seed_url}}]. These are PROPOSALS for human review, not facts."}])
    text = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
    print("DISCOVERY PROPOSALS (review before adding to the frontier):\n" + text)
    return 0


def backfill(operator: str | None = None) -> int:
    """Operator-scoped full (re)load — same windowed-replay code path as refresh, scoped to one
    operator (PRD §7.2). Resumable/idempotent via the content-hash MERGE."""
    return refresh(operator=operator, max_docs=None)
