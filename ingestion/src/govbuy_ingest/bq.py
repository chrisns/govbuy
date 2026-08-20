"""BigQuery loader: gate-on-commit to the raw event log, then build-and-swap projection
into the typed public tables; CH matching; the §15 spend-coverage metric; run ledger.
"""
from __future__ import annotations
import hashlib
import json
import re
from datetime import datetime, timezone, date
from pathlib import Path

from google.api_core import exceptions as google_exceptions
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


_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _coerce_date(v):
    """Normalise a date value to ISO (YYYY-MM-DD) for BigQuery DATE columns, or None if unparseable.
    Agentic extraction yields mixed formats (UK DD/MM/YYYY, slashes); a single bad cell must not fail
    the whole reproject, so anything we can't confidently parse becomes NULL (a nullable date)."""
    if v in (None, ""):
        return None
    s = str(v).strip()
    if _ISO_DATE.match(s):
        return s
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", s)  # DD/MM/YYYY or DD-MM-YYYY
    if m:
        d, mo, y = m.groups()
        if 1 <= int(mo) <= 12 and 1 <= int(d) <= 31:
            return f"{y}-{int(mo):02d}-{int(d):02d}"
        return None
    m = re.match(r"^(\d{4})[/](\d{1,2})[/](\d{1,2})$", s)  # YYYY/MM/DD
    if m:
        y, mo, d = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    return s[:10] if _ISO_DATE.match(s[:10]) else None  # ISO with time suffix -> date part


def query(sql: str) -> list[dict]:
    return [dict(r) for r in client().query(sql).result()]


def _append(table: str, rows: list[dict], dataset: str = "raw") -> None:
    if not rows:
        return
    full = config.raw(table) if dataset == "raw" else config.pub(table)
    schema = client().get_table(full).schema
    job = client().load_table_from_json(rows, full, job_config=bigquery.LoadJobConfig(schema=schema, write_disposition="WRITE_APPEND"))
    job.result()


def _latest_ch_matches() -> dict[str, dict]:
    """Latest Companies House match per normalised source name. The append-only supplier_match log
    is the source of truth for CH resolution, so a rebuild merges these back instead of wiping
    accrued CRNs (and re-hitting the CH API on every nightly rebuild)."""
    try:
        rows = query(f"""
            SELECT source_name_norm, company_number, registered_name, match_confidence,
                   match_band, status_at_match, matched_on
            FROM `{config.raw('supplier_match')}`
            QUALIFY ROW_NUMBER() OVER (PARTITION BY source_name_norm ORDER BY matched_on DESC) = 1
        """)
    except Exception:  # table may not exist on a cold rebuild
        return {}
    return {r["source_name_norm"]: r for r in rows}


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

    # GCA is deterministic now: a GCA instrument must carry a CANONICAL RM reference. Drop scrape
    # artifacts (e.g. a lot mis-recorded as an instrument: 'RM1557.14L4' = G-Cloud 14 Lot 4).
    _CANON_RM = re.compile(r"^RM[0-9]{3,5}(\.[0-9]+)?$")
    instruments = [r for r in instruments
                   if not (r.get("operator_id") == "gca" and r.get("rm_reference")
                           and not _CANON_RM.match(str(r["rm_reference"]).upper()))]

    # --- dedup instruments to ONE canonical per framework (keep the richest by child-fact count, then
    #     field completeness); remap child facts onto the canonical id so a thin duplicate (e.g. a
    #     census stub, or an earlier partial agentic load) never shadows the detailed record. The key
    #     is OPERATOR-SCOPED: a non-CCS framework that cites a GCA RM (e.g. YPO listing RM6361) must NOT
    #     merge into the actual GCA instrument, and two operators sharing a local code ("1081") are
    #     distinct. Within an operator we merge on the reference if present, else on the normalised name
    #     (so the same framework re-loaded with a different instrument_id still collapses). ---
    def _rmkey(rm):
        return (str(rm).strip().upper() or None) if rm else None
    def _name_norm(s):
        return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()
    def _dkey(row):
        op = row.get("operator_id") or ""
        rm = _rmkey(row.get("rm_reference"))
        return (op, "rm:" + rm) if rm else (op, "name:" + _name_norm(row.get("name")))
    child_counts: dict[str, int] = {}
    for lst in (lots, mechanics, docs, obs):
        for row in lst:
            iid = row.get("instrument_id")
            if iid:
                child_counts[iid] = child_counts.get(iid, 0) + 1
    by_rm: dict[tuple, list[dict]] = {}
    for row in instruments:
        by_rm.setdefault(_dkey(row), []).append(row)
    alias: dict[str, str] = {}
    for s, rws in by_rm.items():
        if len(rws) > 1:
            # A row missing instrument_id entirely (extractor didn't supply one) can't be canon
            # and can't be aliased-from — .get() everywhere here, never []: a standalone
            # instrument fact with no id must not crash the whole rebuild.
            canon = max(rws, key=lambda r: (child_counts.get(r.get("instrument_id"), 0),
                                            sum(1 for v in r.values() if v not in (None, "")))).get("instrument_id")
            if canon:
                for r in rws:
                    rid = r.get("instrument_id")
                    if rid and rid != canon:
                        alias[rid] = canon
    if alias:
        instruments = [r for r in instruments if r.get("instrument_id") not in alias]
        for lst in (lots, mechanics, docs, obs):
            for row in lst:
                if row.get("instrument_id") in alias:
                    row["instrument_id"] = alias[row["instrument_id"]]

    # Drop child facts orphaned by the GCA-artifact filter / dedup (no lot/mechanic without an instrument).
    valid_ids = {r["instrument_id"] for r in instruments if r.get("instrument_id")}
    lots = [r for r in lots if r.get("instrument_id") in valid_ids]
    mechanics = [r for r in mechanics if r.get("instrument_id") in valid_ids]
    docs = [r for r in docs if r.get("instrument_id") in valid_ids]
    obs = [r for r in obs if r.get("instrument_id") in valid_ids]

    # Re-dedup child facts by natural key after the remap (the instrument dedup can collapse two
    # instrument_ids onto one canonical, producing duplicate child rows — e.g. award mechanics).
    def _dedup(rows: list[dict], keys: tuple) -> list[dict]:
        seen: dict[tuple, dict] = {}
        for r in rows:
            seen[tuple(str(r.get(k)) for k in keys)] = r
        return list(seen.values())
    lots = _dedup(lots, NATURAL_KEY["lot"])
    mechanics = _dedup(mechanics, NATURAL_KEY["award_mechanic"])
    docs = _dedup(docs, NATURAL_KEY["buying_doc"])
    obs = _dedup(obs, NATURAL_KEY["appointment_observation"])

    # Normalise DATE columns (agentic extraction yields mixed/UK formats) so one bad cell can't fail
    # the whole reproject.
    for r in instruments:
        for c in ("starts_on", "expires_on"):
            if c in r:
                r[c] = _coerce_date(r.get(c))

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
    # Merge back accrued CH matches so a rebuild never wipes resolved CRNs (the match is the
    # expensive, slowly-accruing part; the supplier_match log is its durable home).
    ch = _latest_ch_matches()
    for s in suppliers:
        m = ch.get(companies_house.normalise(s.get("display_name") or ""))
        if not (m and m.get("company_number")):
            continue
        cn = m["company_number"]
        mo = m.get("matched_on")
        s["company_number"] = cn
        s["registered_name"] = m.get("registered_name")
        s["match_confidence"] = m.get("match_confidence")
        s["match_band"] = m.get("match_band")
        s["status_at_match"] = m.get("status_at_match")
        s["matched_on"] = mo.isoformat() if hasattr(mo, "isoformat") else mo
        s["ch_url"] = f"https://find-and-update.company-information.service.gov.uk/company/{cn}"
    _replace("supplier", suppliers); counts["supplier"] = len(suppliers)
    counts["supplier_ch_matched"] = sum(1 for s in suppliers if s.get("company_number"))
    _replace("appointment_observation", obs); counts["appointment_observation"] = len(obs)
    resolved = resolve([{**o, "evidence_id": o.get("evidence_id")} for o in obs], today=date.today())
    _replace("appointed_supplier", resolved); counts["appointed_supplier"] = len(resolved)

    # Per-listing services (G-Cloud catalogue). Resolve each service's supplier_name to a supplier_id
    # by exact normalised name (both sides come from the Digital Marketplace, so the match is clean),
    # giving the API a join to the supplier's CH link. Unmatched names keep supplier_name only.
    services = project("service")
    if services:
        sup_by_name = {(s.get("display_name") or "").strip().lower(): s["supplier_id"]
                       for s in suppliers if (s.get("display_name") or "").strip()}
        for sv in services:
            if not sv.get("catalogue"):  # G-Cloud loads predate the catalogue tag
                sv["catalogue"] = "g-cloud" if sv.get("instrument_id") == "g-cloud-14" else None
            if not sv.get("supplier_id"):
                sv["supplier_id"] = sup_by_name.get((sv.get("supplier_name") or "").strip().lower())
        _replace("service", services)
    counts["service"] = len(services)
    return counts


# ----------------------------------------------------------------- CH matching
def ch_match_suppliers(limit: int | None = None, *, incremental: bool = True) -> dict:
    """Resolve every supplier name to a CRN, accruing into the append-only supplier_match log.

    `incremental` (default) carries forward suppliers already resolved (a non-null CRN in the log)
    with NO API call, so the ~74% fuzzy-match cost is paid once and nightly runs only hit CH for
    new/unresolved names. `limit` then caps how many of the *remaining* unresolved names to attempt
    this run; the rest load as 'pending' and resolve on a later run. Set incremental=False to force a
    full re-match (e.g. to refresh point-in-time status snapshots)."""
    suppliers = query(f"SELECT supplier_id, display_name, publisher_ids FROM `{config.pub('supplier')}` ORDER BY display_name")
    prior = _latest_ch_matches() if incremental else {}
    out, matches, bands = [], [], {}
    attempted = carried = 0
    import httpx
    http = httpx.Client(timeout=20, headers={"User-Agent": config.USER_AGENT})
    try:
        for s in suppliers:
            norm = companies_house.normalise(s["display_name"])
            pm = prior.get(norm)
            if pm and pm.get("company_number"):  # already resolved -> carry forward, no API call
                cn = pm["company_number"]
                mo = pm.get("matched_on")
                bands[pm.get("match_band")] = bands.get(pm.get("match_band"), 0) + 1
                carried += 1
                out.append({**s, "company_number": cn, "registered_name": pm.get("registered_name"),
                            "match_confidence": pm.get("match_confidence"), "match_band": pm.get("match_band"),
                            "status_at_match": pm.get("status_at_match"),
                            "matched_on": mo.isoformat() if hasattr(mo, "isoformat") else mo,
                            "ch_url": f"https://find-and-update.company-information.service.gov.uk/company/{cn}"})
                continue
            if limit is not None and attempted >= limit:  # budget for unresolved names exhausted this run
                out.append({**s, "company_number": None, "registered_name": None, "match_confidence": None,
                            "match_band": "pending", "status_at_match": None, "matched_on": None, "ch_url": None})
                continue
            attempted += 1
            try:
                m = companies_house.match_name(s["display_name"], client=http)
            except Exception as e:  # never let one stubborn name abort an 18k-supplier run
                m = {"company_number": None, "registered_name": None, "match_confidence": 0.0,
                     "match_band": "unresolved", "status_at_match": None, "method": "error"}
                print(f"  [ch] error matching {s['display_name']!r}: {type(e).__name__}", file=__import__("sys").stderr)
            cn = m["company_number"]
            bands[m["match_band"]] = bands.get(m["match_band"], 0) + 1
            out.append({**s,
                        "company_number": cn, "registered_name": m["registered_name"],
                        "match_confidence": m["match_confidence"], "match_band": m["match_band"],
                        "status_at_match": m["status_at_match"], "matched_on": _now(),
                        "ch_url": f"https://find-and-update.company-information.service.gov.uk/company/{cn}" if cn else None})
            matches.append({"source_name_norm": norm,
                            "company_number": cn, "registered_name": m["registered_name"],
                            "match_confidence": m["match_confidence"], "match_band": m["match_band"],
                            "status_at_match": m["status_at_match"], "matched_on": _now(),
                            "method": m["method"], "publisher_ids": s.get("publisher_ids") or [],
                            "unresolved_reason": None if cn else "no candidate"})
            if len(matches) >= 150:  # checkpoint: durable progress so a crash/429 resumes via carry-forward
                _append("supplier_match", matches); matches = []
    finally:
        http.close()
        if matches:  # flush remaining checkpoint buffer even on exception
            _append("supplier_match", matches); matches = []
    _replace("supplier", out)
    return {"matched": sum(1 for o in out if o["company_number"]), "total": len(out),
            "attempted": attempted, "carried_forward": carried, "bands": bands}


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
    try:
        # One-time migration step from when this was a VIEW. CREATE OR REPLACE TABLE below
        # handles the table-replacement case on its own, so ignore "already a TABLE".
        client().query(f"DROP VIEW IF EXISTS `{full}`").result()
    except google_exceptions.BadRequest as e:
        if "was expected" not in str(e):
            raise
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


# ----------------------------------------------------------------- supplier call-off track record
def materialize_track_record() -> dict:
    """Small materialised table: a supplier's REAL call-off spend per framework, from the sibling
    award data. find_services joins it (on a normalised supplier name + RM stem) to show proof of
    delivery next to each catalogue listing — 'who actually wins money on this route', not just who
    is listed. One paid scan here; cheap join at query time."""
    full = config.pub("supplier_track_record")
    # CREATE OR REPLACE can't change an existing table's CLUSTER BY spec, so drop first — cheap,
    # since the table is rebuilt from scratch on every run anyway.
    client().query(f"DROP TABLE IF EXISTS `{full}`").result()
    client().query(f"""
      CREATE TEMP FUNCTION NORM(s STRING) AS (
        TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(
          LOWER(TRIM(s)),
          r'\\b(ltd\\.?|limited|plc\\.?|llp\\.?|inc\\.?|corp\\.?|llc\\.?|gmbh|bv|b\\.v\\.|s\\.a\\.|s\\.l\\.)$', ''),
          r'[^a-z0-9\\s]', ' '), r'\\s+', ' ')));
      CREATE OR REPLACE TABLE `{full}` CLUSTER BY norm_name AS
      SELECT NORM(supplier_name) AS norm_name,
             REGEXP_EXTRACT(UPPER(rm_reference), r'RM[0-9]+') AS rm_stem,
             SUM(award_amount) AS total_award_gbp, COUNT(*) AS call_off_count
      FROM `{config.pub('sibling_call_off_awards')}`
      WHERE award_currency='GBP' AND award_amount IS NOT NULL AND rm_reference IS NOT NULL AND supplier_name IS NOT NULL
      GROUP BY 1,2 HAVING norm_name != '' AND rm_stem IS NOT NULL
    """).result()
    n = query(f"SELECT COUNT(*) AS n FROM `{full}`")[0]["n"]
    return {"supplier_track_record_rows": n}


# ----------------------------------------------------------------- fusion with UK Tenders (route×reality)
def materialize_fusion() -> dict:
    """Weld govbuy to the UK Tenders corpus on CRN + RM-ref + CPV. Builds curated tables IN
    govbuy_public (so the read-only API SA stays inside its boundary — no raw tender PII):
      tender_award          — 1 row per (award, supplier) with supplier CRN, buyer, channel, CPV, £, dates.
      supplier_track_record_crn / supplier_calloff_total — real call-off spend by CRN (call-off channels
                              only, ceiling outliers >£100m dropped) — proof of delivery for find_services.
      live_opportunity      — open tenders (active, future deadline) for supplier_pipeline.
    """
    sib = config.SIBLING_DATASET
    pub = config.PUBLIC_DATASET
    c = client()
    # CREATE OR REPLACE can't change an existing table's CLUSTER BY spec, so drop the clustered
    # tables first — cheap, since each is rebuilt from scratch on every run anyway.
    for _t in ("tender_award", "supplier_calloff_total", "live_opportunity", "pipeline_notice"):
        c.query(f"DROP TABLE IF EXISTS `{config.pub(_t)}`").result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('tender_award')}` CLUSTER BY cpv_division, supplier_crn AS
      SELECT ocid, source, buyer_name,
             JSON_VALUE(sup,'$.name') AS supplier_name,
             REGEXP_EXTRACT(JSON_VALUE(sup,'$.id'), r'^GB-COH-(.+)') AS supplier_crn,
             cpv_division,
             IF(JSON_VALUE(a,'$.value.currency')='GBP', SAFE_CAST(JSON_VALUE(a,'$.value.amount') AS FLOAT64), NULL) AS award_amount,
             SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(JSON_VALUE(a,'$.date'),1,10)) AS award_date,
             SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(JSON_VALUE(a,'$.contractPeriod.endDate'),1,10)) AS contract_end_date,
             JSON_VALUE(compiled_json,'$.tender.procurementMethod') AS procurement_method,
             JSON_VALUE(compiled_json,'$.tender.procurementMethodDetails') AS procurement_method_details,
             CASE
               WHEN LOWER(JSON_VALUE(compiled_json,'$.tender.procurementMethodDetails')) LIKE '%framework%' THEN 'framework_call_off'
               WHEN LOWER(JSON_VALUE(compiled_json,'$.tender.procurementMethodDetails')) LIKE '%dynamic%' THEN 'dps_call_off'
               WHEN JSON_VALUE(compiled_json,'$.tender.procurementMethod')='open' THEN 'open'
               WHEN JSON_VALUE(compiled_json,'$.tender.procurementMethod') IN ('direct','limited') THEN 'direct'
               ELSE 'other' END AS channel,
             REGEXP_EXTRACT(UPPER(CONCAT(IFNULL(JSON_VALUE(compiled_json,'$.tender.title'),''),' ',
               IFNULL(JSON_VALUE(compiled_json,'$.tender.description'),''),' ',
               IFNULL(JSON_VALUE(compiled_json,'$.tender.procurementMethodDetails'),''))), r'(RM[0-9]{{3,5}}(?:\\.[0-9]+)?)') AS rm_reference,
             official_url, published_date
      FROM `{config.PROJECT}.{sib}.compiled_process`,
           UNNEST(JSON_QUERY_ARRAY(compiled_json,'$.awards')) a, UNNEST(JSON_QUERY_ARRAY(a,'$.suppliers')) sup
      WHERE ARRAY_LENGTH(JSON_QUERY_ARRAY(compiled_json,'$.awards')) > 0
    """).result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('supplier_track_record_crn')}` AS
      SELECT supplier_crn, cpv_division, ROUND(SUM(award_amount),2) AS total_award_gbp,
             COUNT(*) AS call_off_count, COUNT(DISTINCT buyer_name) AS distinct_buyers, MAX(award_date) AS last_award_date
      FROM `{config.pub('tender_award')}`
      WHERE supplier_crn IS NOT NULL AND award_amount > 0 AND channel IN ('framework_call_off','dps_call_off') AND award_amount < 100000000
      GROUP BY supplier_crn, cpv_division
    """).result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('supplier_calloff_total')}` CLUSTER BY supplier_crn AS
      SELECT supplier_crn, ROUND(SUM(total_award_gbp),0) AS calloff_gbp, SUM(call_off_count) AS calloff_count,
             SUM(distinct_buyers) AS buyer_rows, MAX(last_award_date) AS last_award_date
      FROM `{config.pub('supplier_track_record_crn')}` GROUP BY supplier_crn
    """).result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('live_opportunity')}` CLUSTER BY cpv_division AS
      SELECT ocid, source, buyer_name, JSON_VALUE(compiled_json,'$.tender.title') AS title, cpv_division,
             COALESCE(SAFE_CAST(JSON_VALUE(compiled_json,'$.tender.value.amount') AS FLOAT64), awarded_amount) AS estimated_value,
             SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', JSON_VALUE(compiled_json,'$.tender.tenderPeriod.endDate')) AS deadline,
             official_url,
             LOWER(CONCAT(IFNULL(JSON_VALUE(compiled_json,'$.tender.title'),''),' ',IFNULL(JSON_VALUE(compiled_json,'$.tender.description'),''))) AS hay
      FROM `{config.PROJECT}.{sib}.compiled_process`
      WHERE JSON_VALUE(compiled_json,'$.tender.status')='active'
        AND SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', JSON_VALUE(compiled_json,'$.tender.tenderPeriod.endDate')) > CURRENT_TIMESTAMP()
    """).result()
    # PA2023 s.93 forward pipeline. Universe = planned/planning tenders OR an OCDS $.planning block (the
    # pipeline/planning-notice carrier). expected_date prefers the futureNoticeDate ("when the buyer plans to
    # publish the actual tender" — the actionable forward signal for a seller), then contract start, planning
    # milestone, tender start, published. expected_notice_date surfaces that future-notice date explicitly.
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('pipeline_notice')}` CLUSTER BY cpv_division, expected_date AS
      SELECT ocid, buyer_name, title, cpv_division, value_amount AS estimated_value,
             SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', JSON_VALUE(compiled_json,'$.tender.communication.futureNoticeDate')) AS expected_notice_date,
             COALESCE(
               SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', JSON_VALUE(compiled_json,'$.tender.communication.futureNoticeDate')),
               SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', JSON_VALUE(compiled_json,'$.tender.contractPeriod.startDate')),
               (SELECT MAX(SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', JSON_VALUE(m,'$.dueDate'))) FROM UNNEST(JSON_QUERY_ARRAY(compiled_json,'$.planning.milestones')) m),
               SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', JSON_VALUE(compiled_json,'$.tender.tenderPeriod.startDate')),
               published_date) AS expected_date,
             CASE WHEN JSON_QUERY(compiled_json,'$.planning') IS NOT NULL THEN 'pipeline_planning_notice' ELSE 'planned_tender' END AS notice_kind,
             source, official_url,
             LOWER(CONCAT(IFNULL(title,''),' ',IFNULL(description,''))) AS hay
      FROM `{config.PROJECT}.{sib}.compiled_process`
      WHERE JSON_VALUE(compiled_json,'$.tender.status') IN ('planned','planning') OR JSON_QUERY(compiled_json,'$.planning') IS NOT NULL
    """).result()
    return {"tender_award_rows": query(f"SELECT COUNT(*) n FROM `{config.pub('tender_award')}`")[0]["n"],
            "live_opportunity_rows": query(f"SELECT COUNT(*) n FROM `{config.pub('live_opportunity')}`")[0]["n"],
            "pipeline_notice_rows": query(f"SELECT COUNT(*) n FROM `{config.pub('pipeline_notice')}`")[0]["n"]}


def materialize_observed() -> dict:
    """Backfill membership + call-off mechanics from the 658k real awards (the 'awesome #2' enhancement).
    Many frameworks publish no supplier list (752) or no award mechanic (918); a real award that cites an
    RM reference + a supplier CRN is verbatim evidence of BOTH. These are 'observed from award notices'
    (inferred, not official membership) — surfaced as such by the API. Also builds the canonical-CRN map
    that collapses split supplier identities (the GCA spine vs the Digital Marketplace directory)."""
    c = client()
    # CREATE OR REPLACE can't change an existing table's CLUSTER BY spec — drop first.
    c.query(f"DROP TABLE IF EXISTS `{config.pub('observed_membership')}`").result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('observed_membership')}` CLUSTER BY rm_reference AS
      SELECT rm_reference, supplier_crn, ANY_VALUE(supplier_name) AS supplier_name,
             COUNT(*) AS award_count, ROUND(SUM(award_amount),0) AS total_gbp, MAX(award_date) AS last_award_date
      FROM `{config.pub('tender_award')}`
      WHERE rm_reference IS NOT NULL AND supplier_crn IS NOT NULL AND award_amount BETWEEN 0 AND 100000000
      GROUP BY rm_reference, supplier_crn
    """).result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('observed_mechanic')}` AS
      SELECT rm_reference,
             COUNTIF(channel='framework_call_off') AS framework_call_off, COUNTIF(channel='dps_call_off') AS dps_call_off,
             COUNTIF(channel='direct') AS direct_award, COUNTIF(channel='open') AS open_competition, COUNT(*) AS total_awards
      FROM `{config.pub('tender_award')}` WHERE rm_reference IS NOT NULL GROUP BY rm_reference
    """).result()
    # Canonical supplier identity per Companies House number: the GCA spine ingests a firm as `<slug>-ltd`,
    # the Digital Marketplace directory as `dm-<id>`, so one CRN can hold >1 supplier_id. Pick the
    # highest-confidence record as canonical and keep the full member set so the API unions appointments.
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('supplier_crn_canonical')}` AS
      SELECT company_number,
             ARRAY_AGG(supplier_id ORDER BY match_confidence DESC NULLS LAST, supplier_id LIMIT 1)[OFFSET(0)] AS canonical_supplier_id,
             ARRAY_AGG(supplier_id ORDER BY supplier_id) AS member_supplier_ids, COUNT(*) AS member_count
      FROM `{config.pub('supplier')}` WHERE company_number IS NOT NULL GROUP BY company_number
    """).result()
    return {"observed_membership_rows": query(f"SELECT COUNT(*) n FROM `{config.pub('observed_membership')}`")[0]["n"],
            "observed_mechanic_rows": query(f"SELECT COUNT(*) n FROM `{config.pub('observed_mechanic')}`")[0]["n"],
            "supplier_crn_canonical_rows": query(f"SELECT COUNT(*) n FROM `{config.pub('supplier_crn_canonical')}`")[0]["n"]}


def materialize_debarment(rows: list[dict]) -> int:
    """The PA2023 s.62 central debarment list (gov.uk). The register is published as a PDF and is currently
    BLANK (no ministerial debarment decisions yet), so this normally creates an empty, correctly-typed table
    — which still lets the exclusion gate state 'checked the register, not debarred' with a source. Any future
    entries flow through token-free via reference-data/debarment_list.jsonl."""
    c = client()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('debarment_list')}` (
        company_number STRING, ppon STRING, supplier_name STRING, grounds STRING,
        mandatory_or_discretionary STRING, decision_date DATE, review_date DATE, source_url STRING)
    """).result()
    if rows:
        c.insert_rows_json(config.pub('debarment_list'), rows)
    return len(rows)


def materialize_company_profile(ndjson_path: str) -> dict:
    """Load the CH bulk per-supplier profile NDJSON (produced by ch_bulk) into a staging table, then derive
    the public company_profile with an SME signal off the filed-accounts category. Credential-free."""
    c = client()
    stg = config.pub("company_profile_stg")
    with open(ndjson_path, "rb") as f:
        c.load_table_from_file(f, stg, job_config=bigquery.LoadJobConfig(
            source_format="NEWLINE_DELIMITED_JSON", autodetect=True, write_disposition="WRITE_TRUNCATE")).result()
    # Derive: SME signal off the filed-accounts category; a readable sector off the primary SIC code.
    # SIC codes are normalised back to 5-char zero-padded strings (autodetect may have typed them INT).
    # CREATE OR REPLACE can't change an existing table's CLUSTER BY spec — drop first.
    c.query(f"DROP TABLE IF EXISTS `{config.pub('company_profile')}`").result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('company_profile')}` CLUSTER BY company_number AS
      WITH base AS (
        SELECT company_number, company_category, company_status_bulk, country_of_origin, incorporated_on,
               accounts_category, region, post_town, postcode_area, sic_text,
               ARRAY(SELECT LPAD(CAST(x AS STRING),5,'0') FROM UNNEST(sic_codes) x) AS sic_codes,
               SAFE_CAST(SUBSTR(LPAD(CAST(sic_codes[SAFE_OFFSET(0)] AS STRING),5,'0'),1,2) AS INT64) AS sic_division,
               CASE
                 WHEN UPPER(accounts_category) IN ('MICRO ENTITY','SMALL','DORMANT','TOTAL EXEMPTION FULL','TOTAL EXEMPTION SMALL','ACCOUNTS TYPE NOT AVAILABLE') THEN TRUE
                 WHEN UPPER(accounts_category) IN ('MEDIUM','FULL','GROUP','AUDITED ABRIDGED','AUDIT EXEMPTION SUBSIDIARY') THEN FALSE
                 ELSE NULL END AS sme_likely
        FROM `{stg}`)
      SELECT * EXCEPT(sic_division), sic_division,
        CASE
          WHEN sic_division BETWEEN 1 AND 3 THEN 'Agriculture, forestry & fishing'
          WHEN sic_division BETWEEN 5 AND 9 THEN 'Mining & quarrying'
          WHEN sic_division BETWEEN 10 AND 33 THEN 'Manufacturing'
          WHEN sic_division = 35 THEN 'Energy'
          WHEN sic_division BETWEEN 36 AND 39 THEN 'Water, sewerage & waste'
          WHEN sic_division BETWEEN 41 AND 43 THEN 'Construction'
          WHEN sic_division BETWEEN 45 AND 47 THEN 'Wholesale & retail'
          WHEN sic_division BETWEEN 49 AND 53 THEN 'Transport & storage'
          WHEN sic_division BETWEEN 55 AND 56 THEN 'Accommodation & food'
          WHEN sic_division BETWEEN 58 AND 63 THEN 'Information & communication'
          WHEN sic_division BETWEEN 64 AND 66 THEN 'Financial & insurance'
          WHEN sic_division = 68 THEN 'Real estate'
          WHEN sic_division BETWEEN 69 AND 75 THEN 'Professional, scientific & technical'
          WHEN sic_division BETWEEN 77 AND 82 THEN 'Administrative & support services'
          WHEN sic_division = 84 THEN 'Public administration & defence'
          WHEN sic_division = 85 THEN 'Education'
          WHEN sic_division BETWEEN 86 AND 88 THEN 'Health & social work'
          WHEN sic_division BETWEEN 90 AND 93 THEN 'Arts & recreation'
          WHEN sic_division BETWEEN 94 AND 99 THEN 'Other services'
          ELSE NULL END AS sector
      FROM base
    """).result()
    n = query(f"SELECT COUNT(*) AS n FROM `{config.pub('company_profile')}`")[0]["n"]
    return {"company_profile_rows": n}


def materialize_supplier_group(ndjson_path: str) -> dict:
    """Load the corporate-PSC parent edges (from ch_bulk.psc_sync — the free PSC snapshot, no key) and
    materialise supplier_group: each corporate controller → the govbuy suppliers it controls (>25% via the
    PSC natures-of-control) + their combined call-off £. Parent CRNs are zero-padded; UK-registered only."""
    c = client()
    stg = config.pub("supplier_psc_parent_stg")
    with open(ndjson_path, "rb") as f:
        c.load_table_from_file(f, stg, job_config=bigquery.LoadJobConfig(
            source_format="NEWLINE_DELIMITED_JSON", autodetect=True, write_disposition="WRITE_TRUNCATE")).result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('supplier_group')}` AS
      WITH edges AS (
        SELECT member_crn,
          CASE WHEN REGEXP_CONTAINS(parent_crn, r'^[0-9]+$') THEN LPAD(parent_crn,8,'0') ELSE UPPER(parent_crn) END AS parent_crn,
          ANY_VALUE(parent_name) parent_name
        FROM `{stg}`
        WHERE country_registered IS NULL OR UPPER(country_registered) IN ('ENGLAND','WALES','SCOTLAND','NORTHERN IRELAND','UNITED KINGDOM','ENGLAND & WALES','ENGLAND AND WALES','GREAT BRITAIN','UK')
        GROUP BY 1,2),
      grp AS (SELECT parent_crn, ANY_VALUE(parent_name) parent_name, ARRAY_AGG(DISTINCT member_crn) member_crns FROM edges GROUP BY parent_crn)
      SELECT g.parent_crn, g.parent_name, g.member_crns, ARRAY_LENGTH(g.member_crns) member_count,
        (SELECT ROUND(SUM(ct.calloff_gbp)) FROM `{config.pub('supplier_calloff_total')}` ct
           WHERE ct.supplier_crn IN UNNEST(g.member_crns) OR ct.supplier_crn = g.parent_crn) AS group_calloff_gbp
      FROM grp g
    """).result()
    n = query(f"SELECT COUNT(*) AS n FROM `{config.pub('supplier_group')}`")[0]["n"]
    return {"supplier_group_rows": n}


def materialize_modern_slavery(ndjson_path: str) -> dict:
    """Load the per-supplier modern-slavery-statement flag (from open_refs.modern_slavery_sync — the free
    gov.uk Modern Slavery Statement Registry, joined by Companies House number). A published MSA s.54 statement
    is a due-diligence signal (required of orgs with >£36m turnover); absence is NOT proof of non-compliance."""
    c = client()
    full = config.pub("supplier_modern_slavery")
    schema = [bigquery.SchemaField(n, t) for n, t in (
        ("company_number", "STRING"), ("organisation_name", "STRING"), ("sector_type", "STRING"),
        ("statement_year", "INTEGER"), ("statement_url", "STRING"), ("turnover", "STRING"))]
    with open(ndjson_path, "rb") as f:
        c.load_table_from_file(f, full, job_config=bigquery.LoadJobConfig(
            source_format="NEWLINE_DELIMITED_JSON", schema=schema, write_disposition="WRITE_TRUNCATE")).result()
    n = query(f"SELECT COUNT(*) AS n FROM `{full}`")[0]["n"]
    return {"supplier_modern_slavery_rows": n}


def materialize_buyer_classification(gov_orgs_ndjson_path: str) -> dict:
    """Load the gov.uk organisations register (open API) as buyer_org, then classify every distinct buyer in
    tender_award into a public-sector TYPE — deterministically, from the buyer's OWN name (regex) plus an EXACT
    match to the register for central gov. No fuzzy cross-entity matching, so no fabricated identities."""
    c = client()
    bo = config.pub("buyer_org")
    schema = [bigquery.SchemaField(n, "STRING") for n in ("title", "norm", "format", "web_url", "parent")]
    with open(gov_orgs_ndjson_path, "rb") as f:
        c.load_table_from_file(f, bo, job_config=bigquery.LoadJobConfig(
            source_format="NEWLINE_DELIMITED_JSON", schema=schema, write_disposition="WRITE_TRUNCATE")).result()
    c.query(f"""
      CREATE OR REPLACE TABLE `{config.pub('buyer_classification')}` AS
      WITH d AS (SELECT DISTINCT buyer_name FROM `{config.pub('tender_award')}` WHERE buyer_name IS NOT NULL),
      nm AS (SELECT buyer_name, ' ' || ARRAY_TO_STRING(REGEXP_EXTRACT_ALL(LOWER(buyer_name), r'[a-z0-9]+'),' ') || ' ' AS norm FROM d)
      SELECT n.buyer_name,
        CASE
          WHEN bo.title IS NOT NULL AND bo.format NOT IN ('Other','Sub-organisation') THEN 'Central government'
          WHEN REGEXP_CONTAINS(n.norm, r' (borough|county|district|metropolitan|unitary|parish) ') OR REGEXP_CONTAINS(n.norm, r' council ') THEN 'Local government'
          WHEN REGEXP_CONTAINS(n.norm, r' (nhs|ccg|icb) ') OR REGEXP_CONTAINS(n.norm, r'(foundation trust|integrated care board|clinical commissioning|health board)') THEN 'NHS / health'
          WHEN REGEXP_CONTAINS(n.norm, r' (university|college|academy|academies|school|schools) ') OR REGEXP_CONTAINS(n.norm, r'multi academy') THEN 'Education'
          WHEN REGEXP_CONTAINS(n.norm, r' (police|constabulary) ') OR REGEXP_CONTAINS(n.norm, r'crime commissioner') THEN 'Police'
          WHEN REGEXP_CONTAINS(n.norm, r'fire (and )?rescue') OR REGEXP_CONTAINS(n.norm, r'fire (authority|service)') THEN 'Fire & rescue'
          WHEN REGEXP_CONTAINS(n.norm, r'(ministry|department for|department of|secretary of state|cabinet office|crown commercial)') OR REGEXP_CONTAINS(n.norm, r' (hmrc|dvla|dwp|mod|dfe|dft|defra) ') THEN 'Central government'
          WHEN REGEXP_CONTAINS(n.norm, r'(housing association|combined authority)') OR REGEXP_CONTAINS(n.norm, r' homes ') THEN 'Housing / combined authority'
          ELSE 'Other / unclassified' END AS buyer_type,
        bo.format AS gov_uk_format, bo.web_url AS gov_uk_url
      FROM nm n LEFT JOIN `{bo}` bo ON bo.norm = TRIM(n.norm)
    """).result()
    n = query(f"SELECT COUNT(*) AS n FROM `{config.pub('buyer_classification')}`")[0]["n"]
    return {"buyer_org_rows": query(f"SELECT COUNT(*) AS n FROM `{bo}`")[0]["n"], "buyer_classification_rows": n}


def materialize_official_appointments(rows: list[dict]) -> dict:
    """Backfill appointed-supplier lists for frameworks govbuy held as routes-without-members, from PUBLIC
    official sources the coverage audit found (DOS7's GCA ODS, GCA /suppliers pages, the Cabinet Office DPS
    supplier register, YPO, etc.). Each row: {rm_reference, supplier_name, company_number?, lot?, source_url}.
    Source-anchored (a claim_evidence row per rm). MUST run AFTER materialize_core/_observed so it adds to the
    rebuilt tables; re-runnable. CRN-bearing suppliers reuse/extend the canonical identity; name-only ones get
    a synthetic id. See reference-data/official_appointments.ndjson + docs/coverage-backlog.md."""
    if not rows:
        return {"official_appointment_rows": 0}
    c = client()
    stage = config.pub("official_appointment_stage")
    sup, ap, inst, ev = config.pub("supplier"), config.pub("appointed_supplier"), config.pub("instrument"), config.pub("claim_evidence")
    c.query(f"CREATE OR REPLACE TABLE `{stage}` (rm_reference STRING, supplier_name STRING, company_number STRING, lot STRING, source_url STRING)").result()
    c.insert_rows_json(stage, [{"rm_reference": r["rm_reference"], "supplier_name": r["supplier_name"], "company_number": r.get("company_number"), "lot": r.get("lot"), "source_url": r["source_url"]} for r in rows])
    c.query(f"""INSERT INTO `{ev}` (evidence_id, source_url, source_kind, excerpt, licence, confidence, retrieved_on)
      SELECT DISTINCT CONCAT('ev-official-', rm_reference), ANY_VALUE(source_url), 'official_supplier_list',
        CONCAT(rm_reference, ' appointed-supplier list (official public source)'), 'OGL-3.0', 1.0, CURRENT_TIMESTAMP()
      FROM `{stage}` st WHERE NOT EXISTS(SELECT 1 FROM `{ev}` e WHERE e.evidence_id = CONCAT('ev-official-', st.rm_reference)) GROUP BY rm_reference""").result()
    # new CRN-bearing suppliers
    c.query(f"""INSERT INTO `{sup}` (supplier_id, display_name, company_number, registered_name, match_confidence, match_band, status_at_match, matched_on, ch_url, publisher_ids)
      SELECT * FROM (SELECT DISTINCT CONCAT('off-', st.company_number) AS supplier_id, st.supplier_name, st.company_number, st.supplier_name, 1.0, 'crn_from_official_list', CAST(NULL AS STRING), CURRENT_TIMESTAMP(),
        CONCAT('https://find-and-update.company-information.service.gov.uk/company/', st.company_number), CAST([] AS ARRAY<STRING>)
      FROM `{stage}` st WHERE st.company_number IS NOT NULL AND NOT EXISTS(SELECT 1 FROM `{sup}` s WHERE s.company_number = st.company_number))""").result()
    # name-only suppliers (no CRN on the official source)
    c.query(f"""INSERT INTO `{sup}` (supplier_id, display_name, company_number, registered_name, match_confidence, match_band, status_at_match, matched_on, ch_url, publisher_ids)
      SELECT * FROM (SELECT DISTINCT CONCAT('off-', TO_HEX(MD5(LOWER(st.supplier_name)))) AS supplier_id, st.supplier_name, CAST(NULL AS STRING), st.supplier_name, 0.5, 'name_only_official_list', CAST(NULL AS STRING), CURRENT_TIMESTAMP(), CAST(NULL AS STRING), CAST([] AS ARRAY<STRING>)
      FROM `{stage}` st WHERE st.company_number IS NULL AND NOT EXISTS(SELECT 1 FROM `{sup}` s WHERE LOWER(s.display_name) = LOWER(st.supplier_name)))""").result()
    # appointed-supplier edges (resolve to the canonical existing supplier_id, else the off- row just created)
    c.query(f"""INSERT INTO `{ap}` (instrument_id, lot_id, supplier_id, status, confidence, conflict, evidence_ids, last_seen_on, appointed_from, left_on)
      SELECT m.inst_id, st.lot,
        COALESCE(
          (SELECT MIN(s.supplier_id) FROM `{sup}` s WHERE st.company_number IS NOT NULL AND s.company_number = st.company_number),
          (SELECT MIN(s.supplier_id) FROM `{sup}` s WHERE st.company_number IS NULL AND LOWER(s.display_name) = LOWER(st.supplier_name))),
        'active', 1.0, FALSE, [CONCAT('ev-official-', st.rm_reference)], CURRENT_DATE(), CAST(NULL AS DATE), CAST(NULL AS DATE)
      FROM `{stage}` st
      JOIN (SELECT rm_reference, ARRAY_AGG(instrument_id ORDER BY IF(operator_id='gca',0,1), instrument_id LIMIT 1)[OFFSET(0)] AS inst_id FROM `{inst}` WHERE rm_reference IS NOT NULL GROUP BY rm_reference) m USING (rm_reference)
      WHERE m.inst_id IS NOT NULL""").result()
    n = query(f"SELECT COUNT(*) n FROM `{stage}`")[0]["n"]
    c.query(f"DROP TABLE IF EXISTS `{stage}`").result()
    return {"official_appointment_rows": n}


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
