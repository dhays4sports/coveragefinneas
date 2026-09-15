(() => {
  'use strict';

  const config = window.COVERAGEFIT_CONFIG || {};
  const VERSION = '1.0.0';
  const BUILD = 'ASMT-1.7';
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const STORAGE_PREFIX = 'coveragefit_assessment_draft_v1';
  const PAUSE_NOTICE_KEY = 'coveragefit_assessment_pause_notice_v1';
  const slug = String(config.slug || 'assessment').trim().toLowerCase() || 'assessment';
  const storageKey = `${STORAGE_PREFIX}:${slug}`;

  const safeClone = value => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };

  const contextSessionId = () => String(
    window.CoverageFitPersonalization?.get?.()?.sessionId
      || window.CoverageFitAssessmentPrefill?.profile?.integration?.sessionId
      || window.CoverageFitAssessmentPrefill?.context?.sessionId
      || ''
  ).trim();

  const track = (event, properties = {}) => {
    window.CoverageFitAnalytics?.track(event, {
      assessment: slug,
      continuityVersion: VERSION,
      ...properties
    });
  };

  const removeStoredDraft = () => {
    try { localStorage.removeItem(storageKey); } catch (_) {}
  };

  const parseStoredDraft = () => {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (_) {}
    if (!draft || typeof draft !== 'object') return null;

    const expiresAt = Date.parse(draft.expiresAt || '');
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      removeStoredDraft();
      track('assessment_draft_expired', {
        draftUpdatedAt: draft.updatedAt || '',
        answerCount: Number(draft.answerCount || Object.keys(draft.selections || {}).length || 0)
      });
      return null;
    }

    const activeSessionId = contextSessionId();
    const draftSessionId = String(draft.sessionId || '').trim();
    if (activeSessionId && draftSessionId && activeSessionId !== draftSessionId) {
      removeStoredDraft();
      track('assessment_restarted', {
        reason: 'new_intake_context',
        priorAnswerCount: Number(draft.answerCount || Object.keys(draft.selections || {}).length || 0)
      });
      return null;
    }

    return draft;
  };

  let activeDraft = parseStoredDraft();

  const meaningfulDraft = draft => Boolean(
    draft?.propertyConfirmed
      || draft?.paused
      || Number(draft?.currentIndex || 0) > 0
      || Object.keys(draft?.selections || {}).length
      || draft?.earlyInsightShown
  );

  const writeDraft = (updates = {}, options = {}) => {
    const now = new Date();
    const previous = activeDraft || {};
    const next = {
      schemaVersion: '1.0',
      continuityVersion: VERSION,
      build: BUILD,
      assessment: slug,
      sessionId: contextSessionId() || previous.sessionId || '',
      createdAt: previous.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
      status: options.status || updates.status || previous.status || 'active',
      paused: Boolean(options.paused ?? updates.paused ?? previous.paused),
      ...previous,
      ...safeClone(updates)
    };

    next.answerCount = Object.keys(next.selections || {}).length;
    next.updatedAt = now.toISOString();
    next.expiresAt = new Date(now.getTime() + TTL_MS).toISOString();

    if (!meaningfulDraft(next) && !options.force) return null;

    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      activeDraft = next;
      return safeClone(next);
    } catch (_) {
      return null;
    }
  };

  const clear = () => {
    activeDraft = null;
    removeStoredDraft();
  };

  const restart = (reason = 'homeowner_selected_start_over') => {
    const previous = activeDraft;
    clear();
    track('assessment_restarted', {
      reason,
      priorAnswerCount: Number(previous?.answerCount || Object.keys(previous?.selections || {}).length || 0),
      priorQuestionKey: previous?.currentQuestionKey || ''
    });
  };

  const markCompleted = (details = {}) => {
    const previous = activeDraft;
    track('assessment_continuity_completed', {
      resumed: Boolean(previous?.resumedAt),
      answerCount: Number(details.answerCount || previous?.answerCount || 0),
      questionCount: Number(details.questionCount || 0),
      durationSeconds: Number(details.durationSeconds || 0)
    });
    clear();
  };

  const showDialog = dialog => {
    if (!dialog) return;
    const nativeShowModal = dialog.showModal;
    if (typeof nativeShowModal === 'function') {
      if (!dialog.open) Reflect.apply(nativeShowModal, dialog, []);
      return;
    }
    dialog.setAttribute('open', '');
    dialog.classList.add('is-fallback-open');
  };

  const closeDialog = dialog => {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    dialog.removeAttribute('open');
    dialog.classList.remove('is-fallback-open');
  };

  const saveExitButton = document.getElementById('saveExitBtn');
  const saveExitDialog = document.getElementById('saveExitDialog');
  const continueReviewButton = document.getElementById('continueReviewBtn');
  const confirmSaveExitButton = document.getElementById('confirmSaveExitBtn');
  const resumeDialog = document.getElementById('resumeDraftDialog');
  const continueDraftButton = document.getElementById('continueDraftBtn');
  const startOverDraftButton = document.getElementById('startOverDraftBtn');
  const resumeProgress = document.getElementById('resumeDraftProgress');
  const resumeDetail = document.getElementById('resumeDraftDetail');

  saveExitButton?.addEventListener('click', () => showDialog(saveExitDialog));
  continueReviewButton?.addEventListener('click', () => closeDialog(saveExitDialog));

  saveExitDialog?.addEventListener('click', event => {
    if (event.target === saveExitDialog) closeDialog(saveExitDialog);
  });

  confirmSaveExitButton?.addEventListener('click', () => {
    const saved = writeDraft({
      status: 'paused',
      paused: true,
      pausedAt: new Date().toISOString()
    }, { force: true, status: 'paused', paused: true });

    track('assessment_paused', {
      answerCount: Number(saved?.answerCount || 0),
      currentQuestionKey: saved?.currentQuestionKey || '',
      currentIndex: Number(saved?.currentIndex || 0),
      propertyConfirmed: Boolean(saved?.propertyConfirmed)
    });

    try {
      sessionStorage.setItem(PAUSE_NOTICE_KEY, JSON.stringify({
        assessment: slug,
        pausedAt: new Date().toISOString(),
        expiresAt: saved?.expiresAt || ''
      }));
    } catch (_) {}

    window.location.href = '/home/?review_saved=1';
  });

  continueDraftButton?.addEventListener('click', () => {
    const now = new Date().toISOString();
    activeDraft = writeDraft({
      status: 'active',
      paused: false,
      resumedAt: now
    }, { force: true, status: 'active', paused: false });

    track('assessment_resumed', {
      answerCount: Number(activeDraft?.answerCount || 0),
      currentQuestionKey: activeDraft?.currentQuestionKey || '',
      currentIndex: Number(activeDraft?.currentIndex || 0),
      propertyConfirmed: Boolean(activeDraft?.propertyConfirmed)
    });

    closeDialog(resumeDialog);
    document.querySelector('#advisoryOpening:not([hidden]), #advisoryRelationship:not([hidden]), #advisoryLifestyle:not([hidden]), #advisoryOutcome:not([hidden]), .question, [data-property-confirmation]')?.scrollIntoView?.({ block: 'start' });
  });

  startOverDraftButton?.addEventListener('click', () => {
    restart('homeowner_selected_start_over');
    window.location.replace('/assessment/?restart=1');
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('restart') === '1') {
    clear();
    params.delete('restart');
    const cleanQuery = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash}`);
  } else if (activeDraft && meaningfulDraft(activeDraft)) {
    const total = Number(activeDraft.questionCount || 0);
    const index = Math.max(0, Number(activeDraft.currentIndex || 0));
    const step = total ? Math.min(index + 1, total) : index + 1;
    const openingPending = Boolean(activeDraft.advisoryOpening && !activeDraft.advisoryOpening.completed);
    const relationshipPending = Boolean(
      activeDraft.advisoryOpening?.completed
      && activeDraft.advisoryRelationship
      && !activeDraft.advisoryRelationship.completed
    );
    const lifestylePending = Boolean(
      activeDraft.advisoryOpening?.completed
      && activeDraft.advisoryRelationship?.completed
      && activeDraft.advisoryLifestyle
      && !activeDraft.advisoryLifestyle.completed
    );
    const outcomePending = Boolean(
      activeDraft.advisoryOpening?.completed
      && activeDraft.advisoryRelationship?.completed
      && activeDraft.advisoryLifestyle?.completed
      && activeDraft.advisoryOutcome
      && !activeDraft.advisoryOutcome.completed
    );
    if (resumeProgress) resumeProgress.textContent = openingPending
      ? 'Your review setup is saved'
      : (relationshipPending ? 'Your current-insurance context is saved' : (lifestylePending ? 'Your home-life context is saved' : (outcomePending ? 'What matters most is saved' : (total ? `Question ${step} of ${total}` : `Your review is saved`))));
    if (resumeDetail) {
      resumeDetail.textContent = openingPending
        ? 'We saved the context you started sharing. Continue with the two opening questions or start over.'
        : (relationshipPending
          ? 'We saved what you started sharing about your current insurance relationship. Continue there or start over.'
          : (lifestylePending
            ? 'We saved what you started sharing about how the home fits your day-to-day life. Continue there or start over.'
            : (outcomePending
              ? 'We saved the outcomes you started prioritizing. Continue there or start over.'
              : (activeDraft.paused
              ? 'Your answers were saved on this device. Continue where you left off or start a new review.'
              : 'We found an unfinished review saved on this device. Continue where you left off or start over.'))));
    }
    requestAnimationFrame(() => showDialog(resumeDialog));
  }

  window.CoverageFitAssessmentContinuity = Object.freeze({
    VERSION,
    BUILD,
    TTL_MS,
    STORAGE_KEY: storageKey,
    PAUSE_NOTICE_KEY,
    getDraft: () => safeClone(activeDraft),
    save: writeDraft,
    clear,
    restart,
    markCompleted,
    isActive: () => Boolean(activeDraft),
    hasMeaningfulDraft: () => meaningfulDraft(activeDraft)
  });
})();
