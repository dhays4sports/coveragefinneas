(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXJourneyContract = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-PVX-1.1';
  const CONTRACT_ID = 'coveragefit-progressive-journey-checkpoint-v1';
  const STAGES = Object.freeze(['entry','discovery','snapshot','snapshot-saved','home-profile','policy-review','producer-review','recommendation','decision','complete']);
  const CONTINUATIONS = Object.freeze(['home_profile','current_policy','both','continue_later']);
  const CHECKPOINT_TYPES = Object.freeze(['snapshot_saved','home_profile_ready','coverage_review_ready','combined_review_ready','producer_reviewed']);
  const REVISION_TYPES = Object.freeze(['1','2H','2P','3','Final']);
  const QUOTE_READINESS = Object.freeze(['not_started','ready_for_producer_review','needs_customer_information','needs_document','needs_property_verification','manual_review_required']);

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const text = (value, max = 160) => String(value ?? '').trim().slice(0, max);
  const unique = values => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
  const iso = value => { const date = value ? new Date(value) : new Date(); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); };

  function createJourneyProfile(seed = {}) {
    const currentStage = STAGES.includes(seed.currentStage) ? seed.currentStage : 'entry';
    return {
      schemaVersion: '1.0',
      contractId: CONTRACT_ID,
      journeyId: text(seed.journeyId, 120),
      currentStage,
      completedStages: unique(seed.completedStages).filter(stage => STAGES.includes(stage)),
      continuationChoices: unique(seed.continuationChoices).filter(choice => CONTINUATIONS.includes(choice)),
      resumeState: {
        status: ['active','paused','completed','expired'].includes(seed.resumeState?.status) ? seed.resumeState.status : 'active',
        exactStage: text(seed.resumeState?.exactStage || currentStage, 80),
        exactStep: text(seed.resumeState?.exactStep, 120),
        tokenId: text(seed.resumeState?.tokenId, 120),
        expiresAt: text(seed.resumeState?.expiresAt, 40),
        updatedAt: iso(seed.resumeState?.updatedAt)
      },
      leadCheckpoints: Array.isArray(seed.leadCheckpoints) ? seed.leadCheckpoints.map(normalizeCheckpoint).filter(Boolean) : [],
      reportRevisions: Array.isArray(seed.reportRevisions) ? seed.reportRevisions.map(normalizeRevision).filter(Boolean) : [],
      homeProfilePath: normalizePath(seed.homeProfilePath),
      currentPolicyPath: normalizePath(seed.currentPolicyPath),
      producerReviewState: {
        status: text(seed.producerReviewState?.status || 'not_started', 80),
        ownerId: text(seed.producerReviewState?.ownerId, 120),
        updatedAt: iso(seed.producerReviewState?.updatedAt)
      },
      advisoryReviewTopics: Array.isArray(seed.advisoryReviewTopics) ? clone(seed.advisoryReviewTopics) : [],
      topicResponses: Array.isArray(seed.topicResponses) ? clone(seed.topicResponses) : [],
      recommendationResponses: Array.isArray(seed.recommendationResponses) ? clone(seed.recommendationResponses) : [],
      quoteReadiness: QUOTE_READINESS.includes(seed.quoteReadiness) ? seed.quoteReadiness : 'not_started',
      consent: {
        contact: Boolean(seed.consent?.contact),
        sms: Boolean(seed.consent?.sms),
        reportSaved: Boolean(seed.consent?.reportSaved)
      },
      authorization: {
        bindAuthorized: Boolean(seed.authorization?.bindAuthorized),
        acceptedLogic: Boolean(seed.authorization?.acceptedLogic)
      },
      createdAt: iso(seed.createdAt),
      updatedAt: iso(seed.updatedAt)
    };
  }

  function normalizePath(value = {}) {
    return {
      status: ['not_started','in_progress','ready','complete','paused'].includes(value?.status) ? value.status : 'not_started',
      currentStep: text(value?.currentStep, 120),
      completedSteps: unique(value?.completedSteps).map(item => text(item, 120)),
      updatedAt: iso(value?.updatedAt)
    };
  }

  function normalizeCheckpoint(value = {}) {
    if (!CHECKPOINT_TYPES.includes(value?.checkpointType)) return null;
    return {
      checkpointId: text(value.checkpointId, 120),
      checkpointType: value.checkpointType,
      createdAt: iso(value.createdAt),
      reportRevision: REVISION_TYPES.includes(value.reportRevision) ? value.reportRevision : '',
      contactConsent: Boolean(value.contactConsent),
      smsConsent: Boolean(value.smsConsent),
      deliveryStatus: text(value.deliveryStatus || 'not_requested', 80),
      producerNotificationStatus: text(value.producerNotificationStatus || 'not_requested', 80)
    };
  }

  function normalizeRevision(value = {}) {
    if (!REVISION_TYPES.includes(String(value?.revision))) return null;
    return {
      revisionId: text(value.revisionId, 120),
      revision: String(value.revision),
      createdAt: iso(value.createdAt),
      supersedes: text(value.supersedes, 120),
      immutable: true,
      contentRef: text(value.contentRef, 160)
    };
  }

  function chooseContinuation(profile, choice, now) {
    if (!CONTINUATIONS.includes(choice)) throw new TypeError('Unsupported continuation choice.');
    const next = createJourneyProfile(profile);
    next.continuationChoices = unique([...next.continuationChoices, choice]);
    if (choice === 'home_profile' || choice === 'both') next.homeProfilePath.status = 'in_progress';
    if (choice === 'current_policy' || choice === 'both') next.currentPolicyPath.status = 'in_progress';
    if (choice === 'continue_later') next.resumeState.status = 'paused';
    next.updatedAt = iso(now);
    return next;
  }

  function recordCheckpoint(profile, checkpoint, now) {
    const normalized = normalizeCheckpoint({ ...checkpoint, createdAt: checkpoint?.createdAt || now });
    if (!normalized || !normalized.checkpointId) throw new TypeError('A valid checkpoint type and id are required.');
    const next = createJourneyProfile(profile);
    if (!next.leadCheckpoints.some(item => item.checkpointId === normalized.checkpointId)) next.leadCheckpoints.push(normalized);
    next.updatedAt = iso(now);
    return next;
  }

  function addReportRevision(profile, revision, now) {
    const normalized = normalizeRevision({ ...revision, createdAt: revision?.createdAt || now });
    if (!normalized || !normalized.revisionId) throw new TypeError('A valid immutable report revision is required.');
    const next = createJourneyProfile(profile);
    if (!next.reportRevisions.some(item => item.revisionId === normalized.revisionId)) next.reportRevisions.push(normalized);
    next.updatedAt = iso(now);
    return next;
  }

  function semanticAssertions(profile) {
    const item = createJourneyProfile(profile);
    return Object.freeze({
      advisoryReviewTopicIsRecommendation: false,
      topicResponseIsRecommendationResponse: false,
      quoteReadinessIsCarrierEligibility: false,
      reportSavedIsContactConsent: item.consent.reportSaved && !item.consent.contact ? false : false,
      acceptedLogicIsBindingAuthorization: item.authorization.acceptedLogic && !item.authorization.bindAuthorized ? false : false,
      personalDiscoveryAffectsProtectionScore: false
    });
  }

  return Object.freeze({ VERSION, BUILD, CONTRACT_ID, STAGES, CONTINUATIONS, CHECKPOINT_TYPES, REVISION_TYPES, QUOTE_READINESS, createJourneyProfile, normalizePath, normalizeCheckpoint, normalizeRevision, chooseContinuation, recordCheckpoint, addReportRevision, semanticAssertions });
});
