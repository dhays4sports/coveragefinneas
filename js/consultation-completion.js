(function (root, factory) {
  'use strict';
  const api = factory();
  root.CoverageFitConsultationCompletion = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = '1.0';
  const UNRESOLVED_STATES = Object.freeze(['open', 'none']);
  const QUOTE_STATES = Object.freeze(['not_requested', 'ready', 'needs_items', 'requested']);

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback || '';
  }

  function normalize(source, fallback) {
    const current = source && typeof source === 'object' ? source : {};
    const previous = fallback && typeof fallback === 'object' ? fallback : {};
    const unresolvedState = UNRESOLVED_STATES.includes(text(current.unresolvedState, text(previous.unresolvedState, 'open')))
      ? text(current.unresolvedState, text(previous.unresolvedState, 'open')) : 'open';
    const quoteState = QUOTE_STATES.includes(text(current.quoteState, text(previous.quoteState, 'not_requested')))
      ? text(current.quoteState, text(previous.quoteState, 'not_requested')) : 'not_requested';
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      state: text(current.state, text(previous.state, 'draft')) === 'complete' ? 'complete' : 'draft',
      decisionSummary: text(current.decisionSummary, text(previous.decisionSummary)).slice(0, 700),
      unresolvedState,
      unresolvedSummary: unresolvedState === 'none' ? '' : text(current.unresolvedSummary, text(previous.unresolvedSummary)).slice(0, 900),
      quoteState,
      quoteRequirements: quoteState === 'not_requested' ? '' : text(current.quoteRequirements, text(previous.quoteRequirements)).slice(0, 900),
      nextAction: text(current.nextAction, text(previous.nextAction)).slice(0, 700),
      completedAt: text(current.completedAt, text(previous.completedAt)).slice(0, 40),
      updatedAt: text(current.updatedAt, text(previous.updatedAt)).slice(0, 40)
    });
  }

  function validate(source) {
    const value = normalize(source);
    const errors = [];
    if (!value.decisionSummary) errors.push({ field: 'decisionSummary', code: 'decision_required', message: 'Record what the homeowner decided or is considering.' });
    if (value.unresolvedState === 'open' && !value.unresolvedSummary) errors.push({ field: 'unresolvedSummary', code: 'unresolved_summary_required', message: 'List the unresolved items, or choose No unresolved items.' });
    if (value.quoteState === 'needs_items' && !value.quoteRequirements) errors.push({ field: 'quoteRequirements', code: 'quote_requirements_required', message: 'List what is still needed for the carrier quote.' });
    if (!value.nextAction) errors.push({ field: 'nextAction', code: 'next_action_required', message: 'Record who will do what next.' });
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), value });
  }

  function prepare(source, options) {
    const validation = validate(source);
    if (!validation.valid) return Object.freeze({ valid: false, errors: validation.errors, completion: validation.value });
    const stamp = text(options?.updatedAt, new Date().toISOString());
    return Object.freeze({
      valid: true,
      errors: Object.freeze([]),
      completion: Object.freeze({ ...validation.value, state: 'complete', completedAt: validation.value.completedAt || stamp, updatedAt: stamp })
    });
  }

  function decisionInventory(plan) {
    const items = Array.isArray(plan?.items) ? plan.items : [];
    const labels = { undecided: 'Not decided', consider: 'Discuss / consider', recommend: 'Recommend for carrier quote', defer: 'Deferred', not_recommended: 'Not recommended after review' };
    return Object.freeze(items.map(item => Object.freeze({
      title: text(item?.title, 'Protection topic'),
      decision: text(item?.decision, 'undecided'),
      label: labels[text(item?.decision, 'undecided')] || 'Not decided',
      verified: item?.verified === true
    })));
  }

  function build(snapshot, record, draft) {
    const stored = record?.remote?.completion || record?.completion || snapshot?.consultation?.completion || {};
    const completion = normalize(draft || stored, stored);
    const plan = record?.remote?.recommendationPlan || record?.recommendationPlan || snapshot?.consultation?.recommendationPlan || {};
    const decisions = decisionInventory(plan);
    const evidence = snapshot?.evidenceHandoff || {};
    const evidenceOpen = Number(evidence?.summary?.verification || 0) + Number(evidence?.summary?.unresolved || 0);
    const findingOpen = decisions.filter(item => !item.verified || ['undecided', 'defer'].includes(item.decision)).length;
    const followUp = record?.remote?.followUp || {};
    return Object.freeze({
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      completion,
      decisions,
      evidence: Object.freeze({ openCount: evidenceOpen, findingOpenCount: findingOpen }),
      followUp: Object.freeze({ state: text(followUp.state, record?.remote?.serverBacked ? 'none' : 'local'), dueDate: text(followUp.dueDate), note: text(followUp.note) }),
      status: completion.state === 'complete' ? 'complete' : 'draft',
      guardrail: 'This closeout records the producer’s consultation notes. Carrier forms, eligibility, underwriting, price, and issued policy terms remain authoritative.'
    });
  }

  return Object.freeze({ VERSION, SCHEMA_VERSION, UNRESOLVED_STATES, QUOTE_STATES, normalize, validate, prepare, build });
});
