(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryProgressiveDiscoveryBranching = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.9';
  const CONTRACT_ID = 'coveragefit-progressive-discovery-branching-v1';

  const keyOf = record => String(record?.key || record?.value || '').trim();
  const keysOf = records => new Set((Array.isArray(records) ? records : []).map(keyOf).filter(Boolean));

  function relationship(state = {}) {
    const likes = keysOf(state.likes);
    const tenure = keyOf(state.tenure);
    const previouslyAnswered = Array.isArray(state.mustKeep) && state.mustKeep.length > 0;
    const preserveLegacyAnswer = previouslyAnswered && state.preserveLegacyMustKeep === true;
    const strongIncumbentEvidence = tenure === '10_plus' && likes.has('service');
    return Object.freeze({
      id: 'preserve-what-works',
      active: preserveLegacyAnswer || strongIncumbentEvidence,
      previouslyAnswered,
      legacyPreserved: preserveLegacyAnswer,
      trigger: strongIncumbentEvidence ? '10_plus_tenure_and_service' : (preserveLegacyAnswer ? 'restored_legacy_answer' : 'not_triggered'),
      prompt: 'You’ve built a long relationship and value the service. What should a new option make sure not to lose?',
      sourceFacts: strongIncumbentEvidence ? ['currentCarrierTenure', 'currentCarrierLikes.service'] : []
    });
  }

  function lifestyle(state = {}) {
    const primaryHome = keyOf(state.primaryHome);
    const stayIntent = keyOf(state.stayIntent);
    const previouslyAnswered = Boolean(state.improvements?.label);
    const preserveLegacyAnswer = previouslyAnswered && state.preserveLegacyImprovements === true;
    const longTermCommitment = primaryHome === 'primary_residence' && stayIntent === '5_plus';
    return Object.freeze({
      id: 'meaningful-improvements',
      active: preserveLegacyAnswer || longTermCommitment,
      previouslyAnswered,
      legacyPreserved: preserveLegacyAnswer,
      trigger: longTermCommitment ? 'primary_residence_and_5_plus_stay' : (preserveLegacyAnswer ? 'restored_legacy_answer' : 'not_triggered'),
      prompt: 'Since you’re planning around this home long term, one extra detail may help: have you made meaningful improvements or remodeling?',
      sourceFacts: longTermCommitment ? ['homeOwnership', 'stayIntent'] : []
    });
  }

  function knownFactSuppression(context = {}) {
    return Object.freeze({
      reviewReason: Boolean(context.reviewReasonInherited || context.reviewReasonKnown),
      currentCarrier: Boolean(context.currentCarrierInherited || context.currentCarrierKnown),
      currentCarrierTenure: Boolean(context.currentCarrierTenureInherited || context.currentCarrierTenureKnown)
    });
  }

  function nextFollowUp(context = {}) {
    const relationshipBranch = relationship(context.relationship || {});
    if (relationshipBranch.active && !relationshipBranch.previouslyAnswered) return relationshipBranch;
    const lifestyleBranch = lifestyle(context.lifestyle || {});
    if (lifestyleBranch.active && !lifestyleBranch.previouslyAnswered) return lifestyleBranch;
    return null;
  }

  return Object.freeze({
    VERSION,
    BUILD,
    CONTRACT_ID,
    relationship,
    lifestyle,
    knownFactSuppression,
    nextFollowUp,
    boundaries: Object.freeze({
      scoreFormulaChanged: false,
      recommendationEligibilityChanged: false,
      oneFollowUpAtATime: true,
      branchStateDurable: true
    })
  });
});
