from govbuy_ingest.gca_api import _type, _regime, _lifecycle, to_bundle


def rec(**k):
    base = {"rm_number": "RM6200", "title": "Artificial Intelligence (AI)", "regulation": "PCR2015",
            "regulation_type": "Dynamic Purchasing System", "status": "Live", "start_date": "2020-09-03",
            "end_date": "2029-02-23", "category": "Software", "pillar": "Technology",
            "summary": "<p>AI services</p>", "lots": [{"title": "Artificial Intelligence (AI)", "description": "x"}]}
    base.update(k)
    return base


def test_type_mapping():
    assert _type(rec()) == "legacy_dps"
    assert _type(rec(regulation="PA2023")) == "dynamic_market"
    assert _type(rec(regulation_type="PCR15 Framework")) == "closed_framework"
    assert _type(rec(regulation_type="Open Framework", regulation="PA2023")) == "open_framework"


def test_regime_and_lifecycle():
    assert _regime(rec()) == "legacy"
    assert _regime(rec(regulation="PA2023")) == "pca2023"
    assert _lifecycle(rec()) == "live_for_call_off"
    assert _lifecycle(rec(status="Expired")) == "expired"


def test_to_bundle_maps_fields():
    b = to_bundle([rec()], "t")
    insts = [f for f in b["facts"] if f["fact_type"] == "instrument"]
    assert len(insts) == 1
    p = insts[0]["payload"]
    assert p["rm_reference"] == "RM6200" and p["operator_id"] == "gca"
    assert p["type"] == "legacy_dps" and p["regime"] == "legacy" and p["lifecycle_status"] == "live_for_call_off"
    assert p["expires_on"] == "2029-02-23"
    assert "software" in p["category_tags"]
    assert any(f["fact_type"] == "operator" for f in b["facts"])
    assert any(f["fact_type"] == "lot" for f in b["facts"])


def test_deterministic_facts_are_source_anchored():
    # every fact's excerpt must be a verbatim substring of its document text (the gate passes uniformly)
    b = to_bundle([rec(), rec(rm_number="RM1557.14", title="G-Cloud 14", regulation_type="PCR15 Framework")], "t")
    docs = {d["document_id"]: d["text"] for d in b["documents"]}
    for f in b["facts"]:
        assert f["evidence"]["excerpt"] in docs[f["document_id"]], f"excerpt not in doc for {f['fact_type']}"
