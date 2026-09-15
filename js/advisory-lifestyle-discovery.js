(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryLifestyleDiscovery = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.6';
  const CONTRACT_ID = 'coveragefit-lifestyle-dependency-discovery-v1';
  const SOURCE = 'coveragefit_assessment';
  const branching = root.CoverageFitAdvisoryProgressiveDiscoveryBranching || null;

  const CATALOGS = Object.freeze({
    primaryHome: Object.freeze([
      { key: 'primary_residence', label: 'Yes — this is the home I live in most of the time' },
      { key: 'not_primary', label: 'No — this is not my primary home' },
      { key: 'unsure', label: 'I’m not sure' },
      { key: 'prefer_not_to_answer', label: 'Prefer not to answer' }
    ]),
    residenceTenure: Object.freeze([
      { key: 'under_1', label: 'Less than 1 year' }, { key: '1_2', label: '1–2 years' },
      { key: '3_5', label: '3–5 years' }, { key: '6_10', label: '6–10 years' },
      { key: '10_plus', label: 'More than 10 years' }, { key: 'unsure', label: 'I’m not sure' },
      { key: 'prefer_not_to_answer', label: 'Prefer not to answer' }
    ]),
    stayIntent: Object.freeze([
      { key: 'under_2', label: 'Probably less than 2 years' }, { key: '2_5', label: 'About 2–5 years' },
      { key: '5_plus', label: '5+ years / long term' }, { key: 'unsure', label: 'I’m not sure yet' },
      { key: 'prefer_not_to_answer', label: 'Prefer not to answer' }
    ]),
    improvements: Object.freeze([
      { key: 'significant', label: 'Yes — significant improvements or remodeling' },
      { key: 'some', label: 'Some updates, but nothing major' }, { key: 'none', label: 'No meaningful improvements' },
      { key: 'unsure', label: 'I’m not sure' }, { key: 'prefer_not_to_answer', label: 'Prefer not to answer' }
    ]),
    householdReliance: Object.freeze([
      { key: 'just_me', label: 'Just me', exclusive: true }, { key: 'partner', label: 'Spouse / partner' },
      { key: 'children', label: 'Children / dependents' }, { key: 'other_household', label: 'Other household members' },
      { key: 'unsure', label: 'I’m not sure how to answer', exclusive: true },
      { key: 'prefer_not_to_answer', label: 'Prefer not to answer', exclusive: true },
      { key: 'other', label: 'Something else' }
    ]),
    displacement: Object.freeze([
      { key: 'major', label: 'Major disruption — we would need a clear plan right away' },
      { key: 'meaningful', label: 'Meaningful disruption — it would take real coordination' },
      { key: 'manageable', label: 'Manageable — we have some flexibility' },
      { key: 'minimal', label: 'Minimal — we have easy alternatives' },
      { key: 'unsure', label: 'I’m not sure' }, { key: 'prefer_not_to_answer', label: 'Prefer not to answer' }
    ])
  });

  const clone = value => { try { return value == null ? value : JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };
  const text = (value, limit = 500) => String(value ?? '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, limit);
  const nowIso = () => new Date().toISOString();
  const optionFor = (catalog, key) => catalog.find(option => option.key === key) || null;
  const evidence = (key, label) => ({ source: SOURCE, key, label, capturedAt: nowIso() });
  const makeRecord = (catalog, key, evidenceKey, evidenceLabel, customLabel = '') => {
    const option = optionFor(catalog, key);
    if (!option) return null;
    const label = key === 'other' ? text(customLabel, 300) : option.label;
    if (key === 'other' && !label) return { key, value: key, label: '', source: SOURCE, evidenceRefs: [evidence(evidenceKey, evidenceLabel)] };
    return { key, value: key, label, source: SOURCE, evidenceRefs: [evidence(evidenceKey, evidenceLabel)] };
  };
  const restoreRecord = (value, catalog, evidenceKey, evidenceLabel) => {
    if (!value || typeof value !== 'object') return null;
    return makeRecord(catalog, text(value.key || value.value, 80), evidenceKey, evidenceLabel, value.label || '');
  };

  const continuity = root.CoverageFitAssessmentContinuity || null;
  const restored = continuity?.getDraft?.()?.advisoryLifestyle || null;
  let state = {
    completed: Boolean(restored?.completed),
    primaryHome: restoreRecord(restored?.primaryHome, CATALOGS.primaryHome, 'homeOwnership', 'Is this the home you live in most of the time?'),
    residenceTenure: restoreRecord(restored?.residenceTenure, CATALOGS.residenceTenure, 'residenceTenure', 'How long have you lived here?'),
    stayIntent: restoreRecord(restored?.stayIntent, CATALOGS.stayIntent, 'stayIntent', 'How long do you expect to stay here?'),
    improvements: restoreRecord(restored?.improvements, CATALOGS.improvements, 'homeImprovements', 'Have you made meaningful improvements to the home?'),
    householdReliance: Array.isArray(restored?.householdReliance) ? restored.householdReliance.map(item => restoreRecord(item, CATALOGS.householdReliance, 'householdReliance', 'Who relies on this home day-to-day?')).filter(Boolean) : [],
    householdOther: text(restored?.householdOther, 300),
    displacement: restoreRecord(restored?.displacement, CATALOGS.displacement, 'displacementDisruption', 'If you had to live somewhere else temporarily, how disruptive would that be?'),
    completedAt: text(restored?.completedAt, 40),
    branchState: restored?.branchState && typeof restored.branchState === 'object' ? clone(restored.branchState) : null,
    preserveLegacyImprovements: Boolean(restored?.improvements && !restored?.branchState)
  };

  const lifestyleBranch = () => branching?.lifestyle?.(state) || { active: true, trigger: 'compatibility_fallback', prompt: '' };
  function reconcileBranchState() {
    const branch = lifestyleBranch();
    state.branchState = { meaningfulImprovements: clone(branch) };
    if (!branch.active && state.improvements) state.improvements = null;
    return branch;
  }
  function draftValue() {
    return { contractId: CONTRACT_ID, build: BUILD, completed: state.completed, primaryHome: clone(state.primaryHome), residenceTenure: clone(state.residenceTenure), stayIntent: clone(state.stayIntent), improvements: clone(state.improvements), householdReliance: clone(state.householdReliance), householdOther: state.householdOther, displacement: clone(state.displacement), completedAt: state.completedAt, branchState: clone(state.branchState || { meaningfulImprovements: lifestyleBranch() }), preserveLegacyImprovements: Boolean(state.preserveLegacyImprovements) };
  }
  function persist(reason = 'advisory_lifestyle_progress') {
    continuity?.save?.({ advisoryLifestyle: draftValue(), stage: state.completed ? 'assessment' : 'advisory-lifestyle' }, { force: true });
    return draftValue();
  }
  const hasRecord = record => Boolean(record?.label);
  const householdReady = () => state.householdReliance.length > 0 && !state.householdReliance.some(item => item.key === 'other' && !text(item.label));
  function isComplete() { const branch = reconcileBranchState(); return Boolean(state.completed && hasRecord(state.primaryHome) && hasRecord(state.residenceTenure) && hasRecord(state.stayIntent) && (!branch.active || hasRecord(state.improvements)) && householdReady() && hasRecord(state.displacement)); }

  function getDiscoveryProfile() {
    const contract = root.CoverageFitAdvisoryDiscoveryContract;
    if (!contract?.create) return null;
    const branch = reconcileBranchState();
    const direct = [state.primaryHome, state.residenceTenure, state.stayIntent, branch.active ? state.improvements : null, state.displacement, ...state.householdReliance].filter(Boolean);
    const toValue = item => ({ value: item.value, label: item.label, source: SOURCE, evidenceRefs: clone(item.evidenceRefs) });
    const householdFacts = [state.primaryHome, state.residenceTenure, ...state.householdReliance].filter(Boolean).map(toValue);
    const lifestyleDependencies = [state.stayIntent, branch.active ? state.improvements : null, state.displacement].filter(Boolean).map(toValue);
    const customerStatements = state.householdReliance.filter(item => item.key === 'other' && item.label).map((item, index) => ({ id: `cfadv16-household-${index + 1}`, topic: 'householdContext.reliance', text: item.label, source: SOURCE, sourceKey: 'householdReliance', evidenceRefs: clone(item.evidenceRefs) }));
    return contract.create({
      product: 'home',
      source: { primary: SOURCE, inherited: false, evidenceRefs: direct.flatMap(item => item.evidenceRefs || []) },
      lifestyleDependencies,
      householdContext: { source: SOURCE, facts: householdFacts, statements: customerStatements },
      customerStatements
    });
  }

  function getSummary() {
    return {
      primaryHome: state.primaryHome?.label || '',
      residenceTenure: state.residenceTenure?.label || '',
      stayIntent: state.stayIntent?.label || '',
      improvements: state.improvements?.label || '',
      householdReliance: state.householdReliance.map(item => item.label),
      displacement: state.displacement?.label || ''
    };
  }

  function dom() {
    if (!root.document) return null;
    return {
      shell: root.document.getElementById('advisoryLifestyle'), quiz: root.document.getElementById('quiz'), live: root.document.getElementById('advisoryLifestyleLive'), continueButton: root.document.getElementById('advisoryLifestyleContinue'),
      primaryHome: [...root.document.querySelectorAll('input[name="advisory_primary_home"]')], residenceTenure: [...root.document.querySelectorAll('input[name="advisory_residence_tenure"]')], stayIntent: [...root.document.querySelectorAll('input[name="advisory_stay_intent"]')], improvementsFieldset: root.document.getElementById('advisoryImprovementsFieldset'), improvementsCue: root.document.getElementById('advisoryLifestyleImprovementsCue'), improvements: [...root.document.querySelectorAll('input[name="advisory_improvements"]')], householdReliance: [...root.document.querySelectorAll('input[name="advisory_household_reliance"]')], displacement: [...root.document.querySelectorAll('input[name="advisory_displacement"]')], householdOther: root.document.getElementById('advisoryHouseholdOther'), householdOtherWrap: root.document.getElementById('advisoryHouseholdOtherWrap')
    };
  }

  function syncRadio(inputs, record) { inputs.forEach(input => { input.checked = input.value === record?.key; }); }
  function render() {
    const ui = dom(); if (!ui) return false;
    const improvementsBranch = reconcileBranchState();
    syncRadio(ui.primaryHome, state.primaryHome); syncRadio(ui.residenceTenure, state.residenceTenure); syncRadio(ui.stayIntent, state.stayIntent); syncRadio(ui.improvements, state.improvements); syncRadio(ui.displacement, state.displacement);
    if (ui.improvementsFieldset) ui.improvementsFieldset.hidden = !improvementsBranch.active;
    if (ui.improvementsCue) { ui.improvementsCue.hidden = !improvementsBranch.active; ui.improvementsCue.dataset.active = improvementsBranch.active ? 'true' : 'false'; ui.improvementsCue.innerHTML = improvementsBranch.active ? `<strong>One useful follow-up</strong><span>${improvementsBranch.prompt}</span>` : ''; }
    ui.householdReliance.forEach(input => { input.checked = state.householdReliance.some(item => item.key === input.value); });
    const hasOther = state.householdReliance.some(item => item.key === 'other');
    if (ui.householdOtherWrap) ui.householdOtherWrap.hidden = !hasOther;
    if (ui.householdOther && ui.householdOther.value !== state.householdOther) ui.householdOther.value = state.householdOther;
    if (ui.continueButton) ui.continueButton.disabled = !(hasRecord(state.primaryHome) && hasRecord(state.residenceTenure) && hasRecord(state.stayIntent) && (!improvementsBranch.active || hasRecord(state.improvements)) && householdReady() && hasRecord(state.displacement));
    return true;
  }

  function setSingle(field, catalog, evidenceKey, evidenceLabel, event) {
    const key = text(event?.target?.value, 80); if (!optionFor(catalog, key)) return;
    state[field] = makeRecord(catalog, key, evidenceKey, evidenceLabel); state.completed = false; render(); persist();
  }
  function updateHousehold(event) {
    const ui = dom(); const key = text(event?.target?.value, 80); const option = optionFor(CATALOGS.householdReliance, key); if (!option) return;
    if (option.exclusive && event.target.checked) ui.householdReliance.forEach(input => { if (input !== event.target) input.checked = false; });
    else if (event.target.checked) ui.householdReliance.forEach(input => { const candidate = optionFor(CATALOGS.householdReliance, input.value); if (candidate?.exclusive) input.checked = false; });
    state.householdReliance = ui.householdReliance.filter(input => input.checked).map(input => makeRecord(CATALOGS.householdReliance, input.value, 'householdReliance', 'Who relies on this home day-to-day?', input.value === 'other' ? ui.householdOther?.value : '')).filter(Boolean);
    state.completed = false; render(); persist();
    if (key === 'other' && event.target.checked) requestAnimationFrame(() => ui.householdOther?.focus?.({ preventScroll: true }));
  }
  function updateHouseholdOther() {
    const ui = dom(); state.householdOther = text(ui?.householdOther?.value, 300);
    state.householdReliance = (ui?.householdReliance || []).filter(input => input.checked).map(input => makeRecord(CATALOGS.householdReliance, input.value, 'householdReliance', 'Who relies on this home day-to-day?', input.value === 'other' ? state.householdOther : '')).filter(Boolean);
    state.completed = false; render(); persist();
  }

  function complete() {
    const ui = dom();
    const improvementsBranch = reconcileBranchState();
    if (!(hasRecord(state.primaryHome) && hasRecord(state.residenceTenure) && hasRecord(state.stayIntent) && (!improvementsBranch.active || hasRecord(state.improvements)) && householdReady() && hasRecord(state.displacement))) { render(); return false; }
    state.completed = true; state.completedAt = nowIso(); persist('advisory_lifestyle_completed');
    if (ui?.shell) ui.shell.hidden = true;
    const outcomeStarted = root.CoverageFitAdvisoryOutcomeDiscovery?.start?.({ fromLifestyle: true }) === true;
    if (ui?.quiz) ui.quiz.style.display = outcomeStarted ? 'none' : '';
    root.document?.body?.classList?.add('advisory-lifestyle-complete');
    if (ui?.live) ui.live.textContent = outcomeStarted
      ? 'Your day-to-day home context is saved. Next, we’ll note which outcomes matter most to you.'
      : 'Your day-to-day home context is saved. The coverage review is starting.';
    const detail = { state: draftValue(), discoveryProfile: getDiscoveryProfile(), summary: getSummary(), outcomeStarted };
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-lifestyle-completed', { detail }));
    root.CoverageFitAnalytics?.track?.('advisory_lifestyle_completed', { product: 'home', householdRelianceCount: state.householdReliance.length, stayIntent: state.stayIntent?.key || '', displacement: state.displacement?.key || '', improvementsFollowUpAsked: improvementsBranch.active, progressiveBranch: improvementsBranch.trigger, scoreFormulaChanged: false, outcomeStarted });
    if (!outcomeStarted) requestAnimationFrame(() => root.document?.querySelector?.('.question')?.scrollIntoView?.({ behavior: root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth', block: 'start' }));
    return true;
  }
  function start(options = {}) {
    const ui = dom(); if (!ui?.shell || !ui?.quiz) return false;
    if (isComplete() && !options.force) { ui.shell.hidden = true; ui.quiz.style.display = ''; root.document?.body?.classList?.add('advisory-lifestyle-complete'); return false; }
    state.completed = false; ui.quiz.style.display = 'none'; ui.shell.hidden = false; root.document?.body?.classList?.remove('advisory-lifestyle-complete'); render(); persist('advisory_lifestyle_viewed');
    root.CoverageFitAnalytics?.track?.('advisory_lifestyle_viewed', { product: 'home', resumed: Boolean(options.resume) });
    requestAnimationFrame(() => ui.shell?.scrollIntoView?.({ behavior: 'auto', block: 'start' })); return true;
  }
  function reset() {
    state = { completed: false, primaryHome: null, residenceTenure: null, stayIntent: null, improvements: null, householdReliance: [], householdOther: '', displacement: null, completedAt: '', branchState: null, preserveLegacyImprovements: false };
    persist('advisory_lifestyle_reset'); render(); return clone(state);
  }
  function bind() {
    const ui = dom(); if (!ui?.shell || ui.shell.dataset.bound === 'true') return false; ui.shell.dataset.bound = 'true';
    ui.primaryHome.forEach(input => input.addEventListener('change', event => setSingle('primaryHome', CATALOGS.primaryHome, 'homeOwnership', 'Is this the home you live in most of the time?', event)));
    ui.residenceTenure.forEach(input => input.addEventListener('change', event => setSingle('residenceTenure', CATALOGS.residenceTenure, 'residenceTenure', 'How long have you lived here?', event)));
    ui.stayIntent.forEach(input => input.addEventListener('change', event => setSingle('stayIntent', CATALOGS.stayIntent, 'stayIntent', 'How long do you expect to stay here?', event)));
    ui.improvements.forEach(input => input.addEventListener('change', event => setSingle('improvements', CATALOGS.improvements, 'homeImprovements', 'Have you made meaningful improvements to the home?', event)));
    ui.householdReliance.forEach(input => input.addEventListener('change', updateHousehold)); ui.householdOther?.addEventListener('input', updateHouseholdOther);
    ui.displacement.forEach(input => input.addEventListener('change', event => setSingle('displacement', CATALOGS.displacement, 'displacementDisruption', 'If you had to live somewhere else temporarily, how disruptive would that be?', event)));
    ui.continueButton?.addEventListener('click', complete); render(); return true;
  }
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind(); }

  return Object.freeze({ VERSION, BUILD, CONTRACT_ID, CATALOGS, getState: () => clone(state), getDiscoveryProfile, getSummary, isComplete, start, complete, reset, render });
});
