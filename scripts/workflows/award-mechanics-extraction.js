export const meta = {
  name: 'award-mechanics-extraction',
  description: 'Extract how-to-call-off (direct award vs further competition) per framework, source-anchored',
  phases: [{ title: 'Extract', detail: 'fetch each framework page; read off its call-off routes' }],
}

// Idempotent: only non-GCA frameworks that have an official_url and no award_mechanic yet.
const B = 15
const TOTAL = 4096 // upper bound; the gap query caps actual rows. extra offsets return empty.
const offsets = []
for (let o = 0; o < TOTAL; o += B) offsets.push(o)
log(`award-mechanics sweep: up to ${offsets.length} batches of ${B} (gap-filtered)`)

const ALLOWED = ['call_off_no_further_competition', 'further_competition', 'competitive_flexible_procedure']

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          instrument_id: { type: 'string' },
          operator_id: { type: 'string' },
          url: { type: 'string' },
          found: { type: 'boolean' },
          evidence_text: { type: 'string' },
          mechanics: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                mechanic: { type: 'string' },
                permitted: { type: 'boolean' },
                quote: { type: 'string' },
              },
              required: ['mechanic', 'permitted', 'quote'],
            },
          },
          note: { type: 'string' },
        },
        required: ['instrument_id', 'operator_id', 'url', 'found', 'evidence_text', 'mechanics', 'note'],
      },
    },
  },
  required: ['results'],
}

const prompt = (offset) => `You determine HOW A BUYER CALLS OFF from a UK public-sector framework agreement — the award mechanics.

STEP 1 — get your batch (only frameworks still missing call-off info):
  bq query --use_legacy_sql=false --project_id=govreposcrape --location=EU --format=json 'SELECT instrument_id i, operator_id o, name n, official_url u FROM \`govreposcrape.govbuy_public.instrument\` i WHERE operator_id!="gca" AND official_url IS NOT NULL AND official_url!="" AND instrument_id NOT IN (SELECT DISTINCT instrument_id FROM \`govreposcrape.govbuy_public.award_mechanic\`) ORDER BY operator_id, instrument_id LIMIT ${B} OFFSET ${offset}'

If the query returns 0 rows, return {results: []}.

STEP 2 — for EACH framework, fetch its url (\`defuddle parse <url> --md\` or \`curl -sL -A "govbuy/0.1 (chris@cns.me.uk)" <url>\`) and read how buyers call off. The two routes to detect:
- call_off_no_further_competition  (a.k.a. "direct award", "direct call-off", "direct selection") — permitted if the framework lets a buyer award directly without re-opening competition.
- further_competition  (a.k.a. "mini-competition", "mini comp", "further competition", "secondary competition") — permitted if buyers run a competition among appointed suppliers.
(competitive_flexible_procedure only for PA2023 dynamic markets.)

STEP 3 — per framework return: instrument_id, operator_id, url (copy from the query row i,o,u); found (true if the page states the call-off route); mechanics: one entry per route you can evidence, each with mechanic (one of: ${ALLOWED.join(', ')}), permitted (true/false), and quote — a VERBATIM phrase from the page proving it; evidence_text: a verbatim contiguous on-page region containing those quotes (max 4000 chars); note (reason if found=false).

ABSOLUTE RULE: only assert a mechanic if the page actually says so — each quote MUST be a literal substring of evidence_text. If the page does not describe call-off routes, found=false, mechanics=[]. Many framework pages DO say "available via direct award or further competition" — capture that. Return a result for every framework in your batch.`

const results = await parallel(offsets.map((off, idx) => () =>
  agent(prompt(off), { label: `mech:${idx}`, phase: 'Extract', schema: SCHEMA, model: 'haiku' }).catch(() => null)
))

const documents = [], facts = []
let fwFound = 0, mechCount = 0
for (const item of results) {
  if (!item || !Array.isArray(item.results)) continue
  for (const res of item.results) {
    if (!res.found || !res.evidence_text || !Array.isArray(res.mechanics) || !res.mechanics.length) continue
    if (!res.instrument_id || !res.operator_id) continue
    const docId = 'mech-' + res.instrument_id
    documents.push({ document_id: docId, url: res.url || '', source_id: res.operator_id, operator_id: res.operator_id, content_type: 'text/plain', licence: 'operator_tos', text: res.evidence_text.slice(0, 4000) })
    let any = false
    const seen = new Set()
    for (const m of res.mechanics) {
      if (!ALLOWED.includes(m.mechanic) || !m.quote) continue
      if (seen.has(m.mechanic)) continue
      seen.add(m.mechanic)
      const ev = { source_url: res.url || '', source_kind: 'operator_site', excerpt: m.quote, licence: 'operator_tos', confidence: 0.85 }
      facts.push({ fact_type: 'award_mechanic', subject_ref: `${res.instrument_id}-${m.mechanic}`, document_id: docId,
        payload: { instrument_id: res.instrument_id, lot_id: null, mechanic: m.mechanic, permitted: !!m.permitted, conditions: m.quote.slice(0, 300) },
        evidence: ev, confidence: 0.85 })
      mechCount++; any = true
    }
    if (any) fwFound++
  }
}
log(`frameworks with call-off info: ${fwFound}; award_mechanic facts: ${mechCount}`)
return { run_id: 'award-mechanics', mode: 'refresh', fwFound, mechCount, documents, facts }
