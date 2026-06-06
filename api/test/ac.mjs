// Deterministic acceptance-criteria check (PRD §16) against the live MCP server.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const c = new Client({ name: "ac", version: "0.1.0" });
await c.connect(new StreamableHTTPClientTransport(new URL(process.argv[2] || "http://localhost:8080/mcp")));
const J = async (n, a) => { const r = await c.callTool({ name: n, arguments: a }); return { err: !!r.isError, j: (() => { try { return JSON.parse(r.content[0].text); } catch { return {}; } })() }; };
let pass = 0, fail = 0;
const check = (id, cond, detail) => { console.log(`${cond ? "PASS" : "FAIL"} ${id} — ${detail}`); cond ? pass++ : fail++; };

// AC-1: get_instrument returns full structure with membership + evidence
{ const { j } = await J("get_instrument", { rm_reference: "RM1557.14" }); const i = j.instrument || {};
  const sup = (i.appointed_suppliers || [])[0];
  check("AC-1", i.lifecycle_status === "live_for_call_off" && (i.lots || []).length > 0 && (i.award_mechanics || []).length > 0 && (i.buying_docs || []).length > 0 && i.evidence,
    `G-Cloud 14: ${ (i.lots||[]).length } lots, ${ (i.award_mechanics||[]).length } mechanics, ${ (i.buying_docs||[]).length } docs, evidence=${!!i.evidence}, suppliers=${(i.appointed_suppliers||[]).length}`); }

// AC-2: find_routes returns candidates incl further-comp-only DPS + payment caveats; does not pick
{ const { j } = await J("find_routes", { need: "AI product", limit: 8 });
  const rms = (j.routes || []).map(r => r.rm_reference);
  const dps = (j.routes || []).find(r => r.rm_reference === "RM6200");
  const dpsNoDirect = dps && (dps.award_mechanics || []).some(m => m.mechanic === "call_off_no_further_competition" && m.permitted === false);
  const gpc = (j.payment_caveats || []).find(p => p.mechanism === "gpc");
  check("AC-2", j.count > 0 && rms.includes("RM1557.14") && rms.includes("RM6200") && !!gpc,
    `${j.count} routes (${rms.filter(Boolean).join(",")}); RM6200 direct-award-barred=${dpsNoDirect}; gpc caveat=${!!gpc}`); }

// AC-3: thin-prime + inbound scope; CRN snapshot
{ const { j } = await J("list_resellers", { channel_type: "thin_prime" });
  const b = (j.resellers || []).find(r => /bramble/i.test(r.display_name));
  const { j: gs } = await J("get_supplier", { name: "Bramble Hub" });
  check("AC-3", !!b && (b.inbound_scope || []).length > 0 && gs.supplier?.company_number,
    `Bramble thin-prime=${!!b}, inbound_scope=${(b?.inbound_scope||[]).length}, CRN=${gs.supplier?.company_number}`); }

// AC-4: trading name -> CRN with band; unresolved handled
{ const { j } = await J("get_supplier", { name: "Softcat" });
  const s = j.supplier || {};
  check("AC-4", !!s.company_number && !!s.match_band, `Softcat -> CRN ${s.company_number}, band ${s.match_band}`); }

// AC-5: cross-dataset join works; DML refused; direct sibling refused
{ const { j } = await J("query_sql", { sql: "SELECT i.name, COUNT(*) n FROM instrument i JOIN sibling_call_off_awards s ON UPPER(s.rm_reference)=REGEXP_EXTRACT(UPPER(i.rm_reference), r'RM[0-9]{3,5}') WHERE s.award_currency='GBP' GROUP BY 1 ORDER BY n DESC LIMIT 3" });
  const joinOk = j.row_count > 0;
  const dml = await J("query_sql", { sql: "DELETE FROM instrument" });
  const sib = await J("query_sql", { sql: "SELECT * FROM `govreposcrape.uk_tenders_public.compiled_process` LIMIT 1" });
  check("AC-5", joinOk && dml.j.error?.code === "DML_REFUSED" && sib.j.error?.code === "DML_REFUSED",
    `sibling-join rows=${j.row_count}; DELETE refused=${dml.j.error?.code}; direct-sibling refused=${sib.j.error?.code}`); }

// AC-7: get_status carries last-run cost + spend coverage
{ const { j } = await J("get_status", {});
  check("AC-7", j.last_run && j.last_run.est_gbp !== undefined && j.last_run.spend_coverage_pct !== undefined,
    `last_run cost £${j.last_run?.est_gbp}, coverage ${j.last_run?.spend_coverage_pct}%, sources=${(j.sources||[]).length}`); }

console.log(`\n${pass} PASS / ${fail} FAIL (MCP-layer ACs)`);
await c.close();
