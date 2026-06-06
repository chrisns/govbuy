export const meta = {
  name: 'govbuy-topspend-framework-enrichment',
  description: 'Discover the real identity of the top-spend RM frameworks (the Pareto head of UK framework spend) and emit them as source-anchored instrument records, so govbuy covers >=80% of framework-attributable spend. One agent per batch of 5 RM numbers; verbatim excerpts (the gate verifies on load).',
  phases: [{ title: 'Enrich', detail: '5 agents identify 25 top-spend RM frameworks -> instrument facts' }],
}
const FACT = {
  type: 'object', additionalProperties: false,
  properties: {
    fact_type: { type: 'string', enum: ['instrument'] }, subject_ref: { type: 'string' }, document_id: { type: 'string' },
    payload: { type: 'object', additionalProperties: true },
    evidence: { type: 'object', additionalProperties: false, properties: {
      source_url: { type: 'string' }, source_kind: { type: 'string' }, excerpt: { type: 'string' }, locator: { type: 'string' }, licence: { type: 'string' }, confidence: { type: 'number' },
    }, required: ['source_url', 'source_kind', 'excerpt', 'confidence'] },
    confidence: { type: 'number' },
  }, required: ['fact_type', 'subject_ref', 'document_id', 'payload', 'evidence'],
}
const FRAGMENT = {
  type: 'object', additionalProperties: false,
  properties: {
    documents: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      document_id: { type: 'string' }, url: { type: 'string' }, source_id: { type: 'string' }, operator_id: { type: ['string', 'null'] }, content_type: { type: 'string' }, licence: { type: 'string' }, text: { type: 'string' },
    }, required: ['document_id', 'url', 'text'] } },
    facts: { type: 'array', items: FACT }, notes: { type: 'string' },
  }, required: ['documents', 'facts'],
}
const CONV = `For EACH assigned RM number, identify the real UK public-sector commercial agreement and emit ONE instrument fact:
- payload: {instrument_id: a lowercase slug of the framework name (e.g. 'gcloud-13' or 'rm6011-<slug>'), operator_id: the operator slug (almost all RM-numbered agreements are Crown Commercial Service / Government Commercial Agency -> use 'gca'; if it is genuinely another operator, use a slug), name: the real agreement name, rm_reference: the RM number EXACTLY as shown (e.g. 'RM6011' or 'RM6011.8'), type: closed_framework|open_framework|dynamic_market|legacy_dps, regime: pca2023|legacy, lifecycle_status: live_for_call_off|closed_to_new_call_off|expired (judge from its end date vs today 2026-06-06; if expired/superseded say so), category_tags: [lowercase tags incl. the domain e.g. 'construction','energy','people','technology','facilities'], official_url}
- evidence: {source_url, source_kind:'gca_page' (or 'operator_site'), excerpt: a VERBATIM substring copied character-for-character from documents[].text that states the framework name/number, licence:'ogl', confidence}
- document: {document_id:'<rm>-1', url, source_id:'gca', operator_id:'gca', content_type:'text/html', licence:'ogl', text: the readable text you fetched (MUST contain every excerpt)}
CRITICAL: the excerpt MUST be a literal substring of documents[].text. Fetch via WebFetch (ask for full readable text) and/or curl. Try https://www.gca.gov.uk/agreements/<RM> and https://www.crowncommercial.gov.uk/agreements/<RM> and web search "<RM> Crown Commercial Service framework". If you cannot verbatim-quote the name, set lower confidence but still emit what the page literally says. Return ONLY the FRAGMENT object.`
const COMMON = `You are an enrichment agent for the govbuy index. Today is 2026-06-06; CCS was renamed Government Commercial Agency (GCA) on 1 Apr 2026. ${CONV}`
const BATCHES = [
  ['RM6011', 'RM6378', 'RM6088', 'RM6267', 'RM3749'],
  ['RM6060', 'RM6068', 'RM6147', 'RM6320', 'RM3808'],
  ['RM6099', 'RM6281', 'RM6263', 'RM6232', 'RM6288'],
  ['RM6276', 'RM6187', 'RM6165', 'RM1070', 'RM6074'],
  ['RM3745', 'RM1043', 'RM6003', 'RM6096', 'RM6171'],
]
phase('Enrich')
const frags = await parallel(BATCHES.map((b, i) => () =>
  agent(`${COMMON}\n\nYour RM numbers to identify (these are the highest-spend UK framework references): ${b.join(', ')}. Emit one instrument fact per RM (5 total), each with its own document + verbatim excerpt.`,
    { label: `enrich:${b[0]}..`, phase: 'Enrich', schema: FRAGMENT, agentType: 'general-purpose' })
))
const good = frags.filter(Boolean)
const documents = good.flatMap((f) => f.documents)
const facts = good.flatMap((f) => f.facts)
log(`enriched ${facts.length} frameworks across ${good.length} batches`)
return { batches: good.length, documents: documents.length, facts: facts.length, bundle: { documents, facts } }
