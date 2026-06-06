"""Fact-bundle contract + fact-type -> public-table projection.

A bundle (produced by the prod Anthropic extractor OR, in-session, by the workflow agents)
is JSON:
{
  "run_id": str, "mode": str,
  "documents": [{document_id, source_id, operator_id, url, content_type, licence, fetched_at, text}],
  "facts": [{fact_type, subject_ref, payload:{...}, document_id,
             evidence:{source_url, source_kind, excerpt, locator, licence, confidence}, confidence}]
}
payload keys for each fact_type are exactly the typed public-table columns below (minus evidence_id,
which the loader fills after inserting the evidence row).
"""
from __future__ import annotations

# Public-table columns per fact_type (must match sql/schema.sql). evidence_id filled by the loader.
TABLE_COLUMNS = {
    "operator": ["operator_id", "name", "kind", "funding_model", "home_url", "status"],
    "instrument": ["instrument_id", "operator_id", "name", "rm_reference", "type", "regime",
                   "lifecycle_status", "starts_on", "expires_on", "predecessor_id",
                   "category_tags", "official_url"],
    "lot": ["lot_id", "instrument_id", "number", "title", "scope", "category_tags"],
    "award_mechanic": ["instrument_id", "lot_id", "mechanic", "permitted", "conditions"],
    "buying_doc": ["doc_id", "instrument_id", "lot_id", "doc_type", "title", "url",
                   "required_for_purchase", "summary"],
    "appointment_observation": ["instrument_id", "lot_id", "supplier_id", "source_id",
                                "observed_on", "observed_present", "confidence"],
    "supplier": ["supplier_id", "display_name", "publisher_ids"],
    "reseller_channel": ["supplier_id", "channel_type", "confidence"],
    "inbound_scope": ["supplier_id", "vendor_name", "vendor_company_number", "confidence"],
}

FACT_TYPES = list(TABLE_COLUMNS.keys())

# Natural key per typed table for dedup when projecting verified facts -> public (build-and-swap).
NATURAL_KEY = {
    "operator": ("operator_id",),
    "instrument": ("instrument_id",),
    "lot": ("lot_id",),
    "award_mechanic": ("instrument_id", "lot_id", "mechanic"),
    "buying_doc": ("doc_id",),
    "appointment_observation": ("instrument_id", "lot_id", "supplier_id", "source_id", "observed_on"),
    "supplier": ("supplier_id",),
    "reseller_channel": ("supplier_id", "channel_type"),
    "inbound_scope": ("supplier_id", "vendor_name"),
}

# Tolerate field-name drift from fuzzy extraction (payload_key -> schema column).
ALIASES = {
    "instrument": {"start_on": "starts_on", "start_date": "starts_on", "end_date": "expires_on"},
    "lot": {"lot_number": "number", "name": "title", "lot_title": "title"},
    "supplier": {"name": "display_name", "supplier_name": "display_name"},
    "buying_doc": {"name": "title", "document_url": "url", "doc_url": "url"},
    "inbound_scope": {"vendor": "vendor_name", "vendor_title": "vendor_name"},
    "reseller_channel": {"channel": "channel_type"},
}

ALLOWED_MECHANICS = {"call_off_no_further_competition", "further_competition", "competitive_flexible_procedure"}
ALLOWED_INSTRUMENT_TYPES = {"closed_framework", "open_framework", "dynamic_market", "legacy_dps"}
ALLOWED_LIFECYCLE = {"live_for_call_off", "closed_to_new_call_off", "expired"}
ALLOWED_CHANNELS = {"thin_prime", "var", "vendor", "hybrid", "unknown"}
