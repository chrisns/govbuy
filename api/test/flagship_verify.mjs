import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const c = new Client({ name: "flagship", version: "0.1.0" });
await c.connect(new StreamableHTTPClientTransport(new URL("http://localhost:8080/mcp")));

async function call(n, a) {
  const r = await c.callTool({ name: n, arguments: a });
  const t = r.content?.[0]?.text ?? "";
  console.log(`\n===== ${n}(${JSON.stringify(a)}) isError=${r.isError} len=${t.length} =====`);
  console.log(t);
  return t;
}

// BUYER JOURNEY
await call("find_routes", { need: "AI product" });
await call("get_instrument", { rm_reference: "RM1557.14" });
await call("get_instrument", { id: "ai-dps-rm6200" });

// SELLER JOURNEY
await call("find_instruments_to_list", { product: "AI" });
await call("list_resellers", { channel_type: "thin_prime" });
await call("get_supplier", { name: "Bramble Hub" });

await c.close();
