# CoverageFit North Star

**Document:** CF-NORTH-STAR-1.0  
**CoverageFit baseline:** v3.20.238  
**Status:** Product North Star / long-range architectural reference  
**Date:** 2026-09-13

## North Star

CoverageFit should ultimately become a **persistent consumer protection-intelligence platform**: a place where a person or household can understand what insurance protection they have, what has changed, what may deserve attention, and what useful action to take next.

The shorthand is:

> **Credit Karma for insurance protection — not a quote marketplace, not a generic CRM, and not merely a service portal.**

CoverageFit should earn an ongoing consumer relationship by providing useful, evidence-grounded protection intelligence first. Recommendations, producer involvement, product expansion, and transactional opportunities should follow from that utility rather than replace it.

## The long-term consumer loop

CoverageFit should evolve toward this recurring loop:

**Snapshot → Understand → Add Evidence → See What Changed → Consider Recommendations → Act → Monitor → Life Changes → Update → Reassess**

A consumer should be able to return months or years later and still recognize the same living protection profile rather than starting over.

## What CoverageFit should know over time

CoverageFit's Universal Customer Profile should gradually become a durable protection graph with distinct, governed domains.

### Household
- People and household relationships
- Dependents and relevant life-event context
- Contact preferences and consent
- Historical relationship with the agency / advisor

### Property and exposures
- Primary residence
- Condos / townhomes
- Rental and investment properties
- Vehicles
- Businesses and commercial exposures
- Other material insurable assets when explicitly provided

### Insurance
- Home / condo / landlord
- Auto
- Umbrella
- Life
- Commercial
- Other supported lines
- Carrier, term, limits, deductibles, key endorsements and renewal dates when evidence exists

### Protection evidence
- Uploaded declarations and policy documents
- Producer-verified recommendations
- SmartDevices / mitigation information
- Customer-reported changes
- Historical CoverageFit snapshots and revisions

### Opportunity history
- Why the customer entered
- What changed
- Recommendations made
- Decisions taken
- Policies ultimately bound / not bound
- Open and completed follow-up actions

## Two views of one underlying relationship

CoverageFit should support two projections from the same governed customer/opportunity state.

### Consumer view
The consumer should see only information that is useful, understandable, authorized, and appropriate for them:

- **Your CoverageFit**
- What is currently known
- What changed since the last review
- Upcoming renewals or relevant dates
- Evidence-backed areas worth reviewing
- Recommendations and open actions
- One useful next action at a time
- Secure ways to add/update evidence and request human help

The consumer should **not** see internal lead-priority constructs such as Fit, Intent, Value, producer queue labels, opportunity economics, suppression states, internal notes, or underwriting workflow details.

### Producer / agency view
The producer should see the richer operational projection needed to allocate scarce human attention:

- Universal Customer Profile
- Opportunities and source history
- Fit / Intent / Value (FIV)
- Small Ball queue
- Next Best Action (NBA)
- Assignments, tasks and blockers
- Documents and evidence
- Recommendations and client responses
- Opportunity cost / acquisition economics when available

This is the same relationship viewed for two different purposes.

## Current operating architecture

The product family should retain clear responsibilities.

### 408FARMERS — acquisition and intent capture
408FARMERS creates and routes possessions. It should remain lightweight, progressive and low-friction.

It may capture bounded contextual signals, but should not become the customer intelligence engine or CRM.

### CoverageFit — protection intelligence and orchestration
CoverageFit is the system that understands the relationship, preserves state, interprets evidence, prioritizes opportunities, explains what changed, and determines useful next actions.

### Policy.box — document intelligence
Policy.box should eventually extract structured, provenance-preserving insurance facts from declarations, proposals and related documents so CoverageFit can use evidence without forcing customers or producers to re-enter known information.

Policy.box should feed CoverageFit rather than become a competing CRM or customer profile.

### SmartDevices — physical protection intelligence
SmartDevices should provide governed protection / mitigation evidence and actionable device guidance where relevant.

It should feed CoverageFit's protection picture without claiming insurer acceptance or replacing underwriting decisions.

### Servicing layer — commodity policy service
ID cards, payments, routine policy servicing, carrier document retrieval and similar functions may be handled by carrier systems, a partner such as a GloveBox-like service, or a future dedicated layer.

CoverageFit does **not** need to recreate every commodity servicing function in order to achieve its North Star.

## The Small Ball operating layer

CoverageFit's near-term agency intelligence should continue to support the long-term consumer platform rather than diverge from it.

The agency-side operating chain is:

**Source → UCP → Opportunity → FIV → Queue → NBA → Assignee / Action**

### Fit
**Can the agency / available carrier path plausibly win this opportunity without disproportionate friction?**

Fit may consider product/class appetite, known operational friction, bundle fit, quote complexity and evidence-backed characteristics. It is a sales-priority signal, not an eligibility, underwriting, pricing or coverage determination.

### Intent
**How close is the customer to making a relevant decision?**

Examples include active shopping, renewal timing, verified nonrenewal, purchase/closing deadline, explicit contact request, appointment, document upload or recommendation response.

### Value
**How economically meaningful or relationship-expansive could the opportunity become?**

Examples include multiple products, bundle potential, multiple properties, commercial relationships, umbrella or life opportunities, and actual premium once verified.

Value describes the opportunity—not the worth of the person.

### Queue
FIV and other governed operational signals can place opportunities into queues such as:

- **SHOOT NOW** — high-priority producer attention
- **QUICK PLAY** — high-intent / easy-execution opportunity
- **DEVELOP** — attractive fit/value with later timing or missing development
- **NURTURE** — legitimate future opportunity
- **LOW PRIORITY** — known weak use of immediate producer time
- **UNCLASSIFIED** — insufficient evidence

### NBA
NBA answers a different question from FIV:

> **What exactly should happen next?**

Priority and next action must remain separate. Two opportunities in the same queue can have different NBAs.

## Opportunity cost is a first-class product concern

CoverageFit should eventually help answer not merely "what lead is next?" but:

> **Where is the next hour of qualified human attention most likely to be useful?**

Future measurement should distinguish:

- acquisition spend
- producer minutes consumed
- quote / preparation effort
- bound premium
- gross commission / revenue
- retention and expansion
- downstream products / relationships

A free lead is not economically free when it consumes scarce producer time without producing a viable opportunity.

The long-term optimization target should move toward **relationship value and useful revenue per producer hour**, not raw lead volume or vanity conversion metrics.

## Why the consumer North Star and agency intelligence belong together

The agency-side operating system is not a detour from the consumer vision. It creates the primitives the consumer platform will need:

- persistent identity and household state
- zero-repeat information reuse
- governed documents and evidence
- opportunity and recommendation history
- living state and change tracking
- producer review
- next-action orchestration
- protection / mitigation context

Today these capabilities help an advisor work more efficiently. Long term, the same underlying state should help the consumer understand and continuously manage protection.

## Future consumer concepts

CoverageFit may eventually support experiences such as:

### Your CoverageFit
A persistent, mobile-first protection home showing:
- connected / known policies
- recent changes
- upcoming renewals
- open recommendations
- areas worth reviewing
- one prioritized useful action

### Change intelligence
When evidence changes, CoverageFit should explain the delta truthfully:
- new or removed policy
- changed limit / deductible
- changed property / vehicle / household context
- new rental or business exposure
- new life event
- mitigation / SmartDevices update

### Life-event loops
A legitimate life event may create a reason to update CoverageFit and, when appropriate, a new opportunity:
- home purchase
- marriage / partnership change
- new child / dependent
- teen driver
- rental-property acquisition
- business start / ownership change
- significant remodel
- material asset or liability change

Life events should create useful review prompts, not manufactured urgency.

### Evidence-first recommendations
CoverageFit should increasingly distinguish:
- what the customer told us
- what documents show
- what a producer verified
- what a carrier / insurer actually confirmed

Recommendations should be traceable to evidence and should never masquerade as eligibility, approval, binding or carrier acceptance.

## Marketplace restraint

A future marketplace or comparison surface is possible, but it is **not the North Star itself**.

The correct order is:

1. Deliver immediate consumer utility.
2. Build a trustworthy, persistent protection profile.
3. Show evidence-backed changes and useful actions.
4. Earn repeat engagement.
5. Only then surface appropriate ways to act, compare, or purchase.

CoverageFit should not become a disguised lead-generation marketplace where every insight is merely a pretext to sell another product.

## What CoverageFit is not

CoverageFit should resist becoming:

- a generic CRM with insurance branding
- a carrier quoting engine
- a replacement for official carrier policy systems
- a giant intake questionnaire
- an ID-card / billing portal as its primary purpose
- a black-box lead score
- an underwriting or eligibility decision engine
- a consumer risk score that implies objective safety or insurability
- a marketplace before consumer value is established
- a collection of disconnected microsites and features

## Product principles

Future CoverageFit work should preserve these principles.

### 1. Value before friction
Show a useful result as early as truthfully possible. Do not require deep intake before earning the next step.

### 2. Never restart the possession
Reuse compatible information across 408FARMERS, CoverageFit, Policy.box, SmartDevices, appointments and producer workflows.

### 3. Known data should not become a question
Ask only for genuinely missing information needed for the next useful action.

### 4. Evidence over inference
Keep customer-reported, document-derived, producer-verified and carrier-confirmed facts distinct.

### 5. One useful next action
Prefer progressive reveal and a clear next step over dashboards full of equal-priority choices.

### 6. Human advice remains valuable
Automation should create advantage and context, not insert friction between a ready customer and a qualified human.

### 7. Consumer utility is not producer priority
Internal FIV / queue / economics must remain separate from consumer-facing guidance.

### 8. UNKNOWN is not LOW
Missing evidence must not silently become a negative judgment.

### 9. Sensitive traits are not opportunity-quality shortcuts
Do not use protected or highly sensitive characteristics to prioritize service, infer eligibility or value people. Acquisition targeting, underwriting and agency operations must stay within applicable legal, carrier and compliance boundaries.

### 10. Build the smallest durable primitive
Prefer reusable identity, evidence, state, source and action primitives over one-off flows.

## Product evolution

### Now — Advisor effectiveness
CoverageFit helps Dylan / producers:
- understand opportunities
- preserve context
- prioritize attention
- prepare recommendations
- reduce repeat work
- close and follow up more effectively

### Retail — Agency operating intelligence
CoverageFit helps a multi-person agency:
- maintain one customer / household context
- coordinate multiple opportunities
- assign work by role
- route FIV / NBA queues
- understand acquisition economics
- preserve organizational zero-repeat

### North Star — Consumer protection intelligence
CoverageFit helps consumers:
- understand their protection picture
- maintain a living record
- see what changed
- identify evidence-backed areas worth reviewing
- take useful actions
- involve a trusted advisor when human judgment is valuable

## North Star test for future work

Before adding a major feature, ask:

1. **Does this help the consumer understand or manage protection, or help the advisor create that value more efficiently?**
2. **Does it strengthen the durable customer / evidence / opportunity state?**
3. **Does it reduce repeated work or unnecessary friction?**
4. **Does it clarify what changed or what useful action comes next?**
5. **Is CoverageFit the correct system to own this capability?**
6. **Are we building the smallest durable primitive instead of prematurely recreating a carrier, CRM, servicing platform or marketplace?**
7. **Will this still make sense when CoverageFit serves many households, multiple producers and years of relationship history?**

If the answer to these questions is mostly no, the feature probably does not belong in CoverageFit.

## Canonical shorthand

When future product work needs a concise statement of direction, use:

> **CoverageFit is building a living protection profile for consumers and an intelligence layer for advisors. It should help people understand what they have, see what changed, know what deserves attention, and take the next useful action—without restarting the relationship every time.**

