"""LLM extractor (PRD §7.2): document -> source-anchored facts. Prod uses the Anthropic API
(Haiku tier). In-session the workflow/agent layer produces the same bundle shape (no API key
needed), so this module is the production implementation; the loader is path-agnostic.
"""
from __future__ import annotations
import json
from . import config
from .models import FACT_TYPES

SYSTEM = (
    "You extract structured route-to-market facts from a UK public-sector procurement document. "
    "Return ONLY facts you can support with a VERBATIM excerpt copied character-for-character from the "
    "document text. Never paraphrase an excerpt. If you cannot quote it, do not assert it."
)

INSTRUCTION = f"""From the document, extract govbuy facts. Allowed fact_type values: {FACT_TYPES}.
For each fact return: fact_type, subject_ref (a stable natural key), payload (the typed fields),
and evidence {{source_url, source_kind, excerpt (VERBATIM substring of the document), locator,
licence, confidence 0-1}}. Output JSON: {{"facts": [ ... ]}}. Extract operators, instruments
(framework/dynamic_market with rm_reference, type, lifecycle_status), lots, award_mechanics,
buying_docs, appointment_observation (one per supplier-on-a-lot, with observed_on + observed_present),
supplier, reseller_channel (thin_prime/var/vendor), and inbound_scope (reseller->vendor)."""


class AnthropicExtractor:
    """Production extractor. Requires ANTHROPIC_API_KEY."""

    def __init__(self, model: str | None = None):
        from anthropic import Anthropic  # imported lazily so the package loads without the dep
        self.client = Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = model or config.MODEL_EXTRACT

    def extract(self, doc: dict, meter=None, operator: str | None = None) -> list[dict]:
        # ponytail: no output_config.effort here — Haiku 4.5 rejects the effort parameter (400).
        msg = self.client.messages.create(
            model=self.model, max_tokens=4096, system=SYSTEM,
            messages=[{"role": "user", "content": f"{INSTRUCTION}\n\nDOCUMENT URL: {doc['url']}\n\nDOCUMENT TEXT:\n{doc['text'][:120000]}"}],
        )
        if meter is not None:
            meter.add(self.model, msg.usage.input_tokens, msg.usage.output_tokens, operator=operator)
        text = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")
        try:
            start, end = text.index("{"), text.rindex("}") + 1
            facts = json.loads(text[start:end]).get("facts", [])
        except (ValueError, json.JSONDecodeError):
            return []
        for f in facts:
            f.setdefault("document_id", doc.get("document_id"))
        return facts
