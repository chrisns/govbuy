export const meta = {
  name: 'newops3-framework-enumeration',
  description: 'Enumerate each net-new operator’s framework/DPS catalogue (source-anchored, gated)',
  phases: [{ title: 'Enumerate', detail: 'one agent per operator; copy its framework list verbatim' }],
}

const OPERATORS = [{"operator_id": "iese_improvement_and_eff", "name": "iESE (Improvement and Efficiency Social Enterprise)", "url": "https://iese.org.uk/", "sectors": "Local government, waste management, construction, transformation/effic"}, {"operator_id": "suffolk_county_council_s", "name": "Suffolk County Council (Suffolk Construction & Building Services Framework)", "url": "https://concertus.co.uk/service/suffolk-construction-and-building-services-framework/", "sectors": "Construction and building services (public estate, schools, blue light"}, {"operator_id": "concertus_design_and_pro", "name": "Concertus Design and Property Consultants (LINK14 / Suffolk Construction Framework operator)", "url": "https://concertus.co.uk/news/", "sectors": "Construction and building services, design and property consultancy"}, {"operator_id": "hertfordshire_county_cou", "name": "Hertfordshire County Council (Property Works Framework / HCC Contracts catalogue)", "url": "https://www.hertfordshire.gov.uk/contractcatalogue/", "sectors": "Construction/property works, grounds maintenance, fleet (with TPPL), s"}, {"operator_id": "laser_energy_laser_energ", "name": "LASER Energy (Laser Energy Buying Group)", "url": "https://www.laserenergy.org.uk/", "sectors": "Energy procurement, carbon/net zero, energy compliance for public sect"}, {"operator_id": "orbit_group_supply_chang", "name": "Orbit Group / Supply Change - Social Supplier Dynamic Purchasing System", "url": "https://www.supplychange.co.uk/dps", "sectors": "Social value procurement; VCSEs/social enterprises across 21 lots (cle"}, {"operator_id": "greater_manchester_combi", "name": "Greater Manchester Combined Authority (GMCA) - Net Zero Housing Retrofit Framework Agreement", "url": "https://www.greatermanchester-ca.gov.uk/what-we-do/environment/homes-workplaces-and-public-buildings/net-zero-housing-retrofit-framework-agreement/", "sectors": "Housing retrofit / decarbonisation, energy efficiency measures (15 lot"}, {"operator_id": "nottinghamshire_county_c", "name": "Nottinghamshire County Council - Notts County Supplies", "url": "https://www.county-supplies.org/", "sectors": "Education supplies (stationery, furniture, classroom resources, SEND, "}, {"operator_id": "thirteen_group_thirteen_", "name": "Thirteen Group (Thirteen Housing Group)", "url": "https://www.thirteengroup.co.uk/page/procurement", "sectors": "Social housing; property repairs/maintenance works and construction co"}, {"operator_id": "notting_hill_genesis_nhg", "name": "Notting Hill Genesis (NHG Development Frameworks)", "url": "https://www.nhg.org.uk/building-homes/our-development-framework/", "sectors": "Social housing / construction (development contractors, consultants, f"}, {"operator_id": "laser_kent_county_counci", "name": "LASER (Kent County Council energy buying organisation - LASER Energy)", "url": "https://www.laserenergy.org.uk/", "sectors": "Energy procurement (electricity, gas, aggregated 'baskets', energy eff"}, {"operator_id": "department_for_education", "name": "Department for Education (DfE Construction Frameworks)", "url": "https://www.gov.uk/government/publications/offsite-construction-framework-modern-methods-of-construction", "sectors": "Education construction / school building (Construction Framework, Mode"}, {"operator_id": "cds_co_operatives_co_ope", "name": "CDS Co-operatives (Co-operative Development Society Ltd)", "url": "https://www.plentific.com/open-framework-for-housing-powered-by-plentific/", "sectors": "Social housing repairs, maintenance & asset management; works, profess"}, {"operator_id": "mufg_corporate_markets_f", "name": "MUFG Corporate Markets (formerly Link Group) \u2013 Halton Housing Framework for Supply of Vehicles / Procurement of Fleet", "url": "https://eu.mpms.mufg.com/media/c2tlbruf/0372-hht-supply-of-vehicles-flyer_r1v2-as-of-0503.pdf", "sectors": "Fleet/vehicles: contract hire and outright purchase of cars, light com"}, {"operator_id": "children_s_commissioning", "name": "Children's Commissioning Consortium Cymru (4Cs) - ADSS Cymru / Welsh LGA", "url": "https://www.adss.cymru/en/category/4cs", "sectors": "Children's social care (Wales): looked-after children residential plac"}, {"operator_id": "east_midlands_regional_c", "name": "East Midlands Regional Children's Framework (EMRCF) - lead authority Northamptonshire / now West Northamptonshire Council", "url": "https://www.stotles.com/explore/notices/dfe2bf80-1e16-45c3-b9d8-001916cecc48/east-midlands-regional-children-s-framework-agreement", "sectors": "Children's social care: children's homes (incl. EBD, ASC/challenging b"}, {"operator_id": "south_west_fostering_dyn", "name": "South West Fostering Dynamic Purchasing System (lead/operating authority Bath & North East Somerset Council)", "url": "https://gloucestershire.moderngov.co.uk/mgConvert2PDF.aspx?ID=113890", "sectors": "Children's social care: independent fostering placements (Light Touch "}, {"operator_id": "lexica_nhs_origin_framew", "name": "Lexica (NHS-origin framework host; now part of WSP, frameworks originally hosted via Guy's and St Thomas' NHS Foundation Trust)", "url": "https://lexica.co.uk/our-services/the-lexica-frameworks/", "sectors": "Health/public-sector estates and energy: LED lighting (design, supply,"}, {"operator_id": "nhs_procure_procure22_pr", "name": "NHS ProCure (ProCure22 / ProCure23 / ProCure24) - NHS England Estates & Facilities programme", "url": "https://procure22.nhs.uk/", "sectors": "NHS health capital works / construction: design and construction of ne"}, {"operator_id": "laser_energy_kent_county", "name": "LASER Energy (Kent County Council)", "url": "https://www.laserenergy.org.uk/our-solutions/energy-procurement/", "sectors": "Energy buying (electricity, gas, water, liquid fuels), net-zero/LED/so"}, {"operator_id": "cirrus_consortium_cirrus", "name": "Cirrus Consortium (Cirrus Purchasing Ltd)", "url": "https://www.cirruspurchasing.co.uk/CF.html", "sectors": "Recruitment/agency staffing, waste management, catering/kitchens suppl"}, {"operator_id": "pfh_scotland_procurement", "name": "PfH Scotland (Procurement for Housing Scotland)", "url": "https://pfhscotland.co.uk/what-we-offer/frameworks/", "sectors": "Social housing supplies/works/services, planned works, DPS solutions ("}, {"operator_id": "crescent_services_tps_li", "name": "Crescent Services (TPS) Limited", "url": "https://www.crescentservices.org.uk/frameworks/temporary-and-permanent-staffing/", "sectors": "Recruitment/temp-and-permanent staffing (incl. neutral-vendor lot), ou"}, {"operator_id": "2buy2_church_buying_pari", "name": "2buy2 / Church Buying / Parish Buying", "url": "https://2buy2.com/", "sectors": "Faith & charity sector collaborative buying: energy, catering/cleaning"}, {"operator_id": "en_procure_efficiency_no", "name": "EN:Procure / Efficiency North Holdings (EN:Able Build, EN:Able Futures)", "url": "https://www.efficiencynorth.org/", "sectors": "Social housing construction, maintenance, build and apprenticeship/emp"}, {"operator_id": "nhs_south_central_and_we", "name": "NHS South, Central and West Commissioning Support Unit (SCW CSU)", "url": "https://hss.scwcsu.nhs.uk/", "sectors": "NHS / health system support, digital, analytics, IT, contracting and f"}, {"operator_id": "blue_light_procurement_d", "name": "Blue Light Procurement Database (BLPD) - blpd.gov.uk", "url": "https://www.blpd.gov.uk/", "sectors": "Blue light / emergency services (police, fire & rescue, ambulance) - a"}]
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
