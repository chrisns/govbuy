from govbuy_ingest.cost import CostMeter
from govbuy_ingest import config


def test_cost_accumulates_and_breaks_down():
    m = CostMeter()
    m.add(config.MODEL_EXTRACT, 1_000_000, 200_000)
    m.add(config.MODEL_VERIFY, 500_000, 50_000)
    assert m.gbp() > 0
    tiers = {b["tier"] for b in m.breakdown()}
    assert config.MODEL_EXTRACT in tiers and config.MODEL_VERIFY in tiers


def test_ceiling_status():
    m = CostMeter()
    assert m.status() == "ok"
    # push past the pause ceiling using the Opus tier
    m.add(config.MODEL_DISCOVER, 50_000_000, 10_000_000)
    assert m.status() in ("warn", "pause")
