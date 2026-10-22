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


def _stub_bq(monkeypatch):
    import govbuy_ingest.bq as bq
    loaded = {}
    monkeypatch.setattr(bq, "load_bundle", lambda bundle: loaded.update(bundle) or {"facts": len(bundle["facts"])})
    for name in ("rebuild_public", "materialize_sibling", "materialize_track_record", "materialize_fusion", "materialize_observed"):
        monkeypatch.setattr(bq, name, lambda: {})
    monkeypatch.setattr(bq, "materialize_official_appointments", lambda rows: {})
    return loaded


def _bundle(tag):
    return {"documents": [{"document_id": tag}], "facts": [{"fact_type": tag}]}


def test_refresh_continues_when_one_deterministic_source_is_offline(monkeypatch):
    import govbuy_ingest.gca_api as gca_api, govbuy_ingest.gca_suppliers as gca_sup, govbuy_ingest.gcloud_dm as dm
    loaded = _stub_bq(monkeypatch)

    def offline():
        raise RuntimeError("302 to unavailable.service.gca.gov.uk")
    monkeypatch.setattr(gca_api, "fetch_all", offline)
    monkeypatch.setattr(gca_sup, "sync", lambda run_id: (_bundle("sup"), None))
    monkeypatch.setattr(dm, "sync", lambda run_id: (_bundle("dm"), None))

    pipeline.refresh(operator="gca")

    assert [f["fact_type"] for f in loaded["facts"]] == ["sup", "dm"]


def test_refresh_fails_when_every_deterministic_source_is_offline(monkeypatch):
    import pytest
    import govbuy_ingest.gca_api as gca_api, govbuy_ingest.gca_suppliers as gca_sup, govbuy_ingest.gcloud_dm as dm
    _stub_bq(monkeypatch)

    def offline(*_a, **_k):
        raise RuntimeError("offline")
    monkeypatch.setattr(gca_api, "fetch_all", offline)
    monkeypatch.setattr(gca_sup, "sync", offline)
    monkeypatch.setattr(dm, "sync", offline)

    with pytest.raises(RuntimeError, match="every deterministic source failed"):
        pipeline.refresh(operator="gca")
