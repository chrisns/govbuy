"""Open, credential-free reference datasets — no API key, no rate limit.

- modern_slavery_sync(): the gov.uk Modern Slavery Statement Registry (annual CSVs, with CompanyNumber) →
  a per-supplier flag (has a published MSA s.54 statement), joined by Companies House number. A due-diligence
  signal — required of orgs with >£36m turnover; absence is NOT proof of non-compliance.
- buyer_classification_sync(): the gov.uk organisations register (open API) + a deterministic regex on each
  buyer's OWN name → a public-sector buyer TYPE (local gov / NHS / education / police / central gov / …),
  enabling spend-by-sector analytics. No fuzzy cross-entity matching, so no fabricated identities.
"""
from __future__ import annotations

import csv
import json
import os
import tempfile
import urllib.request

import httpx

from . import bq, config

csv.field_size_limit(1 << 24)
MS_BASE = "https://downloads.modern-slavery-statement-registry.service.gov.uk/publicdownloads"
GOV_ORGS = "https://www.gov.uk/api/organisations"


def _govbuy_crns() -> set[str]:
    rows = bq.query(f"""SELECT crn FROM (
        SELECT company_number crn FROM `{config.pub('supplier')}` WHERE company_number IS NOT NULL
        UNION DISTINCT SELECT supplier_crn FROM `{config.pub('tender_award')}` WHERE supplier_crn IS NOT NULL)""")
    return {str(r["crn"]).strip() for r in rows if r["crn"]}


def _norm_crn(c: str) -> str:
    c = (c or "").strip().upper()
    return c.zfill(8) if c.isdigit() else c


def modern_slavery_sync(years: tuple[int, ...] = (2023, 2024, 2025, 2026)) -> dict:
    crns = _govbuy_crns()
    tmp = tempfile.mkdtemp(prefix="msr_")
    best: dict[str, dict] = {}
    for yr in years:
        p = os.path.join(tmp, f"ms{yr}.csv")
        try:
            urllib.request.urlretrieve(f"{MS_BASE}/StatementSummaries{yr}.csv", p)
        except Exception:
            continue
        with open(p, newline="", encoding="utf-8", errors="replace") as f:
            r = csv.reader(f)
            idx = {h.strip(): i for i, h in enumerate(next(r))}

            def g(row, n):
                i = idx.get(n)
                return (row[i].strip() if i is not None and i < len(row) else "")

            for row in r:
                crn = _norm_crn(g(row, "CompanyNumber"))
                if crn not in crns:
                    continue
                best[crn] = {  # later years overwrite → most-recent statement kept
                    "company_number": crn, "organisation_name": g(row, "OrganisationName") or None,
                    "sector_type": g(row, "SectorType") or None, "statement_year": yr,
                    "statement_url": g(row, "StatementURL") or g(row, "StatementSummaryURL") or None,
                    "turnover": g(row, "Turnover") or None,
                }
        os.remove(p)
    nd = os.path.join(tmp, "modern_slavery.ndjson")
    with open(nd, "w", encoding="utf-8") as out:
        for v in best.values():
            out.write(json.dumps(v, ensure_ascii=False) + "\n")
    stats = bq.materialize_modern_slavery(nd)
    return {"target_crns": len(crns), "matched_suppliers": len(best), **stats}


def buyer_classification_sync() -> dict:
    tmp = tempfile.mkdtemp(prefix="govorgs_")
    nd = os.path.join(tmp, "gov_orgs.ndjson")
    n = 0
    page = 1
    with open(nd, "w", encoding="utf-8") as out:
        while True:
            d = httpx.get(f"{GOV_ORGS}?page={page}", timeout=30, follow_redirects=True).json()
            for r in d.get("results", []):
                parents = [p.get("title") for p in (r.get("parent_organisations") or []) if p.get("title")]
                title = r.get("title") or ""
                out.write(json.dumps({
                    "title": title,
                    "norm": " ".join("".join(c.lower() if c.isalnum() else " " for c in title).split()),
                    "format": r.get("format"), "web_url": r.get("web_url"),
                    "parent": parents[0] if parents else None,
                }, ensure_ascii=False) + "\n")
                n += 1
            if page >= d.get("pages", 1):
                break
            page += 1
    stats = bq.materialize_buyer_classification(nd)
    return {"gov_uk_orgs_fetched": n, **stats}
