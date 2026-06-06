"""Deterministic Digital Marketplace (G-Cloud) suppliers adapter.

G-Cloud and DOS run on the CCS/GCA **Digital Marketplace**, a separate platform from the standard
GCA agreements directory — so the GCA suppliers API (gca_suppliers.py) carries NO membership for
G-Cloud (it lists ~5k suppliers we'd otherwise miss entirely). The public supplier directory
(applytosupply.digitalmarketplace.service.gov.uk/g-cloud/suppliers) is browsable by name prefix
(A-Z + "other"), each prefix paginated, every supplier a `/g-cloud/supplier/<id>` link. This adapter
walks that directory deterministically (OGL data) and emits one supplier fact + one
appointment_observation per supplier against the live G-Cloud instrument. CRNs resolve later via the
CH matcher; cross-source supplier identity is reconciled on company_number, not on supplier_id
(a G-Cloud "dm-<id>" and a GCA-slug id for the same firm are distinct rows until CH-matched).
"""
from __future__ import annotations
import html
import re
import time
from datetime import date
import httpx
from . import config

BASE = "https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/suppliers"
PREFIXES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
            "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "other"]
# G-Cloud 14 is the live iteration; this is the instrument_id govbuy already holds for it.
GCLOUD_INSTRUMENT_ID = "g-cloud-14"
GCLOUD_RM = "RM1557.14"
_LINK = re.compile(r'/g-cloud/supplier/(\d+)"[^>]*>([^<]+)<')


def fetch_all(client: httpx.Client | None = None) -> list[dict]:
    own = client is None
    client = client or httpx.Client(timeout=30, headers={"User-Agent": config.USER_AGENT}, follow_redirects=True)
    try:
        by_id: dict[str, str] = {}
        for prefix in PREFIXES:
            page = 1
            while True:
                r = client.get(BASE, params={"prefix": prefix, "page": page})
                if r.status_code != 200:
                    break
                pairs = _LINK.findall(r.text)
                if not pairs:
                    break
                for sid, name in pairs:
                    nm = html.unescape(name).strip()
                    if nm:
                        by_id.setdefault(sid, nm)  # first prefix wins (stable)
                page += 1
                time.sleep(0.2)
        return [{"dm_id": sid, "name": nm} for sid, nm in by_id.items()]
    finally:
        if own:
            client.close()


def to_bundle(records: list[dict], run_id: str) -> dict:
    today = date.today().isoformat()
    documents: list[dict] = []
    facts: list[dict] = []
    for s in records:
        sid = "dm-" + s["dm_id"]
        name = s["name"]
        url = f"https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/supplier/{s['dm_id']}"
        doc_id = "dm-sup-" + s["dm_id"]
        documents.append({"document_id": doc_id, "url": url, "source_id": "digital_marketplace",
                          "operator_id": "gca", "content_type": "text/html", "licence": "ogl", "text": name})
        facts.append({"fact_type": "supplier", "subject_ref": sid, "document_id": doc_id,
                      "payload": {"supplier_id": sid, "display_name": name, "publisher_ids": []},
                      "evidence": {"source_url": url, "source_kind": "digital_marketplace", "excerpt": name, "licence": "ogl", "confidence": 1.0},
                      "confidence": 1.0})
        facts.append({"fact_type": "appointment_observation", "subject_ref": f"{sid}@{GCLOUD_RM}", "document_id": doc_id,
                      "payload": {"instrument_id": GCLOUD_INSTRUMENT_ID, "lot_id": None, "supplier_id": sid,
                                  "source_id": "digital_marketplace", "observed_on": today, "observed_present": True, "confidence": 1.0},
                      "evidence": {"source_url": url, "source_kind": "digital_marketplace", "excerpt": name, "licence": "ogl", "confidence": 1.0},
                      "confidence": 1.0})
    return {"run_id": run_id, "mode": "refresh", "documents": documents, "facts": facts}


def sync(run_id: str = "gcloud-dm-sync") -> tuple[dict, int]:
    recs = fetch_all()
    return to_bundle(recs, run_id), len(recs)
