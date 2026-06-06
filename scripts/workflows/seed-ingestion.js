export const meta = {
  name: 'govbuy-seed-ingestion',
  description: 'Run the agentic harness in-session: one agent per seed source fetches the REAL page(s), extracts govbuy route-to-market facts with VERBATIM excerpts (the deterministic substring gate verifies them on load), using shared ID conventions so the facts join. Covers every entity type for the feature-completeness gate.',
  phases: [
    { title: 'Extract', detail: '8 parallel source agents -> schema-validated bundle fragments with verbatim excerpts' },
  ],
}

const FACT = {
  type: 'object', additionalProperties: false,
  properties: {
    fact_type: { type: 'string', enum: ['operator','instrument','lot','award_mechanic','buying_doc','appointment_observation','supplier','reseller_channel','inbound_scope'] },
    subject_ref: { type: 'string' },
    document_id: { type: 'string' },
    payload: { type: 'object', additionalProperties: true },
    evidence: { type: 'object', additionalProperties: false, properties: {
      source_url: { type: 'string' }, source_kind: { type: 'string' }, excerpt: { type: 'string' },
      locator: { type: 'string' }, licence: { type: 'string' }, confidence: { type: 'number' },
    }, required: ['source_url','source_kind','excerpt','confidence'] },
    confidence: { type: 'number' },
  }, required: ['fact_type','subject_ref','document_id','payload','evidence'],
}
const FRAGMENT = {
  type: 'object', additionalProperties: false,
  properties: {
    source_id: { type: 'string' },
    documents: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      document_id: { type: 'string' }, url: { type: 'string' }, source_id: { type: 'string' },
      operator_id: { type: ['string','null'] }, content_type: { type: 'string' }, licence: { type: 'string' },
      text: { type: 'string' },
    }, required: ['document_id','url','text'] } },
    facts: { type: 'array', items: FACT },
    notes: { type: 'string' },
  }, required: ['source_id','documents','facts'],
}

const CONV = `SHARED CONVENTIONS (use EXACTLY so facts from different agents join):
- operator_id: one of gca | bloom | ypo | espo | nhs_sbs
- canonical instrument_id values you may reference: 'g-cloud-14' (RM1557.14), 'ai-dps-rm6200' (RM6200), 'technology-services-4' (RM6190). For other instruments, slugify the name.
- rm_reference: exact, e.g. RM1557.14, RM6200, RM6190.
- type: closed_framework | open_framework | dynamic_market | legacy_dps. regime: pca2023 | legacy.
- lifecycle_status: live_for_call_off | closed_to_new_call_off | expired.
- lot_id: '<instrument_id>-lot-<n>'. supplier_id: slug of the company (e.g. 'bramble-hub','softcat'). channel_type: thin_prime | var | vendor | hybrid | unknown.
- award_mechanic.mechanic: call_off_no_further_competition | further_competition | competitive_flexible_procedure (+ permitted: true/false).
- appointment_observation payload: {instrument_id, lot_id|null, supplier_id, source_id:'<operator_id>', observed_on:'YYYY-MM-DD' (use today 2026-06-06 if undated), observed_present:true, confidence:0-1}.
- dates: 'YYYY-MM-DD'. category_tags: array of lowercase strings.

CRITICAL — THE SUBSTRING GATE: put the readable text you actually fetched into documents[].text (the relevant sections; it MUST contain every excerpt). Every fact's evidence.excerpt MUST be copied CHARACTER-FOR-CHARACTER from that text (a literal substring). If you cannot copy a verbatim excerpt for a claim, DO NOT include the claim — it will be dropped. source_kind: gca_page|operator_site|supplier_site|pdf. licence: ogl for gov.uk/gca, operator_tos for operator sites, supplier_tos for company marketing sites. Set document_id to a short slug like '<source_id>-1'.`

const COMMON = `You are one extractor in the govbuy ingestion harness. Fetch the REAL page(s) for your source using WebFetch (ask it to return the full readable text) and/or curl via Bash. Extract govbuy route-to-market facts. Be accurate; today is 2026-06-06. ${CONV}\nReturn ONLY the FRAGMENT object.`

const SOURCES = [
  { label: 'gca-gcloud14', prompt: `${COMMON}\n\nSOURCE: Crown Commercial Service / GCA G-Cloud 14 (RM1557.14). Fetch https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/ and a CCS/GCA agreement page (try https://www.crowncommercial.gov.uk/agreements/RM1557.14 or gca.gov.uk). Emit: operator(gca; kind 'gca'; name 'Government Commercial Agency'), instrument 'g-cloud-14' (type closed_framework, regime legacy, lifecycle_status live_for_call_off, rm_reference 'RM1557.14', category_tags incl. 'cloud','software','ai', expires_on if shown), its lots (esp. Lot 2 Cloud Software, Lot 3 Cloud Support), award_mechanic (call_off_no_further_competition permitted on the catalogue lots), buying_doc (call-off contract / how to buy), and a few real appointed suppliers you can see named on the catalogue as appointment_observation + supplier facts. Verbatim excerpts only.` },
  { label: 'gca-aidps', prompt: `${COMMON}\n\nSOURCE: CCS/GCA Artificial Intelligence DPS, RM6200. Fetch a CCS/GCA page for RM6200 (try https://www.crowncommercial.gov.uk/agreements/RM6200). Emit: operator(gca), instrument 'ai-dps-rm6200' (type legacy_dps, regime legacy, lifecycle_status live_for_call_off, rm_reference 'RM6200', category_tags ['ai','machine-learning','data'], expires_on '2029-02-23' if shown), lots if any, award_mechanic (further_competition — DPS is further-competition only; set permitted true for further_competition and a fact noting call_off_no_further_competition permitted=false), buying_doc. Capture appointed suppliers if listed. Verbatim excerpts only.` },
  { label: 'gca-ts4', prompt: `${COMMON}\n\nSOURCE: CCS/GCA Technology Services 4, RM6190. Fetch a CCS/GCA page for RM6190 (try https://www.crowncommercial.gov.uk/agreements/RM6190). Emit: operator(gca), instrument 'technology-services-4' (type open_framework, regime pca2023, lifecycle_status live_for_call_off, rm_reference 'RM6190', category_tags ['technology','services','ai','automation']), its lots, award_mechanic (both call_off_no_further_competition and further_competition where permitted), buying_doc. Verbatim excerpts only.` },
  { label: 'bramble-hub', prompt: `${COMMON}\n\nSOURCE: Bramble Hub Ltd — the canonical THIN-PRIME. Fetch https://www.bramblehub.com/ and its partners/frameworks pages. Emit: supplier 'bramble-hub' (display_name 'Bramble Hub Limited', publisher_ids []), reseller_channel (supplier_id 'bramble-hub', channel_type 'thin_prime', confidence), inbound_scope facts (supplier_id 'bramble-hub', vendor_name = each named partner/vendor it routes to market), and appointment_observation facts linking 'bramble-hub' to instruments it sits on USING the canonical instrument_ids where they match (g-cloud-14, technology-services-4, ai-dps-rm6200) — only if you can verbatim-quote that it is on that framework. Verbatim excerpts only (its partner list is the inbound scope).` },
  { label: 'softcat-var', prompt: `${COMMON}\n\nSOURCE: Softcat plc — a VALUE-ADDED RESELLER (VAR) example. Fetch https://www.softcat.com/ public-sector / vendors pages. Emit: supplier 'softcat' (display_name 'Softcat plc'), reseller_channel (channel_type 'var'), inbound_scope facts (vendors/OEMs it resells, e.g. Microsoft, AWS — only verbatim-quotable ones), and appointment_observation linking 'softcat' to 'g-cloud-14' if verbatim-quotable. Verbatim excerpts only.` },
  { label: 'bloom', prompt: `${COMMON}\n\nSOURCE: Bloom (NEPRO marketplace), operator_id 'bloom'. Fetch https://www.bloom.gov.uk/. Emit: operator(bloom; kind 'managed_marketplace'; funding_model 'rebate_levy'), and any instrument(s) / dynamic market it runs (if it describes a permanently-open marketplace, type dynamic_market regime pca2023; else closed_framework), with category_tags incl. 'technology' where applicable, and buying_doc. Verbatim excerpts only.` },
  { label: 'ypo-espo', prompt: `${COMMON}\n\nSOURCE: YPO and/or ESPO (LA-owned PBOs). Fetch https://www.ypo.co.uk/ and/or https://www.espo.org/ frameworks pages. Emit: operator(ypo and/or espo; kind 'la_pbo'; funding_model 'rebate_levy'), and 1-3 technology/ICT instruments each runs (type closed_framework unless described otherwise; lifecycle_status live_for_call_off), with lots + category_tags. Verbatim excerpts only.` },
  { label: 'nhs-sbs', prompt: `${COMMON}\n\nSOURCE: NHS Shared Business Services (NHS SBS), operator_id 'nhs_sbs', kind 'nhs'. Fetch https://www.sbs.nhs.uk/our-frameworks/ (or its frameworks page). Emit: operator(nhs_sbs), and 1-3 digital/technology/cyber frameworks it runs (type closed_framework; lifecycle_status live_for_call_off), with category_tags incl. 'digital'/'technology'/'cyber'. Verbatim excerpts only.` },
]

phase('Extract')
const fragments = await parallel(SOURCES.map((s) => () =>
  agent(s.prompt, { label: s.label, phase: 'Extract', schema: FRAGMENT, agentType: 'general-purpose' })
))
const good = fragments.filter(Boolean)
const docs = good.flatMap((f) => f.documents.map((d) => ({ ...d, source_id: d.source_id || f.source_id })))
const facts = good.flatMap((f) => f.facts)
log(`fragments=${good.length} documents=${docs.length} facts=${facts.length}`)
return { fragments: good.length, documents: docs.length, facts: facts.length, bundle: { documents: docs, facts } }
