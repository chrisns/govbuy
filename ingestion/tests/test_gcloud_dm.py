from govbuy_ingest.gcloud_dm import _LINK, to_bundle, GCLOUD_INSTRUMENT_ID

SAMPLE = '''
<ul>
  <li><a href="/g-cloud/supplier/717168">A2Z SOFTWARE SOLUTIONS LIMITED</a></li>
  <li><a href="/g-cloud/supplier/710389">A&amp;A DIGITAL TECH LTD</a></li>
</ul>
'''


def test_link_regex_parses_id_and_name():
    pairs = _LINK.findall(SAMPLE)
    assert ("717168", "A2Z SOFTWARE SOLUTIONS LIMITED") in pairs
    assert len(pairs) == 2


def test_to_bundle_emits_supplier_and_observation():
    recs = [{"dm_id": "717168", "name": "A2Z SOFTWARE SOLUTIONS LIMITED"},
            {"dm_id": "710389", "name": "A&A DIGITAL TECH LTD"}]
    b = to_bundle(recs, "t")
    sups = [f for f in b["facts"] if f["fact_type"] == "supplier"]
    obs = [f for f in b["facts"] if f["fact_type"] == "appointment_observation"]
    assert len(sups) == 2 and len(obs) == 2
    assert sups[0]["payload"]["supplier_id"] == "dm-717168"
    # appointment attaches to the live G-Cloud instrument
    assert all(o["payload"]["instrument_id"] == GCLOUD_INSTRUMENT_ID for o in obs)
    assert all(o["payload"]["source_id"] == "digital_marketplace" for o in obs)


def test_evidence_excerpt_is_verbatim_substring_of_doc():
    # the gate requires excerpt ⊂ document text; doc text is the supplier name verbatim
    b = to_bundle([{"dm_id": "1", "name": "ACME LTD"}], "t")
    doc_text = {d["document_id"]: d["text"] for d in b["documents"]}
    for f in b["facts"]:
        assert f["evidence"]["excerpt"] in doc_text[f["document_id"]]
