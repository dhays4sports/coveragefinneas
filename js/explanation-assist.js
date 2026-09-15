(function (root, factory) {
  'use strict';
  const api = factory();
  root.CoverageFitExplanationAssist = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:explanation-assist-ready', {
      detail: { version: api.VERSION, schemaVersion: api.SCHEMA_VERSION }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = '1.0';

  const TOPIC_GUIDES = Object.freeze([
    Object.freeze({
      id: 'roof', match: /\broof\b|roofing|settlement schedule/,
      meaning: 'Roof claims can use different settlement methods, deductibles, age schedules, and documentation rules.',
      why: 'Those terms can materially change what the homeowner pays and how much an otherwise covered roof loss may reimburse.',
      checks: Object.freeze(['Confirm roof age, material, condition, and recent updates.', 'Confirm the roof settlement method, applicable deductible, age schedule, exclusions, and documentation requirements.'])
    }),
    Object.freeze({
      id: 'water', match: /\bwater\b|\bbackup\b|\bsewer\b|\bdrain\b|\bleak\b|\bseepage\b|\bsump\b/,
      meaning: 'Water losses are not handled as one category; sudden discharge, backup, seepage, hidden leaks, and mitigation requirements can have different terms.',
      why: 'A homeowner can believe “water is covered” while a specific cause, limit, deductible, or protective-device requirement changes the claim outcome.',
      checks: Object.freeze(['Identify the water event the homeowner is concerned about.', 'Confirm covered causes, backup or drain limits, deductibles, exclusions, and any mitigation-device requirements.'])
    }),
    Object.freeze({
      id: 'deductible', match: /deductible|out.of.pocket|financial readiness/,
      meaning: 'The deductible is the homeowner’s share of a covered loss, and more than one deductible may apply depending on the cause of loss.',
      why: 'A deductible can reduce premium but still leave the homeowner with an amount they cannot comfortably fund when a loss occurs.',
      checks: Object.freeze(['Confirm the standard deductible and every separate peril-specific deductible.', 'Compare the largest potential out-of-pocket amount with the homeowner’s stated financial comfort.'])
    }),
    Object.freeze({
      id: 'ordinance-law', match: /ordinance|building code|code upgrade|law coverage/,
      meaning: 'A covered repair can trigger current building-code requirements that go beyond replacing only the visibly damaged property.',
      why: 'Code-required electrical, plumbing, structural, or safety work may add meaningful rebuilding cost that is treated separately under the policy.',
      checks: Object.freeze(['Confirm the ordinance-or-law coverage structure and limit.', 'Confirm covered triggers, excluded work, demolition treatment, and carrier form wording.'])
    }),
    Object.freeze({
      id: 'rebuilding', match: /dwelling|rebuild|rebuilding|replacement estimate|coverage a|extended replacement/,
      meaning: 'The dwelling amount is intended to reflect rebuilding cost using current property details, not the home’s market price.',
      why: 'Outdated square footage, features, renovations, or construction costs can make the rebuilding estimate less useful after a major loss.',
      checks: Object.freeze(['Confirm square footage, construction type, quality, attached features, renovations, and local rebuilding assumptions.', 'Confirm the dwelling limit, estimator inputs, extended-replacement terms, conditions, and maximum available amount.'])
    }),
    Object.freeze({
      id: 'personal-property', match: /personal property|belonging|contents|valuable item|jewelry|collection/,
      meaning: 'Belongings may be settled using replacement cost or depreciated value, while certain categories can have special limits.',
      why: 'The valuation method and category limits can affect whether the homeowner can replace everyday belongings and higher-value items after a loss.',
      checks: Object.freeze(['Confirm the personal-property valuation basis and overall limit.', 'Review special limits, scheduled items, exclusions, and whether an inventory or appraisal is needed.'])
    }),
    Object.freeze({
      id: 'loss-of-use', match: /loss of use|additional living|temporary housing|recovery expense/,
      meaning: 'Loss-of-use protection can help with eligible added living costs when a covered loss makes the home unfit to live in.',
      why: 'The amount, time period, covered trigger, and eligible expenses affect whether the household can maintain a workable living arrangement during repairs.',
      checks: Object.freeze(['Confirm household needs, likely temporary-housing costs, and any special accessibility or pet considerations.', 'Confirm the limit, time period, covered trigger, eligible expenses, and form-specific restrictions.'])
    }),
    Object.freeze({
      id: 'pool-liability', match: /pool|spa|trampoline|attractive nuisance/,
      meaning: 'Certain property features can increase the chance or severity of an injury allegation involving the premises.',
      why: 'Household use, guests, safeguards, and carrier requirements can affect both the liability discussion and underwriting eligibility.',
      checks: Object.freeze(['Confirm who uses the feature, supervision, fencing, gates, alarms, and other safeguards.', 'Confirm carrier eligibility, required safeguards, exclusions, liability limits, and umbrella coordination.'])
    }),
    Object.freeze({
      id: 'umbrella', match: /umbrella|excess liability/,
      meaning: 'An umbrella may add liability protection above qualifying underlying policies, but it is not automatically appropriate for every household.',
      why: 'Assets, income, drivers, properties, activities, and risk tolerance determine whether an additional liability layer is worth evaluating.',
      checks: Object.freeze(['Confirm all drivers, vehicles, properties, watercraft, rentals, household activities, and financial exposures.', 'Confirm required underlying limits, eligible policies, exclusions, retained limits, and carrier availability.'])
    }),
    Object.freeze({
      id: 'liability', match: /liability|lawsuit|injury exposure|financial exposure/,
      meaning: 'Personal liability protection responds to certain allegations that the homeowner or household caused injury or property damage to someone else.',
      why: 'The appropriate discussion depends on the household’s assets, income, property features, drivers, activities, and comfort with financial exposure.',
      checks: Object.freeze(['Confirm current household members, assets, income, drivers, properties, pets, and higher-risk activities.', 'Confirm the liability limit, covered locations and insureds, exclusions, defense provisions, and umbrella options.'])
    }),
    Object.freeze({
      id: 'separate-hazards', match: /earthquake|flood|separate hazard|separate peril|wildfire|land movement/,
      meaning: 'Some causes of loss may be excluded, limited, or handled through a separate policy rather than the standard home form.',
      why: 'The homeowner needs to understand the uncovered or separately insured exposure before deciding whether the available tradeoffs fit their priorities.',
      checks: Object.freeze(['Confirm the property-specific hazard and the homeowner’s concern or tolerance.', 'Confirm standard-policy exclusions, separate-policy availability, limits, deductibles, waiting periods, and carrier eligibility.'])
    }),
    Object.freeze({
      id: 'property-use', match: /occupancy|home use|household change|property change|life event|rental|home business|trust|ownership/,
      meaning: 'Changes in who lives at the property, how it is used, or how it is owned can affect the assumptions behind the current policy.',
      why: 'An otherwise reasonable policy may need review when occupancy, renovations, rentals, business activity, household members, or ownership changes.',
      checks: Object.freeze(['Confirm occupancy, household members, ownership, renovations, rentals, business use, and recent major purchases.', 'Confirm named-insured requirements, eligible occupancy, endorsements, exclusions, and underwriting action with the carrier.'])
    }),
    Object.freeze({
      id: 'other-structures', match: /detached structure|other structure|outbuilding|accessory structure|adu/,
      meaning: 'Detached structures and their use may be addressed separately from the main dwelling.',
      why: 'Size, value, occupancy, business use, or rental use can change the limit and underwriting questions that matter.',
      checks: Object.freeze(['Confirm each structure’s size, value, construction, condition, occupancy, and use.', 'Confirm the available limit, eligible use, exclusions, endorsements, and underwriting requirements.'])
    }),
    Object.freeze({
      id: 'general', match: /.*/,
      meaning: 'This assessment finding identifies a protection detail worth discussing; it is not itself a policy conclusion.',
      why: 'Clarifying the homeowner’s need and the current policy terms helps the producer decide whether any change should be evaluated.',
      checks: Object.freeze(['Confirm the homeowner’s current situation, concern, and preferred tradeoff.', 'Confirm applicable limits, deductibles, endorsements, exclusions, eligibility, and carrier form wording.'])
    })
  ]);

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function normalized(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function unique(values) {
    const seen = new Set();
    return (values || []).map(value => text(value)).filter(value => {
      const key = normalized(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function sourceFor(snapshot, item) {
    const recommendations = Array.isArray(snapshot?.recommendations) ? snapshot.recommendations : [];
    return recommendations.find(source => text(source?.id) === text(item?.findingId)) ||
      recommendations.find(source => normalized(source?.title) === normalized(item?.title)) || {};
  }

  function guideFor(item, source) {
    const key = normalized([
      source?.questionKey,
      source?.category,
      source?.title,
      item?.title,
      item?.findingType
    ].filter(Boolean).join(' '));
    return TOPIC_GUIDES.find(guide => guide.match.test(key)) || TOPIC_GUIDES[TOPIC_GUIDES.length - 1];
  }

  function readiness(item) {
    if (item?.verified !== true) return { state: 'verify-first', label: 'Verify first' };
    if (text(item?.decision, 'undecided') === 'undecided') return { state: 'ready-to-discuss', label: 'Ready to discuss' };
    return { state: 'judgment-recorded', label: 'Judgment recorded' };
  }

  function coachingNote(item) {
    const decision = text(item?.decision, 'undecided');
    if (item?.verified !== true) return 'Describe this as an assessment question, not a confirmed coverage gap. Resolve the facts and policy language before advising.';
    if (decision === 'recommend') return 'Connect the verified need to the carrier-quote request. Present final terms only after the carrier confirms availability and wording.';
    if (decision === 'consider') return 'Explain the tradeoff neutrally, then let the homeowner describe the outcome and cost balance they prefer.';
    if (decision === 'defer') return 'Name what is being deferred, why it is not being decided today, and when the topic should be revisited.';
    if (decision === 'not_recommended') return 'Explain the verified reasoning neutrally and record what future change would justify reviewing the topic again.';
    return 'Keep the explanation educational. Discuss the verified facts and homeowner preference before selecting a professional judgment.';
  }

  function talkTrack(item, guide) {
    const title = text(item?.title, 'this protection topic');
    const closing = item?.verified === true
      ? 'I’ll connect what we confirmed to the options available in the formal carrier quote before we decide whether anything should change.'
      : 'Let’s verify the current policy and your priorities before we decide whether anything should change.';
    return `I want to pause on ${title}. ${guide.meaning} ${guide.why} ${closing}`;
  }

  function explainItem(snapshot, item) {
    const source = sourceFor(snapshot, item);
    const guide = guideFor(item, source);
    const ready = readiness(item);
    const evidencePrompt = text(item?.evidencePrompt || source?.evidencePrompt || source?.conversationStarter);
    const verification = unique([
      evidencePrompt ? `Resolve the assessment evidence: ${evidencePrompt}` : '',
      ...guide.checks,
      'Use the current declarations, endorsements, carrier forms, underwriting guidance, and formal quote before presenting final terms.'
    ]).slice(0, 4);
    return {
      id: `explanation-${text(item?.findingId || item?.id, 'finding')}`,
      findingId: text(item?.findingId || item?.id),
      title: text(item?.title, 'Protection topic'),
      topic: guide.id,
      issue: text(item?.detail || source?.explanation, guide.meaning),
      whatItMeans: guide.meaning,
      whyItMatters: guide.why,
      talkTrack: talkTrack(item, guide),
      verification,
      coachingNote: coachingNote(item),
      readiness: ready.state,
      readinessLabel: ready.label,
      verified: item?.verified === true,
      decision: text(item?.decision, 'undecided'),
      evidenceQuality: text(item?.evidenceQuality || source?.evidenceQuality, 'confirmed'),
      guardrail: 'Educational coaching only. The licensed producer controls the recommendation; carrier forms, underwriting, and the issued policy control final terms.'
    };
  }

  function build(snapshot, recommendationPlan) {
    const items = Array.isArray(recommendationPlan?.items) ? recommendationPlan.items : [];
    if (text(snapshot?.state, 'empty') !== 'ready' || !items.length) {
      return {
        schemaVersion: SCHEMA_VERSION,
        assistVersion: VERSION,
        state: 'empty',
        consultationId: text(snapshot?.consultation?.id),
        items: [],
        summary: { total: 0, verifyFirst: 0, readyToDiscuss: 0, judgmentRecorded: 0 },
        diagnostics: { valid: false, warnings: ['A ready Workspace snapshot and ranked recommendation findings are required.'] }
      };
    }
    const explained = items.map(item => explainItem(snapshot, item));
    const summary = {
      total: explained.length,
      verifyFirst: explained.filter(item => item.readiness === 'verify-first').length,
      readyToDiscuss: explained.filter(item => item.readiness === 'ready-to-discuss').length,
      judgmentRecorded: explained.filter(item => item.readiness === 'judgment-recorded').length
    };
    return clone({
      schemaVersion: SCHEMA_VERSION,
      assistVersion: VERSION,
      state: summary.verifyFirst ? 'verification-needed' : 'ready',
      consultationId: text(snapshot?.consultation?.id),
      items: explained,
      summary,
      diagnostics: { valid: true, warnings: [] }
    });
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    TOPIC_GUIDES,
    build
  });
});
