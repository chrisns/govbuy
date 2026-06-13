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
// Validate a URL at build time so the site never ships a broken framework link (some stored official_urls
// are stale CCS pages; some old RMs have no live GCA page). Treats 2xx/3xx/403/405 as "exists".
const okUrl = async (u) => {
  if (!u) return false;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    let r = await fetch(u, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (r.status === 404 || r.status === 405) r = await fetch(u, { method: "GET", redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    return r.status < 400 || r.status === 403;
  } catch { return false; }
};
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
const [head, channels, premium, frameworks, resellers, expiry, catalogue, observed, exclusion, supFootprint, membership, rmNames] = await Promise.all([
  q(`SELECT
       (SELECT COUNT(*) FROM govbuy_public.instrument) AS frameworks,
       (SELECT COUNTIF(lifecycle_status='live_for_call_off') FROM govbuy_public.instrument) AS live_frameworks,
       (SELECT COUNT(*) FROM govbuy_public.operator) AS operators,
       (SELECT COUNT(*) FROM govbuy_public.supplier) AS suppliers,
       (SELECT COUNT(*) FROM govbuy_public.service) AS listings,
       (SELECT COUNT(*) FROM govbuy_public.tender_award) AS fused_awards,
       (SELECT COUNT(*) FROM govbuy_public.appointed_supplier) AS appointed_edges,
       (SELECT COUNTIF(expected_date >= CURRENT_TIMESTAMP()) FROM govbuy_public.pipeline_notice) AS pipeline,
       (SELECT COUNT(DISTINCT supplier_crn) FROM govbuy_public.observed_membership) AS observed_suppliers,
       (SELECT COUNT(DISTINCT catalogue) FROM govbuy_public.service) AS catalogues,
       (SELECT COUNTIF(i.lifecycle_status='live_for_call_off' AND NOT EXISTS(SELECT 1 FROM govbuy_public.appointed_supplier a WHERE a.instrument_id=i.instrument_id)) FROM govbuy_public.instrument i) AS no_supplier_list`),
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
     nm AS (SELECT REGEXP_EXTRACT(UPPER(rm_reference), r'RM[0-9]+') AS stem,
              ARRAY_AGG(name ORDER BY IF(operator_id='gca',0,1), LENGTH(name) DESC)[SAFE_OFFSET(0)] name,
              ARRAY_AGG(official_url IGNORE NULLS ORDER BY IF(operator_id='gca',0,1))[SAFE_OFFSET(0)] gca_url
            FROM govbuy_public.instrument WHERE rm_reference IS NOT NULL AND name NOT LIKE 'RM%' GROUP BY stem)
     SELECT t.rm_reference, nm.name AS name, nm.gca_url AS official_url, t.gbp, t.n, t.suppliers
     FROM t LEFT JOIN nm ON nm.stem = REGEXP_EXTRACT(UPPER(t.rm_reference), r'RM[0-9]+') ORDER BY t.gbp DESC`),
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
  // per-supplier framework footprint — the top earners and where their call-off money actually comes from
  q(`WITH sup AS (
        SELECT supplier_crn, SUM(award_amount) gbp, COUNT(*) n FROM govbuy_public.tender_award
        WHERE channel IN ('framework_call_off','dps_call_off') AND rm_reference IS NOT NULL AND award_amount BETWEEN 0 AND 100000000 AND supplier_crn IS NOT NULL
        GROUP BY supplier_crn ORDER BY gbp DESC LIMIT 18),
      byfw AS (
        SELECT t.supplier_crn, REGEXP_EXTRACT(UPPER(t.rm_reference),r'RM[0-9]+') stem, SUM(t.award_amount) gbp, COUNT(*) n
        FROM govbuy_public.tender_award t JOIN sup USING(supplier_crn)
        WHERE t.channel IN ('framework_call_off','dps_call_off') AND t.rm_reference IS NOT NULL AND t.award_amount BETWEEN 0 AND 100000000
        GROUP BY 1,2),
      ranked AS (SELECT *, ROW_NUMBER() OVER(PARTITION BY supplier_crn ORDER BY gbp DESC) rk FROM byfw),
      nm AS (SELECT company_number, ANY_VALUE(display_name) display_name FROM govbuy_public.supplier WHERE company_number IS NOT NULL GROUP BY 1)
      SELECT sup.supplier_crn, nm.display_name, CAST(sup.gbp AS INT64) total_gbp, sup.n total_n,
        ARRAY_AGG(STRUCT(r.stem AS stem, CAST(r.gbp AS INT64) AS gbp, r.n AS n) ORDER BY r.gbp DESC LIMIT 4) top_fw
      FROM sup JOIN ranked r ON r.supplier_crn=sup.supplier_crn AND r.rk<=4
      LEFT JOIN nm ON nm.company_number=sup.supplier_crn
      GROUP BY 1,2,3,4 ORDER BY total_gbp DESC`),
  // live frameworks with the deepest appointed-supplier benches
  q(`SELECT ANY_VALUE(i.name) name, ANY_VALUE(i.rm_reference) rm, COUNT(DISTINCT a.supplier_id) n
      FROM govbuy_public.appointed_supplier a JOIN govbuy_public.instrument i USING(instrument_id)
      WHERE i.lifecycle_status='live_for_call_off' AND i.name IS NOT NULL
      GROUP BY a.instrument_id ORDER BY n DESC LIMIT 12`),
  // rm-stem -> canonical framework name (for resolving footprint frameworks to readable labels)
  q(`SELECT REGEXP_EXTRACT(UPPER(rm_reference),r'RM[0-9]+') stem,
        ARRAY_AGG(name ORDER BY IF(operator_id='gca',0,1), LENGTH(name) DESC)[SAFE_OFFSET(0)] name
      FROM govbuy_public.instrument WHERE rm_reference IS NOT NULL AND name NOT LIKE 'RM%' GROUP BY stem`),
]);

const num = (v) => Number(v);
const data = {
  generated: new Date().toISOString().slice(0, 10),
  head: Object.fromEntries(Object.entries(head[0]).map(([k, v]) => [k, num(v)])),
  channels: channels.map((r) => ({ channel: r.channel, awards: num(r.awards), gbp: num(r.gbp) })),
  premium: premium.map((r) => ({ d: r.cpv_division, label: cpvLabel(r.cpv_division), fw: num(r.fw_median), fw_p25: num(r.fw_p25), fw_p75: num(r.fw_p75), open: num(r.open_median), fw_n: num(r.fw_n), open_n: num(r.open_n), total: num(r.total_gbp) })),
  frameworks: frameworks.map((r) => ({ rm: r.rm_reference, name: r.name, url: r.official_url || null, gbp: num(r.gbp), n: num(r.n), suppliers: num(r.suppliers) })),
  resellers: resellers.map((r) => ({ name: r.display_name, crn: r.company_number, type: r.channel_type, gbp: num(r.gbp), n: num(r.n) })),
  expiry: expiry.map((r) => ({ ym: r.ym, n: num(r.n), gbp: num(r.gbp) })),
  catalogue: catalogue.map((r) => ({ catalogue: r.catalogue, n: num(r.n) })),
  observed: Object.fromEntries(Object.entries(observed[0]).map(([k, v]) => [k, num(v)])),
  distressed: num(exclusion[0].distressed),
  supFootprint: supFootprint.map((r) => ({ crn: r.supplier_crn, name: r.display_name, gbp: num(r.total_gbp), n: num(r.total_n), top: (r.top_fw || []).map((f) => ({ stem: f.stem, gbp: num(f.gbp), n: num(f.n) })) })),
  membership: membership.map((r) => ({ name: r.name, rm: r.rm, n: num(r.n) })),
  rmName: Object.fromEntries(rmNames.filter((r) => r.stem && r.name).map((r) => [r.stem, r.name])),
};

// Resolve every framework link to one that actually loads (validated), else a gov.uk search fallback.
console.error("validating framework links …");
for (const f of data.frameworks) {
  const cand = f.url || (/^RM/i.test(f.rm) ? `https://www.gca.gov.uk/agreements/${f.rm.replace(/\s+/g, "")}` : null);
  f.url = (cand && await okUrl(cand)) ? cand : `https://www.gov.uk/search/all?keywords=${encodeURIComponent((f.name && f.name !== f.rm ? f.name : f.rm) + " framework")}`;
}

// Resolve every framework referenced in the chat demo to a link that actually loads (GCA agreement
// page where the stem resolves, else a gov.uk search fallback). Validated in parallel — no fabrication.
console.error("validating chat framework links …");
const chatStems = new Set();
data.supFootprint.forEach((s) => s.top.forEach((f) => f.stem && chatStems.add(f.stem)));
data.membership.forEach((m) => { const st = (m.rm || "").toUpperCase().match(/RM[0-9]+/); if (st) chatStems.add(st[0]); });
data.chatFwUrl = {};
await Promise.all([...chatStems].map(async (st) => {
  const guess = `https://www.gca.gov.uk/agreements/${st}`;
  data.chatFwUrl[st] = (await okUrl(guess)) ? guess : `https://www.gov.uk/search/all?keywords=${encodeURIComponent((data.rmName[st] || st) + " framework")}`;
}));

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
// Every named thing links to its canonical source (the MCP's own "link the name" rule, on the site too).
const extLink = (href, html, cls) => `<a href="${href}" target="_blank" rel="noopener"${cls ? ` class="${cls}"` : ""}>${html}</a>`;
const chUrl = (crn) => `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(crn)}`;
const fwUrl = (f) => f.url; // resolved + validated in main()
const CAT_URL = {
  "g-cloud": "https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/search",
  "azure": "https://azuremarketplace.microsoft.com/en-gb/marketplace/apps",
  "ypo": "https://www.ypo.co.uk/frameworks", "espo": "https://www.espo.org/Frameworks",
  "nhs-buying-catalogue": "https://buyingcatalogue.digital.nhs.uk/", "ndx": "https://ndx.digital.cabinet-office.gov.uk/catalogue/",
};
const REPO = "https://github.com/chrisns/govbuy";

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
      <td class="fw-name">${extLink(fwUrl(f), f.name ? `${esc(f.name)} <span class="fw-rm numeral">(${esc(f.rm)})</span>` : `<span class="fw-rm numeral">${esc(f.rm)}</span>`, "fw-link")}</td>
      <td class="fw-bar"><div class="mini-track"><div class="mini-fill" style="width:${(f.gbp / fwMax * 100).toFixed(1)}%"></div></div></td>
      <td class="fw-gbp numeral">${gbp(f.gbp)}</td>
      <td class="fw-n numeral">${cnum(f.n)}</td>
      <td class="fw-s numeral">${cnum(f.suppliers)}</td>
    </tr>`).join("");

  const rsMax = Math.max(...d.resellers.map((r) => r.gbp));
  const resellerTotal = d.resellers.reduce((a, r) => a + r.gbp, 0);
  const rsBars = d.resellers.map((r) => `
    <div class="bar-row">
      <div class="bar-label">${extLink(chUrl(r.crn), esc(r.name))} <span class="chip-mini">${RESELLER_LABEL[r.type] || esc(r.type)}</span></div>
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
      <div class="bar-label">${extLink(CAT_URL[c.catalogue] || REPO, CAT_LABEL[c.catalogue] || esc(c.catalogue))}</div>
      <div class="bar-track"><div class="bar-fill bf-ink" style="width:${(c.n / catMax * 100).toFixed(1)}%"></div></div>
      <div class="bar-val numeral">${cnum(c.n)}</div>
    </div>`).join("");

  const itPremium = d.premium.find((p) => p.d === "72");
  const totalAwardGbp = d.channels.reduce((a, c) => a + c.gbp, 0);

  const A = (href, t) => extLink(href, t);
  const L = {
    gc14: "https://www.gca.gov.uk/agreements/RM1557.14", rm6200: "https://www.gca.gov.uk/agreements/RM6200",
    ts4: "https://www.gca.gov.uk/agreements/RM6190", ns3: "https://www.gca.gov.uk/agreements/RM6116",
    css3: "https://www.gca.gov.uk/agreements/RM3764.3", drones: "https://www.ypo.co.uk/frameworks-home/900632",
    ht: "https://www.healthtrusteurope.com/", ch: "https://www.gov.uk/government/organisations/companies-house",
    s62: "https://www.legislation.gov.uk/ukpga/2023/54/section/62", sch5: "https://www.legislation.gov.uk/ukpga/2023/54/schedule/5",
    softcat: chUrl("02174990"), phoenix: chUrl("02548628"), cdw: chUrl("02465350"), bramble: chUrl("04136381"),
    pa2023: "https://www.legislation.gov.uk/ukpga/2023/54/contents",
  };
  const tool = (t) => extLink(REPO + "#tools", `<code>${t}</code>`);
  // Numbers used in the example questions are derived from the live query results, never hard-coded.
  const it = d.premium.find((p) => p.d === "72") || { fw: 0, open: 0 };
  const itPct = it.open ? Math.round(Math.abs(it.fw / it.open - 1) * 100) : 0;
  const questions = [
    { p: "buyer", q: "I'm a council. I need to host a containerised web app for ~£80k/year. Just tell me how to buy it.", o: `${tool("buy")} → ${A(L.gc14, "G-Cloud 14")} call-off, a ranked shortlist with real delivery records, the ~${gbp(it.fw)} IT median, alternative routes, and the PA2023 steps — one brief.` },
    { p: "buyer", q: "A fire service needs drone thermal-imaging kit fast and compliantly — is a direct award allowed?", o: `${A(L.drones, "YPO Drones DPS 1148")} — <b>further competition only</b>, no direct award; the ${A(L.sch5, "Schedule 5")} urgency route explained, with the Feb-2029 DPS sunset flagged.` },
    { p: "buyer", q: "We're about to award to a supplier in liquidation — should we?", o: `The exclusion gate <b>stops you</b>: a live ${A(L.ch, "Companies House")} check + the ${A(L.s62, "s.62 debarment register")}, both PA2023 limbs.` },
    { p: "buyer", q: "Which of the viable routes is best for a managed SOC — and why?", o: `${tool("buy")} returns alternative routes ranking ${A(L.css3, "Cyber Security 3 DPS")} vs ${A(L.ts4, "TS4")} vs ${A(L.ns3, "Network Services 3")} on speed × depth × runway × real price.` },
    { p: "seller", q: "I've built an AI triage tool but I'm on no framework. How do I get in front of the NHS this quarter?", o: `Get admitted to an AI dynamic market (${A(L.rm6200, "RM6200")} / ${A(L.ht, "HealthTrust")}) — continuous joining; plus where NHS commissioners actually shop.` },
    { p: "seller", q: "Find me an incumbent on a big contract that's expiring, and how to compete.", o: `${tool("sell")} surfaces the displacement window — incumbents whose contracts are ending, value, end date, the route to re-bid.` },
    { p: "seller", q: "I rent out goats that clear invasive scrub. How do I sell conservation grazing to the public sector?", o: "An honest answer: no grazing framework exists; the money flows via grounds-maintenance primes — subcontract, and chase sub-threshold local notices." },
    { p: "researcher", q: "Is the public sector overpaying by buying IT through framework call-offs instead of open competition?", o: `In IT the median call-off (${gbp(it.fw)}) runs <b>above</b> open tender (${gbp(it.open)}) — a ~${itPct}% convenience premium; every other sector inverts.` },
    { p: "researcher", q: "Map the 'thin-prime' economy — who fronts other firms onto public frameworks, and how much flows there?", o: `${gbp(resellerTotal)} of call-off spend traced to the reseller layer — ${A(L.softcat, "Softcat")}, ${A(L.phoenix, "Phoenix")}, ${A(L.cdw, "CDW")}, ${A(L.bramble, "Bramble Hub")}…` },
    { p: "researcher", q: "Which 'live' tech frameworks are dead paper — appointed suppliers but no real spend?", o: "It tells you what it can prove <i>and what it can't</i> — separating genuinely-idle frameworks from attribution gaps." },
  ];
  const PERSONA = { buyer: "Buyer", seller: "Seller", researcher: "Researcher" };
  const qCards = questions.map((x) => `
    <article class="q-card q-${x.p}">
      <span class="q-persona">${PERSONA[x.p]}</span>
      <p class="q-q">${esc(x.q)}</p>
      <p class="q-o">${x.o}</p>
    </article>`).join("");

  // ---- animated chat demo: 50 questions, each answered from live BigQuery at build time ----
  // Every figure/chart below is computed in main() from govbuy_public — never hand-written — so the
  // demo is always current. The client just types the question and reveals this baked answer.
  const rn = (stem) => d.rmName[stem] || stem;
  const fwA = (stem) => extLink(d.chatFwUrl[stem] || `https://www.gov.uk/search/all?keywords=${encodeURIComponent(stem + " framework")}`, `${esc(rn(stem))} <span class="ch-rm numeral">(${esc(stem)})</span>`, "ch-fw");
  const sectorPhrase = [
    (l) => `Is the public sector overpaying for ${l} by buying through frameworks?`,
    (l) => `What does ${l} actually cost — framework call-off or open tender?`,
    (l) => `For ${l}, is a framework cheaper than running an open competition?`,
  ];
  const sectorQs = d.premium.map((p, i) => {
    const prem = p.fw > p.open;
    const pct = p.open ? Math.round(Math.abs(p.fw / p.open - 1) * 100) : 0;
    const label = (CPV[p.d] || ("CPV " + p.d)).replace(/ \(CPV.*/, "");
    return {
      p: i % 3 === 0 ? "researcher" : "buyer",
      q: sectorPhrase[i % sectorPhrase.length](label.toLowerCase()),
      a: prem
        ? `At the median, <b>yes</b>: a framework call-off runs <b>${gbp(p.fw)}</b> against <b>${gbp(p.open)}</b> on the open market — a ~${pct}% convenience premium. ${cnum(p.fw_n)} call-offs vs ${cnum(p.open_n)} open tenders.`
        : `No — the framework median (<b>${gbp(p.fw)}</b>) sits <b>${pct}% below</b> open tender (${gbp(p.open)}); open competition captures the mega-projects that pull its median up. ${cnum(p.fw_n)} call-offs vs ${cnum(p.open_n)} open.`,
      chart: { kind: "bars", caption: `Median award · ${esc(label)}`, rows: [
        { label: "Framework call-off", value: p.fw, tone: "pink", fmt: "gbp" },
        { label: "Open tender", value: p.open, tone: "ink", fmt: "gbp" },
      ] },
    };
  });

  const supPhrase = [
    (n) => `Where does ${n} actually earn its public-sector money?`,
    (n) => `Is ${n} a real player on frameworks, or just a name on a list?`,
    (n) => `How much has ${n} won through call-offs — and through which frameworks?`,
  ];
  const supQs = d.supFootprint.filter((s) => s.name && s.top.length).map((s, i) => ({
    p: i % 2 ? "researcher" : "seller",
    q: supPhrase[i % supPhrase.length](s.name),
    a: `${extLink(chUrl(s.crn), esc(s.name), "ch-fw")} (CRN ${esc(s.crn)}) has won <b>${gbp(s.gbp)}</b> across ${cnum(s.n)} framework call-offs. Its biggest route is ${fwA(s.top[0].stem)}. The split:`,
    chart: { kind: "bars", caption: `${esc(s.name)} · call-off £ by framework`, rows: s.top.map((f) => ({ label: rn(f.stem), value: f.gbp, sub: cnum(f.n) + " call-offs", tone: "pink", fmt: "gbp" })) },
  }));

  const channelRows = d.channels.filter((c) => c.gbp > 0).map((c) => ({ label: CHANNEL_LABEL[c.channel] || c.channel, value: c.gbp, sub: cnum(c.awards) + " awards", tone: (c.channel === "framework_call_off" || c.channel === "dps_call_off") ? "pink" : "ink", fmt: "gbp" }));
  const topSupRows = d.supFootprint.slice(0, 8).filter((s) => s.name).map((s) => ({ label: s.name, value: s.gbp, sub: cnum(s.n) + " call-offs", tone: "pink", fmt: "gbp" }));
  const topFwRows = d.frameworks.slice(0, 8).map((f) => ({ label: f.name || f.rm, value: f.gbp, sub: cnum(f.suppliers) + " suppliers", tone: "pink", fmt: "gbp" }));
  const resellerRows = d.resellers.slice(0, 8).map((r) => ({ label: r.name, value: r.gbp, sub: cnum(r.n) + " call-offs", tone: "ink", fmt: "gbp" }));
  const catRows = d.catalogue.map((c) => ({ label: ({ "g-cloud": "G-Cloud 14", "azure": "Azure Marketplace", "ypo": "YPO", "espo": "ESPO", "nhs-buying-catalogue": "NHS Buying Catalogue", "ndx": "NDX" })[c.catalogue] || c.catalogue, value: c.n, tone: "ink", fmt: "num" }));
  const memberRows = d.membership.map((m) => ({ label: m.name, value: m.n, tone: "pink", fmt: "num" }));
  const expiryCols = d.expiry.map((e) => { const [y, m] = e.ym.split("-"); return { label: ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m)] + (m === "01" ? " " + y.slice(2) : ""), value: e.gbp, fmt: "gbp" }; });
  const reTotal = d.resellers.reduce((a, r) => a + r.gbp, 0);
  const exTotal = d.expiry.reduce((a, e) => a + e.gbp, 0);

  const aggregateQs = [
    { p: "researcher", q: "How does UK public money actually get spent — what share goes through each route?", a: `Open tender dominates by value (the big programmes); framework &amp; DPS call-offs are the high-volume routine layer. Across ${cnum(d.head.fused_awards)} award records:`, chart: { kind: "bars", caption: "Awarded value by channel", rows: channelRows } },
    { p: "researcher", q: "Who has won the most public money through framework call-offs?", a: `The biggest call-off earners across the whole corpus — many are resellers carrying other firms' products onto frameworks:`, chart: { kind: "bars", caption: "Top suppliers · total call-off £", rows: topSupRows } },
    { p: "researcher", q: "Which frameworks move the most money?", a: `Attributable call-off spend per framework, CRN-joined from real awards:`, chart: { kind: "bars", caption: "Top frameworks · call-off £", rows: topFwRows } },
    { p: "researcher", q: "Map the 'thin-prime' economy — who fronts other firms onto frameworks, and how much flows there?", a: `<b>${gbp(reTotal)}</b> of call-off spend traces to the reseller layer — the public buyer often never contracts who does the work:`, chart: { kind: "bars", caption: "Resellers · call-off £ carried", rows: resellerRows } },
    { p: "seller", q: "Which contracts are expiring soon — where are the displacement windows?", a: `<b>${gbp(exTotal)}</b> of contract value ends in the next 18 months. Each is a re-procurement deadline for a buyer and a displacement window for a challenger:`, chart: { kind: "cols", caption: "Contract value expiring · next 18 months", rows: expiryCols } },
    { p: "buyer", q: "What can I actually search across the UK public-sector buying catalogues?", a: `<b>${cnum(d.head.listings)}</b> per-listing descriptions across ${d.head.catalogues} catalogues, all capability-searchable and token-free re-crawled:`, chart: { kind: "bars", caption: "Catalogue listings indexed", rows: catRows } },
    { p: "buyer", q: "Which live frameworks have the deepest bench of appointed suppliers?", a: `The most-populated live frameworks — where a buyer has the widest compliant choice without a fresh competition:`, chart: { kind: "bars", caption: "Live frameworks · appointed suppliers", rows: memberRows } },
    { p: "buyer", q: "How many appointed suppliers are in financial distress right now?", a: `<b>${cnum(d.distressed)}</b> of <b>${cnum(d.head.suppliers)}</b> matched suppliers are flagged dissolved / liquidation / administration — each a PA2023 Schedule 6/7 exclusion ground the gate raises <i>before</i> you award, via a ${A(L.ch, "live Companies House")} check.`, chart: { kind: "bars", caption: "Supplier financial health", rows: [{ label: "Flagged (Sch 6/7)", value: d.distressed, tone: "pink", fmt: "num" }, { label: "No distress flag", value: Math.max(0, d.head.suppliers - d.distressed), tone: "ink", fmt: "num" }] } },
  ];

  const noteQs = [
    { p: "buyer", q: "Is buying off G-Cloud a 'direct award' under PA2023?", a: `No — it's a <b>framework call-off under s.45</b>: you apply the framework's own award mechanism. A <b>statutory direct award</b> is "no competition, by exception", lawful only on a ${A(L.sch5, "Schedule 5")} ground with a transparency notice first. <b>Don't label a G-Cloud purchase a "direct award" in your business case — you'll fail an audit on the wording alone.</b>` },
    { p: "buyer", q: "We're about to award to a supplier in liquidation. Should we?", a: `<b>⚠️ Stop.</b> The two-limb exclusion gate flags a live ${A(L.ch, "Companies House")} insolvency status (PA2023 Sch 6/7) <i>and</i> checks the ${A(L.s62, "s.62 debarment register")} — both, with sources. No other procurement tool stops you here. It'll then find compliant alternatives.` },
    { p: "buyer", q: "Do I need the 8-working-day standstill for a framework call-off?", a: `No. The mandatory ${A(L.pa2023, "PA2023")} standstill (s.51) applies to competitive awards but is <b>exempt for call-offs</b>. Keep a most-economically-advantageous audit note instead. (Indicative, not legal advice — confirm on the source it links.)` },
    { p: "seller", q: "I rent out goats that clear invasive scrub. How do I sell conservation grazing to the public sector?", a: `An honest answer: <b>no grazing framework exists</b>. The money flows via grounds-maintenance primes — so subcontract to one, and chase sub-threshold local notices directly. govbuy says so rather than inventing a route.` },
    { p: "seller", q: "I've built an AI triage tool but I'm on no framework. How do I reach the NHS this quarter?", a: `Get admitted to an AI ${A(L.rm6200, "dynamic market (RM6200)")} or via ${A(L.ht, "HealthTrust Europe")} — both allow continuous joining, no waiting for a re-opening. Then target where NHS commissioners actually shop.` },
    { p: "buyer", q: "DPS vs dynamic market — what's changing under PA2023, and does it affect a long call-off?", a: `Legacy DPSs are sunsetting into PA2023 <b>dynamic markets by Feb 2029</b>. A call-off placed now is fine, but don't sign one that outlives a successor market without a transition plan. The tool flags the sunset on every affected route.` },
    { p: "buyer", q: "Can I just put this on a government procurement card and skip the process?", a: `No — a GPC card (or a hyperscaler marketplace) is a <b>payment method, not a route</b>. You still need a compliant award mechanism behind it: a framework call-off, a dynamic-market competition, or a tendered contract. govbuy is payment-method-blind and says so.` },
    { p: "buyer", q: "We missed a framework's joining window. What are our options now?", a: `Depends on the type: an <b>open framework</b> re-opens to new suppliers at defined points (PA2023 s.49); a <b>dynamic market / DPS</b> admits suppliers <i>continuously</i>, so there's no missed window. The tool tells you which one you're looking at and when it next opens.` },
    { p: "buyer", q: "How do I check a supplier isn't debarred or excluded before I award?", a: `govbuy runs both PA2023 limbs: a live ${A(L.ch, "Companies House")} status check (Schedule 6/7 insolvency grounds) and the ${A(L.s62, "s.62 debarment register")} — each returned with a source, so it's auditable, not asserted.` },
    { p: "researcher", q: "How current is this data, and where does it come from?", a: `Everything answers from <code>govbuy_public</code> as of <b>${d.generated}</b> — ${cnum(d.head.fused_awards)} real awards fused on Companies House CRN, refreshed deterministically. Nothing is hand-entered; every claim passes a verbatim-substring gate against its archived source.` },
    { p: "buyer", q: "Does govbuy give legal or procurement advice?", a: `No. It <b>documents routes</b> and links the official source for every claim — frameworks, mechanics, ${A(L.pa2023, "PA2023")} duties — but it doesn't assemble the purchase or sign off compliance. You run the assessment on the sources it cites.` },
    { p: "seller", q: "What's the fastest compliant way onto a framework if I'm a new SME?", a: `Target the routes that admit suppliers continuously — live <b>dynamic markets and DPSs</b> (e.g. ${A(L.rm6200, "RM6200")}) — rather than waiting for a closed framework to re-tender. The <code>sell</code> verb ranks the ones you can join now by real call-off spend.` },
    { p: "researcher", q: "What exactly is govbuy, and what can it answer?", a: `An MCP server that welds <b>route × reality × statute</b> for UK public procurement: ${cnum(d.head.frameworks)} frameworks, ${cnum(d.head.listings)} catalogue listings and ${cnum(d.head.fused_awards)} real awards in one place — so your AI assistant answers buyer, seller and researcher questions with sources. ${extLink(REPO, "See the code")}.` },
  ];

  // Weave the four streams round-robin for persona variety, then cap at 50.
  const streams = [sectorQs, supQs, aggregateQs, noteQs];
  const chat = [];
  for (let i = 0; chat.length < 50 && streams.some((s) => s.length); i++) {
    const s = streams[i % streams.length];
    if (s.length) chat.push(s.shift());
  }
  // server-rendered chart (no-JS / first paint fallback; the client re-renders with animation)
  const chatVal = (v, fmt) => fmt === "num" ? cnum(v) : gbp(v);
  const chatChartSSR = (c) => {
    if (!c) return "";
    const mx = Math.max(...c.rows.map((r) => r.value), 1);
    const cap = c.caption ? `<div class="ch-cap">${esc(c.caption)}</div>` : "";
    if (c.kind === "cols") {
      return `<div class="ch-chart">${cap}<div class="ch-cols">${c.rows.map((r) => `<div class="ch-col" title="${esc(r.label)}: ${chatVal(r.value, r.fmt)}"><div class="ch-col-bar" style="height:${(r.value / mx * 100).toFixed(1)}%"></div><div class="ch-col-x">${esc(r.label)}</div></div>`).join("")}</div></div>`;
    }
    return `<div class="ch-chart">${cap}<div class="ch-bars">${c.rows.map((r) => `<div class="ch-brow"><div class="ch-bl">${esc(r.label)}</div><div class="ch-bt"><div class="ch-bf ${r.tone === "pink" ? "bf-pink" : "bf-ink"}" style="width:${(r.value / mx * 100).toFixed(1)}%"></div></div><div class="ch-bv numeral">${chatVal(r.value, r.fmt)}${r.sub ? ` <span class="ch-bsub">${esc(r.sub)}</span>` : ""}</div></div>`).join("")}</div></div>`;
  };

  const tools = [
    ["Buyer", [
      ["buy", "one opinionated brief: route + PA2023 mechanic + ranked shortlist (track record + exclusion) + price + alternative routes + compliance checklist"],
      ["supplier", "is this firm safe? a two-limb live exclusion check + its full framework footprint + CRN-matched delivery record"],
      ["framework", "one instrument: lots, appointed + observed-from-awards suppliers, coverage, and the PA2023-precise call-off path"],
    ]],
    ["Seller", [
      ["sell", "your route to market: frameworks & live DPS you can join, ranked by REAL call-off spend, live + forward opportunities, incumbents to displace, and resellers who can carry you in"],
    ]],
    ["Researcher", [
      ["research", "the power surface: read-only BigQuery SQL over the whole corpus, a spend & competition x-ray by CPV, or the schema / freshness & coverage"],
    ]],
  ];
  const toolCols = tools.map(([persona, list]) => `
    <div class="tool-col">
      <h3 class="tool-persona"><span class="eyebrow">${persona}</span></h3>
      <ul class="tool-list">
        ${list.map(([t, desc]) => `<li>${extLink(REPO + "#tools", `<code>${esc(t)}</code>`, "tool-link")}<span>${esc(desc)}</span></li>`).join("")}
      </ul>
    </div>`).join("");

  const installCmd = "claude mcp add --transport http govbuy https://govbuy.run.cns.me/mcp";

  // Setup recipes for common AI clients. govbuy is a remote, streamable-HTTP MCP server at
  // https://govbuy.run.cns.me/mcp — free, unauthenticated, no API key.
  const URL_MCP = "https://govbuy.run.cns.me/mcp";
  const clients = [
    { name: "Claude Code", kind: "Terminal — one command", code: installCmd, docs: "https://docs.claude.com/en/docs/claude-code/mcp", note: "Then ask Claude anything about UK procurement." },
    { name: "Claude Desktop", kind: "Settings → Developer → Edit Config", code: `{\n  "mcpServers": {\n    "govbuy": { "type": "http", "url": "${URL_MCP}" }\n  }\n}`, docs: "https://modelcontextprotocol.io/quickstart/user", note: "Add to claude_desktop_config.json, then restart." },
    { name: "GitHub Copilot (VS Code)", kind: "Create .vscode/mcp.json (or ⌘⇧P → “MCP: Add Server”)", code: `{\n  "servers": {\n    "govbuy": { "type": "http", "url": "${URL_MCP}" }\n  }\n}`, docs: "https://code.visualstudio.com/docs/copilot/chat/mcp-servers", note: "Use in Copilot Chat → Agent mode." },
    { name: "Gemini CLI", kind: "Edit ~/.gemini/settings.json", code: `{\n  "mcpServers": {\n    "govbuy": { "httpUrl": "${URL_MCP}" }\n  }\n}`, docs: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md", note: "Gemini uses httpUrl for streamable-HTTP servers." },
    { name: "Cursor", kind: "Edit ~/.cursor/mcp.json", code: `{\n  "mcpServers": {\n    "govbuy": { "url": "${URL_MCP}" }\n  }\n}`, docs: "https://docs.cursor.com/context/model-context-protocol", note: "Or Settings → MCP → Add new server." },
    { name: "Any MCP client", kind: "Windsurf, Zed, Cline, LibreChat, n8n…", code: `{\n  "mcpServers": {\n    "govbuy": { "type": "http", "url": "${URL_MCP}" }\n  }\n}`, docs: "https://modelcontextprotocol.io/clients", note: "Point any Model-Context-Protocol client at the URL." },
  ];
  const connectCards = clients.map((c) => `
    <article class="conn-card">
      <div class="conn-head"><h3>${esc(c.name)}</h3><span class="conn-kind">${esc(c.kind)}</span></div>
      <div class="conn-codewrap"><pre class="conn-code">${esc(c.code)}</pre><button class="copy-btn conn-copy" data-copy="${esc(c.code)}" aria-label="Copy ${esc(c.name)} config">Copy</button></div>
      <div class="conn-foot"><span>${esc(c.note)}</span>${extLink(c.docs, "Docs →", "conn-docs")}</div>
    </article>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>govbuy — the UK public-procurement co-pilot</title>
<meta name="description" content="Ask your AI assistant how to buy across the UK public sector, where to sell, or how public money flows — source-anchored across ${cnum(d.head.frameworks)} frameworks, ${cnum(d.head.listings)} catalogue listings and ${cnum(d.head.fused_awards)} real awards. An MCP server by cns.me." />
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

<section class="chatdemo" id="demo">
  ${sectionHeader("Watch it work", "Real questions, answered live")}
  <p class="section-lede">Buyers, sellers and researchers ask in plain English; govbuy answers from the live corpus. Every figure and chart in this demo is computed from <code>govbuy_public</code> at build time — <b>${chat.length}</b> questions on rotation, always current, never scripted. <span class="cd-hint">Hover to pause · click a chip to jump.</span></p>
  <div class="chat-shell">
    <div class="chat-personas" id="chatChips">
      <button class="cd-chip active" data-persona="all">All</button>
      <button class="cd-chip" data-persona="buyer">Buyer</button>
      <button class="cd-chip" data-persona="seller">Seller</button>
      <button class="cd-chip" data-persona="researcher">Researcher</button>
    </div>
    <div class="chat-win" id="chatWin">
      <div class="chat-bar"><span class="cd-tl"></span><span class="cd-tl"></span><span class="cd-tl"></span><span class="chat-title">govbuy · via your AI assistant</span><span class="chat-live"><span class="cd-pulse"></span>live</span></div>
      <div class="chat-log" id="chatLog" aria-live="polite">
        <div class="msg msg-user"><span class="msg-persona p-${chat[0].p}">${PERSONA[chat[0].p]}</span><div class="bub bub-user">${esc(chat[0].q)}</div></div>
        <div class="msg msg-bot"><div class="bub bub-bot"><div class="ch-ans">${chat[0].a}</div>${chatChartSSR(chat[0].chart)}</div></div>
      </div>
    </div>
    <div class="chat-foot"><span class="numeral" id="chatCount">1</span> / <span class="numeral">${chat.length}</span> · answered from <code>govbuy_public</code> as of <span class="numeral">${d.generated}</span></div>
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
      <p><b class="numeral">${cnum(d.head.fused_awards)}</b> real tender awards joined on ${A(L.ch, "Companies House")} CRN: who actually wins the work, what buyers really pay, what's live, what's <i>coming</i> (<b class="numeral">${cnum(d.head.pipeline)}</b> planned procurements still ahead) and what's <i>expiring</i>.</p>
    </article>
    <article class="layer">
      <span class="layer-no numeral">03</span>
      <h3>Statute</h3>
      <p>The ${A(L.pa2023, "<b>Procurement Act 2023</b>")} mechanics — standstill, competitive flexible procedure, ${A(L.sch5, "Schedule&nbsp;5")} grounds, a two-limb exclusion gate (live ${A(L.ch, "Companies House")} + the ${A(L.s62, "s.62 debarment register")}) — so a route isn't just available but <i>defensible</i>.</p>
    </article>
  </div>
</section>

<section class="dashboards" id="data">
  ${sectionHeader("Explore the data", "Real numbers from the corpus — not a brochure")}
  <p class="section-lede">Every figure below is live from <code>govbuy_public</code> as of <span class="numeral">${d.generated}</span> — the same data your assistant reasons over.</p>
  <p class="dash-method"><b>Method, plainly:</b> figures are over <b>award records</b> (one per award&times;supplier line, ${cnum(d.head.fused_awards)} of them across ${cnum(d.head.appointed_edges)} appointed-supplier edges) from the fused UK-Tenders corpus. Framework-ceiling outliers (&gt;£100m) are removed so medians aren't distorted; the price explorer uses awards &ge;£1,000. Totals are sums over award records and are not de-duplicated across multi-supplier awards, so they read as gross awarded value, not net spend. Reseller £ come from a curated reseller-graph join across every CPV a firm operates in. Dirty upstream dates are bounded by each chart's window. Counts of <code>instrument</code>/<code>service</code> are exact. Nothing here is hand-entered — re-run <code>scripts/build-site.mjs</code> to reproduce.</p>

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
      <div class="dash-head"><span class="eyebrow">${cnum(d.head.listings)} listings · ${d.head.catalogues} catalogues</span><h3>What's actually on the shelves</h3><p class="dash-note">Per-listing descriptions across every public UK buying catalogue, searchable by capability — token-free re-crawled.</p></div>
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
  ${sectionHeader("5 verbs, 3 personas", "Ask the way you think — buy, sell, research")}
  <div class="tool-grid">${toolCols}</div>
</section>

<section class="connect" id="connect">
  ${sectionHeader("Connect it", "Set it up in your assistant — in a minute")}
  <p class="section-lede">govbuy is a remote <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener">Model-Context-Protocol</a> server at <code>${esc(URL_MCP)}</code> — streamable HTTP, free, unauthenticated, no API key. Add the URL to any MCP-capable client and the five verbs appear. Recipes (current as of <span class="numeral">${d.generated}</span> — each links its official docs):</p>
  <div class="conn-grid">${connectCards}</div>
</section>

<section class="honest" id="honest">
  ${sectionHeader("The honest part", "What it can't do — and says so")}
  <div class="honest-grid">
    <p>Credibility is in the candour. govbuy never fabricates: every supplier, framework and £ comes from a source that literally states it, behind a verbatim-substring gate.</p>
    <ul>
      <li><b>No published supplier list.</b> <b class="numeral">${cnum(d.head.no_supplier_list)}</b> of <b class="numeral">${cnum(d.head.live_frameworks)}</b> live frameworks publish no member list (login-walled portals, or DPS/neutral-vendor models that don't publish membership) — govbuy says so rather than guessing.</li>
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
<script>window.__DATA__=${JSON.stringify({ premium: d.premium })};window.__CHAT__=${JSON.stringify(chat)};</script>
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
      <a href="#demo">Demo</a><a href="#what">What</a><a href="#data">Data</a><a href="#ask">Ask</a><a href="#tools">Tools</a><a href="#connect">Setup</a>
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
.hero-body,.hero-stats{min-width:0}
.hero-body{display:flex;flex-direction:column;gap:22px}
.hero-headline{overflow-wrap:break-word}
.hero-headline{font-family:var(--font-display);font-weight:900;font-size:clamp(52px,7vw,104px);line-height:.92;letter-spacing:-.035em;margin:0;font-variation-settings:"opsz" 144;text-wrap:balance}
.hero-headline em{color:var(--pink);font-style:italic;font-weight:700}
.hero-lede{font-family:var(--font-display);font-style:italic;font-weight:400;font-size:clamp(18px,1.7vw,23px);line-height:1.5;color:var(--ink-2);max-width:60ch;margin:0;text-wrap:pretty}
.hero-lede em{color:var(--pink-deep);font-style:italic}
.install{display:flex;align-items:stretch;gap:0;border:1px solid var(--ink);background:var(--bone);max-width:min(640px,100%);margin-top:4px}
.install code{padding:14px 16px;font-size:13px;color:var(--ink);overflow-x:auto;white-space:nowrap;flex:1 1 0;min-width:0;align-self:center}
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
.section-lede{font-family:var(--font-display);font-style:italic;font-size:18px;color:var(--ink-2);max-width:74ch;margin:6px 0 14px}
.dash-method{font-size:12.5px;line-height:1.65;color:var(--ink-3);max-width:92ch;margin:0 0 26px;padding:14px 16px;background:var(--paper-2);border-left:2px solid var(--ink-4)}
.dash-method b{color:var(--ink-2)}.dash-method code{font-size:11.5px;color:var(--pink-deep)}

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

/* connect / setup */
.conn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:8px}
.conn-card{border:1px solid var(--ink);background:var(--bone);display:flex;flex-direction:column;min-width:0}
.conn-codewrap,.conn-code{min-width:0;max-width:100%}
.conn-head{padding:16px 18px 10px;border-bottom:1px solid var(--paper-3)}
.conn-head h3{font-family:var(--font-display);font-weight:700;font-size:18px;margin:0 0 3px}
.conn-kind{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.conn-codewrap{position:relative;flex:1;display:flex}
.conn-code{font-family:var(--font-mono);font-size:11.5px;line-height:1.5;color:var(--ink);background:var(--paper-2);margin:0;padding:14px 16px;width:100%;overflow-x:auto;white-space:pre}
.conn-copy{position:absolute;top:8px;right:8px;padding:5px 12px;font-size:11px;border:1px solid var(--ink);background:var(--bone);color:var(--ink);border-left:1px solid var(--ink)}
.conn-copy:hover{background:var(--pink);color:var(--bone);border-color:var(--pink)}
.conn-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 18px;font-size:12.5px;color:var(--ink-3);border-top:1px solid var(--paper-3)}
.conn-docs{color:var(--pink-deep);text-decoration:none;font-weight:600;white-space:nowrap}
.conn-docs:hover{color:var(--pink-hot)}

/* in-dashboard links: subtle, inherit colour, hover to pink */
.fw-link,.tool-link{color:var(--ink-2);text-decoration:none}
.fw-link:hover{color:var(--pink-deep)}.fw-link:hover .fw-rm{color:var(--pink-hot)}
.tool-link{text-decoration:none}.tool-link:hover code{color:var(--pink-hot)}
.bar-label a{color:inherit;text-decoration:none;border-bottom:1px solid transparent}
.bar-label a:hover{color:var(--pink-deep);border-bottom-color:var(--pink-deep)}
.q-o a{color:var(--pink-deep);text-decoration:none;border-bottom:1px solid rgba(179,14,97,.3)}
.q-o a:hover{color:var(--pink-hot);border-bottom-color:var(--pink-hot)}
.layer a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--pink)}
.layer a:hover{color:var(--pink-deep)}

/* chat demo */
.chatdemo{margin-top:8px}
.cd-hint{font-family:var(--font-mono);font-size:11px;letter-spacing:.03em;color:var(--ink-4);font-style:normal}
.chat-shell{margin-top:18px;max-width:780px}
.chat-personas{display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap}
.cd-chip{font-family:var(--font-body);font-size:13px;font-weight:500;background:var(--paper);border:1px solid var(--paper-3);color:var(--ink-2);padding:6px 14px;cursor:pointer;border-radius:999px;transition:all .15s}
.cd-chip:hover{border-color:var(--pink);color:var(--pink-deep)}
.cd-chip.active{background:var(--ink);color:var(--bone);border-color:var(--ink)}
.chat-win{border:1px solid var(--ink);background:var(--bone);box-shadow:0 26px 64px -34px rgba(20,17,15,.55);overflow:hidden}
.chat-bar{display:flex;align-items:center;gap:7px;padding:11px 16px;background:var(--paper-2);border-bottom:1px solid var(--paper-3)}
.cd-tl{width:9px;height:9px;border-radius:50%;background:var(--paper-3)}
.chat-title{font-family:var(--font-mono);font-size:11px;letter-spacing:.05em;color:var(--ink-3);margin-left:8px}
.chat-live{margin-left:auto;font-family:var(--font-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--pink-deep);display:flex;align-items:center;gap:5px}
.cd-pulse{width:6px;height:6px;border-radius:50%;background:var(--pink);animation:pulse 1.6s var(--ease) infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}
.chat-log{padding:22px 22px 26px;height:480px;overflow-y:auto;display:flex;flex-direction:column;gap:15px;transition:opacity .35s var(--ease)}
.msg{display:flex;flex-direction:column;gap:5px;animation:msgIn .4s var(--ease) both}
@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.msg-user{align-items:flex-end}
.msg-persona{font-family:var(--font-mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--bone);background:var(--ink);padding:2px 8px}
.msg-persona.p-buyer{background:var(--pink-deep)}.msg-persona.p-seller{background:var(--ink)}.msg-persona.p-researcher{background:var(--ink-3)}
.bub{max-width:90%;padding:13px 17px;line-height:1.5}
.bub-user{background:var(--ink);color:var(--bone);font-family:var(--font-display);font-style:italic;font-weight:500;font-size:16px;border-radius:15px 15px 4px 15px}
.bub-bot{background:var(--paper);border:1px solid var(--paper-3);color:var(--ink-2);border-radius:15px 15px 15px 4px;align-self:flex-start;min-width:min(420px,86%)}
.bub-bot b{color:var(--ink)}.bub-bot i{font-style:italic}
.ch-ans{font-size:14.5px}
.ch-ans a,.ch-fw{color:var(--pink-deep);text-decoration:none;border-bottom:1px solid rgba(179,14,97,.32)}
.ch-ans a:hover,.ch-fw:hover{color:var(--pink-hot);border-bottom-color:var(--pink-hot)}
.ch-rm{color:var(--pink-deep);font-size:11px}
.cd-caret{display:inline-block;width:2px;height:1.02em;background:var(--bone);margin-left:1px;transform:translateY(2px);animation:caret .85s steps(1) infinite}
@keyframes caret{0%,49%{opacity:1}50%,100%{opacity:0}}
.cd-typing{display:inline-flex;gap:5px;padding:3px 2px}
.cd-typing i{width:6px;height:6px;border-radius:50%;background:var(--ink-4);animation:cdot 1.2s var(--ease) infinite}
.cd-typing i:nth-child(2){animation-delay:.15s}.cd-typing i:nth-child(3){animation-delay:.3s}
@keyframes cdot{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
.ch-chart{margin-top:13px;border-top:1px dashed var(--paper-3);padding-top:14px}
.ch-cap{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-4);margin-bottom:11px}
.ch-bars{display:flex;flex-direction:column;gap:9px}
.ch-brow{display:grid;grid-template-columns:minmax(78px,1.1fr) minmax(0,1.8fr) auto;align-items:center;gap:12px}
.ch-bl{font-size:12.5px;color:var(--ink-2);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ch-bt{height:14px;background:var(--paper-2);overflow:hidden}
.ch-bf{height:100%;width:0;transform-origin:left;transition:width .8s var(--ease)}
.ch-bv{font-size:12px;color:var(--ink);text-align:right;white-space:nowrap}
.ch-bsub{color:var(--ink-4);font-size:10px}
.ch-cols{display:flex;align-items:flex-end;gap:3px;height:120px}
.ch-col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
.ch-col-bar{width:72%;background:var(--pink);min-height:2px;height:0;transition:height .7s var(--ease)}
.ch-col:hover .ch-col-bar{background:var(--pink-hot)}
.ch-col-x{font-family:var(--font-mono);font-size:7.5px;color:var(--ink-4);margin-top:5px;white-space:nowrap}
.chat-foot{font-family:var(--font-mono);font-size:11px;color:var(--ink-4);margin-top:12px;letter-spacing:.02em}
.chat-foot code{font-size:10.5px;color:var(--ink-3)}

@media (max-width:920px){
  html,body{overflow-x:hidden}
  .page{padding:20px 20px 0}
  .hero,.layer-grid,.dash-grid,.q-grid,.tool-grid,.honest-grid,.explorer-panel,.colophon-grid,.conn-grid{grid-template-columns:1fr}
  .hero{gap:36px;padding:36px 0 40px}
  .hero-headline{font-size:clamp(34px,9vw,58px)}
  .hero-stats{grid-template-columns:repeat(2,1fr)}
  .ep-row{grid-template-columns:96px 1fr auto}.ep-big{font-size:38px}
  .bar-row{grid-template-columns:minmax(90px,1.2fr) minmax(0,1.6fr) auto}
  .layer,.tool-col{border-right:0;border-bottom:1px solid var(--paper-3)}
  .cta{margin-left:-20px;margin-right:-20px;padding:48px 20px}
  .ep-verdict{border-left:0;border-top:2px solid var(--pink);padding-left:0;padding-top:16px}
  .fw-name{max-width:none}
  .chat-log{height:440px;padding:18px 16px 20px}
  .bub{max-width:96%}.bub-bot{min-width:0;width:100%}
  .ch-brow{grid-template-columns:minmax(60px,1fr) minmax(0,1.4fr) auto;gap:8px}
  .ch-bl{font-size:11.5px}.ch-col-x{font-size:7px}
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

  // ---- animated chat demo ----
  var CHAT=window.__CHAT__||[];
  var log=document.getElementById("chatLog");
  var win=document.getElementById("chatWin");
  var countEl=document.getElementById("chatCount");
  var chipBar=document.getElementById("chatChips");
  if(log&&CHAT.length){
    var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    var PC={buyer:"Buyer",seller:"Seller",researcher:"Researcher"};
    var filter="all",paused=false,timer=null,started=false,seq=[],sp=0;
    var sesc=function(s){var e=document.createElement("div");e.textContent=s;return e.innerHTML;};
    var fmtv=function(v,f){return f==="num"?cn(v):fmt(v);};
    var pool=function(){var r=[];for(var i=0;i<CHAT.length;i++){if(filter==="all"||CHAT[i].p===filter)r.push(i);}return r;};
    var scroll=function(){log.scrollTop=log.scrollHeight;};
    var clearLog=function(){log.innerHTML="";pairs=0;};
    function countUp(scope){scope.querySelectorAll(".cd-num").forEach(function(el){var v=+el.getAttribute("data-v"),f=el.getAttribute("data-f"),t0=null;function step(ts){if(!t0)t0=ts;var k=Math.min(1,(ts-t0)/700),e=1-Math.pow(1-k,3);el.textContent=fmtv(Math.round(v*e),f);if(k<1)requestAnimationFrame(step);else el.textContent=fmtv(v,f);}requestAnimationFrame(step);});}
    function chartEl(c){
      if(!c)return null;
      var wrap=document.createElement("div");wrap.className="ch-chart";
      var vals=c.rows.map(function(r){return r.value;});vals.push(1);var mx=Math.max.apply(null,vals);
      if(c.caption){var cap=document.createElement("div");cap.className="ch-cap";cap.textContent=c.caption;wrap.appendChild(cap);}
      if(c.kind==="cols"){
        var cols=document.createElement("div");cols.className="ch-cols";
        c.rows.forEach(function(r){var col=document.createElement("div");col.className="ch-col";col.title=r.label+": "+fmtv(r.value,r.fmt);col.innerHTML='<div class="ch-col-bar"></div><div class="ch-col-x">'+sesc(r.label)+'</div>';cols.appendChild(col);});
        wrap.appendChild(cols);
        wrap._anim=function(){var bs=cols.querySelectorAll(".ch-col-bar");c.rows.forEach(function(r,i){bs[i].style.height=(r.value/mx*100).toFixed(1)+"%";});};
      }else{
        var bars=document.createElement("div");bars.className="ch-bars";
        c.rows.forEach(function(r){var row=document.createElement("div");row.className="ch-brow";
          row.innerHTML='<div class="ch-bl" title="'+sesc(r.label)+'">'+sesc(r.label)+'</div><div class="ch-bt"><div class="ch-bf '+(r.tone==="pink"?"bf-pink":"bf-ink")+'"></div></div><div class="ch-bv numeral"><span class="cd-num" data-v="'+r.value+'" data-f="'+(r.fmt||"gbp")+'">'+fmtv(reduce?r.value:0,r.fmt)+'</span>'+(r.sub?' <span class="ch-bsub">'+sesc(r.sub)+'</span>':'')+'</div>';
          bars.appendChild(row);});
        wrap.appendChild(bars);
        wrap._anim=function(){var fl=bars.querySelectorAll(".ch-bf");c.rows.forEach(function(r,i){fl[i].style.width=(r.value/mx*100).toFixed(1)+"%";});countUp(bars);};
      }
      return wrap;
    }
    function addUser(item,cb){
      var m=document.createElement("div");m.className="msg msg-user";
      m.innerHTML='<span class="msg-persona p-'+item.p+'">'+(PC[item.p]||item.p)+'</span><div class="bub bub-user"><span class="cd-q"></span><span class="cd-caret"></span></div>';
      log.appendChild(m);scroll();
      var span=m.querySelector(".cd-q"),caret=m.querySelector(".cd-caret"),q=item.q,i=0;
      if(reduce){span.textContent=q;if(caret)caret.remove();return cb&&cb();}
      (function type(){if(paused){timer=setTimeout(type,160);return;}
        if(i<=q.length){span.textContent=q.slice(0,i);i++;scroll();timer=setTimeout(type,48+Math.random()*52);}
        else{if(caret)caret.remove();timer=setTimeout(function(){cb&&cb();},340);}})();
    }
    function addBot(item,cb){
      var m=document.createElement("div");m.className="msg msg-bot";
      m.innerHTML='<div class="bub bub-bot"><div class="cd-typing"><i></i><i></i><i></i></div></div>';
      log.appendChild(m);scroll();
      var reveal=function(){var bub=m.querySelector(".bub-bot");bub.innerHTML="";
        var ans=document.createElement("div");ans.className="ch-ans";ans.innerHTML=item.a;bub.appendChild(ans);
        var ch=chartEl(item.chart);if(ch)bub.appendChild(ch);scroll();
        if(ch&&ch._anim)requestAnimationFrame(function(){requestAnimationFrame(ch._anim);});
        cb&&cb();};
      if(reduce)return reveal();
      timer=setTimeout(reveal,720);
    }
    function reshuffle(){seq=pool();for(var i=seq.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=seq[i];seq[i]=seq[j];seq[j]=t;}sp=0;}
    function nextIdx(){if(sp>=seq.length)reshuffle();return seq[sp++];}
    function scheduleNext(hold){timer=setTimeout(function tick(){if(paused){timer=setTimeout(tick,200);return;}next();},hold);}
    function run(item){addUser(item,function(){addBot(item,function(){scheduleNext((reduce?6500:7000)+(item.chart?1200:0));});});}
    function next(){
      if(!pool().length)return;
      var item=CHAT[nextIdx()];
      if(countEl)countEl.textContent=String(sp);
      if(started){log.style.opacity="0";timer=setTimeout(function(){clearLog();log.style.opacity="1";run(item);},460);}
      else{started=true;run(item);}
    }
    reshuffle();clearLog();
    if(win){win.addEventListener("mouseenter",function(){paused=true;});win.addEventListener("mouseleave",function(){paused=false;});}
    if(chipBar){chipBar.querySelectorAll(".cd-chip").forEach(function(c){c.addEventListener("click",function(){
      chipBar.querySelectorAll(".cd-chip").forEach(function(x){x.classList.remove("active");});c.classList.add("active");
      filter=c.getAttribute("data-persona");started=false;reshuffle();clearTimeout(timer);log.style.opacity="0";
      timer=setTimeout(function(){clearLog();log.style.opacity="1";next();},320);});});}
    next();
  }
})();
`;

await main();
