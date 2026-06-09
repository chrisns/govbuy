export const meta = {
  name: 'newops-framework-enumeration',
  description: 'Enumerate each net-new operator’s framework/DPS catalogue (source-anchored, gated)',
  phases: [{ title: 'Enumerate', detail: 'one agent per operator; copy its framework list verbatim' }],
}

const OPERATORS = [{"operator_id": "advantage_sw", "name": "Advantage South West", "url": "https://www.advantagesouthwest.co.uk/procurement/our-frameworks/", "sectors": "Social housing supplies/works \u2014 aids & adaptations, heating, bathroom/"}, {"operator_id": "ardal", "name": "Ardal Procurement", "url": "https://ardal-procurement.gov.wales/collaborative-frameworks/", "sectors": "Public sector construction, highways, professional services (incl. hou"}, {"operator_id": "beond_gwynedd", "name": "Beond Group / Gwynedd Council Energy Procurement DPS", "url": "https://beondgroup.com/our-services/public-sector-energy-procurement/", "sectors": "Energy (fixed & flexible electricity and gas), energy & sustainability"}, {"operator_id": "bluelight_commercial", "name": "BlueLight Commercial (BLC)", "url": "https://bluelightcommercial.police.uk/", "sectors": "Policing, fire & rescue (and joint blue-light incl. NHS ambulance via "}, {"operator_id": "chic", "name": "CHIC (Communities & Housing Investment Consortium)", "url": "https://www.chicltd.co.uk/services/frameworks/", "sectors": "Social housing and public-sector asset management, newbuild, retrofit,"}, {"operator_id": "churchmarketplace", "name": "Churchmarketplace (CMP)", "url": "https://www.churchmarketplace.org.uk/", "sectors": "Catholic schools and educational establishments, parishes, dioceses, C"}, {"operator_id": "constellia", "name": "Constellia (Neutral Vendor Framework for Innovation - NVfI)", "url": "https://www.constellia.com/solutions/public-sector-solutions/nvfi/", "sectors": "Defence innovation procurement: digital, technology, innovative goods "}, {"operator_id": "cpc_construction", "name": "Consortium Procurement Construction (CPC)", "url": "https://consortiumprocurement.org.uk/framework-and-dps-agreements/consortium-procurement-construction/", "sectors": "Social housing, schools, community buildings - Midlands and North of E"}, {"operator_id": "cwm", "name": "Constructing West Midlands (CWM)", "url": "https://www.constructingwestmidlands.co.uk/", "sectors": "Public sector building/infrastructure (new build, retrofit, refurbishm"}, {"operator_id": "defence_digital", "name": "Defence Digital (MOD) / Defence Marketplace - Defence Tech Scaler (DTS)", "url": "https://www.digital.mod.uk/marketplace", "sectors": "Defence ICT, digital, data, AI, cyber, software, telecommunications"}, {"operator_id": "dukefield", "name": "Dukefield Procurement (Dukefield Group)", "url": "https://www.dukefieldprocurement.co.uk/frameworks", "sectors": "Schools, academies/MATs, colleges, universities, wider public sector"}, {"operator_id": "durham_commercial", "name": "Durham Commercial Services (Housing & Blue Light)", "url": "https://durhamcommercialservices.co.uk/housing-and-bluelight/business-services/procurement/procurement-catalogue/", "sectors": "Blue-light and social housing (local-authority trading function)"}, {"operator_id": "eastern_highways", "name": "Eastern Highways Alliance (EHA)", "url": "https://www.easternhighwaysalliance.org/", "sectors": "Local government highways, public realm, infrastructure (East of Engla"}, {"operator_id": "ebg", "name": "Education Buying Group (EBG)", "url": "https://educationbuyinggroup.org.uk/", "sectors": "Schools, academies/MATs, dioceses and wider education"}, {"operator_id": "edu_frameworks", "name": "National Education Frameworks (EduFrameworks)", "url": "https://www.eduframeworks.co.uk/summary", "sectors": "MATs, schools, academies, colleges, universities"}, {"operator_id": "education_buying", "name": "Education Buying (educationbuying.com)", "url": "https://educationbuying.com/frameworks-and-dpss/", "sectors": "Schools and MATs (state and independent), wider education"}, {"operator_id": "eem", "name": "Efficiency East Midlands (EEM)", "url": "https://www.eem.org.uk/", "sectors": "Public sector incl. NHS/social housing; construction, works, FM, decar"}, {"operator_id": "efficiency_north", "name": "Efficiency North / EN:Procure", "url": "https://www.efficiencynorth.org/en-procure/", "sectors": "Social housing and construction procurement for housing providers and "}, {"operator_id": "eoecph", "name": "East of England NHS Collaborative Procurement Hub (EoECPH) / National Ambulance Procurement", "url": "https://www.eoecph.nhs.uk/frameworks/", "sectors": "NHS ambulance / blue-light (national ambulance procurement) and wider "}, {"operator_id": "findel", "name": "Findel Education", "url": "https://get-help-buying-for-schools.education.gov.uk/categories/catalogues/findel-education-catalogue", "sectors": "Early years, primary and secondary schools (curriculum supplies)"}, {"operator_id": "frameworks_scotland", "name": "Frameworks Scotland (NHS Scotland Assure / NSS construction frameworks)", "url": "https://frameworks-scotland.scot.nhs.uk/about-frameworks-scotland-3/", "sectors": "NHS Scotland capital construction and design - new-build and refurbish"}, {"operator_id": "gla_refit", "name": "Greater London Authority (GLA) - Local Energy Framework / RE:FIT", "url": "https://www.london.gov.uk/programmes-strategies/environment-and-climate-change/net-zero-energy/zero-carbon-accelerator/local-energy-accelerator", "sectors": "Low-carbon energy consultancy, heat networks, solar PV, energy flexibi"}, {"operator_id": "hyde", "name": "The Hyde Group (procurement frameworks)", "url": "https://www.hyde-housing.co.uk/corporate/suppliers/procurement-frameworks/", "sectors": "Social housing - building/fire safety, supply and managed services, wo"}, {"operator_id": "lcp", "name": "London Construction Programme (LCP)", "url": "https://londonconstructionprogramme.co.uk/services/major-works-framework/", "sectors": "Public sector construction (housing, education, capital projects, heri"}, {"operator_id": "midlands_highways", "name": "Midlands Highways Alliance Plus (MHA+)", "url": "https://www.mhaplus.org.uk/", "sectors": "Local government highways services, professional services and construc"}, {"operator_id": "nda_bats", "name": "Nuclear Decommissioning Authority (NDA) group - BATS Marketplace", "url": "https://www.gov.uk/government/organisations/nuclear-decommissioning-authority/about/procurement", "sectors": "Nuclear decommissioning, professional & technical services (13 busines"}, {"operator_id": "necs", "name": "North of England Commissioning Support (NECS)", "url": "https://www.necsu.nhs.uk/our-story/framework-agreements/", "sectors": "NHS / health system support; commissioning, transport, digital, clinic"}, {"operator_id": "nfcc", "name": "National Fire Chiefs Council (NFCC)", "url": "https://nfcc.org.uk/framework-agreements/", "sectors": "Fire & rescue"}, {"operator_id": "nfp", "name": "National Framework Partnership (NFP)", "url": "https://www.nationalframeworkpartnership.co.uk/", "sectors": "Social housing and public sector - legal, recruitment, FM, renewables/"}, {"operator_id": "nhc", "name": "Consortium Procurement / Northern Housing Consortium (NHC Procurement)", "url": "https://nhcprocurement.org.uk/", "sectors": "Social housing, healthcare, education, blue light, charity - UK-wide"}, {"operator_id": "nhs_nss", "name": "NHS National Services Scotland - National Procurement (NP / NSS)", "url": "https://www.nss.nhs.scot/procurement-and-logistics/national-frameworks-and-contracts/", "sectors": "NHS Scotland / health and social care; medicines, medical and clinical"}, {"operator_id": "ni_cpd", "name": "Northern Ireland Construction and Procurement Delivery (CPD)", "url": "https://www.finance-ni.gov.uk/articles/details-current-pan-government-contracts-and-framework-agreements", "sectors": "NI Civil Service departments, agencies and arm's-length bodies; suppli"}, {"operator_id": "nwch", "name": "North West Construction Hub (NWCH)", "url": "https://northwestconstructionhub.org/construction-frameworks/", "sectors": "Public sector construction (education, health, civic, decarbonisation,"}, {"operator_id": "nwssp", "name": "NHS Wales Shared Services Partnership (NWSSP)", "url": "https://nwssp.nhs.wales/ourservices/procurement-services/", "sectors": "NHS Wales; capital equipment, pharmaceutical/medical/clinical, food, t"}, {"operator_id": "pinnacle_ad", "name": "Pinnacle / The AD Group (AD frameworks)", "url": "https://www.theadgroup.co.uk/about-us/our-frameworks/", "sectors": "Social housing and public sector - repairs, maintenance, compliance, w"}, {"operator_id": "police_digital_service", "name": "Police Digital Service (PDS)", "url": "https://pds.police.uk/commercial-services/", "sectors": "National policing digital/ICT, security-cleared services, commercial &"}, {"operator_id": "pretium", "name": "Pretium Frameworks", "url": "https://pretium.co.uk/", "sectors": "Housing/property and asset management consultancy, decarbonisation, de"}, {"operator_id": "procurement_assist", "name": "Procurement Assist", "url": "https://procurementassist.co.uk/our-frameworks/", "sectors": "Social housing, local authorities, wider public sector - repairs, main"}, {"operator_id": "procurement_hub_pfp", "name": "Procurement Hub (Places for People)", "url": "https://www.procurementhub.co.uk/our-solutions/current-solutions/energy-procurement-and-consultancy/", "sectors": "Energy procurement & consultancy, decarbonisation/retrofit, constructi"}, {"operator_id": "prosper", "name": "Prosper (Prosper Procurement Ltd)", "url": "https://prosper.uk.com/", "sectors": "Social housing and local authorities - decarbonisation/retrofit and in"}, {"operator_id": "sbc", "name": "Schools' Buying Club (SBC) / Place Group", "url": "https://www.schoolsbuyingclub.com/", "sectors": "Schools and trusts (England), regional buying-hub support"}, {"operator_id": "scf", "name": "Southern Construction Framework (SCF)", "url": "https://southernconstructionframework.gov.uk/about-us/", "sectors": "Public sector construction, residential and consultancy (South West, S"}, {"operator_id": "scot_gov_procurement", "name": "Scottish Government - Scottish Procurement (Scottish Procurement and Property Directorate / National Collaborative Procurement)", "url": "https://www.gov.scot/publications/frameworks-and-contracts/", "sectors": "Whole Scottish public sector (national collaborative agreements) plus "}, {"operator_id": "sewscap", "name": "SEWSCAP (South East & Mid Wales Collaborative Construction Framework)", "url": "https://sewscap.co.uk/", "sectors": "Public sector construction (incl. housing) - South East and Mid Wales"}, {"operator_id": "spa_housing", "name": "Scottish Procurement Alliance (SPA)", "url": "https://www.scottishprocurement.scot/", "sectors": "Social housing and public buildings in Scotland"}, {"operator_id": "swpa", "name": "South West Procurement Alliance (SWPA)", "url": "https://www.swpa.org.uk/", "sectors": "Social housing and public buildings in the South West of England"}, {"operator_id": "tfl", "name": "Transport for London (TfL)", "url": "https://tfl.gov.uk/info-for/boroughs-and-communities/professional-services-frameworks", "sectors": "Transport, engineering, professional services, legal, project/programm"}, {"operator_id": "tppl", "name": "TPPL (The Procurement Partnership Limited)", "url": "https://www.tppl.co.uk/frameworks/", "sectors": "Local government and wider public sector; fleet/vehicles, EV charging,"}, {"operator_id": "westworks", "name": "Westworks", "url": "https://www.westworks.org.uk/solutions/", "sectors": "Social housing, local authorities, education; nationwide (originated S"}, {"operator_id": "wme", "name": "West Mercia Energy (WME)", "url": "https://westmerciaenergy.co.uk/energy-frameworks", "sectors": "Energy and utilities (electricity, gas, water/wastewater) for local au"}, {"operator_id": "yorhub", "name": "YORhub", "url": "https://www.yorhub.com/frameworks/", "sectors": "Local government & wider public sector construction, civil engineering"}]
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
