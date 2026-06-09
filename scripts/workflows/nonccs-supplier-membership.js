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
          access_barrier: { type: 'string' },
          barrier_url: { type: 'string' },
        },
        required: ['instrument_id', 'operator_id', 'url', 'found', 'suppliers', 'evidence_text', 'note', 'access_barrier', 'barrier_url'],
      },
    },
  },
  required: ['results'],
}

const prompt = (offset) => `You extract the APPOINTED / AWARDED SUPPLIER LIST from UK public-sector procurement framework web pages.

STEP 1 — get your batch of frameworks by running exactly this query (it returns only frameworks that do NOT yet have a supplier list, so the sweep is idempotent and re-runs only fill gaps):
  bq query --use_legacy_sql=false --project_id=govreposcrape --location=EU --format=json 'SELECT instrument_id i, operator_id o, name n, official_url u FROM \`govreposcrape.govbuy_public.instrument\` i WHERE operator_id!="gca" AND official_url IS NOT NULL AND official_url!="" AND instrument_id NOT IN (SELECT DISTINCT instrument_id FROM \`govreposcrape.govbuy_public.appointed_supplier\`) ORDER BY operator_id, instrument_id LIMIT ${B} OFFSET ${offset}'

STEP 2 — for EACH framework row, fetch its url (u) and find the list of suppliers appointed to THAT framework. Look for sections headed "Suppliers", "Appointed suppliers", "Awarded suppliers", "Approved suppliers", "Framework suppliers", supplier directories, or per-lot supplier tables. Prefer the clean-text extractor: \`defuddle parse <url> --md\` (fall back to \`curl -sL -A "govbuy/0.1 (chris@cns.me.uk)" <url>\`). Do not follow more than one link deep.

PDF SUPPLIER LISTS — if the page links to a PDF that holds the supplier/contractor list (e.g. "supplier list", "appointed contractors", "award notice", a Schedule), DOWNLOAD and READ it:
  curl -sL -A "govbuy/0.1 (chris@cns.me.uk)" "<pdf-url>" -o /tmp/fw_${offset}.pdf && pdftotext -layout /tmp/fw_${offset}.pdf - | head -c 20000
Extract supplier names from the PDF text exactly as for a web page (the PDF text becomes your evidence_text). pdftotext is at /opt/homebrew/bin/pdftotext.

Be efficient — this is one of ~110 parallel workers.

STEP 3 — return one result object per framework:
- instrument_id, operator_id, url: copied exactly from the query row (i, o, u).
- found: true ONLY if the page (or its linked PDF) actually names supplier companies for this framework.
- suppliers: the supplier company names copied VERBATIM as they appear (exact spelling/punctuation/case). De-duplicate. Cap 400.
- evidence_text: a VERBATIM contiguous copy of the on-page (or PDF) text region that contains those names, so every name is a literal substring of it. Max 12000 chars. THIS IS THE ANTI-FABRICATION ANCHOR — any supplier name not present in evidence_text is rejected downstream.
- note: short human reason (e.g. "extracted from PDF award notice", "no supplier list on page").
- access_barrier: WHY you could not get the list (for the gaps inventory). EXACTLY one of:
    "none"        — you got the suppliers (found=true), or the page genuinely lists none;
    "login"       — the supplier list sits behind a members/buyers login, registration, or access-agreement wall;
    "pdf_unreadable" — a PDF that could not be downloaded or yielded no text (scanned/image PDF);
    "blocked"     — 403/anti-bot/JS-only page the fetch could not render;
    "no_list"     — page loaded fine but simply does not publish a supplier list;
    "notfound"    — 404 / dead link.
- barrier_url: when access_barrier="login", the exact login/registration URL a human would need credentials for (else "").

ABSOLUTE RULE: never invent or infer a supplier name. Only names that literally appear in the fetched page or PDF. If no usable list, set found=false, suppliers=[], evidence_text="", and set access_barrier honestly. Return a result for EVERY framework in your batch (${B} rows, or fewer if the query returns fewer).`

const raw = await parallel(offsets.map((off, idx) => () =>
  agent(prompt(off), { label: `nccs:${idx}`, phase: 'Extract', schema: SCHEMA, model: 'haiku' }).catch(() => null)
))

// ---- assemble a source-anchored bundle (gate enforces excerpt ⊂ evidence_text at load) ----
const slug = (s) => 'sup-' + (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)
const documents = [], facts = [], gaps = []
let frameworksFound = 0, edges = 0, batchesOk = 0
for (const item of raw) {
  if (!item || !Array.isArray(item.results)) continue
  batchesOk++
  for (const res of item.results) {
    if (!res.found || !res.evidence_text || !Array.isArray(res.suppliers) || !res.suppliers.length) {
      // record WHY this framework still has no supplier list (gap inventory for the user)
      if (res.instrument_id && res.access_barrier && res.access_barrier !== 'none')
        gaps.push({ instrument_id: res.instrument_id, operator_id: res.operator_id || '', url: res.url || '',
                    access_barrier: res.access_barrier, barrier_url: res.barrier_url || '', note: (res.note || '').slice(0, 200) })
      continue
    }
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
const byBarrier = {}
for (const g of gaps) byBarrier[g.access_barrier] = (byBarrier[g.access_barrier] || 0) + 1
log(`batches ok: ${batchesOk}/${offsets.length}; frameworks with suppliers: ${frameworksFound}; supplier edges: ${edges}; gaps by barrier: ${JSON.stringify(byBarrier)}`)
return { run_id: 'nccs-supplier-membership', mode: 'refresh', frameworksFound, edges, batchesOk, batches: offsets.length, byBarrier, gaps, documents, facts }
