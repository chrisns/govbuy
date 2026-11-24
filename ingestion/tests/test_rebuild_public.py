"""rebuild_public() must not crash when an 'instrument' fact has no instrument_id at all — the
extractor doesn't always supply one, and a standalone (non-duplicate) instrument like that used to
KeyError once ANY other instrument in the batch triggered the RM-dedup/alias path. Regression for
github.com/chrisns/govbuy/actions/runs/32386884750."""
import json
import pytest
from govbuy_ingest import bq


def _fact(fact_type, evidence_id, payload, confidence=0.9):
    return {"fact_type": fact_type, "evidence_id": evidence_id, "confidence": confidence,
            "payload": json.dumps(payload)}


def test_rebuild_public_tolerates_instrument_missing_id(monkeypatch):
    raw_rows = [
        # Duplicate pair under the same operator+rm — triggers the alias-dedup path.
        _fact("instrument", "ev1", {"instrument_id": "inst-a", "operator_id": "ypo",
                                     "rm_reference": "RM1000", "name": "Framework A v1"}),
        _fact("instrument", "ev2", {"instrument_id": "inst-b", "operator_id": "ypo",
                                     "rm_reference": "RM1000", "name": "Framework A v2", "type": "framework"}),
        # Standalone instrument the extractor never gave an instrument_id to — must survive, not crash.
        _fact("instrument", "ev3", {"operator_id": "bloom", "name": "Standalone No-ID Framework"}, confidence=0.6),
    ]
    monkeypatch.setattr(bq, "query", lambda sql: raw_rows)
    monkeypatch.setattr(bq, "_latest_ch_matches", lambda: {})

    replaced = {}
    monkeypatch.setattr(bq, "_replace", lambda table, rows: replaced.setdefault(table, rows) and 0)

    counts = bq.rebuild_public()  # would have raised KeyError('instrument_id') before the fix

    assert counts["instrument"] == 2
    ids = {r.get("instrument_id") for r in replaced["instrument"]}
    assert ids == {"inst-b", None}  # richer row (has 'type') wins canon; id-less row untouched


def test_rebuild_public_tolerates_supplier_missing_id(monkeypatch):
    """A 'supplier' fact with a display_name but no supplier_id is dropped from the public write by
    _replace's data-quality gate, but stays in the in-memory list that builds the service->supplier
    name map. That map read s['supplier_id'] unguarded and KeyError'd whenever any 'service' fact was
    present. Regression for the nightly refresh (github.com/chrisns/govbuy/actions/runs/45402045180)."""
    raw_rows = [
        _fact("supplier", "ev1", {"supplier_id": "sup-a", "display_name": "Acme Ltd"}),
        # No supplier_id: survives projection, gets dropped on write, must not crash the name map.
        _fact("supplier", "ev2", {"display_name": "Ghost Supplier"}),
        # A service fact triggers the sup_by_name path.
        _fact("service", "ev3", {"service_id": "svc-1", "instrument_id": "g-cloud-14",
                                 "supplier_name": "Acme Ltd", "name": "Widget Hosting"}),
    ]
    monkeypatch.setattr(bq, "query", lambda sql: raw_rows)
    monkeypatch.setattr(bq, "_latest_ch_matches", lambda: {})
    replaced = {}
    monkeypatch.setattr(bq, "_replace", lambda table, rows: replaced.setdefault(table, rows) and 0)

    counts = bq.rebuild_public()  # would have raised KeyError('supplier_id') before the fix

    assert counts["service"] == 1
    svc = replaced["service"][0]
    assert svc["supplier_id"] == "sup-a"  # name map still resolves the id-bearing supplier


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
