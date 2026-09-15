(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CoverageFitChecklistModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = 1;
  const STATUS_ORDER = Object.freeze({ active: 0, pending: 1, complete: 2, skipped: 3 });

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); }
    catch (error) { return null; }
  }

  function text(value) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }

  function finiteNumber(value, fallback) {
    if (value == null || value === '') return fallback == null ? null : fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : (fallback == null ? null : fallback);
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const output = [];
    (Array.isArray(values) ? values : []).forEach(value => {
      const normalized = text(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      output.push(normalized);
    });
    return output;
  }

  function normalizeStatus(value) {
    const normalized = String(value || 'pending').trim().toLowerCase();
    if (normalized === 'done' || normalized === 'completed') return 'complete';
    if (normalized === 'in-progress' || normalized === 'in_progress' || normalized === 'current') return 'active';
    return Object.prototype.hasOwnProperty.call(STATUS_ORDER, normalized) ? normalized : 'pending';
  }

  function normalizePriority(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['critical', 'urgent'].includes(normalized)) return 'Critical';
    if (['high', 'important'].includes(normalized)) return 'High';
    if (['medium', 'moderate'].includes(normalized)) return 'Medium';
    if (['low', 'optional'].includes(normalized)) return 'Low';
    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : null;
  }

  function normalizeItem(item, index, phaseTitles) {
    const source = item && typeof item === 'object' ? item : {};
    const phaseId = text(source.phaseId || source.phase) || 'general';
    return {
      id: text(source.id || source.checklistItemId) || `checklist-item-${index + 1}`,
      sourceItemId: text(source.sourceItemId),
      phaseId,
      phaseTitle: text(source.phaseTitle) || phaseTitles.get(phaseId) || 'Consultation',
      order: finiteNumber(source.order, index + 1),
      title: text(source.title || source.label) || 'Consultation item',
      description: text(source.description || source.objective),
      prompt: text(source.prompt),
      coachingNote: text(source.coachingNote || source.note),
      status: normalizeStatus(source.status),
      estimatedMinutes: Math.max(0, finiteNumber(source.estimatedMinutes, 0)),
      required: source.required !== false,
      priority: normalizePriority(source.priority),
      recommendationIds: uniqueStrings(source.recommendationIds || source.sourceIds),
      evidence: uniqueStrings(source.evidence),
      updatedAt: text(source.updatedAt),
      metadata: clone(source.metadata) || null,
      sourceIndex: index
    };
  }

  function normalizePhase(phase, index, items) {
    const source = phase && typeof phase === 'object' ? phase : {};
    const id = text(source.id || source.phaseId) || `phase-${index + 1}`;
    const phaseItems = items.filter(item => item.phaseId === id);
    const itemIds = phaseItems.map(item => item.id);
    const completed = phaseItems.filter(item => item.status === 'complete').length;
    return {
      id,
      title: text(source.title || source.name) || `Phase ${index + 1}`,
      order: finiteNumber(source.order, index + 1),
      estimatedMinutes: Math.max(0, finiteNumber(source.estimatedMinutes, phaseItems.reduce((sum, item) => sum + item.estimatedMinutes, 0))),
      itemIds,
      itemCount: itemIds.length,
      completedCount: completed,
      completionPercent: itemIds.length ? Math.round((completed / itemIds.length) * 100) : 0
    };
  }

  function buildPhases(rawPhases, items) {
    const supplied = Array.isArray(rawPhases) ? rawPhases : [];
    const phaseMap = new Map();
    supplied.forEach((phase, index) => {
      const id = text(phase?.id || phase?.phaseId) || `phase-${index + 1}`;
      phaseMap.set(id, Object.assign({}, phase, { id }));
    });
    items.forEach(item => {
      if (!phaseMap.has(item.phaseId)) phaseMap.set(item.phaseId, { id: item.phaseId, title: item.phaseTitle });
    });
    return Array.from(phaseMap.values())
      .map((phase, index) => normalizePhase(phase, index, items))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }

  function buildSummary(source, items, phases) {
    const completed = items.filter(item => item.status === 'complete').length;
    const active = items.filter(item => item.status === 'active').length;
    const skipped = items.filter(item => item.status === 'skipped').length;
    const pending = items.length - completed - active - skipped;
    const remainingMinutes = items.filter(item => item.status !== 'complete' && item.status !== 'skipped')
      .reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const completedPhases = phases.filter(phase => phase.itemCount > 0 && phase.completedCount === phase.itemCount).length;
    const supplied = source && typeof source === 'object' ? source : {};
    return {
      total: items.length,
      completed,
      active,
      pending,
      skipped,
      completionPercent: items.length ? Math.round((completed / items.length) * 100) : 0,
      remainingMinutes: finiteNumber(supplied.remainingMinutes, remainingMinutes),
      completedPhases: finiteNumber(supplied.completedPhases, completedPhases),
      totalPhases: finiteNumber(supplied.totalPhases, phases.length)
    };
  }

  function create(printModel) {
    const source = printModel && typeof printModel === 'object' ? printModel : {};
    const checklist = source.consultationChecklist && typeof source.consultationChecklist === 'object'
      ? source.consultationChecklist : {};
    const rawPhases = Array.isArray(checklist.phases) ? checklist.phases : [];
    const phaseTitles = new Map(rawPhases.map(phase => [text(phase?.id || phase?.phaseId), text(phase?.title || phase?.name)]));
    const items = (Array.isArray(checklist.items) ? checklist.items : [])
      .map((item, index) => normalizeItem(item, index, phaseTitles))
      .sort((a, b) => a.order - b.order || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.sourceIndex - b.sourceIndex);
    const phases = buildPhases(rawPhases, items);
    const summary = buildSummary(checklist.progress || checklist.summary, items, phases);

    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      modelVersion: VERSION,
      available: checklist.available !== false && items.length > 0,
      currentPhaseId: text(checklist.currentPhase || checklist.currentPhaseId),
      plannerVersion: text(checklist.plannerVersion),
      summary,
      phases,
      items,
      diagnostics: clone(checklist.diagnostics) || null,
      source: {
        printSchemaVersion: source.schemaVersion ?? null,
        printEngineVersion: text(source.engineVersion),
        generatedAt: text(source.generatedAt)
      }
    });
  }

  function hasContent(model) {
    return Boolean(model && model.available && Array.isArray(model.items) && model.items.length);
  }

  function getDiagnostics(model) {
    const warnings = [];
    if (!model?.available) warnings.push('Consultation checklist is unavailable.');
    if (!Array.isArray(model?.items) || !model.items.length) warnings.push('Consultation checklist contains no items.');
    if (!Array.isArray(model?.phases) || !model.phases.length) warnings.push('Consultation checklist contains no phases.');
    (model?.items || []).forEach((item, index) => {
      if (!item.title) warnings.push(`Checklist item ${index + 1} has no title.`);
      if (!item.phaseId) warnings.push(`Checklist item ${index + 1} has no phase.`);
    });
    return deepFreeze({
      valid: hasContent(model),
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      warningCount: warnings.length,
      warnings
    });
  }

  return Object.freeze({ VERSION, SCHEMA_VERSION, create, hasContent, getDiagnostics });
});
