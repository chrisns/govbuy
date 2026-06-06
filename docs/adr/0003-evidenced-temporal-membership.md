# Appointed-supplier membership is a derived, evidenced, temporal relation

**Status:** accepted (2026-06-06)

There is no authoritative source for "who is currently appointed to instrument X, lot Y": award
notices miss leavers and often bury per-lot lists in PDF attachments, operator pages go stale, and
the G-Cloud catalogue is a scrape. So govbuy models membership as a **derived relation**, never
asserted as ground truth. Each appointed-supplier edge carries: the contributing **source(s) +
cited excerpt**, a **confidence**, and a **validity window** (`observed_on`, best-effort
`appointed_from`, `left_on`). Where sources disagree (e.g. the G-Cloud catalogue lists a supplier a
framework award notice's PDF does not), the **conflict is surfaced, not silently merged**.

**Why:** it is the only honest representation of imperfect, disagreeing, differently-timed sources;
it also makes "who joined/left this instrument" and "who was on the predecessor framework" first-class
queryable facts rather than lost history.

**Considered and rejected:** (a) single-source-of-truth per instrument (take the most authoritative
source verbatim, no reconciliation) — brittle and cannot express disagreement; (b) current-snapshot
overwritten nightly — simplest, but discards all history, provenance and conflict.

**Consequences:** the schema is heavier (per-edge provenance + temporality) and queries must reason
about confidence and as-of dates rather than a flat list; callers (and tool descriptions) must be told
that membership is evidenced, point-in-time and occasionally conflicting.
