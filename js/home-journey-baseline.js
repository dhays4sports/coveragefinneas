(() => {
  'use strict';

  const VERSION = '1.0';
  const BUILD = 'CF-HOME-2.1';
  const CONTRACT = 'home-review-journey-v1';
  const SOURCE_EVENTS = Object.freeze({
    assessment_started: Object.freeze({ event: 'home_assessment_started', stage: 'assessment' }),
    assessment_completed: Object.freeze({ event: 'home_assessment_completed', stage: 'completion' })
  });
  const forwarded = new Set();

  const clean = (value, max = 120) => String(value || '')
    .trim()
    .replace(/[<>\u0000-\u001F\u007F]/g, '')
    .slice(0, max);

  function receiverContext() {
    const personalization = window.CoverageFitPersonalization?.get?.() || null;
    const handoff = window.CoverageFitConversionHandoff?.get?.() || null;
    const journey = personalization?.journey || {};
    const assessment = clean(journey.assessment || handoff?.assessment || 'home', 40).toLowerCase();
    const trustedHomeHandoff = Boolean(
      handoff?.flags?.trustedContract
      && handoff?.flags?.isHomeHandoff
      && assessment === 'home'
    );
    return {
      trustedHomeHandoff,
      senderBuild: clean(journey.senderBuild || handoff?.senderBuild, 80),
      leadCaptureStatus: clean(journey.leadCaptureStatus, 40),
      hasSemanticContext: Boolean(journey.homeReviewGoal || journey.housingContext || journey.reviewTiming)
    };
  }

  function forward(sourceEvent) {
    const mapping = SOURCE_EVENTS[sourceEvent];
    if (!mapping || forwarded.has(mapping.event)) return false;
    const context = receiverContext();
    if (!context.trustedHomeHandoff) return false;
    forwarded.add(mapping.event);
    window.CoverageFitAnalytics?.track(mapping.event, {
      build: BUILD,
      journeyContract: CONTRACT,
      stage: mapping.stage,
      assessment: 'home',
      senderBuild: context.senderBuild,
      leadCaptureStatus: context.leadCaptureStatus,
      semanticContextSet: context.hasSemanticContext
    });
    return true;
  }

  window.addEventListener('coveragefit:event', event => {
    forward(event?.detail?.event || '');
  });

  window.CoverageFitHomeJourneyBaseline = Object.freeze({
    VERSION,
    BUILD,
    CONTRACT,
    SOURCE_EVENTS,
    getContext: receiverContext,
    forward
  });
})();
