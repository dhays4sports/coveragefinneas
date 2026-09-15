(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitRecommendationBuilder = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:recommendation-builder-ready', {
      detail: { version: api.VERSION, schemaVersion: api.SCHEMA_VERSION }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = '1.0';
  const DEFAULT_LIMIT = 3;
  const DECISIONS = Object.freeze([
    Object.freeze({ value: 'undecided', label: 'Not decided', action: 'No recommendation recorded' }),
    Object.freeze({ value: 'consider', label: 'Discuss / consider', action: 'Continue the homeowner discussion' }),
    Object.freeze({ value: 'recommend', label: 'Recommend for carrier quote', action: 'Include for carrier quoting and verification' }),
    Object.freeze({ value: 'defer', label: 'Defer', action: 'Document for a later review' }),
    Object.freeze({ value: 'not_recommended', label: 'Not recommended after review', action: 'Do not include in the current recommendation' })
  ]);
  const DECISION_VALUES = new Set(DECISIONS.map(item => item.value));

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function finite(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function stableId(value, index) {
    const raw = text(value, `finding-${index + 1}`).toLowerCase();
    return raw.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || `finding-${index + 1}`;
  }

  function evidenceLabel(quality) {
    if (quality === 'needs-verification') return 'Check policy';
    if (quality === 'partial' || quality === 'missing') return 'Ask homeowner';
    return 'Homeowner answer';
  }

  function decisionDefinition(value) {
    return DECISIONS.find(item => item.value === value) || DECISIONS[0];
  }

  function rankedFindings(snapshot, limit) {
    const source = Array.isArray(snapshot?.recommendations) ? snapshot.recommendations : [];
    const byId = new Map(source.map((item, index) => [text(item?.id, stableId(item?.title, index)), item]));
    let ranked = [];
    try {
      ranked = root.CoverageFitConsultationCommandCenter?.priorityFindings?.(snapshot, limit) || [];
    } catch (_) {}
    if (!Array.isArray(ranked) || !ranked.length) {
      ranked = source.slice(0, limit).map((item, index) => ({
        id: text(item?.id, stableId(item?.title, index)),
        rank: index + 1,
        title: text(item?.title, 'Protection topic'),
        detail: text(item?.explanation, 'Confirm how the current policy addresses this topic.'),
        rationale: 'This priority was preserved from the completed assessment.',
        priority: text(item?.priority, 'Review topic'),
        evidenceQuality: text(item?.evidenceQuality, 'confirmed')
      }));
    }
    return ranked.slice(0, limit).map((finding, index) => {
      const id = text(finding?.id, stableId(finding?.title, index));
      const original = byId.get(id) || source.find(item => text(item?.title) === text(finding?.title)) || {};
      const quality = text(original?.evidenceQuality || finding?.evidenceQuality, 'confirmed').toLowerCase();
      return {
        id,
        rank: finite(finding?.rank) || index + 1,
        title: text(finding?.title || original?.title, 'Protection topic'),
        detail: text(finding?.detail || original?.explanation, 'Confirm how the current policy addresses this topic.'),
        assessmentRationale: text(finding?.rationale, 'This priority was preserved from the completed assessment.'),
        priority: text(finding?.priority || original?.priority, 'Review topic'),
        evidenceQuality: quality,
        evidenceLabel: text(original?.evidenceLabel, evidenceLabel(quality)),
        evidencePrompt: text(original?.evidencePrompt || original?.conversationStarter),
        findingType: text(finding?.findingType || original?.source?.findingType, 'review-topic')
      };
    });
  }

  function savedItems(plan) {
    const items = Array.isArray(plan?.items) ? plan.items : [];
    return new Map(items.map(item => [text(item?.findingId || item?.id), item]).filter(([id]) => id));
  }

  function summary(items) {
    const result = { total: items.length, verified: 0, unverified: 0, undecided: 0, consider: 0, recommend: 0, defer: 0, notRecommended: 0 };
    items.forEach(item => {
      if (item.verified) result.verified += 1;
      else result.unverified += 1;
      if (item.decision === 'not_recommended') result.notRecommended += 1;
      else if (Object.prototype.hasOwnProperty.call(result, item.decision)) result[item.decision] += 1;
      else result.undecided += 1;
    });
    return result;
  }

  function planStatus(items) {
    if (!items.length) return 'empty';
    if (items.every(item => item.decision !== 'undecided') && items.some(item => item.decision === 'recommend')) return 'structured';
    if (items.some(item => item.decision !== 'undecided' || item.verified || item.producerReason)) return 'draft';
    return 'not-started';
  }

  function build(snapshot, savedPlan, options) {
    const settings = options || {};
    const limit = clamp(finite(settings.limit) || DEFAULT_LIMIT, 1, 5);
    if (text(snapshot?.state, 'empty') !== 'ready') {
      return {
        schemaVersion: SCHEMA_VERSION,
        builderVersion: VERSION,
        state: 'empty',
        consultationId: text(snapshot?.consultation?.id),
        items: [],
        summary: summary([]),
        updatedAt: '',
        diagnostics: { valid: false, errors: [], warnings: ['A ready Workspace snapshot is required.'] }
      };
    }
    const previous = savedItems(savedPlan);
    const items = rankedFindings(snapshot, limit).map(finding => {
      const saved = previous.get(finding.id) || {};
      const verified = saved?.verified === true;
      let decision = text(saved?.decision, 'undecided').toLowerCase();
      if (!DECISION_VALUES.has(decision)) decision = 'undecided';
      if (!verified && decision === 'recommend') decision = 'undecided';
      return {
        id: `recommendation-${stableId(finding.id, finding.rank - 1)}`,
        findingId: finding.id,
        rank: finding.rank,
        title: finding.title,
        detail: finding.detail,
        assessmentRationale: finding.assessmentRationale,
        priority: finding.priority,
        findingType: finding.findingType,
        evidenceQuality: finding.evidenceQuality,
        evidenceLabel: finding.evidenceLabel,
        evidencePrompt: finding.evidencePrompt,
        verified,
        verifiedAt: verified ? text(saved?.verifiedAt) : '',
        decision,
        decisionLabel: decisionDefinition(decision).label,
        action: decisionDefinition(decision).action,
        producerReason: text(saved?.producerReason).slice(0, 500),
        updatedAt: text(saved?.updatedAt)
      };
    });
    const model = {
      schemaVersion: SCHEMA_VERSION,
      builderVersion: VERSION,
      state: planStatus(items),
      consultationId: text(snapshot?.consultation?.id),
      items,
      summary: summary(items),
      updatedAt: text(savedPlan?.updatedAt),
      diagnostics: { valid: true, errors: [], warnings: [] }
    };
    return clone(model);
  }

  function update(plan, itemId, changes, options) {
    const source = clone(plan) || { items: [] };
    const id = text(itemId);
    const stamp = text(options?.updatedAt, new Date().toISOString());
    source.items = (Array.isArray(source.items) ? source.items : []).map(item => {
      if (text(item?.id) !== id && text(item?.findingId) !== id) return item;
      const verified = Object.prototype.hasOwnProperty.call(changes || {}, 'verified') ? changes.verified === true : item.verified === true;
      let decision = Object.prototype.hasOwnProperty.call(changes || {}, 'decision') ? text(changes.decision).toLowerCase() : text(item.decision, 'undecided').toLowerCase();
      if (!DECISION_VALUES.has(decision)) decision = 'undecided';
      if (!verified && decision === 'recommend') decision = 'undecided';
      const producerReason = Object.prototype.hasOwnProperty.call(changes || {}, 'producerReason')
        ? text(changes.producerReason).slice(0, 500)
        : text(item.producerReason).slice(0, 500);
      return {
        ...item,
        verified,
        verifiedAt: verified ? (text(item.verifiedAt) || stamp) : '',
        decision,
        decisionLabel: decisionDefinition(decision).label,
        action: decisionDefinition(decision).action,
        producerReason,
        updatedAt: stamp
      };
    });
    source.state = planStatus(source.items);
    source.summary = summary(source.items);
    source.updatedAt = stamp;
    source.diagnostics = validate(source);
    return clone(source);
  }

  function validate(plan) {
    const errors = [];
    const items = Array.isArray(plan?.items) ? plan.items : [];
    if (!items.length) errors.push({ code: 'no_findings', message: 'No priority findings are available to structure.' });
    items.forEach(item => {
      const decision = text(item?.decision, 'undecided').toLowerCase();
      if (!DECISION_VALUES.has(decision)) errors.push({ code: 'invalid_decision', itemId: text(item?.id), message: `Choose a supported judgment for ${text(item?.title, 'this finding')}.` });
      if (decision === 'recommend' && item?.verified !== true) errors.push({ code: 'verification_required', itemId: text(item?.id), message: `Verify ${text(item?.title, 'this finding')} before recommending it.` });
      if (['recommend', 'not_recommended'].includes(decision) && !text(item?.producerReason)) errors.push({ code: 'reason_required', itemId: text(item?.id), message: `Add the producer reasoning for ${text(item?.title, 'this finding')}.` });
    });
    return { valid: errors.length === 0, errors, warnings: items.some(item => item.decision === 'undecided') ? ['One or more findings are not decided.'] : [] };
  }

  function prepareForSave(plan, options) {
    const checked = validate(plan);
    if (!checked.valid) return { valid: false, errors: checked.errors, plan: null };
    const stamp = text(options?.updatedAt, new Date().toISOString());
    const items = (Array.isArray(plan?.items) ? plan.items : []).map(item => ({
      id: text(item.id),
      findingId: text(item.findingId),
      title: text(item.title).slice(0, 160),
      decision: text(item.decision, 'undecided'),
      verified: item.verified === true,
      verifiedAt: item.verified === true ? text(item.verifiedAt, stamp) : '',
      producerReason: text(item.producerReason).slice(0, 500),
      updatedAt: text(item.updatedAt, stamp)
    }));
    return {
      valid: true,
      errors: [],
      plan: {
        schemaVersion: SCHEMA_VERSION,
        builderVersion: VERSION,
        state: planStatus(items),
        items,
        summary: summary(items),
        updatedAt: stamp
      }
    };
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    DECISIONS,
    build,
    update,
    validate,
    prepareForSave
  });
});
