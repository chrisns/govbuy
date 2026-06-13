"""Credentialed fetch path for login-walled supplier-list portals.

The single biggest remaining coverage gap is ~328 live frameworks whose appointed-supplier list sits
behind a portal login (Hunter CSM / hunterpcm.uk → ~98 HE-consortia frameworks: NEUPC, APUC, LUPC; then
Pagabo, YPO, NHS LPP, TPPL, Advantage SW, CHIC). govbuy never fabricates membership, so these stay blank
until we can authenticate and read the real list.

This module is the READY-TO-RUN path: it authenticates with credentials supplied via env (NEVER committed,
NEVER printed), fetches each portal's supplier list, and emits rows in the same shape as the durable
official-appointments manifest so they flow through the existing verbatim gate + bq.materialize_official_appointments().

It is a SCAFFOLD: each portal has its own login flow and list markup, so the per-portal `_fetch_*` functions
must be completed against the live site once credentials exist. With no credentials present, sync() is a
safe no-op (returns []), so the pipeline never breaks.

Credentials (set in the environment / Cloud Run secret, never in code):
    HUNTER_PCM_USER, HUNTER_PCM_PASS      — Hunter CSM (hunterpcm.uk)
    PAGABO_USER,     PAGABO_PASS          — Pagabo
    (extend per portal as needed)

Output row shape (matches reference-data/official_appointments.ndjson):
    {"rm_reference": "...", "supplier_name": "...", "company_number": "<optional>",
     "lot": "<optional>", "source_url": "https://portal/..."}
"""
from __future__ import annotations

import os

import httpx

from . import config


def _creds(prefix: str) -> tuple[str, str] | None:
    u, p = os.environ.get(f"{prefix}_USER"), os.environ.get(f"{prefix}_PASS")
    return (u, p) if u and p else None


def _session() -> httpx.Client:
    return httpx.Client(timeout=40, headers={"User-Agent": config.USER_AGENT}, follow_redirects=True)


def _fetch_hunter_pcm(user: str, password: str) -> list[dict]:
    """Hunter CSM (hunterpcm.uk) → ~98 HE-consortia frameworks.

    SCAFFOLD — complete against the live portal once credentials exist:
      1. POST the login form (CSRF token usually on the login GET) to establish a session cookie.
      2. Enumerate the framework pages the account can see.
      3. For each, parse the appointed-supplier table VERBATIM (name; CRN + lot where shown).
      4. Map the portal's framework label → its RM reference (reference-data lookup) for rm_reference.
    Return the row list; the caller gates + loads it. Returns [] until implemented.
    """
    with _session() as _c:
        # login_page = _c.get("https://www.hunterpcm.uk/login"); token = parse_csrf(login_page.text)
        # _c.post("https://www.hunterpcm.uk/login", data={"username": user, "password": password, "_token": token})
        # ... enumerate + parse ...
        return []


# Registry of portals → (env-prefix, fetcher). Add a line per portal as its fetcher is implemented.
_PORTALS = {
    "hunter_pcm": ("HUNTER_PCM", _fetch_hunter_pcm),
}


def sync(only: set[str] | None = None) -> tuple[list[dict], dict]:
    """Fetch every portal we hold credentials for. Returns (rows, report). Safe no-op without creds."""
    rows: list[dict] = []
    report: dict = {}
    for key, (prefix, fetcher) in _PORTALS.items():
        if only and key not in only:
            continue
        creds = _creds(prefix)
        if not creds:
            report[key] = "skipped — no credentials in env"
            continue
        try:
            got = fetcher(*creds)
            rows.extend(got)
            report[key] = f"{len(got)} appointed-supplier rows"
        except Exception as e:  # never let one portal break the run
            report[key] = f"error: {type(e).__name__}: {e}"
    report["total_rows"] = len(rows)
    return rows, report
