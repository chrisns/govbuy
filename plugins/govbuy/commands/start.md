---
description: Meet govbuy — what the UK public-procurement co-pilot can do, with live examples
---

The user has just installed the **govbuy** plugin and wants to see what it can do. The `govbuy` MCP server is
connected (buy, sell, supplier, framework, draft, watch, research).

Give them a short, punchy, genuinely useful orientation — not a wall of text:

1. One sentence on what govbuy is: *the UK public-procurement co-pilot — it fuses 3,200+ frameworks & dynamic
   markets, 117k catalogue listings and 658k real tender awards with the Procurement Act 2023, all
   source-anchored.*
2. **Prove it's live**: call `research({status:true})` and report in one line how fresh the data is and its
   size (frameworks, suppliers, real awards) — so they see it's real, not a brochure.
3. Show what they can ask, grouped by who they are, as copy-able examples:
   - **Buyer** — *"I'm a council. How do I buy managed cloud hosting for ~£80k/year?"* · *"We're about to award
     to Acme Ltd — are they safe?"* · *"Draft me a further-competition timetable for a managed SOC."*
   - **Seller** — *"I sell EV charging infrastructure. How do I get on a framework?"* · *"Which IT contracts are
     expiring in the next 6 months?"*
   - **Researcher** — *"Is the public sector overpaying for IT by buying through frameworks?"* · *"Who wins the
     most through framework call-offs?"*
4. Mention the slash commands as shortcuts: `/govbuy:buy`, `/govbuy:check-supplier`, `/govbuy:sell`,
   `/govbuy:draft`, `/govbuy:watch`.
5. Invite them to try one — offer to run the council cloud-hosting example right now if they'd like.

Keep it tight and inviting. Every figure you state must come from the `research` tool result.
