"""Polite fetching + archiving (PRD §7.2 / ADR-0004): robots.txt, identify the crawler,
archive the bytes (the substring-gate source of truth)."""
from __future__ import annotations
import hashlib
import urllib.robotparser
from urllib.parse import urlparse
import httpx
from . import config

_robots: dict[str, urllib.robotparser.RobotFileParser] = {}


def robots_ok(url: str) -> bool:
    try:
        pr = urlparse(url)
        base = f"{pr.scheme}://{pr.netloc}"
        rp = _robots.get(base)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(f"{base}/robots.txt")
            try:
                rp.read()
            except Exception:  # noqa: BLE001
                return True  # absent/unreadable robots.txt -> allowed
            _robots[base] = rp
        return rp.can_fetch(config.USER_AGENT, url)
    except Exception:  # noqa: BLE001
        return True


def document_id(url: str, text: str) -> str:
    return "doc_" + hashlib.sha256((url + "\n" + text).encode()).hexdigest()[:24]


def fetch(url: str) -> dict:
    """Returns {url, text, content_type, http_status, robots_ok}. HTML/text only;
    PDF/XLSX extraction is a prod extension (the extractor is handed raw bytes there)."""
    ok = robots_ok(url)
    with httpx.Client(timeout=30, headers={"User-Agent": config.USER_AGENT}, follow_redirects=True) as c:
        r = c.get(url)
        ctype = r.headers.get("content-type", "")
        text = r.text if "text" in ctype or "html" in ctype or "json" in ctype else ""
        return {"url": url, "text": text, "content_type": ctype, "http_status": r.status_code, "robots_ok": ok}
