"""The deterministic anti-fabrication gate (PRD §7.2 / ADR-0004 / B6).

An extracted claim's cited excerpt MUST appear as a whitespace-normalised verbatim
substring of the archived source document, else the fact is quarantined. This is a
pure, NON-LLM check — it is what makes 'source-anchored' mean the quote is real, not
merely that an evidence row exists.
"""
from __future__ import annotations
import re

_WS = re.compile(r"\s+")


def normalise(text: str) -> str:
    return _WS.sub(" ", (text or "")).strip().lower()


def excerpt_in_document(excerpt: str, document_text: str) -> bool:
    """True iff the (whitespace-normalised, case-insensitive) excerpt is a substring
    of the (normalised) document. Empty excerpts never pass."""
    e = normalise(excerpt)
    if not e:
        return False
    return e in normalise(document_text)
