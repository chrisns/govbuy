"""Reconcile appointment OBSERVATIONS into the resolved appointed_supplier edge (ADR-0003).

Membership is derived, evidenced, temporal: one observation row per (instrument, lot, supplier,
source, date); the resolved edge derives the validity window + surfaces conflicts (never merges
them away).
"""
from __future__ import annotations
from collections import defaultdict
from datetime import date, timedelta
from . import config


def _d(v):
    if v is None:
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def resolve(observations: list[dict], *, today: date) -> list[dict]:
    """observations: dicts with instrument_id, lot_id, supplier_id, source_id, observed_on,
    observed_present (bool), confidence, evidence_id. Returns resolved appointed_supplier rows."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for o in observations:
        if not o.get("instrument_id") or not o.get("supplier_id") or not o.get("observed_on"):
            continue  # incomplete observation — dropped by the public load too
        groups[(o["instrument_id"], o.get("lot_id"), o["supplier_id"])].append(o)

    out = []
    stale = timedelta(days=config.MEMBERSHIP_STALE_DAYS)
    for (instrument_id, lot_id, supplier_id), obs in groups.items():
        obs_sorted = sorted(obs, key=lambda o: str(o["observed_on"]))
        present = [o for o in obs_sorted if o.get("observed_present", True)]
        absent = [o for o in obs_sorted if not o.get("observed_present", True)]
        last_seen = _d(obs_sorted[-1]["observed_on"])
        appointed_from = _d(present[0]["observed_on"]) if present else None

        # Latest observation per source -> detect disagreement (conflict) at the most recent point.
        latest_by_source: dict = {}
        for o in obs_sorted:
            latest_by_source[o["source_id"]] = o.get("observed_present", True)
        conflict = len(set(latest_by_source.values())) > 1

        # left_on: latest observation says absent, OR no presence seen within the staleness window.
        latest_present = obs_sorted[-1].get("observed_present", True)
        left_on = None
        status = "active"
        if not latest_present:
            left_on = last_seen
            status = "left"
        elif (today - last_seen) > stale:
            status = "unconfirmed"
        if conflict:
            status = "conflicted"

        confs = [float(o.get("confidence", 0.5)) for o in obs_sorted]
        confidence = round(sum(confs) / len(confs), 3)
        evidence_ids = [o["evidence_id"] for o in obs_sorted if o.get("evidence_id")]

        out.append({
            "instrument_id": instrument_id,
            "lot_id": lot_id,
            "supplier_id": supplier_id,
            "appointed_from": appointed_from.isoformat() if appointed_from else None,
            "last_seen_on": last_seen.isoformat(),
            "left_on": left_on.isoformat() if left_on else None,
            "status": status,
            "confidence": confidence,
            "conflict": conflict,
            "evidence_ids": evidence_ids,
        })
    return out
