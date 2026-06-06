from datetime import datetime, timezone, timedelta
from govbuy_ingest.bq import _health


def _iso(dt):
    return dt.isoformat()


def test_green_on_recent_success():
    assert _health("success", _iso(datetime.now(timezone.utc))) == "green"


def test_red_on_failed_run():
    assert _health("failed", _iso(datetime.now(timezone.utc))) == "red"


def test_red_on_paused_run():
    assert _health("paused_ceiling", _iso(datetime.now(timezone.utc))) == "red"


def test_red_when_stale_beyond_window():
    old = datetime.now(timezone.utc) - timedelta(hours=72)
    assert _health("success", _iso(old)) == "red"


def test_red_when_never_succeeded():
    assert _health("success", None) == "red"
