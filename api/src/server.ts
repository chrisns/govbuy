// Builds the MCP server and registers the govbuy route-to-market tool surface (PRD §9).
// All reads are over govbuy_public (incl. the sibling_call_off_awards authorized view);
// query_sql is read-only and byte-capped. Every asserted fact is source-anchored (evidence).
// Evidence is resolved via LEFT JOIN (BigQuery rejects cross-table correlated subqueries).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config, tableRef } from "./lib/config.js";
import { runQuery, dryRunBytes } from "./lib/bigquery.js";
import { ok, toolError, guard } from "./lib/errors.js";
import { membership, deep, freshness, withFreshness, type ResultMode } from "./lib/format.js";
import { validateReadOnlySql } from "./lib/sqlguard.js";

const RESULT_MODE = z.enum(["minimal", "standard", "full"]).default("minimal");
const NOT_ADVICE = "Candidate route-to-market information, source-anchored. NOT legal advice and not the authority of record; you must confirm compliance on the official source. govbuy documents routes — it does not assemble the purchase or author the business case.";

// Display directive carried in every response so the host LLM renders the URLs we return as
// clickable links rather than naming things bare. A framework/supplier/source named without its
// link is not actionable — the user cannot reach the official page, the Companies House record, or
// the evidence. Always link the NAME (link text = the thing's name), never paste a bare URL.
const DISPLAY_GUIDANCE = "Render every URL in this response as a clickable markdown link whose text is the name of the thing it points to — do not just cite names. Specifically: official_url is the framework/instrument's official page; operator_url is the operator's site; each supplier's ch_url is its Companies House record; buying_docs[].url and how_to_apply[].url are the buying/guidance/application documents; and every evidence.source_url is the source a claim is anchored to (link it so the user can verify). When a thing has a URL, present its name as a link to that URL; reserve bare-text mentions for things that genuinely have no URL.";

const CE = tableRef("claim_evidence");
// Evidence STRUCT from a joined claim_evidence alias.
const EV = (a: string) => `STRUCT(${a}.source_url, ${a}.source_kind, ${a}.excerpt, ${a}.licence, ${a}.confidence)`;

// Tokenise a free-text need into significant terms (drop stopwords) for ANY-token matching.
const STOP = new Set(["a", "an", "the", "for", "of", "to", "my", "our", "i", "we", "want", "need", "buy", "buying", "purchase", "procure", "procurement", "product", "products", "solution", "solutions", "service", "services", "shelf", "compliantly"]);
function tokenize(term: string): string[] {
  return [...new Set((term || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t)))];
}

const LOTS = (a: string) => `ARRAY(SELECT AS STRUCT l.lot_id, l.number, l.title, l.scope FROM ${tableRef("lot")} l WHERE l.instrument_id = ${a}.instrument_id)`;
const MECHANICS = (a: string) => `ARRAY(SELECT AS STRUCT m.mechanic, m.permitted, m.lot_id, m.conditions, ${EV("ev")} AS evidence FROM ${tableRef("award_mechanic")} m LEFT JOIN ${CE} ev ON ev.evidence_id = m.evidence_id WHERE m.instrument_id = ${a}.instrument_id)`;
const DOCS = (a: string) => `ARRAY(SELECT AS STRUCT d.doc_type, d.title, d.url, d.required_for_purchase, ${EV("ev")} AS evidence FROM ${tableRef("buying_doc")} d LEFT JOIN ${CE} ev ON ev.evidence_id = d.evidence_id WHERE d.instrument_id = ${a}.instrument_id)`;

async function paymentCaveats(): Promise<unknown[]> {
  try {
    const rows = await runQuery(`SELECT mechanism, permitted_for_procurement, notes FROM ${tableRef("payment_mechanism")} WHERE is_route = FALSE ORDER BY mechanism`);
    if (rows.length) return rows.map((r) => ({ mechanism: r.mechanism, is_route: false, permitted_for_procurement: r.permitted_for_procurement, notes: r.notes }));
  } catch { /* fall through */ }
  return [
    { mechanism: "gpc", is_route: false, notes: "Government Procurement Card is a payment mechanism, not a route; banned where a procurement route exists (Mar 2025)." },
    { mechanism: "marketplace_consumption", is_route: false, notes: "Hyperscaler marketplace billing sits on a route (e.g. G-Cloud); it is not itself a compliant route." },
  ];
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
    for (const r of rows) map[r.evidence_id as string] = deep({ source_url: r.source_url, source_kind: r.source_kind, excerpt: r.excerpt, licence: r.licence, confidence: r.confidence });
    attachEv(payload, map);
  }
  return payload;
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "govbuy-mcp", version: "0.1.0" },
    {
      instructions:
        "govbuy maps UK public-sector routes to market (how to buy, how to sell, who resells). " +
        "Responses are source-anchored and carry URLs: framework official_url, operator_url, supplier ch_url (Companies House), buying-document urls, and an evidence.source_url on every asserted claim. " +
        "ALWAYS surface these to the user as clickable markdown links with the thing's name as the link text — naming a framework, supplier, or source without linking its URL is not useful. " +
        "When a buyer describes a concrete capability (e.g. 'host this app', 'an M365 mailbox', 'a service desk', 'a desk', 'classroom furniture'), find_routes gives the framework/route, then find_services surfaces the specific catalogue listings that do it — each with a citable listing URL, and where known the supplier's real call-off track record (£ won on that framework), an indicative price, and months-to-framework-expiry. Then compliant_path turns the chosen framework into the actual next steps (permitted award mechanic + conditions + documents + the 'a card/marketplace is not a route' caveat). Prefer naming concrete listings, citing the proof-of-delivery, and giving the call-off mechanic over only naming a framework. " +
        "Anchor each fact to its evidence.source_url so the user can verify it. govbuy documents routes; it does not assemble the purchase or give legal advice — tell the user to confirm on the official source.",
    },
  );

  server.registerTool(
    "find_routes",
    {
      title: "Find routes to buy",
      description:
        "BUYER journey: given a need (e.g. 'an AI assistant'), return the candidate standing instruments (frameworks / dynamic markets) and lots that fit, their permitted award mechanics, the documentation a purchase requires, and the payment-mechanism caveats (GPC/marketplace are NOT routes). It does NOT rank, pick, or assemble the purchase. Every rule is source-anchored.",
      inputSchema: {
        need: z.string().optional(), keyword: z.string().optional(), category: z.string().optional(), cpv: z.string().optional(),
        max_value: z.number().optional(), buyer_type: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(15), resultMode: RESULT_MODE,
      },
    },
    guard(async (args) => {
      const toks = tokenize(args.need || args.keyword || args.category || args.cpv || "");
      const sql = `
        SELECT i.instrument_id, i.name, i.rm_reference, i.type, i.regime, i.lifecycle_status,
               i.starts_on, i.expires_on, i.category_tags, i.official_url,
               o.name AS operator, o.kind AS operator_kind, o.home_url AS operator_url,
               ${LOTS("i")} AS lots, ${MECHANICS("i")} AS award_mechanics, ${DOCS("i")} AS buying_docs,
               ${EV("ie")} AS evidence
        FROM ${tableRef("instrument")} i
        JOIN ${tableRef("operator")} o USING (operator_id)
        LEFT JOIN ${CE} ie ON ie.evidence_id = i.evidence_id
        WHERE i.lifecycle_status = 'live_for_call_off'
          AND (ARRAY_LENGTH(@toks) = 0
            OR EXISTS (SELECT 1 FROM UNNEST(@toks) tok WHERE REGEXP_CONTAINS(LOWER(i.name), CONCAT(r'\b', tok, r'\b')))
            OR EXISTS (SELECT 1 FROM UNNEST(i.category_tags) t, UNNEST(@toks) tok WHERE LOWER(t) = tok OR LOWER(t) LIKE CONCAT(tok, '%'))
            OR EXISTS (SELECT 1 FROM ${tableRef("lot")} l, UNNEST(@toks) tok WHERE l.instrument_id = i.instrument_id AND (REGEXP_CONTAINS(LOWER(l.title), CONCAT(r'\b', tok, r'\b')) OR REGEXP_CONTAINS(LOWER(IFNULL(l.scope,'')), CONCAT(r'\b', tok, r'\b')))))
        ORDER BY i.name LIMIT @lim`;
      const rows = await runQuery(sql, { params: { toks, lim: args.limit }, types: { toks: ["STRING"] } });
      return ok(withFreshness({ count: rows.length, note: NOT_ADVICE, display_guidance: DISPLAY_GUIDANCE, payment_caveats: await paymentCaveats(), routes: rows.map(deep) }, await freshness()));
    }),
  );

  server.registerTool(
    "get_instrument",
    {
      title: "Get instrument",
      description: "One instrument (framework / dynamic market) by id or RM reference: lots, lifecycle status, permitted award mechanics, buying documents, and appointed suppliers — each supplier with a membership qualifier (status, as-of date, confidence, conflict) and source-anchored evidence.",
      inputSchema: { id: z.string().optional(), rm_reference: z.string().optional(), resultMode: RESULT_MODE },
    },
    guard(async (args) => {
      if (!args.id && !args.rm_reference) return toolError("INVALID_QUERY", "Provide id or rm_reference.");
      const sql = `
        SELECT i.instrument_id, i.name, i.rm_reference, i.type, i.regime, i.lifecycle_status,
               i.starts_on, i.expires_on, i.predecessor_id, i.category_tags, i.official_url,
               o.name AS operator, o.kind AS operator_kind, o.home_url AS operator_url,
               ${LOTS("i")} AS lots, ${MECHANICS("i")} AS award_mechanics, ${DOCS("i")} AS buying_docs,
               ARRAY(SELECT AS STRUCT s.display_name, s.company_number, s.match_band, s.status_at_match, s.ch_url,
                        aps.lot_id, aps.status, aps.appointed_from, aps.last_seen_on, aps.left_on, aps.confidence, aps.conflict
                     FROM ${tableRef("appointed_supplier")} aps JOIN ${tableRef("supplier")} s USING (supplier_id)
                     WHERE aps.instrument_id = i.instrument_id) AS appointed_suppliers,
               ${EV("ie")} AS evidence
        FROM ${tableRef("instrument")} i
        JOIN ${tableRef("operator")} o USING (operator_id)
        LEFT JOIN ${CE} ie ON ie.evidence_id = i.evidence_id
        WHERE i.instrument_id = @id OR i.rm_reference = @rm
        -- an exact id match wins; then prefer the CANONICAL agreement (the operator that owns the RM
        -- namespace, i.e. GCA) over other operators that merely list it as an access route, so an
        -- RM-number lookup returns the real framework rather than a reseller's copy.
        ORDER BY CASE WHEN i.instrument_id = @id THEN 0 ELSE 1 END,
                 CASE WHEN i.operator_id = 'gca' THEN 0 ELSE 1 END,
                 i.instrument_id
        LIMIT 1`;
      const rows = await runQuery(sql, { params: { id: args.id ?? "", rm: args.rm_reference ?? "" } });
      if (!rows.length) return toolError("UNKNOWN_ID", `No instrument for '${args.id ?? args.rm_reference}'.`, "Try the RM reference (e.g. RM1557.14) or call find_routes.");
      const r = deep(rows[0]) as Record<string, unknown>;
      const suppliers = (r.appointed_suppliers as Record<string, unknown>[]).map((s) => ({ ...s, membership: membership(s) }));
      return ok(withFreshness({ instrument: { ...r, appointed_suppliers: suppliers }, note: NOT_ADVICE, display_guidance: DISPLAY_GUIDANCE }, await freshness()));
    }),
  );

  server.registerTool(
    "find_instruments_to_list",
    {
      title: "Find instruments to list on",
      description: "SELLER journey: instruments/lots a vendor could be appointed to. With openOnly, restricts to currently-joinable vehicles (open frameworks / dynamic markets). Returns how-to-apply pointers (guidance docs + official URL). Source-anchored.",
      inputSchema: { product: z.string().optional(), category: z.string().optional(), openOnly: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(20) },
    },
    guard(async (args) => {
      const toks = tokenize(args.product || args.category || "");
      const openClause = args.openOnly ? `i.type IN ('open_framework','dynamic_market')` : `i.lifecycle_status = 'live_for_call_off'`;
      const sql = `
        SELECT i.instrument_id, i.name, i.rm_reference, i.type, i.lifecycle_status, i.expires_on, i.category_tags, i.official_url,
               o.name AS operator, o.home_url AS operator_url, (i.type IN ('open_framework','dynamic_market')) AS joinable_now,
               ${LOTS("i")} AS lots,
               ARRAY(SELECT AS STRUCT d.doc_type, d.title, d.url FROM ${tableRef("buying_doc")} d
                     WHERE d.instrument_id = i.instrument_id AND d.doc_type IN ('buyer_guide','required_documents','order_form')) AS how_to_apply,
               ${EV("ie")} AS evidence
        FROM ${tableRef("instrument")} i
        JOIN ${tableRef("operator")} o USING (operator_id)
        LEFT JOIN ${CE} ie ON ie.evidence_id = i.evidence_id
        WHERE ${openClause}
          AND (ARRAY_LENGTH(@toks) = 0
            OR EXISTS (SELECT 1 FROM UNNEST(@toks) tok WHERE REGEXP_CONTAINS(LOWER(i.name), CONCAT(r'\b', tok, r'\b')))
            OR EXISTS (SELECT 1 FROM UNNEST(i.category_tags) t, UNNEST(@toks) tok WHERE LOWER(t) = tok OR LOWER(t) LIKE CONCAT(tok, '%'))
            OR EXISTS (SELECT 1 FROM ${tableRef("lot")} l, UNNEST(@toks) tok WHERE l.instrument_id = i.instrument_id AND (REGEXP_CONTAINS(LOWER(l.title), CONCAT(r'\b', tok, r'\b')) OR REGEXP_CONTAINS(LOWER(IFNULL(l.scope,'')), CONCAT(r'\b', tok, r'\b')))))
        ORDER BY joinable_now DESC, i.name LIMIT @lim`;
      const rows = await runQuery(sql, { params: { toks, lim: args.limit }, types: { toks: ["STRING"] } });
      return ok(withFreshness({ count: rows.length, note: "If you cannot be appointed directly, see list_resellers for thin-primes/VARs that can route you in. " + NOT_ADVICE, display_guidance: DISPLAY_GUIDANCE, instruments: rows.map(deep) }, await freshness()));
    }),
  );

  server.registerTool(
    "list_resellers",
    {
      title: "List resellers / primes",
      description: "Suppliers that route OTHER parties to market — thin-primes (like Bramble Hub) and value-added resellers (VARs) — by channel type, category, the vendor they can route, or the instrument they sit on. Returns frameworks held + a sample of published inbound-scope edges (the vendors they can sell), each source-anchored.",
      inputSchema: {
        channel_type: z.enum(["thin_prime", "var", "vendor", "hybrid", "unknown"]).optional(),
        category: z.string().optional(), vendor: z.string().optional(), instrument: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      },
    },
    guard(async (args) => {
      // Three non-correlated queries assembled in JS (robust against BigQuery's de-correlation limits).
      const chans = (await runQuery(
        `SELECT s.supplier_id, s.display_name, s.company_number, s.match_band, s.ch_url,
                rc.channel_type, rc.confidence AS channel_confidence, rc.evidence_id AS evidence_id
         FROM ${tableRef("supplier")} s JOIN ${tableRef("reseller_channel")} rc ON rc.supplier_id = s.supplier_id
         WHERE (@ct IS NULL OR rc.channel_type = @ct)
         ORDER BY rc.channel_type, s.display_name LIMIT @lim`,
        { params: { ct: args.channel_type ?? null, lim: Math.max(args.limit, 200) }, types: { ct: "STRING" } },
      )).map(deep) as Record<string, unknown>[];
      const ids = [...new Set(chans.map((c) => c.supplier_id as string))];
      const fwBy: Record<string, string[]> = {};
      const iscBy: Record<string, unknown[]> = {};
      if (ids.length) {
        for (const r of await runQuery(`SELECT DISTINCT supplier_id, instrument_id FROM ${tableRef("appointed_supplier")} WHERE supplier_id IN UNNEST(@ids)`, { params: { ids }, types: { ids: ["STRING"] } })) {
          (fwBy[r.supplier_id as string] ??= []).push(r.instrument_id as string);
        }
        for (const r of (await runQuery(`SELECT supplier_id, vendor_name, vendor_company_number, confidence, evidence_id FROM ${tableRef("inbound_scope")} WHERE supplier_id IN UNNEST(@ids)`, { params: { ids }, types: { ids: ["STRING"] } })).map(deep) as Record<string, unknown>[]) {
          (iscBy[r.supplier_id as string] ??= []).push(r);
        }
      }
      let rows = chans.map((c) => ({ ...c, frameworks_held: fwBy[c.supplier_id as string] ?? [], inbound_scope: iscBy[c.supplier_id as string] ?? [] }));
      if (args.vendor) {
        const v = args.vendor.toLowerCase();
        rows = rows.filter((r) => (r.inbound_scope as { vendor_name?: string }[]).some((x) => String(x.vendor_name ?? "").toLowerCase().includes(v)));
      }
      if (args.instrument) rows = rows.filter((r) => (r.frameworks_held as string[]).includes(args.instrument as string));
      rows = rows.slice(0, args.limit);
      const payload = await withEvidence({ count: rows.length, note: NOT_ADVICE, display_guidance: DISPLAY_GUIDANCE, resellers: rows });
      return ok(withFreshness(payload, await freshness()));
    }),
  );

  server.registerTool(
    "get_supplier",
    {
      title: "Get supplier",
      description: "One supplier by name or Companies House number: the CRN match snapshot (band, status-at-match, link-out), its channel type, the instruments/lots it is appointed to (with membership qualifier), and its inbound scope if it resells.",
      inputSchema: { name: z.string().optional(), crn: z.string().optional(), resultMode: RESULT_MODE },
    },
    guard(async (args) => {
      if (!args.name && !args.crn) return toolError("INVALID_QUERY", "Provide name or crn.");
      const name = args.name ? `%${args.name.toLowerCase()}%` : null;
      const sql = `
        SELECT s.supplier_id, s.display_name, s.company_number, s.registered_name, s.match_confidence,
               s.match_band, s.status_at_match, s.matched_on, s.ch_url, s.publisher_ids,
               ARRAY(SELECT AS STRUCT rc.channel_type, rc.confidence, rc.evidence_id FROM ${tableRef("reseller_channel")} rc WHERE rc.supplier_id = s.supplier_id) AS channels,
               ARRAY(SELECT AS STRUCT aps.instrument_id, aps.lot_id, aps.status, aps.last_seen_on, aps.appointed_from, aps.left_on, aps.confidence, aps.conflict
                     FROM ${tableRef("appointed_supplier")} aps WHERE aps.supplier_id = s.supplier_id) AS appointments,
               ARRAY(SELECT AS STRUCT isc.vendor_name, isc.vendor_company_number, isc.confidence, isc.evidence_id FROM ${tableRef("inbound_scope")} isc WHERE isc.supplier_id = s.supplier_id) AS inbound_scope
        FROM ${tableRef("supplier")} s
        WHERE (@name IS NOT NULL AND LOWER(s.display_name) LIKE @name) OR (@crn IS NOT NULL AND s.company_number = @crn) LIMIT 1`;
      const rows = await runQuery(sql, { params: { name, crn: args.crn ?? null }, types: { name: "STRING", crn: "STRING" } });
      if (!rows.length) return toolError("UNKNOWN", `No supplier for '${args.name ?? args.crn}'.`);
      const r = deep(rows[0]) as Record<string, unknown>;
      const appointments = (r.appointments as Record<string, unknown>[]).map((a) => ({ ...a, membership: membership(a) }));
      const payload = await withEvidence({ supplier: { ...r, appointments }, display_guidance: DISPLAY_GUIDANCE });
      return ok(withFreshness(payload, await freshness()));
    }),
  );

  server.registerTool(
    "find_services",
    {
      title: "Find catalogue services",
      description:
        "CAPABILITY search across every public-sector buying catalogue govbuy holds: given a real need (e.g. 'host an open-source app', 'Microsoft 365 mailbox', 'IT service desk', 'a desk', 'classroom furniture'), return the specific catalogue listings that match — each with supplier, the verbatim description, and the citable listing URL to link. Catalogues: g-cloud (43,733 cloud services, the main digital route), espo + ypo (physical goods — furniture, supplies), nhs-buying-catalogue (clinical IT), ndx. This answers 'who can actually DO/SUPPLY this' rather than just naming a framework: surface 3-8 concrete listings and link each. Filter by `catalogue` to scope (e.g. g-cloud for digital, espo/ypo for physical goods).",
      inputSchema: {
        need: z.string().optional(), keyword: z.string().optional(),
        catalogue: z.enum(["g-cloud", "espo", "ypo", "nhs-buying-catalogue", "ndx", "azure"]).optional(),
        lot: z.enum(["cloud-hosting", "cloud-software", "cloud-support"]).optional(),
        supplier: z.string().optional(),
        limit: z.number().int().min(1).max(30).default(8),
      },
    },
    guard(async (args) => {
      const toks = tokenize(args.need || args.keyword || "");
      if (!toks.length && !args.supplier) return toolError("INVALID_QUERY", "Provide a need/keyword (e.g. 'host an open-source app') or a supplier name.");
      // Word-boundary token scoring. A token hit in the NAME is worth far more than one buried in the
      // description (so "Teacher's Desk" beats a whiteboard rule that merely says "office"); requiring
      // every token to appear somewhere (allTok) is the strongest signal and dominates the ranking.
      const nameHits = `(SELECT COUNT(1) FROM UNNEST(@toks) tok WHERE REGEXP_CONTAINS(nm, CONCAT(r'\\b', tok, r'\\b')))`;
      const anyHits = `(SELECT COUNT(1) FROM UNNEST(@toks) tok WHERE REGEXP_CONTAINS(hay, CONCAT(r'\\b', tok, r'\\b')))`;
      const allTok = `(${anyHits} = ARRAY_LENGTH(@toks))`;
      const score = `(IF(${allTok}, 1000, 0) + 5 * ${nameHits} + ${anyHits})`;
      // Normalise a supplier name the same way supplier_track_record was built, so a service's supplier
      // links to its real call-off spend; pull a £ price out of catalogues that embed it in the text.
      const norm = (c: string) =>
        `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(TRIM(${c})), r'\\b(ltd\\.?|limited|plc\\.?|llp\\.?|inc\\.?|corp\\.?|llc\\.?|gmbh|bv|b\\.v\\.|s\\.a\\.|s\\.l\\.)$', ''), r'[^a-z0-9\\s]', ' '), r'\\s+', ' '))`;
      const priceExpr = `SAFE_CAST(REPLACE(REGEXP_EXTRACT(sv.description, r'Price(?:\\s*\\(ex VAT\\))?\\s*:\\s*£([\\d,]+(?:\\.\\d+)?)'), ',', '') AS FLOAT64)`;
      // Semantic layer: when there's a free-text need, embed it (Vertex via BQ remote model) and
      // VECTOR_SEARCH the precomputed service embeddings — so "take meeting minutes with AI" finds
      // transcription services that share no keyword. Blended with keyword score; keyword still wins
      // exact matches. Skipped for supplier-only lookups (no need text) to keep them cheap.
      const needText = (args.need || args.keyword || "").trim();
      const useSem = needText.length > 0;
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
                 inst.rm_reference, inst.expires_on, ${priceExpr} AS price_gbp,
                 LOWER(sv.name) AS nm,
                 LOWER(CONCAT(sv.name, ' ', IFNULL(sv.description, ''), ' ',
                              ARRAY_TO_STRING(sv.features, ' '), ' ', ARRAY_TO_STRING(sv.benefits, ' '))) AS hay
          FROM ${tableRef("service")} sv
          LEFT JOIN ${tableRef("supplier")} sup ON sup.supplier_id = sv.supplier_id
          LEFT JOIN ${tableRef("instrument")} inst ON inst.instrument_id = sv.instrument_id
          WHERE (@sup IS NULL OR LOWER(sv.supplier_name) LIKE @sup)
            AND (@cat IS NULL OR sv.catalogue = @cat)
            AND (@lot IS NULL OR sv.lot = @lot))
        SELECT s.* EXCEPT(hay, nm, rm_reference),
               (${score}${useSem ? " + CAST(COALESCE(v.sem_sim, 0) * 700 AS INT64)" : ""}) AS match_score,
               ${useSem ? "ROUND(v.sem_sim, 3)" : "CAST(NULL AS FLOAT64)"} AS semantic_similarity,
               tr.total_award_gbp AS supplier_framework_award_gbp,
               tr.call_off_count  AS supplier_framework_call_offs,
               CASE WHEN s.expires_on IS NOT NULL
                    THEN DATE_DIFF(s.expires_on, CURRENT_DATE(), MONTH) END AS framework_months_to_expiry
        FROM s
        ${useSem ? `LEFT JOIN vec v ON v.service_id = s.service_id` : ""}
        LEFT JOIN ${tableRef("supplier_track_record")} tr
          ON tr.rm_stem = REGEXP_EXTRACT(UPPER(s.rm_reference), r'RM[0-9]+')
         AND tr.norm_name = ${norm("s.supplier_name")}
        WHERE (ARRAY_LENGTH(@toks) = 0 OR ${anyHits} > 0${useSem ? " OR v.sem_sim IS NOT NULL" : ""})
        ORDER BY match_score DESC, supplier_framework_award_gbp DESC NULLS LAST, name
        LIMIT @lim`;
      const rows = await runQuery(sql, {
        params: { toks, needtext: useSem ? needText : null, cat: args.catalogue ?? null, lot: args.lot ?? null, sup: args.supplier ? `%${args.supplier.toLowerCase()}%` : null, lim: args.limit },
        types: { toks: ["STRING"], needtext: "STRING", cat: "STRING", lot: "STRING", sup: "STRING" },
      });
      const services = rows.map((r) => {
        const d = deep(r) as Record<string, unknown>;
        const desc = typeof d.description === "string" ? d.description : "";
        return { ...d, description: desc.length > 600 ? desc.slice(0, 600) + "…" : desc };
      });
      return ok(withFreshness({
        count: services.length,
        note: "Catalogue listings across UK public-sector buying catalogues (each row's `catalogue` shows which). g-cloud = cloud services on RM1557.14; espo/ypo = physical goods; nhs-buying-catalogue = clinical IT; ndx = digital exchange. Each row also carries: `supplier_framework_award_gbp`/`supplier_framework_call_offs` = the supplier's REAL call-off track record on that framework (from published award data — proof of delivery, not a guarantee); `price_gbp` = indicative price where the catalogue publishes one; `framework_months_to_expiry` = act-before date for framework-based listings; `semantic_similarity` = how closely the listing matches the meaning of the need (vector search), so results surface even when they share no keyword with the query. " + NOT_ADVICE,
        display_guidance: "Present each listing as a clickable link (its url) with the name as link text, and link the supplier's ch_url (Companies House) when present. When `supplier_framework_award_gbp` is set, mention it as evidence the supplier actually delivers on this route (e.g. 'has won £Xm across N call-offs') — and note that a NULL is absence of matched awards, not absence of capability. Surface `price_gbp` and flag `framework_months_to_expiry` when low (<6). Group by `catalogue` when results span several. " + DISPLAY_GUIDANCE,
        services,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "compliant_path",
    {
      title: "Compliant call-off path",
      description:
        "Turn 'which framework' into 'how to actually buy it': given an instrument_id or rm_reference, return the permitted award mechanics (direct award vs further competition) with their conditions, the buying documents, the framework's lifecycle + expiry, the official URL, and the payment-mechanism caveats (a GPC card or marketplace consumption is a settlement mechanism, NEVER a procurement route). Use after find_routes/find_services to give the buyer the actual next steps.",
      inputSchema: { instrument_id: z.string().optional(), rm_reference: z.string().optional() },
    },
    guard(async (args) => {
      if (!args.instrument_id && !args.rm_reference) return toolError("INVALID_QUERY", "Provide instrument_id or rm_reference (e.g. 'g-cloud-14' or 'RM1557.14').");
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
        params: { iid: args.instrument_id ?? null, rm: args.rm_reference ?? null },
        types: { iid: "STRING", rm: "STRING" },
      })).map((r) => deep(r) as Record<string, unknown>);
      if (!rows.length) return toolError("UNKNOWN", `No instrument matched '${args.instrument_id ?? args.rm_reference}'.`);
      const sect = (s: string) => rows.filter((r) => r.section === s);
      const head = sect("instrument")[0] ?? {};
      const payload = {
        instrument: { name: head.title, rm_reference: head.ref, lifecycle_status: head.status, expires_on: head.expires_on, official_url: head.url },
        award_mechanics: sect("mechanic").map((r) => ({ mechanic: r.title, lot_id: r.ref, permitted: r.permitted, conditions: r.conditions })),
        buying_documents: sect("document").map((r) => ({ title: r.title, doc_type: r.ref, url: r.url, summary: r.conditions })),
        payment_caveats: sect("payment_caveat").map((r) => ({ mechanism: r.title, permitted_for_procurement: r.status, note: r.conditions })),
        display_guidance:
          "Lead with the permitted direct-award mechanic if present (call_off_no_further_competition) — that's the fastest compliant route — else further_competition. State the conditions verbatim. Link official_url and any buying-document urls. Flag expiry if near. Remind the buyer a GPC card / marketplace consumption is NOT a route. " + DISPLAY_GUIDANCE,
      };
      return ok(withFreshness(payload, await freshness()));
    }),
  );

  server.registerTool(
    "query_sql",
    {
      title: "Read-only SQL",
      description: `Read-only BigQuery Standard SQL SELECT over govbuy_public (and the sibling_call_off_awards authorized view for joining real call-off awards). Single statement, SELECT/WITH only, capped at ${config.maxBytesHuman} scanned. Call get_schema for tables/columns.`,
      inputSchema: { sql: z.string().describe("a single read-only SELECT/WITH statement") },
    },
    guard(async (args) => {
      const g = validateReadOnlySql(args.sql);
      if (!g.ok) return toolError(g.code, g.message);
      const bytes = await dryRunBytes(g.sql);
      if (bytes > Number(config.maxBytesBilled)) return toolError("CAP_EXCEEDED", `Query would scan ~${(bytes / 1024 / 1024).toFixed(0)} MB; cap is ${config.maxBytesHuman}.`, "Add filters or aggregate.");
      const rows = await runQuery(g.sql);
      return ok({ estimated_bytes: bytes, row_count: rows.length, rows: rows.slice(0, 1000).map(deep) });
    }),
  );

  server.registerTool(
    "get_schema",
    { title: "Get schema", description: "Tables and columns in govbuy_public (incl. the sibling_call_off_awards view) + the per-query byte cap, for query_sql.", inputSchema: {} },
    guard(async () => {
      const rows = await runQuery(`SELECT table_name, column_name, data_type FROM \`${config.project}.${config.publicDataset}.INFORMATION_SCHEMA.COLUMNS\` ORDER BY table_name, ordinal_position`);
      const tables: Record<string, { column: unknown; type: unknown }[]> = {};
      for (const r of rows) (tables[r.table_name as string] ??= []).push({ column: r.column_name, type: r.data_type });
      return ok({ dataset: `${config.project}.${config.publicDataset}`, max_bytes_per_query: config.maxBytesHuman, tables });
    }),
  );

  server.registerTool(
    "get_status",
    { title: "Get status", description: "Per-source/operator freshness + health (green/amber/red), the last harness run's cost (£) and the spend-coverage %.", inputSchema: {} },
    guard(async () => ok(await freshness())),
  );

  return server;
}
