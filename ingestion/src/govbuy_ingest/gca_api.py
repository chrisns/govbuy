"""Deterministic GCA adapter (refactor).

The Government Commercial Agency frameworks API (gca.gov.uk/api/frameworks) returns structured
JSON, so GCA ingestion needs NO LLM extraction and NO scraping — a faithful, current, complete
catalogue mapped straight to govbuy facts. This is the **deterministic spine** for the GCA slice
(PRD §7.1 — "deterministic where an API exists"); non-CCS operators stay agentic. Facts are still
source-anchored: the excerpt is the title/lot string taken verbatim from the API response (so the
same verbatim-substring gate passes uniformly), but there is no fabrication risk.
"""
from __future__ import annotations
import html
import math
import re
import time
import httpx
from . import config

BASE = "https://www.gca.gov.uk/api/frameworks"
_TAG = re.compile(r"<[^>]+>")


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def _plain(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub(" ", s or ""))).strip()


def _tokens(*vals: str) -> list[str]:
    out: list[str] = []
    for v in vals:
        for t in re.split(r"[^a-z0-9]+", (v or "").lower()):
            if len(t) > 1 and t not in out:
                out.append(t)
    return out


def _regime(rec: dict) -> str:
    reg = (rec.get("regulation") or "").upper()
    return "pca2023" if ("PA2023" in reg or "ACT 2023" in reg or "2023" in reg and "PCR" not in reg) else "legacy"


def _type(rec: dict) -> str:
    rt = (rec.get("regulation_type") or "").lower()
    if "dynamic" in rt:
        return "dynamic_market" if _regime(rec) == "pca2023" else "legacy_dps"
    if "open framework" in rt:
        return "open_framework"
    return "closed_framework"


def _lifecycle(rec: dict) -> str:
    s = (rec.get("status") or "").lower()
    if s == "live":
        return "live_for_call_off"
    if s in ("expired", "closed"):
        return "expired"
    return "closed_to_new_call_off"


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
            time.sleep(0.2)
        return recs
    finally:
        if own:
            client.close()


def to_bundle(records: list[dict], run_id: str) -> dict:
    documents: list[dict] = [{"document_id": "gca-api-operator", "url": BASE, "source_id": "gca",
                              "operator_id": "gca", "content_type": "application/json", "licence": "ogl",
                              "text": "Government Commercial Agency (GCA) — frameworks API."}]
    facts: list[dict] = [{"fact_type": "operator", "subject_ref": "gca", "document_id": "gca-api-operator",
                          "payload": {"operator_id": "gca", "name": "Government Commercial Agency", "kind": "gca",
                                      "funding_model": "trading_fund", "home_url": "https://www.gca.gov.uk", "status": "active"},
                          "evidence": {"source_url": BASE, "source_kind": "gca_api", "excerpt": "Government Commercial Agency", "licence": "ogl", "confidence": 1.0},
                          "confidence": 1.0}]
    for rec in records:
        rm = (rec.get("rm_number") or "").strip()
        title = rec.get("title") or rm
        iid = "rm-" + _slug(rm) if rm else _slug(title)
        lots = rec.get("lots") or []
        url = f"https://www.gca.gov.uk/agreements/{rm}" if rm else BASE
        doc_id = "gca-api-" + (_slug(rm) or _slug(title))
        lot_text = "\n".join(f"{l.get('title') or ''} {_plain(l.get('description'))}" for l in lots)
        text = f"{title}\n{_plain(rec.get('summary'))}\n{lot_text}\nGovernment Commercial Agency"
        documents.append({"document_id": doc_id, "url": url, "source_id": "gca", "operator_id": "gca",
                          "content_type": "application/json", "licence": "ogl", "text": text})
        ev = {"source_url": url, "source_kind": "gca_api", "excerpt": title, "licence": "ogl", "confidence": 1.0}
        tags = _tokens(rec.get("category"), rec.get("pillar"), rec.get("keywords"))
        facts.append({"fact_type": "instrument", "subject_ref": rm or iid, "document_id": doc_id,
                      "payload": {"instrument_id": iid, "operator_id": "gca", "name": title, "rm_reference": rm,
                                  "type": _type(rec), "regime": _regime(rec), "lifecycle_status": _lifecycle(rec),
                                  "starts_on": rec.get("start_date"), "expires_on": rec.get("end_date"),
                                  "category_tags": tags, "official_url": url},
                      "evidence": ev, "confidence": 1.0})
        for i, l in enumerate(lots, 1):
            lt = l.get("title") or ""
            if not lt:
                continue
            facts.append({"fact_type": "lot", "subject_ref": f"{iid}-lot-{i}", "document_id": doc_id,
                          "payload": {"lot_id": f"{iid}-lot-{i}", "instrument_id": iid, "number": str(i),
                                      "title": lt, "scope": _plain(l.get("description")), "category_tags": tags},
                          "evidence": {"source_url": url, "source_kind": "gca_api", "excerpt": lt, "licence": "ogl", "confidence": 1.0},
                          "confidence": 1.0})
    return {"run_id": run_id, "mode": "refresh", "documents": documents, "facts": facts}


def sync(run_id: str = "gca-api-sync") -> tuple[dict, int]:
    recs = fetch_all()
    return to_bundle(recs, run_id), len(recs)
