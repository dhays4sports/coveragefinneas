(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryResultsModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.11';
  const CONTRACT_ID = 'coveragefit-advisory-results-model-v1';
  const MAX_CONTEXT_ITEMS = 3;
  const MAX_OUTCOMES = 2;
  const MAX_STRENGTHS = 3;
  const MAX_TOPICS = 3;

  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const text = (value, limit = 500) => String(value ?? '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, limit);
  const list = value => Array.isArray(value) ? value : [];
  const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
  const lower = value => text(value, 240).toLowerCase();
  const compact = value => lower(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const NON_ANSWER_VALUES = new Set(['unsure', 'prefer_not_to_answer', 'unknown', 'not_sure', '']);
  const evidenceRefs = record => list(record?.evidenceRefs).filter(ref => text(ref?.key || ref?.label));
  const hasEvidence = record => evidenceRefs(record).length > 0;
  const recordValue = record => text(record?.value || record?.key, 240);
  const recordLabel = record => text(record?.label || record?.text || record?.value || record?.key, 360);
  const isMeaningful = record => {
    const value = compact(recordValue(record));
    return Boolean(record && recordLabel(record) && hasEvidence(record) && !NON_ANSWER_VALUES.has(value));
  };
  const recordHasEvidenceKey = (record, key) => evidenceRefs(record).some(ref => text(ref?.key, 180) === key);

  function reasonLabel(report, profile) {
    const record = profile?.reasonForReview;
    if (isMeaningful(record)) return recordLabel(record);
    return text(report?.reviewReasonPersonalization?.label || report?.reviewContext, 300) || 'Protection review';
  }

  function priorityLabel(profile) {
    const record = profile?.primaryPriority;
    if (!record || !hasEvidence(record)) return 'Not specified yet';
    const value = compact(recordValue(record));
    if (value === 'unsure' || value === 'not_sure') return 'Still deciding';
    if (value === 'prefer_not_to_answer') return 'Not specified';
    return recordLabel(record) || 'Not specified yet';
  }

  function pickByEvidence(records, key) {
    return list(records).find(record => isMeaningful(record) && recordHasEvidenceKey(record, key)) || null;
  }

  function householdReliance(profile) {
    return list(profile?.householdContext?.facts)
      .filter(record => isMeaningful(record) && recordHasEvidenceKey(record, 'householdReliance'));
  }

  function homeContext(profile) {
    const facts = list(profile?.householdContext?.facts);
    const lifestyle = list(profile?.lifestyleDependencies);
    const items = [];
    const stay = pickByEvidence(lifestyle, 'stayIntent');
    const reliance = householdReliance(profile);
    const displacement = pickByEvidence(lifestyle, 'displacementDisruption');
    const improvements = pickByEvidence(lifestyle, 'homeImprovements');
    const tenure = pickByEvidence(facts, 'residenceTenure');
    const primaryHome = pickByEvidence(facts, 'homeOwnership');

    if (stay) items.push({
      id: 'stay-intent',
      label: 'How long this home needs to fit',
      value: recordLabel(stay),
      evidenceRefs: clone(evidenceRefs(stay))
    });
    if (reliance.length) {
      const labels = reliance.map(recordLabel).filter(Boolean);
      items.push({
        id: 'household-reliance',
        label: 'Who relies on the home',
        value: labels.join(' · '),
        evidenceRefs: clone(reliance.flatMap(evidenceRefs))
      });
    }
    if (displacement) items.push({
      id: 'displacement',
      label: 'Temporary relocation',
      value: recordLabel(displacement),
      evidenceRefs: clone(evidenceRefs(displacement))
    });
    if (improvements) items.push({
      id: 'improvements',
      label: 'Home improvements',
      value: recordLabel(improvements),
      evidenceRefs: clone(evidenceRefs(improvements))
    });
    if (tenure) items.push({
      id: 'residence-tenure',
      label: 'Time in the home',
      value: recordLabel(tenure),
      evidenceRefs: clone(evidenceRefs(tenure))
    });
    if (!items.length && primaryHome) items.push({
      id: 'home-use',
      label: 'Home use',
      value: recordLabel(primaryHome),
      evidenceRefs: clone(evidenceRefs(primaryHome))
    });
    return items.slice(0, MAX_CONTEXT_ITEMS);
  }

  function outcomes(profile) {
    return list(profile?.outcomeConcerns)
      .filter(isMeaningful)
      .slice(0, MAX_OUTCOMES)
      .map((record, index) => ({
        rank: index + 1,
        value: recordValue(record),
        label: recordLabel(record),
        evidenceRefs: clone(evidenceRefs(record))
      }));
  }

  function strengths(report) {
    const source = list(report?.strengths).length
      ? report.strengths
      : list(report?.strengthFindings).map(item => item?.insight || item?.label || item?.title);
    return source.map(item => typeof item === 'string' ? text(item, 420) : text(item?.insight || item?.label || item?.title, 420))
      .filter(Boolean)
      .slice(0, MAX_STRENGTHS);
  }

  function worthDiscussing(report) {
    return list(report?.priorities).slice(0, MAX_TOPICS).map((item, index) => ({
      rank: index + 1,
      topic: text(item?.name || item?.tag || item?.category || 'Protection topic', 180),
      summary: text(item?.insight || item?.label || item?.title || 'Worth confirming during the licensed review.', 420),
      evidenceQuality: text(item?.evidenceQuality || '', 80),
      evidenceLabel: text(item?.evidenceLabel || '', 180)
    }));
  }

  function reviewReadiness(report) {
    const score = clamp(report?.score);
    return {
      score,
      status: text(report?.status || report?.rating, 160) || 'Review Recommended',
      methodologyId: text(report?.scoreMethodology?.id, 180),
      methodologyVersion: text(report?.scoreMethodology?.version, 80),
      scoreFormulaChanged: false
    };
  }

  function derive(report = {}) {
    const profile = report?.discoveryProfile && typeof report.discoveryProfile === 'object'
      ? report.discoveryProfile
      : {};
    const reason = reasonLabel(report, profile);
    const priority = priorityLabel(profile);
    const context = homeContext(profile);
    const hardest = outcomes(profile);
    const startingPoints = strengths(report);
    const discussion = worthDiscussing(report);
    return {
      schemaVersion: '1.0',
      contractId: CONTRACT_ID,
      build: BUILD,
      product: text(report?.assessment || profile?.product || 'home', 80) || 'home',
      generatedAt: text(report?.createdAt, 40),
      whyReviewing: {
        label: reason,
        personalized: Boolean(isMeaningful(profile?.reasonForReview)),
        evidenceRefs: clone(evidenceRefs(profile?.reasonForReview))
      },
      whatMattersMost: {
        label: priority,
        personalized: Boolean(isMeaningful(profile?.primaryPriority) && compact(recordValue(profile.primaryPriority)) !== 'unsure'),
        evidenceRefs: clone(evidenceRefs(profile?.primaryPriority))
      },
      homeContext: context,
      hardestOutcomes: hardest,
      strongStartingPoints: startingPoints,
      worthDiscussing: discussion,
      reviewReadiness: reviewReadiness(report),
      guardrails: {
        scoreFormulaChanged: false,
        scoreNumberChanged: false,
        recommendationEligibilityChanged: false,
        recommendationRankingChanged: false,
        customerChoosingPriceIsNegative: false,
        advisoryContextIsCoverageFinding: false,
        advisoryContextIsRecommendation: false,
        reportAccessSecurityChanged: false
      }
    };
  }

  const escapeHtml = value => text(value, 800).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function renderContext(model, container) {
    if (!container) return;
    const contextItems = model.homeContext.length
      ? model.homeContext.map(item => `<li><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></li>`).join('')
      : '<li class="advisory-results-empty">No additional home or household context was specified.</li>';
    const outcomeItems = model.hardestOutcomes.length
      ? model.hardestOutcomes.map(item => `<li><b>${item.rank}</b><span>${escapeHtml(item.label)}</span></li>`).join('')
      : '<li class="advisory-results-empty">No specific outcome was prioritized yet.</li>';

    container.innerHTML = `
      <div class="advisory-results-context__primary">
        <article class="advisory-result-card advisory-result-card--reason">
          <span>Why you’re reviewing</span>
          <strong>${escapeHtml(model.whyReviewing.label)}</strong>
        </article>
        <article class="advisory-result-card advisory-result-card--priority">
          <span>What matters most</span>
          <strong>${escapeHtml(model.whatMattersMost.label)}</strong>
        </article>
      </div>
      <div class="advisory-results-context__detail">
        <article class="advisory-result-card">
          <span>Your home & household context</span>
          <ul class="advisory-context-list">${contextItems}</ul>
        </article>
        <article class="advisory-result-card">
          <span>What would be hardest</span>
          <ol class="advisory-outcome-list">${outcomeItems}</ol>
        </article>
      </div>`;
  }

  function renderDiscussion(model, container) {
    if (!container) return;
    if (!model.worthDiscussing.length) {
      container.innerHTML = '<div class="advisory-discussion-empty"><strong>No major answer-based concern was flagged.</strong><span>Your licensed review can focus on confirming the positive foundation and current policy details.</span></div>';
      return;
    }
    container.innerHTML = model.worthDiscussing.map(item => `
      <article class="advisory-discussion-preview">
        <b aria-hidden="true">${item.rank}</b>
        <div><span>Worth confirming</span><strong>${escapeHtml(item.topic)}</strong><p>${escapeHtml(item.summary)}</p></div>
      </article>`).join('');
  }

  async function render() {
    if (!root.document) return null;
    const contextRoot = root.document.querySelector('[data-advisory-results-context]');
    const discussionRoot = root.document.querySelector('[data-advisory-results-discussion]');
    if (!contextRoot && !discussionRoot) return null;
    const fallback = (() => {
      try { return JSON.parse(root.localStorage?.getItem?.('coveragefit_home_report') || '{}'); } catch (_) { return {}; }
    })();
    const access = await (root.COVERAGEFIT_PROSPECT_REPORT_READY || Promise.resolve({ ok: true, report: fallback }));
    if (access && access.ok === false) return null;
    const report = access?.report || fallback;
    const model = derive(report);
    renderContext(model, contextRoot);
    renderDiscussion(model, discussionRoot);
    if (contextRoot) contextRoot.closest('[data-advisory-results-model]')?.classList.add('is-ready');
    root.CoverageFitAnalytics?.track?.('advisory_results_model_viewed', {
      assessment: 'home',
      contextCount: model.homeContext.length,
      outcomeCount: model.hardestOutcomes.length,
      discussionCount: model.worthDiscussing.length,
      score: model.reviewReadiness.score
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
    MAX_CONTEXT_ITEMS,
    MAX_OUTCOMES,
    MAX_STRENGTHS,
    MAX_TOPICS,
    derive,
    render
  });
});
