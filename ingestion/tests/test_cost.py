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


def test_per_operator_breakdown():
    # AC-7: £-per-operator dimension exists and aggregates across tiers per operator
    m = CostMeter()
    m.add(config.MODEL_EXTRACT, 1_000_000, 100_000, operator="gca")
    m.add(config.MODEL_VERIFY, 200_000, 20_000, operator="gca")
    m.add(config.MODEL_EXTRACT, 500_000, 50_000, operator="bloom")
    bo = {x["operator_id"]: x["est_gbp"] for x in m.by_operator()}
    assert set(bo) == {"gca", "bloom"}
    assert bo["gca"] > bo["bloom"] > 0
    assert round(bo["gca"] + bo["bloom"], 4) <= m.gbp() + 1e-6
