"""Static reference data shipped in-repo (PRD §13). Payment mechanisms are the key static table:
they are NEVER routes (is_route always FALSE). Other reference data (CPV, route taxonomy) is reused
from the sibling / derived during ingestion."""
from __future__ import annotations

PAYMENT_MECHANISMS = [
    {"mechanism": "purchase_order_invoice", "is_route": False, "permitted_for_procurement": "yes_default",
     "governing_source": "Managing Public Money Annex 4.6", "notes": "The default, preferred compliant settlement channel for committed spend."},
    {"mechanism": "gpc", "is_route": False, "permitted_for_procurement": "narrow",
     "governing_source": "Pan-Government GPC Policy v4.0", "notes": "Charge card; banned where a procurement route exists (Mar 2025); central-gov txns >=GBP500 published. A payment mechanism, never a route."},
    {"mechanism": "expenses", "is_route": False, "permitted_for_procurement": "no",
     "governing_source": "Civil Service Management Code", "notes": "Personal reimbursement; not a sanctioned way to procure beyond trivial incidental spend (shadow IT/AI backdoor)."},
    {"mechanism": "petty_cash", "is_route": False, "permitted_for_procurement": "narrow",
     "governing_source": "Local financial regulations", "notes": "De-minimis urgent items only."},
    {"mechanism": "direct_debit", "is_route": False, "permitted_for_procurement": "no",
     "governing_source": "Government Banking", "notes": "Settles recurring committed liabilities once a contract exists."},
    {"mechanism": "marketplace_consumption", "is_route": False, "permitted_for_procurement": "no",
     "governing_source": "G-Cloud / hyperscaler", "notes": "Consumption billing sits on top of a route; not itself a compliant route."},
    {"mechanism": "inter_entity_recharge", "is_route": False, "permitted_for_procurement": "no",
     "governing_source": "Managing Public Money Ch6", "notes": "Internal cost recovery between public bodies; neither creates nor substitutes for a procurement decision."},
]


def seed() -> dict:
    from . import bq
    import json
    from pathlib import Path
    bq._replace("payment_mechanism", PAYMENT_MECHANISMS)
    out = {"payment_mechanism": len(PAYMENT_MECHANISMS)}
    # PA2023 statutory rules (reference data shipped in-repo) — powers the precise compliant_path.
    pa = Path(__file__).resolve().parents[3] / "reference-data" / "pa2023_rules.jsonl"
    if pa.exists():
        rules = [json.loads(line) for line in pa.read_text().splitlines() if line.strip()]
        bq._replace("pa2023_rule", rules)
        out["pa2023_rule"] = len(rules)
    return out
