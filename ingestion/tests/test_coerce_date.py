from govbuy_ingest.bq import _coerce_date


def test_iso_passthrough():
    assert _coerce_date("2024-01-05") == "2024-01-05"


def test_uk_format_converted():
    assert _coerce_date("15/03/2024") == "2024-03-15"
    assert _coerce_date("30/04/2027") == "2027-04-30"
    assert _coerce_date("01-08-2023") == "2023-08-01"


def test_yyyy_slash_converted():
    assert _coerce_date("2024/3/5") == "2024-03-05"


def test_iso_with_time_truncated():
    assert _coerce_date("2024-01-05T00:00:00Z") == "2024-01-05"


def test_unparseable_and_empty_become_none():
    assert _coerce_date(None) is None
    assert _coerce_date("") is None
    assert _coerce_date("garbage") is None
    assert _coerce_date("99/99/2024") is None  # impossible day/month
