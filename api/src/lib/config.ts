// Runtime configuration (env-overridable so the same build runs locally and on Cloud Run).

export const config = {
  project: process.env.GCP_PROJECT || "govreposcrape",
  // The ONLY dataset the API reads (ADR-0001). The sibling's award data is reached
  // through the sibling_call_off_awards authorized view that lives in this dataset.
  publicDataset: process.env.BQ_PUBLIC_DATASET || "govbuy_public",
  siblingView: process.env.SIBLING_VIEW || "sibling_call_off_awards",
  location: process.env.BQ_LOCATION || "EU",
  // Hard per-query scan cap (PRD §11). Default 2 GiB; applies to the combined cross-dataset scan.
  maxBytesBilled: process.env.MAX_BYTES_BILLED || String(2 * 1024 * 1024 * 1024),
  jobTimeoutMs: process.env.JOB_TIMEOUT_MS || "30000",
  port: parseInt(process.env.PORT || "8080", 10),
  defaultLimit: 20,
  maxLimit: 100,
  // Membership edges below this confidence (or not 'active') are returned only with an
  // explicit unconfirmed marker, never as a bare "is appointed" (PRD §9.1 / N7).
  membershipConfidenceGate: Number(process.env.MEMBERSHIP_CONF_GATE || "0.6"),
  get maxBytesHuman() {
    return `${(Number(this.maxBytesBilled) / 1024 / 1024 / 1024).toFixed(1)} GiB`;
  },
} as const;

export function tableRef(table: string): string {
  return `\`${config.project}.${config.publicDataset}.${table}\``;
}
