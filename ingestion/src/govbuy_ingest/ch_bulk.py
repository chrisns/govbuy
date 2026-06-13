"""Companies House bulk Company Data Product → per-supplier profile (SME / region / SIC).

Credential-free: the bulk product is a free, public, whole-population monthly snapshot (no API key, no
rate limit) at download.companieshouse.gov.uk. We download it, stream-filter it to the CRNs govbuy holds
(suppliers + award counterparties), extract the size/locality/sector fields, and materialise
govbuy_public.company_profile. This is the bulk, no-key counterpart to the live per-CRN status check the
exclusion gate makes — it gives every supplier an SME signal, a registered-office region and SIC codes
without 55k API calls.

Source fields used (BasicCompanyDataAsOneFile CSV): CompanyNumber, CompanyCategory, CompanyStatus,
CountryOfOrigin, IncorporationDate, Accounts.AccountCategory, RegAddress.County/PostTown/PostCode,
SICCode.SicText_1..4. SME likelihood is read off the filed-accounts category (a CH signal, not a
definitive determination — confirm against the Companies Act size thresholds).

  govbuy-ingest ch-bulk-sync [--date YYYY-MM-01] [--keep]
"""
from __future__ import annotations

import csv
import datetime as _dt
import json
import os
import sys
import tempfile
import zipfile

import httpx

from . import bq, config

BASE = "https://download.companieshouse.gov.uk"
csv.field_size_limit(1 << 24)


def latest_filename(date: str | None = None) -> str:
    # Snapshot is published dated the 1st of the month. Default to this month's.
    d = date or _dt.date.today().replace(day=1).isoformat()
    return f"BasicCompanyDataAsOneFile-{d}.zip"


def download(dest_dir: str, date: str | None = None) -> str:
    fn = latest_filename(date)
    url = f"{BASE}/{fn}"
    zpath = os.path.join(dest_dir, fn)
    print(f"downloading {url} …", file=sys.stderr)
    with httpx.stream("GET", url, timeout=600, follow_redirects=True) as r:
        r.raise_for_status()
        with open(zpath, "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
    with zipfile.ZipFile(zpath) as z:
        name = next(n for n in z.namelist() if n.endswith(".csv"))
        z.extract(name, dest_dir)
    return os.path.join(dest_dir, name)


def _govbuy_crns() -> set[str]:
    rows = bq.query(f"""SELECT crn FROM (
        SELECT company_number crn FROM `{config.pub('supplier')}` WHERE company_number IS NOT NULL
        UNION DISTINCT SELECT supplier_crn FROM `{config.pub('tender_award')}` WHERE supplier_crn IS NOT NULL)""")
    return {str(r["crn"]).strip() for r in rows if r["crn"]}


def filter_to_ndjson(csv_path: str, crns: set[str], out_path: str) -> int:
    n = 0
    with open(csv_path, newline="", encoding="utf-8", errors="replace") as f, open(out_path, "w", encoding="utf-8") as out:
        r = csv.reader(f)
        idx = {h.strip(): i for i, h in enumerate(next(r))}

        def g(row, name):
            i = idx.get(name)
            return (row[i].strip() if i is not None and i < len(row) else "")

        for row in r:
            crn = g(row, "CompanyNumber")
            if crn not in crns:
                continue
            sics = [v for k in ("SICCode.SicText_1", "SICCode.SicText_2", "SICCode.SicText_3", "SICCode.SicText_4")
                    if (v := g(row, k)) and v.lower() != "none supplied"]
            pc = g(row, "RegAddress.PostCode")
            out.write(json.dumps({
                "company_number": crn,
                "company_category": g(row, "CompanyCategory") or None,
                "company_status_bulk": g(row, "CompanyStatus") or None,
                "country_of_origin": g(row, "CountryOfOrigin") or None,
                "incorporated_on": g(row, "IncorporationDate") or None,
                "accounts_category": g(row, "Accounts.AccountCategory") or None,
                "region": (g(row, "RegAddress.County") or g(row, "RegAddress.PostTown") or None),
                "post_town": g(row, "RegAddress.PostTown") or None,
                "postcode_area": (pc.split(" ")[0] if pc else None),
                "sic_text": sics,
                "sic_codes": [s.split(" - ")[0].strip() for s in sics if s.split(" - ")[0].strip().isdigit()],
            }, ensure_ascii=False) + "\n")
            n += 1
    return n


def sync(date: str | None = None, keep: bool = False) -> dict:
    crns = _govbuy_crns()
    tmp = tempfile.mkdtemp(prefix="chbulk_")
    csv_path = download(tmp, date)
    nd = os.path.join(tmp, "company_profile.ndjson")
    matched = filter_to_ndjson(csv_path, crns, nd)
    stats = bq.materialize_company_profile(nd)
    if not keep:
        for p in (csv_path, nd):
            try:
                os.remove(p)
            except OSError:
                pass
    return {"target_crns": len(crns), "matched": matched, **stats}


# ── PSC ownership → corporate-group rollups (free, no key) ───────────────────────────────────────────
_PSC_MARK = b'"corporate-entity-person-with-significant-control"'


def _psc_files(date: str | None = None) -> list[str]:
    """The PSC snapshot is split into N parts dated to a specific snapshot day. Scrape the listing page
    for the current set of psc-snapshot-*.zip filenames (the date is not first-of-month, so we discover it)."""
    html = httpx.get(f"{BASE}/en_pscdata.html", timeout=60, follow_redirects=True).text
    import re
    files = re.findall(r'href="(psc-snapshot-[0-9-]+_\d+of\d+\.zip)"', html)
    if date:
        files = [f for f in files if date in f]
    return sorted(set(files))


def psc_sync(date: str | None = None, keep: bool = False) -> dict:
    """Download the free PSC snapshot, stream-filter to corporate-controller edges for govbuy's CRNs
    (>25% control), materialise supplier_group. No API key, no rate limit."""
    crns = _govbuy_crns()
    files = _psc_files(date)
    if not files:
        return {"error": "no PSC snapshot files found on the listing page"}
    tmp = tempfile.mkdtemp(prefix="chpsc_")
    nd = os.path.join(tmp, "psc_parents.ndjson")
    n_edges = 0
    with open(nd, "w", encoding="utf-8") as out:
        for fn in files:
            z = os.path.join(tmp, fn)
            with httpx.stream("GET", f"{BASE}/{fn}", timeout=600, follow_redirects=True) as r:
                r.raise_for_status()
                with open(z, "wb") as fz:
                    for chunk in r.iter_bytes(1 << 20):
                        fz.write(chunk)
            with zipfile.ZipFile(z) as zf:
                inner = next(n for n in zf.namelist() if not n.endswith("/"))
                with zf.open(inner) as fh:
                    for raw in fh:
                        if _PSC_MARK not in raw:
                            continue
                        try:
                            rec = json.loads(raw)
                        except Exception:
                            continue
                        if rec.get("company_number") not in crns:
                            continue
                        d = rec.get("data", {})
                        if d.get("kind") != "corporate-entity-person-with-significant-control":
                            continue
                        ident = d.get("identification", {}) or {}
                        parent = (ident.get("registration_number") or "").strip()
                        if not parent:
                            continue
                        out.write(json.dumps({
                            "member_crn": rec["company_number"], "parent_crn": parent,
                            "parent_name": d.get("name"), "country_registered": ident.get("country_registered"),
                            "natures_of_control": d.get("natures_of_control", []),
                        }, ensure_ascii=False) + "\n")
                        n_edges += 1
            os.remove(z)
    stats = bq.materialize_supplier_group(nd)
    if not keep:
        try:
            os.remove(nd)
        except OSError:
            pass
    return {"target_crns": len(crns), "files": len(files), "corporate_psc_edges": n_edges, **stats}
