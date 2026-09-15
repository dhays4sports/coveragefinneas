(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryOutcomeDiscovery = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.7';
  const CONTRACT_ID = 'coveragefit-outcome-concern-discovery-v1';
  const SOURCE = 'coveragefit_assessment';
  const MAX_SELECTIONS = 2;

  const CATALOG = Object.freeze([
    { key: 'out_of_pocket', label: 'A major unexpected out-of-pocket expense' },
    { key: 'temporary_displacement', label: 'Having to live somewhere else temporarily' },
    { key: 'rebuild_properly', label: 'Rebuilding the home properly' },
    { key: 'replace_belongings', label: 'Replacing belongings' },
    { key: 'water_loss', label: 'A serious water loss' },
    { key: 'liability_finances', label: 'Liability affecting our finances' },
    { key: 'premium_low', label: 'Keeping the premium as low as practical' },
    { key: 'unsure', label: 'I’m not sure yet', exclusive: true },
    { key: 'prefer_not_to_answer', label: 'Prefer not to answer', exclusive: true },
    { key: 'other', label: 'Something else' }
  ]);

  const clone = value => { try { return value == null ? value : JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };
  const text = (value, limit = 500) => String(value ?? '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, limit);
  const nowIso = () => new Date().toISOString();
  const optionFor = key => CATALOG.find(option => option.key === key) || null;
  const evidence = () => ({ source: SOURCE, key: 'outcomeConcerns', label: 'If something went wrong with your home, what would be hardest for your household?', capturedAt: nowIso() });
  const makeRecord = (key, customLabel = '') => {
    const option = optionFor(key);
    if (!option) return null;
    const label = key === 'other' ? text(customLabel, 300) : option.label;
    return { key, value: key, label, source: SOURCE, evidenceRefs: [evidence()] };
  };
  const restoreRecord = value => {
    if (!value || typeof value !== 'object') return null;
    return makeRecord(text(value.key || value.value, 80), value.label || '');
  };

  const continuity = root.CoverageFitAssessmentContinuity || null;
  const restored = continuity?.getDraft?.()?.advisoryOutcome || null;
  let state = {
    completed: Boolean(restored?.completed),
    concerns: Array.isArray(restored?.concerns) ? restored.concerns.map(restoreRecord).filter(Boolean) : [],
    otherText: text(restored?.otherText, 300),
    completedAt: text(restored?.completedAt, 40)
  };

  function draftValue() {
    return { contractId: CONTRACT_ID, build: BUILD, completed: state.completed, concerns: clone(state.concerns), otherText: state.otherText, completedAt: state.completedAt };
  }
  function persist(reason = 'advisory_outcome_progress') {
    continuity?.save?.({ advisoryOutcome: draftValue(), stage: state.completed ? 'assessment' : 'advisory-outcome' }, { force: true });
    return draftValue();
  }
  const validConcerns = () => state.concerns.length > 0
    && state.concerns.length <= MAX_SELECTIONS
    && !state.concerns.some(item => item.key === 'other' && !text(item.label));
  function isComplete() { return Boolean(state.completed && validConcerns()); }

  function getDiscoveryProfile() {
    const contract = root.CoverageFitAdvisoryDiscoveryContract;
    if (!contract?.create) return null;
    const outcomeConcerns = state.concerns.map(item => ({
      value: item.value,
      label: item.label,
      source: SOURCE,
      evidenceRefs: clone(item.evidenceRefs)
    }));
    const customerStatements = state.concerns
      .filter(item => item.key === 'other' && item.label)
      .map((item, index) => ({
        id: `cfadv17-outcome-${index + 1}`,
        topic: 'outcomeConcerns.other',
        text: item.label,
        source: SOURCE,
        sourceKey: 'outcomeConcerns',
        evidenceRefs: clone(item.evidenceRefs)
      }));
    return contract.create({
      product: 'home',
      source: { primary: SOURCE, inherited: false, evidenceRefs: outcomeConcerns.flatMap(item => item.evidenceRefs || []) },
      outcomeConcerns,
      customerStatements
    });
  }

  function getSummary() {
    return { concerns: state.concerns.map((item, index) => ({ rank: index + 1, key: item.key, label: item.label })) };
  }

  function dom() {
    if (!root.document) return null;
    return {
      shell: root.document.getElementById('advisoryOutcome'),
      quiz: root.document.getElementById('quiz'),
      live: root.document.getElementById('advisoryOutcomeLive'),
      continueButton: root.document.getElementById('advisoryOutcomeContinue'),
      concerns: [...root.document.querySelectorAll('input[name="advisory_outcome_concern"]')],
      other: root.document.getElementById('advisoryOutcomeOther'),
      otherWrap: root.document.getElementById('advisoryOutcomeOtherWrap'),
      count: root.document.getElementById('advisoryOutcomeCount')
    };
  }

  function render() {
    const ui = dom(); if (!ui) return false;
    ui.concerns.forEach(input => { input.checked = state.concerns.some(item => item.key === input.value); });
    const hasOther = state.concerns.some(item => item.key === 'other');
    if (ui.otherWrap) ui.otherWrap.hidden = !hasOther;
    if (ui.other && ui.other.value !== state.otherText) ui.other.value = state.otherText;
    if (ui.count) ui.count.textContent = `${state.concerns.length} of ${MAX_SELECTIONS} selected`;
    if (ui.continueButton) ui.continueButton.disabled = !validConcerns();
    return true;
  }

  function updateConcerns(event) {
    const ui = dom();
    const key = text(event?.target?.value, 80);
    const option = optionFor(key);
    if (!ui || !option) return;

    if (event.target.checked && option.exclusive) {
      ui.concerns.forEach(input => { input.checked = input === event.target; });
      state.concerns = [makeRecord(key)].filter(Boolean);
    } else if (event.target.checked) {
      ui.concerns.forEach(input => {
        const candidate = optionFor(input.value);
        if (candidate?.exclusive) input.checked = false;
      });
      const existing = state.concerns.filter(item => !optionFor(item.key)?.exclusive && item.key !== key);
      if (existing.length >= MAX_SELECTIONS) {
        event.target.checked = false;
        if (ui.live) ui.live.textContent = 'Choose up to two. Remove one selection before adding another.';
      } else {
        state.concerns = [...existing, makeRecord(key, key === 'other' ? state.otherText : '')].filter(Boolean);
      }
    } else {
      state.concerns = state.concerns.filter(item => item.key !== key);
    }

    state.completed = false;
    render();
    persist();
    if (key === 'other' && event.target.checked) requestAnimationFrame(() => ui.other?.focus?.({ preventScroll: true }));
  }

  function updateOther() {
    const ui = dom();
    state.otherText = text(ui?.other?.value, 300);
    state.concerns = state.concerns.map(item => item.key === 'other' ? makeRecord('other', state.otherText) : item).filter(Boolean);
    state.completed = false;
    render();
    persist();
  }

  function complete() {
    const ui = dom();
    if (!validConcerns()) { render(); return false; }
    state.completed = true;
    state.completedAt = nowIso();
    persist('advisory_outcome_completed');
    if (ui?.shell) ui.shell.hidden = true;
    if (ui?.quiz) ui.quiz.style.display = '';
    root.document?.body?.classList?.add('advisory-outcome-complete');
    if (ui?.live) ui.live.textContent = 'What matters most is saved. The coverage review is starting.';
    const detail = { state: draftValue(), discoveryProfile: getDiscoveryProfile(), summary: getSummary() };
    if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-outcome-completed', { detail }));
    root.CoverageFitAnalytics?.track?.('advisory_outcome_completed', {
      product: 'home',
      concernCount: state.concerns.length,
      firstConcern: state.concerns[0]?.key || '',
      secondConcern: state.concerns[1]?.key || '',
      scoreFormulaChanged: false
    });
    requestAnimationFrame(() => (root.document?.querySelector?.('#advisoryReaction:not([hidden])') || root.document?.querySelector?.('.question'))?.scrollIntoView?.({
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
      root.document?.body?.classList?.add('advisory-outcome-complete');
      return false;
    }
    state.completed = false;
    ui.quiz.style.display = 'none';
    ui.shell.hidden = false;
    root.document?.body?.classList?.remove('advisory-outcome-complete');
    render();
    persist('advisory_outcome_viewed');
    root.CoverageFitAnalytics?.track?.('advisory_outcome_viewed', { product: 'home', resumed: Boolean(options.resume), scoreFormulaChanged: false });
    requestAnimationFrame(() => ui.shell?.scrollIntoView?.({ behavior: 'auto', block: 'start' }));
    return true;
  }

  function reset() {
    state = { completed: false, concerns: [], otherText: '', completedAt: '' };
    persist('advisory_outcome_reset');
    render();
    return clone(state);
  }

  function bind() {
    const ui = dom();
    if (!ui?.shell || ui.shell.dataset.bound === 'true') return false;
    ui.shell.dataset.bound = 'true';
    ui.concerns.forEach(input => input.addEventListener('change', updateConcerns));
    ui.other?.addEventListener('input', updateOther);
    ui.continueButton?.addEventListener('click', complete);
    render();
    return true;
  }

  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
  }

  return Object.freeze({
    VERSION, BUILD, CONTRACT_ID, MAX_SELECTIONS, CATALOG,
    getState: () => clone(state), getDiscoveryProfile, getSummary, isComplete, start, complete, reset, render
  });
});
