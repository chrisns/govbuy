"""Dead-man's switch (PRD §7.2 / ADR-0005): alert if no successful refresh within the
threshold. Exits non-zero on alert so an operator can wire it to any channel
(`govbuy-ingest liveness || notify ...`)."""
from __future__ import annotations
from datetime import datetime, timezone
from . import bq, config


def check() -> int:
    try:
        rows = bq.query(f"SELECT finished_at FROM `{config.pub('run_summary')}` WHERE status='success' ORDER BY finished_at DESC LIMIT 1")
    except Exception as e:  # noqa: BLE001
        print(f"LIVENESS ALERT: cannot read run_summary ({e})")
        return 2
    if not rows or rows[0]["finished_at"] is None:
        print("LIVENESS ALERT: no successful govbuy refresh has ever been recorded.")
        return 2
    last = rows[0]["finished_at"]
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    age_h = (datetime.now(timezone.utc) - last).total_seconds() / 3600
    if age_h > config.LIVENESS_MAX_HOURS:
        print(f"LIVENESS ALERT: last successful refresh was {age_h:.1f}h ago (threshold {config.LIVENESS_MAX_HOURS}h).")
        return 2
    print(f"OK: last successful refresh {age_h:.1f}h ago (threshold {config.LIVENESS_MAX_HOURS}h).")
    return 0
