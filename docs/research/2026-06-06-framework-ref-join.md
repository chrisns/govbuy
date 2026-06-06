# Resolved (PRD §14): how to join a govbuy instrument to sibling call-off award lines

> Workflow `ocds-framework-ref-verification` (2026-06-06), run live against
> `govreposcrape.uk_tenders_public.compiled_process`. This closes the PRD §14 gating verification
> and unblocks the `sibling_call_off_awards` framework-reference columns + the §15 spend metric.

## Structural fact
The sibling's `compiled_process` exposes scalar columns only (ocid, title, description,
awarded_amount, awards[], parties[], compiled_json, …). There is **no** `relatedProcesses` /
`procurementMethodDetails` / `techniques` column — those OCDS fields live **only inside the
`compiled_json` STRING** and are reached with `JSON_QUERY`/`JSON_VALUE`. No re-ingestion needed.

## The join key — layered (no single field both flags a call-off and carries a usable parent key)
Resolution order per award line:
1. **Canonical pointer (authoritative when present):** `relatedProcesses[]` where `relationship`
   contains `framework` and `scheme='ocid'` → `.identifier` = parent framework OCID. OCDS-correct
   and identical for direct call-offs and mini-competitions, **but negligible coverage**.
2. **Operative key (scales):** `REGEXP_EXTRACT(UPPER(title||' '||description), r'RM[0-9]{3,5}')` →
   join to the `instrument.rm_reference` **stem** (strip the lot suffix: `RM1557.14`→`RM1557`).
   Disambiguate the iteration (G-Cloud 12→13→14→15 are distinct instruments) by award
   `published_date` vs `instrument.starts_on`/`expires_on`.
3. **Call-off detector (flag, not key):** `JSON_VALUE(compiled_json,'$.tender.procurementMethodDetails')
   = 'Call-off from a framework agreement'`.

## Coverage (honest §15 denominator) — 463,226 awarded rows / £2,863.9bn total
| Construct | Rows | % rows | Attributable £ | % spend |
|---|---:|---:|---:|---:|
| relatedProcesses framework/ocid pointer | 70 | 0.015% | £6.0M | 0.0002% |
| **RM-number in title/description** | 20,492 | 4.4% | **£321.3bn** | **11.2%** |
| procurementMethodDetails = call-off flag | 109,299 | 23.6% | £261.2bn | 9.1% |

- The RM-number carries **more** attributable spend than the call-off flag (£321bn vs £261bn) — high-value CCS/GCA frameworks name their RM number.
- **§15 denominator** = awarded value of rows where (RM-number present **∪** call-off flag true).
  **Numerator** = that value whose instrument govbuy has resolved to an `instrument_id`.
- Source-skewed: contracts_finder (~80% of rows) carries flag + RM-codes, never the pointer; FTS holds essentially all structured pointers.

## Implemented
`sql/schema.sql` `sibling_call_off_awards` now surfaces `framework_ocid`, `rm_reference`,
`is_framework_call_off` (parsing `compiled_json` for relatedProcesses/procurementMethodDetails only —
`contactPoint` still never exposed). The harness `coverage` mode computes the §15 metric from this.

## Fallback (~76% of rows have neither key)
For rows with `is_framework_call_off=TRUE` but no RM/pointer: heuristic edge on
buyer + supplier + value-band + `cpv_division` + time-window, matched against instruments whose
`appointed_supplier` set contains that `supplier_id`. Attribute with stated confidence; never silently.

## Note
`instrument` has no OCID column yet; to use key (1) add an establishment-notice OCID to `instrument`
or a small OCID→instrument_id map. Until then the RM-stem is the operative join.
