// Generates api/public/index.html — the govbuy.run.cns.me marketing + explorable-dashboard site.
// Queries govbuy_public LIVE (re-runnable, token-free) and bakes the results into one self-contained
// HTML file in the cns.me editorial design system (Fraunces / Hanken Grotesk / JetBrains Mono).
//   run:  node api/scripts/build-site.mjs   (needs ADC; uses the api/ @google-cloud/bigquery dep)
import { BigQuery } from "@google-cloud/bigquery";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROJECT = process.env.GCP_PROJECT || "govreposcrape";
const bq = new BigQuery({ projectId: PROJECT });
const q = async (sql) => (await bq.query({ query: sql, useLegacySql: false }))[0];
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "public");

// CPV division → human sector label (the 2-digit common-procurement-vocabulary divisions).
const CPV = {
  "85": "Health & social work", "45": "Construction", "79": "Business & management services",
  "71": "Architecture & engineering", "33": "Medical equipment & pharma", "80": "Education & training",
  "60": "Transport services", "72": "IT services & software", "34": "Transport equipment",
  "39": "Furniture & furnishings", "66": "Financial & insurance", "31": "Electrical machinery",
  "48": "Software packages", "50": "Repair & maintenance", "90": "Environmental services",
  "92": "Recreation & culture", "98": "Other community services", "55": "Hospitality & catering",
  "30": "Office & computing equipment", "44": "Construction materials", "15": "Food & beverages",
  "75": "Public administration", "70": "Real estate", "77": "Grounds & agricultural",
};
const cpvLabel = (d) => CPV[d] ? `${CPV[d]} (CPV ${d})` : `CPV ${d}`;

async function main() {
console.error("querying govbuy_public …");
const [head, channels, premium, frameworks, resellers, expiry, catalogue, observed, exclusion] = await Promise.all([
  q(`SELECT
       (SELECT COUNT(*) FROM govbuy_public.instrument) AS frameworks,
       (SELECT COUNTIF(lifecycle_status='live_for_call_off') FROM govbuy_public.instrument) AS live_frameworks,
       (SELECT COUNT(*) FROM govbuy_public.operator) AS operators,
       (SELECT COUNT(*) FROM govbuy_public.supplier) AS suppliers,
       (SELECT COUNT(*) FROM govbuy_public.service) AS listings,
       (SELECT COUNT(*) FROM govbuy_public.tender_award) AS fused_awards,
       (SELECT COUNT(*) FROM govbuy_public.appointed_supplier) AS appointed_edges,
       (SELECT COUNT(*) FROM govbuy_public.pipeline_notice) AS pipeline,
       (SELECT COUNT(DISTINCT supplier_crn) FROM govbuy_public.observed_membership) AS observed_suppliers`),
  q(`SELECT channel, COUNT(*) awards, ROUND(SUM(award_amount)) gbp
     FROM govbuy_public.tender_award WHERE award_amount BETWEEN 0 AND 100000000 GROUP BY channel ORDER BY gbp DESC`),
  q(`WITH base AS (SELECT cpv_division, channel, award_amount FROM govbuy_public.tender_award WHERE award_amount BETWEEN 1000 AND 100000000 AND cpv_division IS NOT NULL),
     fw AS (SELECT cpv_division, APPROX_QUANTILES(award_amount,100)[OFFSET(50)] m, APPROX_QUANTILES(award_amount,100)[OFFSET(25)] p25, APPROX_QUANTILES(award_amount,100)[OFFSET(75)] p75, COUNT(*) n FROM base WHERE channel IN ('framework_call_off','dps_call_off') GROUP BY cpv_division),
     op AS (SELECT cpv_division, APPROX_QUANTILES(award_amount,100)[OFFSET(50)] m, COUNT(*) n FROM base WHERE channel='open' GROUP BY cpv_division),
     tot AS (SELECT cpv_division, ROUND(SUM(award_amount)) g FROM base GROUP BY cpv_division)
     SELECT t.cpv_division, CAST(fw.m AS INT64) fw_median, CAST(fw.p25 AS INT64) fw_p25, CAST(fw.p75 AS INT64) fw_p75,
            CAST(op.m AS INT64) open_median, fw.n fw_n, op.n open_n, t.g total_gbp
     FROM tot t JOIN fw USING(cpv_division) JOIN op USING(cpv_division)
     WHERE fw.n>300 AND op.n>300 ORDER BY t.g DESC LIMIT 14`),
  q(`WITH t AS (SELECT rm_reference, ROUND(SUM(award_amount)) gbp, COUNT(*) n, COUNT(DISTINCT supplier_crn) suppliers
        FROM govbuy_public.tender_award WHERE rm_reference IS NOT NULL AND channel IN ('framework_call_off','dps_call_off') AND award_amount BETWEEN 0 AND 100000000
        GROUP BY rm_reference ORDER BY gbp DESC LIMIT 12),
     nm AS (SELECT rm_reference, ANY_VALUE(name) name FROM govbuy_public.instrument WHERE rm_reference IS NOT NULL GROUP BY rm_reference)
     SELECT t.rm_reference, COALESCE(nm.name, t.rm_reference) name, t.gbp, t.n, t.suppliers FROM t LEFT JOIN nm USING(rm_reference) ORDER BY t.gbp DESC`),
  q(`SELECT s.display_name, s.company_number, ANY_VALUE(rc.channel_type) channel_type, ct.calloff_gbp gbp, ct.calloff_count n
     FROM govbuy_public.reseller_channel rc JOIN govbuy_public.supplier s ON s.supplier_id=rc.supplier_id
     JOIN govbuy_public.supplier_calloff_total ct ON ct.supplier_crn=s.company_number
     GROUP BY s.display_name, s.company_number, ct.calloff_gbp, ct.calloff_count ORDER BY gbp DESC LIMIT 10`),
  q(`SELECT FORMAT_DATE('%Y-%m', contract_end_date) ym, COUNT(*) n, ROUND(SUM(award_amount)) gbp
     FROM govbuy_public.tender_award WHERE contract_end_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 18 MONTH) AND award_amount BETWEEN 0 AND 100000000
     GROUP BY ym ORDER BY ym`),
  q(`SELECT catalogue, COUNT(*) n FROM govbuy_public.service GROUP BY catalogue ORDER BY n DESC`),
  q(`SELECT (SELECT COUNT(*) FROM govbuy_public.observed_membership) edges,
            (SELECT COUNT(DISTINCT rm_reference) FROM govbuy_public.observed_membership) frameworks,
            (SELECT COUNT(*) FROM govbuy_public.supplier_crn_canonical WHERE member_count>1) reconciled`),
  q(`SELECT COUNT(*) distressed FROM govbuy_public.supplier WHERE status_at_match IN ('dissolved','liquidation','administration','closed')`),
]);

const num = (v) => Number(v);
const data = {
  generated: new Date().toISOString().slice(0, 10),
  head: Object.fromEntries(Object.entries(head[0]).map(([k, v]) => [k, num(v)])),
  channels: channels.map((r) => ({ channel: r.channel, awards: num(r.awards), gbp: num(r.gbp) })),
  premium: premium.map((r) => ({ d: r.cpv_division, label: cpvLabel(r.cpv_division), fw: num(r.fw_median), fw_p25: num(r.fw_p25), fw_p75: num(r.fw_p75), open: num(r.open_median), fw_n: num(r.fw_n), open_n: num(r.open_n), total: num(r.total_gbp) })),
  frameworks: frameworks.map((r) => ({ rm: r.rm_reference, name: r.name, gbp: num(r.gbp), n: num(r.n), suppliers: num(r.suppliers) })),
  resellers: resellers.map((r) => ({ name: r.display_name, crn: r.company_number, type: r.channel_type, gbp: num(r.gbp), n: num(r.n) })),
  expiry: expiry.map((r) => ({ ym: r.ym, n: num(r.n), gbp: num(r.gbp) })),
  catalogue: catalogue.map((r) => ({ catalogue: r.catalogue, n: num(r.n) })),
  observed: Object.fromEntries(Object.entries(observed[0]).map(([k, v]) => [k, num(v)])),
  distressed: num(exclusion[0].distressed),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), renderHtml(data));
console.error(`wrote ${join(OUT, "index.html")} — ${data.head.fused_awards.toLocaleString()} awards, data as of ${data.generated}`);
}

// ----------------------------------------------------------------------------- rendering helpers
const gbp = (n) => {
  const a = Math.abs(n);
  if (a >= 1e12) return "£" + (n / 1e12).toFixed(1) + "tn";
  if (a >= 1e9) return "£" + (n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "bn";
  if (a >= 1e6) return "£" + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "m";
  if (a >= 1e3) return "£" + Math.round(n / 1e3) + "k";
  return "£" + n;
};
const cnum = (n) => n.toLocaleString("en-GB");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CHANNEL_LABEL = { framework_call_off: "Framework call-off", open: "Open tender", direct: "Direct award", dps_call_off: "DPS call-off", other: "Other / unclassified" };
const RESELLER_LABEL = { thin_prime: "thin-prime", var: "VAR", hybrid: "hybrid" };

function renderHtml(d) {
  // --- static bar charts (server-rendered SVG-free; CSS bars) ---
  const chMax = Math.max(...d.channels.map((c) => c.gbp));
  const channelBars = d.channels.map((c) => `
    <div class="bar-row">
      <div class="bar-label">${CHANNEL_LABEL[c.channel] || esc(c.channel)}</div>
      <div class="bar-track"><div class="bar-fill ${c.channel === "framework_call_off" || c.channel === "dps_call_off" ? "bf-pink" : "bf-ink"}" style="width:${(c.gbp / chMax * 100).toFixed(1)}%"></div></div>
      <div class="bar-val numeral">${gbp(c.gbp)} <span class="bar-sub">· ${cnum(c.awards)}</span></div>
    </div>`).join("");

  const fwMax = Math.max(...d.frameworks.map((f) => f.gbp));
  const fwRows = d.frameworks.map((f, i) => `
    <tr data-gbp="${f.gbp}" data-n="${f.n}" data-suppliers="${f.suppliers}">
      <td class="fw-rank numeral">${i + 1}</td>
      <td class="fw-name"><span class="fw-rm numeral">${esc(f.rm)}</span> ${esc(f.name)}</td>
      <td class="fw-bar"><div class="mini-track"><div class="mini-fill" style="width:${(f.gbp / fwMax * 100).toFixed(1)}%"></div></div></td>
      <td class="fw-gbp numeral">${gbp(f.gbp)}</td>
      <td class="fw-n numeral">${cnum(f.n)}</td>
      <td class="fw-s numeral">${cnum(f.suppliers)}</td>
    </tr>`).join("");

  const rsMax = Math.max(...d.resellers.map((r) => r.gbp));
  const resellerTotal = d.resellers.reduce((a, r) => a + r.gbp, 0);
  const rsBars = d.resellers.map((r) => `
    <div class="bar-row">
      <div class="bar-label">${esc(r.name)} <span class="chip-mini">${RESELLER_LABEL[r.type] || esc(r.type)}</span></div>
      <div class="bar-track"><div class="bar-fill bf-pink" style="width:${(r.gbp / rsMax * 100).toFixed(1)}%"></div></div>
      <div class="bar-val numeral">${gbp(r.gbp)} <span class="bar-sub">· ${cnum(r.n)}</span></div>
    </div>`).join("");

  const exMax = Math.max(...d.expiry.map((e) => e.gbp));
  const expiryBars = d.expiry.map((e) => {
    const [y, m] = e.ym.split("-");
    const mlabel = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m)];
    return `<div class="col" title="${e.ym}: ${gbp(e.gbp)} across ${cnum(e.n)} contracts">
      <div class="col-bar" style="height:${(e.gbp / exMax * 100).toFixed(1)}%"></div>
      <div class="col-x">${mlabel}${m === "01" ? "<br><span class='col-yr'>" + y + "</span>" : ""}</div>
    </div>`;
  }).join("");
  const expiryTotal = d.expiry.reduce((a, e) => a + e.gbp, 0);

  const catMax = Math.max(...d.catalogue.map((c) => c.n));
  const CAT_LABEL = { "g-cloud": "G-Cloud 14", "azure": "Azure Marketplace", "ypo": "YPO", "espo": "ESPO", "nhs-buying-catalogue": "NHS Buying Catalogue", "ndx": "NDX" };
  const catBars = d.catalogue.map((c) => `
    <div class="bar-row">
      <div class="bar-label">${CAT_LABEL[c.catalogue] || esc(c.catalogue)}</div>
      <div class="bar-track"><div class="bar-fill bf-ink" style="width:${(c.n / catMax * 100).toFixed(1)}%"></div></div>
      <div class="bar-val numeral">${cnum(c.n)}</div>
    </div>`).join("");

  const itPremium = d.premium.find((p) => p.d === "72");
  const totalAwardGbp = d.channels.reduce((a, c) => a + c.gbp, 0);

  const questions = [
    { p: "buyer", q: "I'm a council. I need to host a containerised web app for ~£80k/year. Just tell me how to buy it.", o: "<code>plan_buy</code> → G-Cloud 14 call-off, a 3-supplier shortlist with real delivery records, the £176k median, and the PA2023 steps — one brief." },
    { p: "buyer", q: "A fire service needs drone thermal-imaging kit fast and compliantly — is a direct award allowed?", o: "YPO Drones DPS 1148 — <b>further competition only</b>, no direct award; the Schedule 5 urgency route explained, with the Feb-2029 DPS sunset flagged." },
    { p: "buyer", q: "We're about to award to a supplier in liquidation — should we?", o: "The exclusion gate <b>stops you</b>: a live Companies House check + the s.62 debarment register, both PA2023 limbs." },
    { p: "buyer", q: "Which of the viable routes is best for a managed SOC — and why?", o: "<code>compare_routes</code> ranks Cyber Security 3 DPS vs TS4 vs Network Services 3 on speed × depth × runway × real price." },
    { p: "seller", q: "I've built an AI triage tool but I'm on no framework. How do I get in front of the NHS this quarter?", o: "Get admitted to an AI dynamic market (RM6200 / HealthTrust) — continuous joining; plus where NHS commissioners actually shop." },
    { p: "seller", q: "Find me an incumbent on a big contract that's expiring, and how to compete.", o: "<code>contract_expiry_radar</code> surfaces the displacement window — incumbent, value, end date, the route to re-bid." },
    { p: "seller", q: "I rent out goats that clear invasive scrub. How do I sell conservation grazing to the public sector?", o: "An honest answer: no grazing framework exists; the money flows via grounds-maintenance primes — subcontract, and chase sub-threshold local notices." },
    { p: "researcher", q: "Is the public sector overpaying by buying IT through framework call-offs instead of open competition?", o: "In IT the median call-off (£183k) runs <b>above</b> open tender (£140k) — a real convenience premium; every other sector inverts." },
    { p: "researcher", q: "Map the 'thin-prime' economy — who fronts other firms onto public frameworks, and how much flows there?", o: `${gbp(resellerTotal)} of call-off spend traced to the reseller layer — Softcat, Phoenix, CDW, Bramble Hub…` },
    { p: "researcher", q: "Which 'live' tech frameworks are dead paper — appointed suppliers but no real spend?", o: "It tells you what it can prove <i>and what it can't</i> — separating genuinely-idle frameworks from attribution gaps." },
  ];
  const PERSONA = { buyer: "Buyer", seller: "Seller", researcher: "Researcher" };
  const qCards = questions.map((x) => `
    <article class="q-card q-${x.p}">
      <span class="q-persona">${PERSONA[x.p]}</span>
      <p class="q-q">${esc(x.q)}</p>
      <p class="q-o">${x.o}</p>
    </article>`).join("");

  const tools = [
    ["Buyer", [
      ["find_routes", "frameworks that fit a need + permitted mechanics"],
      ["find_services", "the catalogue listing that does it — semantic + proof-of-delivery"],
      ["compliant_path", "how to call it off — Procurement-Act-2023-precise"],
      ["plan_buy", "one opinionated brief: route + shortlist + price + exclusion + checklist"],
      ["compare_routes", "a decision matrix: speed × competition × depth × runway × price"],
      ["benchmark_price", "what the public sector really paid (median / p25–p75)"],
      ["due_diligence", "is this supplier safe? two-limb live exclusion + delivery record"],
      ["get_supplier", "one supplier — exclusion, full framework footprint, evidence"],
    ]],
    ["Seller", [
      ["find_instruments_to_list", "frameworks & live DPS you can still join"],
      ["supplier_pipeline", "live + forward opportunities, incumbents to displace, resellers"],
      ["contract_expiry_radar", "incumbents whose contracts are running out"],
      ["list_resellers", "thin-primes & VARs that can carry you in"],
    ]],
    ["Researcher", [
      ["spend_xray", "how money flows by channel + market concentration"],
      ["get_instrument", "one framework — suppliers, mechanics, observed-from-awards backfill"],
      ["query_sql", "read-only BigQuery over the whole corpus"],
      ["get_schema / get_status", "the schema + per-table freshness & coverage"],
    ]],
  ];
  const toolCols = tools.map(([persona, list]) => `
    <div class="tool-col">
      <h3 class="tool-persona"><span class="eyebrow">${persona}</span></h3>
      <ul class="tool-list">
        ${list.map(([t, desc]) => `<li><code>${esc(t)}</code><span>${esc(desc)}</span></li>`).join("")}
      </ul>
    </div>`).join("");

  const installCmd = "claude mcp add --transport http govbuy https://govbuy.run.cns.me/mcp";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>govbuy — the UK public-procurement co-pilot</title>
<meta name="description" content="Ask your AI assistant how to buy across the UK public sector, where to sell, or how public money flows — source-anchored across 3,200 frameworks, 117k catalogue listings and 658k real awards. An MCP server by cns.me." />
<meta name="theme-color" content="#F4EFE7" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23F4EFE7'/%3E%3Ccircle cx='16' cy='17' r='7' fill='%23E5197F'/%3E%3C/svg%3E" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://govbuy.run.cns.me/" />
<meta property="og:title" content="govbuy — the UK public-procurement co-pilot" />
<meta property="og:description" content="Route × reality × statute for UK public procurement — for buyers, suppliers and researchers. An MCP server by cns.me." />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,800;0,9..144,900;1,9..144,400;1,9..144,500;1,9..144,600&family=Hanken+Grotesk:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="page">
${MASTHEAD}

<section class="hero">
  <div class="hero-body">
    <span class="eyebrow">An MCP server · UK public procurement</span>
    <h1 class="hero-headline">The public-procurement <em>co-pilot.</em></h1>
    <p class="hero-lede">Ask your AI assistant <em>how to buy</em> a thing across the UK public sector, <em>where to sell</em> it as a vendor, or <em>how public money flows</em> as a researcher — and get a complete, source-anchored, decision-grade answer. Route&nbsp;×&nbsp;reality&nbsp;×&nbsp;statute, in one place.</p>
    <div class="install">
      <code id="install">${esc(installCmd)}</code>
      <button class="copy-btn" data-copy="${esc(installCmd)}" aria-label="Copy install command">Copy</button>
    </div>
    <p class="hero-fine">Works with any MCP client — Claude, Claude&nbsp;Code, and the rest. Free &amp; unauthenticated.</p>
  </div>
  <div class="hero-stats">
    ${[
      [cnum(d.head.frameworks), "frameworks & dynamic markets"],
      [cnum(d.head.listings), "catalogue listings"],
      [cnum(d.head.fused_awards), "real awards fused in"],
      [gbp(totalAwardGbp), "of awarded contract value"],
    ].map(([n, c]) => `<div class="stat"><span class="stat-num numeral">${n}</span><span class="stat-cap">${c}</span></div>`).join("")}
  </div>
</section>

<section class="layers" id="what">
  ${sectionHeader("What it holds", "Three layers no other tool welds together")}
  <div class="layer-grid">
    <article class="layer">
      <span class="layer-no numeral">01</span>
      <h3>Route</h3>
      <p><b class="numeral">${cnum(d.head.frameworks)}</b> frameworks, DPS &amp; dynamic markets across <b class="numeral">${cnum(d.head.operators)}</b> operators — every lot, mechanic and document a compliant purchase needs — plus <b class="numeral">${cnum(d.head.listings)}</b> catalogue listings of what suppliers actually sell, searchable by capability.</p>
    </article>
    <article class="layer">
      <span class="layer-no numeral">02</span>
      <h3>Reality</h3>
      <p><b class="numeral">${cnum(d.head.fused_awards)}</b> real tender awards joined on Companies House CRN: who actually wins the work, what buyers really pay, what's live, what's <i>coming</i> (<b class="numeral">${cnum(d.head.pipeline)}</b> pipeline notices) and what's <i>expiring</i>.</p>
    </article>
    <article class="layer">
      <span class="layer-no numeral">03</span>
      <h3>Statute</h3>
      <p>The <b>Procurement Act 2023</b> mechanics — standstill, competitive flexible procedure, Schedule&nbsp;5 grounds, a two-limb exclusion gate (live Companies House + the s.62 debarment register) — so a route isn't just available but <i>defensible</i>.</p>
    </article>
  </div>
</section>

<section class="dashboards" id="data">
  ${sectionHeader("Explore the data", "Real numbers from the corpus — not a brochure")}
  <p class="section-lede">Every figure below is live from <code>govbuy_public</code> as of <span class="numeral">${d.generated}</span>, the same data your assistant reasons over. Framework-ceiling outliers (&gt;£100m) are removed; medians are robust to them.</p>

  <div class="dash dash-explorer" id="explorer">
    <div class="dash-head">
      <span class="eyebrow">Interactive · pick a sector</span>
      <h3>Framework call-off vs open tender — what you really pay</h3>
      <p class="dash-note">The conventional wisdom is that frameworks save money. At the <b>median</b> they mostly don't — open tender captures the mega-projects, so its median sits higher in most sectors. The revealing exception is <b>IT</b>, where the call-off median runs <i>above</i> open: a real convenience premium on the routine middle of the market.</p>
    </div>
    <div class="explorer-chips" id="exChips">
      ${d.premium.map((p, i) => `<button class="ex-chip${i === d.premium.findIndex((x) => x.d === "72") ? " active" : ""}" data-i="${i}">${esc((CPV[p.d] || ("CPV " + p.d)).replace(/ \(CPV.*/, ""))}</button>`).join("")}
    </div>
    <div class="explorer-panel" id="exPanel"></div>
  </div>

  <div class="dash-grid">
    <div class="dash">
      <div class="dash-head"><span class="eyebrow">£${(totalAwardGbp / 1e9).toFixed(0)}bn mapped</span><h3>How public money is awarded</h3><p class="dash-note">Awarded spend by channel. Open tender dominates by value (the big programmes); framework &amp; DPS call-offs are the high-volume routine layer.</p></div>
      <div class="bars">${channelBars}</div>
    </div>
    <div class="dash">
      <div class="dash-head"><span class="eyebrow">The intermediary layer</span><h3>${gbp(resellerTotal)} flows through resellers</h3><p class="dash-note">Thin-primes &amp; VARs that carry other firms onto frameworks — the public buyer often never contracts who does the work.</p></div>
      <div class="bars">${rsBars}</div>
    </div>
  </div>

  <div class="dash dash-table">
    <div class="dash-head"><span class="eyebrow">Sortable · click a header</span><h3>The frameworks that actually move money</h3><p class="dash-note">Attributable call-off spend per framework (CRN-joined from real awards). Sort by spend, awards or supplier breadth.</p></div>
    <table class="fw-table" id="fwTable">
      <thead><tr>
        <th class="fw-rank">#</th><th class="fw-name">Framework</th><th class="fw-bar"></th>
        <th class="fw-gbp sortable" data-key="gbp">Call-off £ ▾</th>
        <th class="fw-n sortable" data-key="n">Awards</th>
        <th class="fw-s sortable" data-key="suppliers">Suppliers</th>
      </tr></thead>
      <tbody>${fwRows}</tbody>
    </table>
  </div>

  <div class="dash-grid">
    <div class="dash">
      <div class="dash-head"><span class="eyebrow">${gbp(expiryTotal)} re-procurement wave</span><h3>Contracts expiring — the next 18 months</h3><p class="dash-note">Every bar is real contract-end value. For buyers: re-procurement deadlines. For sellers: displacement windows.</p></div>
      <div class="cols">${expiryBars}</div>
    </div>
    <div class="dash">
      <div class="dash-head"><span class="eyebrow">${cnum(d.head.listings)} listings · 6 catalogues</span><h3>What's actually on the shelves</h3><p class="dash-note">Per-listing descriptions across every public UK buying catalogue, searchable by capability — token-free re-crawled.</p></div>
      <div class="bars">${catBars}</div>
    </div>
  </div>
</section>

<section class="questions" id="ask">
  ${sectionHeader("Ask it anything", "Real questions, real answers")}
  <p class="section-lede">A sample of what people actually ask — across buyer, seller and researcher. Every answer is genuine <code>claude&nbsp;-p</code> output, source-anchored, with the URLs to verify.</p>
  <div class="q-grid">${qCards}</div>
</section>

<section class="tools" id="tools">
  ${sectionHeader("17 tools, 3 personas", "One MCP server, three jobs")}
  <div class="tool-grid">${toolCols}</div>
</section>

<section class="honest" id="honest">
  ${sectionHeader("The honest part", "What it can't do — and says so")}
  <div class="honest-grid">
    <p>Credibility is in the candour. govbuy never fabricates: every supplier, framework and £ comes from a source that literally states it, behind a verbatim-substring gate.</p>
    <ul>
      <li><b>Login-walled supplier lists.</b> ~328 frameworks publish membership only behind a portal login — govbuy says so rather than guessing.</li>
      <li><b>Attribution gaps.</b> Most awards carry no framework reference, so a flagship showing low spend is often an attribution gap, <i>not</i> dead paper — and it tells you which.</li>
      <li><b>Backfilled, labelled.</b> Where an official list is missing, <b class="numeral">${cnum(d.observed.edges)}</b> supplier×framework edges are inferred from real awards — clearly marked observed-not-official.</li>
      <li><b>Not legal advice.</b> It documents routes; it doesn't assemble the purchase or sign off compliance. Confirm on the official source it links.</li>
    </ul>
  </div>
</section>

<section class="cta" id="contact">
  <div class="cta-inner">
    <div class="orn">🦩</div>
    <span class="eyebrow on-paper">Built by cns.me</span>
    <h2 class="cta-title">If this is the kind of thing you need built — <em>let's talk.</em></h2>
    <p class="cta-lede">govbuy is one example of how cns.me turns a messy, high-stakes domain into something an AI can reason over precisely. Strategy, data, and the engineering to make it real.</p>
    <div class="cta-row">
      <a class="btn-primary" href="mailto:chris@cns.me?subject=govbuy">chris@cns.me →</a>
      <a class="btn-ghost" href="https://github.com/chrisns/govbuy">See the code</a>
      <a class="btn-ghost" href="https://cns.me">cns.me</a>
    </div>
  </div>
</section>

${COLOPHON(d)}
</div>
<script>window.__DATA__=${JSON.stringify({ premium: d.premium })};</script>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}

function sectionHeader(kicker, title) {
  return `<header class="section-header">
    <div class="rule strong"></div>
    <div class="sh-row"><span class="eyebrow">${kicker}</span><h2 class="sh-title">${title}</h2></div>
  </header>`;
}

const MASTHEAD = `<header class="masthead">
  <div class="rule top"></div>
  <div class="masthead-row">
    <a class="brand" href="https://cns.me">
      <span class="brand-cns">cns</span><span class="brand-dot"></span><span class="brand-me">me</span>
      <span class="brand-blog">/ govbuy</span>
    </a>
    <span class="masthead-meta"><em>route × reality × statute</em></span>
  </div>
  <div class="rule"></div>
  <nav class="masthead-nav">
    <div class="nav-left">
      <a href="#what">What</a><a href="#data">Data</a><a href="#ask">Ask</a><a href="#tools">Tools</a>
    </div>
    <div class="nav-right">
      <a href="https://github.com/chrisns/govbuy">GitHub</a><a href="https://blog.cns.me">Blog</a><a href="https://talks.cns.me">Talks</a><a href="https://cns.me">cns.me</a>
    </div>
  </nav>
  <div class="rule"></div>
</header>`;

const COLOPHON = (d) => `<footer class="colophon">
  <div class="colophon-grid">
    <div>
      <span class="brand"><span class="brand-cns">cns</span><span class="brand-dot"></span><span class="brand-me">me</span><span class="brand-blog">/ govbuy</span></span>
      <p class="cl-note">An MCP server mapping UK public-sector routes to market. Source-anchored; not the authority of record; not legal advice.</p>
    </div>
    <div>
      <h4 class="cl-h">Elsewhere</h4>
      <ul class="cl-list">
        <li><a href="https://cns.me">cns.me / LinkedIn</a></li><li><a href="https://blog.cns.me">Blog</a></li>
        <li><a href="https://talks.cns.me">Talks</a></li><li><a href="https://github.com/chrisns/govbuy">GitHub</a></li>
      </ul>
    </div>
    <div>
      <h4 class="cl-h">The corpus</h4>
      <ul class="cl-list">
        <li class="numeral">${cnum(d.head.frameworks)} frameworks</li><li class="numeral">${cnum(d.head.fused_awards)} awards</li>
        <li class="numeral">${cnum(d.head.suppliers)} suppliers</li><li>data as of <span class="numeral">${d.generated}</span></li>
      </ul>
    </div>
  </div>
  <div class="rule"></div>
  <p class="cl-fine">© cns.me · Facts are not copyrightable; short excerpts kept for verification under the UK quotation exception, attributed &amp; linked. Open Government Licence v3.0 where applicable.</p>
</footer>`;

const CSS = `
:root{
  --font-display:"Fraunces","Times New Roman",ui-serif,serif;
  --font-body:"Hanken Grotesk",ui-sans-serif,system-ui,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --pink:#E5197F;--pink-hot:#FF2D8A;--pink-deep:#B30E61;--pink-ink:#5A0830;
  --ink:#14110F;--ink-2:#2A2622;--ink-3:#5C544C;--ink-4:#8A8077;--rule:#1F1B17;
  --paper:#F4EFE7;--paper-2:#EBE4D8;--paper-3:#DDD3C2;--bone:#FBF8F2;
  --ease:cubic-bezier(.2,.7,.2,1);--maxw:1320px;
}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--font-body);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
::selection{background:var(--pink);color:var(--bone)}
a{color:var(--pink-deep);text-decoration:underline;text-underline-offset:3px;transition:color .2s var(--ease)}
a:hover{color:var(--pink-hot)}
code{font-family:var(--font-mono);font-size:.92em}
.page{max-width:var(--maxw);margin:0 auto;padding:28px 48px 0}
.rule{border-top:1px solid var(--rule)}.rule.strong{border-top:2px solid var(--ink)}.rule.top{border-top:4px solid var(--ink)}
.numeral{font-family:var(--font-mono);font-feature-settings:"tnum" 1;letter-spacing:.01em}
.eyebrow{font-family:var(--font-mono);font-size:11px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--pink-deep);display:block}
.eyebrow.on-paper{color:var(--pink)}

/* masthead */
.masthead{padding-top:6px}
.masthead-row{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:24px;padding:14px 0}
.brand{display:inline-flex;align-items:baseline;gap:5px;text-decoration:none;color:var(--ink)}
.brand-cns,.brand-me{font-family:var(--font-display);font-weight:900;font-size:26px;letter-spacing:-.03em;line-height:1}
.brand-me{font-style:italic}
.brand-dot{width:8px;height:8px;border-radius:50%;background:var(--pink);transform:translateY(-2px)}
.brand-blog{font-family:var(--font-mono);font-size:13px;font-weight:400;letter-spacing:.04em;color:var(--ink-3);margin-left:5px}
.masthead-meta{font-size:13px;color:var(--ink-2)}
.masthead-meta em{font-family:var(--font-display);font-style:italic;font-weight:500;color:var(--ink)}
.masthead-nav{display:flex;justify-content:space-between;align-items:center;padding:11px 0;flex-wrap:wrap;gap:8px}
.nav-left,.nav-right{display:flex;gap:20px;flex-wrap:wrap}
.masthead-nav a{text-decoration:none;color:var(--ink);font-size:14px;padding-bottom:2px;border-bottom:1px dotted transparent}
.masthead-nav a:hover{color:var(--pink)}
.nav-right a{color:var(--ink-2);font-size:13px}

/* hero */
.hero{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:56px;align-items:end;padding:60px 0 64px;border-top:1px solid var(--rule)}
.hero-body{display:flex;flex-direction:column;gap:22px}
.hero-headline{font-family:var(--font-display);font-weight:900;font-size:clamp(52px,7vw,104px);line-height:.92;letter-spacing:-.035em;margin:0;font-variation-settings:"opsz" 144;text-wrap:balance}
.hero-headline em{color:var(--pink);font-style:italic;font-weight:700}
.hero-lede{font-family:var(--font-display);font-style:italic;font-weight:400;font-size:clamp(18px,1.7vw,23px);line-height:1.5;color:var(--ink-2);max-width:60ch;margin:0;text-wrap:pretty}
.hero-lede em{color:var(--pink-deep);font-style:italic}
.install{display:flex;align-items:stretch;gap:0;border:1px solid var(--ink);background:var(--bone);max-width:640px;margin-top:4px}
.install code{padding:14px 16px;font-size:13px;color:var(--ink);overflow-x:auto;white-space:nowrap;flex:1;align-self:center}
.copy-btn{font-family:var(--font-body);font-weight:600;font-size:13px;border:0;border-left:1px solid var(--ink);background:var(--ink);color:var(--bone);padding:0 20px;cursor:pointer;transition:background .2s}
.copy-btn:hover{background:var(--pink)}.copy-btn.done{background:var(--pink-deep)}
.hero-fine{font-size:13px;color:var(--ink-3);margin:0}
.hero-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:28px 24px;padding-bottom:8px}
.stat{display:flex;flex-direction:column;gap:4px;border-left:2px solid var(--pink);padding-left:14px}
.stat-num{font-family:var(--font-display);font-weight:800;font-size:clamp(30px,3.2vw,44px);line-height:1;color:var(--ink);letter-spacing:-.02em}
.stat-cap{font-family:var(--font-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3)}

/* section header */
.section-header{padding-top:8px;margin-top:56px}
.sh-row{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;padding:14px 0 4px}
.sh-title{font-family:var(--font-display);font-weight:800;font-size:clamp(26px,3vw,40px);line-height:1.04;letter-spacing:-.02em;margin:0;color:var(--ink)}
.section-lede{font-family:var(--font-display);font-style:italic;font-size:18px;color:var(--ink-2);max-width:74ch;margin:6px 0 26px}

/* layers */
.layer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--rule);margin-top:8px}
.layer{padding:28px 28px 32px;border-right:1px solid var(--paper-3)}
.layer:last-child{border-right:0}
.layer-no{display:block;font-size:13px;color:var(--pink);font-weight:600;margin-bottom:8px}
.layer h3{font-family:var(--font-display);font-weight:700;font-size:26px;margin:0 0 10px;letter-spacing:-.01em}
.layer p{margin:0;color:var(--ink-2);font-size:15.5px}
.layer b{color:var(--ink)}

/* dashboards */
.dash-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px}
.dash{border:1px solid var(--ink);background:var(--bone);padding:24px 26px 28px;margin-top:24px}
.dash-grid .dash{margin-top:0}
.dash-head .eyebrow{margin-bottom:8px}
.dash-head h3{font-family:var(--font-display);font-weight:700;font-size:22px;line-height:1.1;margin:0 0 8px;letter-spacing:-.01em}
.dash-note{font-size:14px;color:var(--ink-3);margin:0 0 18px;max-width:62ch}
.dash-note b{color:var(--ink-2)}

.bars{display:flex;flex-direction:column;gap:11px}
.bar-row{display:grid;grid-template-columns:minmax(120px,1.3fr) minmax(0,2fr) auto;align-items:center;gap:14px}
.bar-label{font-size:13.5px;color:var(--ink-2);font-weight:500}
.bar-track{height:9px;background:var(--paper-2);border-radius:0;overflow:hidden}
.bar-fill{height:100%;transform-origin:left;animation:grow .9s var(--ease) both}
.bf-pink{background:var(--pink)}.bf-ink{background:var(--ink-2)}
.bar-val{font-size:13px;color:var(--ink);text-align:right;white-space:nowrap}
.bar-sub{color:var(--ink-4);font-size:11px}
.chip-mini{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--pink-deep);border:1px solid var(--paper-3);padding:1px 5px;margin-left:4px}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}

/* explorer */
.dash-explorer{margin-top:8px}
.explorer-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:20px}
.ex-chip{font-family:var(--font-body);font-size:13px;font-weight:500;background:var(--paper);border:1px solid var(--paper-3);color:var(--ink-2);padding:7px 13px;cursor:pointer;transition:all .15s;border-radius:999px}
.ex-chip:hover{border-color:var(--pink);color:var(--pink-deep)}
.ex-chip.active{background:var(--ink);color:var(--bone);border-color:var(--ink)}
.explorer-panel{display:grid;grid-template-columns:1.4fr 1fr;gap:32px;align-items:center;min-height:160px}
.ep-bars{display:flex;flex-direction:column;gap:18px}
.ep-row{display:grid;grid-template-columns:130px 1fr auto;align-items:center;gap:14px}
.ep-rl{font-size:14px;font-weight:600}
.ep-track{height:26px;background:var(--paper-2);position:relative;overflow:hidden}
.ep-fill{height:100%;transform-origin:left;animation:grow .7s var(--ease) both}
.ep-v{font-family:var(--font-mono);font-size:15px;font-weight:600;white-space:nowrap}
.ep-verdict{border-left:2px solid var(--pink);padding-left:18px}
.ep-big{font-family:var(--font-display);font-weight:800;font-size:46px;line-height:1;letter-spacing:-.02em;color:var(--pink);display:block}
.ep-vh{font-size:14px;color:var(--ink-2);margin:8px 0 0}
.ep-meta{font-family:var(--font-mono);font-size:11px;color:var(--ink-4);margin-top:12px;letter-spacing:.04em}

/* framework table */
.dash-table .fw-table{width:100%;border-collapse:collapse;font-size:14px}
.fw-table th{text-align:left;font-family:var(--font-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);padding:8px 10px;border-bottom:2px solid var(--ink)}
.fw-table th.sortable{cursor:pointer;user-select:none}.fw-table th.sortable:hover{color:var(--pink)}
.fw-table td{padding:9px 10px;border-bottom:1px solid var(--paper-2);vertical-align:middle}
.fw-rank{color:var(--ink-4);width:30px}
.fw-name{color:var(--ink-2);max-width:340px}
.fw-rm{color:var(--pink-deep);font-size:12px;margin-right:6px}
.fw-bar{width:120px}
.mini-track{height:7px;background:var(--paper-2)}.mini-fill{height:100%;background:var(--pink);transform-origin:left;animation:grow .9s var(--ease) both}
.fw-gbp{font-weight:600;text-align:right}.fw-n,.fw-s{text-align:right;color:var(--ink-3)}
.fw-table th.fw-gbp,.fw-table th.fw-n,.fw-table th.fw-s{text-align:right}

/* expiry columns */
.cols{display:flex;align-items:flex-end;gap:4px;height:180px;padding-top:8px}
.col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
.col-bar{width:74%;background:var(--pink);min-height:2px;animation:rise .9s var(--ease) both}
.col:hover .col-bar{background:var(--pink-hot)}
.col-x{font-family:var(--font-mono);font-size:8.5px;color:var(--ink-4);margin-top:6px;text-align:center;line-height:1.3}
.col-yr{color:var(--ink-2);font-weight:600}
@keyframes rise{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1)}}

/* questions */
.q-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.q-card{border:1px solid var(--paper-3);background:var(--bone);padding:20px 22px;display:flex;flex-direction:column;gap:8px;transition:border-color .2s,transform .2s}
.q-card:hover{border-color:var(--pink);transform:translateY(-2px)}
.q-persona{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--bone);background:var(--ink);padding:3px 8px;align-self:flex-start}
.q-buyer .q-persona{background:var(--pink-deep)}.q-seller .q-persona{background:var(--ink)}.q-researcher .q-persona{background:var(--ink-3)}
.q-q{font-family:var(--font-display);font-style:italic;font-weight:500;font-size:18px;line-height:1.3;color:var(--ink);margin:2px 0 0}
.q-o{font-size:14px;color:var(--ink-2);margin:0}.q-o code{color:var(--pink-deep);font-size:12.5px}

/* tools */
.tool-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--rule);margin-top:8px}
.tool-col{padding:24px 26px;border-right:1px solid var(--paper-3)}.tool-col:last-child{border-right:0}
.tool-persona{margin:0 0 14px}
.tool-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.tool-list li{display:flex;flex-direction:column;gap:2px}
.tool-list code{color:var(--pink-deep);font-size:13px;font-weight:500}
.tool-list span{font-size:13px;color:var(--ink-3)}

/* honest */
.honest-grid{display:grid;grid-template-columns:1fr 1.3fr;gap:36px;border-top:1px solid var(--rule);margin-top:8px;padding-top:26px}
.honest-grid>p{font-family:var(--font-display);font-style:italic;font-size:19px;line-height:1.5;color:var(--ink-2);margin:0}
.honest-grid ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:14px}
.honest-grid li{font-size:14.5px;color:var(--ink-2);padding-left:18px;position:relative}
.honest-grid li::before{content:"—";position:absolute;left:0;color:var(--pink)}
.honest-grid b{color:var(--ink)}

/* cta */
.cta{margin-top:64px;background:var(--ink);color:var(--bone);padding:64px 48px;margin-left:-48px;margin-right:-48px}
.cta-inner{max-width:var(--maxw);margin:0 auto;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px}
.cta .orn{font-size:34px}
.cta .eyebrow{color:var(--pink-hot)}
.cta-title{font-family:var(--font-display);font-weight:800;font-size:clamp(30px,4vw,52px);line-height:1.02;letter-spacing:-.02em;margin:0;max-width:18ch;color:var(--bone)}
.cta-title em{color:var(--pink-hot);font-style:italic}
.cta-lede{font-size:17px;color:#D8CFC4;max-width:60ch;margin:0}
.cta-row{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-top:10px}
.btn-primary{font-family:var(--font-body);font-weight:600;font-size:15px;padding:14px 28px;background:var(--pink);color:var(--bone);text-decoration:none;border-radius:999px;transition:all .2s var(--ease)}
.btn-primary:hover{background:var(--pink-hot);color:var(--bone);box-shadow:0 12px 32px -12px rgba(229,25,127,.65);transform:translateY(-1px)}
.btn-ghost{font-family:var(--font-body);font-weight:600;font-size:15px;padding:14px 24px;color:var(--bone);text-decoration:none;border:1px solid #4a443e;border-radius:999px;transition:all .2s}
.btn-ghost:hover{border-color:var(--pink);color:var(--bone)}

/* colophon */
.colophon{margin-top:64px;padding-top:8px}
.colophon-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:32px;padding:32px 0 24px}
.cl-note{font-size:13.5px;color:var(--ink-3);max-width:46ch;margin:10px 0 0}
.cl-h{font-family:var(--font-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3);margin:0 0 12px}
.cl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px;font-size:14px}
.cl-list a{color:var(--ink-2);text-decoration:none}.cl-list a:hover{color:var(--pink)}
.cl-list li{color:var(--ink-3)}
.cl-fine{font-size:11.5px;color:var(--ink-4);padding:16px 0 40px;margin:0;line-height:1.6}

@media (max-width:920px){
  .page{padding:20px 20px 0}
  .hero,.layer-grid,.dash-grid,.q-grid,.tool-grid,.honest-grid,.explorer-panel,.colophon-grid{grid-template-columns:1fr}
  .hero{gap:36px;padding:36px 0 40px}
  .hero-stats{grid-template-columns:repeat(2,1fr)}
  .layer,.tool-col{border-right:0;border-bottom:1px solid var(--paper-3)}
  .cta{margin-left:-20px;margin-right:-20px;padding:48px 20px}
  .ep-verdict{border-left:0;border-top:2px solid var(--pink);padding-left:0;padding-top:16px}
  .fw-name{max-width:none}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

const CLIENT_JS = `
(function(){
  var fmt=function(n){var a=Math.abs(n);if(a>=1e12)return "\\u00a3"+(n/1e12).toFixed(1)+"tn";if(a>=1e9)return "\\u00a3"+(n/1e9).toFixed(a>=1e10?0:1)+"bn";if(a>=1e6)return "\\u00a3"+(n/1e6).toFixed(a>=1e8?0:1)+"m";if(a>=1e3)return "\\u00a3"+Math.round(n/1e3)+"k";return "\\u00a3"+n;};
  var cn=function(n){return n.toLocaleString("en-GB");};
  // copy buttons
  document.querySelectorAll(".copy-btn").forEach(function(b){b.addEventListener("click",function(){navigator.clipboard.writeText(b.getAttribute("data-copy")).then(function(){var t=b.textContent;b.textContent="Copied";b.classList.add("done");setTimeout(function(){b.textContent=t;b.classList.remove("done");},1400);});});});
  // price explorer
  var P=(window.__DATA__||{}).premium||[];
  var panel=document.getElementById("exPanel");
  var chips=document.getElementById("exChips");
  function render(i){
    var p=P[i];if(!p||!panel)return;
    var mx=Math.max(p.fw,p.open);
    var ratio=p.open?(p.fw/p.open):1;
    var premium=ratio>1;
    var pct=Math.round(Math.abs(ratio-1)*100);
    var verdict=premium?("a "+pct+"% call-off <i>premium</i>"):(pct+"% <i>cheaper</i> via call-off at the median");
    panel.innerHTML=
      '<div class="ep-bars">'+
        '<div class="ep-row"><span class="ep-rl">Framework call-off</span><div class="ep-track"><div class="ep-fill bf-pink" style="width:'+(p.fw/mx*100).toFixed(0)+'%"></div></div><span class="ep-v">'+fmt(p.fw)+'</span></div>'+
        '<div class="ep-row"><span class="ep-rl">Open tender</span><div class="ep-track"><div class="ep-fill bf-ink" style="width:'+(p.open/mx*100).toFixed(0)+'%"></div></div><span class="ep-v">'+fmt(p.open)+'</span></div>'+
      '</div>'+
      '<div class="ep-verdict"><span class="ep-big">'+(premium?'+':'\\u2212')+pct+'%</span><p class="ep-vh">median price is '+verdict+' in <b>'+p.label.replace(/ \\(CPV.*/,'')+'</b>.</p><p class="ep-meta">'+cn(p.fw_n)+' call-offs \\u00b7 '+cn(p.open_n)+' open \\u00b7 '+fmt(p.total)+' total</p></div>';
  }
  if(chips){chips.querySelectorAll(".ex-chip").forEach(function(c){c.addEventListener("click",function(){chips.querySelectorAll(".ex-chip").forEach(function(x){x.classList.remove("active");});c.classList.add("active");render(+c.getAttribute("data-i"));});});}
  var act=chips&&chips.querySelector(".ex-chip.active");render(act?+act.getAttribute("data-i"):0);
  // table sort
  var tbl=document.getElementById("fwTable");
  if(tbl){tbl.querySelectorAll("th.sortable").forEach(function(th){th.addEventListener("click",function(){
    var key=th.getAttribute("data-key");var tb=tbl.querySelector("tbody");
    var rows=Array.prototype.slice.call(tb.querySelectorAll("tr"));
    rows.sort(function(a,b){return (+b.getAttribute("data-"+key))-(+a.getAttribute("data-"+key));});
    tbl.querySelectorAll("th.sortable").forEach(function(x){x.textContent=x.textContent.replace(/ [\\u25be\\u25b8]$/,"");});
    th.textContent=th.textContent+" \\u25be";
    rows.forEach(function(r,idx){r.querySelector(".fw-rank").textContent=idx+1;tb.appendChild(r);});
  });});}
})();
`;

await main();
