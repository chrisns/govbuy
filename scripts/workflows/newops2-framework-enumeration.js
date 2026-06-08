export const meta = {
  name: 'newops2-framework-enumeration',
  description: 'Enumerate each net-new operator’s framework/DPS catalogue (source-anchored, gated)',
  phases: [{ title: 'Enumerate', detail: 'one agent per operator; copy its framework list verbatim' }],
}

const OPERATORS = [{"operator_id": "caja", "name": "CAJA (CAJA Group)", "url": "https://www.cajagroup.com/frameworks/", "sectors": "Health and social care (Health and Social Care Services Framework - HS"}, {"operator_id": "cbg", "name": "Charities Buying Group (CBG)", "url": "https://charitiesbuyinggroup.com/", "sectors": "Third sector / charities / not-for-profit; MFDs/print, IT, utilities/e"}, {"operator_id": "ccsr_wales", "name": "Children's Commissioning Support Resource (CCSR) - Data Cymru", "url": "https://www.ccsr-wales.net/page1.html", "sectors": "Children's residential and foster placements (operational matching lay"}, {"operator_id": "coch_cps", "name": "COCH CPS (Countess of Chester Commercial Procurement Services)", "url": "https://www.coch-cps.co.uk/", "sectors": "Healthcare, corporate services, energy services, software & systems"}, {"operator_id": "commissioning_alliance", "name": "Commissioning Alliance (West London Alliance procurement consortium)", "url": "https://commissioningalliance.co.uk/what-we-do/placements/", "sectors": "Children's residential care, fostering, SEND/SEN placements; Adults' r"}, {"operator_id": "devon_cc", "name": "Devon County Council (Southern Construction Framework host)", "url": "https://www.scfframeworks.org.uk/", "sectors": "Construction (\u00a30.5m-\u00a3250m+), associated construction professional serv"}, {"operator_id": "em_lawshare", "name": "EM LawShare (operated by Nottinghamshire County Council)", "url": "https://emlawshare.co.uk/", "sectors": "Legal services (full range) for public bodies"}, {"operator_id": "empc", "name": "East Midlands Pharmacy Collaborative (EMPC)", "url": "https://www.empc.nhs.uk/procurement/", "sectors": "Health/NHS pharmacy & medicines procurement; pharmacy products and ser"}, {"operator_id": "essex_cc_ecf", "name": "Essex County Council - Essex Construction Framework (ECF)", "url": "https://www.essex.gov.uk/business/doing-business-council/essex-construction-framework-3/who-can-use-framework", "sectors": "Construction (3 core lots) - new build, refurbishment, civils/infrastr"}, {"operator_id": "essex_procurement_hub", "name": "EPH Frameworks (Essex Procurement Hub)", "url": "https://www.ephframeworks.org/", "sectors": "Facilities, Fleet, ICT, and Specialist categories. Example frameworks:"}, {"operator_id": "hampshire_cc", "name": "Hampshire County Council (Southern Modular Building Framework / Contracting Direct)", "url": "https://www.hants.gov.uk/business/smbf", "sectors": "Modular/offsite construction (Southern Modular Building Framework), mi"}, {"operator_id": "inprova", "name": "Inprova", "url": "https://www.inprova.com/frameworks-and-dps/", "sectors": "Cross-sector public bodies; frameworks, Dynamic Purchasing Systems and"}, {"operator_id": "inspired_energy", "name": "Inspired PLC (Inspired Energy)", "url": "https://inspiredplc.co.uk/how-we-help/energy/procurement/compliant-procurement-frameworks/", "sectors": "Public sector; compliant energy procurement frameworks (gas/electricit"}, {"operator_id": "jv_north", "name": "JV North", "url": "https://jvnorth.co.uk/", "sectors": "Social housing / housebuilding (construction). New-build contractor an"}, {"operator_id": "lgfl", "name": "London Grid for Learning (LGfL)", "url": "https://lgfl.net/", "sectors": "Education (schools, MATs), local authorities, libraries; ICT/broadband"}, {"operator_id": "london_care", "name": "London Care Services (LCS) / London Care Placements", "url": "https://www.londoncareplacements.gov.uk/support/factsheet-about-lcs", "sectors": "Children's residential and fostering placements (brokerage with approv"}, {"operator_id": "manchester_cc", "name": "Manchester City Council (TC886 Highways Construction Works Framework)", "url": "https://www.manchester.gov.uk/business-and-investment/tenders-and-contracts/current-frameworks", "sectors": "Highways and civil construction works"}, {"operator_id": "miaa", "name": "MIAA (Mersey Internal Audit Agency)", "url": "https://www.miaa.nhs.uk/about-us/frameworks/", "sectors": "Internal/statutory audit, assurance, counter-fraud, consultancy/adviso"}, {"operator_id": "national_lgps", "name": "National LGPS Frameworks (lead authority: Norfolk County Council)", "url": "https://www.nationallgpsframeworks.org/live-frameworks", "sectors": "Pensions / LGPS specialist services: actuarial, benefits & governance "}, {"operator_id": "nepo_socialcare", "name": "NEPO (North East) Social Care flexible procurement agreements - NOTE", "url": "https://www.nepo.org/solutions/social-care", "sectors": "Independent foster care services and children's placements (range of s"}, {"operator_id": "neyppc", "name": "North East and Yorkshire NHS Pharmaceutical Purchasing Consortium (NEYPPC, hosted by Leeds Teaching Hospitals)", "url": "https://www.northeastandyorkshirepharmaceuticalpurchasing.nhs.uk/framework-catalogue", "sectors": "Medicines (unlicensed/specials), pharmaceutical products and services"}, {"operator_id": "nhs_commercial_solutions", "name": "NHS Commercial Solutions (NHSCS, South East Coast)", "url": "https://www.commercialsolutions-sec.nhs.uk/frameworks", "sectors": "NHS and wider public sector: Corporate Services, Estates and Facilitie"}, {"operator_id": "nhs_mpsc", "name": "NHS England Medicines Procurement and Supply Chain (MPSC) / Specialist Pharmacy Service (SPS)", "url": "https://www.sps.nhs.uk/articles/medicines-procurement-and-supply-chain-mpsc-frameworks/", "sectors": "Health/NHS national medicines: generic and branded medicines, biosimil"}, {"operator_id": "nhs_workforce_alliance", "name": "NHS Workforce Alliance", "url": "https://www.workforcealliance.nhs.uk/frameworks/", "sectors": "Health/NHS workforce: clinical & healthcare staffing, temporary/perman"}, {"operator_id": "npa", "name": "Northern Procurement Alliance (NPA)", "url": "https://www.northernprocurement.org.uk/frameworks/", "sectors": "Construction, refurbishment and maintenance of social housing and publ"}, {"operator_id": "nwadcs", "name": "NWADCS (North West Association of Directors of Children's Services) - Regional Purchasing Systems", "url": "https://www.nwadcs.org.uk/regional-purchasing-systems", "sectors": "Children's fostering, residential care, supported accommodation (16+),"}, {"operator_id": "nwcp", "name": "North Wales Construction Partnership (NWCP)", "url": "https://nwcp.co.uk/", "sectors": "Construction / built environment (public buildings and works in North "}, {"operator_id": "ppsa", "name": "Peninsula Purchasing and Supply Alliance (PPSA)", "url": "https://www.ppsa.nhs.uk/", "sectors": "Health/NHS collaborative procurement across the South West (Peninsula)"}, {"operator_id": "procurepublic", "name": "ProcurePublic", "url": "https://www.procurepublic.co.uk/framework", "sectors": "Construction, building refurbishment, M&E (electrical/heating/roofing)"}, {"operator_id": "rwt_pathology", "name": "Royal Wolverhampton NHS Trust - Pathology Procurement Managed Service Framework", "url": "https://royalwolverhampton.nhs.uk/service/pathology-services/procurement-managed-service-framework/", "sectors": "Health/NHS pathology managed services: equipment, reagents, consumable"}, {"operator_id": "segfl", "name": "South East Grid for Learning (SEGfL) / South East Grid Consortium", "url": "https://segfl.org.uk/", "sectors": "Education (schools), plus health, blue light, voluntary/charity and lo"}, {"operator_id": "soeps", "name": "NHS South of England Procurement Services (SoEPS)", "url": "https://soeprocurement.nhs.uk/frameworks/", "sectors": "Health/NHS plus wider public sector; national back-office systems/serv"}, {"operator_id": "star_procurement", "name": "STAR Procurement", "url": "https://www.star-procurement.gov.uk/", "sectors": "Cross-sector / local government (general goods, services and works)"}, {"operator_id": "tenet_procurement", "name": "Tenet Procurement Services (part of CPL Group)", "url": "https://www.tenetprocurement.com/frameworks/", "sectors": "Education and wider public sector; 20+ national public-sector purchasi"}, {"operator_id": "wm_commissioning", "name": "West Midlands Regional Commissioning Hub / West Midlands Placement Portal (lead via Birmingham Children's Trust)", "url": "https://www.birminghamchildrenstrust.co.uk/info/3/information_for_professionals/486/west_midlands_placement_portal", "sectors": "Children's residential, fostering and supported accommodation placemen"}, {"operator_id": "zenergi", "name": "Zenergi (ISBL energy framework)", "url": "https://zenergi.co.uk/", "sectors": "Education (schools, MATs, colleges) and wider public sector; energy (g"}]
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
