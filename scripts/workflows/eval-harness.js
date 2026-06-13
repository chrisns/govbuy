export const meta = {
  name: 'govbuy-eval-harness',
  description: 'Run the golden buyer/seller/researcher question set through the live govbuy MCP and adversarially judge each answer; report a pass rate + release gate',
  phases: [
    { title: 'Load', detail: 'read golden question set' },
    { title: 'Run', detail: 'each question through the live MCP via claude -p (parallel)' },
    { title: 'Judge', detail: 'score each answer against its expectation (parallel)' },
  ],
}

const MCP = '{"mcpServers":{"govbuy":{"type":"http","url":"https://govbuy.run.cns.me/mcp"}}}'
// The seven consolidated verbs (the 17 legacy tools were collapsed into these). Keep in sync with server.ts.
const TOOLS = "mcp__govbuy__buy,mcp__govbuy__sell,mcp__govbuy__supplier,mcp__govbuy__framework,mcp__govbuy__research,mcp__govbuy__draft,mcp__govbuy__watch"
// Release gate: the run FAILS (gate=false) if the pass rate drops below this floor. Override with GOVBUY_EVAL_FLOOR.
const PASS_FLOOR = Number(process.env.GOVBUY_EVAL_FLOOR || 70)

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

// Throttled to CHUNK items at a time: each question fires its OWN nested `claude -p`, so running all
// 27 at the harness concurrency cap bursts ~50 agents at Anthropic and gets rate-limited (truncating
// answers → false failures). Small waves keep the API happy and the scores trustworthy.
const runOne = (item, i) => agent(`Run ONE buyer/seller question against the live govbuy MCP and return the assistant's full final answer text, VERBATIM, with nothing added.

Question: ${item.q}

Do exactly this:
1. Write the question to a temp file: printf '%s' ${JSON.stringify(item.q)} > /tmp/gq_${i}.txt
2. Run, in the FOREGROUND, with a long timeout so it does NOT auto-background:
   timeout 600 claude -p "$(cat /tmp/gq_${i}.txt)" --mcp-config '${MCP}' --allowedTools "${TOOLS}" --output-format text > /tmp/ga_${i}.txt 2>/tmp/ge_${i}.txt; cat /tmp/ga_${i}.txt
   The nested claude -p can take 2-3 minutes. DO NOT background this Bash call and DO NOT use the Monitor tool. If the Bash tool auto-backgrounds it, poll /tmp/ga_${i}.txt by Reading the file until the command has finished, then return the file's contents — NEVER return a "Monitor active" / "waiting for the command" status string; that is not the answer.
3. Return ONLY the assistant answer text from /tmp/ga_${i}.txt. If it is empty or is an API/rate-limit error, wait 20s, retry step 2 once, then return whatever the file holds.`,
    { label: `run#${i}`, model: 'haiku', phase: 'Run' })
  .then((answer) => agent(`You are a STRICT evaluator of a UK public-sector procurement assistant (govbuy). Judge whether the answer materially meets the expectation. If the ANSWER is empty or is an API/rate-limit error, mark pass=false with issues="rate-limited / no answer".

QUESTION: ${item.q}

EXPECTATION (what a good answer MUST contain): ${item.expects}

ANSWER:
${answer}

Rules: pass=true ONLY if the answer meets the core of the expectation — correct route/framework, correct call-off mechanic (e.g. DPS bars direct award), right catalogue (furniture desk vs IT service desk), and cites a real URL where the expectation demands one. Mark pass=false for any hallucinated framework/RM that doesn't exist, wrong mechanic, or wrong catalogue. score 0..1. 'met' = what it got right; 'issues' = what's missing/wrong (concise).`,
    { label: `judge#${i}`, schema: VERDICT, model: 'sonnet', phase: 'Judge' }).then(v => ({ ...v, q: item.q, expects: item.expects })))

const verdicts = []
const CHUNK = 4
for (let i = 0; i < Q.length; i += CHUNK) {
  const batch = Q.slice(i, i + CHUNK)
  log(`eval wave ${i / CHUNK + 1}: questions ${i + 1}-${i + batch.length} of ${Q.length}`)
  verdicts.push(...await parallel(batch.map((item, j) => () => runOne(item, i + j))))
}

const ok = verdicts.filter(Boolean)
const passed = ok.filter(v => v.pass).length
const avg = ok.length ? ok.reduce((a,v)=>a+(v.score||0),0)/ok.length : 0
const pass_rate = ok.length ? Math.round(100*passed/ok.length) : 0
const gate = pass_rate >= PASS_FLOOR
log(`eval complete: ${passed}/${ok.length} passed (${pass_rate}%); gate floor ${PASS_FLOOR}% → ${gate ? 'PASS' : 'FAIL'}`)
return {
  total: ok.length,
  passed,
  pass_rate,
  avg_score: Math.round(avg*100)/100,
  gate,            // false ⇒ a release gate should block the deploy
  pass_floor: PASS_FLOOR,
  failures: ok.filter(v=>!v.pass).map(v=>({ q: v.q, issues: v.issues })),
}
