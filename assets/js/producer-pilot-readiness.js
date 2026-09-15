(function (root, factory) {
  'use strict';
  const api = factory();
  root.CoverageFitProducerPilotReadiness = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const PROFILE_VERSION = 'PC-1.5';
  const CHECK_ORDER = Object.freeze(['record', 'workflow', 'continuity', 'document', 'device-output']);

  function text(value, fallback) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback || '';
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => freeze(value[key]));
    return Object.freeze(value);
  }

  function check(id, label, ready, detail, actionLabel, target, state) {
    return {
      id,
      label,
      ready: Boolean(ready),
      state: ready ? 'ready' : (state || 'attention'),
      detail,
      action: actionLabel && target ? { label: actionLabel, target } : null
    };
  }

  function build(snapshot, context) {
    const settings = context || {};
    const record = settings.record || snapshot?.consultation || null;
    const consultationId = text(record?.id || snapshot?.consultation?.id);
    const recordReady = snapshot?.state === 'ready' && Boolean(consultationId);
    const planReady = settings.plan?.state === 'ready';
    const checklistReady = settings.checklist?.checklist?.state === 'ready';
    const workflowReady = recordReady && planReady && checklistReady;
    const serverBacked = Boolean(record?.remote?.serverBacked);
    const connected = Boolean(settings.connection?.connected);
    const persistenceState = text(settings.persistenceState, 'device');
    const continuityReady = serverBacked && connected && persistenceState === 'secure';
    const documentHref = text(settings.documentHref, '/agent/consultation/');
    const documentReady = recordReady && settings.documentAvailable === true;
    const outputConfirmed = documentReady && settings.printPreviewConfirmed === true;

    const checks = [
      check(
        'record',
        'Active homeowner review',
        recordReady,
        recordReady ? 'The selected consultation record and completed assessment are loaded.' : 'Choose a saved homeowner consultation with a completed assessment.',
        'Choose consultation',
        '#workspaceTabInbox',
        'blocked'
      ),
      check(
        'workflow',
        'Guided consultation prepared',
        workflowReady,
        workflowReady ? 'The existing conversation plan and recoverable checklist are ready.' : 'Allow the existing conversation plan and checklist to finish preparing.',
        'Review consultation progress',
        '#consultationProgress',
        recordReady ? 'attention' : 'blocked'
      ),
      check(
        'continuity',
        'Secure save and recovery',
        continuityReady,
        continuityReady
          ? 'Working progress is saved with this server-backed consultation.'
          : !serverBacked
            ? 'Open a review delivered through the secure producer inbox for the live pilot.'
            : !connected
              ? 'Connect the secure producer inbox before beginning the live pilot.'
              : persistenceState === 'syncing' || persistenceState === 'pending'
                ? 'Wait for the current checklist checkpoint to finish secure synchronization.'
                : 'Make sure the consultation checkpoint is securely saved before beginning.',
        serverBacked ? 'Manage secure connection' : 'Open secure inbox setup',
        '#remoteInboxBar',
        recordReady ? 'attention' : 'blocked'
      ),
      check(
        'document',
        'Consultation Document available',
        documentReady,
        documentReady ? 'The selected consultation opens through the existing private document route.' : 'A saved consultation ID is required before the document can open.',
        'Open Consultation Document',
        documentHref,
        recordReady ? 'attention' : 'blocked'
      ),
      check(
        'device-output',
        'This device reviewed in Print Preview',
        outputConfirmed,
        outputConfirmed
          ? 'The producer confirmed every page in Print Preview for this consultation and open Workspace session.'
          : 'Open the document on this device, use the Print setup guide, and review every page before confirming.',
        'Open document and check output',
        documentHref,
        documentReady ? 'attention' : 'blocked'
      )
    ];

    const readyCount = checks.filter(item => item.ready).length;
    const blockers = checks.filter(item => !item.ready);
    const next = blockers[0] || null;
    const ready = readyCount === checks.length;
    const state = ready ? 'ready' : blockers.some(item => item.state === 'blocked') ? 'blocked' : 'attention';
    const action = ready
      ? { label: 'Begin guided consultation', target: '#consultationCommandCenter' }
      : next?.action || { label: 'Review pilot preflight', target: '#producerPilotReadiness' };

    return freeze({
      version: VERSION,
      profileVersion: PROFILE_VERSION,
      state,
      ready,
      consultationId,
      checks,
      summary: { ready: readyCount, total: checks.length, remaining: checks.length - readyCount },
      next: next ? { id: next.id, label: next.label, detail: next.detail } : null,
      action,
      guardrail: 'Pilot readiness confirms the operational consultation path only. It does not verify coverage, price, eligibility, underwriting, a carrier outcome, or that a live producer pilot has been completed.'
    });
  }

  return Object.freeze({ VERSION, PROFILE_VERSION, CHECK_ORDER, build });
});
