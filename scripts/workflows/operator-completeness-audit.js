export const meta = {
  name: 'operator-completeness-audit',
  description: 'Enumerate the UK public-sector framework-operator universe by sector and diff against the known set',
  phases: [{ title: 'Discover', detail: 'one researcher per sector' }, { title: 'Synthesise', detail: 'dedup + diff vs known' }],
}

const KNOWN = (args && args.known) || []
const SECTORS = [
  'Defence & security (MoD, DE&S / Defence Equipment & Support, Defence Sourcing Portal, Team Defence Information, submarine/nuclear, DIO)',
  'Policing, fire & rescue, and ambulance / blue-light (BlueLight Commercial, Police Digital Service, national police frameworks, fire & rescue procurement)',
  'Health & social care beyond the main NHS hubs (regional NHS collaborative procurement hubs, NHS Commercial Solutions, NHS Workforce Alliance, social care & adult care commissioning frameworks, MIAA, Health Procurement)',
  'Social housing & construction consortia (Efficiency North, CHIC, Advantage South West, Re:allies, Places for People Procurement Hub, Procurement Hub, Central Housing Investment Consortium, Southern Construction Framework, NHF, Homes England, Notting Hill)',
  'Local government, combined authorities & shared procurement bodies (TPPL, Eastern Highways Alliance, YORhub, Midlands Highways Alliance, West Mercia Energy, ESPO-like LA bodies not already known, Tendering/Procurement partnerships)',
  'Devolved administrations & crown dependencies (Scottish Government national frameworks / Scottish Procurement & Property, Scotland Excel, Crown Commercial Scotland, Welsh Government / Sell2Wales central frameworks, Northern Ireland CPD - Construction & Procurement Delivery, Jersey/Guernsey/IoM)',
  'Education & schools buying (DfE schools commercial frameworks, Crown Commercial education, academy/MAT buying hubs, The Schools Buying Hub, Everything ICT-like education ICT bodies, YPO education)',
  'Transport, rail, utilities, energy & central-government-other (Network Rail frameworks, Transport for London / TfL, Highways England / National Highways, Environment Agency, Crown Commercial energy, LASER/energy buying consortia, Procurement for housing energy)',
]

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    operators: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          sectors: { type: 'string' },
          has_public_catalogue: { type: 'boolean' },
          example_frameworks: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
        required: ['name', 'url', 'sectors', 'has_public_catalogue', 'example_frameworks', 'notes'],
      },
    },
  },
  required: ['operators'],
}

const prompt = (sector) => `You are auditing the COMPLETENESS of a UK public-sector "route-to-market" catalogue. List EVERY organisation in this sector that operates framework agreements / DPS / dynamic markets that public bodies can call off from (i.e. a buying organisation, professional buying organisation, consortium, or central body that PUBLISHES framework agreements — not individual suppliers, not one-off tenders).

SECTOR: ${sector}

Use web search to be current and exhaustive (2025/2026). For each operator return: name, url (its frameworks/agreements page if findable), sectors it serves, has_public_catalogue (true if it publishes a browsable list of its frameworks), 2-4 example_frameworks, and notes (e.g. "national body", "regional", "membership-only", "winding down").

Be aggressive about completeness — include national bodies AND regional/sub-national ones. Prefer to over-include (mark uncertain ones in notes) than to miss a route.

These are ALREADY in the catalogue — do NOT list them (but DO list any sibling/sub-brand that is genuinely a distinct operator):
${KNOWN.join(', ')}`

phase('Discover')
const found = await parallel(SECTORS.map((s, i) => () =>
  agent(prompt(s), { label: `sector:${i}`, phase: 'Discover', schema: SCHEMA }).then(r => r?.operators || []).catch(() => [])
))

// dedup by normalised name, and flag any that look like a known operator
const norm = (s) => (s || '').toLowerCase().replace(/\b(ltd|limited|plc|llp|the|group|uk|services|procurement|consortium)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
const knownNorms = new Set(KNOWN.map(norm))
const seen = new Map()
for (const list of found) for (const op of (list || [])) {
  const k = norm(op.name)
  if (!k) continue
  if (!seen.has(k)) seen.set(k, { ...op, _likelyKnown: knownNorms.has(k) })
}
const all = [...seen.values()]
const netNew = all.filter(o => !o._likelyKnown)
log(`sectors returned ${found.reduce((a, b) => a + (b ? b.length : 0), 0)} rows; ${all.length} distinct; ${netNew.length} not obviously already-known`)
return { totalDistinct: all.length, netNewCount: netNew.length, candidates: netNew, all }
