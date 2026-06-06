import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const c = new Client({ name: "all", version: "0.1.0" });
await c.connect(new StreamableHTTPClientTransport(new URL("http://localhost:8080/mcp")));
let pass=0, fail=0;
async function call(n, a) {
  const r = await c.callTool({ name: n, arguments: a });
  const t = r.content?.[0]?.text ?? "";
  const ferr = r.isError;
  if (ferr) { fail++; console.log(`FAIL ${n}: ${t.slice(0,160)}`); }
  else { pass++; console.log(`ok   ${n}(${JSON.stringify(a)}) -> ${t.length}b`); }
  return t;
}
await call("find_routes", { need: "AI", limit: 3 });
await call("get_instrument", { rm_reference: "RM1557.14" });
await call("get_instrument", { id: "ai-dps-rm6200" });
await call("find_instruments_to_list", { product: "AI", openOnly: true });
await call("list_resellers", { channel_type: "thin_prime" });
await call("list_resellers", { channel_type: "var" });
await call("get_supplier", { name: "Bramble Hub" });
await call("get_status", {});
await call("get_schema", {});
await call("query_sql", { sql: "SELECT i.name, s.display_name, aps.status FROM `govreposcrape.govbuy_public.appointed_supplier` aps JOIN `govreposcrape.govbuy_public.instrument` i USING(instrument_id) JOIN `govreposcrape.govbuy_public.supplier` s USING(supplier_id) LIMIT 5" });
console.log(`\nPASS=${pass} FAIL=${fail}`);
await c.close();
