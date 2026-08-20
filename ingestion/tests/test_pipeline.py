"""One dead/flaky frontier source must not sink the whole refresh() run (regression for the
GitHub Actions run that crashed on a single httpx.ConnectError, e.g.
github.com/chrisns/govbuy/actions/runs/32381653475)."""
from govbuy_ingest import pipeline, config


def test_refresh_skips_dead_source_and_keeps_processing(monkeypatch):
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", "test-key")

    sources = [
        {"source_id": "dead", "operator_id": "dead", "seed_urls": ["https://dead.example/"],
         "recipe": {}},
        {"source_id": "alive", "operator_id": "alive", "seed_urls": ["https://alive.example/"],
         "recipe": {}},
    ]
    monkeypatch.setattr(pipeline.frontier, "sources", lambda operator=None: sources)

    def fake_fetch(url):
        if "dead" in url:
            raise ConnectionError("Connection refused")
        return {"url": url, "text": "hello", "content_type": "text/html", "http_status": 200, "robots_ok": True}
    monkeypatch.setattr(pipeline, "fetch", fake_fetch)

    class FakeExtractor:
        def __init__(self, model=None):
            pass

        def extract(self, doc, meter=None, operator=None):
            return [{"fact_type": "supplier", "document_id": doc["document_id"]}]
    import govbuy_ingest.extract as extract_mod
    monkeypatch.setattr(extract_mod, "AnthropicExtractor", FakeExtractor)

    import govbuy_ingest.bq as bq
    monkeypatch.setattr(bq, "load_bundle", lambda bundle: {"facts": len(bundle["facts"])})
    monkeypatch.setattr(bq, "rebuild_public", lambda: {})
    monkeypatch.setattr(bq, "materialize_sibling", lambda: {})
    monkeypatch.setattr(bq, "materialize_track_record", lambda: {})
    monkeypatch.setattr(bq, "materialize_fusion", lambda: {})
    monkeypatch.setattr(bq, "materialize_observed", lambda: {})
    monkeypatch.setattr(bq, "materialize_official_appointments", lambda rows: {})
    monkeypatch.setattr(bq, "ch_match_suppliers", lambda: {})
    monkeypatch.setattr(bq, "coverage", lambda: {"spend_coverage_pct": 0})
    monkeypatch.setattr(bq, "write_status", lambda *a, **kw: None)

    assert pipeline.refresh(operator="not-gca") == 0  # would have raised before the fix


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
