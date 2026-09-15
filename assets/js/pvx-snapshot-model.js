(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXSnapshotModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const VERSION = '2.1.0', BUILD = 'CF-TECH-PVX-UX-1.0', READINESS_BUILD = 'CF-PVX-READY-1.1';
  const CONTRACT_ID = 'coveragefit-discovery-only-snapshot-v2', MAX_CONTEXT_CHIPS = 4, MAX_TOPICS = 3;
  const LABELS = Object.freeze({
    shoppingReason: { renewal_increase: 'Your renewal price changed', buying_home: 'You are buying a home', service_change: 'You want a different service experience', life_change: 'Something changed in your life', comparison: 'You are comparing options', something_else: 'You have another reason for reviewing' },
    improvementPriorities: { understanding: 'Understand what you have', claim_support: 'Feel supported in a claim', agent_access: 'Reach your agent more easily', coordination: 'Coordinate your insurance', price_only: 'Keep price central', not_sure: 'Still deciding what to improve' },
    ownershipDuration: { buying_now: 'Buying the home now', under_1: 'Owned less than a year', '1_4': 'Owned 1–4 years', '5_9': 'Owned 5–9 years', '10_plus': 'Owned 10+ years' },
    stayIntent: { long_term: 'Planning to stay long term', few_years: 'Likely staying a few years', may_move: 'May move soon' },
    upgradeSummary: { yes_major: 'Meaningful improvements made', some: 'Some improvements made', none: 'No significant updates' },
    otherProperties: { rental: 'Also owns a rental', second_home: 'Also owns a second home', multiple: 'Owns multiple other properties', none: 'No other properties' },
    claimExperience: { yes_smooth: 'Prior claim went smoothly', yes_difficult: 'Prior claim was difficult', yes_neutral: 'Prior claim experience', none: 'No prior claims reported' },
    annualMileage: { under_5k: 'Drives under 5,000 miles a year', '5k_10k': 'Drives about 5,000–10,000 miles', '10k_15k': 'Drives about 10,000–15,000 miles', over_15k: 'Drives more than 15,000 miles' },
    vehicleCount: { only_vehicle: 'One vehicle', two_vehicles: 'Two vehicles', three_plus: 'Three or more vehicles', changing: 'Adding or replacing a vehicle' },
    drivers: { just_me: 'Only driver', partner: 'Spouse or partner also drives', household: 'Other household drivers', young_driver: 'Younger driver in the household', other: 'Another regular driver' },
    liabilityKnowledge: { know: 'Knows current liability limits', roughly: 'Roughly knows current limits', not_sure: 'Current liability limits are not known yet' },
    renterProperty: { apartment: 'Rents an apartment or condo', house: 'Rents a house or townhome', room: 'Rents a room or shared home', other: 'Another rental setup' },
    renterPriorities: { belongings: 'Wants to understand belongings protection', liability: 'Wants to understand personal liability', valuable_items: 'Has valuable items or work equipment in mind', bundle: 'Interested in renters and auto together' }
  });
  const CONTEXT_KEYS = Object.freeze({
    home: ['ownershipDuration', 'stayIntent', 'upgradeSummary', 'otherProperties', 'claimExperience'],
    buyer: ['ownershipDuration', 'stayIntent', 'upgradeSummary', 'otherProperties', 'claimExperience'],
    auto: ['annualMileage', 'vehicleCount', 'drivers', 'liabilityKnowledge'],
    bundle: ['ownershipDuration', 'upgradeSummary', 'annualMileage', 'vehicleCount', 'drivers'],
    renter: ['renterProperty', 'renterPriorities']
  });
  const CONTEXT_HEADINGS = Object.freeze({ home: 'What you told us about the home', buyer: 'What you told us about the home purchase', auto: 'What you told us about your driving', bundle: 'What you told us about home + auto', renter: 'What you told us about your renter review' });
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const fact = (key, value, label) => ({ key, value, label, evidenceRef: { source: 'pvx_discovery', key, value, status: 'customer-reported' } });
  const labelFor = (group, value) => LABELS[group]?.[value] || '';
  const normalizeTrack = value => ['home', 'buyer', 'auto', 'bundle', 'renter'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'home';
  function professionalTopic(context = {}) {
    const professional = context?.professional || {};
    const roleLabel = String(professional.roleLabel || '').trim().slice(0, 120);
    if (professional.active !== true || professional.program !== 'technology' || !roleLabel) return null;
    return {
      topicKey: 'professional_discount_eligibility',
      label: 'Professional discount eligibility',
      becauseYouToldUs: `You told us your technology role is ${roleLabel}.`,
      whyWorthReviewing: 'Some Farmers professional discount programs are occupation-based, so this is worth verifying.',
      whatDylanWouldWantToUnderstand: 'Dylan will confirm whether your role and the policy being reviewed meet the current eligibility rules.',
      evidenceRefs: [{ source:'408farmers_web', key:'professional_role', value:professional.role || roleLabel, label:roleLabel, status:'customer-reported' }],
      ruleIds: ['pvx-topic-professional-tech-1'], confidence: 'high', status: 'worth_reviewing',
      policyFinding: false, recommendation: false, recommendedLimit: null, currentPolicyClaim: null
    };
  }
  function currentCoverageTopic(discovery = {}, context = {}) {
    if (context?.entry?.type !== 'snapshot') return null;
    const words = String(discovery?.exactCustomerWords?.shoppingReason || '').trim();
    return {
      topicKey: 'current_coverage_confirmation', label: 'Current coverage confirmation',
      becauseYouToldUs: words || 'You came here to review the coverage you have now.',
      whyWorthReviewing: 'Your policy details are what turn a general starting point into an evidence-based review.',
      whatDylanWouldWantToUnderstand: 'Your dwelling, water backup, deductible, liability, and umbrella starting points.',
      evidenceRefs: [{ source:'408farmers_web', key:'snapshot_entry', value:'current_coverage_review', status:'customer-reported' }],
      ruleIds:['pvx-topic-current-coverage-1'], confidence:'high', status:'worth_reviewing',
      policyFinding:false, recommendation:false, recommendedLimit:null, currentPolicyClaim:null
    };
  }
  function derive(discovery = {}, topics = [], context = {}) {
    const productTrack = normalizeTrack(discovery.productTrack), answers = discovery.answers || {}, words = discovery.exactCustomerWords || {};
    const whyLabel = words.shoppingReason || labelFor('shoppingReason', answers.shoppingReason);
    const priorityValues = Array.isArray(answers.improvementPriorities) ? answers.improvementPriorities : [];
    const improvements = priorityValues.map(value => ({ value, label: labelFor('improvementPriorities', value) })).filter(item => item.label);
    const coverageContext = (CONTEXT_KEYS[productTrack] || CONTEXT_KEYS.home).map(key => {
      const value = answers[key], label = labelFor(key, value); return label && !['prefer_not', 'not_sure'].includes(value) ? fact(key, value, label) : null;
    }).filter(Boolean).slice(0, MAX_CONTEXT_CHIPS);
    const seen = new Set();
    const evidenceTopics = (Array.isArray(topics) ? topics : []).filter(topic => topic?.status === 'worth_reviewing' && topic?.evidenceRefs?.length && topic.recommendation === false)
      .filter(topic => { const key = String(topic.topicKey || ''); if (!key || seen.has(key)) return false; seen.add(key); return true; })
      .map(topic => clone(topic));
    const professional = professionalTopic(context), currentCoverage = currentCoverageTopic(discovery, context);
    let selected = evidenceTopics.slice(0, MAX_TOPICS);
    if (currentCoverage && !selected.some(topic => topic.topicKey === currentCoverage.topicKey)) selected = [currentCoverage, ...selected].slice(0, MAX_TOPICS);
    if (professional) selected = [...selected.filter(topic => topic.topicKey !== professional.topicKey).slice(0, MAX_TOPICS - 1), professional];
    const safeTopics = selected.map((topic, index) => ({ ...topic, scanOrder: index + 1, scanLabel: String(index + 1).padStart(2, '0') }));
    const topicCount = safeTopics.length, whyNowThread = root.CoverageFitPVXWhyNow?.derive?.(discovery) || null, triggerNarrative = root.CoverageFitPVXTriggerNarrative?.derive?.(whyNowThread, safeTopics[0] || null) || null;
    return {
      schemaVersion: '2.0', contractId: CONTRACT_ID, reportRevision: '1', title: 'Your CoverageFit Snapshot', generatedAt: new Date().toISOString(), anonymousPreview: true, productTrack,
      contextHeading: CONTEXT_HEADINGS[productTrack], whyReviewing: whyLabel ? fact('shoppingReason', answers.shoppingReason, whyLabel) : null, whyNowThread, triggerNarrative,
      wantsToImprove: improvements.map(item => fact('improvementPriorities', item.value, item.label)), coverageContext, homeContext: coverageContext,
      whatSeemsImportant: improvements.map(item => item.label).slice(0, 3), whatDylanWouldLookAtFirst: safeTopics,
      signalSurface: { topicCount, countLabel: topicCount === 0 ? 'Your starting point is ready' : `${topicCount} ${topicCount === 1 ? 'thing' : 'things'} worth reviewing`, primaryTopic: safeTopics[0] || null, numberingMeaning: 'display_order_only' },
      policyFindings: [], recommendations: [], contactRequiredToView: false,
      guardrails: { discoveryOnly: true, currentPolicyEvaluated: false, policyDeficiencyFound: false, protectionScoreCreated: false, eligibilityDetermined: false, severityRanking: false, fakeActivity: false }
    };
  }
  function traceable(model) {
    const facts = [model.whyReviewing, ...(model.wantsToImprove || []), ...(model.coverageContext || model.homeContext || [])].filter(Boolean);
    const threadSafe = !model.whyNowThread || model.whyNowThread.evidenceRefs?.every(ref => ref.status === 'customer-reported');
    return threadSafe && facts.every(item => item.evidenceRef?.key && item.evidenceRef?.status === 'customer-reported') && (model.whatDylanWouldLookAtFirst || []).every(topic => topic.evidenceRefs?.length);
  }
  return Object.freeze({ VERSION, BUILD, READINESS_BUILD, CONTRACT_ID, MAX_CONTEXT_CHIPS, MAX_TOPICS, LABELS, CONTEXT_KEYS, CONTEXT_HEADINGS, labelFor, professionalTopic, currentCoverageTopic, derive, traceable });
});
