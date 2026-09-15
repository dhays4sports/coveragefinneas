(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXFoundation = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-PVX-UX-1.0';
  const CONTRACT_ID = 'coveragefit-pvx-consumer-experience-foundation-v1';
  const FEATURE_FLAG = 'cf_pvx_consumer_experience';
  const STORAGE_KEY = 'coveragefit_pvx_foundation_draft_v1';
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const COPY_LIMITS = Object.freeze({ kicker: 42, title: 92, description: 180, choiceLabel: 62, choiceDetail: 110, feedback: 140 });

  const SAMPLE_STEPS = Object.freeze([
    Object.freeze({
      id: 'shopping-reason',
      stage: 'Your goals',
      kicker: 'A quick start',
      title: 'What’s bringing you here today?',
      description: 'Choose the closest answer. You can always go back.',
      help: 'This keeps the experience centered on your reason for reviewing—not a generic coverage checklist.',
      type: 'single',
      autoAdvance: true,
      options: Object.freeze([
        { value: 'price-change', label: 'My price changed', detail: 'I want to understand my options.' },
        { value: 'buying-home', label: 'I’m buying a home', detail: 'I have a closing or move ahead.' },
        { value: 'renewal', label: 'My renewal is coming up', detail: 'It feels like the right time to review.' },
        { value: 'compare', label: 'I’m simply comparing', detail: 'I want a clear second look.' },
        { value: 'other', label: 'Something else' }
      ]),
      feedback: 'Got it. We’ll keep your reason for looking at the center of the review.'
    }),
    Object.freeze({
      id: 'improvement-priorities',
      stage: 'Your goals',
      kicker: 'What would feel better?',
      title: 'Besides price, what would you like to improve?',
      description: 'Choose any that matter. “Only price” is a completely valid answer.',
      help: 'Your priorities help shape what is worth discussing. They do not create a policy finding.',
      type: 'multi',
      options: Object.freeze([
        { value: 'understand', label: 'Understand what I have' },
        { value: 'claims', label: 'Feel better supported in a claim' },
        { value: 'agent', label: 'Have easier access to my agent' },
        { value: 'coordinate', label: 'Coordinate my insurance better' },
        { value: 'price-only', label: 'Price is my only priority', exclusive: true },
        { value: 'not-sure', label: 'Not sure yet', exclusive: true }
      ]),
      feedback: 'Helpful. We’ll use those priorities without assuming anything about your current policy.'
    }),
    Object.freeze({
      id: 'address-entry',
      stage: 'Your home',
      kicker: 'One detail to connect',
      title: 'Which home are we reviewing?',
      description: 'This is the only required text interaction in this foundation preview.',
      help: 'The address connects your answers to the right home. Technical property questions belong after your first Snapshot.',
      type: 'address',
      feedback: 'Thanks. We’ll keep the opening focused and save technical home details for later.'
    }),
    Object.freeze({
      id: 'address-confirmation',
      stage: 'Your home',
      kicker: 'Quick confirmation',
      title: 'Is this the home you want to review?',
      description: 'Confirm it once. You can edit it if something looks off.',
      help: 'Connected information is always shown for confirmation. It is never silently treated as verified.',
      type: 'confirmation',
      autoAdvance: true,
      feedback: 'Perfect. The home is connected for this preview.'
    }),
    Object.freeze({
      id: 'permission-to-advise',
      stage: 'Your Snapshot',
      kicker: 'One last preference',
      title: 'If Dylan sees something he would approach differently, are you open to seeing why?',
      description: 'This is permission to explain—not permission to change or bind coverage.',
      help: 'Your answer controls the conversation style. It is not recommendation buy-in or binding authorization.',
      type: 'single',
      autoAdvance: true,
      options: Object.freeze([
        { value: 'yes', label: 'Yes, show me why' },
        { value: 'maybe', label: 'Maybe—keep it simple' },
        { value: 'cost-first', label: 'Only if cost stays central' },
        { value: 'not-sure', label: 'Not sure yet' }
      ]),
      feedback: 'Understood. Dylan can meet you there without making assumptions.'
    })
  ]);

  const clone = value => JSON.parse(JSON.stringify(value));
  const nowIso = () => new Date().toISOString();
  const reducedMotion = () => Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  function initialState() {
    return { schemaVersion: '1.0', build: BUILD, stepIndex: 0, answers: {}, startedAt: nowIso(), updatedAt: nowIso(), completedAt: null };
  }

  function sanitizeState(value) {
    const state = value && typeof value === 'object' ? value : {};
    const stepIndex = Math.max(0, Math.min(SAMPLE_STEPS.length - 1, Number(state.stepIndex) || 0));
    return { ...initialState(), ...clone(state), stepIndex, answers: state.answers && typeof state.answers === 'object' ? clone(state.answers) : {} };
  }

  function progressFor(index, total = SAMPLE_STEPS.length) {
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeIndex = Math.max(0, Math.min(safeTotal - 1, Number(index) || 0));
    return { current: safeIndex + 1, total: safeTotal, percent: Math.round(((safeIndex + 1) / safeTotal) * 100), label: `Step ${safeIndex + 1} of ${safeTotal}` };
  }

  function validateCopy(step) {
    const failures = [];
    for (const key of ['kicker', 'title', 'description']) {
      if (String(step?.[key] || '').length > COPY_LIMITS[key]) failures.push(`${step.id}.${key}`);
    }
    for (const option of step?.options || []) {
      if (String(option.label || '').length > COPY_LIMITS.choiceLabel) failures.push(`${step.id}.choiceLabel`);
      if (String(option.detail || '').length > COPY_LIMITS.choiceDetail) failures.push(`${step.id}.choiceDetail`);
    }
    if (String(step?.feedback || '').length > COPY_LIMITS.feedback) failures.push(`${step.id}.feedback`);
    return failures;
  }

  function featureEnabled(locationLike = root.location, storage = root.localStorage) {
    let query = null;
    try { query = new URLSearchParams(locationLike?.search || ''); } catch (_) {}
    if (query?.get('preview') === '1' || query?.get('experience') === 'pvx') return true;
    try { return storage?.getItem?.(FEATURE_FLAG) === 'enabled'; } catch (_) { return false; }
  }

  function saveState(state, storage = root.localStorage) {
    const next = { ...sanitizeState(state), updatedAt: nowIso(), expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
    try { storage?.setItem?.(STORAGE_KEY, JSON.stringify(next)); return true; } catch (_) { return false; }
  }

  function loadState(storage = root.localStorage) {
    try {
      const parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) || 'null');
      if (!parsed || Date.parse(parsed.expiresAt || '') <= Date.now() || parsed.completedAt) return null;
      return sanitizeState(parsed);
    } catch (_) { return null; }
  }

  function clearState(storage = root.localStorage) {
    try { storage?.removeItem?.(STORAGE_KEY); } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function normalizeAddress(value = {}) {
    return {
      line1: String(value.line1 || '').trim().slice(0, 120),
      city: String(value.city || '').trim().slice(0, 80),
      state: String(value.state || 'CA').trim().toUpperCase().slice(0, 2),
      postalCode: String(value.postalCode || '').trim().slice(0, 10)
    };
  }

  function addressLabel(address) {
    const item = normalizeAddress(address);
    return [item.line1, [item.city, item.state].filter(Boolean).join(', '), item.postalCode].filter(Boolean).join(' ');
  }

  function emit(name, detail = {}) {
    const event = { eventName: name, build: BUILD, occurredAt: nowIso(), ...clone(detail) };
    try { root.dispatchEvent?.(new CustomEvent('coveragefit:pvx-event', { detail: event })); } catch (_) {}
    try { (root.dataLayer = root.dataLayer || []).push({ event: name, pvx: event }); } catch (_) {}
    return event;
  }

  function install() {
    const doc = root.document;
    if (!doc) return null;
    const flagBoundary = doc.getElementById('pvxFlagBoundary');
    const app = doc.getElementById('pvxApp');
    if (!featureEnabled()) {
      if (flagBoundary) flagBoundary.hidden = false;
      return { enabled: false };
    }
    if (app) app.hidden = false;

    const elements = Object.fromEntries([
      'pvxStageLabel','pvxProgressText','pvxProgress','pvxProgressBar','pvxQuestion','pvxQuestionKicker','pvxQuestionTitle',
      'pvxQuestionDescription','pvxHelpToggle','pvxHelp','pvxForm','pvxControl','pvxValidation','pvxBack','pvxContinue',
      'pvxTransition','pvxTransitionMessage','pvxLoading','pvxError','pvxRetry','pvxComplete','pvxCompleteFacts','pvxRetake',
      'pvxLive','pvxResumeNote','pvxStartOver','pvxSaveExit','pvxSaveDialog','pvxKeepGoing','pvxMain'
    ].map(id => [id, doc.getElementById(id)]));

    let restored = loadState();
    let state = restored || initialState();
    let transitionTimer = null;
    const errorRequested = (() => { try { return new URLSearchParams(root.location.search).get('simulateError') === '1'; } catch (_) { return false; } })();

    function announce(message) {
      if (elements.pvxLive) elements.pvxLive.textContent = '';
      root.setTimeout?.(() => { if (elements.pvxLive) elements.pvxLive.textContent = message; }, 20);
    }

    function persist() { saveState(state); }

    function hidePanels() {
      for (const key of ['pvxQuestion','pvxTransition','pvxLoading','pvxError','pvxComplete']) if (elements[key]) elements[key].hidden = true;
    }

    function selectedValues(step) {
      const stored = state.answers[step.id];
      return Array.isArray(stored) ? stored : stored ? [stored] : [];
    }

    function renderSingle(step) {
      const selected = String(state.answers[step.id] || '');
      return `<div class="pvx-choices" role="radiogroup" aria-labelledby="pvxQuestionTitle">${step.options.map((option, index) => `
        <button class="pvx-choice" type="button" role="radio" aria-checked="${selected === option.value}" data-value="${escapeHtml(option.value)}" tabindex="${selected ? (selected === option.value ? '0' : '-1') : (index === 0 ? '0' : '-1')}">
          <span class="pvx-choice__copy"><strong>${escapeHtml(option.label)}</strong>${option.detail ? `<span>${escapeHtml(option.detail)}</span>` : ''}</span><span class="pvx-choice__mark" aria-hidden="true">✓</span>
        </button>`).join('')}</div>`;
    }

    function renderMulti(step) {
      const selected = selectedValues(step);
      return `<div class="pvx-choices" aria-labelledby="pvxQuestionTitle">${step.options.map(option => `
        <button class="pvx-choice pvx-choice--multi" type="button" aria-pressed="${selected.includes(option.value)}" data-value="${escapeHtml(option.value)}">
          <span class="pvx-choice__copy"><strong>${escapeHtml(option.label)}</strong></span><span class="pvx-choice__mark" aria-hidden="true">✓</span>
        </button>`).join('')}</div>`;
    }

    function renderAddress() {
      const address = normalizeAddress(state.answers['address-entry']);
      return `<div class="pvx-address">
        <label class="pvx-field"><span>Street address</span><input name="line1" autocomplete="street-address" maxlength="120" value="${escapeHtml(address.line1)}" placeholder="123 Main Street" required /></label>
        <div class="pvx-field-grid">
          <label class="pvx-field"><span>City</span><input name="city" autocomplete="address-level2" maxlength="80" value="${escapeHtml(address.city)}" required /></label>
          <label class="pvx-field"><span>State</span><input name="state" autocomplete="address-level1" maxlength="2" value="${escapeHtml(address.state)}" required /></label>
        </div>
        <label class="pvx-field"><span>ZIP code</span><input name="postalCode" autocomplete="postal-code" inputmode="numeric" maxlength="10" pattern="[0-9]{5}(-[0-9]{4})?" value="${escapeHtml(address.postalCode)}" required /><small>No year built, roof, foundation, pool, or other technical details yet.</small></label>
      </div>`;
    }

    function renderConfirmation() {
      const address = state.answers['address-entry'] || {};
      return `<div class="pvx-confirmation"><span>Home to review</span><strong>${escapeHtml(addressLabel(address))}</strong><div class="pvx-confirmation__actions"><button class="pvx-button pvx-button--primary" type="button" data-confirm="yes">Yes, that’s right</button><button class="pvx-button pvx-button--quiet" type="button" data-confirm="edit">Edit address</button></div></div>`;
    }

    function updateContinue(step) {
      const value = state.answers[step.id];
      const hidden = step.autoAdvance || step.type === 'confirmation';
      elements.pvxContinue.hidden = hidden;
      if (!hidden) elements.pvxContinue.disabled = step.type === 'multi' && (!Array.isArray(value) || !value.length);
    }

    function render() {
      hidePanels();
      const step = SAMPLE_STEPS[state.stepIndex];
      const progress = progressFor(state.stepIndex);
      elements.pvxQuestion.hidden = false;
      elements.pvxQuestionKicker.textContent = step.kicker;
      elements.pvxQuestionTitle.textContent = step.title;
      elements.pvxQuestionDescription.textContent = step.description || '';
      elements.pvxStageLabel.textContent = step.stage;
      elements.pvxProgressText.textContent = progress.label;
      elements.pvxProgress.setAttribute('aria-valuenow', String(progress.percent));
      elements.pvxProgressBar.style.width = `${progress.percent}%`;
      elements.pvxHelp.textContent = step.help || '';
      elements.pvxHelp.hidden = true;
      elements.pvxHelpToggle.setAttribute('aria-expanded', 'false');
      elements.pvxBack.hidden = state.stepIndex === 0;
      elements.pvxValidation.hidden = true;
      elements.pvxValidation.textContent = '';
      elements.pvxControl.innerHTML = step.type === 'single' ? renderSingle(step) : step.type === 'multi' ? renderMulti(step) : step.type === 'address' ? renderAddress() : renderConfirmation();
      updateContinue(step);
      bindControls(step);
      elements.pvxMain.focus({ preventScroll: true });
      announce(`${step.stage}. ${step.title}. ${progress.label}.`);
      emit('pvx_step_viewed', { stepId: step.id, stage: step.stage, stepNumber: progress.current });
    }

    function chooseSingle(step, button) {
      const value = button.dataset.value;
      state.answers[step.id] = value;
      state.updatedAt = nowIso();
      elements.pvxControl.querySelectorAll('[role="radio"]').forEach(item => {
        const selected = item === button;
        item.setAttribute('aria-checked', String(selected));
        item.tabIndex = selected ? 0 : -1;
      });
      persist();
      emit('pvx_answer_saved', { stepId: step.id, answerType: 'single' });
      if (step.autoAdvance) transition(step.feedback);
    }

    function chooseMulti(step, button) {
      const value = button.dataset.value;
      const option = step.options.find(item => item.value === value);
      let selected = selectedValues(step);
      if (option?.exclusive) selected = selected.includes(value) ? [] : [value];
      else {
        selected = selected.filter(item => !step.options.find(candidate => candidate.value === item)?.exclusive);
        selected = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
      }
      state.answers[step.id] = selected;
      state.updatedAt = nowIso();
      persist();
      elements.pvxControl.querySelectorAll('.pvx-choice').forEach(item => item.setAttribute('aria-pressed', String(selected.includes(item.dataset.value))));
      updateContinue(step);
      emit('pvx_answer_saved', { stepId: step.id, answerType: 'multi', answerCount: selected.length });
    }

    function bindControls(step) {
      if (step.type === 'single') {
        const buttons = [...elements.pvxControl.querySelectorAll('[role="radio"]')];
        buttons.forEach((button, index) => {
          button.addEventListener('click', () => chooseSingle(step, button));
          button.addEventListener('keydown', event => {
            if (!['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(event.key)) return;
            event.preventDefault();
            const delta = ['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1;
            const next = buttons[(index + delta + buttons.length) % buttons.length];
            buttons.forEach(item => { item.tabIndex = item === next ? 0 : -1; });
            next.focus();
          });
        });
      }
      if (step.type === 'multi') elements.pvxControl.querySelectorAll('.pvx-choice').forEach(button => button.addEventListener('click', () => chooseMulti(step, button)));
      if (step.type === 'confirmation') {
        elements.pvxControl.querySelector('[data-confirm="yes"]')?.addEventListener('click', () => {
          state.answers[step.id] = { confirmed: true, value: clone(state.answers['address-entry']), source: 'customer-confirmed' };
          persist();
          emit('pvx_answer_saved', { stepId: step.id, answerType: 'confirmation' });
          transition(step.feedback);
        });
        elements.pvxControl.querySelector('[data-confirm="edit"]')?.addEventListener('click', () => { state.stepIndex = 2; persist(); render(); });
      }
    }

    function validateAndStore(step) {
      if (step.type === 'multi') {
        if (!selectedValues(step).length) return 'Choose at least one answer or select “Not sure yet.”';
        return '';
      }
      if (step.type === 'address') {
        const data = new FormData(elements.pvxForm);
        const address = normalizeAddress(Object.fromEntries(data.entries()));
        if (!address.line1 || !address.city || !/^[A-Z]{2}$/.test(address.state) || !/^\d{5}(-\d{4})?$/.test(address.postalCode)) return 'Enter a complete street address, city, two-letter state, and valid ZIP code.';
        state.answers[step.id] = { ...address, source: 'customer-reported' };
        persist();
        emit('pvx_answer_saved', { stepId: step.id, answerType: 'address', containsPersonalData: true });
      }
      return '';
    }

    function transition(message) {
      const step = SAMPLE_STEPS[state.stepIndex];
      hidePanels();
      elements.pvxTransitionMessage.textContent = message || 'Got it.';
      elements.pvxTransition.hidden = false;
      announce(message || 'Answer saved.');
      const wait = reducedMotion() ? 0 : 260;
      root.clearTimeout?.(transitionTimer);
      transitionTimer = root.setTimeout?.(() => advance(step), wait);
    }

    function advance(step) {
      if (state.stepIndex >= SAMPLE_STEPS.length - 1) return complete();
      state.stepIndex += 1;
      persist();
      emit('pvx_step_completed', { stepId: step.id, nextStepId: SAMPLE_STEPS[state.stepIndex].id });
      render();
    }

    function complete() {
      hidePanels();
      elements.pvxLoading.hidden = false;
      elements.pvxProgress.setAttribute('aria-valuenow', '100');
      elements.pvxProgressBar.style.width = '100%';
      emit('pvx_foundation_preview_processing', { artificialDelay: false });
      root.setTimeout?.(() => {
        if (errorRequested) {
          hidePanels();
          elements.pvxError.hidden = false;
          announce('The preview could not load. Your answers remain saved.');
          emit('pvx_error_shown', { recoverable: true, statePreserved: true });
          return;
        }
        state.completedAt = nowIso();
        saveState(state);
        hidePanels();
        elements.pvxComplete.hidden = false;
        const shopping = SAMPLE_STEPS[0].options.find(item => item.value === state.answers['shopping-reason'])?.label || 'Saved';
        const priorities = selectedValues(SAMPLE_STEPS[1]).map(value => SAMPLE_STEPS[1].options.find(item => item.value === value)?.label).filter(Boolean).join(', ');
        elements.pvxCompleteFacts.innerHTML = `<div><span>Why you’re reviewing</span><strong>${escapeHtml(shopping)}</strong></div><div><span>What you want improved</span><strong>${escapeHtml(priorities || 'Not sure yet')}</strong></div><div><span>Home connected</span><strong>${escapeHtml(addressLabel(state.answers['address-entry']))}</strong></div>`;
        announce('Foundation preview complete. Your answers are ready.');
        emit('pvx_foundation_preview_completed', { stepCount: SAMPLE_STEPS.length, contactCollected: false, scoreCreated: false });
      }, reducedMotion() ? 0 : 180);
    }

    elements.pvxForm.addEventListener('submit', event => {
      event.preventDefault();
      const step = SAMPLE_STEPS[state.stepIndex];
      const error = validateAndStore(step);
      if (error) { elements.pvxValidation.textContent = error; elements.pvxValidation.hidden = false; announce(error); return; }
      transition(step.feedback);
    });
    elements.pvxBack.addEventListener('click', () => { if (state.stepIndex > 0) { state.stepIndex -= 1; persist(); emit('pvx_back_used', { stepId: SAMPLE_STEPS[state.stepIndex].id }); render(); } });
    elements.pvxHelpToggle.addEventListener('click', () => { const open = elements.pvxHelp.hidden; elements.pvxHelp.hidden = !open; elements.pvxHelpToggle.setAttribute('aria-expanded', String(open)); });
    elements.pvxSaveExit.addEventListener('click', () => { persist(); elements.pvxSaveDialog.showModal?.(); emit('pvx_save_exit_opened', { stepId: SAMPLE_STEPS[state.stepIndex].id }); });
    elements.pvxKeepGoing.addEventListener('click', () => elements.pvxSaveDialog.close?.());
    elements.pvxStartOver.addEventListener('click', () => { clearState(); state = initialState(); elements.pvxResumeNote.hidden = true; render(); });
    elements.pvxRetake.addEventListener('click', () => { clearState(); state = initialState(); render(); });
    elements.pvxRetry.addEventListener('click', () => { hidePanels(); elements.pvxComplete.hidden = false; announce('Your saved answers were restored.'); });

    if (restored) elements.pvxResumeNote.hidden = false;
    emit('pvx_experience_started', { resumed: Boolean(restored), featureFlag: FEATURE_FLAG });
    render();
    return { enabled: true, getState: () => clone(state), render };
  }

  if (root.document) root.addEventListener('DOMContentLoaded', install, { once: true });

  return Object.freeze({ VERSION, BUILD, CONTRACT_ID, FEATURE_FLAG, STORAGE_KEY, TTL_MS, COPY_LIMITS, SAMPLE_STEPS, initialState, sanitizeState, progressFor, validateCopy, featureEnabled, saveState, loadState, clearState, normalizeAddress, addressLabel, escapeHtml, emit, install });
});
