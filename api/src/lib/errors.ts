// Uniform MCP tool error envelope (PRD §9.1): { code, message, hint }.

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function toolError(code: string, message: string, hint?: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: { code, message, hint } }, null, 2) }],
    isError: true,
  };
}

export function fromException(err: unknown): ToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  if (/exceed.*maximum.*billed|bytesBilled|would be billed|bytes billed/i.test(msg)) {
    return toolError("CAP_EXCEEDED", "Query would scan more than the allowed byte cap.", "Add filters or aggregate to reduce scanned bytes.");
  }
  if (/timeout|deadline/i.test(msg)) {
    return toolError("TIMEOUT", "Query exceeded the time limit.", "Narrow the query and retry.");
  }
  if (/Syntax error|Unrecognized name|not found: Table|Name .* not found|Column .* not found/i.test(msg)) {
    console.error("query error:", msg);
    return toolError("INVALID_QUERY", "Query is invalid — syntax error or unknown table/column.", "Call get_schema to see available tables and columns.");
  }
  console.error("internal error:", msg);
  return toolError("INTERNAL", "An internal error occurred.");
}

export function guard<A extends unknown[]>(
  fn: (...args: A) => Promise<ToolResult>,
): (...args: A) => Promise<ToolResult> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      return fromException(err);
    }
  };
}
