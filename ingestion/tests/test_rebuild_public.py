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


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
