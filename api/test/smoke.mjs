// Smoke test: list tools and call a few against a running govbuy MCP endpoint.
// Usage: node test/smoke.mjs http://localhost:8080/mcp
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.argv[2] || "http://localhost:8080/mcp";
const client = new Client({ name: "govbuy-smoke", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  console.log(`\n=== ${name}(${JSON.stringify(args)}) ${r.isError ? "[error]" : ""} ===`);
  console.log(text.slice(0, 1200));
}

await call("get_status");
await call("get_schema");
await call("find_routes", { need: "AI", limit: 5 });
await call("list_resellers", { channel_type: "thin_prime" });
await call("query_sql", { sql: "SELECT mechanism, is_route FROM `govreposcrape.govbuy_public.payment_mechanism` LIMIT 5" });
await call("query_sql", { sql: "DELETE FROM `govreposcrape.govbuy_public.instrument`" }); // must be refused

await client.close();
console.log("\nsmoke done");
