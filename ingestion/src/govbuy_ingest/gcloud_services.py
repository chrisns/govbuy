"""Deterministic Digital Marketplace (G-Cloud) SERVICE-listing adapter.

The supplier adapter (gcloud_dm.py) records WHO is on G-Cloud; this records WHAT each one actually
sells — the per-service listings a buyer browses to find "a thing that hosts my app" / "an M365
mailbox" / "a service desk". The public search
(applytosupply.digitalmarketplace.service.gov.uk/g-cloud/search) enumerates every live G-Cloud 14
service, paginated, filterable by lot; each result card carries the service name, the supplier,
the lot, and the service summary (OGL data). The detail page
(/g-cloud/services/<id>) adds the full description's features + benefits. This adapter walks the
search deterministically (no LLM, no fabrication risk) and emits one `service` fact per service,
source-anchored to its own /g-cloud/services/<id> page so a tool can cite the exact listing URL.
"""
from __future__ import annotations
import html
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import httpx

from . import config

BASE = "https://www.applytosupply.digitalmarketplace.service.gov.uk"
SEARCH = BASE + "/g-cloud/search"
# the three G-Cloud lots (every live service sits in exactly one) — also our shard keys.
LOTS = ["cloud-hosting", "cloud-software", "cloud-support"]
GCLOUD_INSTRUMENT_ID = "g-cloud-14"
GCLOUD_RM = "RM1557.14"

_CARD = re.compile(r'<li class="app-search-result">.*?</li>', re.S)
_LINK = re.compile(r'/g-cloud/services/(\d{12,15})"[^>]*>(.*?)</a>', re.S)
_PARA = re.compile(r'<p class="govuk-body[^"]*">(.*?)</p>', re.S)
_H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)


def _clean(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def _client(client: httpx.Client | None = None) -> httpx.Client:
    return client or httpx.Client(timeout=30, headers={"User-Agent": config.USER_AGENT}, follow_redirects=True)


# ----------------------------------------------------------------- enumerate (search cards)
def parse_cards(text: str, lot: str) -> list[dict]:
    out: list[dict] = []
    for c in _CARD.findall(text):
        m = _LINK.search(c)
        if not m:
            continue
        paras = [_clean(p) for p in _PARA.findall(c)]
        out.append({
            "service_id": m.group(1),
            "name": _clean(m.group(2)),
            "supplier_name": paras[0] if paras else "",
            "summary": paras[1] if len(paras) > 1 else "",
            "lot": lot,
        })
    return out


def enumerate_services(lots: list[str] | None = None, client: httpx.Client | None = None,
                       max_pages: int | None = None) -> list[dict]:
    """Walk the public search per lot, paginated; return one record per distinct service
    (service_id, name, supplier_name, summary, lot). Deterministic, OGL."""
    own = client is None
    client = _client(client)
    try:
        seen: dict[str, dict] = {}
        for lot in (lots or LOTS):
            page = 1
            while True:
                if max_pages and page > max_pages:
                    break
                r = client.get(SEARCH, params={"lot": lot, "page": page})
                if r.status_code != 200:
                    break
                cards = parse_cards(r.text, lot)
                if not cards:
                    break
                for c in cards:
                    seen.setdefault(c["service_id"], c)
                page += 1
                time.sleep(0.12)
        return list(seen.values())
    finally:
        if own:
            client.close()


# ----------------------------------------------------------------- detail enrichment
def _list_after(text: str, heading: str) -> list[str]:
    m = re.search(r"<h2[^>]*>\s*" + heading + r"\s*</h2>", text)
    if not m:
        return []
    seg = text[m.end():m.end() + 6000]
    ul = re.search(r"<ul[^>]*>(.*?)</ul>", seg, re.S)
    if not ul:
        return []
    return [x for x in (_clean(li) for li in re.findall(r"<li[^>]*>(.*?)</li>", ul.group(1), re.S)) if x]


def fetch_detail(service_id: str, client: httpx.Client | None = None) -> dict:
    """Full description + features + benefits from the service detail page. Best-effort: any
    field that can't be parsed is simply omitted (the enumeration summary remains the fallback)."""
    own = client is None
    client = _client(client)
    try:
        r = client.get(f"{BASE}/g-cloud/services/{service_id}")
        if r.status_code != 200:
            return {}
        t = r.text
        out: dict = {}
        h1 = _H1.search(t)
        if h1:
            out["name"] = _clean(h1.group(1))
            desc = _PARA.search(t[t.find("</h1>"):])
            if desc:
                out["description"] = _clean(desc.group(1))
        feats = _list_after(t, "Features")
        bens = _list_after(t, "Benefits")
        if feats:
            out["features"] = feats[:40]
        if bens:
            out["benefits"] = bens[:40]
        return out
    finally:
        if own:
            client.close()


def enrich(records: list[dict], workers: int = 8) -> list[dict]:
    """Concurrently fetch each service's detail page and merge full description/features/benefits."""
    with httpx.Client(timeout=30, headers={"User-Agent": config.USER_AGENT}, follow_redirects=True) as client:
        def one(rec: dict) -> dict:
            try:
                d = fetch_detail(rec["service_id"], client=client)
            except Exception:
                d = {}
            return {**rec, **d}
        with ThreadPoolExecutor(max_workers=workers) as ex:
            return list(ex.map(one, records))


# ----------------------------------------------------------------- bundle
def to_bundle(records: list[dict], run_id: str = "gcloud-services-sync") -> dict:
    documents: list[dict] = []
    facts: list[dict] = []
    for s in records:
        sid = s["service_id"]
        name = (s.get("name") or "").strip()
        if not sid or not name:
            continue
        url = f"{BASE}/g-cloud/services/{sid}"
        desc = (s.get("description") or s.get("summary") or "").strip()
        feats = s.get("features") or []
        bens = s.get("benefits") or []
        # the archived doc text is everything we assert, so the verbatim gate (excerpt ⊂ doc) holds.
        doc_id = "dm-svc-" + sid
        text = "\n".join([name, s.get("supplier_name", "") or "", desc] + feats + bens)
        documents.append({"document_id": doc_id, "url": url, "source_id": "digital_marketplace",
                          "operator_id": "gca", "content_type": "text/html", "licence": "ogl", "text": text})
        facts.append({
            "fact_type": "service", "subject_ref": "gcloud:" + sid, "document_id": doc_id,
            "payload": {"service_id": sid, "catalogue": "g-cloud", "supplier_id": None,
                        "supplier_name": s.get("supplier_name") or None,
                        "instrument_id": GCLOUD_INSTRUMENT_ID, "lot": s.get("lot"), "name": name,
                        "description": desc or None, "features": feats, "benefits": bens, "url": url},
            "evidence": {"source_url": url, "source_kind": "digital_marketplace", "excerpt": name,
                         "licence": "ogl", "confidence": 1.0},
            "confidence": 1.0,
        })
    return {"run_id": run_id, "mode": "refresh", "documents": documents, "facts": facts}


# ----------------------------------------------------------------- CLI entrypoints
def crawl_shard(lots: list[str], page_from: int, page_to: int, out_path: str, detail: bool = True) -> int:
    """Worker grunt-work (driven by a Haiku agent in the workflow): enumerate one lot's page range,
    optionally enrich from detail pages, write JSONL records. Prints the row count."""
    with httpx.Client(timeout=30, headers={"User-Agent": config.USER_AGENT}, follow_redirects=True) as client:
        recs: list[dict] = []
        for lot in lots:
            for page in range(page_from, page_to + 1):
                r = client.get(SEARCH, params={"lot": lot, "page": page})
                if r.status_code != 200:
                    break
                cards = parse_cards(r.text, lot)
                if not cards:
                    break
                recs += cards
                time.sleep(0.1)
    if detail and recs:
        recs = enrich(recs)
    with open(out_path, "w", encoding="utf-8") as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"shard lots={lots} pages={page_from}-{page_to} detail={detail} -> {len(recs)} rows -> {out_path}")
    return len(recs)


def sync(run_id: str = "gcloud-services-sync", detail: bool = False, max_pages: int | None = None) -> tuple[dict, int]:
    recs = enumerate_services(max_pages=max_pages)
    if detail:
        recs = enrich(recs)
    return to_bundle(recs, run_id), len(recs)
