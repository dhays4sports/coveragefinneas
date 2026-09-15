(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryRecommendationAnchorContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-recommendation-anchor-contract-ready', {
      detail: { version: api.VERSION, build: api.BUILD, contractId: api.CONTRACT_ID }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.3';
  const CONTRACT_ID = 'coveragefit-advisory-recommendation-anchor-v1';
  const ENGINE_ANCHOR_PREFIX = 'cfadv13-';
  const MAX_TEXT = 500;

  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const text = (value, limit = MAX_TEXT) => String(value ?? '').trim().slice(0, limit);
  const list = value => Array.isArray(value) ? value : [];
  const compact = value => text(value, 240).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const slug = value => text(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'topic';

  function contractApi() {
    if (root?.CoverageFitAdvisoryDiscoveryContract) return root.CoverageFitAdvisoryDiscoveryContract;
    if (typeof require === 'function') {
      try { return require('./advisory-discovery-contract.js'); } catch (_) { return null; }
    }
    return null;
  }

  function normalizeProfile(profile) {
    const contract = contractApi();
    return contract?.normalize ? contract.normalize(profile || {}) : clone(profile || {});
  }

  function uniqueEvidence(refs) {
    const seen = new Set();
    return list(refs).map(ref => ({
      source: text(ref?.source || 'unknown', 80),
      key: text(ref?.key || ref?.sourceKey || '', 180),
      label: text(ref?.label || ref?.question || '', 240),
      capturedAt: text(ref?.capturedAt || '', 40)
    })).filter(ref => ref.key || ref.label).filter(ref => {
      const identity = `${ref.source}|${ref.key}|${ref.label}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function normalizeRecommendation(item, index = 0) {
    if (!item || typeof item !== 'object') return null;
    const title = text(item.name || item.title || item.tag || item.category || item.recommendationKey, 180);
    if (!title) return null;
    const recommendationKey = text(item.recommendationKey || title, 160);
    return {
      recommendationKey,
      recommendationSourceId: text(item.ruleId || item.id || item.key || item.questionKey || '', 160),
      title,
      category: text(item.category || item.tag || '', 140),
      explanation: text(item.clientExplanation || item.explanation || item.insight || item.why || item.reason || '', MAX_TEXT),
      conversationStarter: text(item.conversationStarter || item.discussionQuestion || item.question || '', MAX_TEXT),
      priority: text(item.priority || item.impactLabel || item.impact || '', 100),
      index
    };
  }

  function normalizeRecommendations(items) {
    const seen = new Set();
    return list(items).map(normalizeRecommendation).filter(Boolean).filter(item => {
      const identity = compact(item.recommendationKey);
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function activeSignals(profile) {
    return list(profile?.customerSignals).filter(signal =>
      signal?.status === 'active' &&
      text(signal?.key, 160) &&
      uniqueEvidence(signal?.evidenceRefs).length > 0
    );
  }

  function signalByPrefix(signals, prefix) {
    return signals.find(signal => text(signal?.key, 160).startsWith(prefix)) || null;
  }

  function topicMatches(title, tokens) {
    const topic = compact(title);
    return tokens.some(token => topic.includes(compact(token)));
  }

  function homeCommitmentCopy(recommendation) {
    const topic = recommendation.title;
    return {
      becauseYouToldUs: 'You told us this is your primary home and you expect to stay there long term.',
      personalMeaning: 'Long-term ownership makes it useful to understand how this part of the policy would support the home you plan to keep.',
      whyThisFits: `${topic} is already on your CoverageFit review list, and your long-term connection to the home gives that discussion personal context.`,
      customerDiscussionPrompt: `Let’s confirm how ${topic.toLowerCase()} works today and whether it still fits a home you expect to keep long term.`,
      producerDiscussionPrompt: `Because you told me this is your primary home and you expect to stay there long term, I want to make sure we understand how ${topic.toLowerCase()} actually works before we make any tradeoff.`,
      buyInPrompt: 'Does that feel like the right area to protect deliberately for a home you plan to keep?'
    };
  }

  function vehicleDependencyCopy(recommendation) {
    const topic = recommendation.title;
    return {
      becauseYouToldUs: 'You told us this is your only vehicle and you depend on it every day.',
      personalMeaning: 'Being without the vehicle would affect your normal routine, so transportation continuity is personally relevant.',
      whyThisFits: `${topic} is already an eligible recommendation topic, and your daily dependence on the vehicle makes the transportation question more concrete.`,
      customerDiscussionPrompt: `Let’s compare how ${topic.toLowerCase()} would help you stay mobile if your vehicle were unavailable after a covered loss.`,
      producerDiscussionPrompt: `Because you told me this is your only vehicle and you use it every day, I want to look at ${topic.toLowerCase()} in terms of keeping you mobile—not just as another line item.`,
      buyInPrompt: 'Would keeping dependable transportation available be worth protecting here?'
    };
  }

  function tradeoffCopy(signal, recommendation) {
    const key = text(signal?.key, 160);
    const topic = recommendation.title;
    if (key === 'tradeoffPreference.price') {
      return {
        becauseYouToldUs: 'You told us keeping the cost down is your main priority.',
        personalMeaning: 'That means any added protection should earn its place rather than being included automatically.',
        whyThisFits: `${topic} is already on the review list, so the useful question is what protection it adds and whether that value is worth the cost to you.`,
        customerDiscussionPrompt: `Let’s look at ${topic.toLowerCase()} with the price impact visible so you can decide whether it earns its place.`,
        producerDiscussionPrompt: `Because you told me keeping the cost down matters most, I don’t want to just add ${topic.toLowerCase()}. I want to show you what you gain and what it costs so you can make the tradeoff deliberately.`,
        buyInPrompt: 'Is this an area you would rather protect more strongly, or keep leaner for price?',
        priceTradeoff: 'Start with the leanest appropriate option and make any protection given up for savings explicit.'
      };
    }
    if (key === 'tradeoffPreference.protection') {
      return {
        becauseYouToldUs: 'You told us protecting yourself as strongly as practical is your main priority.',
        personalMeaning: 'That gives us permission to compare stronger options first while still showing the cost and policy tradeoffs.',
        whyThisFits: `${topic} is already on the review list, so it makes sense to understand the stronger practical option before deciding where to economize.`,
        customerDiscussionPrompt: `Let’s compare the stronger practical approach to ${topic.toLowerCase()} and then look at the premium or deductible tradeoff.`,
        producerDiscussionPrompt: `Because you told me stronger practical protection matters most, I want to start by showing you the stronger way to handle ${topic.toLowerCase()} and then let you decide whether the cost tradeoff makes sense.`,
        buyInPrompt: 'Does starting with the stronger protection option feel right for you?',
        priceTradeoff: 'Show the stronger practical option first, together with its premium or out-of-pocket tradeoff; do not assume the customer must choose it.'
      };
    }
    return {
      becauseYouToldUs: 'You told us you want the right balance between price and protection.',
      personalMeaning: 'That means the recommendation should make the protection-versus-cost tradeoff visible instead of optimizing only one side.',
      whyThisFits: `${topic} is already on the review list, so it makes sense to compare what it changes in protection with the premium or out-of-pocket difference.`,
      customerDiscussionPrompt: `Let’s look at ${topic.toLowerCase()} in terms of both the protection it adds and the cost tradeoff.`,
      producerDiscussionPrompt: `Because you told me you want the right balance, I want to look at ${topic.toLowerCase()} in terms of what you gain and what it costs—not just automatically add or remove it.`,
      buyInPrompt: 'Does that feel like the right balance for how you want this policy built?',
      priceTradeoff: 'Compare the protection gained with the premium, deductible, or retained-risk tradeoff and let the customer choose deliberately.'
    };
  }

  const HOME_COMMITMENT_TOPICS = Object.freeze([
    'dwelling', 'rebuild', 'rebuilding', 'replacement', 'building-code', 'building code',
    'ordinance', 'temporary housing', 'loss of use'
  ]);
  const VEHICLE_DEPENDENCY_TOPICS = Object.freeze([
    'rental', 'transportation', 'substitute vehicle', 'replacement transportation'
  ]);

  function genericCopy(recommendation) {
    const topic = recommendation.title;
    return {
      becauseYouToldUs: '',
      personalMeaning: '',
      whyThisFits: recommendation.explanation || `${topic} was already identified by the established CoverageFit recommendation logic as a topic worth confirming during a licensed review.`,
      customerDiscussionPrompt: recommendation.conversationStarter || `Can we confirm how ${topic.toLowerCase()} works in the current policy?`,
      producerDiscussionPrompt: recommendation.conversationStarter || `Let’s confirm how ${topic.toLowerCase()} works in the current policy before making a recommendation.`,
      buyInPrompt: 'Does that feel like the right thing to review together?',
      priceTradeoff: ''
    };
  }

  function buildAnchor(profile, recommendation, options = {}) {
    const signals = activeSignals(profile);
    const timestamp = text(options.timestamp || options.createdAt, 40) || new Date().toISOString();
    const homeCommitment = signalByPrefix(signals, 'homeCommitment.high');
    const vehicleDependency = signalByPrefix(signals, 'vehicleDependency.high');
    const tradeoff = signalByPrefix(signals, 'tradeoffPreference.');

    let primarySignal = null;
    let primaryCopy = null;
    if (homeCommitment && topicMatches(recommendation.title, HOME_COMMITMENT_TOPICS)) {
      primarySignal = homeCommitment;
      primaryCopy = homeCommitmentCopy(recommendation);
    } else if (vehicleDependency && topicMatches(recommendation.title, VEHICLE_DEPENDENCY_TOPICS)) {
      primarySignal = vehicleDependency;
      primaryCopy = vehicleDependencyCopy(recommendation);
    } else if (tradeoff) {
      primarySignal = tradeoff;
      primaryCopy = tradeoffCopy(tradeoff, recommendation);
    }

    const generic = genericCopy(recommendation);
    const personalized = Boolean(primarySignal && primaryCopy && uniqueEvidence(primarySignal.evidenceRefs).length);
    const tradeoffDetails = tradeoff ? tradeoffCopy(tradeoff, recommendation) : null;
    const evidenceRefs = uniqueEvidence([
      ...(personalized ? primarySignal.evidenceRefs : []),
      ...(personalized && tradeoff && tradeoff !== primarySignal && tradeoffDetails?.priceTradeoff ? tradeoff.evidenceRefs : [])
    ]);
    const supportingSignalKeys = [
      ...(personalized ? [primarySignal.key] : []),
      ...(personalized && tradeoff && tradeoff !== primarySignal && tradeoffDetails?.priceTradeoff ? [tradeoff.key] : [])
    ];

    const becauseYouToldUs = personalized ? primaryCopy.becauseYouToldUs : '';
    const personalMeaning = personalized ? primaryCopy.personalMeaning : '';
    const whyThisFits = personalized ? primaryCopy.whyThisFits : generic.whyThisFits;
    const discussionPrompt = personalized ? primaryCopy.producerDiscussionPrompt : generic.producerDiscussionPrompt;
    const customerDiscussionPrompt = personalized ? primaryCopy.customerDiscussionPrompt : generic.customerDiscussionPrompt;
    const buyInPrompt = personalized ? primaryCopy.buyInPrompt : generic.buyInPrompt;
    const priceTradeoff = personalized && tradeoffDetails ? tradeoffDetails.priceTradeoff : '';

    return {
      id: `${ENGINE_ANCHOR_PREFIX}${slug(recommendation.recommendationKey)}`,
      recommendationKey: recommendation.recommendationKey,
      recommendationSourceId: recommendation.recommendationSourceId,
      recommendationTitle: recommendation.title,
      personalized,
      genericFallback: !personalized,
      supportingSignalKeys,
      becauseYouToldUs,
      personalMeaning,
      whyThisFits,
      discussionPrompt,
      buyInPrompt,
      priceTradeoff,
      copyVariants: {
        customer: {
          becauseYouToldUs,
          personalMeaning,
          whyThisFits,
          discussionPrompt: customerDiscussionPrompt,
          buyInPrompt: '',
          priceTradeoff
        },
        producer: {
          becauseYouToldUs,
          personalMeaning,
          whyThisFits,
          discussionPrompt,
          buyInPrompt,
          priceTradeoff
        }
      },
      source: 'coveragefit_assessment',
      evidenceRefs,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function buildDetailed(profile, eligibleRecommendations, options = {}) {
    const normalizedProfile = normalizeProfile(profile);
    const recommendations = normalizeRecommendations(eligibleRecommendations);
    const signals = activeSignals(normalizedProfile);
    const anchors = recommendations.map(item => buildAnchor(normalizedProfile, item, options));
    const candidateSignalsIgnored = list(normalizedProfile?.customerSignals).filter(signal => signal?.status === 'candidate').map(signal => signal.key);
    return Object.freeze({
      anchors: clone(anchors),
      diagnostics: clone({
        eligibleRecommendationCount: recommendations.length,
        activeEvidenceBackedSignalCount: signals.length,
        personalizedAnchorCount: anchors.filter(anchor => anchor.personalized).length,
        genericAnchorCount: anchors.filter(anchor => anchor.genericFallback).length,
        candidateSignalsIgnored
      })
    });
  }

  function build(profile, eligibleRecommendations, options = {}) {
    return buildDetailed(profile, eligibleRecommendations, options).anchors;
  }

  function apply(profile, eligibleRecommendations, options = {}) {
    const contract = contractApi();
    const normalized = normalizeProfile(profile);
    const anchors = build(normalized, eligibleRecommendations, options);
    const preserved = list(normalized?.recommendationAnchors).filter(anchor => !ownsAnchor(anchor));
    const next = { ...clone(normalized), recommendationAnchors: [...preserved, ...anchors] };
    return contract?.normalize ? contract.normalize(next) : next;
  }

  function ownsAnchor(anchor) {
    return text(anchor?.id, 120).startsWith(ENGINE_ANCHOR_PREFIX);
  }

  function isEligibleAnchor(anchor, eligibleRecommendations) {
    const eligible = new Set(normalizeRecommendations(eligibleRecommendations).map(item => compact(item.recommendationKey)));
    return eligible.has(compact(anchor?.recommendationKey));
  }

  return Object.freeze({
    VERSION,
    BUILD,
    CONTRACT_ID,
    ENGINE_ANCHOR_PREFIX,
    HOME_COMMITMENT_TOPICS,
    VEHICLE_DEPENDENCY_TOPICS,
    normalizeRecommendations,
    buildDetailed,
    build,
    apply,
    ownsAnchor,
    isEligibleAnchor
  });
});
