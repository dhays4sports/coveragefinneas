(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryRelationshipDiscovery = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.5';
  const CONTRACT_ID = 'coveragefit-current-relationship-discovery-v1';
  const SOURCE = 'coveragefit_assessment';
  const branching = root.CoverageFitAdvisoryProgressiveDiscoveryBranching || null;

  const TENURES = Object.freeze([
    Object.freeze({ key: 'under_1', label: 'Less than 1 year' }),
    Object.freeze({ key: '1_2', label: '1–2 years' }),
    Object.freeze({ key: '3_5', label: '3–5 years' }),
    Object.freeze({ key: '6_9', label: '6–9 years' }),
    Object.freeze({ key: '10_plus', label: '10 years or more' }),
    Object.freeze({ key: 'unsure', label: 'I’m not sure', explicitUnknown: true }),
    Object.freeze({ key: 'prefer_not_to_answer', label: 'Prefer not to answer', preferNotToAnswer: true })
  ]);

  const LIKES = Object.freeze([
    Object.freeze({ key: 'service', label: 'Customer service / responsiveness' }),
    Object.freeze({ key: 'agent', label: 'My agent / personal relationship' }),
    Object.freeze({ key: 'claims', label: 'Claims experience' }),
    Object.freeze({ key: 'price', label: 'Price' }),
    Object.freeze({ key: 'coverage', label: 'Coverage / options' }),
    Object.freeze({ key: 'convenience', label: 'Convenience / easy account management' }),
    Object.freeze({ key: 'familiarity', label: 'Familiarity / consistency' }),
    Object.freeze({ key: 'none', label: 'Nothing in particular', exclusive: true }),
    Object.freeze({ key: 'unsure', label: 'I’m not sure', exclusive: true, explicitUnknown: true }),
    Object.freeze({ key: 'prefer_not_to_answer', label: 'Prefer not to answer', exclusive: true, preferNotToAnswer: true }),
    Object.freeze({ key: 'other', label: 'Something else' })
  ]);

  const WOULD_CHANGE = Object.freeze([
    Object.freeze({ key: 'price', label: 'Price / premium' }),
    Object.freeze({ key: 'service', label: 'Service / responsiveness' }),
    Object.freeze({ key: 'claims', label: 'Claims experience' }),
    Object.freeze({ key: 'coverage', label: 'Coverage / policy options' }),
    Object.freeze({ key: 'convenience', label: 'Convenience / account management' }),
    Object.freeze({ key: 'agent', label: 'Agent relationship' }),
    Object.freeze({ key: 'nothing', label: 'Nothing—I’m mostly satisfied' }),
    Object.freeze({ key: 'unsure', label: 'I’m not sure', explicitUnknown: true }),
    Object.freeze({ key: 'prefer_not_to_answer', label: 'Prefer not to answer', preferNotToAnswer: true }),
    Object.freeze({ key: 'other', label: 'Something else' })
  ]);

  const MUST_KEEP = Object.freeze([
    Object.freeze({ key: 'service', label: 'Responsive service / support' }),
    Object.freeze({ key: 'agent', label: 'My agent relationship' }),
    Object.freeze({ key: 'deductible', label: 'My deductible level' }),
    Object.freeze({ key: 'coverage', label: 'Specific coverage or limits' }),
    Object.freeze({ key: 'claims', label: 'Claims support' }),
    Object.freeze({ key: 'billing', label: 'Billing / payment setup' }),
    Object.freeze({ key: 'bundle', label: 'Bundle / discount structure' }),
    Object.freeze({ key: 'none', label: 'Nothing specific', exclusive: true }),
    Object.freeze({ key: 'unsure', label: 'I’m not sure', exclusive: true, explicitUnknown: true }),
    Object.freeze({ key: 'prefer_not_to_answer', label: 'Prefer not to answer', exclusive: true, preferNotToAnswer: true }),
    Object.freeze({ key: 'other', label: 'Something else' })
  ]);

  const CARRIER_STATES = Object.freeze([
    Object.freeze({ key: 'unsure', label: 'I’m not sure', explicitUnknown: true }),
    Object.freeze({ key: 'prefer_not_to_answer', label: 'Prefer not to answer', preferNotToAnswer: true })
  ]);

  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const text = (value, limit = 500) => String(value ?? '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, limit);
  const nowIso = () => new Date().toISOString();
  const optionFor = (catalog, key) => catalog.find(option => option.key === key) || null;
  const evidence = (source, key, label, capturedAt = '') => ({ source, key, label, capturedAt: capturedAt || nowIso() });

  function record(key, label, evidenceKey, evidenceLabel, options = {}) {
    const cleanLabel = text(label, 300);
    if (!cleanLabel) return null;
    return {
      key: text(key, 120),
      value: text(options.value ?? key ?? cleanLabel, 300),
      label: cleanLabel,
      source: text(options.source || SOURCE, 80),
      inherited: options.inherited === true,
      explicitUnknown: options.explicitUnknown === true,
      preferNotToAnswer: options.preferNotToAnswer === true,
      evidenceRefs: clone(options.evidenceRefs) || [evidence(options.source || SOURCE, evidenceKey, evidenceLabel)]
    };
  }

  function normalizeStoredRecord(value, catalog, evidenceKey, evidenceLabel) {
    if (!value || typeof value !== 'object') return null;
    const key = text(value.key || value.value, 120);
    const option = optionFor(catalog, key);
    const source = ['408farmers_handoff', SOURCE].includes(text(value.source, 80)) ? text(value.source, 80) : SOURCE;
    if (key === 'other' && value.label === '') {
      return {
        key: 'other',
        value: 'other',
        label: '',
        source,
        inherited: value.inherited === true,
        explicitUnknown: false,
        preferNotToAnswer: false,
        evidenceRefs: Array.isArray(value.evidenceRefs) ? clone(value.evidenceRefs) : [evidence(source, evidenceKey, evidenceLabel)]
      };
    }
    const label = text(value.label || option?.label || value.value, 300);
    if (!label) return null;
    return record(key || 'other', label, evidenceKey, evidenceLabel, {
      value: value.value || key || label,
      source,
      inherited: value.inherited === true,
      explicitUnknown: value.explicitUnknown === true || option?.explicitUnknown === true,
      preferNotToAnswer: value.preferNotToAnswer === true || option?.preferNotToAnswer === true,
      evidenceRefs: Array.isArray(value.evidenceRefs) ? value.evidenceRefs : []
    });
  }

  function normalizeStoredList(values, catalog, evidenceKey, evidenceLabel) {
    const list = Array.isArray(values) ? values : [];
    const seen = new Set();
    return list.map(value => normalizeStoredRecord(value, catalog, evidenceKey, evidenceLabel)).filter(Boolean).filter(item => {
      const identity = `${item.key}|${item.label}`.toLowerCase();
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function carrierRecord(value, options = {}) {
    const clean = text(value, 180);
    if (!clean) return null;
    const stateOption = optionFor(CARRIER_STATES, clean);
    return record(stateOption?.key || 'known', stateOption?.label || clean, 'currentCarrier', 'Who are you insured with now?', {
      value: stateOption?.key || clean,
      source: options.source || SOURCE,
      inherited: options.inherited === true,
      explicitUnknown: stateOption?.explicitUnknown === true,
      preferNotToAnswer: stateOption?.preferNotToAnswer === true,
      evidenceRefs: options.evidenceRefs
    });
  }

  function tenureRecord(key, options = {}) {
    const option = optionFor(TENURES, key);
    if (!option) return null;
    return record(option.key, option.label, 'currentCarrierTenure', 'How long have you been with your current company?', {
      value: option.key,
      source: options.source || SOURCE,
      inherited: options.inherited === true,
      explicitUnknown: option.explicitUnknown === true,
      preferNotToAnswer: option.preferNotToAnswer === true,
      evidenceRefs: options.evidenceRefs
    });
  }

  function choiceRecord(catalog, key, customText, evidenceKey, evidenceLabel, options = {}) {
    const option = optionFor(catalog, key);
    if (!option) return null;
    const label = option.key === 'other' ? text(customText, 300) : option.label;
    if (option.key === 'other' && !label) {
      const source = options.source || SOURCE;
      return {
        key: 'other',
        value: 'other',
        label: '',
        source,
        inherited: options.inherited === true,
        explicitUnknown: false,
        preferNotToAnswer: false,
        evidenceRefs: clone(options.evidenceRefs) || [evidence(source, evidenceKey, evidenceLabel)]
      };
    }
    if (!label) return null;
    return record(option.key, label, evidenceKey, evidenceLabel, {
      value: option.key,
      source: options.source || SOURCE,
      inherited: options.inherited === true,
      explicitUnknown: option.explicitUnknown === true,
      preferNotToAnswer: option.preferNotToAnswer === true,
      evidenceRefs: options.evidenceRefs
    });
  }

  function trustedContext() {
    const personalization = root.CoverageFitPersonalization?.get?.() || null;
    const prefill = root.CoverageFitAssessmentPrefill || null;
    const prospect = prefill?.profile || {};
    const conversion = root.CoverageFitConversionHandoff?.get?.() || null;
    const hasTrustedProfile = Boolean(personalization?.flags?.hasProfile || prefill?.applied || conversion?.flags?.trustedContract);
    if (!hasTrustedProfile) return { carrier: null, tenure: null };

    const currentCarrier = text(
      prospect?.currentCarrier
      || prospect?.coverage?.currentCarrier
      || prospect?.currentCoverage?.currentCarrier
      || prefill?.currentCarrier
      || personalization?.journey?.currentCarrier,
      180
    );
    const currentTenure = text(
      prospect?.currentCarrierTenure
      || prospect?.coverage?.currentCarrierTenure
      || prospect?.currentCoverage?.currentCarrierTenure
      || personalization?.journey?.currentCarrierTenure,
      120
    );

    let tenure = null;
    if (currentTenure) {
      const numeric = currentTenure.match(/(\d+(?:\.\d+)?)/);
      const years = numeric ? Number(numeric[1]) : NaN;
      const key = Number.isFinite(years)
        ? (years >= 10 ? '10_plus' : years >= 6 ? '6_9' : years >= 3 ? '3_5' : years >= 1 ? '1_2' : 'under_1')
        : (/not sure|unsure/i.test(currentTenure) ? 'unsure' : '');
      if (key) tenure = tenureRecord(key, {
        source: '408farmers_handoff',
        inherited: true,
        evidenceRefs: [evidence('408farmers_handoff', 'currentCarrierTenure', 'Current-carrier tenure from connected intake')]
      });
    }

    return {
      carrier: currentCarrier ? carrierRecord(currentCarrier, {
        source: '408farmers_handoff',
        inherited: true,
        evidenceRefs: [evidence('408farmers_handoff', 'currentCarrier', 'Current carrier from connected intake')]
      }) : null,
      tenure
    };
  }

  const inherited = trustedContext();
  const continuity = root.CoverageFitAssessmentContinuity || null;
  const restored = continuity?.getDraft?.()?.advisoryRelationship || null;
  let state = {
    completed: Boolean(restored?.completed),
    carrier: normalizeStoredRecord(restored?.carrier, CARRIER_STATES, 'currentCarrier', 'Who are you insured with now?') || inherited.carrier,
    tenure: normalizeStoredRecord(restored?.tenure, TENURES, 'currentCarrierTenure', 'How long have you been with your current company?') || inherited.tenure,
    likes: normalizeStoredList(restored?.likes, LIKES, 'currentCarrierLikes', 'What have you liked about your current insurance relationship?'),
    wouldChange: normalizeStoredList(restored?.wouldChange, WOULD_CHANGE, 'currentCarrierWouldChange', 'If you could change one thing about your current insurance, what would it be?'),
    mustKeep: normalizeStoredList(restored?.mustKeep, MUST_KEEP, 'currentCarrierMustKeep', 'What do you definitely want to keep?'),
    carrierEdited: Boolean(restored?.carrierEdited),
    tenureEdited: Boolean(restored?.tenureEdited),
    completedAt: text(restored?.completedAt, 40),
    branchState: restored?.branchState && typeof restored.branchState === 'object' ? clone(restored.branchState) : null,
    preserveLegacyMustKeep: Boolean(Array.isArray(restored?.mustKeep) && restored.mustKeep.length && !restored?.branchState)
  };

  // A stored known carrier is free text, not a catalog option. Restore it explicitly.
  if (restored?.carrier?.label && restored?.carrier?.key === 'known') {
    state.carrier = carrierRecord(restored.carrier.label, {
      source: restored.carrier.source || SOURCE,
      inherited: restored.carrier.inherited === true,
      evidenceRefs: restored.carrier.evidenceRefs
    });
  }

  const validCarrier = value => Boolean(value?.label);
  const validTenure = value => Boolean(value?.label && (optionFor(TENURES, value.key) || value.inherited));
  const validChoiceList = value => Array.isArray(value) && value.length > 0;
  const relationshipBranch = () => branching?.relationship?.(state) || { active: true, trigger: 'compatibility_fallback', prompt: '' };
  function reconcileBranchState() {
    const branch = relationshipBranch();
    state.branchState = { preserveWhatWorks: clone(branch) };
    if (!branch.active && state.mustKeep.length) state.mustKeep = [];
    return branch;
  }
  function isComplete() {
    const branch = reconcileBranchState();
    return Boolean(
      state.completed
      && validCarrier(state.carrier)
      && validTenure(state.tenure)
      && validChoiceList(state.likes)
      && validChoiceList(state.wouldChange)
      && (!branch.active || validChoiceList(state.mustKeep))
    );
  }

  function draftValue() {
    return {
      contractId: CONTRACT_ID,
      build: BUILD,
      completed: Boolean(state.completed),
      carrier: clone(state.carrier),
      tenure: clone(state.tenure),
      likes: clone(state.likes),
      wouldChange: clone(state.wouldChange),
      mustKeep: clone(state.mustKeep),
      carrierEdited: Boolean(state.carrierEdited),
      tenureEdited: Boolean(state.tenureEdited),
      completedAt: state.completedAt || '',
      branchState: clone(state.branchState || { preserveWhatWorks: relationshipBranch() }),
      preserveLegacyMustKeep: Boolean(state.preserveLegacyMustKeep)
    };
  }

  function persist(reason = 'advisory_relationship_progress') {
    continuity?.save?.({ advisoryRelationship: draftValue(), stage: state.completed ? 'assessment' : 'advisory-relationship' }, { force: true });
    return draftValue();
  }

  function getDiscoveryProfile() {
    const contract = root.CoverageFitAdvisoryDiscoveryContract;
    if (!contract?.create) return null;
    const sourceRefs = [
      ...(state.carrier?.evidenceRefs || []),
      ...(state.tenure?.evidenceRefs || []),
      ...state.likes.flatMap(item => item.evidenceRefs || []),
      ...state.wouldChange.flatMap(item => item.evidenceRefs || []),
      ...state.mustKeep.flatMap(item => item.evidenceRefs || [])
    ];
    const customStatements = [];
    const addCustom = (items, topic, sourceKey) => {
      items.filter(item => item.key === 'other').forEach((item, index) => {
        customStatements.push({
          id: `cfadv15-${topic}-${index + 1}`,
          topic,
          text: item.label,
          source: item.source,
          sourceKey,
          evidenceRefs: clone(item.evidenceRefs)
        });
      });
    };
    addCustom(state.likes, 'currentRelationship.likes', 'currentCarrierLikes');
    addCustom(state.wouldChange, 'currentRelationship.wouldChange', 'currentCarrierWouldChange');
    addCustom(state.mustKeep, 'currentRelationship.mustKeep', 'currentCarrierMustKeep');

    return contract.create({
      product: 'home',
      source: {
        primary: state.carrier?.source || state.tenure?.source || SOURCE,
        inherited: Boolean(state.carrier?.inherited || state.tenure?.inherited),
        evidenceRefs: sourceRefs
      },
      currentRelationship: {
        source: state.carrier?.source || state.tenure?.source || SOURCE,
        carrier: state.carrier ? {
          value: state.carrier.value,
          label: state.carrier.label,
          source: state.carrier.source,
          evidenceRefs: clone(state.carrier.evidenceRefs)
        } : null,
        tenure: state.tenure ? {
          value: state.tenure.value,
          label: state.tenure.label,
          source: state.tenure.source,
          evidenceRefs: clone(state.tenure.evidenceRefs)
        } : null,
        likes: state.likes.map(item => ({
          value: item.value,
          label: item.label,
          source: item.source,
          evidenceRefs: clone(item.evidenceRefs)
        })),
        wouldChange: state.wouldChange.map(item => ({
          value: item.value,
          label: item.label,
          source: item.source,
          evidenceRefs: clone(item.evidenceRefs)
        })),
        mustKeep: state.mustKeep.map(item => ({
          value: item.value,
          label: item.label,
          source: item.source,
          evidenceRefs: clone(item.evidenceRefs)
        })),
        notes: customStatements
      },
      customerStatements: customStatements
    });
  }

  function getRelationshipSummary() {
    return {
      carrier: state.carrier?.label || '',
      tenure: state.tenure?.label || '',
      likes: state.likes.map(item => item.label),
      wouldChange: state.wouldChange.map(item => item.label),
      mustKeep: state.mustKeep.map(item => item.label)
    };
  }

  function track(event, props = {}) {
    root.CoverageFitAnalytics?.track?.(event, { assessment: 'home', advisoryBuild: BUILD, ...props });
  }

  function dom() {
    const document = root.document;
    if (!document) return null;
    return {
      shell: document.getElementById('advisoryRelationship'),
      quiz: document.getElementById('quiz'),
      connectedCarrier: document.getElementById('advisoryConnectedCarrier'),
      connectedCarrierText: document.getElementById('advisoryConnectedCarrierText'),
      editCarrier: document.getElementById('advisoryEditCarrierBtn'),
      carrierFieldset: document.getElementById('advisoryCarrierFieldset'),
      carrierInput: document.getElementById('advisoryCarrierInput'),
      carrierStateInputs: Array.from(document.querySelectorAll('input[name="advisory_carrier_state"]')),
      connectedTenure: document.getElementById('advisoryConnectedTenure'),
      connectedTenureText: document.getElementById('advisoryConnectedTenureText'),
      editTenure: document.getElementById('advisoryEditTenureBtn'),
      tenureFieldset: document.getElementById('advisoryTenureFieldset'),
      tenureInputs: Array.from(document.querySelectorAll('input[name="advisory_tenure"]')),
      likesInputs: Array.from(document.querySelectorAll('input[name="advisory_likes"]')),
      likesOtherWrap: document.getElementById('advisoryLikesOtherWrap'),
      likesOther: document.getElementById('advisoryLikesOther'),
      changeInputs: Array.from(document.querySelectorAll('input[name="advisory_would_change"]')),
      changeOtherWrap: document.getElementById('advisoryChangeOtherWrap'),
      changeOther: document.getElementById('advisoryChangeOther'),
      keepFieldset: document.getElementById('advisoryMustKeepFieldset'),
      preserveCue: document.getElementById('advisoryRelationshipPreserveCue'),
      keepInputs: Array.from(document.querySelectorAll('input[name="advisory_must_keep"]')),
      keepOtherWrap: document.getElementById('advisoryKeepOtherWrap'),
      keepOther: document.getElementById('advisoryKeepOther'),
      continueButton: document.getElementById('advisoryRelationshipContinue'),
      live: document.getElementById('advisoryRelationshipLive')
    };
  }

  function optionRecords(inputs, catalog, otherInput, evidenceKey, evidenceLabel) {
    return inputs.filter(input => input.checked).map(input => choiceRecord(
      catalog,
      input.value,
      input.value === 'other' ? otherInput?.value : '',
      evidenceKey,
      evidenceLabel
    )).filter(Boolean);
  }

  function listReady(items) {
    if (!items.length) return false;
    return items.every(item => item.key !== 'other' || Boolean(text(item.label, 300)));
  }

  function syncContinue(ui) {
    if (!ui?.continueButton) return;
    const branch = reconcileBranchState();
    ui.continueButton.disabled = !(
      validCarrier(state.carrier)
      && validTenure(state.tenure)
      && listReady(state.likes)
      && listReady(state.wouldChange)
      && (!branch.active || listReady(state.mustKeep))
    );
  }

  function render() {
    const ui = dom();
    if (!ui?.shell) return false;

    const showConnectedCarrier = Boolean(state.carrier?.inherited && !state.carrierEdited);
    if (ui.connectedCarrier) ui.connectedCarrier.hidden = !showConnectedCarrier;
    if (ui.connectedCarrierText) ui.connectedCarrierText.textContent = showConnectedCarrier ? state.carrier.label : '';
    if (ui.carrierFieldset) ui.carrierFieldset.hidden = showConnectedCarrier;
    if (ui.carrierInput && !showConnectedCarrier && state.carrier?.key === 'known') ui.carrierInput.value = state.carrier.label;
    ui.carrierStateInputs.forEach(input => { input.checked = !showConnectedCarrier && state.carrier?.key === input.value; });

    const showConnectedTenure = Boolean(state.tenure?.inherited && !state.tenureEdited);
    if (ui.connectedTenure) ui.connectedTenure.hidden = !showConnectedTenure;
    if (ui.connectedTenureText) ui.connectedTenureText.textContent = showConnectedTenure ? state.tenure.label : '';
    if (ui.tenureFieldset) ui.tenureFieldset.hidden = showConnectedTenure;
    ui.tenureInputs.forEach(input => { input.checked = !showConnectedTenure && state.tenure?.key === input.value; });

    const syncMulti = (inputs, items) => inputs.forEach(input => {
      input.checked = items.some(item => item.key === input.value);
    });
    syncMulti(ui.likesInputs, state.likes);
    syncMulti(ui.changeInputs, state.wouldChange);
    const preserveBranch = reconcileBranchState();
    syncMulti(ui.keepInputs, state.mustKeep);
    if (ui.keepFieldset) ui.keepFieldset.hidden = !preserveBranch.active;
    if (ui.preserveCue) {
      ui.preserveCue.hidden = !preserveBranch.active;
      ui.preserveCue.dataset.active = preserveBranch.active ? 'true' : 'false';
      ui.preserveCue.innerHTML = preserveBranch.active ? `<strong>One useful follow-up</strong><span>${preserveBranch.prompt}</span>` : '';
    }

    const likesOther = state.likes.find(item => item.key === 'other');
    const changeOther = state.wouldChange.find(item => item.key === 'other');
    const keepOther = state.mustKeep.find(item => item.key === 'other');
    if (ui.likesOtherWrap) ui.likesOtherWrap.hidden = !likesOther;
    if (ui.changeOtherWrap) ui.changeOtherWrap.hidden = !changeOther;
    if (ui.keepOtherWrap) ui.keepOtherWrap.hidden = !preserveBranch.active || !keepOther;
    if (ui.likesOther && likesOther?.label) ui.likesOther.value = likesOther.label;
    if (ui.changeOther && changeOther?.label) ui.changeOther.value = changeOther.label;
    if (ui.keepOther && keepOther?.label) ui.keepOther.value = keepOther.label;

    syncContinue(ui);
    return true;
  }

  function setCarrierFromInput() {
    const ui = dom();
    const value = text(ui?.carrierInput?.value, 180);
    state.carrierEdited = true;
    state.completed = false;
    ui?.carrierStateInputs?.forEach?.(input => { input.checked = false; });
    state.carrier = value ? carrierRecord(value) : null;
    syncContinue(ui);
    persist();
  }

  function setCarrierState(event) {
    const key = text(event?.target?.value, 80);
    const option = optionFor(CARRIER_STATES, key);
    if (!option) return;
    const ui = dom();
    if (ui?.carrierInput) ui.carrierInput.value = '';
    state.carrierEdited = true;
    state.completed = false;
    state.carrier = carrierRecord(key);
    render();
    persist();
    track('advisory_relationship_carrier_state_selected', { state: key });
  }

  function setTenure(event) {
    const key = text(event?.target?.value, 80);
    if (!optionFor(TENURES, key)) return;
    state.tenureEdited = true;
    state.completed = false;
    state.tenure = tenureRecord(key);
    render();
    persist();
    track('advisory_relationship_tenure_selected', { tenureKey: key });
  }

  function updateMulti(kind, catalog, inputs, otherInput, evidenceKey, evidenceLabel, event) {
    const key = text(event?.target?.value, 80);
    const option = optionFor(catalog, key);
    if (!option) return;
    const selected = inputs.filter(input => input.checked);
    if (option.exclusive && event.target.checked) {
      inputs.forEach(input => { if (input !== event.target) input.checked = false; });
    } else if (event.target.checked) {
      inputs.forEach(input => {
        const candidate = optionFor(catalog, input.value);
        if (candidate?.exclusive) input.checked = false;
      });
    }
    state[kind] = optionRecords(inputs, catalog, otherInput, evidenceKey, evidenceLabel);
    state.completed = false;
    render();
    persist();
    track(`advisory_relationship_${kind}_updated`, { values: state[kind].map(item => item.key).join(',') });
    if (key === 'other' && event.target.checked) requestAnimationFrame(() => otherInput?.focus?.({ preventScroll: true }));
  }

  function updateOther(kind, catalog, inputs, input, evidenceKey, evidenceLabel) {
    state[kind] = optionRecords(inputs, catalog, input, evidenceKey, evidenceLabel);
    state.completed = false;
    syncContinue(dom());
    persist();
  }

  function editCarrier() {
    if (!state.carrier?.inherited) return;
    state.carrierEdited = true;
    state.carrier = carrierRecord(state.carrier.label);
    state.completed = false;
    render();
    persist();
    track('advisory_relationship_connected_carrier_edit_started');
    requestAnimationFrame(() => dom()?.carrierInput?.focus?.({ preventScroll: true }));
  }

  function editTenure() {
    if (!state.tenure?.inherited) return;
    state.tenureEdited = true;
    state.tenure = tenureRecord(state.tenure.key) || null;
    state.completed = false;
    render();
    persist();
    track('advisory_relationship_connected_tenure_edit_started');
  }

  function complete() {
    const ui = dom();
    state.likes = optionRecords(ui?.likesInputs || [], LIKES, ui?.likesOther, 'currentCarrierLikes', 'What have you liked about your current insurance relationship?');
    state.wouldChange = optionRecords(ui?.changeInputs || [], WOULD_CHANGE, ui?.changeOther, 'currentCarrierWouldChange', 'If you could change one thing about your current insurance, what would it be?');
    const preserveBranch = reconcileBranchState();
    state.mustKeep = preserveBranch.active
      ? optionRecords(ui?.keepInputs || [], MUST_KEEP, ui?.keepOther, 'currentCarrierMustKeep', 'What do you definitely want to keep?')
      : [];

    if (!validCarrier(state.carrier) || !validTenure(state.tenure) || !listReady(state.likes) || !listReady(state.wouldChange) || (preserveBranch.active && !listReady(state.mustKeep))) {
      syncContinue(ui);
      return false;
    }
    state.completed = true;
    state.completedAt = nowIso();
    persist('advisory_relationship_completed');
    if (ui?.shell) ui.shell.hidden = true;
    const lifestyleStarted = root.CoverageFitAdvisoryLifestyleDiscovery?.start?.({ fromRelationship: true }) === true;
    const outcomeStarted = !lifestyleStarted && root.CoverageFitAdvisoryOutcomeDiscovery?.start?.({ fromRelationship: true }) === true;
    if (ui?.quiz) ui.quiz.style.display = (lifestyleStarted || outcomeStarted) ? 'none' : '';
    root.document?.body?.classList?.add('advisory-relationship-complete');
    if (ui?.live) ui.live.textContent = lifestyleStarted
      ? 'Your current-insurance context is saved. Next, we’ll understand how the home fits your day-to-day life.'
      : (outcomeStarted
        ? 'Your current-insurance context is saved. Next, we’ll note which outcomes matter most to you.'
        : 'Your current-insurance context is saved. The coverage review is starting.');
    const detail = { state: draftValue(), discoveryProfile: getDiscoveryProfile(), summary: getRelationshipSummary(), lifestyleStarted, outcomeStarted };
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-relationship-completed', { detail }));
    track('advisory_relationship_completed', {
      carrierInherited: Boolean(state.carrier?.inherited && !state.carrierEdited),
      tenureKey: state.tenure?.key || '',
      likesCount: state.likes.length,
      wouldChange: state.wouldChange[0]?.key || '',
      mustKeepCount: state.mustKeep.length,
      preserveFollowUpAsked: preserveBranch.active,
      progressiveBranch: preserveBranch.trigger,
      scoreFormulaChanged: false,
      lifestyleStarted,
      outcomeStarted
    });
    if (!lifestyleStarted && !outcomeStarted) requestAnimationFrame(() => root.document?.querySelector?.('.question')?.scrollIntoView?.({
      behavior: root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth',
      block: 'start'
    }));
    return true;
  }

  function start(options = {}) {
    const ui = dom();
    if (!ui?.shell || !ui?.quiz) return false;
    if (isComplete() && !options.force) {
      ui.shell.hidden = true;
      ui.quiz.style.display = '';
      root.document?.body?.classList?.add('advisory-relationship-complete');
      return false;
    }
    state.completed = false;
    ui.quiz.style.display = 'none';
    ui.shell.hidden = false;
    root.document?.body?.classList?.remove('advisory-relationship-complete');
    render();
    persist('advisory_relationship_viewed');
    track('advisory_relationship_viewed', {
      carrierConnected: Boolean(state.carrier?.inherited && !state.carrierEdited),
      tenureConnected: Boolean(state.tenure?.inherited && !state.tenureEdited),
      resumed: Boolean(options.resume)
    });
    requestAnimationFrame(() => ui.shell?.scrollIntoView?.({ behavior: 'auto', block: 'start' }));
    return true;
  }

  function reset(options = {}) {
    const connected = trustedContext();
    state = {
      completed: false,
      carrier: options.preserveInherited === false ? null : connected.carrier,
      tenure: options.preserveInherited === false ? null : connected.tenure,
      likes: [],
      wouldChange: [],
      mustKeep: [],
      carrierEdited: false,
      tenureEdited: false,
      completedAt: '',
      branchState: null,
      preserveLegacyMustKeep: false
    };
    persist('advisory_relationship_reset');
    render();
    return clone(state);
  }

  function bind() {
    const ui = dom();
    if (!ui?.shell || ui.shell.dataset.bound === 'true') return false;
    ui.shell.dataset.bound = 'true';
    ui.carrierInput?.addEventListener('input', setCarrierFromInput);
    ui.carrierStateInputs.forEach(input => input.addEventListener('change', setCarrierState));
    ui.tenureInputs.forEach(input => input.addEventListener('change', setTenure));
    ui.likesInputs.forEach(input => input.addEventListener('change', event => updateMulti(
      'likes', LIKES, ui.likesInputs, ui.likesOther, 'currentCarrierLikes',
      'What have you liked about your current insurance relationship?', event
    )));
    ui.changeInputs.forEach(input => input.addEventListener('change', event => updateMulti(
      'wouldChange', WOULD_CHANGE, ui.changeInputs, ui.changeOther, 'currentCarrierWouldChange',
      'If you could change one thing about your current insurance, what would it be?', event
    )));
    ui.keepInputs.forEach(input => input.addEventListener('change', event => updateMulti(
      'mustKeep', MUST_KEEP, ui.keepInputs, ui.keepOther, 'currentCarrierMustKeep',
      'What do you definitely want to keep?', event
    )));
    ui.likesOther?.addEventListener('input', () => updateOther(
      'likes', LIKES, ui.likesInputs, ui.likesOther, 'currentCarrierLikes',
      'What have you liked about your current insurance relationship?'
    ));
    ui.changeOther?.addEventListener('input', () => updateOther(
      'wouldChange', WOULD_CHANGE, ui.changeInputs, ui.changeOther, 'currentCarrierWouldChange',
      'If you could change one thing about your current insurance, what would it be?'
    ));
    ui.keepOther?.addEventListener('input', () => updateOther(
      'mustKeep', MUST_KEEP, ui.keepInputs, ui.keepOther, 'currentCarrierMustKeep',
      'What do you definitely want to keep?'
    ));
    ui.editCarrier?.addEventListener('click', editCarrier);
    ui.editTenure?.addEventListener('click', editTenure);
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
    TENURES,
    LIKES,
    WOULD_CHANGE,
    MUST_KEEP,
    CARRIER_STATES,
    carrierRecord,
    tenureRecord,
    choiceRecord,
    trustedContext,
    getState: () => clone(state),
    getDiscoveryProfile,
    getRelationshipSummary,
    isComplete,
    start,
    complete,
    reset,
    render
  });
});
