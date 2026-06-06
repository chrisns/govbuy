"""BigQuery loader: gate-on-commit to the raw event log, then build-and-swap projection
into the typed public tables; CH matching; the §15 spend-coverage metric; run ledger.
"""
from __future__ import annotations
import hashlib
import json
import re
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

    # Project the instrument family up front so we can dedup instruments by RM stem.
    operators = project("operator")
    instruments = project("instrument")
    lots = project("lot")
    mechanics = project("award_mechanic")
    docs = project("buying_doc")
    obs = project("appointment_observation")

    # --- dedup instruments by RM stem: ONE canonical instrument per framework (keep the richest by
    #     child-fact count, then field completeness); remap child facts onto the canonical id so a
    #     thin duplicate (e.g. a census stub) never shadows the detailed record. ---
    def _rmkey(rm):
        # dedup on the FULL reference (merges true duplicate records, e.g. two RM6200 rows) but keeps
        # distinct iterations apart (RM1557.14 vs RM1557.15 are different instruments).
        return (str(rm).strip().upper() or None) if rm else None
    child_counts: dict[str, int] = {}
    for lst in (lots, mechanics, docs, obs):
        for row in lst:
            iid = row.get("instrument_id")
            if iid:
                child_counts[iid] = child_counts.get(iid, 0) + 1
    by_rm: dict[str, list[dict]] = {}
    for row in instruments:
        s = _rmkey(row.get("rm_reference"))
        if s:
            by_rm.setdefault(s, []).append(row)
    alias: dict[str, str] = {}
    for s, rws in by_rm.items():
        if len(rws) > 1:
            canon = max(rws, key=lambda r: (child_counts.get(r["instrument_id"], 0),
                                            sum(1 for v in r.values() if v not in (None, ""))))["instrument_id"]
            for r in rws:
                if r["instrument_id"] != canon:
                    alias[r["instrument_id"]] = canon
    if alias:
        instruments = [r for r in instruments if r["instrument_id"] not in alias]
        for lst in (lots, mechanics, docs, obs):
            for row in lst:
                if row.get("instrument_id") in alias:
                    row["instrument_id"] = alias[row["instrument_id"]]

    counts = {}
    _replace("operator", operators); counts["operator"] = len(operators)
    _replace("instrument", instruments); counts["instrument"] = len(instruments)
    _replace("lot", lots); counts["lot"] = len(lots)
    _replace("award_mechanic", mechanics); counts["award_mechanic"] = len(mechanics)
    _replace("buying_doc", docs); counts["buying_doc"] = len(docs)
    inbound = project("inbound_scope"); _replace("inbound_scope", inbound); counts["inbound_scope"] = len(inbound)
    # reseller_channel: dedicated facts + derived from supplier facts that carry a channel_type/role
    rc = project("reseller_channel")
    rc_keys = {(r.get("supplier_id"), r.get("channel_type")) for r in rc}
    for p in by_type.get("supplier", []):
        ct = p.get("channel_type") or p.get("role")
        sid = p.get("supplier_id")
        if ct and sid and (sid, ct) not in rc_keys:
            rc.append({"supplier_id": sid, "channel_type": ct, "confidence": p.get("confidence", 0.6), "evidence_id": p["_evidence_id"]})
            rc_keys.add((sid, ct))
    _replace("reseller_channel", rc); counts["reseller_channel"] = len(rc)
    suppliers = project("supplier")
    _replace("supplier", suppliers); counts["supplier"] = len(suppliers)
    _replace("appointment_observation", obs); counts["appointment_observation"] = len(obs)
    resolved = resolve([{**o, "evidence_id": o.get("evidence_id")} for o in obs], today=date.today())
    _replace("appointed_supplier", resolved); counts["appointed_supplier"] = len(resolved)
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
    """§15 spend coverage. Denominator = spend ATTRIBUTABLE to a named framework (carries an RM
    reference) — you cannot index what the source does not identify. Flagged-but-no-RM call-offs are
    reported separately as 'unattributable' (the source says 'a framework' but names none), never
    charged against coverage. Numerator = attributable spend whose framework govbuy has indexed."""
    sql = f"""
    WITH inst AS (SELECT DISTINCT REGEXP_EXTRACT(UPPER(rm_reference), r'RM[0-9]{{3,5}}') AS stem
                  FROM `{config.pub('instrument')}` WHERE rm_reference IS NOT NULL),
    aw AS (
      SELECT award_amount, rm_reference, is_framework_call_off,
             REGEXP_EXTRACT(UPPER(rm_reference), r'RM[0-9]{{3,5}}') AS stem
      FROM `{config.pub('sibling_call_off_awards')}`
      WHERE award_currency = 'GBP' AND award_amount IS NOT NULL)
    SELECT
      ROUND(SUM(IF(rm_reference IS NOT NULL, award_amount, 0))/1e9, 2) AS attributable_gbp_bn,
      ROUND(SUM(IF(stem IN (SELECT stem FROM inst), award_amount, 0))/1e9, 2) AS covered_gbp_bn,
      ROUND(100*SAFE_DIVIDE(SUM(IF(stem IN (SELECT stem FROM inst), award_amount, 0)),
                            SUM(IF(rm_reference IS NOT NULL, award_amount, 0))), 3) AS pct,
      ROUND(SUM(IF(rm_reference IS NULL AND is_framework_call_off, award_amount, 0))/1e9, 2) AS unattributable_flagged_gbp_bn
    FROM aw"""
    r = query(sql)[0]
    attrib = float(r["attributable_gbp_bn"] or 0)
    return {"attributable_gbp_bn": attrib, "denominator_gbp_bn": attrib,  # denominator = attributable
            "covered_gbp_bn": float(r["covered_gbp_bn"] or 0),
            "spend_coverage_pct": float(r["pct"] or 0),
            "unattributable_flagged_gbp_bn": float(r["unattributable_flagged_gbp_bn"] or 0)}


# ----------------------------------------------------------------- sibling snapshot (materialised)
def materialize_sibling() -> dict:
    """Materialise the sibling call-off awards as a SMALL physical table (one paid scan at ingest,
    cheap reads after) instead of a per-query view scan of compiled_json. Same least-privilege
    boundary (built by the ingest SA; API reads the table, never uk_tenders_public). Drops
    parties[].contactPoint; surfaces the §14 framework-reference keys."""
    full = config.pub("sibling_call_off_awards")
    client().query(f"DROP VIEW IF EXISTS `{full}`").result()
    client().query(f"""
      CREATE OR REPLACE TABLE `{full}` AS
      SELECT cp.ocid, cp.source, cp.buyer_name, cp.cpv_division, cp.awarded_amount, cp.awarded_currency,
             cp.published_date, a.supplier_name, a.supplier_id, a.amount AS award_amount, a.currency AS award_currency,
             cp.official_url,
             ( SELECT JSON_VALUE(rp,'$.identifier') FROM UNNEST(JSON_QUERY_ARRAY(cp.compiled_json,'$.relatedProcesses')) rp
               WHERE JSON_VALUE(rp,'$.scheme')='ocid' AND EXISTS (SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(rp,'$.relationship')) r WHERE JSON_VALUE(r)='framework') LIMIT 1) AS framework_ocid,
             REGEXP_EXTRACT(UPPER(CONCAT(IFNULL(cp.title,''),' ',IFNULL(cp.description,''))), r'RM[0-9]{{3,5}}') AS rm_reference,
             (JSON_VALUE(cp.compiled_json,'$.tender.procurementMethodDetails')='Call-off from a framework agreement') AS is_framework_call_off
      FROM `{config.PROJECT}.{config.SIBLING_DATASET}.compiled_process` cp, UNNEST(cp.awards) a
    """).result()
    n = query(f"SELECT COUNT(*) AS n FROM `{full}`")[0]["n"]
    return {"sibling_call_off_awards_rows": n}


# ----------------------------------------------------------------- status + run ledger
def _health(last_run_status: str, last_success_iso: str | None) -> str:
    """green/amber/red (PRD §11/N6): red if last run failed/paused or no success within the
    liveness window; green otherwise (amber reserved for a tracked-degraded signal)."""
    from datetime import datetime, timezone
    if last_run_status in ("failed", "paused_ceiling") or not last_success_iso:
        return "red"
    last = datetime.fromisoformat(last_success_iso)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    age_h = (datetime.now(timezone.utc) - last).total_seconds() / 3600
    return "red" if age_h > config.LIVENESS_MAX_HOURS else "green"


def write_status(run_id: str, mode: str, stats: dict, cov: dict, *, est_gbp: float, status: str = "success",
                 tier_breakdown: list[dict] | None = None, by_operator: list[dict] | None = None) -> None:
    now = _now()
    last_success = now if status == "success" else None
    ops = query(f"SELECT operator_id, COUNT(*) AS n FROM `{config.pub('instrument')}` GROUP BY operator_id")
    src_rows = [{"source_id": (o["operator_id"] or "unknown"), "operator_id": o["operator_id"],
                 "last_run_at": now, "last_success_at": last_success, "last_run_status": status,
                 "facts_total": o["n"], "health": _health(status, last_success),
                 "spend_coverage_note": f"index covers {cov['spend_coverage_pct']}% of the framework-attributable GBP denominator"} for o in ops]
    _replace("source_status", src_rows)
    _append("run_summary", [{"run_id": run_id, "mode": mode, "finished_at": now, "status": status,
                             "docs_seen": stats.get("documents"), "facts_committed": stats.get("verified"),
                             "est_gbp": est_gbp, "spend_coverage_pct": cov["spend_coverage_pct"]}], "pub")
    _append("harness_run", [{"run_id": run_id, "mode": mode, "started_at": now, "finished_at": now,
                             "status": status, "operators": [o["operator_id"] for o in ops if o["operator_id"]],
                             "docs_seen": stats.get("documents"), "facts_committed": stats.get("verified"),
                             "facts_quarantined": stats.get("quarantined"), "tokens_in": 0, "tokens_out": 0,
                             "est_gbp": est_gbp, "model_tier_breakdown": tier_breakdown or [],
                             "by_operator": by_operator or [],
                             "ceiling_gbp": config.CEILING_PAUSE_GBP, "error_summary": None}])
