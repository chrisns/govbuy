from datetime import date
from govbuy_ingest.reconcile import resolve


def _obs(supplier, present, day, source="gca", ev="e1"):
    return {"instrument_id": "i1", "lot_id": "l1", "supplier_id": supplier,
            "source_id": source, "observed_on": day, "observed_present": present,
            "confidence": 0.9, "evidence_id": ev}


def test_active_membership():
    rows = resolve([_obs("s1", True, "2026-01-01"), _obs("s1", True, "2026-06-01")], today=date(2026, 6, 6))
    assert len(rows) == 1
    r = rows[0]
    assert r["status"] == "active"
    assert r["appointed_from"] == "2026-01-01"
    assert r["left_on"] is None
    assert r["conflict"] is False


def test_left_when_latest_absent():
    rows = resolve([_obs("s1", True, "2026-01-01"), _obs("s1", False, "2026-05-01")], today=date(2026, 6, 6))
    assert rows[0]["status"] == "left"
    assert rows[0]["left_on"] == "2026-05-01"


def test_conflict_surfaced_not_merged():
    # two sources disagree on the latest state -> conflict, not collapsed
    rows = resolve([_obs("s1", True, "2026-06-01", source="gca"),
                    _obs("s1", False, "2026-06-02", source="catalogue")], today=date(2026, 6, 6))
    assert rows[0]["conflict"] is True
    assert rows[0]["status"] == "conflicted"


def test_stale_becomes_unconfirmed():
    rows = resolve([_obs("s1", True, "2025-01-01")], today=date(2026, 6, 6))
    assert rows[0]["status"] == "unconfirmed"
