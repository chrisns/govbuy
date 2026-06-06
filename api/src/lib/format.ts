// Result shaping, the source-anchored evidence block, the membership qualifier (PRD §9.1),
// and the per-source freshness envelope (PRD §9.1 / §15).

import { runQuery, plain } from "./bigquery.js";
import { config, tableRef } from "./config.js";

export type ResultMode = "minimal" | "standard" | "full";

export function p(v: unknown): unknown {
  return plain(v);
}

// Correlated subquery that resolves an evidence_id column to a source-anchored STRUCT.
// Every asserted fact carries one (PRD §10 / ADR-0004).
export function evid(idExpr: string): string {
  return `(SELECT AS STRUCT e.source_url, e.source_kind, e.excerpt, e.licence, e.confidence
           FROM ${tableRef("claim_evidence")} e WHERE e.evidence_id = ${idExpr})`;
}

// Membership qualifier (N7): an edge below the confidence gate or not 'active' is returned
// only with unconfirmed=true — never a bare "is appointed". Conflicts are surfaced.
export function membership(row: Record<string, unknown>): Record<string, unknown> {
  const confidence = Number(p(row.confidence) ?? 0);
  const status = (row.status as string) ?? "unconfirmed";
  const conflict = Boolean(row.conflict);
  const unconfirmed = status !== "active" || confidence < config.membershipConfidenceGate;
  return {
    status,
    as_of: p(row.last_seen_on),
    appointed_from: p(row.appointed_from),
    left_on: p(row.left_on),
    confidence,
    conflict,
    unconfirmed,
    ...(unconfirmed ? { note: "Unconfirmed/low-confidence membership — verify on the official source." } : {}),
  };
}

// Deep-coerce BigQuery wrapper types (Big.js NUMERIC, Timestamp/Date) in nested arrays/structs.
export function deep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deep);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("c" in v && "s" in v && "e" in v && typeof (value as { toString?: unknown }).toString === "function") {
      const n = Number((value as { toString(): string }).toString());
      return Number.isNaN(n) ? (value as { toString(): string }).toString() : n;
    }
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "value") return deep(v.value);
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, deep(val)]));
  }
  return value;
}

// ----------------------------------------------------------------- freshness
interface StatusRow {
  source_id: string;
  operator_id: string | null;
  health: string | null;
  last_success_at: unknown;
  last_run_at: unknown;
  last_run_status: string | null;
  facts_total: number | null;
  spend_coverage_note: string | null;
}
interface RunRow {
  mode: string;
  finished_at: unknown;
  status: string;
  docs_seen: number | null;
  facts_committed: number | null;
  est_gbp: unknown;
  spend_coverage_pct: unknown;
}

let cache: { at: number; data: unknown } | null = null;
const TTL_MS = 60_000;

export async function freshness(): Promise<unknown> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  let sources: StatusRow[] = [];
  let lastRun: RunRow | null = null;
  try {
    sources = await runQuery<StatusRow>(
      `SELECT source_id, operator_id, health, last_success_at, last_run_at, last_run_status, facts_total, spend_coverage_note
       FROM ${tableRef("source_status")} ORDER BY source_id`,
    );
  } catch { sources = []; }
  try {
    const r = await runQuery<RunRow>(
      `SELECT mode, finished_at, status, docs_seen, facts_committed, est_gbp, spend_coverage_pct
       FROM ${tableRef("run_summary")} ORDER BY finished_at DESC LIMIT 1`,
    );
    lastRun = r[0] ?? null;
  } catch { lastRun = null; }

  // Landscape size (count coverage) — distinct from Pareto spend coverage.
  let indexSize: Record<string, unknown> | null = null;
  try {
    const s = await runQuery(
      `SELECT (SELECT COUNT(*) FROM ${tableRef("operator")}) AS operators,
              (SELECT COUNT(*) FROM ${tableRef("instrument")}) AS instruments,
              (SELECT COUNTIF(lifecycle_status='live_for_call_off') FROM ${tableRef("instrument")}) AS live_instruments,
              (SELECT COUNT(*) FROM ${tableRef("supplier")}) AS suppliers,
              (SELECT COUNT(*) FROM ${tableRef("appointed_supplier")}) AS appointed_supplier_edges`,
    );
    indexSize = s[0] ? Object.fromEntries(Object.entries(s[0]).map(([k, v]) => [k, p(v)])) : null;
  } catch { indexSize = null; }

  const shaped = sources.map((s) => ({
    source_id: s.source_id,
    operator_id: s.operator_id,
    health: s.health,
    last_success_at: p(s.last_success_at),
    last_run_status: s.last_run_status,
    facts_total: s.facts_total,
    spend_coverage_note: s.spend_coverage_note,
  }));
  const worst = shaped.reduce<unknown>((acc, s) => {
    const v = s.last_success_at;
    if (!acc) return v;
    return v && String(v) < String(acc) ? v : acc;
  }, null);
  const degraded = shaped.filter((s) => s.health !== "green").map((s) => s.source_id);
  const data = {
    data_current_as_of: worst,
    degraded_or_excluded_sources: degraded,
    sources: shaped,
    last_run: lastRun
      ? {
          mode: lastRun.mode,
          finished_at: p(lastRun.finished_at),
          status: lastRun.status,
          docs_seen: lastRun.docs_seen,
          facts_committed: lastRun.facts_committed,
          est_gbp: p(lastRun.est_gbp),
          spend_coverage_pct: p(lastRun.spend_coverage_pct),
        }
      : null,
    index_size: indexSize,
    note: "Route-to-market index — NOT legal advice and not the authority of record. spend_coverage_pct is of RM-attributable (GCA) spend; index_size is landscape (count) coverage across all providers. Verify every buying rule on the official source linked in each result's evidence.",
  };
  cache = { at: Date.now(), data };
  return data;
}

export function withFreshness<T extends Record<string, unknown>>(payload: T, fresh: unknown): T & { freshness: unknown } {
  return { ...payload, freshness: fresh };
}
