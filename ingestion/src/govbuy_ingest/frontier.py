"""Seed frontier registry (PRD §5/§7.2). The 'add an operator = configuration not code' surface:
each entry names an operator, seed URLs, and an extraction recipe. The nightly refresh walks this;
the discover sweep proposes additions. Ordered GCA-first (most spend), then the minimum non-CCS set.
"""
from __future__ import annotations

# NOTE: GCA is NOT in the agentic frontier — its frameworks are ingested DETERMINISTICALLY from the
# structured API (gca.gov.uk/api/frameworks) via govbuy_ingest.gca_api (`govbuy-ingest gca-sync`).
# Only operators WITHOUT a structured API are agentic. (The G-Cloud per-service priced catalogue,
# which has no open API, would be a separate scrape sidecar if/when per-service depth is in scope.)
SEED = [
    {"source_id": "bramble_hub", "operator_id": None, "cadence_hint": "monthly",
     "seed_urls": ["https://www.bramblehub.com/", "https://www.bramblehub.com/partners"],
     "recipe": {"target_fact_types": ["supplier", "reseller_channel", "inbound_scope", "appointment_observation"],
                "fetch": {"pagination": None, "follow": ["partner"]},
                "extractor_prompt_id": "govbuy-extract", "extractor_prompt_version": "1",
                "locator_strategy": "css-list", "tos_gate": "supplier_tos"}},
    {"source_id": "bloom", "operator_id": "bloom", "cadence_hint": "monthly",
     "seed_urls": ["https://www.bloom.gov.uk/"],
     "recipe": {"target_fact_types": ["operator", "instrument", "lot", "supplier"], "fetch": {}, "extractor_prompt_id": "govbuy-extract", "extractor_prompt_version": "1", "locator_strategy": "css-section", "tos_gate": "operator_tos"}},
    {"source_id": "ypo", "operator_id": "ypo", "cadence_hint": "monthly",
     "seed_urls": ["https://www.ypo.co.uk/frameworks"],
     "recipe": {"target_fact_types": ["operator", "instrument", "lot"], "fetch": {}, "extractor_prompt_id": "govbuy-extract", "extractor_prompt_version": "1", "locator_strategy": "css-section", "tos_gate": "operator_tos"}},
    {"source_id": "nhs_sbs", "operator_id": "nhs_sbs", "cadence_hint": "monthly",
     "seed_urls": ["https://www.sbs.nhs.uk/our-frameworks/"],
     "recipe": {"target_fact_types": ["operator", "instrument", "lot"], "fetch": {}, "extractor_prompt_id": "govbuy-extract", "extractor_prompt_version": "1", "locator_strategy": "css-section", "tos_gate": "operator_tos"}},
]


def sources(operator: str | None = None) -> list[dict]:
    if operator:
        return [s for s in SEED if s["source_id"] == operator or s["operator_id"] == operator]
    return list(SEED)
