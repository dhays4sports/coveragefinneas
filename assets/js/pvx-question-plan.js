(function (root, factory) {
  'use strict';
  const api = factory(root.CoverageFitPVXDiscoveryContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXQuestionPlan = api;
})(typeof window !== 'undefined' ? window : globalThis, function (contract) {
  'use strict';
  const BUILD = 'CF-DISCOVERY-1.1';
  function resolve(state = {}) {
    if (!contract) throw new TypeError('The discovery contract is unavailable.');
    const productTrack = contract.normalizeTrack(state.productTrack);
    const questions = contract.questionsFor(productTrack);
    const answers = state.answers && typeof state.answers === 'object' ? state.answers : {};
    const prefilled = new Set(Array.isArray(state.prefilledQuestionIds) ? state.prefilledQuestionIds : []);
    const carriedQuestionIds = questions.filter(question => prefilled.has(question.id) && answers[question.id] != null).map(question => question.id);
    const remaining = questions.filter(question => !(prefilled.has(question.id) && answers[question.id] != null) && answers[question.id] == null);
    return Object.freeze({
      build: BUILD,
      productTrack,
      questions,
      remaining,
      remainingCount: remaining.length,
      carriedQuestionIds,
      carriedQuestionCount: carriedQuestionIds.length,
      nextQuestionId: remaining[0]?.id || 'complete',
      completedQuestionIds: questions.filter(question => answers[question.id] != null).map(question => question.id),
      repeatedQuestionIds: [],
      guardrails: Object.freeze({ snapshotPrimaryNextStep: true, optionalRefinementAfterSnapshot: true, maxCatalogQuestions: 8 })
    });
  }
  return Object.freeze({ BUILD, resolve });
});
