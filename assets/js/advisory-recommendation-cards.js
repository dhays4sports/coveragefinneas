(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryRecommendationCards = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-recommendation-cards-ready', {
      detail: { version: api.VERSION, build: api.BUILD, contractId: api.CONTRACT_ID }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.12';
  const CONTRACT_ID = 'coveragefit-advisory-recommendation-card-v1';
  const MAX_CARDS = 3;
  const MAX_TEXT = 700;
  const REACTION_STATES = Object.freeze([
    Object.freeze({ value: 'accepted_logic', label: 'Makes sense' }),
    Object.freeze({ value: 'needs_explanation', label: 'Explain this' }),
    Object.freeze({ value: 'prefers_savings', label: 'Prioritize cost' }),
    Object.freeze({ value: 'undecided', label: 'Not sure yet' })
  ]);

  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const list = value => Array.isArray(value) ? value : [];
  const text = (value, limit = MAX_TEXT) => String(value ?? '').trim().slice(0, limit);
  const compact = value => text(value, 240).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const slug = value => text(value, 220).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'topic';
  const escapeHtml = value => text(value, 1200).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function normalizeEvidence(refs) {
    const seen = new Set();
    return list(refs).map(ref => ({
      source: text(ref?.source || 'unknown', 80),
      key: text(ref?.key || ref?.sourceKey || '', 180),
      label: text(ref?.label || ref?.question || '', 280),
      capturedAt: text(ref?.capturedAt || '', 40)
    })).filter(ref => ref.key || ref.label).filter(ref => {
      const id = `${ref.source}|${ref.key}|${ref.label}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function normalizeRecommendation(item, index = 0) {
    if (!item || typeof item !== 'object') return null;
    const topic = text(item.name || item.title || item.tag || item.category || item.recommendationKey, 180);
    if (!topic) return null;
    return {
      recommendationKey: text(item.recommendationKey || topic, 180),
      recommendationSourceId: text(item.ruleId || item.id || item.key || item.questionKey || '', 180),
      topic,
      priority: text(item.priority || '', 80),
      priorityLabel: text(item.impactLabel || item.priorityLabel || item.priority || 'Review topic', 120),
      explanation: text(item.clientExplanation || item.explanation || item.insight || item.why || item.reason || 'Your assessment response made this topic worth confirming.', MAX_TEXT),
      conversationStarter: text(item.conversationStarter || item.discussionQuestion || item.question || `Can we confirm how ${topic.toLowerCase()} works in my current policy?`, MAX_TEXT),
      evidenceQuality: text(item.evidenceQuality || 'needs-verification', 80).toLowerCase(),
      evidenceLabel: text(item.evidenceLabel || '', 180),
      supportingAnswers: list(item.supportingAnswers || item.evidence).map(value => text(value, 320)).filter(Boolean).slice(0, 3),
      findingType: text(item.findingType || '', 100),
      index
    };
  }

  function normalizeRecommendations(items) {
    const seen = new Set();
    return list(items).map(normalizeRecommendation).filter(Boolean).filter(item => {
      const id = compact(item.recommendationKey);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, MAX_CARDS);
  }

  function normalizeAnchor(anchor) {
    if (!anchor || typeof anchor !== 'object') return null;
    const recommendationKey = text(anchor.recommendationKey || anchor.recommendationTitle, 180);
    if (!recommendationKey) return null;
    const evidenceRefs = normalizeEvidence(anchor.evidenceRefs);
    const customer = anchor.copyVariants?.customer || {};
    const personalized = Boolean(anchor.personalized && text(customer.becauseYouToldUs || anchor.becauseYouToldUs, 500) && evidenceRefs.length);
    return {
      id: text(anchor.id, 180),
      recommendationKey,
      recommendationTitle: text(anchor.recommendationTitle || recommendationKey, 180),
      personalized,
      genericFallback: !personalized,
      becauseYouToldUs: personalized ? text(customer.becauseYouToldUs || anchor.becauseYouToldUs, 500) : '',
      personalMeaning: personalized ? text(customer.personalMeaning || anchor.personalMeaning, 600) : '',
      whyThisFits: text(customer.whyThisFits || anchor.whyThisFits, MAX_TEXT),
      discussionPrompt: text(customer.discussionPrompt || anchor.discussionPrompt, MAX_TEXT),
      priceTradeoff: personalized ? text(customer.priceTradeoff || anchor.priceTradeoff, MAX_TEXT) : '',
      supportingSignalKeys: list(anchor.supportingSignalKeys).map(value => text(value, 180)).filter(Boolean),
      evidenceRefs
    };
  }

  function anchorsByKey(report) {
    const map = new Map();
    list(report?.discoveryProfile?.recommendationAnchors).map(normalizeAnchor).filter(Boolean).forEach(anchor => {
      map.set(compact(anchor.recommendationKey), anchor);
      map.set(compact(anchor.recommendationTitle), anchor);
    });
    return map;
  }

  function evidenceStatus(recommendation) {
    const quality = recommendation.evidenceQuality;
    if (quality === 'missing') {
      return {
        key: 'needs_policy_verification',
        label: 'Needs policy verification',
        tone: 'verify',
        scopeNote: 'CoverageFit does not have enough confirmed information to treat this as a current-policy finding.'
      };
    }
    if (quality === 'partial' || quality === 'needs-verification' || quality === 'needs_verification') {
      return {
        key: 'needs_policy_verification',
        label: 'Needs policy verification',
        tone: 'verify',
        scopeNote: 'Your assessment made this worth discussing, but the issued policy still needs to be checked before any change is recommended.'
      };
    }
    return {
      key: 'answer_based_review_topic',
      label: 'Answer-based review topic',
      tone: 'review',
      scopeNote: 'This reflects a clear assessment response; it does not verify the issued policy or establish that any policy problem or change exists.'
    };
  }

  function fitStatus(anchor, evidence) {
    if (anchor?.personalized) {
      return {
        key: 'personal_context_match',
        label: 'Why this fits your review',
        tone: 'personalized'
      };
    }
    return {
      key: evidence.key === 'needs_policy_verification' ? 'context_to_confirm' : 'worth_discussing',
      label: evidence.key === 'needs_policy_verification' ? 'Context to confirm' : 'Worth discussing',
      tone: 'neutral'
    };
  }

  function genericProducerReason(recommendation) {
    return `${recommendation.topic} is already on your CoverageFit discussion list. Dylan can verify how it works in your current policy, explain the tradeoffs, and then tell you whether he would recommend leaving it alone or changing anything.`;
  }

  function derive(report = {}, eligibleRecommendations = []) {
    const recommendations = normalizeRecommendations(eligibleRecommendations);
    const anchorMap = anchorsByKey(report);
    const cards = recommendations.map((recommendation, index) => {
      const anchor = anchorMap.get(compact(recommendation.recommendationKey)) || anchorMap.get(compact(recommendation.topic)) || null;
      const evidence = evidenceStatus(recommendation);
      const status = fitStatus(anchor, evidence);
      const because = anchor?.personalized ? anchor.becauseYouToldUs : '';
      const whyReview = anchor?.personalized && anchor.whyThisFits
        ? anchor.whyThisFits
        : genericProducerReason(recommendation);
      const evidenceRefs = anchor?.personalized ? clone(anchor.evidenceRefs) : [];
      return {
        schemaVersion: '1.0',
        contractId: CONTRACT_ID,
        build: BUILD,
        id: `cfadv112-${slug(recommendation.recommendationKey)}`,
        rank: index + 1,
        recommendationKey: recommendation.recommendationKey,
        recommendationSourceId: recommendation.recommendationSourceId,
        topic: recommendation.topic,
        fitStatus: status,
        personalized: Boolean(anchor?.personalized),
        provenance: {
          becauseYouToldUs: because,
          personalMeaning: anchor?.personalized ? anchor.personalMeaning : '',
          supportingSignalKeys: anchor?.personalized ? clone(anchor.supportingSignalKeys) : [],
          evidenceRefs,
          hasPersonalEvidence: Boolean(because && evidenceRefs.length)
        },
        assessmentFinding: {
          label: evidence.label,
          detail: recommendation.explanation,
          scopeNote: evidence.scopeNote,
          evidenceQuality: recommendation.evidenceQuality,
          evidenceLabel: recommendation.evidenceLabel || evidence.label,
          supportingAnswers: clone(recommendation.supportingAnswers),
          issuedPolicyVerified: false,
          issuedPolicyDeficiencyConfirmed: false,
          changeRecommended: false
        },
        producerReviewReason: {
          label: 'Why Dylan wants to review it',
          detail: whyReview,
          discussionPrompt: anchor?.discussionPrompt || recommendation.conversationStarter,
          recommendationPendingVerification: true
        },
        tradeoff: {
          detail: anchor?.personalized ? anchor.priceTradeoff : ''
        },
        reaction: {
          state: 'not_captured',
          persisted: false,
          controls: clone(REACTION_STATES)
        },
        guardrails: {
          affectsProtectionScore: false,
          createsRecommendationEligibility: false,
          changesRecommendationRanking: false,
          customerFactIsPolicyFinding: false,
          customerPreferenceIsPolicyFinding: false,
          assessmentAnswerIsIssuedPolicyVerification: false,
          reactionStoredInDiscoveryProfile: false,
          reactionBindsCoverage: false
        }
      };
    });

    return Object.freeze({
      schemaVersion: '1.0',
      contractId: CONTRACT_ID,
      build: BUILD,
      cards: clone(cards),
      diagnostics: clone({
        eligibleRecommendationCount: recommendations.length,
        cardCount: cards.length,
        personalizedCardCount: cards.filter(card => card.personalized).length,
        genericCardCount: cards.filter(card => !card.personalized).length,
        policyVerifiedCardCount: 0,
        durableReactionCount: 0
      })
    });
  }

  function renderReactionControls(card) {
    const buttons = card.reaction.controls.map(option => `
      <button type="button" class="advisory-card-reaction__button" data-advisory-reaction-draft="${escapeHtml(option.value)}" aria-pressed="false">${escapeHtml(option.label)}</button>`).join('');
    return `
      <div class="advisory-card-reaction no-print" data-advisory-card-reaction>
        <div class="advisory-card-reaction__heading">
          <span>How does this land?</span>
          <small data-advisory-reaction-status>No reaction saved</small>
        </div>
        <div class="advisory-card-reaction__controls" role="group" aria-label="Reaction to ${escapeHtml(card.topic)}">
          ${buttons}
        </div>
      </div>`;
  }

  function renderCardHtml(card) {
    const because = card.provenance.hasPersonalEvidence
      ? `<section class="advisory-fit-card__lane advisory-fit-card__lane--personal"><span>Because you told us</span><p>${escapeHtml(card.provenance.becauseYouToldUs)}</p>${card.provenance.personalMeaning ? `<small>${escapeHtml(card.provenance.personalMeaning)}</small>` : ''}</section>`
      : `<section class="advisory-fit-card__lane advisory-fit-card__lane--neutral"><span>Personal context</span><p>We do not have enough separate personal context to connect this topic to your priorities yet. Dylan can clarify that during the review.</p></section>`;
    const supporting = card.assessmentFinding.supportingAnswers.length
      ? `<p class="advisory-fit-card__evidence"><strong>Assessment response considered:</strong> ${escapeHtml(card.assessmentFinding.supportingAnswers[0])}</p>`
      : '';
    const tradeoff = card.tradeoff.detail
      ? `<p class="advisory-fit-card__tradeoff"><strong>Tradeoff to keep visible:</strong> ${escapeHtml(card.tradeoff.detail)}</p>`
      : '';
    return `
      <article class="prospect-topic-card advisory-fit-card" data-advisory-recommendation-card="${escapeHtml(card.id)}" data-personalized="${card.personalized ? 'true' : 'false'}">
        <div class="prospect-topic-card__number" aria-hidden="true">${card.rank}</div>
        <div class="prospect-topic-card__body">
          <div class="advisory-fit-card__status-row">
            <span class="advisory-fit-card__status" data-tone="${escapeHtml(card.fitStatus.tone)}">${escapeHtml(card.fitStatus.label)}</span>
            <span class="advisory-fit-card__verification" data-quality="${escapeHtml(card.assessmentFinding.evidenceQuality)}">${escapeHtml(card.assessmentFinding.evidenceLabel)}</span>
          </div>
          <h3>${escapeHtml(card.topic)}</h3>
          ${because}
          <section class="advisory-fit-card__lane advisory-fit-card__lane--finding">
            <span>What we found / need to verify</span>
            <p>${escapeHtml(card.assessmentFinding.detail)}</p>
            <small>${escapeHtml(card.assessmentFinding.scopeNote)}</small>
            ${supporting}
          </section>
          <section class="advisory-fit-card__lane advisory-fit-card__lane--review">
            <span>Why Dylan wants to review it</span>
            <p>${escapeHtml(card.producerReviewReason.detail)}</p>
            ${card.producerReviewReason.discussionPrompt ? `<small><strong>Question to discuss:</strong> ${escapeHtml(card.producerReviewReason.discussionPrompt)}</small>` : ''}
            ${tradeoff}
          </section>
          ${renderReactionControls(card)}
        </div>
      </article>`;
  }

  function wireReactionDrafts(container) {
    if (!container) return;
    container.querySelectorAll('[data-advisory-card-reaction]').forEach(group => {
      const status = group.querySelector('[data-advisory-reaction-status]');
      group.querySelectorAll('[data-advisory-reaction-draft]').forEach(button => {
        button.addEventListener('click', () => {
          const pressed = button.getAttribute('aria-pressed') === 'true';
          group.querySelectorAll('[data-advisory-reaction-draft]').forEach(other => other.setAttribute('aria-pressed', 'false'));
          if (pressed) {
            if (status) status.textContent = 'No reaction saved';
            return;
          }
          button.setAttribute('aria-pressed', 'true');
          if (status) status.textContent = 'Selected for this page only';
        });
      });
    });
  }

  function eligibleRecommendations(report) {
    const priorities = list(report?.priorities).length
      ? report.priorities
      : list(report?.answers).filter(answer => Number(answer?.scoreImpact || 0) > 0 || Number(answer?.points || 0) < 0).slice(0, MAX_CARDS);
    const engine = root?.CoverageFitRecommendationEngine;
    if (engine?.generate) {
      try { return engine.generate('home', { ...report, priorities, answers: list(report?.answers) }).slice(0, MAX_CARDS); } catch (_) {}
    }
    return priorities.slice(0, MAX_CARDS);
  }

  async function render() {
    if (!root.document) return null;
    const container = root.document.getElementById('priorities');
    if (!container) return null;
    const fallback = (() => {
      try { return JSON.parse(root.localStorage?.getItem?.('coveragefit_home_report') || '{}'); } catch (_) { return {}; }
    })();
    const access = await (root.COVERAGEFIT_PROSPECT_REPORT_READY || Promise.resolve({ ok: true, report: fallback }));
    if (access && access.ok === false) return null;
    const report = access?.report || fallback;
    const model = derive(report, eligibleRecommendations(report));
    container.innerHTML = model.cards.length
      ? model.cards.map(renderCardHtml).join('')
      : '<div class="report-empty">No major answer-based concern was flagged. Use your review to confirm the positive foundation reflected in your answers.</div>';
    wireReactionDrafts(container);
    root.CoverageFitAnalytics?.track?.('advisory_recommendation_cards_viewed', {
      assessment: 'home',
      cardCount: model.cards.length,
      personalizedCardCount: model.diagnostics.personalizedCardCount
    });
    return model;
  }

  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', render, { once: true });
    else render();
  }

  return Object.freeze({
    VERSION,
    BUILD,
    CONTRACT_ID,
    MAX_CARDS,
    REACTION_STATES,
    normalizeRecommendations,
    derive,
    renderCardHtml,
    eligibleRecommendations,
    render
  });
});
