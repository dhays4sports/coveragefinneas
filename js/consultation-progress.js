(function (root, factory) {
  'use strict';
  const api = factory();
  root.CoverageFitConsultationProgress = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = '1.0';
  const STAGE_ORDER = Object.freeze(['understand', 'verify', 'discuss', 'recommend', 'decide', 'next-step']);
  const DISPOSITION_LABELS = Object.freeze({
    review_received: 'Review received',
    contact_attempted: 'Contact attempted',
    consultation_scheduled: 'Consultation scheduled',
    consultation_completed: 'Consultation completed',
    proposal_prepared: 'Proposal prepared',
    decision_pending: 'Decision pending',
    closed: 'Closed'
  });

  function text(value, fallback) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback || '';
  }

  function itemsForPhases(checklistState, phaseIds) {
    const ids = new Set(phaseIds);
    return (Array.isArray(checklistState?.checklist?.items) ? checklistState.checklist.items : [])
      .filter(item => ids.has(text(item?.phaseId)));
  }

  function phaseProgress(checklistState, phaseIds) {
    const items = itemsForPhases(checklistState, phaseIds);
    const completed = items.filter(item => item.status === 'complete').length;
    return { total: items.length, completed, complete: items.length > 0 && completed === items.length };
  }

  function recommendationProgress(plan) {
    const items = Array.isArray(plan?.items) ? plan.items : [];
    const verified = items.filter(item => Boolean(item?.verified)).length;
    const deferred = items.filter(item => !item?.verified && item?.decision === 'defer').length;
    const handled = verified + deferred;
    const decided = items.filter(item => text(item?.decision, 'undecided') !== 'undecided').length;
    const started = items.some(item => item?.verified || text(item?.decision, 'undecided') !== 'undecided' || text(item?.producerReason));
    return {
      total: items.length,
      verified,
      deferred,
      handled,
      decided,
      started,
      verificationComplete: items.length > 0 && handled === items.length,
      recommendationComplete: items.length > 0 && decided === items.length
    };
  }

  function currentStageId(context, recommendation, checklistState) {
    const stage = text(context?.disposition?.stage, 'review_received');
    if (stage === 'closed') return '';
    if (['consultation_completed', 'proposal_prepared', 'decision_pending'].includes(stage)) return 'decide';
    const phase = text(checklistState?.currentPhase || checklistState?.checklist?.currentPhaseId);
    if (phase === 'close' || recommendation.started) return 'recommend';
    if (['review', 'connect'].includes(phase)) return 'discuss';
    if (phase === 'context') return 'verify';
    return 'understand';
  }

  function build(snapshot, context) {
    const checklist = context?.checklist || null;
    const recommendation = recommendationProgress(context?.recommendationPlan);
    const opening = phaseProgress(checklist, ['opening']);
    const verificationConversation = phaseProgress(checklist, ['context']);
    const discussion = phaseProgress(checklist, ['review', 'connect']);
    const disposition = context?.disposition || {};
    const followUp = context?.followUp || {};
    const dispositionStage = text(disposition.stage, 'review_received');
    const followUpState = text(followUp.state, 'none');
    const ready = snapshot?.state === 'ready';
    const closed = dispositionStage === 'closed';
    const nextStepComplete = closed || ['scheduled', 'completed'].includes(followUpState);
    const currentId = currentStageId(context, recommendation, checklist);
    const currentIndex = currentId ? STAGE_ORDER.indexOf(currentId) : STAGE_ORDER.length;
    const handledLabel = recommendation.deferred
      ? `${recommendation.verified} verified · ${recommendation.deferred} deferred`
      : `${recommendation.verified} of ${recommendation.total} verified`;
    const stageDefinitions = [
      {
        id: 'understand', label: 'Understand', target: '#consultationCommandCenter',
        complete: ready && opening.complete,
        summary: opening.complete ? 'Homeowner context reviewed' : 'Start with the homeowner’s story',
        detail: opening.complete
          ? 'The opening consultation steps are complete.'
          : 'Review who the homeowner is, why the review exists, and the priorities CoverageFit identified.',
        actionLabel: 'Review command center'
      },
      {
        id: 'verify', label: 'Verify', target: '#consultationCommandVerify',
        complete: verificationConversation.complete && recommendation.verificationComplete,
        summary: recommendation.total ? handledLabel : 'Prepare verification work',
        detail: recommendation.total
          ? `${verificationConversation.completed} of ${verificationConversation.total} context steps complete. Confirm each finding before relying on it; a deferred item remains explicitly unresolved.`
          : 'Review known, inferred, missing, and needs-confirmation information before advising.',
        actionLabel: 'Review verification'
      },
      {
        id: 'discuss', label: 'Discuss', target: '#guidedQuestionsPanel',
        complete: discussion.complete,
        summary: discussion.total ? `${discussion.completed} of ${discussion.total} discussion steps complete` : 'Prepare assessment-driven questions',
        detail: 'Use the guided questions and conversation map to explore the homeowner’s priorities and open details.',
        actionLabel: 'Continue discussion'
      },
      {
        id: 'recommend', label: 'Recommend', target: '#recommendationBuilder',
        complete: recommendation.recommendationComplete,
        summary: recommendation.total ? `${recommendation.decided} of ${recommendation.total} findings decided` : 'No ranked plan prepared',
        detail: 'Apply producer judgment only after verification, then record the reasoning without creating a carrier proposal.',
        actionLabel: 'Build recommendation plan'
      },
      {
        id: 'decide', label: 'Decide', target: '#consultationDispositionTitle',
        complete: closed,
        summary: closed ? 'Final outcome recorded' : DISPOSITION_LABELS[dispositionStage] || 'Review received',
        detail: closed
          ? 'The consultation record contains a final disposition.'
          : 'Confirm what the homeowner chose, what remains pending, and the correct consultation stage.',
        actionLabel: 'Record stage and result'
      },
      {
        id: 'next-step', label: 'Next step', target: context?.serverBacked ? '#consultationFollowUpTitle' : '#consultationAfterTitle',
        complete: nextStepComplete,
        summary: closed ? 'Consultation closed' : followUpState === 'completed' ? 'Follow-up completed' : followUpState === 'scheduled' ? 'Follow-up scheduled' : 'Next action not recorded',
        detail: context?.serverBacked
          ? 'Schedule or complete the next touchpoint so the consultation has a clear owner and action.'
          : 'Record the disposition and a clear note for the next touchpoint. Secure follow-up scheduling is available for synchronized records.',
        actionLabel: context?.serverBacked ? 'Manage next step' : 'Record next step'
      }
    ];

    let stages = stageDefinitions.map((stage, index) => {
      let state = stage.complete ? 'complete' : 'upcoming';
      if (!stage.complete && stage.id === currentId) state = 'current';
      else if (!stage.complete && index < currentIndex) state = 'attention';
      return Object.freeze({ ...stage, number: index + 1, state });
    });
    if (!currentId && stages.some(stage => !stage.complete)) {
      const firstIncomplete = stages.findIndex(stage => !stage.complete);
      stages = stages.map((stage, index) => Object.freeze({ ...stage, state: index === firstIncomplete ? 'current' : stage.state }));
    }
    const current = stages.find(stage => stage.state === 'current') || stages.find(stage => !stage.complete) || stages[stages.length - 1];
    const completed = stages.filter(stage => stage.complete).length;
    const attention = stages.filter(stage => stage.state === 'attention').length;
    return Object.freeze({
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      state: completed === stages.length ? 'complete' : attention ? 'attention' : 'active',
      stages: Object.freeze(stages),
      summary: Object.freeze({ total: stages.length, completed, attention, percent: Math.round((completed / stages.length) * 100) }),
      current: Object.freeze({ id: current.id, label: current.label, summary: current.summary, detail: current.detail, actionLabel: current.actionLabel, target: current.target }),
      guardrail: 'Progress is derived from the existing consultation record. CoverageFit does not convert incomplete, inferred, or homeowner-reported information into a verified fact.'
    });
  }

  return Object.freeze({ VERSION, SCHEMA_VERSION, STAGE_ORDER, build });
});
