"""Deterministic GCA suppliers adapter.

The GCA suppliers API (gca.gov.uk/api/suppliers) lists every appointed supplier and, per supplier,
its `live_frameworks` (with rm_number + lot ids). That is the per-framework MEMBERSHIP the frameworks
API lacks — so appointed-supplier edges for the GCA estate are DETERMINISTIC, not scraped. Each
supplier becomes a supplier fact (CRN resolved later by the CH matcher) and one appointment
observation per live framework, keyed to the same `rm-<rm>` instrument id the frameworks adapter uses.
"""
from __future__ import annotations
import math
import time
from datetime import date
import httpx
from . import config
from .gca_api import _slug

BASE = "https://www.gca.gov.uk/api/suppliers"


def fetch_all(client: httpx.Client | None = None) -> list[dict]:
    own = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": config.USER_AGENT})
    try:
        recs: list[dict] = []
        page = 1
        while True:
            r = client.get(BASE, params={"page": page})
            r.raise_for_status()
            d = r.json()
            res = d.get("results") or []
            recs.extend(res)
            meta = d.get("meta") or {}
            total = meta.get("total_results", len(recs))
            limit = meta.get("limit", 20) or 20
            if not res or len(recs) >= total or page > math.ceil(total / limit) + 1:
                break
            page += 1
            time.sleep(0.15)
        return recs
    finally:
        if own:
            client.close()


def to_bundle(records: list[dict], run_id: str) -> dict:
    today = date.today().isoformat()
    documents: list[dict] = []
    facts: list[dict] = []
    for s in records:
        name = (s.get("name") or "").strip()
        if not name:
            continue
        sid = _slug(s.get("encoded_name") or name)
        lfs = s.get("live_frameworks") or []
        doc_id = "gca-sup-" + sid
        text = name + "\n" + (s.get("trading_name") or "") + "\n" + "\n".join(f.get("title") or "" for f in lfs)
        documents.append({"document_id": doc_id, "url": "https://www.gca.gov.uk/suppliers", "source_id": "gca",
                          "operator_id": "gca", "content_type": "application/json", "licence": "ogl", "text": text})
        pubids = [f"GB-DUNS-{s['duns_number']}"] if s.get("duns_number") else []
        facts.append({"fact_type": "supplier", "subject_ref": sid, "document_id": doc_id,
                      "payload": {"supplier_id": sid, "display_name": name, "publisher_ids": pubids},
                      "evidence": {"source_url": "https://www.gca.gov.uk/suppliers", "source_kind": "gca_api", "excerpt": name, "licence": "ogl", "confidence": 1.0},
                      "confidence": 1.0})
        for f in lfs:
            rm = (f.get("rm_number") or "").strip()
            if not rm:
                continue
            iid = "rm-" + _slug(rm)
            facts.append({"fact_type": "appointment_observation", "subject_ref": f"{sid}@{rm}", "document_id": doc_id,
                          "payload": {"instrument_id": iid, "lot_id": None, "supplier_id": sid, "source_id": "gca",
                                      "observed_on": today, "observed_present": True, "confidence": 1.0},
                          "evidence": {"source_url": "https://www.gca.gov.uk/suppliers", "source_kind": "gca_api",
                                       "excerpt": (f.get("title") or name), "licence": "ogl", "confidence": 1.0},
                          "confidence": 1.0})
    return {"run_id": run_id, "mode": "refresh", "documents": documents, "facts": facts}


def sync(run_id: str = "gca-suppliers-sync") -> tuple[dict, int]:
    recs = fetch_all()
    return to_bundle(recs, run_id), len(recs)
