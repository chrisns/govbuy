// Light read-only guard for query_sql. The REAL boundary is the IAM read-only SA on
// govbuy_public + maximumBytesBilled (PRD §11). This gives a fast, structured rejection
// for obviously-disallowed input — including any attempt to reach the raw write tier or
// the sibling's PII-bearing dataset directly (use the sibling_call_off_awards view).

export type SqlGuard = { ok: true; sql: string } | { ok: false; code: string; message: string };

export function validateReadOnlySql(input: string): SqlGuard {
  const sql = input.trim().replace(/;\s*$/, "");
  if (!/^(with|select)\b/i.test(sql)) {
    return { ok: false, code: "DML_REFUSED", message: "Only read-only SELECT/WITH queries are allowed." };
  }
  if (/;/.test(sql)) {
    return { ok: false, code: "DML_REFUSED", message: "Only a single statement is allowed." };
  }
  if (/\b(insert|update|delete|merge|create|drop|alter|truncate|grant|revoke)\b/i.test(sql)) {
    return { ok: false, code: "DML_REFUSED", message: "DDL/DML is not allowed." };
  }
  if (/_raw\b/i.test(sql)) {
    return { ok: false, code: "DML_REFUSED", message: "Raw write datasets are not queryable; use govbuy_public." };
  }
  if (/uk_tenders_public/i.test(sql)) {
    return { ok: false, code: "DML_REFUSED", message: "Query the sibling's award data via govbuy_public.sibling_call_off_awards, not uk_tenders_public directly." };
  }
  return { ok: true, sql };
}
