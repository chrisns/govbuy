"""BigQuery loader: gate-on-commit to the raw event log, then build-and-swap projection
into the typed public tables; CH matching; the §15 spend-coverage metric; run ledger.
"""
from __future__ import annotations
import hashlib
import json
from datetime import datetime, timezone, date
from pathlib import Path

from google.cloud import bigquery

from . import config
from .models import TABLE_COLUMNS, NATURAL_KEY, ALIASES
from .gate import excerpt_in_document
from .reconcile import resolve
from . import companies_house

_client: bigquery.Client | None = None


def client() -> bigquery.Client:
    global _client
    if _client is None:
        _client = bigquery.Client(project=config.PROJECT, location=config.BQ_LOCATION)
    return _client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha(*parts: str) -> str:
    return hashlib.sha256("".join(parts).encode()).hexdigest()


def query(sql: str) -> list[dict]:
    return [dict(r) for r in client().query(sql).result()]


def _append(table: str, rows: list[dict], dataset: str = "raw") -> None:
    if not rows:
        return
    full = config.raw(table) if dataset == "raw" else config.pub(table)
    schema = client().get_table(full).schema
    job = client().load_table_from_json(rows, full, job_config=bigquery.LoadJobConfig(schema=schema, write_disposition="WRITE_APPEND"))
    job.result()


def _replace(table: str, rows: list[dict]) -> int:
    """Build-and-swap: truncate the public table then load (atomic-ish for the demo; prod uses a
    staging table + table rename). Rows missing a REQUIRED column are dropped (data-quality gate)
    and counted — an incomplete extracted fact never becomes a malformed public row."""
    import sys
    full = config.pub(table)
    schema = client().get_table(full).schema
    required = [f.name for f in schema if f.mode == "REQUIRED"]
    clean = [r for r in (rows or []) if all(r.get(c) not in (None, "") for c in required)]
    dropped = len(rows or []) - len(clean)
    if dropped:
        print(f"  [{table}] dropped {dropped}/{len(rows)} incomplete rows (missing required {required})", file=sys.stderr)
    client().query(f"TRUNCATE TABLE `{full}`").result()
    if clean:
        client().load_table_from_json(clean, full, job_config=bigquery.LoadJobConfig(schema=schema, write_disposition="WRITE_APPEND")).result()
    return dropped


# ----------------------------------------------------------------- load a bundle (raw)
def load_bundle(bundle: dict) -> dict:
    run_id = bundle["run_id"]
    docs = {d["document_id"]: d for d in bundle.get("documents", [])}
    config.ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    doc_rows, ev_raw, ev_pub, fact_rows = [], [], [], []
    for d in docs.values():
        text = d.get("text", "")
        path = config.ARCHIVE_DIR / f"{d['document_id']}.txt"
        path.write_text(text, encoding="utf-8")
        doc_rows.append({
            "document_id": d["document_id"], "source_id": d.get("source_id", "seed"),
            "operator_id": d.get("operator_id"), "url": d.get("url", ""),
            "gcs_uri": str(path), "content_type": d.get("content_type", "text/html"),
            "http_status": d.get("http_status", 200), "robots_ok": d.get("robots_ok", True),
            "licence": d.get("licence", "unknown"), "fetched_at": d.get("fetched_at", _now()),
            "load_run_id": run_id,
        })
    verified = quarantined = 0
    for f in bundle.get("facts", []):
        ev = f["evidence"]
        dtext = docs.get(f.get("document_id", ""), {}).get("text", "")
        gate = excerpt_in_document(ev.get("excerpt", ""), dtext)
        vs = "verified" if gate else "quarantined"
        verified += int(gate); quarantined += int(not gate)
        eid = "ev_" + _sha(ev.get("source_url", ""), ev.get("excerpt", ""), ev.get("locator", ""))[:20]
        payload = f.get("payload", {})
        chash = _sha(f["fact_type"], f.get("subject_ref", ""), json.dumps(payload, sort_keys=True))[:40]
        ev_raw.append({"evidence_id": eid, "document_id": f.get("document_id"), "source_url": ev.get("source_url", ""),
                       "source_kind": ev.get("source_kind", "operator_site"), "excerpt": ev.get("excerpt"),
                       "locator": ev.get("locator"), "licence": ev.get("licence", "unknown"),
                       "retrieved_on": ev.get("retrieved_on", _now()), "confidence": ev.get("confidence")})
        if gate:
            ev_pub.append({"evidence_id": eid, "source_url": ev.get("source_url", ""), "source_kind": ev.get("source_kind", "operator_site"),
                           "excerpt": ev.get("excerpt"), "licence": ev.get("licence", "unknown"),
                           "confidence": ev.get("confidence"), "retrieved_on": ev.get("retrieved_on", _now())})
        fact_rows.append({"content_hash": chash, "fact_id": chash, "run_id": run_id, "document_id": f.get("document_id"),
                          "fact_type": f["fact_type"], "subject_ref": f.get("subject_ref"), "payload": json.dumps(payload),
                          "evidence_id": eid, "confidence": float(f.get("confidence", ev.get("confidence", 0.7))),
                          "verify_status": vs, "verbatim_ok": gate,
                          "quarantine_reason": None if gate else "excerpt not a verbatim substring of source",
                          "loaded_at": _now(), "load_date": date.today().isoformat()})
    _append("document", doc_rows, "raw")
    _append("claim_evidence", ev_raw, "raw")
    _append("claim_evidence", ev_pub, "pub")
    _append("extracted_fact", fact_rows, "raw")
    return {"documents": len(doc_rows), "facts": len(fact_rows), "verified": verified, "quarantined": quarantined}


# ----------------------------------------------------------------- rebuild public (projection)
def rebuild_public() -> dict:
    rows = query(f"SELECT fact_type, payload, evidence_id, confidence FROM `{config.raw('extracted_fact')}` WHERE verify_status='verified'")
    by_type: dict[str, list[dict]] = {}
    for r in rows:
        payload = json.loads(r["payload"]) if r["payload"] else {}
        payload["_evidence_id"] = r["evidence_id"]
        by_type.setdefault(r["fact_type"], []).append(payload)

    def project(fact_type: str) -> list[dict]:
        cols = TABLE_COLUMNS[fact_type]
        aliases = ALIASES.get(fact_type, {})
        merged: dict[tuple, dict] = {}
        for p in by_type.get(fact_type, []):
            pp = dict(p)
            for a, c in aliases.items():  # map drifted field names onto schema columns
                if pp.get(a) is not None and pp.get(c) is None:
                    pp[c] = pp[a]
            if fact_type == "buying_doc" and not pp.get("doc_id"):
                pp["doc_id"] = "doc_" + _sha(str(pp.get("instrument_id")), str(pp.get("doc_type")), str(pp.get("title")))[:16]
            key = tuple(str(pp.get(k)) for k in NATURAL_KEY[fact_type])
            row = merged.setdefault(key, {})
            for c in cols:  # MERGE: first non-null across facts sharing the key (don't lose fields)
                if row.get(c) in (None, "") and pp.get(c) not in (None, ""):
                    row[c] = pp.get(c)
            if fact_type != "supplier" and not row.get("evidence_id"):
                row["evidence_id"] = pp["_evidence_id"]
        return list(merged.values())

    counts = {}
    for ft in ["operator", "instrument", "lot", "award_mechanic", "buying_doc", "inbound_scope"]:
        r = project(ft)
        _replace(ft, r)
        counts[ft] = len(r)
    # reseller_channel: dedicated facts + derived from supplier facts that carry a channel_type/role
    rc = project("reseller_channel")
    rc_keys = {(r.get("supplier_id"), r.get("channel_type")) for r in rc}
    for p in by_type.get("supplier", []):
        ct = p.get("channel_type") or p.get("role")
        sid = p.get("supplier_id")
        if ct and sid and (sid, ct) not in rc_keys:
            rc.append({"supplier_id": sid, "channel_type": ct, "confidence": p.get("confidence", 0.6), "evidence_id": p["_evidence_id"]})
            rc_keys.add((sid, ct))
    _replace("reseller_channel", rc)
    counts["reseller_channel"] = len(rc)
    # supplier base (CH fields filled by ch_match)
    suppliers = project("supplier")
    _replace("supplier", suppliers)
    counts["supplier"] = len(suppliers)
    # observations -> resolved appointed_supplier
    obs = project("appointment_observation")
    _replace("appointment_observation", obs)
    counts["appointment_observation"] = len(obs)
    resolved = resolve([{**o, "evidence_id": o.get("evidence_id")} for o in obs], today=date.today())
    _replace("appointed_supplier", resolved)
    counts["appointed_supplier"] = len(resolved)
    return counts


# ----------------------------------------------------------------- CH matching
def ch_match_suppliers() -> dict:
    suppliers = query(f"SELECT supplier_id, display_name, publisher_ids FROM `{config.pub('supplier')}`")
    out, matches, bands = [], [], {}
    import httpx
    http = httpx.Client(timeout=20, headers={"User-Agent": config.USER_AGENT})
    try:
        for s in suppliers:
            m = companies_house.match_name(s["display_name"], client=http)
            cn = m["company_number"]
            bands[m["match_band"]] = bands.get(m["match_band"], 0) + 1
            out.append({**s,
                        "company_number": cn, "registered_name": m["registered_name"],
                        "match_confidence": m["match_confidence"], "match_band": m["match_band"],
                        "status_at_match": m["status_at_match"], "matched_on": _now(),
                        "ch_url": f"https://find-and-update.company-information.service.gov.uk/company/{cn}" if cn else None})
            matches.append({"source_name_norm": companies_house.normalise(s["display_name"]),
                            "company_number": cn, "registered_name": m["registered_name"],
                            "match_confidence": m["match_confidence"], "match_band": m["match_band"],
                            "status_at_match": m["status_at_match"], "matched_on": _now(),
                            "method": m["method"], "publisher_ids": s.get("publisher_ids") or [],
                            "unresolved_reason": None if cn else "no candidate"})
    finally:
        http.close()
    _replace("supplier", out)
    _append("supplier_match", matches)
    return {"matched": sum(1 for o in out if o["company_number"]), "total": len(out), "bands": bands}


# ----------------------------------------------------------------- §15 spend coverage
def coverage() -> dict:
    sql = f"""
    WITH inst AS (SELECT DISTINCT REGEXP_EXTRACT(UPPER(rm_reference), r'RM[0-9]{{3,5}}') AS stem
                  FROM `{config.pub('instrument')}` WHERE rm_reference IS NOT NULL),
    awards AS (
      SELECT award_amount, REGEXP_EXTRACT(UPPER(rm_reference), r'RM[0-9]{{3,5}}') AS stem, is_framework_call_off
      FROM `{config.pub('sibling_call_off_awards')}`
      WHERE award_currency = 'GBP' AND award_amount IS NOT NULL
        AND (rm_reference IS NOT NULL OR is_framework_call_off))
    SELECT
      ROUND(SUM(award_amount)/1e9, 2) AS denominator_gbp_bn,
      ROUND(SUM(IF(stem IN (SELECT stem FROM inst), award_amount, 0))/1e9, 2) AS covered_gbp_bn,
      ROUND(100*SAFE_DIVIDE(SUM(IF(stem IN (SELECT stem FROM inst), award_amount, 0)), SUM(award_amount)), 3) AS pct
    FROM awards"""
    r = query(sql)[0]
    return {"denominator_gbp_bn": float(r["denominator_gbp_bn"] or 0), "covered_gbp_bn": float(r["covered_gbp_bn"] or 0),
            "spend_coverage_pct": float(r["pct"] or 0)}


# ----------------------------------------------------------------- status + run ledger
def write_status(run_id: str, mode: str, stats: dict, cov: dict, *, est_gbp: float, status: str = "success",
                 tier_breakdown: list[dict] | None = None) -> None:
    # source_status: one row per operator currently in the index
    ops = query(f"SELECT operator_id, COUNT(*) AS n FROM `{config.pub('instrument')}` GROUP BY operator_id")
    src_rows = [{"source_id": (o["operator_id"] or "unknown"), "operator_id": o["operator_id"],
                 "last_run_at": _now(), "last_success_at": _now(), "last_run_status": status,
                 "facts_total": o["n"], "health": "green",
                 "spend_coverage_note": f"index covers {cov['spend_coverage_pct']}% of the framework-attributable GBP denominator"} for o in ops]
    _replace("source_status", src_rows)
    _append("run_summary", [{"run_id": run_id, "mode": mode, "finished_at": _now(), "status": status,
                             "docs_seen": stats.get("documents"), "facts_committed": stats.get("verified"),
                             "est_gbp": est_gbp, "spend_coverage_pct": cov["spend_coverage_pct"]}], "pub")
    _append("harness_run", [{"run_id": run_id, "mode": mode, "started_at": _now(), "finished_at": _now(),
                             "status": status, "operators": [o["operator_id"] for o in ops if o["operator_id"]],
                             "docs_seen": stats.get("documents"), "facts_committed": stats.get("verified"),
                             "facts_quarantined": stats.get("quarantined"), "tokens_in": 0, "tokens_out": 0,
                             "est_gbp": est_gbp, "model_tier_breakdown": tier_breakdown or [],
                             "ceiling_gbp": config.CEILING_PAUSE_GBP, "error_summary": None}])
