(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryOpening = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.4';
  const CONTRACT_ID = 'coveragefit-advisory-opening-v1';
  const SOURCE = 'coveragefit_assessment';

  const REASONS = Object.freeze([
    Object.freeze({ key: 'price_increase', label: 'My insurance is getting expensive' }),
    Object.freeze({ key: 'comparing_options', label: 'I’m comparing options' }),
    Object.freeze({ key: 'buying_home', label: 'I’m buying a home' }),
    Object.freeze({ key: 'renewal_coming', label: 'My renewal is coming up' }),
    Object.freeze({ key: 'unhappy_current', label: 'I’m unhappy with my current company' }),
    Object.freeze({ key: 'coverage_check', label: 'I want to make sure I’m properly covered' }),
    Object.freeze({ key: 'life_change', label: 'I recently had a life change' }),
    Object.freeze({ key: 'other', label: 'Something else' })
  ]);

  const PRIORITIES = Object.freeze([
    Object.freeze({ key: 'price', label: 'Keep my cost down', detail: 'Start lean and make every added protection earn its place.' }),
    Object.freeze({ key: 'balance', label: 'Find the right balance', detail: 'Weigh protection and price together.' }),
    Object.freeze({ key: 'protection', label: 'Protect myself as strongly as practical', detail: 'Show stronger practical protection first, with the tradeoffs visible.' }),
    Object.freeze({ key: 'unsure', label: 'I’m not sure yet', detail: 'That’s okay—we can compare the tradeoffs as we go.' })
  ]);

  const GOAL_REASON_LABELS = Object.freeze({
    farmers_fit: 'See whether Farmers may be worth comparing',
    coverage_fit: 'Review whether current protection still fits',
    home_auto_bundle: 'Explore home and auto together',
    exploring: 'Explore protection options'
  });

  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const text = (value, limit = 500) => String(value ?? '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, limit);
  const compact = value => text(value, 300).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const nowIso = () => new Date().toISOString();
  const optionFor = (catalog, key) => catalog.find(option => option.key === key) || null;
  const evidence = (source, key, label, capturedAt = '') => ({ source, key, label, capturedAt: capturedAt || nowIso() });

  function reasonKeyForText(value) {
    const normalized = text(value, 300).toLowerCase();
    if (!normalized) return '';
    if (/premium|rate|expensive|price increase|cost increase/.test(normalized)) return 'price_increase';
    if (/buying|purchase|purchasing|homebuyer|new home/.test(normalized)) return 'buying_home';
    if (/renew/.test(normalized)) return 'renewal_coming';
    if (/unhappy|service issue|claim issue|bad experience|current company/.test(normalized)) return 'unhappy_current';
    if (/properly covered|coverage fit|protection still fits|review.*coverage|underinsured/.test(normalized)) return 'coverage_check';
    if (/life change|baby|child|married|marriage|divorc|move|family change/.test(normalized)) return 'life_change';
    if (/compare|shopping|options|farmers fit|worth comparing|explore/.test(normalized)) return 'comparing_options';
    return 'other';
  }

  function priorityKeyForText(value) {
    const normalized = text(value, 240).toLowerCase();
    if (!normalized) return '';
    if (/not sure|unsure|don.?t know/.test(normalized)) return 'unsure';
    if (/balance|price and protection|cost and protection/.test(normalized)) return 'balance';
    if (/strong|protection|coverage first|best coverage/.test(normalized)) return 'protection';
    if (/price|cost|cheap|save|lowest/.test(normalized)) return 'price';
    return '';
  }

  function trustedContext() {
    const personalization = root.CoverageFitPersonalization?.get?.() || null;
    const prefill = root.CoverageFitAssessmentPrefill || null;
    const prospect = prefill?.profile || null;
    const conversion = root.CoverageFitConversionHandoff?.get?.() || null;
    const hasTrustedProfile = Boolean(
      personalization?.flags?.hasProfile
      || prefill?.applied
      || conversion?.flags?.trustedContract
    );
    if (!hasTrustedProfile) return { reason: null, priority: null };

    const journey = personalization?.journey || {};
    const directReason = text(journey.reviewReason || prefill?.reviewContext || prospect?.reviewContext, 300);
    const goalKey = text(journey.homeReviewGoal || prospect?.homeReviewGoal, 80);
    const goalLabel = GOAL_REASON_LABELS[goalKey] || '';
    const inheritedReason = directReason || goalLabel;
    const reasonEvidenceKey = directReason ? 'reviewContext' : (goalLabel ? 'homeReviewGoal' : '');

    const explicitPriority = text(
      journey.primaryPriority
      || journey.insurancePriority
      || prospect?.primaryPriority
      || prospect?.insurancePriority,
      240
    );
    const priorityKey = priorityKeyForText(explicitPriority);
    const priorityOption = optionFor(PRIORITIES, priorityKey);

    return {
      reason: inheritedReason ? {
        key: reasonKeyForText(inheritedReason),
        value: inheritedReason,
        label: inheritedReason,
        source: '408farmers_handoff',
        inherited: true,
        evidenceRefs: [evidence('408farmers_handoff', reasonEvidenceKey || 'reviewContext', directReason ? 'Review reason from connected intake' : 'Review goal from connected intake')]
      } : null,
      priority: priorityOption ? {
        key: priorityOption.key,
        value: priorityOption.key,
        label: explicitPriority || priorityOption.label,
        source: '408farmers_handoff',
        inherited: true,
        evidenceRefs: [evidence('408farmers_handoff', 'primaryPriority', 'Review priority from connected intake')]
      } : null
    };
  }

  function recordFromReason(key, customText = '') {
    const option = optionFor(REASONS, key);
    if (!option) return null;
    const raw = key === 'other' ? text(customText, 300) : option.label;
    if (key !== 'other' && !raw) return null;
    return {
      key,
      value: key,
      label: raw,
      source: SOURCE,
      inherited: false,
      evidenceRefs: [evidence(SOURCE, 'reasonForReview', 'What’s bringing you here today?')]
    };
  }

  function recordFromPriority(key) {
    const option = optionFor(PRIORITIES, key);
    if (!option) return null;
    return {
      key,
      value: key,
      label: option.label,
      source: SOURCE,
      inherited: false,
      evidenceRefs: [evidence(SOURCE, 'primaryPriority', 'What matters most in this review?')]
    };
  }

  function normalizeStoredRecord(value, type) {
    if (!value || typeof value !== 'object') return null;
    const source = ['408farmers_handoff', SOURCE].includes(text(value.source, 80)) ? text(value.source, 80) : SOURCE;
    const key = type === 'priority'
      ? priorityKeyForText(value.key || value.value || value.label)
      : (text(value.key, 80) || reasonKeyForText(value.label || value.value));
    const catalog = type === 'priority' ? PRIORITIES : REASONS;
    if (type === 'priority' && !optionFor(catalog, key)) return null;
    if (type === 'reason' && key !== 'other' && !optionFor(catalog, key) && !value.inherited) return null;
    const label = text(value.label || value.value, 300);
    if (!label) return null;
    return {
      key: key || 'other',
      value: text(value.value || key || label, 300),
      label,
      source,
      inherited: value.inherited === true,
      evidenceRefs: Array.isArray(value.evidenceRefs) ? clone(value.evidenceRefs) : []
    };
  }

  const inherited = trustedContext();
  const continuity = root.CoverageFitAssessmentContinuity || null;
  const restored = continuity?.getDraft?.()?.advisoryOpening || null;
  let state = {
    completed: Boolean(restored?.completed),
    reason: normalizeStoredRecord(restored?.reason, 'reason') || inherited.reason,
    priority: normalizeStoredRecord(restored?.priority, 'priority') || inherited.priority,
    reasonEdited: Boolean(restored?.reasonEdited),
    priorityEdited: Boolean(restored?.priorityEdited),
    completedAt: text(restored?.completedAt, 40)
  };

  function validReason(record) {
    return Boolean(record?.label && (record.inherited || optionFor(REASONS, record.key)));
  }
  function validPriority(record) {
    return Boolean(record?.label && optionFor(PRIORITIES, record.key));
  }
  function isComplete() {
    return Boolean(state.completed && validReason(state.reason) && validPriority(state.priority));
  }

  function draftValue() {
    return {
      contractId: CONTRACT_ID,
      build: BUILD,
      completed: Boolean(state.completed),
      reason: clone(state.reason),
      priority: clone(state.priority),
      reasonEdited: Boolean(state.reasonEdited),
      priorityEdited: Boolean(state.priorityEdited),
      completedAt: state.completedAt || ''
    };
  }

  function persist(reason = 'advisory_opening_progress') {
    continuity?.save?.({ advisoryOpening: draftValue(), stage: state.completed ? 'assessment' : 'advisory-opening' }, { force: true });
    return draftValue();
  }

  function getDiscoveryProfile() {
    const contract = root.CoverageFitAdvisoryDiscoveryContract;
    if (!contract?.create || !validReason(state.reason) || !validPriority(state.priority)) return null;
    const reasonRecord = {
      value: state.reason.value,
      label: state.reason.label,
      source: state.reason.source,
      evidenceRefs: clone(state.reason.evidenceRefs)
    };
    const priorityRecord = {
      value: state.priority.value,
      label: state.priority.label,
      source: state.priority.source,
      evidenceRefs: clone(state.priority.evidenceRefs)
    };
    return contract.create({
      product: 'home',
      source: {
        primary: state.priority.source || state.reason.source || SOURCE,
        inherited: Boolean(state.reason.inherited || state.priority.inherited),
        evidenceRefs: [...(state.reason.evidenceRefs || []), ...(state.priority.evidenceRefs || [])]
      },
      reasonForReview: reasonRecord,
      primaryPriority: priorityRecord,
      customerStatements: [{
        id: 'cfadv14-reason-customer-words',
        topic: 'reasonForReview',
        text: state.reason.label,
        source: state.reason.source,
        sourceKey: state.reason.evidenceRefs?.[0]?.key || 'reasonForReview',
        evidenceRefs: clone(state.reason.evidenceRefs)
      }]
    });
  }

  function getReviewReason() {
    return validReason(state.reason) ? state.reason.label : '';
  }

  function getPrimaryPriority() {
    return validPriority(state.priority) ? clone(state.priority) : null;
  }

  function track(event, props = {}) {
    root.CoverageFitAnalytics?.track?.(event, { assessment: 'home', advisoryBuild: BUILD, ...props });
  }

  function dom() {
    const document = root.document;
    if (!document) return null;
    return {
      shell: document.getElementById('advisoryOpening'),
      quiz: document.getElementById('quiz'),
      connected: document.getElementById('advisoryConnectedReason'),
      connectedReason: document.getElementById('advisoryConnectedReasonText'),
      editReason: document.getElementById('advisoryEditReasonBtn'),
      reasonFieldset: document.getElementById('advisoryReasonFieldset'),
      reasonInputs: Array.from(document.querySelectorAll('input[name="advisory_reason"]')),
      otherWrap: document.getElementById('advisoryOtherReasonWrap'),
      otherInput: document.getElementById('advisoryOtherReason'),
      connectedPriority: document.getElementById('advisoryConnectedPriority'),
      connectedPriorityText: document.getElementById('advisoryConnectedPriorityText'),
      editPriority: document.getElementById('advisoryEditPriorityBtn'),
      priorityFieldset: document.getElementById('advisoryPriorityFieldset'),
      priorityInputs: Array.from(document.querySelectorAll('input[name="advisory_priority"]')),
      continueButton: document.getElementById('advisoryOpeningContinue'),
      live: document.getElementById('advisoryOpeningLive')
    };
  }

  function syncContinue(ui) {
    if (!ui?.continueButton) return;
    const reasonReady = validReason(state.reason) && !(state.reason.key === 'other' && !state.reason.inherited && !text(ui.otherInput?.value, 300));
    ui.continueButton.disabled = !(reasonReady && validPriority(state.priority));
  }

  function render() {
    const ui = dom();
    if (!ui?.shell) return false;

    const showConnectedReason = Boolean(state.reason?.inherited && !state.reasonEdited);
    if (ui.connected) ui.connected.hidden = !showConnectedReason;
    if (ui.connectedReason) ui.connectedReason.textContent = showConnectedReason ? state.reason.label : '';
    if (ui.reasonFieldset) ui.reasonFieldset.hidden = showConnectedReason;

    ui.reasonInputs.forEach(input => {
      input.checked = !showConnectedReason && state.reason?.key === input.value;
    });
    const showOther = !showConnectedReason && state.reason?.key === 'other';
    if (ui.otherWrap) ui.otherWrap.hidden = !showOther;
    if (ui.otherInput && showOther && state.reason?.label && state.reason.label !== 'Something else') ui.otherInput.value = state.reason.label;

    const showConnectedPriority = Boolean(state.priority?.inherited && !state.priorityEdited);
    if (ui.connectedPriority) ui.connectedPriority.hidden = !showConnectedPriority;
    if (ui.connectedPriorityText) ui.connectedPriorityText.textContent = showConnectedPriority ? state.priority.label : '';
    if (ui.priorityFieldset) ui.priorityFieldset.hidden = showConnectedPriority;
    ui.priorityInputs.forEach(input => { input.checked = !showConnectedPriority && state.priority?.key === input.value; });
    syncContinue(ui);
    return true;
  }

  function handleReasonChange(event) {
    const key = text(event?.target?.value, 80);
    if (!optionFor(REASONS, key)) return;
    const ui = dom();
    state.reasonEdited = true;
    state.completed = false;
    state.reason = recordFromReason(key, key === 'other' ? ui?.otherInput?.value : '');
    render();
    persist();
    track('advisory_opening_reason_selected', { reasonKey: key, inherited: false });
    if (key === 'other') requestAnimationFrame(() => ui?.otherInput?.focus?.({ preventScroll: true }));
  }

  function handleOtherInput() {
    const ui = dom();
    if (state.reason?.key !== 'other' || state.reason?.inherited) return;
    state.reason = recordFromReason('other', ui?.otherInput?.value);
    state.completed = false;
    syncContinue(ui);
    persist();
  }

  function handlePriorityChange(event) {
    const key = text(event?.target?.value, 80);
    if (!optionFor(PRIORITIES, key)) return;
    state.priorityEdited = true;
    state.completed = false;
    state.priority = recordFromPriority(key);
    render();
    persist();
    track('advisory_opening_priority_selected', { priorityKey: key, inherited: false });
  }

  function editReason() {
    if (!state.reason?.inherited) return;
    state.reasonEdited = true;
    const mapped = reasonKeyForText(state.reason.label);
    state.reason = recordFromReason(mapped === 'other' ? 'other' : mapped, mapped === 'other' ? state.reason.label : '');
    state.completed = false;
    render();
    persist();
    track('advisory_opening_connected_reason_edit_started', { priorReasonKey: mapped });
  }


  function editPriority() {
    if (!state.priority?.inherited) return;
    const key = priorityKeyForText(state.priority.key || state.priority.value || state.priority.label);
    if (!optionFor(PRIORITIES, key)) return;
    state.priorityEdited = true;
    state.priority = recordFromPriority(key);
    state.completed = false;
    render();
    persist();
    track('advisory_opening_connected_priority_edit_started', { priorPriorityKey: key });
  }

  function complete() {
    const ui = dom();
    if (!validReason(state.reason) || !validPriority(state.priority)) {
      syncContinue(ui);
      return false;
    }
    if (state.reason.key === 'other' && !state.reason.inherited) {
      state.reason = recordFromReason('other', ui?.otherInput?.value);
      if (!state.reason) {
        syncContinue(ui);
        ui?.otherInput?.focus?.();
        return false;
      }
    }
    state.completed = true;
    state.completedAt = nowIso();
    persist('advisory_opening_completed');
    if (ui?.shell) ui.shell.hidden = true;
    const relationshipStarted = root.CoverageFitAdvisoryRelationshipDiscovery?.start?.({ fromOpening: true }) === true;
    const lifestyleStarted = !relationshipStarted && root.CoverageFitAdvisoryLifestyleDiscovery?.start?.({ fromOpening: true }) === true;
    const outcomeStarted = !relationshipStarted && !lifestyleStarted && root.CoverageFitAdvisoryOutcomeDiscovery?.start?.({ fromOpening: true }) === true;
    if (ui?.quiz) ui.quiz.style.display = (relationshipStarted || lifestyleStarted || outcomeStarted) ? 'none' : '';
    root.document?.body?.classList?.add('advisory-opening-complete');
    if (ui?.live) ui.live.textContent = relationshipStarted
      ? 'Your review priorities are saved. Next, we’ll note what already works in your current insurance.'
      : (lifestyleStarted
        ? 'Your review priorities are saved. Next, we’ll understand how the home fits your day-to-day life.'
        : (outcomeStarted
          ? 'Your review priorities are saved. Next, we’ll note which outcomes matter most to you.'
          : 'Your review priorities are saved. The coverage review is starting.'));
    const detail = { state: draftValue(), discoveryProfile: getDiscoveryProfile(), relationshipStarted, lifestyleStarted, outcomeStarted };
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-opening-completed', { detail }));
    track('advisory_opening_completed', {
      reasonKey: state.reason.key,
      reasonInherited: Boolean(state.reason.inherited && !state.reasonEdited),
      priorityKey: state.priority.key,
      priorityInherited: Boolean(state.priority.inherited && !state.priorityEdited),
      relationshipStarted,
      lifestyleStarted,
      outcomeStarted
    });
    if (!relationshipStarted && !lifestyleStarted && !outcomeStarted) {
      requestAnimationFrame(() => root.document?.querySelector?.('.question')?.scrollIntoView?.({ behavior: root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth', block: 'start' }));
    }
    return true;
  }

  function start(options = {}) {
    const ui = dom();
    if (!ui?.shell || !ui?.quiz) return false;
    if (isComplete() && !options.force) {
      ui.shell.hidden = true;
      ui.quiz.style.display = '';
      root.document?.body?.classList?.add('advisory-opening-complete');
      return false;
    }
    state.completed = false;
    ui.quiz.style.display = 'none';
    ui.shell.hidden = false;
    root.document?.body?.classList?.remove('advisory-opening-complete');
    render();
    persist('advisory_opening_viewed');
    track('advisory_opening_viewed', {
      reasonConnected: Boolean(state.reason?.inherited && !state.reasonEdited),
      priorityConnected: Boolean(state.priority?.inherited && !state.priorityEdited),
      resumed: Boolean(options.resume)
    });
    requestAnimationFrame(() => ui.shell?.scrollIntoView?.({ behavior: 'auto', block: 'start' }));
    return true;
  }

  function reset(options = {}) {
    const connected = trustedContext();
    state = {
      completed: false,
      reason: options.preserveInherited === false ? null : connected.reason,
      priority: options.preserveInherited === false ? null : connected.priority,
      reasonEdited: false,
      priorityEdited: false,
      completedAt: ''
    };
    persist('advisory_opening_reset');
    render();
    return clone(state);
  }

  function bind() {
    const ui = dom();
    if (!ui?.shell || ui.shell.dataset.bound === 'true') return false;
    ui.shell.dataset.bound = 'true';
    ui.reasonInputs.forEach(input => input.addEventListener('change', handleReasonChange));
    ui.priorityInputs.forEach(input => input.addEventListener('change', handlePriorityChange));
    ui.otherInput?.addEventListener('input', handleOtherInput);
    ui.editReason?.addEventListener('click', editReason);
    ui.editPriority?.addEventListener('click', editPriority);
    ui.continueButton?.addEventListener('click', complete);
    render();
    return true;
  }

  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
  }

  return Object.freeze({
    VERSION,
    BUILD,
    CONTRACT_ID,
    REASONS,
    PRIORITIES,
    reasonKeyForText,
    priorityKeyForText,
    recordFromReason,
    recordFromPriority,
    trustedContext,
    getState: () => clone(state),
    getDiscoveryProfile,
    getReviewReason,
    getPrimaryPriority,
    isComplete,
    start,
    complete,
    reset,
    render
  });
});
