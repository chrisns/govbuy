// Read-only BigQuery access. In production the API's service account holds only
// dataViewer + jobUser on govbuy_public (ADR-0001); the byte cap is the cost backstop.

import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config.js";

const bq = new BigQuery({ projectId: config.project, location: config.location });

export interface QueryOpts {
  params?: Record<string, unknown>;
  types?: Record<string, string | string[]>;
  maxBytes?: string;
  maxResults?: number;
}

export async function runQuery<T = Record<string, unknown>>(
  sql: string,
  opts: QueryOpts = {},
): Promise<T[]> {
  // IMPORTANT: do NOT pass { autoPaginate: false }. That returned the first results page even when the job
  // was still running (jobComplete:false → ZERO rows), so a freshly-run / slower query (e.g. one of the ~6
  // a single `buy` fires) intermittently came back empty — a non-deterministic "no results" bug. Default
  // bq.query() polls until the job completes, so results are reliable. maxResults caps the page; every
  // query carries its own LIMIT.
  const [rows] = await bq.query({
    query: sql,
    params: opts.params,
    types: opts.types,
    location: config.location,
    // Unqualified table names resolve to govbuy_public (nicer query UX; the raw tier is a separate
    // dataset the SA can't reach anyway, so this doesn't widen access).
    defaultDataset: { datasetId: config.publicDataset, projectId: config.project },
    maximumBytesBilled: opts.maxBytes ?? config.maxBytesBilled,
    maxResults: opts.maxResults ?? 1000,
    jobTimeoutMs: Number(config.jobTimeoutMs),
  });
  return rows as T[];
}

// Estimate scanned bytes without running the query (pre-empt QUERY_TOO_LARGE).
export async function dryRunBytes(sql: string, params?: Record<string, unknown>): Promise<number> {
  const [job] = await bq.createQueryJob({
    query: sql,
    params,
    location: config.location,
    defaultDataset: { datasetId: config.publicDataset, projectId: config.project },
    dryRun: true,
    maximumBytesBilled: config.maxBytesBilled,
  });
  const bytes = (job.metadata?.statistics as { totalBytesProcessed?: string } | undefined)
    ?.totalBytesProcessed;
  return bytes ? Number(bytes) : 0;
}

// Coerce BigQuery wrapper types (BigQueryTimestamp/Date, Big.js NUMERIC) to plain JSON scalars.
export function plain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    // Big.js NUMERIC/BIGNUMERIC: { s, e, c } with a toString()
    if ("c" in v && "s" in v && "e" in v && typeof (value as { toString?: unknown }).toString === "function") {
      const n = Number((value as { toString(): string }).toString());
      return Number.isNaN(n) ? (value as { toString(): string }).toString() : n;
    }
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "value") return v.value; // BigQueryTimestamp/Date
  }
  return value;
}
