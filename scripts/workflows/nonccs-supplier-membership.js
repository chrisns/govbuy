export const meta = {
  name: 'nonccs-supplier-membership',
  description: 'Extract appointed-supplier lists from non-CCS framework pages (source-anchored, gated)',
  phases: [{ title: 'Extract', detail: 'fetch each framework page; copy its supplier list verbatim' }],
}

// args: { today: "YYYY-MM-DD", total: <int>, batchSize: <int> }
const today = (args && args.today) || '2026-06-07'
const total = (args && args.total) || 1650
const B = (args && args.batchSize) || 15
const offsets = []
for (let o = 0; o < total; o += B) offsets.push(o)
log(`non-CCS supplier sweep: ${total} frameworks in ${offsets.length} batches of ${B}`)

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
          suppliers: { type: 'array', items: { type: 'string' } },
          evidence_text: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['instrument_id', 'operator_id', 'url', 'found', 'suppliers', 'evidence_text', 'note'],
      },
    },
  },
  required: ['results'],
}

const prompt = (offset) => `You extract the APPOINTED / AWARDED SUPPLIER LIST from UK public-sector procurement framework web pages.

STEP 1 — get your batch of frameworks by running exactly this query:
  bq query --use_legacy_sql=false --project_id=govreposcrape --location=EU --format=json 'SELECT instrument_id i, operator_id o, name n, official_url u FROM \`govreposcrape.govbuy_public.instrument\` WHERE operator_id!="gca" AND official_url IS NOT NULL AND official_url!="" ORDER BY operator_id, instrument_id LIMIT ${B} OFFSET ${offset}'

STEP 2 — for EACH framework row, fetch its url (u) and find the list of suppliers appointed to THAT framework. Look for sections headed "Suppliers", "Appointed suppliers", "Awarded suppliers", "Approved suppliers", "Framework suppliers", supplier directories, or per-lot supplier tables. Prefer the clean-text extractor: \`defuddle parse <url> --md\` (fall back to \`curl -sL -A "govbuy/0.1 (chris@cns.me.uk)" <url>\`). Do not follow more than one link deep. Be efficient — this is one of ~110 parallel workers.

STEP 3 — return one result object per framework:
- instrument_id, operator_id, url: copied exactly from the query row (i, o, u).
- found: true ONLY if the page actually names supplier companies for this framework.
- suppliers: the supplier company names copied VERBATIM as they appear (exact spelling/punctuation/case). De-duplicate. Cap 400.
- evidence_text: a VERBATIM contiguous copy of the on-page text region that contains those names, so every name is a literal substring of it. Max 12000 chars. THIS IS THE ANTI-FABRICATION ANCHOR — any supplier name not present in evidence_text is rejected downstream, so make sure each name you list actually appears in the text you paste here.
- note: short reason when found=false (e.g. "no supplier list on page", "PDF only", "404/blocked", "portal login required").

ABSOLUTE RULE: never invent or infer a supplier name. Only names that literally appear in the fetched page. If a page has no usable supplier list, set found=false, suppliers=[], evidence_text="". Return a result for every framework in your batch (${B} rows, or fewer if the query returns fewer).`

const raw = await parallel(offsets.map((off, idx) => () =>
  agent(prompt(off), { label: `nccs:${idx}`, phase: 'Extract', schema: SCHEMA }).catch(() => null)
))

// ---- assemble a source-anchored bundle (gate enforces excerpt ⊂ evidence_text at load) ----
const slug = (s) => 'sup-' + (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)
const documents = [], facts = []
let frameworksFound = 0, edges = 0, batchesOk = 0
for (const item of raw) {
  if (!item || !Array.isArray(item.results)) continue
  batchesOk++
  for (const res of item.results) {
    if (!res.found || !res.evidence_text || !Array.isArray(res.suppliers) || !res.suppliers.length) continue
    if (!res.instrument_id || !res.operator_id) continue
    frameworksFound++
    const docId = 'nccs-sup-' + res.instrument_id
    documents.push({
      document_id: docId, url: res.url || '', source_id: res.operator_id, operator_id: res.operator_id,
      content_type: 'text/plain', licence: 'operator_tos', text: res.evidence_text.slice(0, 12000),
    })
    const seen = new Set()
    for (const name of res.suppliers) {
      const nm = (name || '').trim()
      if (!nm || nm.length < 2) continue
      const sid = slug(nm)
      if (!sid || seen.has(sid)) continue
      seen.add(sid)
      const ev = { source_url: res.url || '', source_kind: 'operator_site', excerpt: nm, licence: 'operator_tos', confidence: 0.9 }
      facts.push({ fact_type: 'supplier', subject_ref: sid, document_id: docId,
        payload: { supplier_id: sid, display_name: nm, publisher_ids: [] }, evidence: ev, confidence: 0.9 })
      facts.push({ fact_type: 'appointment_observation', subject_ref: `${sid}@${res.instrument_id}`, document_id: docId,
        payload: { instrument_id: res.instrument_id, lot_id: null, supplier_id: sid, source_id: res.operator_id,
                   observed_on: today, observed_present: true, confidence: 0.9 }, evidence: ev, confidence: 0.9 })
      edges++
    }
  }
}
log(`batches ok: ${batchesOk}/${offsets.length}; frameworks with suppliers: ${frameworksFound}; supplier edges: ${edges}`)
return { run_id: 'nccs-supplier-membership', mode: 'refresh', frameworksFound, edges, batchesOk, batches: offsets.length, documents, facts }
