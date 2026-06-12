# Top-5 acceptance criteria — "make govbuy decisive & bulletproof"

The five winners of the voter tournament. Theme: not *more data* — *sharper judgment and trust* over
the data already fused (117k listings + 658k awards on CRN). Done when AC-DONE holds.

## 1. PA2023 regime engine — statutorily precise `compliant_path`
- **AC-PA-1:** `compliant_path` (and the model) encode the **Procurement Act 2023** mechanics — names the
  **competitive flexible procedure**, the **8-working-day standstill**, the lawful **direct-award grounds**,
  **open vs closed frameworks** (8-yr / 4-yr) and **dynamic markets** (DPS abolished prospectively, deemed
  end ~Feb 2029), the **KPI publication duty** (contracts > £5m), and that the regime is **payment-method-blind**
  (triggers on value/type, not how you pay). *Verify:* `claude -p` "a statutory direct award under PA2023 —
  when is it allowed, and is it the same as a G-Cloud call-off?" gets the standstill + the call-off-≠-statutory
  distinction right (the eval question that failed now passes), each statutory claim source-anchored.

## 2. Exclusion / debarment gate — "can I even use this supplier?"
- **AC-GATE-1:** `get_supplier`, `due_diligence`, `find_services` and `plan_buy` surface an **exclusion check** —
  Companies House distress (**dissolved / liquidation / administration**, ~1.8k suppliers), the **PA2023 debarment
  list**, and **OFSI sanctions** where matched — as an explicit ⚠ flag, **never silently**. A clean supplier is
  marked clear. *Verify:* a dissolved-status supplier is flagged; an active one isn't; the flag carries its source.

## 3. `plan_buy` — the opinionated end-to-end
- **AC-PLAN-1:** given a need (+ optional budget / timeline), `plan_buy` returns **ONE** recommendation: the
  route + permitted mechanic (PA2023-correct), a ranked **shortlist of 3 listings** (each with CRN track record
  + exclusion check), an **indicative benchmark price**, and a **compliance checklist** — all source-anchored
  and clearly caveated as indicative (you still run your own assessment). *Verify:* `claude -p` "plan my buy of
  cloud hosting for a council, ~£80k/yr" returns a complete single plan, not a database dump.

## 4. Self-correcting descriptions — steer the agent, kill misfires
- **AC-DESC-1:** every tool description states its **persona**, the **decision it serves**, the **natural next
  tool**, its **anti-patterns**, and a **worked example**; `find_services` disambiguates "a desk" (furniture vs
  IT service desk); `due_diligence`/`find_services` state NULL = *absence of evidence, not of capability*;
  `benchmark_price` flags its keyword as a weak sector hint. *Verify:* "I need a desk" is handled without
  misfire; the eval's misfire-class questions improve.

## 5. Forward pipeline — what's coming, not just what's live
- **AC-PIPE-1:** a curated `pipeline_notice` table (planned / planning notices) materialised into `govbuy_public`;
  `supplier_pipeline` gains a **"coming soon"** section surfacing upcoming procurements in a CPV with expected
  timing + buyer + URL. *Verify:* `claude -p` supplier "what's coming in IT in the next year?" returns planned
  notices ahead of the tender, with official URLs.

## Definition of done
- **AC-DONE-1:** all five deployed on the live MCP and each verified by a `claude -p` run.
- **AC-DONE-2:** AC-1..11 still pass; read-boundary assertion passes.
- **AC-DONE-3:** golden-eval re-run (throttled, 27 Qs) scores 70% raw / **≈78% harness-corrected** — the PA2023
  failure cluster is gone (the hardest PA2023 question now passes). Honest decomposition in `STATUS.md` →
  *Eval honesty*: 2 failures were harness artifacts (Monitor-status non-answers; pass solo), 1 exposed a real
  supplier-identity reconciliation bug (5,181 CRNs map to >1 `supplier_id` — now the top next-step), 5 are
  genuine content gaps (specific DPS instruments, one s49 mechanic error, one fabricated £/URL, one residency flag).
- **AC-DONE-4:** the README is rewritten to be phenomenal — leads with the decisive, bulletproof, three-persona
  product; every claim source-anchored; all demos real `claude -p`.
