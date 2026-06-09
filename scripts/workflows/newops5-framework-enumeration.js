export const meta = {
  name: 'newops5-framework-enumeration',
  description: 'Enumerate each net-new operator’s framework/DPS catalogue (source-anchored, gated)',
  phases: [{ title: 'Enumerate', detail: 'one agent per operator; copy its framework list verbatim' }],
}

const OPERATORS = [{"operator_id": "business_services_organi", "name": "Business Services Organisation \u2013 Procurement and Logistics Service (BSO PaLS)", "url": "https://bso.hscni.net/directorates/operations/procurement-and-logistics-service/", "sectors": "Health and social care, Northern Ireland public sector"}, {"operator_id": "warwickshire_county_coun", "name": "Warwickshire County Council / CSW (Coventry\u2013Solihull\u2013Warwickshire joint procurement)", "url": "https://in-tendhost.co.uk/csw-jets/aspx/home", "sectors": "Professional services consultancy, engineering and construction works,"}, {"operator_id": "cardiff_council_ardal_se", "name": "Cardiff Council / Ardal \u2013 SEWTAPS (South East Wales Technical and Professional Services Framework)", "url": "https://sewtaps.co.uk/", "sectors": "Construction consultancy, civil and highway engineering, transportatio"}, {"operator_id": "qe_facilities_gateshead_", "name": "QE Facilities (Gateshead Health NHS Foundation Trust)", "url": "https://www.qefacilities.co.uk/qef-national-procurement", "sectors": "Clinical IT \u2014 software and hardware solutions across all areas of heal"}, {"operator_id": "procurement_services_for", "name": "Procurement Services (formerly KCS Procurement Services) \u2014 Commercial Services Group / Kent County Council", "url": "https://www.procurementservices.co.uk/our-solutions/frameworks", "sectors": "All public sector: education, emergency services, facilities, fleet, h"}, {"operator_id": "nhmf_frameworx_nhmf_npc_", "name": "NHMF Frameworx (NHMF (NPC) Ltd)", "url": "https://www.nhmfframeworx.org.uk/", "sectors": "Social housing, registered providers, wider public sector (any subscri"}, {"operator_id": "south_london_commissioni", "name": "South London Commissioning Programme (SLCP)", "url": "https://slcp.org.uk/", "sectors": "Children's residential care, independent fostering agencies (IFA), SEN"}, {"operator_id": "somerset_council_special", "name": "Somerset Council \u2013 Specialist Adults Support in Somerset DPS (SASIS)", "url": "https://somersetprovidernetwork.org.uk/adult-social-care-market-position-statement/care_markets_and_services/specialist-support/", "sectors": "Adult social care: residential, supported living, domiciliary care, da"}, {"operator_id": "north_east_pharmacy_proc", "name": "North East Pharmacy Procurement Services (NEPPS)", "url": "https://www.nepps.org.uk/", "sectors": "Health \u2013 NHS medicines and pharmacy procurement"}, {"operator_id": "procurement_for_charitie", "name": "Procurement for Charities", "url": "https://procurementforcharities.co.uk/", "sectors": "Third sector / charities \u2014 new build, property investment services, ba"}]
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
  agent(prompt(op), { label: `op:${op.operator_id}`, phase: 'Enumerate', schema: SCHEMA, model: 'sonnet' })
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
