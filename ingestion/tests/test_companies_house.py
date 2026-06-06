from govbuy_ingest.companies_house import normalise, _band
from govbuy_ingest import config


def test_normalise_strips_suffixes_and_punct():
    assert normalise("Bramble Hub Ltd.") == "bramble hub"
    assert normalise("ACME (UK) LIMITED") == "acme"


def test_bands():
    assert _band(0.95, True) == "auto_accept"
    assert _band(0.7, True) == "quarantine"
    assert _band(0.3, True) == "reject"
    assert _band(0.99, False) == "unresolved"


def test_band_thresholds_match_config():
    assert _band(config.MATCH_AUTO_ACCEPT, True) == "auto_accept"
    assert _band(config.MATCH_QUARANTINE, True) == "quarantine"
    assert _band(config.MATCH_QUARANTINE - 0.001, True) == "reject"
