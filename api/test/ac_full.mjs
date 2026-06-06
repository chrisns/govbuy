// Live acceptance checks AC-1..AC-9, AC-11 against the running MCP server.
// (AC-7 ledger by_operator, AC-10 reproject are checked by scripts/acceptance.sh.)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const c = new Client({ name: "ac-full", version: "0.1.0" });
await c.connect(new StreamableHTTPClientTransport(new URL(process.argv[2] || "http://localhost:8080/mcp")));
const J = async (n, a) => { const r = await c.callTool({ name: n, arguments: a }); return { err: !!r.isError, j: (() => { try { return JSON.parse(r.content[0].text); } catch { return {}; } })() }; };
let pass = 0, fail = 0;
const ck = (id, cond, d) => { console.log(`${cond ? "PASS" : "FAIL"} ${id} — ${d}`); cond ? pass++ : fail++; };

{ const { j } = await J("get_instrument", { rm_reference: "RM1557.14" }); const i = j.instrument || {};
  ck("AC-1", i.lifecycle_status === "live_for_call_off" && (i.lots || []).length > 0 && (i.award_mechanics || []).length > 0 && (i.buying_docs || []).length > 0 && !!i.evidence,
    `G-Cloud 14: ${(i.lots || []).length} lots, ${(i.award_mechanics || []).length} mechanics, evidence=${!!i.evidence}`); }

{ const { j } = await J("find_routes", { need: "AI product", limit: 40 }); const rms = (j.routes || []).map(r => r.rm_reference);
  const dps = (j.routes || []).find(r => r.rm_reference === "RM6200");
  const barred = dps && (dps.award_mechanics || []).some(m => m.mechanic === "call_off_no_further_competition" && m.permitted === false);
  ck("AC-2", j.count > 0 && rms.includes("RM1557.14") && rms.includes("RM6200") && barred && (j.payment_caveats || []).some(p => p.mechanism === "gpc"),
    `${j.count} routes; RM6200 direct-award-barred=${barred}; gpc-caveat=${(j.payment_caveats || []).some(p => p.mechanism === "gpc")}`); }

{ const { j } = await J("list_resellers", { channel_type: "thin_prime" }); const b = (j.resellers || []).find(r => /bramble/i.test(r.display_name));
  const { j: gs } = await J("get_supplier", { name: "Bramble Hub" });
  ck("AC-3", !!b && (b.inbound_scope || []).length > 0 && !!gs.supplier?.company_number, `Bramble inbound_scope=${(b?.inbound_scope || []).length}, CRN=${gs.supplier?.company_number}`); }

{ const { j } = await J("get_supplier", { name: "Softcat" }); const s = j.supplier || {};
  ck("AC-4", !!s.company_number && !!s.match_band, `Softcat CRN ${s.company_number} band ${s.match_band}`); }

{ const join = await J("query_sql", { sql: "SELECT i.name, COUNT(*) n FROM instrument i JOIN sibling_call_off_awards s ON UPPER(s.rm_reference)=REGEXP_EXTRACT(UPPER(i.rm_reference),r'RM[0-9]{3,5}') WHERE s.award_currency='GBP' GROUP BY 1 ORDER BY n DESC LIMIT 3" });
  const dml = await J("query_sql", { sql: "DELETE FROM instrument" });
  const sib = await J("query_sql", { sql: "SELECT * FROM `govreposcrape.uk_tenders_public.compiled_process` LIMIT 1" });
  ck("AC-5", join.j.row_count > 0 && dml.j.error?.code === "DML_REFUSED" && sib.j.error?.code === "DML_REFUSED",
    `join rows=${join.j.row_count}; DELETE=${dml.j.error?.code}; direct-sibling=${sib.j.error?.code}`); }

{ const { j } = await J("query_sql", { sql: "SELECT (SELECT COUNTIF(evidence_id NOT IN (SELECT evidence_id FROM claim_evidence)) FROM instrument) AS i_orph, (SELECT COUNTIF(evidence_id NOT IN (SELECT evidence_id FROM claim_evidence)) FROM award_mechanic) AS m_orph, (SELECT COUNT(*) FROM claim_evidence) AS ev" });
  const r = j.rows?.[0] || {};
  ck("AC-6", r.i_orph === 0 && r.m_orph === 0 && r.ev > 0, `evidence rows=${r.ev}, instrument orphans=${r.i_orph}, mechanic orphans=${r.m_orph}`); }

{ const { j } = await J("get_status", {}); const lr = j.last_run || {};
  ck("AC-7", lr.est_gbp !== undefined && lr.est_gbp !== null && lr.spend_coverage_pct !== undefined,
    `last_run cost £${lr.est_gbp}; index_size=${JSON.stringify(j.index_size)}`); }

{ const { j } = await J("get_status", {}); const health = (j.sources || []).map(s => s.health);
  const reds = (j.sources || []).filter(s => s.health === "red").length, greens = (j.sources || []).filter(s => s.health === "green").length;
  const q = await J("query_sql", { sql: "SELECT COUNT(*) n FROM instrument" });
  ck("AC-8", reds >= 1 && greens >= 1 && q.j.row_count === 1, `red=${reds} green=${greens}; queries-unaffected=${q.j.row_count === 1}`); }

{ const { j } = await J("get_status", {}); const pct = j.last_run?.spend_coverage_pct ?? 0;
  ck("AC-9", pct >= 80, `spend_coverage_pct=${pct}% (>=80)`); }

{ const { j } = await J("get_instrument", { rm_reference: "RM1557.14" });
  const conf = (j.instrument?.appointed_suppliers || []).find(s => s.conflict === true || s.membership?.conflict === true);
  ck("AC-11", !!conf, conf ? `conflict surfaced: ${conf.display_name} status=${conf.status}` : "no conflict edge"); }

console.log(`\nMCP-layer: ${pass} PASS / ${fail} FAIL`);
await c.close();
process.exit(fail > 0 ? 1 : 0);
