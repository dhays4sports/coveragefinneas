(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CoverageFitTimelineModel = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = 1;
  const STATUS_ORDER = Object.freeze({ reviewed: 0, current: 1, upcoming: 2 });

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

  function checklistStatus(item, currentPhaseId) {
    if (!item) return null;
    const status = String(item.status || '').toLowerCase();
    if (status === 'complete' || status === 'completed' || status === 'done') return 'reviewed';
    if (status === 'active' || status === 'current') return 'current';
    return 'upcoming';
  }

  function normalizeItem(item, index, context) {
    const source = item && typeof item === 'object' ? item : {};
    const id = text(source.id) || `timeline-item-${index + 1}`;
    const phaseId = text(source.phase || source.phaseId) || 'consultation';
    const checklistItem = context.checklistBySource.get(id) || context.checklistById.get(text(source.checklistItemId));
    const derivedStatus = checklistStatus(checklistItem, context.currentPhaseId);
    const status = derivedStatus || (phaseId === context.currentPhaseId ? 'current' : 'upcoming');
    return {
      id,
      sequence: index + 1,
      phaseId,
      sectionId: text(context.sectionId),
      sectionTitle: text(context.sectionTitle),
      type: text(source.type),
      title: text(source.title) || 'Consultation topic',
      objective: text(source.objective),
      prompt: text(source.prompt),
      coachingNote: text(source.coachingNote),
      estimatedMinutes: Math.max(0, finiteNumber(source.estimatedMinutes, 0)),
      sourceIds: uniqueStrings(source.sourceIds),
      checklistItemId: text(checklistItem?.id),
      status,
      statusRank: STATUS_ORDER[status],
      sourceIndex: index
    };
  }

  function sectionMap(timeline) {
    const map = new Map();
    (Array.isArray(timeline.sections) ? timeline.sections : []).forEach((section, index) => {
      const id = text(section?.id) || `timeline-section-${index + 1}`;
      map.set(id, {
        id,
        title: text(section?.title) || `Consultation section ${index + 1}`,
        order: index + 1,
        estimatedMinutes: Math.max(0, finiteNumber(section?.estimatedMinutes, 0)),
        itemIds: uniqueStrings((section?.items || []).map(item => item?.id))
      });
    });
    return map;
  }

  function buildSections(timeline, items) {
    const supplied = sectionMap(timeline);
    items.forEach(item => {
      const id = item.sectionId || item.phaseId;
      if (!supplied.has(id)) supplied.set(id, {
        id,
        title: item.sectionTitle || (item.phaseId === 'consultation' ? 'Consultation' : item.phaseId.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
        order: supplied.size + 1,
        estimatedMinutes: 0,
        itemIds: []
      });
    });
    return Array.from(supplied.values()).map(section => {
      const sectionItems = items.filter(item => item.sectionId === section.id || (!item.sectionId && item.phaseId === section.id));
      const itemIds = sectionItems.map(item => item.id);
      return {
        id: section.id,
        title: section.title,
        order: section.order,
        itemIds,
        itemCount: itemIds.length,
        estimatedMinutes: section.estimatedMinutes || sectionItems.reduce((sum, item) => sum + item.estimatedMinutes, 0),
        reviewedCount: sectionItems.filter(item => item.status === 'reviewed').length,
        currentCount: sectionItems.filter(item => item.status === 'current').length
      };
    }).filter(section => section.itemCount > 0).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }

  function create(printModel) {
    const source = printModel && typeof printModel === 'object' ? printModel : {};
    const timeline = source.timeline && typeof source.timeline === 'object' ? source.timeline : {};
    const checklist = source.consultationChecklist && typeof source.consultationChecklist === 'object' ? source.consultationChecklist : {};
    const checklistItems = Array.isArray(checklist.items) ? checklist.items : [];
    const checklistBySource = new Map(checklistItems.filter(item => text(item?.sourceItemId)).map(item => [text(item.sourceItemId), item]));
    const checklistById = new Map(checklistItems.filter(item => text(item?.id)).map(item => [text(item.id), item]));
    const currentPhaseId = text(checklist.currentPhase || checklist.currentPhaseId);
    const suppliedSections = sectionMap(timeline);
    const rawItems = Array.isArray(timeline.items) && timeline.items.length
      ? timeline.items
      : (Array.isArray(timeline.sections) ? timeline.sections.flatMap(section => (section.items || []).map(item => Object.assign({}, item, { sectionId: section.id, sectionTitle: section.title }))) : []);
    const items = rawItems.map((item, index) => {
      const phaseId = text(item?.phase || item?.phaseId);
      const matchingSection = suppliedSections.get(text(item?.sectionId)) || suppliedSections.get(phaseId);
      return normalizeItem(item, index, {
        checklistBySource,
        checklistById,
        currentPhaseId,
        sectionId: text(item?.sectionId) || matchingSection?.id || phaseId,
        sectionTitle: text(item?.sectionTitle) || matchingSection?.title
      });
    });
    const sections = buildSections(timeline, items);
    const reviewed = items.filter(item => item.status === 'reviewed').length;
    const current = items.filter(item => item.status === 'current').length;
    const upcoming = items.length - reviewed - current;
    const estimatedMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const remainingMinutes = items.filter(item => item.status !== 'reviewed').reduce((sum, item) => sum + item.estimatedMinutes, 0);

    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      modelVersion: VERSION,
      available: timeline.state === 'ready' && items.length > 0,
      state: text(timeline.state) || 'empty',
      summary: {
        total: items.length,
        reviewed,
        current,
        upcoming,
        estimatedMinutes: finiteNumber(timeline.summary?.estimatedMinutes, estimatedMinutes),
        remainingMinutes,
        sectionCount: sections.length,
        firstPriority: text(timeline.summary?.firstPriority)
      },
      sections,
      items,
      questions: uniqueStrings(timeline.questions),
      guardrails: uniqueStrings(timeline.guardrails),
      plannerSummary: clone(timeline.summary) || null,
      source: {
        printSchemaVersion: source.schemaVersion ?? null,
        printEngineVersion: text(source.engineVersion),
        plannerVersion: text(source.metadata?.sourceVersions?.planner),
        generatedAt: text(source.generatedAt)
      }
    });
  }

  function hasContent(model) {
    return Boolean(model && model.available && Array.isArray(model.items) && model.items.length);
  }

  function getDiagnostics(model) {
    const warnings = [];
    if (!model?.available) warnings.push('Consultation timeline is unavailable.');
    if (!Array.isArray(model?.items) || !model.items.length) warnings.push('Consultation timeline contains no items.');
    if (!Array.isArray(model?.sections) || !model.sections.length) warnings.push('Consultation timeline contains no sections.');
    (model?.items || []).forEach((item, index) => {
      if (!item.title) warnings.push(`Timeline item ${index + 1} has no title.`);
      if (!item.phaseId) warnings.push(`Timeline item ${index + 1} has no phase.`);
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
