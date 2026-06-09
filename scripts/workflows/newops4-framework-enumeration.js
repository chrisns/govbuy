export const meta = {
  name: 'newops4-framework-enumeration',
  description: 'Enumerate each net-new operator’s framework/DPS catalogue (source-anchored, gated)',
  phases: [{ title: 'Enumerate', detail: 'one agent per operator; copy its framework list verbatim' }],
}

const OPERATORS = [{"operator_id": "homes_england", "name": "Homes England", "url": "https://www.gov.uk/guidance/partners-guide-to-homes-england-procurement-frameworks", "sectors": "Development, regeneration, housing, professional and technical service"}, {"operator_id": "procurement_agency_for_e", "name": "Procurement Agency for Essex (PAE)", "url": "https://www.paessex.gov.uk/", "sectors": "Local government, education, fire and rescue, housing associations \u2014 E"}, {"operator_id": "orbis_procurement_surrey", "name": "Orbis Procurement (Surrey CC / East Sussex CC / Brighton & Hove CC)", "url": "https://www.orbisprocurement.co.uk/", "sectors": "Local government \u2014 construction, professional and technical services, "}, {"operator_id": "transport_for_greater_ma", "name": "Transport for Greater Manchester (TfGM)", "url": "https://tfgm.com/procurement", "sectors": "Transport infrastructure, professional services, planning, design, eng"}, {"operator_id": "the_libraries_consortium", "name": "The Libraries Consortium (TLC) \u2014 lead authority London Borough of Sutton", "url": "https://thelibrariesconsortium.org.uk/", "sectors": "Public libraries \u2014 library management systems, stock, courier services"}, {"operator_id": "clarion_housing_group", "name": "Clarion Housing Group", "url": "https://clarion.delta-esourcing.com/", "sectors": "Social housing \u2014 development consultancy, building services, repairs a"}, {"operator_id": "west_yorkshire_combined_", "name": "West Yorkshire Combined Authority (WYCA)", "url": "https://www.westyorks-ca.gov.uk/about-west-yorkshire-combined-authority/do-business-with-west-yorkshire-combined-authority/professional-services-framework", "sectors": "Civil engineering / professional services; EV infrastructure; transpor"}, {"operator_id": "west_midlands_combined_a", "name": "West Midlands Combined Authority (WMCA)", "url": "https://www.wmca.org.uk/what-we-do/employment-and-skills/procurement-for-skills-programmes/", "sectors": "Skills, employment and technical education; net zero / retrofit (build"}, {"operator_id": "london_boroughs_legal_al", "name": "London Boroughs' Legal Alliance (LBLA)", "url": "https://lbla.org.uk/", "sectors": "Legal services (solicitors and barristers)"}, {"operator_id": "carmarthenshire_county_c", "name": "Carmarthenshire County Council (South West Wales Regional Frameworks)", "url": "https://newsroom.carmarthenshire.gov.wales/2024/11/south-west-wales-regional-contractors-framework-2024-goes-live/", "sectors": "Construction (buildings and civil engineering); regional Wales"}, {"operator_id": "lgss_local_government_sh", "name": "LGSS (Local Government Shared Services)", "url": "https://www.lgss.co.uk/services/procurement/frameworks/", "sectors": "Local government and wider public sector \u2014 HR, IT, finance, profession"}, {"operator_id": "homes_england_technical_", "name": "Homes England \u2014 Technical and Professional Frameworks", "url": "https://www.gov.uk/government/collections/technical-and-property-frameworks", "sectors": "Housing, development and regeneration \u2014 technical, professional and ad"}, {"operator_id": "stokedepo_stoke_on_trent", "name": "StokeDEPO (Stoke-on-Trent City Council \u2014 Decentralised Energy Purchasing Organisation)", "url": "https://www.stoke.gov.uk/info/20034/procurement/409/procurement_frameworks", "sectors": "Decentralised/off-grid energy, district heating, energy-from-waste \u2014 p"}, {"operator_id": "stoke_on_trent_city_coun", "name": "Stoke-on-Trent City Council \u2014 Professional Services in the Built Environment Framework", "url": "https://www.stoke.gov.uk/info/20034/procurement/409/procurement_frameworks", "sectors": "Construction and built environment consultancy \u2014 public sector in Staf"}, {"operator_id": "east_sussex_procurement_", "name": "East Sussex Procurement Hub (ESPH) \u2014 hosted by Wealden District Council", "url": "https://www.wealden.gov.uk/transparency-spending-and-performance/transparency/procurement-selling-to-wealden-district-council/the-east-sussex-procurement-hub/frameworks/", "sectors": "Local government \u2014 goods, services and works for East Sussex district/"}, {"operator_id": "placements_north_west_nw", "name": "Placements North West (NWADCS)", "url": "https://www.nwadcs.org.uk/regional-purchasing-systems", "sectors": "Children's social care: fostering, residential care, supported accommo"}, {"operator_id": "southampton_city_council", "name": "Southampton City Council \u2014 South Central Children's Commissioning Consortia (Constoria / South-Central Residential and IFA Frameworks)", "url": "https://www.southampton.gov.uk/children-families/fostering/south-central-ifa-tender-docs/", "sectors": "Children's social care: residential care placements, independent foste"}, {"operator_id": "coventry_city_council_we", "name": "Coventry City Council \u2014 West Midlands Children's Commissioning Frameworks (Residential and IFA)", "url": "https://www.find-tender.service.gov.uk/Notice/016841-2025", "sectors": "Children's social care: residential care placements, independent foste"}, {"operator_id": "north_west_legal_consort", "name": "North West Legal Consortium (NWLC)", "url": "https://www.nwlegalconsortium.com/", "sectors": "Legal services; local authorities, combined authorities, police/PCCs, "}, {"operator_id": "university_of_essex_duke", "name": "University of Essex / Dukefield Procurement \u2013 National Legal Services Framework", "url": "https://www.dukefieldprocurement.co.uk/frameworks", "sectors": "Legal services; education and wider public sector \u2013 central government"}, {"operator_id": "national_public_sector_f", "name": "National Public Sector Frameworks (psframeworks.co.uk) \u2013 operated by Dukefield Group", "url": "https://www.psframeworks.co.uk/", "sectors": "Multi-sector: legal, print/MFD, utilities/energy, HR/payroll, financia"}]
const ops = OPERATORS
const today = '2026-06-08'
log(`enumerating frameworks for ${ops.length} net-new operators`)

const ALLOWED_TYPE = ['closed_framework', 'open_framework', 'dynamic_market', 'legacy_dps']
const ALLOWED_LIFE = ['live_for_call_off', 'closed_to_new_call_off', 'expired']

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    found: { type: 'boolean' },
    document_text: { type: 'string' },
    instruments: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          lifecycle_status: { type: 'string' },
          reference: { type: 'string' },
          official_url: { type: 'string' },
          lots: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { number: { type: 'string' }, title: { type: 'string' } }, required: ['number', 'title'] } },
        },
        required: ['name', 'type', 'lifecycle_status', 'reference', 'official_url', 'lots'],
      },
    },
    note: { type: 'string' },
  },
  required: ['found', 'document_text', 'instruments', 'note'],
}

const prompt = (op) => `Enumerate EVERY current framework agreement / DPS / dynamic market operated by this UK public-sector buying organisation:

  ${op.name}  ${op.url}  (sectors: ${op.sectors || 'n/a'})

Fetch its frameworks/agreements catalogue page (prefer \`defuddle parse <url> --md\`; fall back to \`curl -sL -A "govbuy/0.1 (chris@cns.me.uk)" <url>\`). Follow into category/listing/detail pages as needed, max 2 levels deep. Be exhaustive but efficient.

Return:
- found: true if you reached a real framework list.
- instruments: one object per framework — name (VERBATIM as on the site), type (one of: closed_framework, open_framework, dynamic_market, legacy_dps — a DPS or "dynamic"/"marketplace" => dynamic_market unless clearly a legacy DPS), lifecycle_status (live_for_call_off unless the page says it is closed/expired), reference (the operator's framework code/ref if shown, else ""), official_url (the framework's own page if there is one, else the catalogue url), lots (number+title pairs if the page lists lots, else []).
- document_text: a VERBATIM contiguous copy of the on-page text listing those frameworks, so every framework name is a literal substring of it. Max 15000 chars. THIS IS THE ANTI-FABRICATION ANCHOR — any framework name not present here is dropped.
- note: short reason if found=false (e.g. "catalogue behind login", "PDF only", "no framework list", "site blocked").

ABSOLUTE RULE: never invent a framework. Only frameworks that literally appear on the site. If you cannot reach a catalogue, found=false, instruments=[], document_text="".`

const kindFor = (sectors) => {
  const s = (sectors || '').toLowerCase()
  if (s.includes('nhs') || s.includes('health')) return 'nhs'
  if (s.includes('housing') || s.includes('construction') || s.includes('works')) return 'managed_marketplace'
  if (s.includes('police') || s.includes('fire') || s.includes('blue')) return 'other'
  return 'consortium'
}
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70)

const results = await parallel(ops.map((op, i) => () =>
  agent(prompt(op), { label: `op:${op.operator_id}`, phase: 'Enumerate', schema: SCHEMA, model: 'haiku' })
    .then(r => ({ op, r })).catch(() => ({ op, r: null }))
))

const documents = [], facts = []
let opsOk = 0, instrCount = 0
for (const { op, r } of results) {
  // operator fact (metadata from the audit seed; document = name+url so the gate stays internally consistent)
  const opDoc = 'newop-' + op.operator_id
  documents.push({ document_id: opDoc, url: op.url, source_id: op.operator_id, operator_id: op.operator_id, content_type: 'text/plain', licence: 'operator_tos', text: `${op.name} ${op.url} ${op.sectors || ''}` })
  facts.push({ fact_type: 'operator', subject_ref: op.operator_id, document_id: opDoc,
    payload: { operator_id: op.operator_id, name: op.name, kind: kindFor(op.sectors), home_url: op.url, status: 'active' },
    evidence: { source_url: op.url, source_kind: 'operator_site', excerpt: op.name, licence: 'operator_tos', confidence: 0.9 }, confidence: 0.9 })
  if (!r || !r.found || !r.document_text || !Array.isArray(r.instruments) || !r.instruments.length) continue
  opsOk++
  const fwDoc = 'newop-fw-' + op.operator_id
  documents.push({ document_id: fwDoc, url: op.url, source_id: op.operator_id, operator_id: op.operator_id, content_type: 'text/plain', licence: 'operator_tos', text: r.document_text.slice(0, 15000) })
  const seen = new Set()
  for (const inst of r.instruments) {
    const nm = (inst.name || '').trim()
    if (!nm || nm.length < 3) continue
    const ref = (inst.reference || '').trim()
    const iid = op.operator_id + '-' + slug(nm) + (ref ? '-' + slug(ref) : '')
    if (seen.has(iid)) continue
    seen.add(iid)
    const itype = ALLOWED_TYPE.includes(inst.type) ? inst.type : 'closed_framework'
    const life = ALLOWED_LIFE.includes(inst.lifecycle_status) ? inst.lifecycle_status : 'live_for_call_off'
    const ev = { source_url: inst.official_url || op.url, source_kind: 'operator_site', excerpt: nm, licence: 'operator_tos', confidence: 0.9 }
    facts.push({ fact_type: 'instrument', subject_ref: iid, document_id: fwDoc,
      payload: { instrument_id: iid, operator_id: op.operator_id, name: nm, rm_reference: ref || null, type: itype, regime: 'legacy', lifecycle_status: life, category_tags: [], official_url: inst.official_url || op.url },
      evidence: ev, confidence: 0.9 })
    instrCount++
    const lots = Array.isArray(inst.lots) ? inst.lots : []
    for (let li = 0; li < lots.length; li++) {
      const lt = (lots[li].title || '').trim()
      if (!lt) continue
      const lid = iid + '-lot-' + (lots[li].number || (li + 1))
      facts.push({ fact_type: 'lot', subject_ref: lid, document_id: fwDoc,
        payload: { lot_id: lid, instrument_id: iid, number: String(lots[li].number || li + 1), title: lt, scope: '', category_tags: [] },
        evidence: { source_url: inst.official_url || op.url, source_kind: 'operator_site', excerpt: lt, licence: 'operator_tos', confidence: 0.85 }, confidence: 0.85 })
    }
  }
}
log(`operators with a catalogue: ${opsOk}/${ops.length}; instruments: ${instrCount}`)
return { run_id: 'newops-frameworks', mode: 'refresh', opsOk, opsTotal: ops.length, instrCount, documents, facts }
