export const meta = {
  name: 'govbuy-thinprime-expand',
  description: 'Fetch each reseller/prime partner page and extract the vendors they carry + frameworks + channel type, source-anchored',
  phases: [{ title: 'Extract', detail: 'one Haiku agent per candidate: fetch + extract vendors/frameworks/channel' }],
}

const SCHEMA = { type:'object', additionalProperties:false, properties: {
  name: {type:'string'},
  channel_type: {type:'string', enum:['thin_prime','var','hybrid','vendor','unknown']},
  vendors: { type:'array', items:{type:'string'}, description:'partner/vendor company names listed on the page, copied VERBATIM' },
  frameworks: { type:'array', items:{type:'string'}, description:'framework names/RM refs they say they are on, verbatim' },
  found: {type:'boolean'},
  evidence_excerpt: {type:'string', description:'one short verbatim sentence from the page showing they reposition/carry partners onto frameworks'},
}, required:['name','channel_type','vendors','frameworks','found','evidence_excerpt'] }

phase('Extract')

const cands = typeof args === 'string' ? JSON.parse(args) : args

const results = await parallel(cands.map(c => () =>
  agent(`Fetch this UK reseller/prime's public page and extract who they carry and what frameworks they're on.

Company: ${c.name}
URL: ${c.url}

Steps:
1. Get the page text. Try: defuddle "${c.url}"  (a clean-markdown extractor). If that fails, try: curl -sL -A "Mozilla/5.0" --max-time 25 "${c.url}". If the exact URL 404s, try the site root + find their "frameworks" or "partners/alliances" page.
2. Extract the list of VENDOR / PARTNER / MANUFACTURER company names they say they resell or carry (e.g. Microsoft, Dell, Cisco, AWS, Adobe, VMware…). Copy each name EXACTLY as written on the page (verbatim — they'll be substring-checked against the page).
3. Extract framework names or RM references they list (e.g. "G-Cloud 14", "RM1557", "Technology Products & Associated Services", "RM6068").
4. Classify channel_type: thin_prime = pure reseller/aggregator lending its framework place to many vendors; var = value-added reseller (resells + adds services); hybrid = both resells and delivers its own services; vendor = sells own product; unknown.
5. Give one short VERBATIM sentence (evidence_excerpt) from the page evidencing they carry third-party products onto public frameworks.

Return verbatim vendor/framework names only — do not invent. If the page is unreachable, set found=false and return empties.`,
    { label: c.name, schema: SCHEMA, model: 'haiku', phase: 'Extract' })
))

return { candidates: results.filter(Boolean) }
