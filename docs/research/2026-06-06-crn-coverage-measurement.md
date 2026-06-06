# Measured: Companies House identifier coverage in the sibling's award data

> Empirical measurement run 2026-06-06 against `govreposcrape.uk_tenders_public.compiled_process`
> (the sibling find-tender-mcp's query-serving dataset, EU), to size govbuy's supplier-identity
> resolution build. Reproducible with the SQL below.

## Why this matters

govbuy must resolve every appointed supplier to a Companies House number (CRN). When the source data
already carries a usable CRN, resolution is free (just read it). When it doesn't, govbuy must
fuzzy-match a messy trading name → CRN — the slow, error-prone, expensive part. This measures how
often the number is already there.

## Result

**Row level** (547,616 award-supplier lines):

| Identifier scheme on `award.supplier_id` | Rows | Share |
|---|---:|---:|
| Usable Companies House CRN (`GB-COH-<valid>`) | 115,777 | **21.1%** |
| `GB-COH-` placeholder/junk (`-0`, `-TBC`, malformed) | 19,460 | 3.6% |
| `GB-FTS-` (Find a Tender publisher-internal id, **not** a CRN) | 126,613 | 23.1% |
| `GB-CFS-` (Contracts Finder publisher-internal id, **not** a CRN) | 282,097 | 51.5% |
| Distinct usable CRNs present | 28,439 | — |

**Distinct-supplier-name level** (the real sizing; naive `LOWER(TRIM(name))` dedup → 152,617 names):

| | Names | Share |
|---|---:|---:|
| Already carry a usable CRN | 40,146 | **26.3%** |
| Need fuzzy name→CRN matching | 112,471 | **73.7%** |

## Bottom line

**~1 in 5 award lines (and ~1 in 4 distinct supplier names) arrive with a usable Companies House
number; the rest carry publisher-internal IDs (`GB-CFS` ~52%, `GB-FTS` ~23%) or junk.** So govbuy
must fuzzy-match the large majority (~74% of names) of suppliers — confirming entity resolution is
the single largest engineering cost (per the domain-map open questions and ADR-0003/0004). The
matching pipeline is not an optional nicety; it is core.

## Caveats

- Naive name dedup overcounts true entities (spelling/punctuation variants inflate 152k); the *true*
  entity count is lower, but the *proportion* needing matching is directionally right and likely
  understated (variants of an already-resolved name still need matching).
- The award-supplier population ≠ the appointed-supplier population govbuy indexes, but it is the
  best available proxy **and** the exact dataset govbuy joins against — so the coverage it shows is
  the coverage govbuy inherits on the join.
- `GB-FTS`/`GB-CFS` internal IDs are stable *within* a publisher, so they can serve as a clustering
  key (all award lines for one publisher-supplier-id are the same entity) even before CRN resolution.

## Reproduce

```sql
-- name-level coverage
WITH s AS (
  SELECT LOWER(TRIM(a.supplier_name)) AS sname,
         MAX(IF(REGEXP_CONTAINS(a.supplier_id, r"^GB-COH-([A-Z]{2}[0-9]{6}|[0-9]{8})$"),1,0)) AS has_valid_coh
  FROM `govreposcrape.uk_tenders_public.compiled_process` t, UNNEST(t.awards) a
  WHERE a.supplier_name IS NOT NULL AND a.supplier_name != ""
  GROUP BY 1
)
SELECT COUNT(*) distinct_supplier_names,
       COUNTIF(has_valid_coh=1) names_with_usable_crn,
       COUNTIF(has_valid_coh=0) names_needing_fuzzy_match
FROM s;
```
