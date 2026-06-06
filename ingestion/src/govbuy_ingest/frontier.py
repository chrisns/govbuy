"""Seed frontier registry (PRD §5/§7.2). The 'add an operator = configuration not code' surface:
each entry names an operator, seed URLs, and an extraction recipe. The nightly refresh walks this;
the discover sweep proposes additions. Ordered GCA-first (most spend), then the minimum non-CCS set.
"""
from __future__ import annotations

SEED = [
    {"source_id": "gca", "operator_id": "gca", "cadence_hint": "weekly",
     "seed_urls": [
         "https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/search",
         "https://www.crowncommercial.gov.uk/agreements/RM1557.14",
         "https://www.crowncommercial.gov.uk/agreements/RM6200",
         "https://www.crowncommercial.gov.uk/agreements/RM6190",
     ],
     "recipe": {"target_fact_types": ["operator", "instrument", "lot", "award_mechanic", "buying_doc", "appointment_observation", "supplier"],
                "fetch": {"pagination": "links.next", "follow": ["agreement", "supplier"]},
                "extractor_prompt_id": "govbuy-extract", "extractor_prompt_version": "1",
                "locator_strategy": "css-section", "tos_gate": "ogl"}},
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
