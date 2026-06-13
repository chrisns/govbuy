// Builds the MCP server and registers the govbuy route-to-market tool surface (PRD §9).
// All reads are over govbuy_public (incl. the sibling_call_off_awards authorized view);
// query_sql is read-only and byte-capped. Every asserted fact is source-anchored (evidence).
// Evidence is resolved via LEFT JOIN (BigQuery rejects cross-table correlated subqueries).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config, tableRef } from "./lib/config.js";
import { runQuery, dryRunBytes } from "./lib/bigquery.js";
import { ok, toolError, guard, BadInput } from "./lib/errors.js";
import { membership, deep, freshness, withFreshness } from "./lib/format.js";
import { validateReadOnlySql } from "./lib/sqlguard.js";

const NOT_ADVICE = "Candidate route-to-market information, source-anchored. NOT legal advice and not the authority of record; you must confirm compliance on the official source. govbuy documents routes — it does not assemble the purchase or author the business case. GROUNDING RULE: every specific £ figure, framework/RM reference, supplier name and URL you state MUST come verbatim from a govbuy tool result — never invent, estimate, round, or infer one. If the data doesn't contain a number or link the user asked for, say so plainly (or call the right tool) rather than supplying a plausible-looking value; an invented RM number or '£14m' is worse than 'govbuy doesn't hold that'.";

// Display directive carried in every response so the host LLM renders the URLs we return as
// clickable links rather than naming things bare. A framework/supplier/source named without its
// link is not actionable — the user cannot reach the official page, the Companies House record, or
// the evidence. Always link the NAME (link text = the thing's name), never paste a bare URL.
const DISPLAY_GUIDANCE = "Render every URL in this response as a clickable markdown link whose text is the name of the thing it points to — do not just cite names. Specifically: official_url is the framework/instrument's official page; operator_url is the operator's site; each supplier's ch_url is its Companies House record; buying_docs[].url and how_to_apply[].url are the buying/guidance/application documents; and every evidence.source_url is the source a claim is anchored to (link it so the user can verify). When a thing has a URL, present its name as a link to that URL; reserve bare-text mentions for things that genuinely have no URL.";

const CE = tableRef("claim_evidence");
// Evidence as a NON-FANNING, DE-CORRELATABLE join. A LEFT JOIN straight onto claim_evidence multiplies the
// parent row by the number of evidence rows sharing an evidence_id (often 5-6) — silently duplicating
// instruments/mechanics in the result (385 instruments, 2,665 mechanics affected). A correlated
// `(SELECT … ORDER BY confidence LIMIT 1)` fixes the duplication but BigQuery can't de-correlate it across
// tables (runtime error). So we pre-group claim_evidence to ONE highest-confidence row per evidence_id and
// LEFT JOIN that — one row per parent, and a plain de-correlatable join: `LEFT JOIN ${EVAGG} x` → `x.ev`.
const EVAGG = `(SELECT evidence_id, ARRAY_AGG(STRUCT(source_url, CONCAT('https://web.archive.org/web/2/', source_url) AS archived_url, source_kind, excerpt, licence, confidence)
        ORDER BY confidence DESC LIMIT 1)[OFFSET(0)] AS ev FROM ${CE} GROUP BY evidence_id)`;

// Tokenise a free-text need into significant terms (drop stopwords) for ANY-token matching.
const STOP = new Set(["a", "an", "the", "for", "of", "to", "my", "our", "i", "we", "want", "need", "buy", "buying", "purchase", "procure", "procurement", "product", "products", "solution", "solutions", "service", "services", "shelf", "compliantly"]);
// Conservative singularisation: a query for "drones"/"gases"/"cameras" should match a framework named
// "Drone…"/"Gas…"/"Camera…". Strip regular plurals only; leave words that merely end in -s (gas, bus,
// status, analysis, business) alone. The SQL side ALSO matches an optional plural suffix on the haystack
// (`(?:es|s)?`), so the singular query token "drone" still matches the plural name "Drones". Both sides
// together make matching plural-insensitive in either direction.
function singular(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";   // companies → company
  if (t.length > 4 && t.endsWith("ses")) return t.slice(0, -2);          // gases → gas, businesses → business
  if (t.length > 4 && t.endsWith("es") && /(?:x|ch|sh|z)es$/.test(t)) return t.slice(0, -2); // boxes → box
  if (t.length > 3 && t.endsWith("s") && !/(?:ss|us|is)$/.test(t)) return t.slice(0, -1);     // drones → drone
  return t;
}
function tokenize(term: string): string[] {
  return [...new Set((term || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t)).map(singular))];
}

// When a need involves processing data (AI/ML, transcription, hosting, personal/sensitive records), a buyer
// must check where the data and any AI inference are processed — a catalogue listing doesn't guarantee it.
// We emit this as a structured field (not just prose guidance) so the model reliably surfaces it.
const DATA_SENSITIVE = new Set(["ai","ml","artificial","intelligence","transcription","transcribe","transcript",
  "speech","stt","voice","audio","video","llm","gpt","host","hosting","hosted","saas","paas","personal",
  "sensitive","gdpr","records","record","patient","clinical","casework","analytics","biometric","facial"]);
function dataResidencyNote(text: string): string | undefined {
  const toks = new Set((text || "").toLowerCase().split(/[^a-z0-9]+/));
  for (const k of DATA_SENSITIVE) if (toks.has(k)) return "This need processes data (AI/hosting/records). Before relying on any listing, confirm with the supplier WHERE the data and any AI inference are processed (UK/EEA region) and that it meets UK-GDPR — a catalogue listing does not by itself guarantee data residency.";
  return undefined;
}

// Tiny in-process TTL memo for static REFERENCE data (PA2023 rules, payment caveats, schema) that every
// buy/framework call re-reads. Read-only analytics; staleness within the TTL is harmless and it cuts both
// BigQuery cost and latency. NOT used for anything supplier/award-specific. (Rate limiting lives in index.ts.)
const _memo = new Map<string, { at: number; v: unknown }>();
async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = _memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await fn();
  _memo.set(key, { at: Date.now(), v });
  return v;
}

// A Wayback "latest snapshot" link for a source URL, so a citation survives the live page changing/404ing.
// Deterministic (no fetch); resolves to the newest capture if one exists, else Wayback's not-archived page.
function waybackUrl(u: unknown): string | null {
  return typeof u === "string" && /^https?:\/\//.test(u) ? `https://web.archive.org/web/2/${u}` : null;
}

// Working-day date arithmetic (UK), for the draft timetable. Skips Sat/Sun (bank holidays are flagged in
// prose, not modelled). Returns an ISO date string N working days after `from`.
function addWorkingDays(from: Date, n: number): string {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

const LOTS = (a: string) => `ARRAY(SELECT AS STRUCT l.lot_id, l.number, l.title, l.scope FROM ${tableRef("lot")} l WHERE l.instrument_id = ${a}.instrument_id)`;
// Evidence is attached via a LEFT JOIN to the pre-grouped EVAGG (one row per evidence_id), NOT a raw join
// onto claim_evidence: a mechanic/doc whose evidence_id has multiple claim_evidence rows would otherwise
// appear duplicated N times in the array (2,665 mechanics reference such multi-row evidence ids).
const MECHANICS = (a: string) => `ARRAY(SELECT AS STRUCT m.mechanic, m.permitted, m.lot_id, m.conditions, mev.ev AS evidence FROM ${tableRef("award_mechanic")} m LEFT JOIN ${EVAGG} mev ON mev.evidence_id = m.evidence_id WHERE m.instrument_id = ${a}.instrument_id)`;
const DOCS = (a: string) => `ARRAY(SELECT AS STRUCT d.doc_type, d.title, d.url, d.required_for_purchase, dev.ev AS evidence FROM ${tableRef("buying_doc")} d LEFT JOIN ${EVAGG} dev ON dev.evidence_id = d.evidence_id WHERE d.instrument_id = ${a}.instrument_id)`;

async function paymentCaveats(): Promise<unknown[]> {
  return memo("payment_caveats", 600_000, _paymentCaveats);
}
async function _paymentCaveats(): Promise<unknown[]> {
  try {
    const rows = await runQuery(`SELECT mechanism, permitted_for_procurement, notes FROM ${tableRef("payment_mechanism")} WHERE is_route = FALSE ORDER BY mechanism`);
    if (rows.length) return rows.map((r) => ({ mechanism: r.mechanism, is_route: false, permitted_for_procurement: r.permitted_for_procurement, notes: r.notes }));
  } catch { /* fall through */ }
  return [
    { mechanism: "gpc", is_route: false, notes: "Government Procurement Card is a payment mechanism, not a route; banned where a procurement route exists (Mar 2025)." },
    { mechanism: "marketplace_consumption", is_route: false, notes: "Hyperscaler marketplace billing sits on a route (e.g. G-Cloud); it is not itself a compliant route." },
  ];
}

// --- Exclusion gate: PA2023 has TWO limbs — insolvency (Sch 6/7) and the s.62 debarment register.
const DEBARMENT_SRC = "https://www.gov.uk/government/publications/debarment-list";
const DISTRESS = new Set(["dissolved", "liquidation", "administration", "closed", "receivership",
  "insolvency-proceedings", "voluntary-arrangement", "converted-closed", "in-administration"]);

// Live Companies House profile for one CRN (the supplier you're about to award). Returns null when the
// service has no CH key, or on any error/timeout — callers fall back to the ingest-time snapshot.
// The SAME /company/{crn} response carries size/locality signals (SIC, accounts category, registered
// office), so we derive an SME/region lens here with no extra crawl. `status` powers the exclusion gate.
interface ChProfile {
  status: string;
  checked_at: string;
  sic_codes: string[];
  company_type: string | null;
  incorporated_on: string | null;
  registered_office_region: string | null;
  registered_office_postcode_area: string | null;
  accounts_category: string | null;
}
async function liveChProfile(crn: string | null | undefined): Promise<ChProfile | null> {
  const key = process.env.COMPANIES_HOUSE_API;
  if (!key || !crn) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`https://api.company-information.service.gov.uk/company/${encodeURIComponent(crn)}`,
      { headers: { Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}` }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      company_status?: string; sic_codes?: string[]; type?: string; date_of_creation?: string;
      registered_office_address?: { region?: string; locality?: string; postal_code?: string };
      accounts?: { last_accounts?: { type?: string } };
    };
    if (!j.company_status) return null;
    const office = j.registered_office_address ?? {};
    return {
      status: j.company_status,
      checked_at: new Date().toISOString(),
      sic_codes: Array.isArray(j.sic_codes) ? j.sic_codes : [],
      company_type: j.type ?? null,
      incorporated_on: j.date_of_creation ?? null,
      registered_office_region: office.region ?? office.locality ?? null,
      registered_office_postcode_area: (office.postal_code ?? "").trim().split(/\s+/)[0] || null,
      accounts_category: j.accounts?.last_accounts?.type ?? null,
    };
  } catch { return null; }
}

// Bulk CH profile (govbuy_public.company_profile, from the free whole-population Company Data Product —
// no API key). Covers the whole supplier base; used as the lens when a live call is unavailable, and to
// fill fields the live call lacks.
interface BulkProfile {
  company_category: string | null; company_status_bulk: string | null; incorporated_on: string | null;
  accounts_category: string | null; region: string | null; postcode_area: string | null;
  sic_codes: string[]; sme_likely: boolean | null;
}
async function bulkProfile(crn: string | null | undefined): Promise<BulkProfile | null> {
  if (!crn) return null;
  try {
    const rows = await runQuery<BulkProfile>(`SELECT company_category, company_status_bulk, incorporated_on,
        accounts_category, region, postcode_area, sic_codes, sme_likely
      FROM ${tableRef("company_profile")} WHERE company_number = @crn LIMIT 1`, { params: { crn }, types: { crn: "STRING" } });
    return rows.length ? (deep(rows[0]) as BulkProfile) : null;
  } catch { return null; }
}

// Size / locality lens for one firm, from Companies House only (never invented). Prefers the LIVE call for
// freshness, falls back to the bulk Company Data Product (whole-population, no key) for everything the live
// call lacks or when there's no live key. SME likelihood is read off the filed-accounts category — a signal,
// not a determination. Social value isn't a CH field, so we surface the PA2023 DUTY, not a fabricated score.
function procurementLens(live: ChProfile | null, bulk: BulkProfile | null): Record<string, unknown> | null {
  if (!live && !bulk) return null;
  const sme = live ? smeFromAccounts(live.accounts_category) : null;
  const smeLikely = (sme === null && bulk) ? bulk.sme_likely : sme;
  const accounts = live?.accounts_category ?? bulk?.accounts_category ?? null;
  const region = live?.registered_office_region ?? bulk?.region ?? null;
  const sics = (live && live.sic_codes.length) ? live.sic_codes : (bulk?.sic_codes ?? []);
  return {
    source: live ? "live_companies_house" : "companies_house_bulk",
    checked_at: live?.checked_at ?? null,
    company_type: live?.company_type ?? bulk?.company_category ?? null,
    incorporated_on: live?.incorporated_on ?? bulk?.incorporated_on ?? null,
    sic_codes: sics,
    registered_office_region: region,
    registered_office_postcode_area: live?.registered_office_postcode_area ?? bulk?.postcode_area ?? null,
    accounts_category: accounts,
    sme_likely: smeLikely,
    sme_basis: accounts
      ? `Inferred from the filed-accounts category '${accounts}' (${live ? "live" : "bulk"} Companies House — a signal, not a definitive SME determination; confirm against the Companies Act size thresholds: turnover, balance-sheet, headcount).`
      : "No filed-accounts category on the Companies House record to infer size from.",
    social_value_note: "Social value is not a Companies House field. Under PA2023 a contracting authority must have regard to its procurement objectives (incl. SME participation and the National Procurement Policy Statement / social-value priorities) — evidence this in the evaluation, don't infer it from the supplier record.",
  };
}
function smeFromAccounts(cat: string | null): boolean | null {
  const c = (cat ?? "").toLowerCase();
  if (["micro-entity", "micro", "small", "dormant", "total-exemption-small", "total-exemption-full"].some((x) => c.includes(x))) return true;
  if (["medium", "full", "group", "audited-abridged"].some((x) => c.includes(x))) return false;
  return null;
}

// Is this CRN on the s.62 debarment register? (Register is currently blank; this still lets us state
// 'checked, not debarred' with a source — and surfaces a real entry the moment one is published.)
async function debarmentEntry(crn: string | null | undefined): Promise<Record<string, unknown> | null> {
  if (!crn) return null;
  try {
    const rows = await runQuery(`SELECT supplier_name, grounds, mandatory_or_discretionary, decision_date, review_date, source_url
      FROM ${tableRef("debarment_list")} WHERE company_number = @crn LIMIT 1`, { params: { crn }, types: { crn: "STRING" } });
    return rows.length ? (deep(rows[0]) as Record<string, unknown>) : null;
  } catch { return null; }
}

// Assemble the full exclusion verdict for a CRN: live-or-snapshot insolvency status + debarment, naming
// both PA2023 limbs. `snapshot` is the ingest-time status_at_match (used when live is unavailable).
async function exclusionFor(crn: string | null | undefined, snapshot: string | null | undefined, prefetched?: ChProfile | null) {
  const [live, deb] = await Promise.all([
    prefetched !== undefined ? Promise.resolve(prefetched) : liveChProfile(crn),
    debarmentEntry(crn),
  ]);
  const effective = (live?.status ?? snapshot ?? "").toString();
  const insolvent = DISTRESS.has(effective);
  const debarred = !!deb;
  return {
    flagged: insolvent || debarred,
    insolvency: {
      flagged: insolvent, status: effective || null,
      source: live ? "live_companies_house" : "ingest_snapshot",
      checked_at: live?.checked_at ?? null,
      note: insolvent
        ? `⚠ PA2023 Schedule 6/7 exclusion ground: Companies House status is '${effective}' (${live ? "LIVE check" : "snapshot at match time"}). A contracting authority must consider insolvency/dissolution before award.`
        : `No Companies-House distress flag (${live ? "LIVE status '" + effective + "'" : "snapshot — re-check live before award"}).`,
    },
    debarment: {
      checked: true, listed: debarred, register_url: DEBARMENT_SRC, entry: deb ?? null,
      note: debarred
        ? `⚠ PA2023 s.62 DEBARMENT: this supplier is on the central debarment list (${String(deb?.mandatory_or_discretionary ?? "")} ground). Exclusion may be mandatory — verify on the register before any procurement.`
        : "Checked the s.62 central debarment register — not listed (the register is published by gov.uk and is currently blank).",
    },
  };
}

// Batch-resolve evidence_id -> evidence block in JS (avoids cross-table correlated subqueries in
// deeply-nested array contexts). Walks the result tree, collects ids, one claim_evidence query, attaches.
function collectIds(node: unknown, acc: Set<string>): void {
  if (Array.isArray(node)) node.forEach((n) => collectIds(n, acc));
  else if (node && typeof node === "object") {
    const v = node as Record<string, unknown>;
    if (typeof v.evidence_id === "string") acc.add(v.evidence_id);
    Object.values(v).forEach((x) => collectIds(x, acc));
  }
}
function attachEv(node: unknown, map: Record<string, unknown>): void {
  if (Array.isArray(node)) node.forEach((n) => attachEv(n, map));
  else if (node && typeof node === "object") {
    const v = node as Record<string, unknown>;
    if (typeof v.evidence_id === "string" && v.evidence === undefined) v.evidence = map[v.evidence_id] ?? null;
    Object.values(v).forEach((x) => attachEv(x, map));
  }
}
async function withEvidence<T>(payload: T): Promise<T> {
  const ids = new Set<string>();
  collectIds(payload, ids);
  if (ids.size) {
    const rows = await runQuery(`SELECT evidence_id, source_url, source_kind, excerpt, licence, confidence FROM ${CE} WHERE evidence_id IN UNNEST(@ids)`, { params: { ids: [...ids] }, types: { ids: ["STRING"] } });
    const map: Record<string, unknown> = {};
    for (const r of rows) map[r.evidence_id as string] = deep({ source_url: r.source_url, archived_url: waybackUrl(r.source_url), source_kind: r.source_kind, excerpt: r.excerpt, licence: r.licence, confidence: r.confidence });
    attachEv(payload, map);
  }
  return payload;
}

// ── shared SQL fragments ─────────────────────────────────────────────────────────────────────────
// Generic procurement-domain words that match hundreds of framework names ("…Equipment", "…Services").
// Left at full weight they drown a SPECIFIC match (e.g. "Drones DPS" buried under every "…Imaging
// Equipment" framework). Demoted in RM_SCORE so a rare/specific token wins — a cheap stand-in for IDF.
const GENERIC = ["equipment", "imaging", "service", "solution", "system", "product", "associated", "management",
  "support", "software", "good", "supply", "supplies", "related", "general", "specialist", "provision",
  "hardware", "consultancy", "technology", "digital", "professional", "managed", "national", "framework"];
// Route relevance, used by every route search (deduped across the three). A NAME hit on a SPECIFIC token
// scores most (12); a generic-word name hit barely counts (1); category tag and lot hits add a little.
// Three separate single-level subqueries (BigQuery de-correlates these; a nested table-correlated
// subquery would not). NAME hit on a specific token = 12, generic word = 1; category tag = 2; lot specific = 2.
const RM_SCORE = `(
     (SELECT IFNULL(SUM(IF(tok IN UNNEST(@generic), 1, 12)), 0) FROM UNNEST(@toks) tok WHERE REGEXP_CONTAINS(LOWER(i.name), CONCAT(r'\\b', tok, r'(?:es|s)?\\b')))
   + 2 * (SELECT COUNT(1) FROM UNNEST(i.category_tags) t, UNNEST(@toks) tok WHERE LOWER(t) = tok OR LOWER(t) LIKE CONCAT(tok, '%'))
   + (SELECT IFNULL(SUM(IF(tok IN UNNEST(@generic), 0, 2)), 0) FROM ${tableRef("lot")} l, UNNEST(@toks) tok WHERE l.instrument_id = i.instrument_id AND (REGEXP_CONTAINS(LOWER(l.title), CONCAT(r'\\b', tok, r'(?:es|s)?\\b')) OR REGEXP_CONTAINS(LOWER(IFNULL(l.scope,'')), CONCAT(r'\\b', tok, r'(?:es|s)?\\b')))))`;
const RM_WHERE = `(ARRAY_LENGTH(@toks) = 0
   OR EXISTS (SELECT 1 FROM UNNEST(@toks) tok WHERE REGEXP_CONTAINS(LOWER(i.name), CONCAT(r'\\b', tok, r'(?:es|s)?\\b')))
   OR EXISTS (SELECT 1 FROM UNNEST(i.category_tags) t, UNNEST(@toks) tok WHERE LOWER(t) = tok OR LOWER(t) LIKE CONCAT(tok, '%'))
   OR EXISTS (SELECT 1 FROM ${tableRef("lot")} l, UNNEST(@toks) tok WHERE l.instrument_id = i.instrument_id AND (REGEXP_CONTAINS(LOWER(l.title), CONCAT(r'\\b', tok, r'(?:es|s)?\\b')) OR REGEXP_CONTAINS(LOWER(IFNULL(l.scope,'')), CONCAT(r'\\b', tok, r'(?:es|s)?\\b')))))`;

async function pa2023Rules() {
  return memo("pa2023_rules", 600_000, async () =>
    (await runQuery(`SELECT topic, statement, source_url FROM ${tableRef("pa2023_rule")} ORDER BY topic`)).map((r) => deep(r)));
}

// ── capability functions (the deduped guts; verbs compose these) ──────────────────────────────────
type A = Record<string, any>;

// Candidate live routes for a need (full detail: lots, mechanics, docs, coverage).
async function capRoutes(a: A) {
  const toks = tokenize(a.need || a.keyword || a.category || a.cpv || "");
  const sql = `
    SELECT i.instrument_id, i.name, i.rm_reference, i.type, i.regime, i.lifecycle_status,
           i.starts_on, i.expires_on, i.category_tags, i.official_url,
           o.name AS operator, o.kind AS operator_kind, o.home_url AS operator_url,
           ${LOTS("i")} AS lots, ${MECHANICS("i")} AS award_mechanics, ${DOCS("i")} AS buying_docs,
           iev.ev AS evidence,
           STRUCT(
             EXISTS(SELECT 1 FROM ${tableRef("appointed_supplier")} a WHERE a.instrument_id = i.instrument_id) AS has_official_supplier_list,
             EXISTS(SELECT 1 FROM ${tableRef("award_mechanic")} am WHERE am.instrument_id = i.instrument_id) AS has_award_mechanic,
             EXISTS(SELECT 1 FROM ${tableRef("observed_membership")} om WHERE om.rm_reference = i.rm_reference) AS has_observed_awards
           ) AS coverage,
           ${RM_SCORE} AS match_score
    FROM ${tableRef("instrument")} i
    JOIN ${tableRef("operator")} o USING (operator_id)
    LEFT JOIN ${EVAGG} iev ON iev.evidence_id = i.evidence_id
    WHERE i.lifecycle_status = 'live_for_call_off' AND ${RM_WHERE}
    ORDER BY match_score DESC, i.name LIMIT @lim`;
  const rows = await runQuery(sql, { params: { toks, generic: GENERIC, lim: a.limit ?? 15 }, types: { toks: ["STRING"], generic: ["STRING"] } });
  return { count: rows.length, payment_caveats: await paymentCaveats(), routes: rows.map(deep) };
}

// Catalogue listings that DO a thing (semantic + keyword + proof-of-delivery + two-limb exclusion flags).
async function capServices(a: A) {
  const toks = tokenize(a.need || a.keyword || "");
  if (!toks.length && !a.supplier) throw new BadInput("INVALID_QUERY", "Provide a need/keyword (e.g. 'host an open-source app') or a supplier name.");
  const nameHits = `(SELECT COUNT(1) FROM UNNEST(@toks) tok WHERE REGEXP_CONTAINS(nm, CONCAT(r'\\b', tok, r'(?:es|s)?\\b')))`;
  const anyHits = `(SELECT COUNT(1) FROM UNNEST(@toks) tok WHERE REGEXP_CONTAINS(hay, CONCAT(r'\\b', tok, r'(?:es|s)?\\b')))`;
  const allTok = `(${anyHits} = ARRAY_LENGTH(@toks))`;
  const score = `(IF(${allTok}, 1000, 0) + 5 * ${nameHits} + ${anyHits})`;
  const priceExpr = `SAFE_CAST(REPLACE(REGEXP_EXTRACT(sv.description, r'Price(?:\\s*\\(ex VAT\\))?\\s*:\\s*£([\\d,]+(?:\\.\\d+)?)'), ',', '') AS FLOAT64)`;
  const needText = (a.need || a.keyword || "").trim();
  const useSem = needText.length > 0 && a.semantic !== false;
  const semCte = useSem
    ? `qemb AS (SELECT ml_generate_embedding_result AS embedding
                FROM ML.GENERATE_EMBEDDING(MODEL ${tableRef("embed")}, (SELECT @needtext AS content),
                                           STRUCT(TRUE AS flatten_json_output))),
       vec AS (SELECT base.service_id AS service_id, (1 - distance) AS sem_sim
                FROM VECTOR_SEARCH(TABLE ${tableRef("service_embedding")}, 'embedding',
                                   (SELECT embedding FROM qemb), top_k => 80, distance_type => 'COSINE',
                                   options => '{"use_brute_force":true}')),`
    : "";
  const sql = `
    WITH ${semCte}
    s AS (
      SELECT sv.service_id, sv.catalogue, sv.name, sv.supplier_name, sv.lot, sv.description, sv.features, sv.benefits,
             sv.url, sv.instrument_id, sup.company_number, sup.ch_url, sup.match_band,
             IF(sup.status_at_match IN ('dissolved','liquidation','administration','closed'), sup.status_at_match, NULL) AS exclusion_status,
             (deb.company_number IS NOT NULL) AS supplier_debarred,
             inst.rm_reference, inst.expires_on, ${priceExpr} AS price_gbp,
             LOWER(sv.name) AS nm,
             LOWER(CONCAT(sv.name, ' ', IFNULL(sv.description, ''), ' ',
                          ARRAY_TO_STRING(sv.features, ' '), ' ', ARRAY_TO_STRING(sv.benefits, ' '))) AS hay
      FROM ${tableRef("service")} sv
      LEFT JOIN ${tableRef("supplier")} sup ON sup.supplier_id = sv.supplier_id
      LEFT JOIN ${tableRef("debarment_list")} deb ON deb.company_number = sup.company_number
      LEFT JOIN ${tableRef("instrument")} inst ON inst.instrument_id = sv.instrument_id
      WHERE (@sup IS NULL OR LOWER(sv.supplier_name) LIKE @sup)
        AND (@cat IS NULL OR sv.catalogue = @cat)
        AND (@lot IS NULL OR sv.lot = @lot))
    SELECT s.* EXCEPT(hay, nm, rm_reference),
           (${score}${useSem ? " + CAST(COALESCE(v.sem_sim, 0) * 700 AS INT64)" : ""}) AS match_score,
           ${useSem ? "ROUND(v.sem_sim, 3)" : "CAST(NULL AS FLOAT64)"} AS semantic_similarity,
           tr.calloff_gbp     AS supplier_public_calloff_gbp,
           tr.calloff_count   AS supplier_public_calloffs,
           CASE WHEN s.expires_on IS NOT NULL
                THEN DATE_DIFF(s.expires_on, CURRENT_DATE(), MONTH) END AS framework_months_to_expiry
    FROM s
    ${useSem ? `LEFT JOIN vec v ON v.service_id = s.service_id` : ""}
    LEFT JOIN ${tableRef("supplier_calloff_total")} tr ON tr.supplier_crn = s.company_number
    WHERE (ARRAY_LENGTH(@toks) = 0 OR ${anyHits} > 0${useSem ? " OR v.sem_sim IS NOT NULL" : ""})
    ORDER BY match_score DESC, supplier_public_calloff_gbp DESC NULLS LAST, name
    LIMIT @lim`;
  const rows = await runQuery(sql, {
    params: { toks, needtext: useSem ? needText : null, cat: a.catalogue ?? null, lot: a.lot ?? null, sup: a.supplier ? `%${a.supplier.toLowerCase()}%` : null, lim: a.limit ?? 8 },
    types: { toks: ["STRING"], needtext: "STRING", cat: "STRING", lot: "STRING", sup: "STRING" },
  });
  const services = rows.map((r) => {
    const d = deep(r) as Record<string, unknown>;
    const desc = typeof d.description === "string" ? d.description : "";
    return { ...d, description: desc.length > 600 ? desc.slice(0, 600) + "…" : desc };
  });
  const residencyNote = dataResidencyNote(needText || a.supplier || "");
  return { count: services.length, ...(residencyNote ? { data_residency_note: residencyNote } : {}), services };
}

// PA2023-precise call-off path for one instrument (mechanics + conditions + docs + statutory rules).
async function capCompliantPath(a: A) {
  if (!a.instrument_id && !a.rm_reference) throw new BadInput("INVALID_QUERY", "Provide instrument_id or rm_reference (e.g. 'g-cloud-14' or 'RM1557.14').");
  const sql = `
    WITH iid AS (
      SELECT instrument_id, name, rm_reference, lifecycle_status,
             CAST(expires_on AS STRING) AS expires_on, official_url
      FROM ${tableRef("instrument")} inst
      WHERE (@iid IS NOT NULL AND instrument_id = @iid)
         OR (@rm IS NOT NULL AND REGEXP_EXTRACT(UPPER(rm_reference), r'RM[0-9.]+') = REGEXP_EXTRACT(UPPER(@rm), r'RM[0-9.]+'))
      ORDER BY (SELECT COUNT(*) FROM ${tableRef("award_mechanic")} m WHERE m.instrument_id = inst.instrument_id) DESC
      LIMIT 1)
    SELECT 'instrument' AS section, i.name AS title, i.rm_reference AS ref, i.lifecycle_status AS status,
           i.expires_on, i.official_url AS url, CAST(NULL AS BOOL) AS permitted, CAST(NULL AS STRING) AS conditions, 0 AS sort
    FROM iid i
    UNION ALL
    SELECT 'mechanic', am.mechanic, am.lot_id, NULL, NULL, NULL, am.permitted, am.conditions,
           CASE WHEN am.permitted AND am.mechanic = 'call_off_no_further_competition' THEN 1 WHEN am.permitted THEN 2 ELSE 3 END
    FROM ${tableRef("award_mechanic")} am JOIN iid i USING (instrument_id)
    UNION ALL
    SELECT 'document', bd.title, bd.doc_type, NULL, NULL, bd.url, NULL, bd.summary, 4
    FROM ${tableRef("buying_doc")} bd JOIN iid i USING (instrument_id)
    UNION ALL
    SELECT 'payment_caveat', pm.mechanism, pm.governing_source, pm.permitted_for_procurement, NULL, NULL, NULL, pm.notes, 5
    FROM ${tableRef("payment_mechanism")} pm
    WHERE pm.is_route = FALSE AND pm.permitted_for_procurement IN ('no', 'narrow')
    ORDER BY sort, title`;
  const rows = (await runQuery(sql, {
    params: { iid: a.instrument_id ?? null, rm: a.rm_reference ?? null },
    types: { iid: "STRING", rm: "STRING" },
  })).map((r) => deep(r) as Record<string, unknown>);
  if (!rows.length) throw new BadInput("UNKNOWN", `No instrument matched '${a.instrument_id ?? a.rm_reference}'.`);
  const pa2023 = await pa2023Rules();
  const sect = (s: string) => rows.filter((r) => r.section === s);
  const head = sect("instrument")[0] ?? {};
  return {
    instrument: { name: head.title, rm_reference: head.ref, lifecycle_status: head.status, expires_on: head.expires_on, official_url: head.url },
    award_mechanics: sect("mechanic").map((r) => ({ mechanic: r.title, lot_id: r.ref, permitted: r.permitted, conditions: r.conditions })),
    buying_documents: sect("document").map((r) => ({ title: r.title, doc_type: r.ref, url: r.url, summary: r.conditions })),
    payment_caveats: sect("payment_caveat").map((r) => ({ mechanism: r.title, permitted_for_procurement: r.status, note: r.conditions })),
    procurement_act_2023: {
      summary: "PA2023 (in force 24 Feb 2025) governs covered procurement in England/Wales/NI. A framework call-off (direct selection under the framework's objective mechanism, or further competition) is NOT a statutory direct award — ss.41/43 cannot be used for call-offs. Direct award without competition is lawful only on a Schedule 5 ground (+ a transparency notice). A competitive award needs an 8-working-day standstill after the contract award notice before signing. The regime is payment-method-blind — a GPC/purchase card confers no exemption.",
      rules: pa2023,
    },
  };
}

// DRAFT: turn a chosen route into the SCAFFOLDING a buyer has to author — a real-dated procurement
// timetable, a MEAT evaluation-matrix skeleton, a specification outline, the statutory compliance steps,
// and (for a statutory direct award) a Schedule 5 / s.44 transparency-notice stub. Reuses the PA2023-precise
// mechanic from capCompliantPath; pure templating + working-day date maths. Explicitly NOT the document.
async function capDraft(a: A) {
  // Resolve the route: explicit rm/instrument, else infer the top route for the need.
  let rm = a.rm_reference as string | undefined;
  let iid = a.instrument_id as string | undefined;
  if (!rm && !iid) {
    if (!tokenize(a.need || "").length) throw new BadInput("INVALID_QUERY", "Provide a need (e.g. 'managed SOC'), or an rm_reference / instrument_id.");
    const cmp = await capCompare({ need: a.need, cpv: a.cpv, limit: 1 }).catch(() => null);
    const top = (cmp?.routes ?? [])[0] as A | undefined;
    if (!top) throw new BadInput("UNKNOWN", `No route matched '${a.need}'. Use buy({need}) to explore routes first.`);
    rm = top.rm_reference ?? undefined;
  }
  const cp = await capCompliantPath({ instrument_id: iid, rm_reference: rm });
  const inst = cp.instrument as Record<string, unknown>;
  const mechs = (cp.award_mechanics as Record<string, unknown>[]) ?? [];
  const permitted = mechs.filter((m) => m.permitted);
  const hasDirectCalloff = permitted.some((m) => m.mechanic === "call_off_no_further_competition");
  const hasFurtherComp = permitted.some((m) => m.mechanic === "further_competition");
  // Choose the route: caller override, else fastest permitted call-off, else further competition.
  const route: string = a.route ?? (hasDirectCalloff ? "framework_call_off" : hasFurtherComp ? "further_competition" : "further_competition");
  const today = new Date();
  const D = (n: number) => addWorkingDays(today, n);

  const exclusionStep = "Run exclusion checks on each candidate: PA2023 Schedule 6 (mandatory) & 7 (discretionary) grounds, the s.62 debarment register, and each supplier's LIVE Companies House status (use supplier({query})).";
  const kpiStep = "If the contract value is ≥ £5m, set and publish at least three KPIs and report against them annually (PA2023 s.52).";
  const socialValueStep = "Have regard to the National Procurement Policy Statement and your procurement objectives (incl. SME participation and social value) — build them into the award criteria, and record the rationale (PA2023 ss.12–13).";

  let timetable: { step: string; target_date: string; basis: string }[];
  let evaluation_matrix: unknown;
  let specification_outline: string[];
  let route_specific: Record<string, unknown> = {};
  const compliance_checklist: string[] = [];

  if (route === "direct_award") {
    timetable = [
      { step: "Confirm a lawful Schedule 5 direct-award ground applies and document the justification", target_date: D(0), basis: "PA2023 s.41 + Schedule 5" },
      { step: exclusionStep.replace("each candidate", "the supplier"), target_date: D(3), basis: "PA2023 Sch 6/7 + s.62" },
      { step: "Publish a transparency notice BEFORE entering the contract", target_date: D(5), basis: "PA2023 s.44 transparency notice" },
      { step: "Voluntary standstill (good practice for a direct award, not mandatory) — 8 working days", target_date: D(13), basis: "PA2023 s.51 (mandatory only for competitive awards)" },
      { step: "Enter the contract; publish a contract details notice within 30 days", target_date: D(14), basis: "PA2023 s.53" },
    ];
    evaluation_matrix = { note: "A direct award is by exception and not competed, so there is no comparative evaluation matrix — instead evidence the Schedule 5 ground and value-for-money below." };
    specification_outline = ["Statement of requirement", "Why a Schedule 5 ground applies (the facts)", "Value-for-money assessment (how the price was tested without competition)", "Contract terms & duration", "KPIs (if ≥ £5m)"];
    route_specific = {
      schedule5_justification_scaffold: {
        instructions: "Complete ONE qualifying ground with the supporting facts. A direct award is lawful only if a Schedule 5 ground is genuinely met — do not retrofit one.",
        candidate_grounds: ["No suitable tenders / no requests to participate received in a prior competition", "Only one supplier can deliver (technical reasons / exclusive rights / IP)", "Extreme urgency from unforeseeable events not attributable to the authority", "Additional/repeat goods or services from the original supplier where switching is disproportionate"],
        ground_relied_on: "<<state the Schedule 5 ground>>", supporting_facts: "<<the evidence that the ground is met>>", value_for_money_basis: "<<how price/terms were assured without competition>>",
      },
      s44_transparency_notice_fields: { contracting_authority: "<<name>>", supplier: "<<name + CRN>>", contract_subject: "<<short description>>", estimated_value_gbp: a.budget_gbp ?? "<<value>>", legal_basis: "PA2023 s.41 direct award, Schedule 5 ground: <<ground>>", publish_before: D(5) },
    };
    compliance_checklist.push(
      "A direct award is the exception, not the default — it is lawful ONLY on a genuine Schedule 5 ground.",
      "Publish the s.44 transparency notice BEFORE signing.",
      exclusionStep.replace("each candidate", "the supplier"), kpiStep, socialValueStep,
      "Confirm this is genuinely a statutory direct award and NOT a framework call-off (call-offs use the framework's own mechanism, not Schedule 5).",
    );
  } else if (route === "framework_call_off") {
    timetable = [
      { step: "Confirm the framework is live, your organisation is an eligible buyer, and the requirement is within lot scope", target_date: D(0), basis: `${inst.name ?? "framework"} ${inst.expires_on ? "(expires " + inst.expires_on + ")" : ""}` },
      { step: "Apply the framework's objective call-off award criteria and record the MEAT rationale for the chosen supplier", target_date: D(2), basis: "framework call-off (no further competition)" },
      { step: exclusionStep, target_date: D(3), basis: "PA2023 Sch 6/7 + s.62" },
      { step: "Place the call-off using the framework's order form / call-off contract", target_date: D(4), basis: "framework terms" },
      { step: "Publish a contract details notice within 30 days if above threshold", target_date: D(5), basis: "PA2023 s.53" },
    ];
    evaluation_matrix = {
      note: "Direct call-off uses the framework's OWN objective award criteria — apply them to select without a fresh competition. Template weighting to complete:",
      criteria: [{ criterion: "Technical / quality fit to requirement", weighting_pct: "<<e.g. 60>>" }, { criterion: "Social value", weighting_pct: "<<e.g. 10>>" }, { criterion: "Price / whole-life cost", weighting_pct: "<<e.g. 30>>" }],
      rule: "Weightings and sub-criteria must match the framework's permitted call-off criteria — check the framework's call-off guidance.",
    };
    specification_outline = ["Statement of requirement / outcomes", "Scope & deliverables", "Service levels / KPIs", "Selection basis against the framework's call-off criteria", "Call-off term, options & exit", "Pricing approach"];
    compliance_checklist.push(
      "A framework call-off is NOT a statutory direct award — apply the framework's objective mechanism, not Schedule 5.",
      "No standstill is required for a direct call-off without further competition.",
      exclusionStep, kpiStep, socialValueStep,
      "A GPC card / marketplace billing is a settlement mechanism, never the route, and confers no exemption.",
    );
  } else {
    // further competition (the default for DPS / dynamic markets and competed framework call-offs)
    timetable = [
      { step: "Confirm all appointed suppliers in scope are invited (no pre-exclusion); finalise the invitation pack & evaluation model", target_date: D(0), basis: "equal-treatment duty; framework further-competition rules" },
      { step: "Issue the invitation to submit tenders to the appointed suppliers", target_date: D(1), basis: "framework further competition" },
      { step: "Clarification-question deadline", target_date: D(6), basis: "fair & reasonable response window" },
      { step: "Tender submission deadline", target_date: D(16), basis: "proportionate to complexity (set your own period)" },
      { step: "Evaluate against the published award criteria; moderate & record scores", target_date: D(26), basis: "MEAT evaluation" },
      { step: "Issue award decision notices to all bidders, then observe an 8-working-day standstill", target_date: D(28), basis: "PA2023 s.51 standstill (recommended for call-offs; mandatory for competitive awards)" },
      { step: "Enter the contract; publish a contract details notice within 30 days", target_date: D(40), basis: "PA2023 s.53" },
    ];
    evaluation_matrix = {
      note: "MEAT (most economically advantageous tender) skeleton — set weightings and sub-criteria to your requirement and publish them in the invitation. Placeholder weightings to complete:",
      criteria: [
        { criterion: "Quality / technical merit", weighting_pct: "<<e.g. 50>>", sub_criteria: ["<<approach>>", "<<team / capability>>", "<<service levels>>"] },
        { criterion: "Social value", weighting_pct: "<<e.g. 10>>", sub_criteria: ["<<NPPS priority outcomes>>"] },
        { criterion: "Price / whole-life cost", weighting_pct: "<<e.g. 40>>", sub_criteria: ["<<pricing model>>"] },
      ],
      scoring_scale: "Define a scale (e.g. 0–5) with descriptors per score, and the price↔quality trade-off (e.g. lowest-price-per-quality-point or weighted scoring).",
    };
    specification_outline = ["Background & objectives", "Scope & detailed requirements / outcomes", "Service levels & KPIs", "Award criteria & weightings (publish in the ITT)", "Form of contract & duration", "Pricing schedule / response format", "Implementation & exit"];
    compliance_checklist.push(
      "Invite all in-scope appointed suppliers and treat them equally; publish the award criteria and weightings up front.",
      "Observe an 8-working-day standstill after issuing award decision notices before signing (PA2023 s.51).",
      exclusionStep, kpiStep, socialValueStep,
      "On a DPS / dynamic market you CANNOT direct-award — a further competition is required.",
      "A GPC card / marketplace billing is a settlement mechanism, never the route.",
    );
  }

  return {
    scaffolding_only: "⚠ This is editable SCAFFOLDING to help you START the procurement documents — NOT the documents themselves, NOT legal advice, and NOT the authority of record. Every <<placeholder>> must be completed and reviewed by the responsible commercial/legal owner against the framework's own call-off rules and PA2023. Dates are working-day estimates from today and exclude bank holidays — adjust to your timetable.",
    requirement: a.need ?? null,
    chosen_route: route,
    route_options_available: { direct_call_off_no_further_competition: hasDirectCalloff, further_competition: hasFurtherComp },
    instrument: { name: inst.name, rm_reference: inst.rm_reference, lifecycle_status: inst.lifecycle_status, expires_on: inst.expires_on, official_url: inst.official_url },
    procurement_timetable: timetable,
    evaluation_matrix,
    specification_outline,
    ...route_specific,
    compliance_checklist,
    procurement_act_2023: cp.procurement_act_2023,
  };
}

// Real-award price distribution for a CPV (by channel).
async function capBenchmark(a: A) {
  const kw = a.keyword ? `%${a.keyword.toLowerCase()}%` : null;
  const sql = `
    WITH f AS (SELECT award_amount, channel FROM ${tableRef("tender_award")}
      WHERE cpv_division = @cpv AND award_amount BETWEEN 0 AND 100000000
        AND (@kw IS NULL OR LOWER(buyer_name) LIKE @kw OR LOWER(supplier_name) LIKE @kw))
    SELECT IFNULL(channel,'ALL') AS channel, COUNT(*) AS award_count,
           ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(25)]) AS p25_gbp,
           ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(50)]) AS median_gbp,
           ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(75)]) AS p75_gbp,
           ROUND(AVG(award_amount)) AS mean_gbp
    FROM f GROUP BY ROLLUP(channel) HAVING COUNT(*) > 0
    ORDER BY channel IS NULL DESC, award_count DESC`;
  const rows = await runQuery(sql, { params: { cpv: a.cpv, kw }, types: { cpv: "STRING", kw: "STRING" } });
  if (!rows.length) throw new BadInput("UNKNOWN", `No GBP awards found for CPV '${a.cpv}'.`);
  return { cpv: a.cpv, distribution: rows.map((r) => deep(r)) };
}

// Head-to-head route comparison (speed × competition × supplier depth × runway × real price).
async function capCompare(a: A) {
  const toks = tokenize(a.need);
  if (!toks.length) throw new BadInput("INVALID_QUERY", "Describe the need, e.g. 'managed SOC' or 'cloud hosting'.");
  const candSql = `
    SELECT i.instrument_id, i.name, i.rm_reference, i.type, i.official_url, i.expires_on, o.name AS operator,
           DATE_DIFF(i.expires_on, CURRENT_DATE(), MONTH) AS expiry_runway_months,
           (SELECT COUNT(DISTINCT a.supplier_id) FROM ${tableRef("appointed_supplier")} a WHERE a.instrument_id = i.instrument_id) AS official_suppliers,
           (SELECT COUNT(DISTINCT om.supplier_crn) FROM ${tableRef("observed_membership")} om WHERE om.rm_reference = i.rm_reference) AS observed_suppliers,
           EXISTS(SELECT 1 FROM ${tableRef("award_mechanic")} am WHERE am.instrument_id = i.instrument_id AND am.permitted AND am.mechanic='call_off_no_further_competition') AS direct_calloff_available,
           EXISTS(SELECT 1 FROM ${tableRef("award_mechanic")} am WHERE am.instrument_id = i.instrument_id AND am.permitted AND am.mechanic='further_competition') AS further_competition_available,
           ${RM_SCORE} AS match_score
    FROM ${tableRef("instrument")} i JOIN ${tableRef("operator")} o USING (operator_id)
    WHERE i.lifecycle_status = 'live_for_call_off' AND ${RM_WHERE}
    ORDER BY match_score DESC, (official_suppliers + observed_suppliers) DESC, i.name LIMIT @lim`;
  const [cand, bench] = await Promise.all([
    runQuery(candSql, { params: { toks, generic: GENERIC, lim: a.limit ?? 6 }, types: { toks: ["STRING"], generic: ["STRING"] } }),
    a.cpv ? runQuery(`SELECT ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(50)]) median, COUNT(*) n
        FROM ${tableRef("tender_award")} WHERE cpv_division=@cpv AND channel IN ('framework_call_off','dps_call_off') AND award_amount BETWEEN 0 AND 100000000`,
      { params: { cpv: a.cpv }, types: { cpv: "STRING" } }) : Promise.resolve([]),
  ]);
  if (!cand.length) throw new BadInput("UNKNOWN", `No live routes matched '${a.need}'.`);
  const price = (bench as Record<string, unknown>[])[0];
  const routes = ((cand as Record<string, unknown>[]).map(deep) as Record<string, unknown>[]).map((r) => {
    const direct = !!r.direct_calloff_available, fc = !!r.further_competition_available;
    const depth = Number(r.official_suppliers ?? 0) + Number(r.observed_suppliers ?? 0);
    const runway = r.expiry_runway_months == null ? null : Number(r.expiry_runway_months);
    const speed = direct ? "fast — direct call-off permitted (no further competition)" : fc ? "moderate — further competition required" : "unknown — no award mechanic on record";
    const flags: string[] = [];
    if (runway != null && runway <= 6) flags.push(`⏳ expires in ~${runway} months — act now or pick a longer-runway route`);
    if (depth === 0) flags.push("no supplier list on record (official or observed) — verify membership before relying on it");
    return {
      instrument: r.name, rm_reference: r.rm_reference, type: r.type, operator: r.operator, official_url: r.official_url,
      speed, competition_required: !direct && fc, direct_calloff_available: direct,
      supplier_depth: { official: Number(r.official_suppliers ?? 0), observed_from_awards: Number(r.observed_suppliers ?? 0), total: depth },
      expiry_runway_months: runway,
      rationale: `${speed}; ${depth} supplier(s) on record${runway != null ? `; ~${runway} months' runway` : ""}.`,
      flags,
    };
  });
  return {
    ranked_by: "relevance, then supplier depth",
    indicative_price: price && price.n ? { median_gbp: price.median, sample_size: price.n, cpv: a.cpv, note: "real median call-off £ for this CPV division (a range, not a quote)" } : { note: "pass a `cpv` division (e.g. '72'=IT) for a real-award price benchmark" },
    routes,
  };
}

// The opinionated buyer brief: recommended route + shortlist (reuses capServices) + price + pipeline + checklist.
async function capPlan(a: A) {
  if (!tokenize(a.need || "").length) throw new BadInput("INVALID_QUERY", "Describe the need, e.g. 'cloud hosting for a Django app'.");
  const cpv = a.cpv ?? null; const kw = `%${a.need.toLowerCase()}%`;
  const sv = await capServices({ need: a.need, limit: 3, semantic: false });
  const shortlist = (sv.services as Record<string, any>[]);
  if (!shortlist.length) throw new BadInput("UNKNOWN", `No catalogue listing matched '${a.need}'. Try a broader need or rephrase, or use research/sql.`);
  const iid = String(shortlist[0].instrument_id ?? "g-cloud-14");
  const [benchRows, pipeRows, mechRows] = await Promise.all([
    runQuery(`SELECT ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(25)]) p25, ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(50)]) median,
        ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(75)]) p75, COUNT(*) n
      FROM ${tableRef("tender_award")} WHERE @cpv IS NOT NULL AND cpv_division=@cpv AND channel IN ('framework_call_off','dps_call_off') AND award_amount BETWEEN 0 AND 100000000`,
      { params: { cpv }, types: { cpv: "STRING" } }),
    runQuery(`SELECT buyer_name, title, ROUND(estimated_value) AS estimated_value, CAST(expected_date AS STRING) AS expected_date, official_url
      FROM ${tableRef("pipeline_notice")} WHERE expected_date >= CURRENT_TIMESTAMP() AND (@cpv IS NULL OR cpv_division=@cpv) AND hay LIKE @kw ORDER BY expected_date LIMIT 3`,
      { params: { cpv, kw }, types: { cpv: "STRING", kw: "STRING" } }),
    runQuery(`SELECT i.name, i.rm_reference, CAST(i.expires_on AS STRING) AS expires_on, i.official_url, i.lifecycle_status,
        ARRAY_AGG(am.mechanic ORDER BY CASE WHEN am.mechanic='call_off_no_further_competition' THEN 1 ELSE 2 END LIMIT 1)[SAFE_OFFSET(0)] AS top_mechanic
      FROM ${tableRef("instrument")} i
      LEFT JOIN ${tableRef("award_mechanic")} am ON am.instrument_id = i.instrument_id AND am.permitted
      WHERE i.instrument_id=@iid
      GROUP BY i.name, i.rm_reference, i.expires_on, i.official_url, i.lifecycle_status LIMIT 1`,
      { params: { iid }, types: { iid: "STRING" } }),
  ]);
  const mech = (mechRows.map((r) => deep(r) as Record<string, unknown>)[0]) ?? {};
  const b = (benchRows.map((r) => deep(r) as Record<string, unknown>)[0]) ?? {};
  const anyExcluded = shortlist.some((s) => s.exclusion_status || s.supplier_debarred);
  const residencyNote = dataResidencyNote(a.need);
  return {
    summary: `For "${a.need}": the recommended route is to call off the best-fit listing on ${mech.name ?? iid} (${mech.top_mechanic ?? "per the framework's mechanic"}).${anyExcluded ? " ⚠ A shortlisted supplier carries a PA2023 exclusion flag (insolvency or s.62 debarment) — see below." : ""}`,
    ...(residencyNote ? { data_residency_note: residencyNote } : {}),
    recommended_route: { instrument: mech.name ?? null, instrument_id: iid, rm_reference: mech.rm_reference ?? null, mechanic: mech.top_mechanic ?? null, lifecycle_status: mech.lifecycle_status ?? null, expires_on: mech.expires_on ?? null, official_url: mech.official_url ?? null },
    indicative_price: b.n ? { p25_gbp: b.p25, median_gbp: b.median, p75_gbp: b.p75, sample_size: b.n, note: `from ${b.n} comparable CPV-${cpv} call-off awards (real spend; a range, not a quote)` } : { note: "pass a `cpv` division (e.g. '72'=IT) for a real-award price benchmark" },
    shortlisted_services: shortlist.map((s, i) => ({ rank: i + 1, name: s.name, supplier: s.supplier_name, catalogue: s.catalogue, url: s.url, ch_url: s.ch_url,
      track_record: s.supplier_public_calloff_gbp ? `£${s.supplier_public_calloff_gbp} across ${s.supplier_public_calloffs} public-sector call-offs (CRN-matched)` : "no CRN-matched call-offs on record (absence of evidence, not of capability)",
      exclusion_flag: !!(s.exclusion_status || s.supplier_debarred), exclusion_status: s.exclusion_status ?? null, debarred: !!s.supplier_debarred })),
    pipeline_to_watch: pipeRows.map((r) => deep(r)),
    compliance_checklist: [
      "A framework call-off is NOT a statutory direct award (PA2023 ss.41/43 don't apply to call-offs).",
      "If you run a further competition, observe the 8-working-day standstill after the contract award notice before signing.",
      "Check the s.62 debarment register and exclusion grounds (Sch 6/7) before award; re-check each supplier's LIVE Companies House status.",
      "A GPC card / marketplace billing is a settlement mechanism, NEVER the procurement route, and confers no PA2023 exemption.",
      "Confirm the instrument's live expiry, lot scope and supplier eligibility on the operator's own documentation.",
      ...(residencyNote ? ["Confirm UK/EEA data residency and where any AI inference runs (UK-GDPR) — the listing alone doesn't guarantee it."] : []),
    ],
  };
}

// One instrument: detail + observed-from-awards backfill + coverage.
async function capInstrument(a: A) {
  if (!a.id && !a.rm_reference) throw new BadInput("INVALID_QUERY", "Provide id or rm_reference.");
  const sql = `
    SELECT i.instrument_id, i.name, i.rm_reference, i.type, i.regime, i.lifecycle_status,
           i.starts_on, i.expires_on, i.predecessor_id, i.category_tags, i.official_url,
           o.name AS operator, o.kind AS operator_kind, o.home_url AS operator_url,
           ${LOTS("i")} AS lots, ${MECHANICS("i")} AS award_mechanics, ${DOCS("i")} AS buying_docs,
           ARRAY(SELECT AS STRUCT s.display_name, s.company_number, s.match_band, s.status_at_match, s.ch_url,
                    aps.lot_id, aps.status, aps.appointed_from, aps.last_seen_on, aps.left_on, aps.confidence, aps.conflict
                 FROM ${tableRef("appointed_supplier")} aps JOIN ${tableRef("supplier")} s USING (supplier_id)
                 WHERE aps.instrument_id = i.instrument_id) AS appointed_suppliers,
           iev.ev AS evidence
    FROM ${tableRef("instrument")} i
    JOIN ${tableRef("operator")} o USING (operator_id)
    LEFT JOIN ${EVAGG} iev ON iev.evidence_id = i.evidence_id
    WHERE i.instrument_id = @id OR i.rm_reference = @rm
    ORDER BY CASE WHEN i.instrument_id = @id THEN 0 ELSE 1 END,
             CASE WHEN i.operator_id = 'gca' THEN 0 ELSE 1 END,
             i.instrument_id
    LIMIT 1`;
  const rows = await runQuery(sql, { params: { id: a.id ?? "", rm: a.rm_reference ?? "" } });
  if (!rows.length) throw new BadInput("UNKNOWN_ID", `No instrument for '${a.id ?? a.rm_reference}'. Try the RM reference (e.g. RM1557.14) or buy({need}).`);
  const r = deep(rows[0]) as Record<string, unknown>;
  const suppliers = (r.appointed_suppliers as Record<string, unknown>[]).map((s) => ({ ...s, membership: membership(s) }));
  const mechanics = (r.award_mechanics as unknown[]) ?? [];
  const rm = r.rm_reference as string | null;
  const [obsSup, obsMech] = await Promise.all([
    rm ? runQuery(`SELECT supplier_crn, supplier_name, award_count, total_gbp, CAST(last_award_date AS STRING) AS last_award_date
                   FROM ${tableRef("observed_membership")} WHERE rm_reference = @rm ORDER BY total_gbp DESC LIMIT 30`, { params: { rm }, types: { rm: "STRING" } }) : Promise.resolve([]),
    rm ? runQuery(`SELECT framework_call_off, dps_call_off, direct_award, open_competition, total_awards
                   FROM ${tableRef("observed_mechanic")} WHERE rm_reference = @rm LIMIT 1`, { params: { rm }, types: { rm: "STRING" } }) : Promise.resolve([]),
  ]);
  const observedSuppliers = (obsSup as Record<string, unknown>[]).map(deep);
  // Per-lot supplier membership: appointed_supplier carries lot_id, so roll the appointed list up by lot
  // (joined to the instrument's lots). Lets a buyer see exactly who's appointed to Lot 2, not just the
  // framework as a whole. Suppliers with a NULL lot_id are appointed instrument-wide.
  const lots = (r.lots as Record<string, unknown>[]) ?? [];
  const lotName = new Map(lots.map((l) => [String(l.lot_id), l]));
  const byLot = new Map<string, Record<string, unknown>[]>();
  for (const s of suppliers) {
    const lid = (s as Record<string, unknown>).lot_id;
    const key = lid == null ? "__instrument_wide__" : String(lid);
    (byLot.get(key) ?? byLot.set(key, []).get(key)!).push(s as Record<string, unknown>);
  }
  const suppliersByLot = [...byLot.entries()].map(([lid, sups]) => {
    const l = lid === "__instrument_wide__" ? null : lotName.get(lid);
    return {
      lot_id: lid === "__instrument_wide__" ? null : lid,
      lot_number: l ? l.number ?? null : null,
      lot_title: l ? l.title ?? null : (lid === "__instrument_wide__" ? "Appointed instrument-wide (no lot specified)" : lid),
      supplier_count: sups.length,
      suppliers: sups.map((s) => ({ display_name: s.display_name, company_number: s.company_number, ch_url: s.ch_url, membership: s.membership })),
    };
  }).sort((x, y) => y.supplier_count - x.supplier_count);
  return {
    instrument: { ...r, appointed_suppliers: suppliers },
    suppliers_by_lot: suppliersByLot.length > 1 || (suppliersByLot[0] && suppliersByLot[0].lot_id) ? suppliersByLot : [],
    observed_from_awards: {
      note: "INFERRED from real award notices (658k awards) citing this RM reference — evidence a supplier has actually transacted on it, NOT official appointed-membership. Useful where the official list/mechanic is absent.",
      suppliers: observedSuppliers,
      mechanic_mix: (obsMech as Record<string, unknown>[]).map(deep)[0] ?? null,
    },
    coverage: {
      has_official_supplier_list: suppliers.length > 0,
      has_award_mechanic: mechanics.length > 0,
      has_observed_awards: observedSuppliers.length > 0,
      crn_matched: suppliers.some((s) => (s as Record<string, unknown>).company_number),
      note: "Completeness of govbuy's record for this instrument. A FALSE on the official list/mechanic doesn't mean none exists — it may be login-walled or unpublished; `observed_from_awards` backfills it from real spend.",
    },
  };
}

// One supplier profile (canonical-reconciled footprint + award-evidenced frameworks). NO exclusion (verb adds once).
async function capSupplierProfile(a: A) {
  if (!a.name && !a.crn) throw new BadInput("INVALID_QUERY", "Provide a supplier name or Companies House CRN.");
  const name = a.name ? `%${a.name.toLowerCase()}%` : null;
  const sql = `
    WITH matched AS (
      SELECT s.* FROM ${tableRef("supplier")} s
      WHERE (@name IS NOT NULL AND LOWER(s.display_name) LIKE @name) OR (@crn IS NOT NULL AND s.company_number = @crn)
      ORDER BY (s.company_number IS NOT NULL) DESC, s.match_confidence DESC NULLS LAST
      LIMIT 1),
    ids AS (
      SELECT id AS supplier_id
      FROM matched m
      LEFT JOIN ${tableRef("supplier_crn_canonical")} cc ON cc.company_number = m.company_number
      CROSS JOIN UNNEST(COALESCE(cc.member_supplier_ids, [m.supplier_id])) AS id)
    SELECT m.supplier_id, m.display_name, m.company_number, m.registered_name, m.match_confidence,
           m.match_band, m.status_at_match, m.matched_on, m.ch_url, m.publisher_ids,
           ARRAY(SELECT AS STRUCT rc.channel_type, rc.confidence, rc.evidence_id FROM ${tableRef("reseller_channel")} rc WHERE rc.supplier_id IN (SELECT supplier_id FROM ids)) AS channels,
           ARRAY(SELECT AS STRUCT aps.instrument_id, aps.lot_id, aps.status, aps.last_seen_on, aps.appointed_from, aps.left_on, aps.confidence, aps.conflict
                 FROM ${tableRef("appointed_supplier")} aps WHERE aps.supplier_id IN (SELECT supplier_id FROM ids)) AS appointments,
           ARRAY(SELECT AS STRUCT isc.vendor_name, isc.vendor_company_number, isc.confidence, isc.evidence_id FROM ${tableRef("inbound_scope")} isc WHERE isc.supplier_id IN (SELECT supplier_id FROM ids)) AS inbound_scope,
           (SELECT ARRAY_AGG(supplier_id ORDER BY supplier_id) FROM ids) AS reconciled_supplier_ids
    FROM matched m`;
  const rows = await runQuery(sql, { params: { name, crn: a.crn ?? null }, types: { name: "STRING", crn: "STRING" } });
  if (!rows.length) throw new BadInput("UNKNOWN", `No supplier for '${a.name ?? a.crn}'.`);
  const r = deep(rows[0]) as Record<string, unknown>;
  const appointments = (r.appointments as Record<string, unknown>[]).map((x) => ({ ...x, membership: membership(x) }));
  const reconciledIds = (r.reconciled_supplier_ids as string[]) ?? [];
  const crn = r.company_number as string | null;
  const observed = crn ? await runQuery(`SELECT rm_reference, award_count, total_gbp, CAST(last_award_date AS STRING) AS last_award_date
                    FROM ${tableRef("observed_membership")} WHERE supplier_crn = @crn ORDER BY total_gbp DESC LIMIT 25`,
                   { params: { crn }, types: { crn: "STRING" } }) : [];
  const reconciliation = reconciledIds.length > 1
    ? `Framework footprint reconciled across ${reconciledIds.length} supplier records sharing this Companies House number (ids: ${reconciledIds.join(", ")}) — the GCA spine and the Digital Marketplace directory ingest the same firm under different ids.`
    : undefined;
  const profile = await withEvidence({
    supplier: { ...r, appointments, ...(reconciliation ? { reconciliation } : {}) },
    frameworks_evidenced_by_awards: (observed as Record<string, unknown>[]).map(deep),
  });
  return { ...profile, _crn: crn, _status: r.status_at_match as string | null };
}

// A supplier's CRN-matched delivery record (call-off £, concentration, channel mix, CPV footprint). NO exclusion.
async function capDeliveryRecord(a: A) {
  if (!a.crn && !a.supplier) throw new BadInput("INVALID_QUERY", "Provide a crn or a supplier name.");
  const sup = a.supplier ? `%${a.supplier.toLowerCase()}%` : null;
  const sql = `
    WITH base AS (
      SELECT UPPER(buyer_name) AS buyer, channel, cpv_division, award_amount, contract_end_date, award_date,
             (channel IN ('framework_call_off','dps_call_off') AND award_amount BETWEEN 0 AND 100000000) AS is_co
      FROM ${tableRef("tender_award")}
      WHERE supplier_crn = COALESCE(@crn, (SELECT company_number FROM ${tableRef("supplier")}
             WHERE @sup IS NOT NULL AND LOWER(display_name) LIKE @sup AND company_number IS NOT NULL LIMIT 1)))
    SELECT
      (SELECT ROUND(SUM(award_amount)) FROM base WHERE is_co) AS calloff_gbp,
      (SELECT COUNT(*) FROM base WHERE is_co) AS calloffs,
      (SELECT COUNT(DISTINCT buyer) FROM base WHERE is_co) AS distinct_buyers,
      (SELECT buyer FROM base WHERE is_co GROUP BY buyer ORDER BY SUM(award_amount) DESC LIMIT 1) AS top_buyer,
      (SELECT ROUND(100*MAX(bs)/NULLIF(SUM(bs),0),1) FROM (SELECT SUM(award_amount) bs FROM base WHERE is_co GROUP BY buyer)) AS top_buyer_pct_of_calloff,
      ROUND(100*COUNTIF(channel IN ('framework_call_off','dps_call_off'))/NULLIF(COUNT(*),0),1) AS pct_won_via_framework,
      ROUND(100*COUNTIF(channel='open')/NULLIF(COUNT(*),0),1) AS pct_won_open_competition,
      ROUND(100*COUNTIF(channel='direct')/NULLIF(COUNT(*),0),1) AS pct_direct_award,
      (SELECT STRING_AGG(CONCAT(cpv_division,': £',CAST(ROUND(s/1e6,1) AS STRING),'m'),' | ' ORDER BY s DESC LIMIT 6)
         FROM (SELECT cpv_division, SUM(award_amount) s FROM base WHERE is_co GROUP BY cpv_division)) AS cpv_footprint,
      CAST(MAX(award_date) AS STRING) AS last_award_date,
      CAST(MAX(contract_end_date) AS STRING) AS latest_contract_end
    FROM base`;
  const rows = await runQuery(sql, { params: { crn: a.crn ?? null, sup }, types: { crn: "STRING", sup: "STRING" } });
  const profile = rows.length ? deep(rows[0]) as Record<string, unknown> : {};
  const sinfo = (await runQuery(`SELECT company_number, display_name, ch_url, status_at_match
      FROM ${tableRef("supplier")} WHERE company_number = COALESCE(@crn,
        (SELECT company_number FROM ${tableRef("supplier")} WHERE @sup IS NOT NULL AND LOWER(display_name) LIKE @sup AND company_number IS NOT NULL LIMIT 1)) LIMIT 1`,
    { params: { crn: a.crn ?? null, sup }, types: { crn: "STRING", sup: "STRING" } })).map((x) => deep(x) as Record<string, unknown>)[0] ?? {};
  return { profile, sinfo };
}

// Seller: instruments/live DPS a vendor can join.
async function capInstrumentsToList(a: A) {
  const toks = tokenize(a.product || a.category || "");
  const JOINABLE = `i.type IN ('open_framework','dynamic_market','legacy_dps')`;
  const openClause = a.open_only ? `${JOINABLE} AND i.lifecycle_status = 'live_for_call_off'` : `i.lifecycle_status = 'live_for_call_off'`;
  const sql = `
    SELECT i.instrument_id, i.name, i.rm_reference, i.type, i.lifecycle_status, i.expires_on, i.category_tags, i.official_url,
           o.name AS operator, o.home_url AS operator_url, (${JOINABLE} AND i.lifecycle_status = 'live_for_call_off') AS joinable_now,
           ${LOTS("i")} AS lots,
           ARRAY(SELECT AS STRUCT d.doc_type, d.title, d.url FROM ${tableRef("buying_doc")} d
                 WHERE d.instrument_id = i.instrument_id AND d.doc_type IN ('buyer_guide','required_documents','order_form')) AS how_to_apply,
           iev.ev AS evidence, ${RM_SCORE} AS match_score
    FROM ${tableRef("instrument")} i
    JOIN ${tableRef("operator")} o USING (operator_id)
    LEFT JOIN ${EVAGG} iev ON iev.evidence_id = i.evidence_id
    WHERE ${openClause} AND ${RM_WHERE}
    ORDER BY joinable_now DESC, match_score DESC, i.name LIMIT @lim`;
  const rows = await runQuery(sql, { params: { toks, generic: GENERIC, lim: a.limit ?? 20 }, types: { toks: ["STRING"], generic: ["STRING"] } });
  return rows.map(deep);
}

// Seller: full go-to-market — live opps, forward pipeline, frameworks that pay, incumbents, resellers.
async function capPipeline(a: A) {
  const cpv = a.cpv ?? null;
  const kw = a.need ? `%${a.need.toLowerCase()}%` : null;
  const lim = a.limit ?? 8;
  const callOff = `t.channel IN ('framework_call_off','dps_call_off') AND t.award_amount BETWEEN 0 AND 100000000`;
  const liveSql = `
    SELECT ocid, buyer_name, title, cpv_division, ROUND(estimated_value) AS estimated_value,
           CAST(deadline AS STRING) AS deadline, source, official_url
    FROM ${tableRef("live_opportunity")}
    WHERE (@cpv IS NULL OR cpv_division = @cpv) AND (@kw IS NULL OR hay LIKE @kw)
    ORDER BY deadline LIMIT @lim`;
  const fwSql = `
    WITH fw AS (
      SELECT REGEXP_EXTRACT(UPPER(t.rm_reference), r'RM[0-9]+') AS rm_stem,
             ROUND(SUM(t.award_amount)) AS calloff_gbp, COUNT(*) AS calloffs
      FROM ${tableRef("tender_award")} t
      WHERE ${callOff} AND t.rm_reference IS NOT NULL AND (@cpv IS NULL OR t.cpv_division = @cpv)
      GROUP BY rm_stem)
    SELECT i.rm_reference, i.name AS framework, i.lifecycle_status,
           CAST(i.expires_on AS STRING) AS expires_on, i.official_url, fw.calloff_gbp, fw.calloffs
    FROM fw JOIN ${tableRef("instrument")} i ON REGEXP_EXTRACT(UPPER(i.rm_reference), r'RM[0-9]+') = fw.rm_stem
    QUALIFY ROW_NUMBER() OVER (PARTITION BY fw.rm_stem ORDER BY i.lifecycle_status) = 1
    ORDER BY fw.calloff_gbp DESC LIMIT @lim`;
  const incSql = `
    SELECT ANY_VALUE(t.supplier_name) AS supplier, t.supplier_crn, ANY_VALUE(sup.ch_url) AS ch_url,
           ROUND(SUM(t.award_amount)) AS calloff_gbp, COUNT(*) AS calloffs,
           COUNT(DISTINCT t.buyer_name) AS buyers, CAST(MAX(t.contract_end_date) AS STRING) AS latest_contract_end
    FROM ${tableRef("tender_award")} t
    LEFT JOIN ${tableRef("supplier")} sup ON sup.company_number = t.supplier_crn
    WHERE ${callOff} AND t.supplier_crn IS NOT NULL AND (@cpv IS NULL OR t.cpv_division = @cpv)
    GROUP BY t.supplier_crn ORDER BY calloff_gbp DESC LIMIT @lim`;
  const rslSql = `
    SELECT s.display_name AS reseller, rc.channel_type, s.ch_url
    FROM ${tableRef("reseller_channel")} rc JOIN ${tableRef("supplier")} s ON s.supplier_id = rc.supplier_id
    WHERE rc.channel_type IN ('thin_prime','var','hybrid')
    ORDER BY CASE rc.channel_type WHEN 'thin_prime' THEN 1 WHEN 'hybrid' THEN 2 ELSE 3 END, s.display_name LIMIT @lim`;
  const pipeSql = `
    SELECT buyer_name, title, cpv_division, ROUND(estimated_value) AS estimated_value,
           CAST(expected_date AS STRING) AS expected_date, official_url
    FROM ${tableRef("pipeline_notice")}
    WHERE expected_date >= CURRENT_TIMESTAMP() AND (@cpv IS NULL OR cpv_division = @cpv) AND (@kw IS NULL OR hay LIKE @kw)
    ORDER BY expected_date LIMIT @lim`;
  const wide = { params: { cpv, kw, lim }, types: { cpv: "STRING" as const, kw: "STRING" as const } };
  const [live, frameworks, incumbents, resellers, coming] = await Promise.all([
    runQuery(liveSql, wide), runQuery(fwSql, { params: { cpv, lim }, types: { cpv: "STRING" } }),
    runQuery(incSql, { params: { cpv, lim }, types: { cpv: "STRING" } }), runQuery(rslSql, { params: { lim } }),
    runQuery(pipeSql, wide),
  ]);
  const m = (rs: Record<string, unknown>[]) => rs.map((r) => deep(r));
  return {
    live_opportunities: m(live),
    coming_soon_pipeline: m(coming),
    frameworks_with_real_calloff_spend: m(frameworks),
    incumbents_to_displace: m(incumbents),
    resellers_who_could_carry_you: m(resellers),
  };
}

// Contracts ending within a horizon (buyer re-proc deadlines / seller displacement windows).
async function capExpiry(a: A) {
  const kw = a.keyword ? `%${a.keyword.toLowerCase()}%` : null;
  const sup = a.supplier ? `%${a.supplier.toLowerCase()}%` : null;
  const sql = `
    SELECT buyer_name, supplier_name, supplier_crn, ROUND(award_amount) AS award_gbp,
           CAST(contract_end_date AS STRING) AS contract_end_date,
           DATE_DIFF(contract_end_date, CURRENT_DATE(), MONTH) AS months_to_end,
           rm_reference, channel, official_url
    FROM ${tableRef("tender_award")}
    WHERE contract_end_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL @h MONTH)
      AND award_amount BETWEEN 0 AND 100000000
      AND (@cpv IS NULL OR cpv_division = @cpv)
      AND (@crn IS NULL OR supplier_crn = @crn)
      AND (@sup IS NULL OR LOWER(supplier_name) LIKE @sup)
      AND (@kw IS NULL OR LOWER(CONCAT(IFNULL(buyer_name,''),' ',IFNULL(supplier_name,''))) LIKE @kw)
    ORDER BY contract_end_date, award_gbp DESC LIMIT @lim`;
  const rows = await runQuery(sql, {
    params: { h: a.horizon_months ?? 12, cpv: a.cpv ?? null, crn: a.supplier_crn ?? null, sup, kw, lim: a.limit ?? 20 },
    types: { h: "INT64", cpv: "STRING", crn: "STRING", sup: "STRING", kw: "STRING", lim: "INT64" },
  });
  return rows.map(deep);
}

// Researcher: how money flows + competition health for a CPV.
async function capSpendXray(a: A) {
  const sql = `
    WITH base AS (SELECT channel, supplier_name, award_amount FROM ${tableRef("tender_award")}
      WHERE award_amount BETWEEN 0 AND 100000000 AND (@cpv IS NULL OR cpv_division = @cpv)
        AND published_date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @years * 365 DAY)),
      tot AS (SELECT COUNT(*) n, SUM(award_amount) s, COUNT(DISTINCT supplier_name) sup FROM base),
      ch AS (SELECT channel, COUNT(*) awards, SUM(award_amount) spend FROM base GROUP BY channel),
      top5 AS (SELECT SUM(st) t5 FROM (SELECT SUM(award_amount) st FROM base GROUP BY supplier_name ORDER BY st DESC LIMIT 5))
    SELECT ch.channel, ch.awards, ROUND(ch.spend) AS spend_gbp,
           ROUND(100*ch.spend/NULLIF(tot.s,0),1) AS pct_of_spend,
           tot.n AS total_awards, ROUND(tot.s) AS total_spend_gbp, tot.sup AS distinct_suppliers,
           ROUND(100*top5.t5/NULLIF(tot.s,0),1) AS top5_supplier_share_pct
    FROM ch CROSS JOIN tot CROSS JOIN top5 ORDER BY ch.spend DESC`;
  const rows = await runQuery(sql, { params: { cpv: a.cpv ?? null, years: a.years ?? 3 }, types: { cpv: "STRING" } });
  if (!rows.length) throw new BadInput("UNKNOWN", `No awards for CPV '${a.cpv ?? "(all)"}' in the window.`);
  return { cpv: a.cpv ?? "all", years: a.years ?? 3, channels: rows.map((r) => deep(r)) };
}

async function capSchema() {
  return memo("schema", 600_000, async () => {
    const rows = await runQuery(`SELECT table_name, column_name, data_type FROM \`${config.project}.${config.publicDataset}.INFORMATION_SCHEMA.COLUMNS\` ORDER BY table_name, ordinal_position`);
    const tables: Record<string, { column: unknown; type: unknown }[]> = {};
    for (const r of rows) (tables[r.table_name as string] ??= []).push({ column: r.column_name, type: r.data_type });
    return { dataset: `${config.project}.${config.publicDataset}`, max_bytes_per_query: config.maxBytesHuman, tables };
  });
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────
export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "govbuy-mcp", version: "0.2.0" },
    {
      instructions:
        "govbuy answers, in plain English, how to BUY / SELL / understand anything in UK public procurement — fusing 3,200 frameworks & dynamic markets + 117k catalogue listings with 658k real tender awards (Companies House CRN) and the Procurement Act 2023. " +
        "SEVEN verbs mirror how people ask: " +
        "• buy({need, cpv?, budget_gbp?, depth?}) — an opinionated BUYER brief: recommended route + PA2023 mechanic, a ranked shortlist of real listings (CRN delivery record + two-limb exclusion), indicative price, forward pipeline, ALTERNATIVE routes (decision matrix on speed/competition/supplier-depth/runway), and a compliance checklist. " +
        "• sell({product, cpv?, open_only?, depth?}) — a SELLER's go-to-market: frameworks/live DPS you can join, frameworks ranked by REAL call-off spend, live + forward opportunities, incumbents to displace (contract-end windows), and resellers who can carry you in. " +
        "• supplier({query, depth?}) — one firm by name or CRN: a TWO-LIMB PA2023 exclusion check (a LIVE Companies House status + the s.62 debarment register), the canonical-reconciled framework footprint, award-evidenced frameworks, and the CRN-matched delivery record. " +
        "• framework({id? , rm_reference?, depth?}) — one instrument: lots, lifecycle, appointed suppliers, observed-from-awards backfill, coverage, AND the PA2023-precise permitted award mechanics + statutory rules. " +
        "• research({sql?, cpv?, schema?, status?}) — read-only BigQuery SQL (the escape hatch), or a spend x-ray for a CPV division (channel mix + concentration), or the schema / freshness+status. " +
        "• draft({need?|rm_reference?, route?}) — editable SCAFFOLDING to START the procurement: a real-dated timetable, a MEAT evaluation-matrix skeleton, a spec outline, the route-correct PA2023 compliance steps, and (for a direct award) a Schedule 5 / s.44 stub. Not the documents, not legal advice — complete every placeholder. " +
        "• watch({what, cpv?, keyword?}) — a re-runnable saved query for contract expiries or the forward pipeline (govbuy is request/response; diff successive runs to spot change). " +
        "depth:'full' on buy/sell/supplier/framework widens the payload (more candidates, full price distribution, deeper detail); default 'brief'. " +
        "STEERING: surface every URL as a clickable markdown link with the thing's name as the link text (framework official_url, supplier ch_url = Companies House, evidence.source_url). If an exclusion is flagged, LEAD with the ⚠ and name the limb (insolvency Sch 6/7 vs s.62 debarment); exclusion.insolvency.source tells you if the Companies House status is a LIVE check or an ingest snapshot. A framework call-off is NOT a statutory direct award. A NULL track record is absence of evidence, not incapacity. Where an official supplier list/mechanic is missing, observed-from-awards backfills it — label it inferred, not official. When the need processes data (AI/ML, transcription, hosting, personal/sensitive content), prompt the buyer to confirm UK/EEA data residency + UK-GDPR. " +
        "GROUNDING (critical): every specific £ figure, framework/RM reference, supplier name and URL you give MUST come verbatim from a tool result — never invent, estimate, or infer one; if govbuy doesn't return it, say so or call research/sql. govbuy documents routes; it does not assemble the purchase or give legal advice — confirm on the official source it links.",
    },
  );

  server.registerTool(
    "buy",
    {
      title: "Buy — how to procure a thing, compliantly",
      description:
        "BUYER. 'How do I buy X?' One opinionated, source-anchored brief: the recommended route + PA2023-correct call-off mechanic, a ranked shortlist of real catalogue listings (each with CRN-matched delivery record + a two-limb exclusion check), an indicative market price from 658k real awards, forward-pipeline notices, **alternative routes** (a decision matrix on speed / competition / supplier-depth / expiry-runway / real price), and a compliance checklist. `depth:'full'` adds the full candidate-route list, the by-channel price distribution, and the PA2023 mechanic detail. Absorbs find_routes / find_services / compliant_path / plan_buy / compare_routes / benchmark_price. Anti-patterns: keep every caveat; never drop an exclusion ⚠ or the standstill note; cite the listing + framework URLs; a NULL track record is absence of evidence, not incapacity.",
      inputSchema: { need: z.string(), cpv: z.string().optional(), budget_gbp: z.number().optional(), depth: z.enum(["brief", "full"]).default("brief") },
    },
    guard(async (a) => {
      const full = a.depth === "full";
      const [coreRes, alt] = await Promise.all([
        capPlan(a).then((v) => ({ ok: true as const, v })).catch((e) => ({ ok: false as const, e })),
        capCompare({ need: a.need, cpv: a.cpv, limit: full ? 8 : 4 }).catch(() => null),
      ]);
      // Catalogue-listing-led brief (capPlan). But some needs have a ROUTE with no catalogue service rows
      // (e.g. a DPS like YPO Drones, or any framework-only buy) — capPlan throws "no listing". Fall back to
      // a ROUTE-first brief from the comparison so buy always answers with the framework + mechanic.
      let core: Record<string, unknown>;
      if (coreRes.ok) {
        core = coreRes.v;
      } else {
        const top = (alt?.routes ?? [])[0] as A | undefined;
        if (!top) throw coreRes.e;
        const cp = await capCompliantPath({ rm_reference: top.rm_reference ?? undefined }).catch(() => null);
        core = {
          summary: `For "${a.need}": no catalogue listing matched, but the fitting route is ${top.instrument} (${top.rm_reference ?? "see official_url"}) — ${top.speed}.`,
          recommended_route: { instrument: top.instrument, rm_reference: top.rm_reference, mechanic: top.direct_calloff_available ? "call_off_no_further_competition" : "further_competition", official_url: top.official_url, expiry_runway_months: top.expiry_runway_months },
          ...(cp ? { procurement_act_2023: cp.procurement_act_2023, award_mechanics: cp.award_mechanics } : {}),
          shortlisted_services: [],
          note_on_listings: "No catalogue service listing matched this need — common for DPS / framework-only routes. Suppliers may still be appointed (see framework() for the appointed list, or the route's official_url).",
          compliance_checklist: [
            "A framework/DPS call-off is NOT a statutory direct award (PA2023 ss.41/43 don't apply to call-offs).",
            "On a DPS you cannot direct-award — run a further competition (competitive flexible procedure).",
            "If you run a further competition, observe the 8-working-day standstill after the contract award notice before signing.",
            "Check the s.62 debarment register + exclusion grounds (Sch 6/7) before award; re-check each supplier's LIVE Companies House status.",
            "A GPC card / marketplace billing is a settlement mechanism, NEVER the procurement route.",
          ],
        };
      }
      const payload: Record<string, unknown> = { ...core, alternative_routes: alt?.routes ?? [] };
      if (full) {
        const iid = (core.recommended_route as A)?.instrument_id;
        const [routes, dist, compliance, listings] = await Promise.all([
          capRoutes({ need: a.need, cpv: a.cpv, limit: 12 }).catch(() => null),
          a.cpv ? capBenchmark({ cpv: a.cpv }).catch(() => null) : Promise.resolve(null),
          iid ? capCompliantPath({ instrument_id: iid }).catch(() => null) : Promise.resolve(null),
          // Wider catalogue search incl. SEMANTIC (vector) matching — best-effort, so a slow/blocked
          // embedding never breaks the brief; the keyword shortlist above is always present.
          capServices({ need: a.need, limit: 8 }).catch(() => null),
        ]);
        if (routes) payload.route_candidates = routes.routes;
        if (dist) payload.price_distribution = dist.distribution;
        if (compliance) payload.compliance_detail = { award_mechanics: compliance.award_mechanics, buying_documents: compliance.buying_documents, procurement_act_2023: compliance.procurement_act_2023 };
        if (listings) payload.catalogue_listings = listings.services;
      }
      payload.note = "An opinionated, INDICATIVE buying brief from the catalogue + 658k real awards + PA2023. It recommends a route but is not legal/commercial advice, not the authority of record — you run the assessment. " + NOT_ADVICE;
      payload.display_guidance = "Present as a brief: the recommended route + mechanic; the shortlisted listings (link each url + ch_url, show the CRN track record, LEAD any exclusion ⚠); the indicative price range; alternative_routes as a compact comparison (speed/competition/depth/runway); forward pipeline; then the compliance checklist verbatim. " + DISPLAY_GUIDANCE;
      return ok(withFreshness(payload, await freshness()));
    }),
  );

  server.registerTool(
    "sell",
    {
      title: "Sell — a vendor's route to market",
      description:
        "SELLER. 'How do I sell X to the public sector / get on a framework?' Fuses catalogue/framework data with 658k real awards: frameworks & live DPS you can JOIN (a DPS stays open to new suppliers throughout its life), frameworks ranked by REAL call-off spend (join the ones that actually pay), LIVE opportunities to bid + the FORWARD pipeline (planned, 6-18 months out), incumbents holding the spend + when their contracts END (your displacement window), and resellers/thin-primes who could carry you in faster than direct appointment. Pass a `product`/keyword and ideally a `cpv` division (2-digit: 72=IT, 48=software, 30=computing equipment, 35=security, 45=construction, 71=engineering, 79=business services, 85=health, 80=education, 90=environmental). Absorbs find_instruments_to_list / supplier_pipeline / list_resellers / contract_expiry_radar. Anti-patterns: verify each notice on its official_url; a closed framework is not immediately joinable.",
      inputSchema: { product: z.string().optional(), cpv: z.string().optional(), open_only: z.boolean().default(true), depth: z.enum(["brief", "full"]).default("brief") },
    },
    guard(async (a) => {
      if (!a.product && !a.cpv) throw new BadInput("INVALID_QUERY", "Provide a product/keyword and/or a cpv division (e.g. product='thermal cameras', cpv='35').");
      const full = a.depth === "full";
      const [joinable, pipeline, displacement] = await Promise.all([
        capInstrumentsToList({ product: a.product, open_only: a.open_only, limit: full ? 20 : 8 }),
        capPipeline({ cpv: a.cpv, need: a.product, limit: full ? 12 : 8 }),
        capExpiry({ cpv: a.cpv, keyword: a.product, horizon_months: 18, limit: full ? 25 : 10 }),
      ]);
      return ok(withFreshness({
        frameworks_you_can_join: joinable,
        ...pipeline,
        contracts_expiring_to_displace: displacement,
        note: "A supplier's full route to market, fusing govbuy's frameworks/resellers with real tender awards. `frameworks_with_real_calloff_spend` ranks routes by money that actually flowed; `frameworks_you_can_join` are open frameworks / live DPS; `coming_soon_pipeline` = PLANNED procurements (prepare ahead); `contracts_expiring_to_displace` = specific incumbent contracts ending (your window). Verify each notice on its official_url. " + NOT_ADVICE,
        display_guidance: "Lead with what's actionable now — live opportunities (link official_url) and the 2-3 frameworks with the most real call-off spend (flag lifecycle + expiry). Then where to JOIN (open frameworks / live DPS), the FORWARD pipeline as bid-prep, the incumbents + contract-end displacement windows, and the thin-primes/VARs (ch_url) as a faster way in. " + DISPLAY_GUIDANCE,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "supplier",
    {
      title: "Supplier — exclusion check + delivery record",
      description:
        "BUYER/RESEARCHER. One firm by name or Companies House CRN. Returns a TWO-LIMB PA2023 **exclusion check** — (a) insolvency Sch 6/7 via a **LIVE Companies House status** lookup where available (else the ingest snapshot, labelled), and (b) the **s.62 debarment register** — plus the canonical-reconciled framework footprint (the firm's full set even when the GCA spine and Digital Marketplace hold it under different ids), `frameworks_evidenced_by_awards` (RMs it has really won call-offs under), the channel type (thin-prime/VAR), and the CRN-matched delivery record (call-off £, customer concentration, competitive-vs-direct mix, CPV footprint, contract-end dates). Absorbs get_supplier / due_diligence. Anti-patterns: if exclusion.flagged, LEAD with the ⚠ and name the limb; a NULL track record is absence of evidence, not incapacity.",
      inputSchema: { query: z.string(), depth: z.enum(["brief", "full"]).default("brief") },
    },
    guard(async (a) => {
      const looksCrn = /^[A-Z]{0,2}[0-9]{6,8}$/i.test(a.query.trim());
      const profile = await capSupplierProfile(looksCrn ? { crn: a.query.trim() } : { name: a.query });
      const crn = (profile as A)._crn as string | null;
      // One live Companies House read (shared by the exclusion gate + lens) and the credential-free bulk
      // profile (whole-population), so the size/locality lens works even without a live key.
      const [live, bulk] = await Promise.all([liveChProfile(crn), bulkProfile(crn)]);
      const [exclusion, delivery] = await Promise.all([
        exclusionFor(crn, (profile as A)._status as string | null, live),
        crn || !looksCrn ? capDeliveryRecord(crn ? { crn } : { supplier: a.query }).catch(() => ({ profile: {}, sinfo: {} })) : Promise.resolve({ profile: {}, sinfo: {} }),
      ]);
      const p = { ...profile } as Record<string, unknown>;
      delete p._crn; delete p._status;
      const lens = procurementLens(live, bulk);
      return ok(withFreshness({
        ...p,
        exclusion,
        ...(lens ? { size_and_locality: lens } : {}),
        delivery_record: (delivery as A).profile,
        note: "One supplier: a two-limb PA2023 exclusion check (live Companies House insolvency + s.62 debarment), the canonical-reconciled framework footprint, award-evidenced frameworks, and the CRN-matched delivery record (call-off channels, £ ceiling outliers removed). top_buyer_pct_of_calloff >50% = single-customer risk; high pct_direct_award = wins by direct award not competition. NULL/absent = no matched awards, not proof of incapacity. " + NOT_ADVICE,
        display_guidance: "If exclusion.flagged, LEAD with the ⚠ and state the limb (insolvency Sch 6/7 vs s.62 debarment); exclusion.insolvency.source = live_companies_house means checked live just now, else re-check. Then the framework footprint + frameworks_evidenced_by_awards (RMs really won), then the delivery record (£ won, concentration, competitive-vs-direct). When size_and_locality is present, report sme_likely (with its accounts-category basis) and the registered-office region as Companies-House signals — never assert SME status definitively, and treat social value as a PA2023 duty to evidence, not a supplier attribute. Always link ch_url. " + DISPLAY_GUIDANCE,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "framework",
    {
      title: "Framework — one instrument + how to call it off",
      description:
        "One framework / dynamic market by `id` or `rm_reference`. Returns lots, lifecycle + expiry, appointed suppliers (each with a membership qualifier + evidence), `observed_from_awards` (suppliers/mechanics inferred from real award notices where the official list is absent — labelled inferred, not official), a `coverage` completeness signal, AND the PA2023-precise call-off path: permitted award mechanics + conditions, the statutory rules (competitive flexible procedure, 8-working-day standstill, Schedule 5 grounds, the DPS→dynamic-market sunset, the >£5m KPI duty, payment-method-blind), and that a framework call-off is NOT a statutory direct award. RM lookups return the canonical GCA agreement. Absorbs get_instrument / compliant_path.",
      inputSchema: { id: z.string().optional(), rm_reference: z.string().optional(), depth: z.enum(["brief", "full"]).default("brief") },
    },
    guard(async (a) => {
      if (!a.id && !a.rm_reference) return toolError("INVALID_QUERY", "Provide id or rm_reference (e.g. 'g-cloud-14' or 'RM1557.14').");
      const [detail, cp] = await Promise.all([
        capInstrument(a),
        capCompliantPath({ instrument_id: a.id, rm_reference: a.rm_reference }).catch(() => null),
      ]);
      return ok(withFreshness({
        ...detail,
        procurement_act_2023: cp?.procurement_act_2023 ?? null,
        payment_caveats: cp?.payment_caveats ?? [],
        note: NOT_ADVICE,
        display_guidance: "Show appointed_suppliers as the official list. When it's empty or coverage.has_observed_awards is true, present observed_from_awards.suppliers as 'suppliers seen winning call-offs on this RM in real awards (inferred, not official)'. Lead the call-off with the permitted mechanic (call_off_no_further_competition is fastest; else further_competition) and the PA2023 reality: a framework call-off is NOT a statutory direct award; a further competition needs an 8-working-day standstill; a GPC card/marketplace is never a route. Link official_url + document URLs; flag near expiry. " + DISPLAY_GUIDANCE,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "research",
    {
      title: "Research — SQL, spend x-ray, schema & status",
      description:
        "RESEARCHER. The power-user surface over the whole corpus. `sql` runs a single read-only BigQuery SELECT/WITH over govbuy_public (byte-capped). `cpv` returns a spend & competition x-ray for that CPV division (channel mix: framework vs open vs direct, % of spend, distinct suppliers, top-5 concentration). `schema:true` returns tables/columns for writing SQL; `status:true` (or no args) returns per-source freshness/health + the harness cost & spend coverage. Absorbs query_sql / spend_xray / get_schema / get_status. Anti-patterns: SQL is SELECT-only and capped — aggregate/filter to stay under it; CPV is a 2-digit division, not a full code.",
      inputSchema: { sql: z.string().optional(), cpv: z.string().optional(), years: z.number().int().min(1).max(10).optional(), schema: z.boolean().optional(), status: z.boolean().optional() },
    },
    guard(async (a) => {
      if (a.sql) {
        const g = validateReadOnlySql(a.sql);
        if (!g.ok) return toolError(g.code, g.message);
        const bytes = await dryRunBytes(g.sql);
        if (bytes > Number(config.maxBytesBilled)) return toolError("CAP_EXCEEDED", `Query would scan ~${(bytes / 1024 / 1024).toFixed(0)} MB; cap is ${config.maxBytesHuman}.`, "Add filters or aggregate.");
        const rows = await runQuery(g.sql);
        return ok({ estimated_bytes: bytes, row_count: rows.length, rows: rows.slice(0, 1000).map(deep) });
      }
      if (a.cpv !== undefined || a.years !== undefined) {
        const xray = await capSpendXray({ cpv: a.cpv, years: a.years });
        return ok(withFreshness({ ...xray, note: "Real spend split by procurement channel over the window (£ ceiling outliers >£100m removed). High framework/DPS % = spend flows through frameworks; high direct % = less competition. top5_supplier_share_pct is market concentration. " + NOT_ADVICE, display_guidance: "Lead with the channel split, then competition health from top5_supplier_share_pct and distinct_suppliers. " + DISPLAY_GUIDANCE }, await freshness()));
      }
      if (a.schema) return ok(await capSchema());
      return ok(await freshness());
    }),
  );

  server.registerTool(
    "draft",
    {
      title: "Draft — scaffolding for the procurement documents",
      description:
        "BUYER. 'Help me actually run this.' Turns a chosen route into editable SCAFFOLDING you start from: a real-dated procurement timetable (working days from today), a MEAT evaluation-matrix skeleton (criteria + placeholder weightings), a specification outline, the route-correct PA2023 compliance checklist, and — for a statutory direct award — a Schedule 5 justification scaffold + s.44 transparency-notice fields. Give a `need` (it picks the fitting route) or an `rm_reference`/`instrument_id`; optionally force `route` ('framework_call_off' = direct call-off, 'further_competition', or 'direct_award'). It composes the same PA2023-precise mechanic as framework(). NOT legal advice and NOT the documents — every <<placeholder>> must be completed and reviewed; dates exclude bank holidays. Anti-patterns: never present a direct award as the default; never call a framework call-off a statutory direct award; keep the scaffolding_only banner.",
      inputSchema: { need: z.string().optional(), rm_reference: z.string().optional(), instrument_id: z.string().optional(), route: z.enum(["framework_call_off", "further_competition", "direct_award"]).optional(), budget_gbp: z.number().optional(), depth: z.enum(["brief", "full"]).default("brief") },
    },
    guard(async (a) => {
      const draft = await capDraft(a);
      return ok(withFreshness({
        ...draft,
        note: "Editable scaffolding to START the procurement, composed from the framework's PA2023-precise mechanic + statutory rules. " + NOT_ADVICE,
        display_guidance: "LEAD with the scaffolding_only banner and the chosen_route. Present the timetable as a dated list, the evaluation_matrix as a table (flag every <<placeholder>>), then the specification outline and the compliance checklist verbatim. For a direct award, foreground the Schedule 5 justification scaffold and that it's the exception. Link the instrument's official_url. " + DISPLAY_GUIDANCE,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "watch",
    {
      title: "Watch — a re-runnable saved query for changes",
      description:
        "BUYER/SELLER. 'Tell me when X changes.' Returns the CURRENT matches plus a `saved_query` block — the exact verb + arguments to re-run on a schedule, and what to diff against last time — so an assistant can poll it. `what:'expiry'` = contracts ending within a horizon (re-procurement deadlines / displacement windows); `what:'pipeline'` = forward planned-procurement notices. Filter by `cpv` (2-digit division), `keyword`, `supplier`, `horizon_months`. MCP is request/response, so this is a saved query to re-run, not a push subscription.",
      inputSchema: { what: z.enum(["expiry", "pipeline"]), cpv: z.string().optional(), keyword: z.string().optional(), supplier: z.string().optional(), horizon_months: z.number().int().min(1).max(36).optional() },
    },
    guard(async (a) => {
      const horizon = a.horizon_months ?? 12;
      const results = a.what === "expiry"
        ? await capExpiry({ cpv: a.cpv, keyword: a.keyword, supplier: a.supplier, horizon_months: horizon, limit: 30 })
        : (await capPipeline({ cpv: a.cpv, need: a.keyword, limit: 30 })).coming_soon_pipeline;
      return ok(withFreshness({
        what: a.what,
        current_matches: results,
        match_count: Array.isArray(results) ? results.length : 0,
        saved_query: {
          rerun_tool: a.what === "expiry" ? "sell or watch" : "sell or watch",
          rerun_with: { tool: "watch", arguments: { what: a.what, cpv: a.cpv ?? null, keyword: a.keyword ?? null, supplier: a.supplier ?? null, horizon_months: horizon } },
          how_to_detect_change: a.what === "expiry"
            ? "Re-run on a cadence (e.g. weekly). New rows that weren't present last time are newly-surfaced expiries; rows whose months_to_end has dropped are getting urgent."
            : "Re-run on a cadence. New buyer_name/title rows are freshly-published planned procurements to prepare a bid for.",
          cadence_suggestion: a.what === "expiry" ? "weekly" : "fortnightly",
        },
        note: "A saved, re-runnable query (govbuy is request/response — there is no push). Compare successive runs to spot what changed. " + NOT_ADVICE,
        display_guidance: "Show the current matches (link each official_url), then state the saved_query plainly so the user can re-run it on the suggested cadence. " + DISPLAY_GUIDANCE,
      }, await freshness()));
    }),
  );

  // ── MCP prompts: curated, one-click workflows the host can surface to users ──
  server.registerPrompt("compliant-buy",
    { title: "Compliant buy brief", description: "Produce a full, source-anchored buying brief for a need: route, mechanic, shortlist, price, exclusions, alternatives, compliance.", argsSchema: { need: z.string(), cpv: z.string().optional() } },
    ({ need, cpv }) => ({ messages: [{ role: "user", content: { type: "text", text: `Using the govbuy tools, give me a compliant buying brief for: "${need}".${cpv ? ` Use CPV division ${cpv}.` : ""} Call buy({need${cpv ? ", cpv" : ""}, depth:"full"}); LEAD with the recommended route + PA2023 mechanic, then the ranked shortlist (link each listing + Companies House URL, show the CRN-matched track record, and LEAD any exclusion ⚠), the indicative price range, the alternative routes as a comparison, the forward pipeline, and the compliance checklist verbatim. Then offer to draft({need}) the procurement scaffolding. Every £/RM/supplier/URL must come verbatim from a tool result.` } }] }),
  );
  server.registerPrompt("due-diligence",
    { title: "Supplier due diligence", description: "Run the two-limb PA2023 exclusion check + delivery record + size/locality lens on a supplier before award.", argsSchema: { supplier: z.string() } },
    ({ supplier }) => ({ messages: [{ role: "user", content: { type: "text", text: `Run pre-award due diligence on "${supplier}" using the govbuy supplier() tool. If exclusion.flagged, LEAD with the ⚠ and name the limb (insolvency Sch 6/7 vs s.62 debarment). Then report the canonical framework footprint, the frameworks evidenced by real awards, the CRN-matched delivery record (call-off £, customer concentration, competitive-vs-direct mix), and the size_and_locality lens (sme_likely with its basis, registered-office region) — as Companies House signals, never a definitive SME claim. Link the Companies House record.` } }] }),
  );
  server.registerPrompt("market-entry",
    { title: "Seller market-entry plan", description: "For a vendor: which frameworks/DPS to join, what pays, live + forward opportunities, incumbents to displace, resellers to carry you in.", argsSchema: { product: z.string(), cpv: z.string().optional() } },
    ({ product, cpv }) => ({ messages: [{ role: "user", content: { type: "text", text: `I sell "${product}". Using govbuy sell({product${cpv ? ", cpv" : ""}, depth:"full"})${cpv ? ` with CPV division ${cpv}` : ""}, build my route-to-market: the frameworks & live DPS I can JOIN now, the frameworks ranked by REAL call-off spend (where the money actually flows), live opportunities + the forward pipeline to prepare bids for, incumbents whose contracts are ending (my displacement window), and resellers/thin-primes who could carry me in. Verify each opportunity on its official_url.` } }] }),
  );

  // ── MCP resources: reference material the host can read directly ──
  server.registerResource("glossary", "govbuy://glossary",
    { title: "govbuy glossary", description: "Plain-English definitions of the UK public-procurement terms govbuy uses.", mimeType: "text/markdown" },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GLOSSARY_MD }] }),
  );
  server.registerResource("guide", "govbuy://guide",
    { title: "govbuy verb guide", description: "What each govbuy verb does and when to reach for it.", mimeType: "text/markdown" },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE_MD }] }),
  );

  return server;
}

const GLOSSARY_MD = `# govbuy glossary

- **Framework agreement** — a pre-competed agreement with appointed suppliers a public buyer can *call off* from without running a full tender.
- **Call-off** — placing an order under a framework, either *without further competition* (direct selection on the framework's objective criteria) or via a *further competition* among the appointed suppliers. A call-off is **not** a statutory direct award.
- **DPS / dynamic market** — a list suppliers can join *throughout its life*; you must run a further competition to award (no direct call-off). Legacy DPSs sunset into PA2023 dynamic markets by **Feb 2029**.
- **Statutory direct award** — awarding with **no competition**, lawful only on a **Schedule 5** ground (+ a s.44 transparency notice). The exception, not the default.
- **Standstill** — an **8-working-day** pause after award decision notices before signing a competitively-awarded contract (PA2023 s.51).
- **Exclusion (two limbs)** — (1) insolvency / dissolution etc. (Schedule 6 mandatory, 7 discretionary), checked via live Companies House status; (2) the **s.62 central debarment register**.
- **MEAT** — *most economically advantageous tender*: the weighted quality × social-value × price scoring used to award.
- **CPV** — *Common Procurement Vocabulary*; govbuy filters by the 2-digit **division** (e.g. 72 = IT services, 48 = software, 45 = construction, 85 = health).
- **RM reference** — the Crown Commercial Service agreement number (e.g. **RM1557.14** = G-Cloud 14).
- **Observed-from-awards** — supplier/mechanic membership *inferred* from 658k real award notices where the official list is absent — labelled inferred, never official.
- **GPC** — Government Procurement Card: a **payment method, never a route**; confers no PA2023 exemption.`;

const GUIDE_MD = `# govbuy verbs — when to use which

- **buy({need, cpv?, depth?})** — a buyer's opinionated brief: route + PA2023 mechanic + ranked shortlist (CRN track record + exclusion) + price + alternative routes + checklist.
- **sell({product, cpv?, depth?})** — a vendor's route to market: frameworks/DPS to join, what pays, live + forward opportunities, incumbents to displace, resellers to carry you in.
- **supplier({query, depth?})** — one firm by name/CRN: two-limb exclusion check (live Companies House + s.62 debarment), framework footprint, delivery record, size/locality lens.
- **framework({id?|rm_reference?})** — one instrument: lots, appointed suppliers (incl. per-lot membership), observed-from-awards backfill, coverage, and the PA2023-precise call-off path.
- **draft({need?|rm_reference?, route?})** — scaffolding to START the procurement: dated timetable, MEAT matrix skeleton, spec outline, compliance steps, Schedule 5 / s.44 stub. Not legal advice; complete every placeholder.
- **watch({what, cpv?, keyword?})** — a re-runnable saved query for contract expiries or the forward pipeline; diff successive runs to spot change.
- **research({sql?|cpv?|schema?|status?})** — read-only BigQuery SQL, a spend x-ray for a CPV, the schema, or per-source freshness & coverage.

Grounding: every £ figure, RM reference, supplier name and URL must come verbatim from a tool result. govbuy documents routes; it does not assemble the purchase or give legal advice.`;
