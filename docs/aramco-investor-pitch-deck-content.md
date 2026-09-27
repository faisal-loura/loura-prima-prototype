# Loura — Investor Pitch Deck Content

**Audience:** Aramco (investment audience — opportunity-sizing conversation, not a raise)
**Purpose:** Show the size and structure of the opportunity, and that Loura has a credible mechanism for reaching it
**Date:** 26 September 2026
**Status:** Draft 0.1 — content only. Not yet designed, not yet fact-refreshed for external release.
**Sources:** Loura Company Strategy (23 Sep 2026) · Loura system vision (17 Sep 2026) · Loura Release 1 charter (21 Sep 2026) · Company 360 / VC Brief (18 Aug 2026) · Loura Strategy Spine V2 · Material Readiness Prototype Requirements v0.9 · Prima × Loura kickoff notes (26 Aug 2026) · Review — Prima Work System Analysis v1.0 (14 Sep 2026) · Demand Forecasting Analysis (24 Sep 2026) · Investor Updates June/Aug 2026 · Feasibility Assessment (food products) · repo `README.md`

---

## How to read this document

Every slide below has five parts:

| Part | What it is |
| --- | --- |
| **Headline** | The one sentence on the slide. If the reader remembers nothing else, this. |
| **On the slide** | The actual words and numbers that appear. Keep them; don't expand. |
| **Visual** | What the slide should show. |
| **Say it like this** | Speaker notes — the argument, in the room. |
| **Evidence status** | Verified / Reported / Target / Hypothesis. Governs what may be claimed aloud. |

### Claims discipline

This deck is going to a sophisticated industrial investor who can check every operational claim. Loura's own internal
method (the Prima review, the evidence legend in the analysis pack) already separates **reported**, **observed**,
**system-verified**, **derived**, **hypothesized** and **unknown**. Carry that discipline into the deck. It is an
asset, not a liability: an operator audience trusts a team that says "unknown" out loud.

**Hard rules for this deck:**

1. **No paying customers. Say so.** One design partner, currently unpaid, in analysis. Zero signed recurring revenue.
2. **The prototype runs on fictional fixtures.** It is real software with real agent calls, and its data is synthetic.
   Never show it as a live customer deployment.
3. **The intervention/build gate for the design partner is NO-GO as of 14 September 2026.** Field discovery is GO.
   That is the current honest position and it is early by design.
4. **$130–150K/year is an offer under discussion**, not validated pricing and not booked revenue.
5. **Market sizing below is layered and labelled.** Ministry figures are sourced; anything multiplied by Loura's own
   price point is arithmetic, and is marked as such.
6. **The design partner's name requires written disclosure permission.** Until obtained, describe them generically.

### Before this goes out — open items

- [ ] Confirm written permission to name the design partner to Aramco. Default: withhold, describe generically.
- [ ] Refresh cash / burn / runway from the latest finance snapshot (figures here are the June 2026 snapshot).
- [ ] Confirm Cayman holdco incorporation status.
- [ ] Fill the two `[CONFIRM]` counts on Slide 7 from the CRM / factory-list work (Food Manufacturing SOP).
- [ ] Confirm the SAR 100,000 purchase-approval threshold against the design partner's actual approval matrix.
- [ ] Decide the Slide 6 option (A, B or C) — see that slide.
- [ ] Decide whether Slides 9 and 11 name the ex-Palantir architect publicly and in what capacity (currently fractional).

---

# Slide 1 — Company & one-line pitch

**Headline**
**Loura is the AI operating layer for industrial organizations: agents that carry real operational
responsibilities through to a verified result, alongside the people who hold the authority.**

**On the slide**
- **What we do** — Loura connects an organization's systems, information and authority into one platform where AI
  agents carry out bounded operational responsibilities: they assemble the situation, do the work, involve the right
  person when judgment or approval is needed, and persist until the outcome is verified.
- **For whom** — Saudi manufacturers, starting with food manufacturing. Mid-market and large groups running real
  operational complexity on an ERP, with coordination still happening in spreadsheets, WhatsApp, email and phone calls.
- **The value** — the same organization accomplishes more, with fewer avoidable failures, without adding headcount:
  *effectiveness, capacity, reliability.*
- **Where we are** — pre-seed, post-pivot. Platform prototype built and running. One design partner in live analysis.
  Not yet proven, and deliberately narrow while we prove it.

**Visual**
Loura wordmark. Beneath it, one line of the loop: **Perceive → Assemble the situation → Decide → Act within authority
→ Verify → Feed the verified state forward.** Small honest footer: *Pre-seed · Saudi Arabia · 1 design partner · 0
paying customers.*

**Say it like this**
"Every company already runs a loop: something changes, someone works out what it means, someone decides, someone
acts, someone checks it actually happened. Software has never carried that loop — only the pieces of it. That's
what we build, and we're starting in Saudi food manufacturing because the failures there are frequent, visible and
measurable. I'll be precise about what's proven and what isn't, because at this stage that distinction is the
interesting part."

**Evidence status** — Positioning: Verified against Loura Company Strategy (accepted, 23 Sep 2026). Stage: Verified.

---

# Slide 2 — Problem

**Headline**
**No system holds the organization as one connected thing — so the hardest operational work is done
in people's heads, and nothing it produces accumulates.**

**On the slide**

**What breaks**
- Each system holds its own slice accurately, and knows nothing about how that slice relates to the others.
- So every cross-boundary event — a delayed shipment, a rejected batch, a large unexpected order — requires a person
  to assemble context, apply policy from memory, chase people across channels, and verify closure by hand.
- The organization is only as intelligent as the attention of whoever is stitching that day. That capability walks
  out of the door with them.

**What it looks like in a real plant** *(design partner, food manufacturing, ~200 active SKUs)*
- ERP is Microsoft Dynamics Business Central, deliberately simple, progressively extended.
- Coordination runs across Business Central **plus WhatsApp, email, Microsoft Teams and phone**.
- Purchasing is the human coordination hub across Sales, Production, Warehouse, Quality, suppliers and Finance.
- Automatic reordering exists at stock thresholds — and **everything after the PO is manual**: supplier follow-up,
  negotiation, monitoring, documentation, letters of credit, and confirming the material will actually arrive usable.
- Food adds constraints that make errors expensive: shelf life, cold chain (frozen ≤ −18 °C, chilled 0–4 °C), HACCP
  records on every batch and every shift, SFDA inspection, full traceability, and contamination risk.

**Why existing options fall short**
| Option | Why it doesn't close the gap |
| --- | --- |
| **ERP / MES / SCADA** | Authoritative inside their own domain. They hold records; they don't carry cross-boundary work. |
| **BI and dashboards** | Show you a number. Someone still has to assemble the situation, decide and chase. |
| **RPA / workflow tools** | Hold only while conditions don't change. They break on the exception, which is the actual work. |
| **Consultancies / SIs** | Produce a recommendation or a bespoke build. Nothing compounds into reusable software. |
| **Hiring more capable people** | Works, and doesn't scale. It also keeps the capability inside individuals. |

**Visual**
Left: a plant with six system/channel boxes (Business Central, WhatsApp, Teams, email, phone, spreadsheets) and no
lines between them — the connections drawn instead as a thought bubble over one person's head.
Right: the same picture with a connecting layer, and the person now deciding rather than assembling.

**Say it like this**
"I want to be specific rather than abstract. In our design partner's plant, the reorder is automated — the system
raises a PO when stock hits a threshold. Everything that determines whether material actually shows up usable and on
time is a human chasing a supplier on WhatsApp and phone. That's not a software gap anyone has filled, and it's not
because the ERP is badly configured. It's because no system holds the order, the recipe, the stock, the inbound
shipment, the quality disposition, the customer commitment and the approval authority as one connected thing."

**Evidence status** — Design partner facts: **Reported** by the customer in the 26 Aug and 9 Sep sessions, not yet
observed or system-verified. Food regulatory and cold-chain facts: **Verified** from sector research. The SAR 100,000
approval threshold is reported and still needs documentary confirmation — do not put it on a slide until it is.

---

# Slide 3 — Solution

**Headline**
**Loura gives agents bounded responsibility for operational work, and gives people back the decisions —
with authority, evidence and verified closure enforced by software.**

**On the slide**

**The loop we close**
1. **Perceive** — a condition, event, request or record changes.
2. **Assemble the situation** — connect the order, material, recipe, stock, inbound supply, commitment, deadline,
   quality status and cost.
3. **Decide** — apply the organization's own policies, priorities, constraints and prior decisions.
4. **Establish authority** — who owns this, what needs approval, what is permitted, what is prohibited.
5. **Act and coordinate** — assign work, ask a person a specific question, remind, escalate, update a system, or
   execute a permitted action.
6. **Verify** — confirm through evidence that the action happened and the intended state was reached.
7. **Feed it forward** — preserve the evidence and outcome so the next decision starts from what actually happened.

**Three properties that make it usable in an operation**
- **Autonomy is configured, not claimed.** Level 3 (agent decides and acts within boundaries, involves a person at
  defined checkpoints) or Level 4 (agent completes the task, involves a person for exceptions beyond its authority).
  Set per responsibility, per use case.
- **"Unknown" is a first-class state.** Missing, stale or conflicting data is shown and reduces confidence. The
  system does not convert missing data into confidence. A vague answer does not quietly become a fact.
- **Authority is enforced, not described.** Permitted actions proceed; approval-required actions wait; prohibited
  actions do not run. Authority is re-checked before dispatch. **Silence is never approval.** Agents cannot expand
  their own authority.

**The outcome we deliver**
- **Effectiveness** — better-informed decisions, fewer avoidable errors, less rework.
- **Capacity** — work gets done that was previously impractical, without an equivalent burden of supervision.
- **Reliability** — activities are carried through as circumstances change, and you can see what is unfinished, what
  is blocking it, and who needs to act.

**Visual**
The seven-step loop as a ring, with the feedback arrow emphasised. Overlay a single governed action showing the
four gates: *permitted · approval-required · prohibited · re-checked before dispatch.*

**Say it like this**
"The differences that matter here are boring and they're the whole product. Review is not approval. Requested is not
effective. Sent is not confirmed. Resolved is not verified. Silence is not consent. Any system that blurs those is
unusable in a plant where a wrong purchase or a released bad batch is a real event — and most AI demos blur all five.
We enforce them in software, and we make the agent's uncertainty visible instead of hiding it behind fluent writing."

**Evidence status** — Verified against Release 1 charter (Draft 0.4) and the Material Readiness requirements spec
(v0.9). Level 3/4 behaviour is the selected release promise; detailed acceptance targets are still being defined.

---

# Slide 4 — Product

**Headline**
**One platform, five capability areas, and a working prototype that already runs three end-to-end journeys —
including the reuse test.**

**On the slide**

**The five capability areas**
| Area | What it does |
| --- | --- |
| **Work Hub** | Where people and teams work with agents: start or find an activity, see progress and results, do their own tasks, answer focused requests, review, approve, intervene. Home · Inbox · My Work · detail views. |
| **Coordination & execution** | Keeps delegated work moving between conversations: persistent assignments, event-driven continuation, configured checkpoints, human waits, completion checks, bounded recovery, pause / resume / end. |
| **Studio** | Where reusable agents and procedures are defined: instructions, permitted sources and tools, human steps, action boundaries, completion and exception rules. Versioned, testable, publishable. |
| **Knowledge & connections** | Links Loura to the organization's information and applications — supported sources, events and actions, with connection health, validation and repair. |
| **Administration** | Membership, access, permitted / prohibited / approval-required actions, configuration rights, and attributable history. Published instructions cannot grant authority. |

**What actually runs today** *(internal prototype, synthetic fixtures, Claude Opus 5 doing the reasoning)*
- **Journey A — investigate and create.** Ask a question against selected sources → agent answers in a private
  conversation and produces an editable comparison → edit with autosave → share with a colleague who can edit and
  comment → someone outside the audience gets *"You can't open this."* Ask the agent to revise while you're editing
  and its result is kept **beside** your newer version rather than overwriting it.
- **Journey B — pursue a shared outcome.** Create a Mission with two colleagues → add context and grant access →
  three tasks with a real dependency → involve two agents → assign and start → one task runs while the dependent one
  waits → ask a colleague for a missing fact; she answers from her Inbox with evidence → drafting starts → request a
  named reviewer's review of a specific version → she requests changes → revise → new version, new submission →
  accept → complete.
- **Journey C — continue and respond to change.** A monitoring agent watches a delivery (need 100 by 20 Sep, 80
  available, 20 incoming due 19 Sep) → close the browser → the external date moves to 21 Sep → the worker reassesses
  (20 short) and asks the approver to set a risk flag → **the same event delivered twice is ignored as a duplicate**
  → lose the response and the outcome is **uncertain**, not "done" → check the current record: state confirmed, cause
  unconfirmed, nothing re-sent → **Pause** ("Actions paused · Still receiving updates") → a further change is held →
  **Resume** reassesses without replaying old approvals.
- **The reuse check.** Run a second assignment with the same agent and procedure against a different delivery.
  **No code and no screen differs. Pausing one leaves the other running.**
- **Enforcement is real, not simulated.** Record access is enforced by Postgres row-level security — a view of a
  record you can't read returns the same 404 as a record that doesn't exist. The agent worker signs in as a member,
  not with a service-role key. Document saves and agent revisions use compare-and-set on the version number.

**Visual**
Three or four real screenshots: **Work Hub / Home**, **an outcome detail with the material breakdown and its
sources**, **an exception work item showing owner, due time, agent plan and evidence**, **Control Room** showing
waits and exceptions across assignments. Caption every one: *Prototype · synthetic fixtures.*

**Say it like this**
"I'd rather show you the unglamorous parts, because they're the ones that decide whether this survives contact with
an operation. The duplicate event that creates nothing. The lost response that ends in 'uncertain' instead of 'done'.
The pause that stops actions but keeps observing. The approver change that blocks a dispatch on re-check even though
approval was already granted. And the reuse check — second activity, same platform, zero new code. That's the test
that tells us whether we're building a product or an agency."

**Evidence status** — **Verified** — this is running software in the repository. **Every fixture is fictional and
labelled.** This is not evidence of usability, agent quality or production readiness until the evaluation plan is run.

---

# Slide 5 — Why now

**Headline**
**Three things converged: models that can finally carry work over time, Saudi industry actively funded to
digitize, and no incumbent that holds the organization as one connected thing.**

**On the slide**

**1. The technology crossed a threshold**
- Models can now perceive context, reason over an evolving situation, use tools, and act over time — rather than
  waiting for a human to operate each step. Persistent agency became a software property, not a research goal.
- The constraint moved. It is no longer "can a model reason about this?" It is "can it be given bounded authority,
  real connections, and verified closure?" That is a systems and product problem — which is where we build.

**2. Saudi industry is being funded to modernize, now**
- **11,672** operating and under-construction factories in Saudi Arabia (Ministry of Industry and Mineral
  Resources, January 2024).
- The Ministry's **Future Factories** programme targets **4,000 factories** for smart operations, automation and
  advanced industrial technology adoption.
- Industrial platform grants for foundational and advanced digitization cover **up to 80% of project value**, capped
  at **SAR 300,000**, subject to eligibility.
- Adjacent public demand is forming on the same shape of problem: DGA's Whole of Government programme aims to unify
  sectors **without replacing core systems**; GAMI targets **over 50% of military spending localized by 2030**.

**3. The category is opening, not closed**
- Palantir proved enterprises need an operational intelligence layer over fragmented systems — and proved how hard
  and how expensive it is to build one.
- Industrial agent companies are appearing, which validates the direction. None of them is native to the Gulf, and
  none of them is built around the organization's own authority structure as the primary object.
- The window is the gap between "AI is obviously coming to operations" and "someone owns that layer regionally."

**Honest caveat, said out loud**
- Ministry programmes create budget and political permission. **They do not prove demand for Loura.** Early customer
  conversations show enthusiasm for AI arriving *before* a clear application or economic justification exists. Part of
  our job is helping a customer turn broad interest into a concrete problem with a measurable result.

**Visual**
Three columns — *Capability · Capital & policy · Category* — with one number under each: agents that persist ·
11,672 factories / 4,000 targeted / 80% grants · no regional owner. Keep the caveat as a visible footer.

**Say it like this**
"I'll give you the version with the caveat attached, because you'll apply it anyway. The Ministry programmes mean
budget exists and modernization is politically expected. They don't mean anyone is waiting to buy what we've built.
What they do mean is that the objection we'd have faced three years ago — 'why would a Saudi factory spend on this' —
has largely been answered by someone other than us."

**Evidence status** — Ministry and programme figures: **Verified** external sources (MIM, industry.mim.gov.sa).
DGA / GAMI: **Verified** public programme targets. The convergence argument: **Derived**. The caveat: **Reported**
from Loura's own customer conversations.

---

# Slide 6 — Traction

> **Decision required before this deck ships.** This is the weakest slide and it should be the most honest one.
> Three options:
> - **Option A (recommended) — lead with the mechanism.** Present traction as *capability built + method proven +
>   one design partner in live analysis*, and state plainly that there is no paying revenue and no production result.
>   Credible with an industrial investor; consistent with every internal document.
> - **Option B — defer the slide.** Replace with "Where we are on the proof path" and show the gate sequence.
>   Cleaner, but an investor will read it as avoidance.
> - **Option C — wait.** If the design partner converts to paid and a first evaluated result lands, this slide
>   becomes genuinely strong. Consider whether the meeting should wait for that.
>
> Content below is written for **Option A**.

**Headline**
**Zero paying customers. One unpaid design partner in live analysis. What we have built is the platform and
the method — and the honest gate status of both.**

**On the slide**

**Revenue and customers — stated plainly**
| | Count | Status |
| --- | --- | --- |
| **Paying customers** | **0** | No signed recurring revenue |
| **Paid pilots** | **0** | — |
| **Unpaid design partners** | **1** | Saudi food manufacturer. Analysis and discovery active; FDE and consultation fees currently waived deliberately, to build reputation and learn. Intent is to begin a paid engagement near the end of this work. |
| **Production deployments** | **0** | Prototype runs on synthetic fixtures only |

**What has actually been achieved** *(the real traction)*
- **Pivot completed.** Exited the trade-credit business, acquired Loura.com, re-centred the company on operational
  intelligence for manufacturers — while most of the capital was still intact.
- **Platform prototype built and running.** Five capability areas, three end-to-end journeys, Level 3 and Level 4
  autonomy, real authority enforcement in Postgres RLS, agents on Claude Opus 5.
- **Reuse demonstrated at prototype level.** A second activity ran on the same platform with **no new code and no
  new screens**. This is the single most important early signal for the business model.
- **Design partner engaged and analysed.** Two discovery sessions. The operating flow from demand signal to verified
  material readiness is reconstructed, with the ERP, channels, material classes, approval structure and quality
  disposition documented — and with every claim labelled reported / hypothesis / unknown.
- **A method that gates itself.** We reviewed our own customer analysis and set the **intervention/build gate to
  NO-GO**: the evidence does not yet support selecting an intervention. **Bounded field discovery is GO**, conditional
  on access. We wrote that down before anyone asked us to.

**What is explicitly not proven**
- No locked first use case with a named KPI and a numeric baseline.
- No confirmed ERP data access operational in production.
- No evaluated agent result against a customer baseline.
- No production deployment, no repeat deployment, no recurring revenue.
- Willingness to pay untested. Enthusiasm for AI is not a purchase.

**Visual**
Two columns — **Built** (platform, journeys, reuse check, method, analysis) and **Not yet proven** (locked KPI, data
access, evaluated result, paid engagement). Below: a five-step gate bar with the current position marked at step 2:
*Discovery (GO) → Use-case lock → Data access → Evaluated result → Production → Repeat.*

**Say it like this**
"I'm not going to dress this up. We have no revenue, our design partner isn't paying us yet, and our own internal
review says the evidence doesn't yet justify building an intervention for them. What we do have is a platform that
runs, a second activity that ran on it without a line of new code, and a method strict enough that it told us no.
The reason I think that's worth your time is that the failure mode for companies in our category isn't 'couldn't
build it.' It's 'built twelve bespoke things and called it a product.' The discipline is the asset."

**Evidence status** — All counts **Verified**. Gate status **Verified** (Review, 14 Sep 2026). Prototype claims
**Verified** in code, on synthetic data.

---

# Slide 7 — Market

**Headline**
**Start with Saudi food manufacturing — narrow enough to win, structurally identical enough to repeat —
then expand by use case, by site, by sector, and into government.**

**On the slide**

**Why food manufacturing is the right beachhead**
- **One workflow shape.** Across all 16 food categories the plant runs the same end-to-end structure: receiving →
  preparation → processing → packaging → QC → storage → dispatch. **~14 coordinated steps, ~7 inter-function checks.**
  Solve it once, and the second customer starts from a template rather than a blank page.
- **Highest regulatory intensity of any sector we assessed.** HACCP is mandatory regardless of factory size; SFDA
  inspects continuously; batch records, CCP logs and traceability are generated **every shift, every batch**. Which
  means these plants already have digital systems, and the records an agent needs already exist.
- **Failures are observable and priced.** Shelf life, cold chain, rework, scrap, stockouts, missed delivery. There is
  a number at the end of every exception.

**The layered opportunity**

| Layer | Size | Basis |
| --- | --- | --- |
| **Beachhead — Saudi food & beverage manufacturers** with an ERP and enough operational complexity to need this | `[CONFIRM: count from CRM / factory-list work]` | Bottom-up, to be filled from the Food Manufacturing SOP list |
| **Expansion 1 — Saudi manufacturing** | **11,672** operating and under-construction factories; **4,000** targeted by the Future Factories programme | Ministry of Industry and Mineral Resources, Jan 2024 |
| **Expansion 2 — Saudi government & public sector** | DGA Whole of Government: unify sectors **without replacing core systems** — the same coordination problem, at national scale | DGA programme |
| **Expansion 3 — Defence & broader enterprise, GCC** | GAMI targets **>50% of military spending localized by 2030** | GAMI target |

**Room to expand inside a single account**
Revenue is not one-use-case-and-done. Growth compounds along three axes:
- **More use cases** per customer — material readiness, then demand planning, then supplier follow-through, then
  quality disposition, then maintenance coordination. Each is a separate recurring line.
- **More sites** per group — a multi-plant food group is one connected model, many deployments.
- **Deeper autonomy** per use case — Level 3 checkpointed work becomes Level 4 autonomous work as trust and evidence
  accumulate. Same platform, higher value.

**Illustrative arithmetic — not a researched TAM**
> At the current offer of **US$130–150K per use case per year**: 4,000 targeted Future Factories × one use case each
> ≈ **US$520–600M annual recurring**, in Saudi manufacturing alone, before any second use case, second site,
> government, or GCC expansion. **This is arithmetic on our own price point, not a validated market study.** It
> indicates the shape of the ceiling, not a forecast.

**Visual**
Concentric expanding rings — Saudi food & bev → Saudi manufacturing (11,672 / 4,000) → Saudi government →
defence & GCC. Alongside, a small 3-axis diagram: **use cases × sites × autonomy**. Mark the arithmetic box clearly
as illustrative.

**Say it like this**
"The reason to start in food isn't that food is the biggest market. It's that every food plant runs the same fourteen
steps and the same seven checks, and the regulator forces them to keep the records we need. That's the highest-reuse
starting point we found — and reuse is the entire business model. The expansion path isn't a hope; it's the same
coordination problem showing up in bigger and bigger rooms. The last box on this slide is arithmetic on our own price,
and I've labelled it that way on purpose."

**Evidence status** — Food workflow structure and regulatory intensity: **Verified** sector research. Factory counts
and programme targets: **Verified** MIM. Beachhead count: **to be filled**. The arithmetic: **Derived** from Loura's
stated price point — must be presented as illustrative.

---

# Slide 8 — Business model

**Headline**
**Recurring platform revenue per use case, at US$130–150K a year, expanding by use case and by site —
and priced so that implementation never becomes the business.**

**On the slide**

**Who pays**
CEOs, owners and operations leaders. In founder-led and family-owned Saudi manufacturing groups the economic buyer
and the operational sponsor are frequently the same person — which shortens the sale and makes executive sponsorship
obtainable. Each engagement must establish sponsorship, purchasing authority, and the operational participation
success requires.

**Pricing**
| Component | Where it stands | Direction |
| --- | --- | --- |
| **Recurring baseline** | **US$130–150K / year per defined use case** — the current offer under discussion | Continue recurring baseline charges |
| **FDE & consultation fees** | Currently **waived**, deliberately, to build reputation and learn | Charge for consultation and delivery, retaining discretion to concede |
| **Outcome-based charges** | No established component | Introduce with agreed measures, attribution and terms |

**The customer journey**
Consultation and discovery → prototype that makes the capability concrete → customer decides → development and
deployment on agreed terms, **with payment expected before full delivery**.
*(The current design partner's arrangement is deliberately different from this — it is a learning engagement.)*

**The key economics — and the three curves we actually manage**
The model works if three things move together. These are the metrics that matter more than logo count:
1. **Time to a live loop falls** — kickoff to first verified closed loop in production. Target on deployment two:
   **under 66%** of deployment one.
2. **Reusable share rises** — share of requirements met with no new code. Target on deployment two: **bespoke under
   10%** of accepted requirements, and **no founder involvement in the build**.
3. **Account revenue expands** — second use case, second site, deeper autonomy.

**How we stay a product company** *(this is a deliberate design, not an intention)*
- A **productization gate** with a named decision-maker, run weekly during a live deployment. Every requirement is
  classified: core platform / reusable module / customer configuration / bespoke exception. **Default on bespoke is no.**
- Every accepted bespoke exception carries an **expiry date**. By then it is promoted to core, replaced by
  configuration, or removed.
- **Field is not compensated on deployment revenue.** Paying for services volume is how a product company becomes an
  agency without ever deciding to.
- **Implementation priced at or near cost.** If implementation carries margin, we will optimize for more of it.
- **No per-customer screens.** Custom UI is the quietest form of bespoke — individually cheap, collectively fatal.
- **FDE rotation is structural.** If only the person who built it can serve the customer, it was never productized.

**Visual**
Left: the three curves as simple sparklines — *time-to-live-loop ↓ · reusable share ↑ · account revenue ↑.*
Right: the four-way productization gate with **"bespoke → default no, with an expiry date"** highlighted.

**Say it like this**
"The honest risk in our model isn't pricing. It's that forward deployment is a brilliant way to learn an industry and
a brilliant way to hide a weak product behind talented people. So the gate, the bespoke ceiling, the compensation
design, the near-cost implementation pricing and the FDE rotation are all one mechanism pointed at one failure mode.
If deployment three costs what deployment one cost, the engine isn't working — and the answer is to stop selling and
fix the product, not to hire more field engineers."

**Evidence status** — Price point: **Reported** — the current offer under discussion, not signed, not validated.
Waived fees and design-partner arrangement: **Verified**. Reuse targets: **Target**. Productization gate: **Verified**
as an adopted operating policy; its effectiveness is **unproven**.

---

# Slide 9 — Go-to-market

**Headline**
**Forward-deployed engineering: go inside the operation, because the context and logic we need
aren't written down anywhere — then sell the second customer in the same sector as the first.**

**On the slide**

**How we reach them**
- Founder and investor networks reaching the owners and operational leaders who can sponsor a deployment.
- Local credibility: Saudi company, Saudi founders, Arabic capability, understanding of how Saudi organizations
  actually buy.
- Factory directories and a qualified target list built to a defined SOP (food manufacturer, ERP present, ≥50
  employees, reachable sponsor).

**How we win**
- **Sell one occurrence, quantified.** The cost of manual stitching in a specific operation — not "an AI platform."
- **Gated engagement, not an open-ended pilot.** Named executive sponsor · one metric with a numeric baseline · dated
  data-access commitments · a review cadence. No gate, no engagement.
- **Prove beside the live workflow before production.** Compare the agent against the customer's own baseline on real
  data. Release only when the evidence passes.
- **Qualify on reusability, not only pain and budget.** A painful problem in an unfamiliar system landscape is a
  worse deal than a moderate problem in a familiar one, at the same price.
- **We say no to customers, not only to requirements.** A deal that requires mostly bespoke work is not a customer at
  any price.

**How we expand**
- **Sector density before sector breadth.** Reuse is highest within a sector, so the second customer should be another
  food manufacturer. Density is a margin decision, not a marketing preference.
- **Inside the account:** second use case → second site → deeper autonomy. One connected model, many deployments.
- **Then repeatable distribution:** sector playbooks, references, partnerships.

**The FDE sequence**
`Gate → Discovery (observe the real process, not the documented one) → Use-case lock (one controllable lever) →
Build with evaluations → Prove against the customer's baseline → Controlled production → Retro & productize`
**Every engagement must yield reusable capability** — a connector, an ontology pattern, an agent template, or an
evaluation set. An FDE is accountable for two things, both required: the loop went live and produced measured value,
**and** the deployment left the product stronger.

**Visual**
The seven-stage FDE pipeline left to right, with the gate as a physical barrier at the front and a feedback arrow
from *Retro & productize* back into the platform. Mark the current design partner's position at **Discovery**.

**Say it like this**
"We go inside the operation because what we need doesn't exist in writing anywhere — it exists in the systems, the
exceptions, and the people. That's expensive and it's the only way in. What makes it a product strategy rather than a
services strategy is the last stage: every engagement has to leave reusable capability behind, and the engineer is
measured on that as much as on the customer outcome. A deployment that delights a customer and contributes nothing
reusable is a consulting engagement that happened to succeed."

**Evidence status** — GTM method and FDE SOP: **Verified** as adopted process (SOP still marked draft/under review).
Effectiveness at generating repeatable pipeline: **unproven** — one engagement so far.

---

# Slide 10 — Competition & advantage

**Headline**
**The alternatives are real and well-funded. Our bet is not "AI agents for factories" —
it's authority, verified closure, and reuse compounding faster in the Gulf than anyone can replicate remotely.**

**On the slide**

| Alternative | What they are | Where the gap is for our customer |
| --- | --- | --- |
| **Palantir** (Foundry Ontology + AIP) | The reference architecture for modelling the operational world across fragmented data, logic and actions, with production AI workflows on top | Proves the value and the difficulty. Priced, scoped and staffed for a different customer than a Saudi mid-market food group. |
| **Industrial agent companies** (e.g. Juna AI — Factory Graph, production agents) | Agentic factory operating software; specialized production agents acting on industrial problems | Validates the direction. Built around the production process; not around the organization's authority structure, approvals and human accountability. Not Gulf-native. |
| **Industrial AI suites** (e.g. SymphonyAI Industrial) | Plant insights, workflow intelligence, digital twins, predictive asset intelligence, factory agents | Strong analytics and asset depth. The cross-boundary coordination work — the chasing, the approving, the verifying — remains human. |
| **Consultancies & systems integrators** | Discovery, recommendation, bespoke build | Nothing compounds into software. The customer pays again next time. |
| **Internal enterprise AI teams** | Build it themselves | Real, and the most common competitor. Constrained by talent, by the integration and security burden, and by the fact that this is not their product. |
| **Do nothing** | Keep stitching manually | The honest default, and the one we most often beat on measured cost of coordination. |

**Where our differentiation actually sits today**
1. **Authority as a first-class object.** Permitted / approval-required / prohibited, re-checked before dispatch;
   review distinct from approval; silence never consent. Most agent products treat permissions as configuration. In a
   plant it is the product.
2. **Verified closure, not task completion.** Resolved ≠ verified. Only evidence or an authorized waiver closes an
   outcome. "Unknown" survives contact with a fluent model.
3. **Honest uncertainty.** Stale, missing and conflicting data reduce confidence visibly. A forecast is a judgment —
   easy to state fluently and be wrong. We fail our own evaluation rubric for invented confidence.
4. **Gulf-native forward deployment.** Executive access, Arabic capability, knowledge of PDPL, NCA controls and
   procurement expectations, and engineers physically in the plant.
5. **The reuse engine.** Connectors, model templates, decision patterns, action libraries and evaluation sets
   accumulating per deployment, gated so they become common software rather than knowledge inside individuals.

**Said plainly**
> **These are positioning advantages, not yet defensibility.** Access explains the first meeting; it does not explain
> retention or expansion. Until deployment two passes the reuse test, we claim a mechanism and a test — not a right
> to win.

**Visual**
A 2×2: *depth of operational model* × *governed action vs. analytics only*, with Loura's target position and the
named alternatives placed. The "not yet defensibility" line stays on the slide, not just in the notes.

**Say it like this**
"I won't tell you we have a moat, because we don't yet. What we have is a specific theory of where one comes from:
if every deployment leaves behind connectors, model templates, decision patterns and evaluation sets that the next
one starts from, then deployment five is cheap and a competitor's deployment one isn't. That's testable, and the test
is deployment two. Until it passes, treat the moat as a hypothesis — I do."

**Evidence status** — Competitor descriptions: **Verified** from public product documentation. Differentiation:
**Hypothesis** — explicitly recorded internally as positioning, not demonstrated defensibility.

---

# Slide 11 — Team

**Headline**
**A team that has built enterprise product, deployed forward at Palantir, and already pivoted this company
once — decisively, with the capital intact.**

**On the slide**

| Person | Owns |
| --- | --- |
| **Hashim** | Commercial coherence, pricing, executive sponsorship, the customer relationship |
| **Rawaf** | Product — and explicitly accountable for converting field learning into the platform so the company does not drift into consultancy. Named tiebreaker on product scope and delivery commitment. |
| **Lamis** | The engagement outcome: discovery, redesign, proof of value, deployment, customer metrics |
| **Andrej** | Technical architecture and OT/IT integration leadership. **Five years at Palantir.** Currently fractional; intent is to convert to full-time. |
| **Ziyad** | OT/IT connectors and integration execution |
| **Turki** | Commercial and value analysis, post-deployment enablement |

**Why this team**
- **Enterprise product and operating experience** from Tamara; **forward-deployed engineering experience** from
  Palantir. We are not learning what an FDE organization is from a blog post.
- **We pivoted once, correctly and early.** We concluded the trade-credit model had no structural advantage and no
  ceiling worth years, and we moved while the team was small and **most of the capital was still intact** —
  ~$809.7K preserved. That is the decision this team should be judged on so far.
- **Hiring standard is deliberately high.** 40+ engineering candidates interviewed in one month, 10 to final stage,
  a live working project before any offer. The technical core is being rebuilt around staff-level founding engineers
  and a product designer.
- **We built the discipline before we needed it.** The evidence legend, the productization gate, the bespoke expiry
  rule, the FDE rotation requirement, the self-imposed NO-GO on our own design partner. That's the artefact of how
  this team works.

**The risk we name ourselves**
> **Bandwidth.** A very small group is inventing a category, doing field discovery, integrating industrial systems,
> building the core product, recruiting, and establishing enterprise-grade governance at the same time. Exceptional
> product engineers, industrial integration talent and field operators remain the binding constraint.

**Visual**
Six photos with one-line ownership each. Beneath: two logos — Tamara, Palantir. Footer: the named risk, in plain type.

**Say it like this**
"The decision I'd point at is the pivot. We had a lending business, we concluded we had no structural advantage in
it, and we stopped — early enough that eight hundred thousand dollars was still in the bank. And we're honest about
the constraint: we're a very small team attempting something with a lot of surface area. Engineering hiring is the
thing most likely to determine our pace."

**Evidence status** — Roles and backgrounds: **Verified** internally. Andrej is **fractional** — do not imply
full-time. Cash figure is the **June 2026 snapshot** and must be refreshed before this slide is shown.

---

# Slide 12 — Milestones: where we are vs. the long-term vision

**Headline**
**Bottom-up: one workflow, one plant, one measured result, then reuse. Top-down: the layer that
holds an organization together as one connected thing. The investment case is whether the first compounds into the second.**

**On the slide**

**Where we are — now**
✅ Pivot complete; platform prototype running; five capability areas; Level 3/4 autonomy
✅ Reuse demonstrated at prototype level — second activity, no new code
✅ Design partner engaged; operating flow analysed; field discovery **GO**
🔲 Intervention/build gate **NO-GO** — evidence does not yet support selecting an intervention
🔲 0 paying customers · 0 production deployments · 0 recurring revenue

**The proof path — in order, no skipping**
| # | Milestone | What it proves |
| --- | --- | --- |
| 1 | **Lock the first use case and baseline** — one named KPI, one numeric baseline, one accountable customer owner | The problem is real and measurable |
| 2 | **Complete data access** — reliable enough for repeatable evaluation | It is buildable |
| 3 | **Win against the baseline in evaluation** — materially better than the current process, without unacceptable failure or override rates | It works |
| 4 | **Reach controlled production** — real users rely on it inside the workflow, under explicit governance | They'll use it |
| 5 | **Convert to a paid engagement** | They'll pay for an outcome, not an experiment |
| 6 | **Demonstrate economic value** — translate the KPI into throughput, downtime, quality, working capital, labour or delivery | It's worth what we charge |
| 7 | **Repeat** — same core capability, second use case, site or customer | It's a product |
| 8 | **Measure productization** — reusable share, deployment hours, time-to-value, support load, gross margin | The engine works |
| 9 | **Establish recurring revenue and expansion** | It's a business |
| 10 | **Then, and only then, broaden** — second sector, government, GCC | Earned by transferable capability, not narrative |

**The long-term vision**
> AI changes the architecture of the enterprise. If software can carry persistent agency, organizations no longer need
> people to manually bridge every transition between systems, functions and decisions. **The system that maintains a
> live model of operational reality, understands authority, coordinates action, verifies outcomes and learns across
> those loops becomes a new layer of organizational infrastructure** — beginning in a Saudi food plant, and ending
> wherever coordination across entities, systems and authorities is mission-critical.

**The question we think you should hold us to**
> **Can Loura turn difficult, customer-specific operational reality into reusable software fast enough that every
> deployment increases product leverage rather than services dependence?**

**Visual**
A single horizontal path: **one workflow → one plant → measured result → reuse → sector → government → the layer.**
Mark today's position honestly, near the start. Beneath it, the diligence question in large type.

**Say it like this**
"The small version of this company is an industrial AI deployment business that helps factories coordinate one
workflow better. That's a real business and it isn't the reason to be interested. The large version is that the layer
holding an organization together stops being human attention. We're trying to get there from the bottom, and the
whole case rests on whether the bottom-up evidence compounds. The question at the end of this slide is the one I'd
ask if I were you, and it's the one we manage against internally."

**Evidence status** — Current position: **Verified**. Proof path: **Verified** as the adopted internal sequence.
The vision: **Thesis** — architectural ambition and research direction, explicitly not a claim about today's product.

---

## Appendix — hold in reserve, bring out if asked

**A1 · Capital position** *(June 2026 snapshot — MUST be refreshed before use)*
~$1M raised at a $5M post-money cap, closed before the pivot · ~$809.7K cash on hand · ~$133K signed but unwired
(excluded from runway) · ~$21.2K June burn · ~$43.9–48K expected burn after planned hires · 16–18 months runway at
planned burn. Cayman holdco incorporation status to be confirmed.

**A2 · The design partner use case in detail**
Demand signal → material requirement → readiness assessment → exception coordination → verified readiness or
escalation. Readiness states: **Ready · At risk · Blocked · Unknown**. Work-item lifecycle:
Detected → Investigating → Action required → Waiting → Resolved → Verified → Closed. Confirmed operating facts:
3–6 months consumption history reviewed (sometimes 12); fast-moving / critical / slow-moving material classes;
item-level minimum stock reviewed monthly; large or unusual orders are the trigger for cross-functional coordination;
purchase authority changes with value; Quality can accept, reject or partially accept; Warehouse verifies condition at
Production handoff.

**A3 · The six prototype scenarios**
A — large-order readiness (golden path) · B — missing information stays Unknown and asks a precise question ·
C — supply delay recalculates and proposes recovery · D — approval-dependent recovery routes a bounded request and
does not mark it approved · E — quality rejection after apparent readiness removes usable supply and routes supplier
work to Purchasing · F — verified recovery shows the full path from detection to result.

**A4 · What is deliberately excluded from Release 1**
Reviewer replacement · recursive delegation · automatic semantic merging · connector marketplace · customer
self-service authoring · visual builders · external guests and cross-organization sharing · Arabic/RTL UI · mobile ·
enterprise SSO · agents expanding their own authority · agents directly controlling machinery.

**A5 · Principal risks, as we state them internally**
Product risk (building the abstract platform before a narrow workflow produces hard ROI) · the services trap ·
integration and security burden in fragmented ERP/MES/SCADA/historian stacks · workflow-selection risk · buyer and
budget risk (interest ≠ willingness to pay) · competitive convergence · architecture overreach · team bandwidth.

**A6 · Why Aramco specifically**
The coordination problem on Slide 2 is not a mid-market phenomenon — it scales with the number of systems, functions
and authorities an event crosses, which makes it most expensive in the largest industrial organizations and their
supplier ecosystems. Loura's expansion path (Horizon 3: work spanning many entities, systems and authorities, with
policy, authority and a traceable record) is the same shape as that environment. *Develop this slide with Hashim
before the meeting — it should reflect the actual strategic conversation, not a generic relevance claim.*
