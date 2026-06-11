export const meta = {
  name: 'govbuy-eval-harness',
  description: 'Run 24 golden buyer/seller questions through the live govbuy MCP and adversarially judge each answer; report a baseline pass rate',
  phases: [
    { title: 'Load', detail: 'read golden question set' },
    { title: 'Run', detail: 'each question through the live MCP via claude -p (parallel)' },
    { title: 'Judge', detail: 'score each answer against its expectation (parallel)' },
  ],
}

const MCP = '{"mcpServers":{"govbuy":{"type":"http","url":"https://govbuy.run.cns.me/mcp"}}}'
const TOOLS = "mcp__govbuy__find_routes,mcp__govbuy__find_services,mcp__govbuy__compliant_path,mcp__govbuy__get_instrument,mcp__govbuy__find_instruments_to_list,mcp__govbuy__list_resellers,mcp__govbuy__get_supplier,mcp__govbuy__query_sql,mcp__govbuy__get_schema,mcp__govbuy__get_status"

const QLIST = { type:'object', additionalProperties:false, properties: {
  questions: { type:'array', items: { type:'object', additionalProperties:false,
    properties: { q:{type:'string'}, expects:{type:'string'} }, required:['q','expects'] } } },
  required:['questions'] }
const VERDICT = { type:'object', additionalProperties:false, properties: {
  pass: {type:'boolean'}, score: {type:'number'}, met: {type:'string'}, issues: {type:'string'} },
  required:['pass','score','met','issues'] }

phase('Load')
const loaded = await agent(`Read the file eval/golden_questions.json (use the Read tool or 'cat'). It is a JSON array of {q, persona, expects}. Return it as questions, each {q, expects} (keep only those two fields).`,
  { label: 'load-golden', schema: QLIST, model: 'haiku', phase: 'Load' })
const Q = loaded.questions
log(`loaded ${Q.length} golden questions`)

const verdicts = await pipeline(Q,
  (item, _orig, i) => agent(`Run ONE buyer/seller question against the live govbuy MCP and return the assistant's full final answer text, VERBATIM, with nothing added.

Question: ${item.q}

Do exactly this:
1. Write the question to a temp file: printf '%s' ${JSON.stringify(item.q)} > /tmp/gq_${i}.txt
2. Run: claude -p "$(cat /tmp/gq_${i}.txt)" --mcp-config '${MCP}' --allowedTools "${TOOLS}" --output-format text
3. Return ONLY what that command printed to stdout (the answer). If it errors, return the error text.`,
    { label: `run#${i}`, model: 'haiku', phase: 'Run' }),

  (answer, item, i) => agent(`You are a STRICT evaluator of a UK public-sector procurement assistant (govbuy). Judge whether the answer materially meets the expectation.

QUESTION: ${item.q}

EXPECTATION (what a good answer MUST contain): ${item.expects}

ANSWER:
${answer}

Rules: pass=true ONLY if the answer meets the core of the expectation — correct route/framework, correct call-off mechanic (e.g. DPS bars direct award), right catalogue (furniture desk vs IT service desk), and cites a real URL where the expectation demands one. Mark pass=false for any hallucinated framework/RM that doesn't exist, wrong mechanic, or wrong catalogue. score 0..1. 'met' = what it got right; 'issues' = what's missing/wrong (concise).`,
    { label: `judge#${i}`, schema: VERDICT, model: 'sonnet', phase: 'Judge' }).then(v => ({ ...v, q: item.q, expects: item.expects }))
)

const ok = verdicts.filter(Boolean)
const passed = ok.filter(v => v.pass).length
const avg = ok.length ? ok.reduce((a,v)=>a+(v.score||0),0)/ok.length : 0
return {
  total: ok.length,
  passed,
  pass_rate: ok.length ? Math.round(100*passed/ok.length) : 0,
  avg_score: Math.round(avg*100)/100,
  failures: ok.filter(v=>!v.pass).map(v=>({ q: v.q, issues: v.issues })),
}
