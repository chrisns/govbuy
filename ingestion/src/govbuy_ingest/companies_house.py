"""Companies House matcher (PRD §7.3 / N4): trading name -> CRN with confidence bands.

Match-only + point-in-time snapshot (ADR-0001): we keep the CRN, registered name, match
confidence/band, and the status AS OF the match — never a refreshed mirror, no officers/PSC.
"""
from __future__ import annotations
import difflib
import re
import time
import httpx
from . import config

CH_BASE = "https://api.company-information.service.gov.uk"
_SUFFIX = re.compile(r"\b(ltd|limited|plc|llp|llc|inc|co|company|holdings|group|uk|the)\b", re.I)
_NONALNUM = re.compile(r"[^a-z0-9 ]+")


def normalise(name: str) -> str:
    n = (name or "").lower()
    n = _NONALNUM.sub(" ", n)
    n = _SUFFIX.sub(" ", n)
    return re.sub(r"\s+", " ", n).strip()


def _band(conf: float, has_candidate: bool) -> str:
    if not has_candidate:
        return "unresolved"
    if conf >= config.MATCH_AUTO_ACCEPT:
        return "auto_accept"
    if conf >= config.MATCH_QUARANTINE:
        return "quarantine"
    return "reject"


def search(name: str, *, key: str, client: httpx.Client) -> list[dict]:
    # CH rate-limits at 600 req / 5 min. Back off (exponential, honouring Retry-After) on a 429 OR a
    # transient network error (connection reset, timeout) rather than dying — a long full-estate match
    # of ~18k suppliers WILL hit the odd dropped connection and must survive it.
    delay = 2.0
    last_exc: Exception | None = None
    for attempt in range(8):
        try:
            r = client.get(f"{CH_BASE}/search/companies", params={"q": name, "items_per_page": 10}, auth=(key, ""))
        except httpx.RequestError as e:  # connect/read/timeout — retry, do not abort the run
            last_exc = e
            time.sleep(delay)
            delay = min(delay * 2, 60.0)
            continue
        if r.status_code == 429:
            ra = r.headers.get("Retry-After")
            time.sleep(float(ra) if ra and ra.isdigit() else delay)
            delay = min(delay * 2, 60.0)
            continue
        r.raise_for_status()
        return r.json().get("items", [])
    if last_exc is not None:
        raise last_exc  # exhausted retries on a network error
    r.raise_for_status()  # exhausted retries -> surface the final 429
    return r.json().get("items", [])


def match_name(name: str, *, key: str | None = None, client: httpx.Client | None = None) -> dict:
    """Resolve a trading name to a CRN. Returns the snapshot dict (no API call if key missing)."""
    key = key or config.COMPANIES_HOUSE_API
    base = {"company_number": None, "registered_name": None, "match_confidence": 0.0,
            "match_band": "unresolved", "status_at_match": None, "method": "none"}
    if not key:
        return base
    own = client is None
    client = client or httpx.Client(timeout=20, headers={"User-Agent": config.USER_AGENT})
    try:
        target = normalise(name)
        items = search(name, key=key, client=client)
        if not items:
            return base
        best, best_score = None, 0.0
        for it in items:
            cand = normalise(it.get("title", ""))
            score = difflib.SequenceMatcher(None, target, cand).ratio()
            # also consider previous names
            for pn in (it.get("previous_company_names") or []):
                score = max(score, difflib.SequenceMatcher(None, target, normalise(pn.get("name", ""))).ratio())
            if score > best_score:
                best, best_score = it, score
        conf = round(best_score, 3)
        return {
            "company_number": best.get("company_number"),
            "registered_name": best.get("title"),
            "match_confidence": conf,
            "match_band": _band(conf, True),
            "status_at_match": best.get("company_status"),
            "method": "fuzzy_name",
        }
    finally:
        if own:
            client.close()
        time.sleep(0.6)  # ~100/min = 500/5min, comfortably under CH's 600/5min limit (was 0.5 = at the edge)
