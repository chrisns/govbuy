"""Additional public catalogue adapters → the shared `service` table (capability search).

G-Cloud (gcloud_services.py) is the big one; this module adds the other PUBLIC, per-item catalogues
identified in docs/marketplaces.md. Each emits `service` facts in the same shape, tagged with a
`catalogue` so a buyer's capability question ("host my app", "an M365 mailbox", "a service desk")
resolves across every catalogue we hold. Pricing being login-walled is NOT a reason to skip a
catalogue — we index the item name/description/category, which is what capability search needs.

Adapters here are deterministic HTML (no LLM). JS-only catalogues (Azure/GCP marketplaces, NHS
Supply Chain) are handled out-of-band via the browser and loaded through the same service_bundle().
"""
from __future__ import annotations
import html
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from . import config


def _clean(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", s or "")).strip()


def _client() -> httpx.Client:
    return httpx.Client(timeout=30, headers={"User-Agent": config.USER_AGENT}, follow_redirects=True)


def _get(url: str, client: httpx.Client, params: dict | None = None) -> tuple[int, str]:
    """GET with TLS verification. httpx uses its bundled CAs; some public catalogues (e.g. NHS
    Buying Catalogue) serve an incomplete chain that the system trust store completes but the bundle
    doesn't — on that TLS error, fall back to curl, which verifies against the system store (still a
    verified request, just a more complete trust store)."""
    try:
        r = client.get(url, params=params)
        return r.status_code, r.text
    except httpx.ConnectError:
        full = url
        if params:
            full += ("&" if "?" in url else "?") + "&".join(f"{k}={v}" for k, v in params.items())
        p = subprocess.run(["curl", "-sL", "--max-time", "30", "-A", config.USER_AGENT, full],
                           capture_output=True, text=True)
        return (200 if p.returncode == 0 and p.stdout else 599), p.stdout


# ----------------------------------------------------------------- generic bundle
def service_bundle(records: list[dict], catalogue: str, run_id: str, *, instrument_id: str,
                   source_kind: str, licence: str = "ogl") -> dict:
    """records: [{service_id, name, supplier_name?, description?, features?, benefits?, url, lot?}]."""
    documents: list[dict] = []
    facts: list[dict] = []
    for s in records:
        sid = str(s.get("service_id") or "").strip()
        name = (s.get("name") or "").strip()
        url = (s.get("url") or "").strip()
        if not sid or not name or not url:
            continue
        gid = f"{catalogue}:{sid}"
        desc = (s.get("description") or "").strip()
        feats = s.get("features") or []
        bens = s.get("benefits") or []
        doc_id = "cat-" + re.sub(r"[^a-z0-9]+", "-", gid.lower())[:120]
        text = "\n".join([name, s.get("supplier_name", "") or "", desc] + feats + bens)
        documents.append({"document_id": doc_id, "url": url, "source_id": catalogue,
                          "operator_id": None, "content_type": "text/html", "licence": licence, "text": text})
        facts.append({
            "fact_type": "service", "subject_ref": gid, "document_id": doc_id,
            "payload": {"service_id": gid, "catalogue": catalogue, "supplier_id": None,
                        "supplier_name": s.get("supplier_name") or None, "instrument_id": instrument_id,
                        "lot": s.get("lot"), "name": name, "description": desc or None,
                        "features": feats, "benefits": bens, "url": url},
            "evidence": {"source_url": url, "source_kind": source_kind, "excerpt": name, "licence": licence, "confidence": 1.0},
            "confidence": 1.0,
        })
    return {"run_id": run_id, "mode": "refresh", "documents": documents, "facts": facts}


def _fetch_all(urls: list[str], parse, workers: int = 8) -> list[dict]:
    with _client() as client:
        def one(u: str):
            try:
                code, text = _get(u, client)
                return parse(text, u) if code == 200 else None
            except Exception:
                return None
        with ThreadPoolExecutor(max_workers=workers) as ex:
            return [x for x in ex.map(one, urls) if x]


# ----------------------------------------------------------------- NDX (National Digital Exchange)
NDX_BASE = "https://ndx.digital.cabinet-office.gov.uk"


def ndx_enumerate(client: httpx.Client) -> list[str]:
    _, text = _get(f"{NDX_BASE}/catalogue/", client)
    paths = sorted(set(re.findall(r"/catalogue/[a-z0-9-]+/[a-z0-9-]+/", text)))
    return [NDX_BASE + p for p in paths]


def _ndx_parse(t: str, url: str) -> dict | None:
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)
    if not h1:
        return None
    name = _clean(h1.group(1))
    paras = [p for p in (_clean(x) for x in re.findall(r"<p[^>]*>(.*?)</p>", t, re.S)) if len(p) > 50]
    # drop chrome ("National Digital Exchange", "Deploy this now")
    paras = [p for p in paras if "national digital exchange" not in p.lower() and not p.lower().startswith("deploy this")]
    parts = [x for x in url.split("/") if x]
    vendor = parts[-2].replace("-", " ").title() if len(parts) >= 2 else ""
    return {"service_id": "/".join(parts[-2:]), "name": name, "supplier_name": vendor,
            "description": " ".join(paras[:4])[:4000], "url": url, "lot": parts[-2]}


def ndx_sync(run_id: str = "ndx-sync") -> tuple[dict, int]:
    with _client() as client:
        urls = ndx_enumerate(client)
    recs = _fetch_all(urls, _ndx_parse)
    return service_bundle(recs, "ndx", run_id, instrument_id="ndx", source_kind="ndx_catalogue", licence="ogl"), len(recs)


# ----------------------------------------------------------------- NHS Buying Catalogue
NHSBC_BASE = "https://buyingcatalogue.digital.nhs.uk"


def nhsbc_enumerate(client: httpx.Client) -> list[str]:
    # The list is paginated/filtered; sweep the public solutions list + any solution links it exposes.
    ids: set[str] = set()
    for page in range(1, 30):
        code, text = _get(f"{NHSBC_BASE}/catalogue-solutions", client, params={"page": page})
        if code != 200:
            break
        found = set(re.findall(r"catalogue-solutions/(\d+-\d+)", text))
        if not found - ids and page > 1:
            break
        ids |= found
        time.sleep(0.15)
    return [f"{NHSBC_BASE}/catalogue-solutions/{i}" for i in sorted(ids)]


def _nhsbc_parse(t: str, url: str) -> dict | None:
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)
    if not h1:
        return None
    name = _clean(h1.group(1)).split("  ")[0].strip()
    paras = [p for p in (_clean(x) for x in re.findall(r"<p[^>]*>(.*?)</p>", t, re.S)) if len(p) > 40]
    # supplier often rendered as "Supplier name: X" or in a definition list
    sup = re.search(r"[Ss]upplier(?:\s+name)?[:\s]*</[^>]+>\s*<[^>]+>([^<]+)", t)
    sid = url.rstrip("/").split("/")[-1]
    return {"service_id": sid, "name": name, "supplier_name": _clean(sup.group(1)) if sup else None,
            "description": " ".join(paras[:5])[:4000], "url": url, "lot": "clinical-it"}


def nhsbc_sync(run_id: str = "nhs-buying-catalogue-sync") -> tuple[dict, int]:
    with _client() as client:
        urls = nhsbc_enumerate(client)
    recs = _fetch_all(urls, _nhsbc_parse)
    return service_bundle(recs, "nhs-buying-catalogue", run_id, instrument_id="nhs-buying-catalogue",
                          source_kind="nhs_buying_catalogue", licence="ogl"), len(recs)


# ----------------------------------------------------------------- ESPO (Klevu search API)
# ESPO's Magento storefront renders products client-side via Klevu (SaaS search). The Klevu v2 search
# API is a public JSON endpoint keyed by the client-side apiKey embedded in the page — so we page the
# whole catalogue token-free, no browser. (key/server are public client config, not secrets.)
ESPO_KLEVU = "https://eucs32v2.ksearchnet.com/cs/v2/search"
ESPO_KEY = "klevu-169116356914516627"


def espo_sync(run_id: str = "espo-sync", page: int = 100) -> tuple[dict, int]:
    recs: list[dict] = []
    seen: set[str] = set()
    with httpx.Client(timeout=40, headers={"User-Agent": config.USER_AGENT}) as client:
        offset, total = 0, None
        while total is None or offset < total:
            body = {"context": {"apiKeys": [ESPO_KEY]},
                    "recordQueries": [{"id": "p", "typeOfRequest": "SEARCH",
                        "settings": {"query": {"term": "*"}, "limit": page, "offset": offset,
                                     "typeOfRecords": ["KLEVU_PRODUCT"],
                                     "fields": ["name", "url", "shortDesc", "price", "sku", "category", "brand"]}}]}
            r = client.post(ESPO_KLEVU, json=body)
            if r.status_code != 200:
                break
            qr = r.json()["queryResults"][0]
            total = qr["meta"]["totalResultsFound"]
            records = qr.get("records") or []
            if not records:
                break
            for x in records:
                sid = str(x.get("id") or x.get("sku") or "").split(";;")[0]
                if not sid or sid in seen:
                    continue
                seen.add(sid)
                cat = (x.get("category") or "").replace(";;", " / ").strip(" /")
                desc = (x.get("shortDesc") or "").strip()
                bits = []
                if desc:
                    bits.append(desc)
                if cat:
                    bits.append("Categories: " + cat)
                if x.get("price"):
                    bits.append("Price (ex VAT): £" + str(x["price"]))
                recs.append({"service_id": sid, "name": (x.get("name") or "").strip(),
                             "supplier_name": (x.get("brand") or "ESPO").strip(),
                             "description": " — ".join(bits), "url": x.get("url"),
                             "lot": cat.split(" / ")[0] if cat else None})
            offset += page
    return service_bundle(recs, "espo", run_id, instrument_id="espo", source_kind="espo_catalogue",
                          licence="operator_tos"), len(recs)


# ----------------------------------------------------------------- YPO (Sitecore Discover search API)
# YPO renders its grid from Sitecore Discover (entity "ypocontent", widget rfkid_7). The endpoint is
# authorised by a CLIENT token (the public VITE_API_KEY in www.ypo.co.uk/dist/config.json — not a
# secret; it's shipped to every browser). We replay it server-side: page the whole catalogue with no
# category filter; if Discover caps deep pagination, shard by top_level_taxonomy. Token-free.
YPO_DISCOVER = "https://discover-euc1.sitecorecloud.io/discover/v2/245100621"


def _ypo_auth() -> str:
    try:
        with _client() as c:
            return _get("https://www.ypo.co.uk/dist/config.json", c)[1] and __import__("json").loads(
                _get("https://www.ypo.co.uk/dist/config.json", c)[1])["VITE_API_KEY"]
    except Exception:
        return "01-a3aae7ab-cded78930528ce6102cf1dcc23b9be1501fb0781"


def _ypo_query(client: httpx.Client, taxonomy: str | None, offset: int, limit: int) -> dict:
    filters = [{"type": "not", "filter": {"type": "eq", "name": "indexing_failed", "value": True}}]
    if taxonomy:
        filters.append({"type": "eq", "name": "top_level_taxonomy", "value": taxonomy})
    body = {"context": {"page": {"uri": "/products"}},
            "widget": {"items": [{"rfk_id": "rfkid_7", "entity": "ypocontent",
                "search": {"content": {}, "offset": offset, "limit": limit, "query": {"operator": "and"},
                           "facet": {"all": True}, "filter": {"type": "and", "filters": filters}}}]}}
    return (client.post(YPO_DISCOVER, json=body).json().get("widgets") or [{}])[0]


def _ypo_rec(x: dict) -> dict | None:
    sid = str(x.get("unique_id") or x.get("id") or x.get("sitecore_product_id") or "")
    url = x.get("product_url") or ""
    name = (x.get("name") or x.get("title") or "").strip()
    if not sid or not url or not name:
        return None
    if not url.startswith("http"):
        url = "https://www.ypo.co.uk" + url
    tax = x.get("product_taxonomy_titles")
    cat = " / ".join(tax) if isinstance(tax, list) else (tax or "")
    desc = (x.get("web_description") or x.get("description") or "").strip()
    bits = [desc] if desc else []
    if cat:
        bits.append("Categories: " + cat)
    if x.get("price"):
        bits.append("Price: £" + str(x["price"]))
    return {"service_id": sid, "name": name, "supplier_name": x.get("brand") or "YPO",
            "description": " — ".join(bits), "url": url,
            "lot": cat.split(" / ")[0] if cat else None}


def ypo_sync(run_id: str = "ypo-sync", page: int = 100) -> tuple[dict, int]:
    auth = _ypo_auth()
    recs: list[dict] = []
    seen: set[str] = set()
    with httpx.Client(timeout=40, headers={"User-Agent": config.USER_AGENT, "Authorization": auth,
                                           "Content-Type": "application/json"}) as client:
        def crawl(taxonomy: str | None) -> int:
            offset = 0
            w0 = _ypo_query(client, taxonomy, 0, page)
            total = w0.get("total_item", 0)
            while True:
                w = w0 if offset == 0 else _ypo_query(client, taxonomy, offset, page)
                items = w.get("content") or []
                if not items:
                    break
                for x in items:
                    rec = _ypo_rec(x)
                    if rec and rec["service_id"] not in seen:
                        seen.add(rec["service_id"]); recs.append(rec)
                offset += page
                if offset >= total or offset >= 10000:  # Discover caps deep pagination ~10k
                    break
            return total
        total = crawl(None)
        if total >= 10000:  # capped — shard by top-level taxonomy to get the rest
            w = _ypo_query(client, None, 0, 1)
            facets = w.get("facet") or w.get("facets") or []
            taxes: list[str] = []
            for f in facets:
                if (f.get("name") or f.get("identifier")) == "top_level_taxonomy":
                    taxes = [v.get("text") or v.get("value") for v in (f.get("value") or f.get("values") or [])]
            for t in taxes:
                if t:
                    crawl(t)
    return service_bundle(recs, "ypo", run_id, instrument_id="ypo", source_kind="ypo_catalogue",
                          licence="operator_tos"), len(recs)
