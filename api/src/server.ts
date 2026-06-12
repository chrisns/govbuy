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
        "govbuy is fused with the UK Tenders corpus (658k real awards), so it serves three personas: BUYERS — benchmark_price (what was actually paid), due_diligence (is this supplier safe), and plan_buy (one opinionated end-to-end brief: route + shortlist + price + exclusion check + compliance checklist); SUPPLIERS — supplier_pipeline (live + FORWARD-pipeline opportunities + frameworks that really pay + incumbents to displace + resellers); RESEARCHERS — spend_xray (how money flows by channel + competition health). All joined on Companies House CRN; cite the source URLs. " +
        "compliant_path is Procurement-Act-2023-precise (competitive flexible procedure, 8-working-day standstill, lawful direct-award grounds, the DPS→dynamic-market sunset, the >£5m KPI duty, payment-method-blind) — and a framework call-off is NOT a statutory direct award. ALWAYS surface an exclusion ⚠ when a supplier is dissolved / in liquidation / administration (a PA2023 exclusion ground), and treat a NULL track record as absence of evidence, not of capability. " +
        "Anchor each fact to its evidence.source_url so the user can verify it. govbuy documents routes; it does not assemble the purchase or give legal advice — tell the user to confirm on the official source.",
    },
  );

  server.registerTool(
    "find_routes",
    {
      title: "Find routes to buy",
      description:
        "BUYER. 'What framework can I use to buy X?' Returns the candidate live standing instruments (frameworks/dynamic markets), lots, permitted award mechanics, required documents, and the payment-mechanism caveats (a GPC card and marketplace consumption are settlement mechanisms, NEVER procurement routes). Returns candidates only — it does NOT rank, pick, or assemble (use plan_buy if you want a recommendation). Every rule is source-anchored. Anti-patterns: do not rank or recommend; do not invent frameworks not returned. Chain to find_services (concrete listings) → compliant_path (how to call it off). Example: 'cloud hosting for a Django app' → G-Cloud lots + permitted mechanics.",
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
      description: "SELLER. 'Which frameworks can I get onto?' Returns instruments/lots a vendor could be appointed to, with openOnly=true restricting to currently-joinable vehicles (open frameworks / dynamic markets), plus how-to-apply pointers (guidance docs + official URL). Anti-patterns: do not present closed frameworks as immediately joinable; if the vendor can't be appointed directly, flag list_resellers as the alternative. Chain to list_resellers (carry-in) or supplier_pipeline (real spend on those frameworks). Example: product='thermal cameras', openOnly=true.",
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
      description: "SELLER/BUYER. 'Who are the thin-primes and VARs that route other parties to market?' Returns resellers (thin-primes like Bramble Hub, VARs, hybrids) with the frameworks they hold and the vendors in their published inbound scope. Use when a supplier can't be directly appointed, or when a buyer needs to know who else can access a framework on their behalf. Filter by vendor name to find who already carries a product. Anti-patterns: a reseller's inbound scope reflects only what's published, not an exhaustive list. Chain to supplier_pipeline or compliant_path.",
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
      description: "BUYER/RESEARCHER. Full profile of one supplier by name or Companies House CRN: the CRN match snapshot (band, status-at-match), an **exclusion alert** (⚠ if dissolved/in liquidation/administration — a PA2023 exclusion ground), channel type (thin-prime/VAR/vendor), instruments/lots appointed to (with membership qualifier + dates) — **reconciled across ingestion sources** so the framework footprint is the firm's full set even when the GCA spine and the Digital Marketplace directory hold it under different supplier_ids — and inbound scope if it resells. Use when you know which supplier you're investigating. Anti-patterns: status_at_match is a snapshot at match time, NOT live Companies House status — always link ch_url for the live record. Chain to due_diligence (delivery track record) or get_instrument (the specific framework).",
      inputSchema: { name: z.string().optional(), crn: z.string().optional(), resultMode: RESULT_MODE },
    },
    guard(async (args) => {
      if (!args.name && !args.crn) return toolError("INVALID_QUERY", "Provide name or crn.");
      const name = args.name ? `%${args.name.toLowerCase()}%` : null;
      // Supplier identity is split across ingestion sources (the GCA spine ingests a company as
      // `<slug>-ltd`, the Digital Marketplace directory as `dm-<id>`), so the same Companies House
      // company_number can have >1 supplier_id. Resolve the best-matched record, then UNION its
      // appointments/channels/scope across every supplier_id sharing that CRN — otherwise we'd
      // under-report a supplier's framework footprint (e.g. Appvia: TS4 under one id, G-Cloud the other).
      const sql = `
        WITH matched AS (
          SELECT s.* FROM ${tableRef("supplier")} s
          WHERE (@name IS NOT NULL AND LOWER(s.display_name) LIKE @name) OR (@crn IS NOT NULL AND s.company_number = @crn)
          ORDER BY (s.company_number IS NOT NULL) DESC, s.match_confidence DESC NULLS LAST
          LIMIT 1),
        ids AS (
          SELECT DISTINCT s.supplier_id FROM ${tableRef("supplier")} s, matched m
          WHERE (m.company_number IS NOT NULL AND s.company_number = m.company_number) OR s.supplier_id = m.supplier_id)
        SELECT m.supplier_id, m.display_name, m.company_number, m.registered_name, m.match_confidence,
               m.match_band, m.status_at_match, m.matched_on, m.ch_url, m.publisher_ids,
               ARRAY(SELECT AS STRUCT rc.channel_type, rc.confidence, rc.evidence_id FROM ${tableRef("reseller_channel")} rc WHERE rc.supplier_id IN (SELECT supplier_id FROM ids)) AS channels,
               ARRAY(SELECT AS STRUCT aps.instrument_id, aps.lot_id, aps.status, aps.last_seen_on, aps.appointed_from, aps.left_on, aps.confidence, aps.conflict
                     FROM ${tableRef("appointed_supplier")} aps WHERE aps.supplier_id IN (SELECT supplier_id FROM ids)) AS appointments,
               ARRAY(SELECT AS STRUCT isc.vendor_name, isc.vendor_company_number, isc.confidence, isc.evidence_id FROM ${tableRef("inbound_scope")} isc WHERE isc.supplier_id IN (SELECT supplier_id FROM ids)) AS inbound_scope,
               (SELECT ARRAY_AGG(supplier_id ORDER BY supplier_id) FROM ids) AS reconciled_supplier_ids
        FROM matched m`;
      const rows = await runQuery(sql, { params: { name, crn: args.crn ?? null }, types: { name: "STRING", crn: "STRING" } });
      if (!rows.length) return toolError("UNKNOWN", `No supplier for '${args.name ?? args.crn}'.`);
      const r = deep(rows[0]) as Record<string, unknown>;
      const appointments = (r.appointments as Record<string, unknown>[]).map((a) => ({ ...a, membership: membership(a) }));
      const reconciledIds = (r.reconciled_supplier_ids as string[]) ?? [];
      const excluded = ["dissolved", "liquidation", "administration", "closed"].includes(String(r.status_at_match));
      const exclusion = { flagged: excluded, status: excluded ? r.status_at_match : null,
        note: excluded ? `⚠ Exclusion risk: Companies House status was '${r.status_at_match}' at match time — a PA2023 Schedule 6/7 (insolvency/dissolution) ground a contracting authority must consider. Snapshot only; re-check live at ch_url before any award.` : "No Companies-House distress flag on record (snapshot — re-check live before award)." };
      const reconciledNote = reconciledIds.length > 1
        ? `Framework footprint reconciled across ${reconciledIds.length} supplier records sharing this Companies House number (ids: ${reconciledIds.join(", ")}) — the GCA spine and the Digital Marketplace directory ingest the same firm under different ids.`
        : undefined;
      const payload = await withEvidence({ supplier: { ...r, appointments, ...(reconciledNote ? { reconciliation: reconciledNote } : {}) }, exclusion,
        display_guidance: "If exclusion.flagged is true, LEAD with the ⚠ warning. Always link ch_url for live status. " + DISPLAY_GUIDANCE });
      return ok(withFreshness(payload, await freshness()));
    }),
  );

  server.registerTool(
    "find_services",
    {
      title: "Find catalogue services",
      description:
        "BUYER. 'Who can actually DO or SUPPLY this?' Searches every public-sector buying catalogue (g-cloud cloud services; espo + ypo physical goods; nhs-buying-catalogue clinical IT; ndx; azure) and returns specific listings with supplier, verbatim description and a citable listing URL. **Disambiguation is critical:** 'a desk'/'classroom furniture' → set catalogue=espo or ypo (physical goods); 'IT service desk'/'helpdesk software' → catalogue=g-cloud (cloud-software). Each row carries `supplier_public_calloff_gbp` (real CRN-matched delivery evidence from 658k awards) and an `exclusion_status` (⚠ if the supplier is dissolved/in liquidation at Companies House). Anti-patterns: NULL call-off = absence of evidence, NOT proof the supplier can't deliver — never treat it as disqualifying. Chain to compliant_path (how to buy) or due_diligence (is the supplier safe).",
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
      // Pull a £ price out of catalogues that embed it in the text.
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
                 IF(sup.status_at_match IN ('dissolved','liquidation','administration','closed'), sup.status_at_match, NULL) AS exclusion_status,
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
        note: "Catalogue listings across UK public-sector buying catalogues (each row's `catalogue` shows which). g-cloud = cloud services on RM1557.14; espo/ypo = physical goods; nhs-buying-catalogue = clinical IT; ndx = digital exchange. Each row also carries: `supplier_public_calloff_gbp`/`supplier_public_calloffs` = the supplier's REAL public-sector call-off track record across all frameworks, joined by **Companies House CRN** (not name) from 658k tender awards — proof of delivery, not a guarantee; NULL = no CRN-matched call-offs found, which is absence of evidence, not of capability; `price_gbp` = indicative price where the catalogue publishes one; `framework_months_to_expiry` = act-before date for framework-based listings; `semantic_similarity` = how closely the listing matches the meaning of the need (vector search), so results surface even when they share no keyword with the query. " + NOT_ADVICE,
        display_guidance: "Present each listing as a clickable link (its url) with the name as link text, and link the supplier's ch_url (Companies House) when present. When `supplier_public_calloff_gbp` is set, mention it as CRN-matched evidence the supplier actually delivers (e.g. 'has won £Xm across N public-sector call-offs') — and note that a NULL is absence of matched awards, not absence of capability. Surface `price_gbp` and flag `framework_months_to_expiry` when low (<6). Group by `catalogue` when results span several. " + DISPLAY_GUIDANCE,
        services,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "compliant_path",
    {
      title: "Compliant call-off path",
      description:
        "BUYER. 'How do I actually call this off — compliantly under the Procurement Act 2023?' Given an instrument_id or rm_reference, returns: the permitted award mechanics (direct award vs further competition) with conditions verbatim, the buying documents + URLs, lifecycle + expiry, AND the **Procurement Act 2023** statutory rules that govern it — the competitive flexible procedure, the 8-working-day standstill, lawful direct-award (Schedule 5) grounds, open-vs-closed frameworks, the DPS→dynamic-market sunset (Feb 2029), the >£5m KPI duty, the s.62 debarment-check duty, and that the regime is payment-method-blind (a GPC card/marketplace billing is a settlement mechanism, never a route, and confers no exemption). Crucially distinguishes a framework call-off from a statutory direct award (ss.41/43 cannot be used for call-offs). Use after find_routes/find_services. Anti-patterns: never present a GPC card as a route; never call a framework call-off a 'statutory direct award'; cite the source_url on statutory claims.",
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
      const pa2023 = (await runQuery(`SELECT topic, statement, source_url FROM ${tableRef("pa2023_rule")} ORDER BY topic`)).map((r) => deep(r));
      const sect = (s: string) => rows.filter((r) => r.section === s);
      const head = sect("instrument")[0] ?? {};
      const payload = {
        instrument: { name: head.title, rm_reference: head.ref, lifecycle_status: head.status, expires_on: head.expires_on, official_url: head.url },
        award_mechanics: sect("mechanic").map((r) => ({ mechanic: r.title, lot_id: r.ref, permitted: r.permitted, conditions: r.conditions })),
        buying_documents: sect("document").map((r) => ({ title: r.title, doc_type: r.ref, url: r.url, summary: r.conditions })),
        payment_caveats: sect("payment_caveat").map((r) => ({ mechanism: r.title, permitted_for_procurement: r.status, note: r.conditions })),
        procurement_act_2023: {
          summary: "PA2023 (in force 24 Feb 2025) governs covered procurement in England/Wales/NI. A framework call-off (direct selection under the framework's objective mechanism, or further competition) is NOT a statutory direct award — ss.41/43 cannot be used for call-offs. Direct award without competition is lawful only on a Schedule 5 ground (+ a transparency notice). A competitive award needs an 8-working-day standstill after the contract award notice before signing. The regime is payment-method-blind — a GPC/purchase card confers no exemption.",
          rules: pa2023,
        },
        display_guidance:
          "Lead with the permitted mechanic (call_off_no_further_competition is the fastest compliant route; else further_competition), conditions verbatim. Then state the PA2023 reality: a framework call-off is NOT a statutory direct award; if this is a further competition, an 8-working-day standstill applies before signing; a GPC card/marketplace is never a route. Cite the rule source_url on any statutory point. Link official_url + document URLs; flag near expiry. " + DISPLAY_GUIDANCE,
      };
      return ok(withFreshness(payload, await freshness()));
    }),
  );

  server.registerTool(
    "supplier_pipeline",
    {
      title: "Supplier go-to-market pipeline",
      description:
        "SELLER. 'What is my full route to market right now?' Fuses catalogue/framework data with 658k real tender awards in one call: (1) LIVE opportunities open to bid; (2) frameworks ranked by REAL call-off spend in your CPV space (join the ones that actually pay, not dormant paper); (3) incumbents holding that spend + when their contracts END (your displacement window); (4) resellers/thin-primes who could carry you onto a framework faster than direct appointment; (5) FORWARD pipeline — procurements PLANNED but not yet live (bid-prep 6-18 months ahead). Pass both a CPV division and a need keyword. CPV (2-digit): 72=IT services, 48=software, 30=office/computing equipment, 32=comms, 35=security/defence, 34=transport equipment, 38=lab/precision instruments, 50=repair, 71=engineering, 45=construction, 79=business services, 90=environmental, 85=health, 80=education. Anti-patterns: verify each live/pipeline notice on its official_url; CPV is a two-digit division, not a full code. Chain to find_instruments_to_list (join a framework) or list_resellers.",
      inputSchema: { cpv: z.string().optional(), need: z.string().optional(), limit: z.number().int().min(1).max(20).default(8) },
    },
    guard(async (args) => {
      if (!args.cpv && !args.need) return toolError("INVALID_QUERY", "Provide a cpv division (e.g. '72' for IT) and/or a need keyword (e.g. 'drone thermal imaging').");
      const cpv = args.cpv ?? null;
      const kw = args.need ? `%${args.need.toLowerCase()}%` : null;
      const lim = args.limit;
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
        WHERE (@cpv IS NULL OR cpv_division = @cpv) AND (@kw IS NULL OR hay LIKE @kw)
        ORDER BY expected_date LIMIT @lim`;
      const wide = { params: { cpv, kw, lim }, types: { cpv: "STRING" as const, kw: "STRING" as const } };
      const [live, frameworks, incumbents, resellers, coming] = await Promise.all([
        runQuery(liveSql, wide), runQuery(fwSql, { params: { cpv, lim }, types: { cpv: "STRING" } }),
        runQuery(incSql, { params: { cpv, lim }, types: { cpv: "STRING" } }), runQuery(rslSql, { params: { lim } }),
        runQuery(pipeSql, wide),
      ]);
      const m = (rs: Record<string, unknown>[]) => rs.map((r) => deep(r));
      return ok(withFreshness({
        live_opportunities: m(live),
        coming_soon_pipeline: m(coming),
        frameworks_with_real_calloff_spend: m(frameworks),
        incumbents_to_displace: m(incumbents),
        resellers_who_could_carry_you: m(resellers),
        note: "A supplier's full route to market, fusing govbuy's frameworks/resellers with real tender awards. `coming_soon_pipeline` = PLANNED procurements not yet live (prepare ahead). `frameworks_with_real_calloff_spend` ranks routes by money that actually flowed (call-off channels only, ceiling outliers removed). `incumbents_to_displace.latest_contract_end` is when to pounce. Verify each notice on its official_url. " + NOT_ADVICE,
        display_guidance: "Lead with what's actionable now — live opportunities (link official_url) and the 2-3 frameworks with the most real call-off spend (link official_url, flag lifecycle + expiry). Then the FORWARD pipeline (procurements coming, with expected dates) as bid-prep signal, the incumbents with £ won + contract-end displacement windows, and the thin-primes/VARs (ch_url) as a faster way in. " + DISPLAY_GUIDANCE,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "benchmark_price",
    {
      title: "Benchmark real prices paid",
      description:
        "BUYER. 'What did the public sector actually pay for this?' Returns the real award £ distribution (count, p25, median, p75, mean) overall and by channel (framework call-off vs open vs direct) from 658k tender awards. The `keyword` matches buyer/supplier name only — a weak SECTOR hint, NOT scope-of-work; read results as a range, not a quote. Anti-patterns: do not invent prices; do not treat the keyword as a precise scope filter. Chain to due_diligence (check the supplier) or compliant_path (the route). CPV: 72=IT, 48=software, 30=computing equipment, 35=security, 45=construction, 71=engineering, 79=business services, 85=health, 80=education, 90=environmental. Example: cpv='72', keyword='cyber'.",
      inputSchema: { cpv: z.string(), keyword: z.string().optional() },
    },
    guard(async (args) => {
      const kw = args.keyword ? `%${args.keyword.toLowerCase()}%` : null;
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
      const rows = await runQuery(sql, { params: { cpv: args.cpv, kw }, types: { cpv: "STRING", kw: "STRING" } });
      if (!rows.length) return toolError("UNKNOWN", `No GBP awards found for CPV '${args.cpv}'.`);
      return ok(withFreshness({ cpv: args.cpv, distribution: rows.map((r) => deep(r)),
        note: "Real award amounts the public sector paid (GBP; framework-ceiling outliers >£100m removed), overall ('ALL') and by channel. Median = typical price; p25–p75 = usual range. Keyword matches buyer/supplier name only (no scope-of-work field), so treat it as a sector hint. " + NOT_ADVICE,
        display_guidance: "Quote the median and p25–p75 range as 'what you'd typically pay', and contrast framework call-off vs open/direct. " + DISPLAY_GUIDANCE }, await freshness()));
    }),
  );

  server.registerTool(
    "due_diligence",
    {
      title: "Supplier due diligence",
      description:
        "BUYER. 'Is this supplier safe to choose?' Given a Companies House CRN or name, returns its CRN-matched delivery record from real awards — total call-off £ + count, distinct buyers, customer concentration (top buyer's share = single-customer risk), channel mix (% won competitively vs direct award), CPV footprint, contract-end dates — PLUS an **exclusion check** (a ⚠ if the firm is dissolved / in liquidation / administration at Companies House, a PA2023 Schedule 6/7 ground the buyer must consider). Anti-patterns: NULL/zero results = absence of evidence, not of capability (they may trade under another entity or win below threshold) — do not infer inability. Chain to compliant_path (proceed) or find_services (alternatives).",
      inputSchema: { crn: z.string().optional(), supplier: z.string().optional() },
    },
    guard(async (args) => {
      if (!args.crn && !args.supplier) return toolError("INVALID_QUERY", "Provide a crn (e.g. '02174990') or a supplier name.");
      const sup = args.supplier ? `%${args.supplier.toLowerCase()}%` : null;
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
      const rows = await runQuery(sql, { params: { crn: args.crn ?? null, sup }, types: { crn: "STRING", sup: "STRING" } });
      const r = rows.length ? deep(rows[0]) as Record<string, unknown> : {};
      const sinfo = (await runQuery(`SELECT company_number, display_name, ch_url, status_at_match
          FROM ${tableRef("supplier")} WHERE company_number = COALESCE(@crn,
            (SELECT company_number FROM ${tableRef("supplier")} WHERE @sup IS NOT NULL AND LOWER(display_name) LIKE @sup AND company_number IS NOT NULL LIMIT 1)) LIMIT 1`,
        { params: { crn: args.crn ?? null, sup }, types: { crn: "STRING", sup: "STRING" } })).map((x) => deep(x) as Record<string, unknown>)[0] ?? {};
      const distress = ["dissolved", "liquidation", "administration", "closed"];
      const excluded = distress.includes(String(sinfo.status_at_match));
      if ((!r || r.calloffs == null || Number(r.calloffs) === 0) && !sinfo.company_number) return toolError("UNKNOWN", `No CRN-matched public-sector awards for '${args.crn ?? args.supplier}'. Absence of evidence, not of capability — they may trade under a different entity or win below threshold.`);
      return ok(withFreshness({
        supplier: { crn: sinfo.company_number ?? args.crn ?? null, display_name: sinfo.display_name ?? null, ch_url: sinfo.ch_url ?? null, companies_house_status: sinfo.status_at_match ?? null },
        exclusion: { flagged: excluded, status: excluded ? sinfo.status_at_match : null,
          note: excluded ? `⚠ Exclusion risk: Companies House status was '${sinfo.status_at_match}' at award-match time — a PA2023 Schedule 6/7 (insolvency/dissolution) ground a contracting authority must consider. This is a snapshot; re-check live at Companies House before any award.` : "No Companies-House distress flag on record (snapshot — re-check live before award)." },
        profile: r,
        note: "CRN-matched delivery record from real tender awards (call-off channels, £ ceiling outliers removed). top_buyer_pct_of_calloff >50% = single-customer risk; high pct_direct_award = wins by direct award not competition. NULL/absent record = no matched awards, not proof of incapacity. " + NOT_ADVICE,
        display_guidance: "If `exclusion.flagged` is true, LEAD with the ⚠ warning before anything else. Then state £ won + call-offs + distinct buyers as the record, flag concentration and competitive-vs-direct mix, and the CPV footprint. Link the ch_url. " + DISPLAY_GUIDANCE,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "plan_buy",
    {
      title: "Plan the buy (opinionated)",
      description:
        "BUYER. 'Just tell me how to buy this.' Given a need (+ optional cpv division, budget), returns ONE opinionated, source-anchored buying brief: a recommended route + PA2023-correct call-off mechanic, a ranked shortlist of up to 3 real listings (each with CRN-matched delivery record + a Companies-House exclusion check), an indicative market price from real awards, forward pipeline notices to watch, and a compliance checklist. Unlike find_routes it DOES recommend — but everything is indicative and caveated; the buyer still runs their own assessment. Anti-patterns: keep every caveat; never drop the exclusion ⚠ or the PA2023 standstill note; cite the listing + framework URLs.",
      inputSchema: { need: z.string(), cpv: z.string().optional(), budget_gbp: z.number().optional() },
    },
    guard(async (args) => {
      const toks = tokenize(args.need);
      if (!toks.length) return toolError("INVALID_QUERY", "Describe the need, e.g. 'cloud hosting for a Django app'.");
      const cpv = args.cpv ?? null; const kw = `%${args.need.toLowerCase()}%`;
      const nameHits = `(SELECT COUNT(1) FROM UNNEST(@toks) t WHERE REGEXP_CONTAINS(nm, CONCAT(r'\\b', t, r'\\b')))`;
      const anyHits = `(SELECT COUNT(1) FROM UNNEST(@toks) t WHERE REGEXP_CONTAINS(hay, CONCAT(r'\\b', t, r'\\b')))`;
      const shortlistSql = `
        WITH s AS (
          SELECT sv.service_id, sv.catalogue, sv.name, sv.supplier_name, sv.url, sv.instrument_id, sup.ch_url, sup.company_number,
                 IF(sup.status_at_match IN ('dissolved','liquidation','administration','closed'), sup.status_at_match, NULL) AS exclusion_status,
                 tr.calloff_gbp, tr.calloff_count, LOWER(sv.name) AS nm,
                 LOWER(CONCAT(sv.name,' ',IFNULL(sv.description,''),' ',ARRAY_TO_STRING(sv.features,' '))) AS hay
          FROM ${tableRef("service")} sv
          LEFT JOIN ${tableRef("supplier")} sup ON sup.supplier_id = sv.supplier_id
          LEFT JOIN ${tableRef("supplier_calloff_total")} tr ON tr.supplier_crn = sup.company_number)
        SELECT service_id, catalogue, name, supplier_name, url, ch_url, exclusion_status, calloff_gbp, calloff_count, instrument_id
        FROM s WHERE ${anyHits} > 0
        ORDER BY (${anyHits} = ARRAY_LENGTH(@toks)) DESC, (5*${nameHits} + ${anyHits}) DESC, calloff_gbp DESC NULLS LAST LIMIT 3`;
      const benchSql = `SELECT ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(25)]) p25, ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(50)]) median,
          ROUND(APPROX_QUANTILES(award_amount,100)[OFFSET(75)]) p75, COUNT(*) n
        FROM ${tableRef("tender_award")} WHERE @cpv IS NOT NULL AND cpv_division=@cpv AND channel IN ('framework_call_off','dps_call_off') AND award_amount BETWEEN 0 AND 100000000`;
      const pipeSql = `SELECT buyer_name, title, ROUND(estimated_value) AS estimated_value, CAST(expected_date AS STRING) AS expected_date, official_url
        FROM ${tableRef("pipeline_notice")} WHERE (@cpv IS NULL OR cpv_division=@cpv) AND hay LIKE @kw ORDER BY expected_date LIMIT 3`;
      const [sl, bench, pipe] = await Promise.all([
        runQuery(shortlistSql, { params: { toks }, types: { toks: ["STRING"] } }),
        runQuery(benchSql, { params: { cpv }, types: { cpv: "STRING" } }),
        runQuery(pipeSql, { params: { cpv, kw }, types: { cpv: "STRING", kw: "STRING" } }),
      ]);
      const shortlist = sl.map((r) => deep(r) as Record<string, unknown>);
      if (!shortlist.length) return toolError("UNKNOWN", `No catalogue listing matched '${args.need}'. Try find_routes for the framework route, or rephrase.`);
      const iid = String(shortlist[0].instrument_id ?? "g-cloud-14");
      const mech = (await runQuery(`SELECT i.name, i.rm_reference, CAST(i.expires_on AS STRING) AS expires_on, i.official_url, i.lifecycle_status,
          ARRAY_AGG(am.mechanic ORDER BY CASE WHEN am.mechanic='call_off_no_further_competition' THEN 1 ELSE 2 END LIMIT 1)[SAFE_OFFSET(0)] AS top_mechanic
        FROM ${tableRef("instrument")} i
        LEFT JOIN ${tableRef("award_mechanic")} am ON am.instrument_id = i.instrument_id AND am.permitted
        WHERE i.instrument_id=@iid
        GROUP BY i.name, i.rm_reference, i.expires_on, i.official_url, i.lifecycle_status LIMIT 1`,
        { params: { iid }, types: { iid: "STRING" } })).map((r) => deep(r) as Record<string, unknown>)[0] ?? {};
      const b = (bench.map((r) => deep(r) as Record<string, unknown>)[0]) ?? {};
      const anyExcluded = shortlist.some((s) => s.exclusion_status);
      return ok(withFreshness({
        summary: `For "${args.need}": the recommended route is to call off the best-fit listing on ${mech.name ?? iid} (${mech.top_mechanic ?? "per the framework's mechanic"}).${anyExcluded ? " ⚠ One shortlisted supplier carries a Companies-House exclusion flag — see below." : ""}`,
        recommended_route: { instrument: mech.name ?? null, rm_reference: mech.rm_reference ?? null, mechanic: mech.top_mechanic ?? null, lifecycle_status: mech.lifecycle_status ?? null, expires_on: mech.expires_on ?? null, official_url: mech.official_url ?? null },
        indicative_price: b.n ? { p25_gbp: b.p25, median_gbp: b.median, p75_gbp: b.p75, sample_size: b.n, note: `from ${b.n} comparable CPV-${cpv} call-off awards (real spend; a range, not a quote)` } : { note: "pass a `cpv` division (e.g. '72'=IT) for a real-award price benchmark" },
        shortlisted_services: shortlist.map((s, i) => ({ rank: i + 1, name: s.name, supplier: s.supplier_name, catalogue: s.catalogue, url: s.url, ch_url: s.ch_url,
          track_record: s.calloff_gbp ? `£${s.calloff_gbp} across ${s.calloff_count} public-sector call-offs (CRN-matched)` : "no CRN-matched call-offs on record (absence of evidence, not of capability)",
          exclusion_flag: !!s.exclusion_status, exclusion_status: s.exclusion_status ?? null })),
        pipeline_to_watch: pipe.map((r) => deep(r)),
        compliance_checklist: [
          "A framework call-off is NOT a statutory direct award (PA2023 ss.41/43 don't apply to call-offs).",
          "If you run a further competition, observe the 8-working-day standstill after the contract award notice before signing.",
          "Check the s.62 debarment register and exclusion grounds (Sch 6/7) before award; re-check each supplier's LIVE Companies House status.",
          "A GPC card / marketplace billing is a settlement mechanism, NEVER the procurement route, and confers no PA2023 exemption.",
          "Confirm the instrument's live expiry, lot scope and supplier eligibility on the operator's own documentation.",
        ],
        note: "An opinionated, INDICATIVE buying brief composed from the catalogue + 658k real awards + PA2023. It recommends a route but is not legal/commercial advice, not the authority of record — you run the assessment. " + NOT_ADVICE,
        display_guidance: "Present as a brief: the recommended route + mechanic; the 3 shortlisted listings (link each url + ch_url, show the track record, LEAD any exclusion ⚠); the indicative price range; pipeline to watch; then the compliance checklist verbatim. " + DISPLAY_GUIDANCE,
      }, await freshness()));
    }),
  );

  server.registerTool(
    "spend_xray",
    {
      title: "Spend & competition x-ray",
      description:
        "RESEARCHER. 'How does public money flow in this category, and is competition healthy?' Returns spend + award counts split by channel (framework call-off vs DPS vs open tender vs direct award, with % of spend), distinct-supplier count, and top-5 suppliers' share of spend (market concentration) over a configurable lookback. High direct-award % = thin competition; high top-5 share = concentrated market. Over 658k real awards (£ ceiling outliers >£100m removed). Anti-patterns: not a pricing tool — use benchmark_price for £. Chain to benchmark_price (distribution within a channel) or due_diligence (drill into a dominant supplier).",
      inputSchema: { cpv: z.string().optional(), years: z.number().int().min(1).max(10).default(3) },
    },
    guard(async (args) => {
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
      const rows = await runQuery(sql, { params: { cpv: args.cpv ?? null, years: args.years }, types: { cpv: "STRING" } });
      if (!rows.length) return toolError("UNKNOWN", `No awards for CPV '${args.cpv ?? "(all)"}' in the window.`);
      return ok(withFreshness({ cpv: args.cpv ?? "all", years: args.years, channels: rows.map((r) => deep(r)),
        note: "Real spend split by procurement channel over the window (£ ceiling outliers >£100m removed). High framework/DPS % = spend flows through frameworks; high direct % = less competition. top5_supplier_share_pct is market concentration (low = competitive, high = concentrated). " + NOT_ADVICE,
        display_guidance: "Lead with the channel split (how much via framework vs open vs direct), then competition health from top5_supplier_share_pct and distinct_suppliers. " + DISPLAY_GUIDANCE }, await freshness()));
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
