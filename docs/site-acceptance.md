# govbuy.run.cns.me — website acceptance criteria

A public marketing + **explorable-dashboard** site served at the root of `govbuy.run.cns.me` (the MCP
stays at `/mcp`), in the **cns.me editorial design system** (Fraunces / Hanken Grotesk / JetBrains Mono,
warm paper `#F4EFE7`, ink `#14110F`, pink `#E5197F`; masthead, eyebrow kickers, rules, plates), built to
make a procurement-savvy visitor think *"these people genuinely understand this problem space"* and reach out.

## Design fidelity (AC-D)
- **AC-D1** Visually a sibling of talks.cns.me / blog.cns.me: the same fonts, colour tokens, `cns•me` brand
  lockup with the pink dot, masthead with animated rule draws, eyebrow/rule/section-header components,
  numerals in mono with tabular figures. No generic Bootstrap/Tailwind look.
- **AC-D2** Responsive (single-column on mobile), accessible (semantic landmarks, alt text, `prefers-reduced-motion`
  respected, AA contrast), and fast (self-contained HTML, no heavy chart library; inline SVG/CSS charts).

## What's available (AC-W)
- **AC-W1** A hero that states what govbuy is in one line and the one-command install (`claude mcp add … https://govbuy.run.cns.me/mcp`), copy-to-clipboard.
- **AC-W2** A "what's inside" section conveying route × reality × statute with the real headline numbers
  (frameworks, catalogue listings, fused awards, suppliers, spend coverage) and the 17 tools grouped by persona.
- **AC-W3** An honest section: what it can't do / coverage gaps (login-walled lists, attribution gaps) — credibility through candour.

## Example questions (AC-Q)
- **AC-Q1** A gallery of ≥8 real example questions across buyer / seller / researcher, each with a one-line
  outcome, drawn from the genuine demos (drone DPS, Minute hosting, the convenience-premium, thin-prime map,
  conservation grazing, etc.) — phrased as a visitor would ask their assistant.

## Dashboards with real, explorable data (AC-X)
- **AC-X1** ≥4 dashboards rendered from **real `govbuy_public` data** (not invented): e.g. spend-by-channel,
  the framework-vs-open price premium, top frameworks by real call-off £, the £-bn reseller/thin-prime layer,
  the re-procurement (expiry) wave, catalogue composition.
- **AC-X2** At least one is genuinely **interactive/explorable** in-browser (e.g. a price-benchmark explorer:
  pick a CPV sector → median/p25/p75 + framework-vs-open premium updates; or a sortable framework-spend table),
  working with no server round-trip (data baked into the page).
- **AC-X3** Every number is real and reproducible from BigQuery; a visible "data as of" date + source note;
  the generator script is committed and re-runnable.

## Hosting (AC-H)
- **AC-H1** `https://govbuy.run.cns.me/` returns the site (200, HTML); `/mcp` still serves the MCP; `/health` ok.
- **AC-H2** Served from the existing Cloud Run service; read-boundary unchanged; deploy is one command.

## Definition of done (AC-DONE)
- **AC-DONE** An **adversarial reviewer agent** — briefed as a sceptical UK public-procurement expert + a
  design-critical engineer — reviews the live site and is **wowed**: it concludes the site demonstrates deep
  domain understanding and high value, finds no fabricated/sloppy data, and explicitly says it would reach out.
  Its critique is captured; blocking issues fixed until it reaches that verdict.
