(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryCustomerReaction = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.10';
  const CONTRACT_ID = 'coveragefit-customer-language-reaction-v1';
  const MIN_SIGNAL_CONFIDENCE = 0.9;
  const MAX_MESSAGES = 2;
  const RESERVED_CONCERNS = new Set(['unsure', 'prefer_not_to_answer']);

  const clone = value => { try { return value == null ? value : JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };
  const text = (value, limit = 500) => String(value ?? '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, limit);
  const keyOf = value => text(value?.key || value?.value, 120);
  const evidence = value => Array.isArray(value?.evidenceRefs) ? value.evidenceRefs.filter(ref => ref && (ref.key || ref.label)) : [];
  const hasEvidence = value => evidence(value).length > 0;

  function contractApi() {
    if (root?.CoverageFitAdvisoryDiscoveryContract) return root.CoverageFitAdvisoryDiscoveryContract;
    if (typeof require === 'function') {
      try { return require('./advisory-discovery-contract.js'); } catch (_) { return null; }
    }
    return null;
  }

  function signalApi() {
    if (root?.CoverageFitAdvisorySignalEngine) return root.CoverageFitAdvisorySignalEngine;
    if (typeof require === 'function') {
      try { return require('./advisory-signal-engine.js'); } catch (_) { return null; }
    }
    return null;
  }

  function normalize(profile) {
    const contract = contractApi();
    return contract?.normalize ? contract.normalize(profile || {}) : clone(profile || {});
  }

  function mergeProfiles(profiles) {
    const contract = contractApi();
    const valid = (Array.isArray(profiles) ? profiles : []).filter(Boolean);
    if (!valid.length) return normalize({ product: 'home' });
    let merged = normalize(valid.shift());
    valid.forEach(profile => {
      merged = contract?.merge ? contract.merge(merged, profile) : { ...merged, ...clone(profile) };
    });
    const signals = signalApi();
    return signals?.apply ? signals.apply(merged) : merged;
  }

  function runtimeProfile() {
    return mergeProfiles([
      root?.CoverageFitAdvisoryOpening?.getDiscoveryProfile?.(),
      root?.CoverageFitAdvisoryRelationshipDiscovery?.getDiscoveryProfile?.(),
      root?.CoverageFitAdvisoryLifestyleDiscovery?.getDiscoveryProfile?.(),
      root?.CoverageFitAdvisoryOutcomeDiscovery?.getDiscoveryProfile?.()
    ]);
  }

  function activeSignal(profile, key) {
    return (profile?.customerSignals || []).find(signal =>
      signal?.key === key
      && signal?.status === 'active'
      && Number(signal?.confidence || 0) >= MIN_SIGNAL_CONFIDENCE
      && hasEvidence(signal)
    ) || null;
  }

  const CONCERN_COPY = Object.freeze({
    out_of_pocket: Object.freeze({ topic: 'cost', text: 'Keeping unexpected out-of-pocket costs manageable is one of your priorities. We’ll use that context when we compare tradeoffs.' }),
    temporary_displacement: Object.freeze({ topic: 'displacement', text: 'Managing a temporary move is one of the outcomes you want kept in view. We’ll carry that practical context into the review.' }),
    rebuild_properly: Object.freeze({ topic: 'rebuilding', text: 'Rebuilding the home properly is one of the outcomes you want kept in view. We’ll carry that context into the review.' }),
    replace_belongings: Object.freeze({ topic: 'belongings', text: 'Replacing belongings is one of the outcomes you want kept in view. We’ll carry that context into the review.' }),
    water_loss: Object.freeze({ topic: 'water', text: 'A serious water loss is one of the outcomes you want kept in view. We’ll use that context during the review.' }),
    liability_finances: Object.freeze({ topic: 'liability', text: 'The financial impact of a liability situation is one of the outcomes you want kept in view. We’ll use that context during the review.' }),
    premium_low: Object.freeze({ topic: 'cost', text: 'Keeping the premium as low as practical is one of your priorities. We’ll keep cost visible when we compare tradeoffs.' })
  });

  const TRADEOFF_COPY = Object.freeze({
    'tradeoffPreference.balanced': Object.freeze({ topic: 'tradeoff', text: 'You’re looking for a balance between price and protection. We’ll keep both sides of that tradeoff visible.' }),
    'tradeoffPreference.price': Object.freeze({ topic: 'cost', text: 'Keeping cost down matters to you. We’ll keep price visible as we review the policy.' }),
    'tradeoffPreference.protection': Object.freeze({ topic: 'tradeoff', text: 'You’d rather start from stronger practical protection and see the tradeoffs clearly. We’ll keep that preference in view.' })
  });

  function message(id, copy, sourceType, sourceKeys, evidenceRefs, confidence = 1, topic = '') {
    return {
      id,
      text: text(copy, 420),
      sourceType,
      sourceKeys: (sourceKeys || []).map(value => text(value, 160)).filter(Boolean),
      evidenceRefs: clone(evidenceRefs || []),
      confidence: Number(confidence || 0),
      topic: text(topic, 80),
      personalized: true,
      fallback: false
    };
  }

  function outcomeMessage(concern, index) {
    if (!concern || !hasEvidence(concern)) return null;
    const key = keyOf(concern);
    if (!key || RESERVED_CONCERNS.has(key)) return null;
    if (key === 'other') {
      const customerWords = text(concern.label, 120);
      if (!customerWords || /^something else$/i.test(customerWords)) return null;
      return message(
        `outcome-other-${index + 1}`,
        `You told us that “${customerWords}” would be especially hard for your household. We’ll keep that context in view as we review the policy.`,
        'explicit_fact',
        ['outcomeConcerns.other'],
        evidence(concern),
        1,
        'customer_words'
      );
    }
    const copy = CONCERN_COPY[key];
    if (!copy) return null;
    return message(`outcome-${key}`, copy.text, 'explicit_fact', [`outcomeConcerns.${key}`], evidence(concern), 1, copy.topic);
  }

  function derive(profile) {
    const normalized = normalize(profile || {});
    const output = [];
    const topics = new Set();
    const push = next => {
      if (!next || output.length >= MAX_MESSAGES) return;
      if (next.topic && topics.has(next.topic)) return;
      output.push(next);
      if (next.topic) topics.add(next.topic);
    };

    (normalized.outcomeConcerns || []).forEach((concern, index) => push(outcomeMessage(concern, index)));

    const homeCommitment = activeSignal(normalized, 'homeCommitment.high');
    if (homeCommitment) {
      push(message(
        'signal-home-commitment',
        'It sounds like this is a home you’re planning around long-term. We’ll keep that in mind during the review.',
        'active_signal',
        ['homeCommitment.high'],
        evidence(homeCommitment),
        homeCommitment.confidence,
        'home_commitment'
      ));
    }

    const incumbent = activeSignal(normalized, 'incumbentRelationship.strong');
    if (incumbent) {
      push(message(
        'signal-incumbent-relationship',
        'You’ve had a long relationship with your current company and told us service matters. We’ll treat that as something worth preserving in any comparison.',
        'active_signal',
        ['incumbentRelationship.strong'],
        evidence(incumbent),
        incumbent.confidence,
        'incumbent_relationship'
      ));
    }

    const tradeoff = (normalized.customerSignals || []).find(signal => TRADEOFF_COPY[signal?.key]
      && signal?.status === 'active'
      && Number(signal?.confidence || 0) >= MIN_SIGNAL_CONFIDENCE
      && hasEvidence(signal));
    if (tradeoff) {
      const copy = TRADEOFF_COPY[tradeoff.key];
      push(message(
        `signal-${tradeoff.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        copy.text,
        'active_signal',
        [tradeoff.key],
        evidence(tradeoff),
        tradeoff.confidence,
        copy.topic
      ));
    }

    if (!output.length) {
      output.push({
        id: 'neutral-fallback',
        text: 'Thanks. We’ll keep the context you shared in view as we review your current protection.',
        sourceType: 'neutral_fallback',
        sourceKeys: [],
        evidenceRefs: [],
        confidence: 0,
        topic: 'fallback',
        personalized: false,
        fallback: true
      });
    }

    return Object.freeze({
      contractId: CONTRACT_ID,
      build: BUILD,
      messages: clone(output.slice(0, MAX_MESSAGES)),
      personalizedCount: output.filter(item => item.personalized).length,
      usedFallback: output.every(item => item.fallback),
      scoreFormulaChanged: false,
      recommendationEligibilityChanged: false
    });
  }

  function dom() {
    if (!root?.document) return null;
    return {
      shell: root.document.getElementById('advisoryReaction'),
      list: root.document.getElementById('advisoryReactionMessages'),
      live: root.document.getElementById('advisoryReactionLive')
    };
  }

  let last = derive(runtimeProfile());

  function render(options = {}) {
    const ui = dom();
    last = derive(options.profile || runtimeProfile());
    if (!ui?.shell || !ui?.list) return clone(last);
    ui.list.innerHTML = '';
    last.messages.forEach(item => {
      const li = root.document.createElement('li');
      li.dataset.reactionId = item.id;
      li.dataset.sourceType = item.sourceType;
      li.textContent = item.text;
      ui.list.appendChild(li);
    });
    ui.shell.dataset.personalizedCount = String(last.personalizedCount);
    ui.shell.dataset.fallback = String(last.usedFallback);
    if (ui.live) ui.live.textContent = last.usedFallback
      ? 'Your review context is ready.'
      : `${last.personalizedCount} review context ${last.personalizedCount === 1 ? 'note is' : 'notes are'} ready.`;
    return clone(last);
  }

  function show(options = {}) {
    const ui = dom();
    if (!ui?.shell) return false;
    const result = render(options);
    ui.shell.hidden = false;
    root.document?.body?.classList?.add('advisory-reaction-visible');
    root.CoverageFitAnalytics?.track?.('advisory_customer_reaction_shown', {
      product: 'home',
      personalizedCount: result.personalizedCount,
      usedFallback: result.usedFallback,
      scoreFormulaChanged: false,
      recommendationEligibilityChanged: false
    });
    if (options.scroll === true) requestAnimationFrame(() => ui.shell?.scrollIntoView?.({ behavior: 'auto', block: 'start' }));
    return true;
  }

  function hide() {
    const ui = dom();
    if (ui?.shell) ui.shell.hidden = true;
    root.document?.body?.classList?.remove('advisory-reaction-visible');
    return true;
  }

  function draftAtBeginning() {
    const draft = root?.CoverageFitAssessmentContinuity?.getDraft?.() || null;
    return Boolean(draft?.propertyConfirmed && Number(draft?.currentIndex || 0) <= 0);
  }

  function bind() {
    const ui = dom();
    if (!ui?.shell || ui.shell.dataset.bound === 'true') return false;
    ui.shell.dataset.bound = 'true';
    ['coveragefit:advisory-opening-completed', 'coveragefit:advisory-relationship-completed', 'coveragefit:advisory-lifestyle-completed']
      .forEach(name => root.addEventListener?.(name, () => render()));
    root.addEventListener?.('coveragefit:advisory-outcome-completed', () => show());
    root.addEventListener?.('coveragefit:property-profile-confirmed', () => {
      if (root.CoverageFitAdvisoryOutcomeDiscovery?.isComplete?.() && draftAtBeginning()) show();
    });
    if (root.CoverageFitAdvisoryOutcomeDiscovery?.isComplete?.() && draftAtBeginning()) show();
    else render();
    return true;
  }

  if (root?.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
  }

  return Object.freeze({
    VERSION,
    BUILD,
    CONTRACT_ID,
    MIN_SIGNAL_CONFIDENCE,
    MAX_MESSAGES,
    CONCERN_COPY,
    TRADEOFF_COPY,
    mergeProfiles,
    runtimeProfile,
    derive,
    render,
    show,
    hide,
    getLast: () => clone(last),
    boundaries: Object.freeze({
      scoreFormulaChanged: false,
      recommendationEligibilityChanged: false,
      recommendationRankingChanged: false,
      acknowledgementIsRecommendation: false,
      acknowledgementIsConsent: false,
      fearLanguageAllowed: false,
      evidenceRequiredForPersonalization: true,
      neutralFallbackAllowed: true
    })
  });
});
