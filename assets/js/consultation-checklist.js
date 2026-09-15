(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitConsultationChecklist = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:consultation-checklist-engine-ready', {
      detail: { version: api.VERSION, schemaVersion: api.SCHEMA_VERSION }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '0.7.0';
  const SCHEMA_VERSION = '1.0';
  const STORAGE_SCHEMA_VERSION = '1.0';
  const STORAGE_PREFIX = 'coveragefit.workspace.checklist';
  const DEFAULT_MAX_AGE_DAYS = 30;
  const STATUS = Object.freeze({
    PENDING: 'pending',
    ACTIVE: 'active',
    COMPLETE: 'complete'
  });
  const VALID_STATUSES = Object.freeze(Object.values(STATUS));
  const EVENTS = Object.freeze({
    READY: 'coveragefit:consultation-checklist-ready',
    CHANGE: 'coveragefit:consultation-checklist-change',
    RESET: 'coveragefit:consultation-checklist-reset'
  });
  let currentChecklist = null;

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }

  function text(value, fallback) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value === 0) return '0';
    return fallback || '';
  }

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback == null ? null : fallback);
  }

  function positiveMinutes(value) {
    const parsed = finiteNumber(value, 0);
    return Math.max(0, Math.round(parsed * 10) / 10);
  }

  function slug(value, fallback) {
    const normalized = text(value, fallback || 'item')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    return normalized || fallback || 'item';
  }

  function hash(value) {
    const input = String(value || '');
    let result = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      result ^= input.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function nowIso(options) {
    if (typeof options?.now === 'function') return options.now().toISOString();
    return new Date().toISOString();
  }

  function stableItemId(phaseId, sourceId, index) {
    const phase = slug(phaseId, 'phase');
    const source = slug(sourceId, `item-${index + 1}`);
    return `check-${phase}-${source}`;
  }

  function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.reduce((items, entry) => {
      const normalized = text(entry);
      if (!normalized || seen.has(normalized)) return items;
      seen.add(normalized);
      items.push(normalized);
      return items;
    }, []);
  }

  function createEmpty(options) {
    const settings = options || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: VERSION,
      state: 'empty',
      checklistId: text(settings.checklistId),
      planFingerprint: text(settings.planFingerprint),
      plannerVersion: text(settings.plannerVersion),
      generatedAt: text(settings.generatedAt, nowIso(settings)),
      restoredAt: '',
      currentPhaseId: '',
      customer: { name: text(settings.customerName, 'Not provided') },
      phases: [],
      items: [],
      persistence: {
        enabled: false,
        restored: false,
        recoveredFrom: '',
        storageKey: '',
        lastSavedAt: '',
        reason: text(settings.persistenceReason)
      },
      diagnostics: {
        isReady: false,
        warnings: normalizeStringArray(settings.warnings)
      }
    };
  }

  function createItem(input, context) {
    const source = input || {};
    const settings = context || {};
    const index = finiteNumber(settings.index, 0);
    const phaseId = text(source.phaseId || source.phase, 'general');
    const sourceId = text(source.sourceItemId || source.id, `item-${index + 1}`);
    const title = text(source.title, 'Consultation item');
    const status = VALID_STATUSES.includes(source.status) ? source.status : STATUS.PENDING;
    const now = text(settings.generatedAt, nowIso(settings));

    return {
      id: text(source.checklistItemId, stableItemId(phaseId, sourceId, index)),
      sourceItemId: sourceId,
      phaseId,
      phaseTitle: text(source.phaseTitle, 'Consultation phase'),
      order: finiteNumber(source.order, index + 1),
      title,
      description: text(source.description || source.objective),
      prompt: text(source.prompt),
      coachingNote: text(source.coachingNote),
      status,
      estimatedMinutes: positiveMinutes(source.estimatedMinutes),
      required: source.required !== false,
      recommendationIds: normalizeStringArray(source.recommendationIds || source.sourceIds),
      priority: text(source.priority),
      confidence: finiteNumber(source.confidence),
      evidenceQuality: text(source.evidenceQuality || source?.metadata?.evidenceQuality, 'confirmed'),
      evidenceLabel: text(source.evidenceLabel || source?.metadata?.evidenceLabel),
      evidenceBasis: text(source.evidenceBasis || source?.metadata?.evidenceBasis),
      evidencePrompt: text(source.evidencePrompt || source?.metadata?.evidencePrompt),
      answerLabel: text(source.answerLabel || source?.metadata?.answerLabel),
      evidence: normalizeStringArray(source.evidence),
      createdAt: text(source.createdAt, now),
      updatedAt: text(source.updatedAt),
      metadata: Object.assign({ type: text(source.type, 'conversation-step') }, clone(source.metadata) || {})
    };
  }

  function validateItem(item) {
    const errors = [];
    if (!item || typeof item !== 'object') return { valid: false, errors: ['Item must be an object.'] };
    if (!text(item.id)) errors.push('Item id is required.');
    if (!text(item.title)) errors.push('Item title is required.');
    if (!text(item.phaseId)) errors.push('Item phaseId is required.');
    if (!VALID_STATUSES.includes(item.status)) errors.push('Item status is invalid.');
    if (finiteNumber(item.estimatedMinutes) == null || Number(item.estimatedMinutes) < 0) errors.push('Item estimatedMinutes must be zero or greater.');
    if (!Array.isArray(item.recommendationIds)) errors.push('Item recommendationIds must be an array.');
    return { valid: errors.length === 0, errors };
  }

  function validateChecklist(checklist) {
    const errors = [];
    if (!checklist || typeof checklist !== 'object') return { valid: false, errors: ['Checklist must be an object.'] };
    if (checklist.schemaVersion !== SCHEMA_VERSION) errors.push('Checklist schema version is invalid.');
    if (!Array.isArray(checklist.items)) errors.push('Checklist items must be an array.');
    if (!Array.isArray(checklist.phases)) errors.push('Checklist phases must be an array.');
    const itemIds = new Set();
    (checklist.items || []).forEach((item, index) => {
      const result = validateItem(item);
      result.errors.forEach(error => errors.push(`Item ${index + 1}: ${error}`));
      if (itemIds.has(item.id)) errors.push(`Duplicate item id: ${item.id}`);
      itemIds.add(item.id);
    });
    return { valid: errors.length === 0, errors };
  }

  function normalizePlanItems(plan) {
    if (Array.isArray(plan?.items) && plan.items.length) return plan.items;
    if (!Array.isArray(plan?.sections)) return [];
    return plan.sections.reduce((items, section) => {
      const sectionItems = Array.isArray(section?.items) ? section.items : [];
      return items.concat(sectionItems.map(item => Object.assign({}, item, {
        phase: text(item?.phase, section?.id),
        phaseTitle: text(item?.phaseTitle, section?.title)
      })));
    }, []);
  }

  function normalizeSections(plan, sourceItems) {
    const suppliedSections = Array.isArray(plan?.sections) ? plan.sections : [];
    const phaseMap = new Map();
    suppliedSections.forEach((section, index) => {
      const id = text(section?.id, `phase-${index + 1}`);
      phaseMap.set(id, {
        id,
        title: text(section?.title, `Phase ${index + 1}`),
        order: index + 1,
        estimatedMinutes: positiveMinutes(section?.estimatedMinutes),
        sourceItemIds: []
      });
    });
    sourceItems.forEach((item, index) => {
      const id = text(item?.phase, 'general');
      if (!phaseMap.has(id)) {
        phaseMap.set(id, {
          id,
          title: text(item?.phaseTitle, id === 'general' ? 'Consultation' : id.replace(/[-_]+/g, ' ')),
          order: phaseMap.size + 1,
          estimatedMinutes: 0,
          sourceItemIds: []
        });
      }
      const phase = phaseMap.get(id);
      phase.sourceItemIds.push(text(item?.id, `item-${index + 1}`));
      if (!phase.estimatedMinutes) phase.estimatedMinutes += positiveMinutes(item?.estimatedMinutes);
    });
    return Array.from(phaseMap.values()).sort((a, b) => a.order - b.order);
  }

  function planFingerprint(plan, phases, items) {
    const payload = {
      schemaVersion: text(plan?.schemaVersion),
      plannerVersion: text(plan?.plannerVersion),
      customer: text(plan?.customer?.name),
      phases: phases.map(phase => [phase.id, phase.title]),
      items: items.map(item => [item.id, item.phaseId, item.title, item.estimatedMinutes, item.recommendationIds, item.evidenceQuality, item.evidenceLabel])
    };
    return `plan-${hash(JSON.stringify(payload))}`;
  }

  function consultationIdentity(plan) {
    const id = text(plan?.consultationId || plan?.consultation?.id);
    return /^consultation-[a-z0-9-]{6,80}$/i.test(id) ? `record-${hash(id)}` : '';
  }

  function checklistIdentifier(plan, fingerprint) {
    const identity = consultationIdentity(plan);
    if (identity) return `consultation-${identity}-${fingerprint.replace(/^plan-/, '')}`;
    const customer = slug(plan?.customer?.name, 'customer');
    return `consultation-${customer}-${fingerprint.replace(/^plan-/, '')}`;
  }

  function generateFromPlan(plan, options) {
    const settings = options || {};
    const generatedAt = text(settings.generatedAt, nowIso(settings));
    const warnings = [];
    if (!plan || typeof plan !== 'object') return createEmpty({ generatedAt, warnings: ['A conversation plan is required to generate a checklist.'] });
    if (text(plan.state, 'empty') !== 'ready') {
      return createEmpty({
        generatedAt,
        plannerVersion: text(plan.plannerVersion),
        customerName: text(plan?.customer?.name, 'Not provided'),
        warnings: ['A ready conversation plan is required to generate a checklist.']
      });
    }

    const sourceItems = normalizePlanItems(plan);
    if (!sourceItems.length) warnings.push('The conversation plan did not contain agenda items.');
    const phases = normalizeSections(plan, sourceItems);
    const phaseTitles = new Map(phases.map(phase => [phase.id, phase.title]));
    const usedIds = new Set();
    const items = [];

    sourceItems.forEach((source, index) => {
      const phaseId = text(source?.phase, 'general');
      const normalized = createItem(Object.assign({}, source, {
        phaseId,
        phaseTitle: text(source?.phaseTitle, phaseTitles.get(phaseId)),
        sourceItemId: text(source?.id, `item-${index + 1}`),
        order: index + 1,
        recommendationIds: source?.sourceIds
      }), { index, generatedAt });
      if (usedIds.has(normalized.id)) {
        const uniqueId = `${normalized.id}-${index + 1}`;
        warnings.push(`Duplicate planner item id "${normalized.sourceItemId}" was normalized as "${uniqueId}".`);
        normalized.id = uniqueId;
      }
      usedIds.add(normalized.id);
      items.push(normalized);
    });

    const phaseItemIds = new Map(phases.map(phase => [phase.id, []]));
    items.forEach(item => {
      if (!phaseItemIds.has(item.phaseId)) phaseItemIds.set(item.phaseId, []);
      phaseItemIds.get(item.phaseId).push(item.id);
    });
    const normalizedPhases = phases.map(phase => Object.assign({}, phase, {
      itemIds: phaseItemIds.get(phase.id) || [],
      itemCount: (phaseItemIds.get(phase.id) || []).length,
      estimatedMinutes: items.filter(item => item.phaseId === phase.id).reduce((total, item) => total + item.estimatedMinutes, 0)
    }));

    const fingerprint = planFingerprint(plan, normalizedPhases, items);
    const checklist = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: VERSION,
      state: items.length ? 'ready' : 'empty',
      checklistId: checklistIdentifier(plan, fingerprint),
      planFingerprint: fingerprint,
      plannerVersion: text(plan.plannerVersion),
      generatedAt,
      restoredAt: '',
      currentPhaseId: items[0]?.phaseId || '',
      customer: { name: text(plan?.customer?.name, 'Not provided') },
      phases: normalizedPhases,
      items,
      persistence: {
        enabled: false,
        restored: false,
        recoveredFrom: '',
        storageKey: '',
        lastSavedAt: '',
        reason: ''
      },
      diagnostics: { isReady: items.length > 0, warnings }
    };
    const validation = validateChecklist(checklist);
    if (!validation.valid) {
      checklist.state = 'invalid';
      checklist.diagnostics.isReady = false;
      checklist.diagnostics.warnings = checklist.diagnostics.warnings.concat(validation.errors);
    }
    return checklist;
  }


  function emit(eventName, reason) {
    if (!eventName || !root || typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return false;
    const detail = deepFreeze({
      state: getWorkspaceState(),
      reason: text(reason),
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    root.dispatchEvent(new root.CustomEvent(eventName, { detail }));
    return true;
  }

  function emitReady(reason) {
    if (currentChecklist?.state !== 'ready') return false;
    return emit(EVENTS.READY, reason || 'checklist-ready');
  }

  function resolveStorage(options) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'storage')) return options.storage;
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function storageKey(checklistOrId) {
    const id = typeof checklistOrId === 'string' ? checklistOrId : checklistOrId?.checklistId;
    return id ? `${STORAGE_PREFIX}.${id}` : '';
  }

  function readStoredRecord(key, options) {
    const storage = resolveStorage(options);
    if (!storage || !key) return { record: null, reason: 'Storage is unavailable.' };
    let raw;
    try { raw = storage.getItem(key); } catch (_) { return { record: null, reason: 'Storage could not be read.' }; }
    if (!raw) return { record: null, reason: 'No saved checklist state was found.' };
    try { return { record: JSON.parse(raw), reason: '' }; }
    catch (_) {
      try { storage.removeItem(key); } catch (_) {}
      return { record: null, reason: 'Saved checklist state was invalid and was removed.' };
    }
  }

  function isRecordExpired(record, options) {
    const maxAgeDays = finiteNumber(options?.maxAgeDays, DEFAULT_MAX_AGE_DAYS);
    if (maxAgeDays <= 0) return false;
    const stamp = new Date(record?.lastUpdatedAt || record?.createdAt || 0).getTime();
    if (!Number.isFinite(stamp) || stamp <= 0) return true;
    const reference = typeof options?.now === 'function' ? options.now().getTime() : Date.now();
    return reference - stamp > maxAgeDays * 86400000;
  }

  function validateStoredRecord(record, checklist, options) {
    if (!record || typeof record !== 'object') return { valid: false, reason: 'Saved checklist state was not an object.' };
    if (record.storageSchemaVersion !== STORAGE_SCHEMA_VERSION) return { valid: false, reason: 'Saved checklist storage schema is incompatible.' };
    if (record.checklistId !== checklist.checklistId) return { valid: false, reason: 'Saved checklist belongs to another consultation.' };
    if (record.planFingerprint !== checklist.planFingerprint) return { valid: false, reason: 'The conversation plan changed, so saved checklist state was not restored.' };
    if (!Array.isArray(record.items)) return { valid: false, reason: 'Saved checklist items were missing.' };
    if (isRecordExpired(record, options)) return { valid: false, reason: 'Saved checklist state expired.' };
    return { valid: true, reason: '' };
  }

  function recordTimestamp(record) {
    const value = new Date(record?.lastUpdatedAt || record?.createdAt || 0).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  function serialize(checklist, options) {
    const stamp = nowIso(options || {});
    return {
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      checklistSchemaVersion: checklist.schemaVersion,
      engineVersion: VERSION,
      checklistId: checklist.checklistId,
      planFingerprint: checklist.planFingerprint,
      plannerVersion: checklist.plannerVersion,
      createdAt: text(checklist.persistence?.createdAt, checklist.generatedAt || stamp),
      lastUpdatedAt: stamp,
      currentPhaseId: text(checklist.currentPhaseId),
      items: checklist.items.map(item => ({ id: item.id, status: item.status, updatedAt: text(item.updatedAt) }))
    };
  }

  function exportProgress(checklist, options) {
    const candidate = checklist || currentChecklist;
    if (!candidate || candidate.state !== 'ready') return null;
    return clone(serialize(candidate, options));
  }

  function writeRecord(record, key, options) {
    const storage = resolveStorage(options);
    if (!storage || !key || !record) return false;
    try { storage.setItem(key, JSON.stringify(record)); return true; } catch (_) { return false; }
  }

  function save(checklist, options) {
    const candidate = checklist || currentChecklist;
    if (!candidate || candidate.state !== 'ready') return getSnapshot(candidate);
    const storage = resolveStorage(options);
    const key = storageKey(candidate);
    const next = clone(candidate);
    if (!storage || !key) {
      next.persistence = Object.assign({}, next.persistence, { enabled: false, restored: false, storageKey: key, reason: 'Storage is unavailable.' });
      currentChecklist = next;
      return getSnapshot(next);
    }
    const record = serialize(next, options);
    try {
      storage.setItem(key, JSON.stringify(record));
      next.persistence = {
        enabled: true,
        restored: Boolean(next.persistence?.restored),
        recoveredFrom: text(next.persistence?.recoveredFrom),
        storageKey: key,
        createdAt: record.createdAt,
        lastSavedAt: record.lastUpdatedAt,
        reason: ''
      };
    } catch (_) {
      next.persistence = Object.assign({}, next.persistence, { enabled: false, storageKey: key, reason: 'Checklist state could not be saved.' });
    }
    currentChecklist = next;
    return getSnapshot(next);
  }

  function applyStoredState(checklist, record, options, source) {
    const statuses = new Map(record.items.map(item => [text(item?.id), item]));
    const stamp = nowIso(options || {});
    const restored = clone(checklist);
    restored.items = restored.items.map(item => {
      const saved = statuses.get(item.id);
      if (!saved || !VALID_STATUSES.includes(saved.status)) return item;
      return Object.assign({}, item, { status: saved.status, updatedAt: text(saved.updatedAt, stamp) });
    });
    const validPhase = restored.phases.some(phase => phase.id === record.currentPhaseId);
    restored.currentPhaseId = validPhase ? record.currentPhaseId : (restored.items.find(item => item.status === STATUS.ACTIVE)?.phaseId || restored.items[0]?.phaseId || '');
    restored.restoredAt = stamp;
    restored.persistence = {
      enabled: true,
      restored: true,
      recoveredFrom: source === 'consultation-record' ? 'consultation-record' : 'device',
      storageKey: storageKey(restored),
      createdAt: text(record.createdAt, restored.generatedAt),
      lastSavedAt: text(record.lastUpdatedAt),
      reason: ''
    };
    return restored;
  }

  function restoreFromPlan(plan, options) {
    const generated = generateFromPlan(plan, options);
    if (generated.state !== 'ready') {
      currentChecklist = generated;
      emitReady('plan-restored');
      return getSnapshot(generated);
    }
    const key = storageKey(generated);
    const storage = resolveStorage(options);
    const localResult = readStoredRecord(key, options);
    const recoveryRecord = clone(options?.recoveryRecord);
    const localValidation = validateStoredRecord(localResult.record, generated, options);
    const recoveryValidation = validateStoredRecord(recoveryRecord, generated, options);
    if (localResult.record && !localValidation.valid && storage) {
      try { storage.removeItem(key); } catch (_) {}
    }
    const candidates = [];
    if (localValidation.valid) candidates.push({ record: localResult.record, source: 'device' });
    if (recoveryValidation.valid) candidates.push({ record: recoveryRecord, source: 'consultation-record' });
    candidates.sort((left, right) => recordTimestamp(right.record) - recordTimestamp(left.record));
    if (!candidates.length) {
      const reason = localResult.record && !localValidation.valid
        ? localValidation.reason
        : recoveryRecord && !recoveryValidation.valid
          ? recoveryValidation.reason
          : localResult.reason || (!storage ? 'Storage is unavailable.' : 'No saved checklist state was found.');
      generated.persistence = { enabled: Boolean(storage), restored: false, recoveredFrom: '', storageKey: key, lastSavedAt: '', reason };
      if ((localResult.record && !localValidation.valid) || (recoveryRecord && !recoveryValidation.valid)) {
        generated.diagnostics.warnings = normalizeStringArray(generated.diagnostics.warnings.concat(reason));
      }
      currentChecklist = generated;
      emitReady('plan-restored');
      return getSnapshot(generated);
    }
    const selected = candidates[0];
    const restored = applyStoredState(generated, selected.record, options, selected.source);
    restored.persistence.enabled = Boolean(storage);
    if (selected.source === 'consultation-record' && storage) writeRecord(selected.record, key, options);
    currentChecklist = restored;
    emitReady(selected.source === 'consultation-record' ? 'consultation-recovered' : 'plan-restored');
    return getSnapshot(restored);
  }

  function setStatus(itemId, status, options) {
    if (!currentChecklist || currentChecklist.state !== 'ready') return getSnapshot(currentChecklist);
    if (!VALID_STATUSES.includes(status)) throw new TypeError(`Unsupported checklist status: ${status}`);
    const id = text(itemId);
    if (!id) throw new TypeError('Checklist item id is required.');
    const exists = currentChecklist.items.some(item => item.id === id);
    if (!exists) return getSnapshot(currentChecklist);
    const stamp = nowIso(options || {});
    const next = clone(currentChecklist);
    next.items = next.items.map(item => {
      if (item.id === id) return Object.assign({}, item, { status, updatedAt: stamp });
      if (status === STATUS.ACTIVE && item.status === STATUS.ACTIVE) return Object.assign({}, item, { status: STATUS.PENDING, updatedAt: stamp });
      return item;
    });
    const changed = next.items.find(item => item.id === id);
    if (changed) next.currentPhaseId = changed.phaseId;
    currentChecklist = next;
    const snapshot = save(next, options);
    emit(EVENTS.CHANGE, 'status-change');
    return snapshot;
  }

  function activate(itemId, options) { return setStatus(itemId, STATUS.ACTIVE, options); }
  function complete(itemId, options) { return setStatus(itemId, STATUS.COMPLETE, options); }
  function reopen(itemId, options) { return setStatus(itemId, STATUS.PENDING, options); }

  function clear(checklistOrOptions, maybeOptions) {
    const checklist = checklistOrOptions && checklistOrOptions.checklistId ? checklistOrOptions : currentChecklist;
    const options = checklistOrOptions && checklistOrOptions.checklistId ? maybeOptions : checklistOrOptions;
    const storage = resolveStorage(options);
    const key = storageKey(checklist);
    if (storage && key) {
      try { storage.removeItem(key); } catch (_) {}
    }
    if (checklist) {
      const next = clone(checklist);
      next.items = next.items.map(item => Object.assign({}, item, { status: STATUS.PENDING, updatedAt: '' }));
      next.currentPhaseId = next.items[0]?.phaseId || '';
      next.restoredAt = '';
      next.persistence = { enabled: Boolean(storage), restored: false, storageKey: key, lastSavedAt: '', reason: 'Saved checklist state was cleared.' };
      currentChecklist = next;
    }
    const snapshot = getSnapshot(currentChecklist);
    emit(EVENTS.RESET, 'clear');
    return snapshot;
  }

  function reset(options) {
    if (!currentChecklist || currentChecklist.state !== 'ready') {
      const snapshot = getSnapshot(currentChecklist);
      emit(EVENTS.RESET, 'reset');
      return snapshot;
    }
    const next = clone(currentChecklist);
    next.items = next.items.map(item => Object.assign({}, item, { status: STATUS.PENDING, updatedAt: '' }));
    next.currentPhaseId = next.items[0]?.phaseId || '';
    currentChecklist = next;
    const snapshot = save(next, options);
    emit(EVENTS.RESET, 'reset');
    return snapshot;
  }

  function resetItem(itemId, options) {
    if (!currentChecklist || currentChecklist.state !== 'ready') return getSnapshot(currentChecklist);
    const id = text(itemId);
    if (!id) throw new TypeError('Checklist item id is required.');
    const next = clone(currentChecklist);
    let changed = false;
    next.items = next.items.map(item => {
      if (item.id !== id) return item;
      changed = true;
      return Object.assign({}, item, { status: STATUS.PENDING, updatedAt: nowIso(options || {}) });
    });
    if (!changed) return getSnapshot(currentChecklist);
    currentChecklist = next;
    const snapshot = save(next, options);
    emit(EVENTS.RESET, 'reset-item');
    return snapshot;
  }

  function resetPhase(phaseId, options) {
    if (!currentChecklist || currentChecklist.state !== 'ready') return getSnapshot(currentChecklist);
    const id = text(phaseId);
    if (!id) throw new TypeError('Checklist phase id is required.');
    const next = clone(currentChecklist);
    let changed = false;
    next.items = next.items.map(item => {
      if (item.phaseId !== id) return item;
      changed = true;
      return Object.assign({}, item, { status: STATUS.PENDING, updatedAt: nowIso(options || {}) });
    });
    if (!changed) return getSnapshot(currentChecklist);
    next.currentPhaseId = id;
    currentChecklist = next;
    const snapshot = save(next, options);
    emit(EVENTS.RESET, 'reset-phase');
    return snapshot;
  }

  function getSnapshot(checklist) {
    return clone(arguments.length ? checklist : currentChecklist);
  }

  function checklistFingerprint(checklist) {
    const target = checklist || currentChecklist || createEmpty();
    const payload = {
      schemaVersion: text(target.schemaVersion),
      checklistId: text(target.checklistId),
      planFingerprint: text(target.planFingerprint),
      currentPhaseId: text(target.currentPhaseId),
      phases: (target.phases || []).map(phase => [
        text(phase?.id),
        text(phase?.title),
        finiteNumber(phase?.order, 0),
        normalizeStringArray(phase?.itemIds)
      ]),
      items: (target.items || []).map(item => [
        text(item?.id),
        text(item?.sourceItemId),
        text(item?.phaseId),
        text(item?.title),
        text(item?.status),
        positiveMinutes(item?.estimatedMinutes),
        normalizeStringArray(item?.recommendationIds)
      ])
    };
    return `checklist-${hash(JSON.stringify(payload))}`;
  }

  function storageHealth(checklist) {
    const persistence = checklist?.persistence || {};
    const enabled = Boolean(persistence.enabled);
    const reason = text(persistence.reason);
    let status = 'healthy';
    if (!enabled) status = 'unavailable';
    else if (reason) status = persistence.restored ? 'warning' : 'available';
    return {
      status,
      enabled,
      restored: Boolean(persistence.restored),
      storageKey: text(persistence.storageKey),
      lastSavedAt: text(persistence.lastSavedAt),
      reason
    };
  }

  function integrityStatus(checklist, validation) {
    const target = checklist || currentChecklist;
    if (!target || text(target.state, 'empty') === 'empty') return 'empty';
    if (!validation.valid || text(target.state) === 'invalid') return 'invalid';
    if (!text(target.planFingerprint) || !text(target.checklistId)) return 'warning';
    return normalizeStringArray(target?.diagnostics?.warnings).length ? 'warning' : 'healthy';
  }

  function diagnostics(checklist) {
    const target = checklist || currentChecklist;
    const validation = validateChecklist(target);
    return {
      state: text(target?.state, 'empty'),
      phaseCount: Array.isArray(target?.phases) ? target.phases.length : 0,
      itemCount: Array.isArray(target?.items) ? target.items.length : 0,
      valid: validation.valid,
      errors: validation.errors,
      warnings: normalizeStringArray(target?.diagnostics?.warnings),
      persistence: clone(target?.persistence) || null,
      engineVersion: VERSION,
      plannerFingerprint: text(target?.planFingerprint),
      checklistFingerprint: checklistFingerprint(target),
      storageHealth: storageHealth(target),
      generationTimestamp: text(target?.generatedAt),
      integrityStatus: integrityStatus(target, validation)
    };
  }

  

  function getSummary(checklist){
    checklist = checklist || currentChecklist || createEmpty();
    const items = checklist.items || [];
    const total = items.length;
    const completed = items.filter(i=>i.status===STATUS.COMPLETE).length;
    const active = items.filter(i=>i.status===STATUS.ACTIVE).length;
    const pending = total-completed-active;
    return Object.freeze({total,completed,active,pending,completionPercent: total?Math.round((completed/total)*100):0});
  }

  function getRemainingMinutes(checklist){
    checklist = checklist || currentChecklist || createEmpty();
    return (checklist.items||[]).filter(i=>i.status!==STATUS.COMPLETE).reduce((a,i)=>a+(i.estimatedMinutes||0),0);
  }

  function getProgress(checklist){
    checklist = checklist || currentChecklist || createEmpty();
    const s=getSummary(checklist);
    const phases={};
    (checklist.items||[]).forEach(i=>{
      const p=i.phaseId||'default';
      phases[p]=phases[p]||{total:0,completed:0};
      phases[p].total++;
      if(i.status===STATUS.COMPLETE) phases[p].completed++;
    });
    const completedPhases=Object.values(phases).filter(p=>p.completed===p.total&&p.total>0).length;
    return Object.freeze({...s,remainingMinutes:getRemainingMinutes(checklist),completedPhases,totalPhases:Object.keys(phases).length});
  }


  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function getWorkspaceState(checklist){
    checklist = checklist || currentChecklist || createEmpty();
    const state = {
      checklist: getSnapshot(checklist),
      summary: getSummary(checklist),
      diagnostics: diagnostics(checklist),
      progress: getProgress(checklist),
      currentPhase: text(checklist.currentPhaseId),
      remainingMinutes: getRemainingMinutes(checklist),
      plannerVersion: text(checklist.plannerVersion),
      version: VERSION
    };
    return deepFreeze(state);
  }


  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    STORAGE_SCHEMA_VERSION,
    STORAGE_PREFIX,
    STATUS,
    EVENTS,
    createEmpty,
    createItem,
    generateFromPlan,
    restoreFromPlan,
    exportProgress,
    save,
    setStatus,
    activate,
    complete,
    reopen,
    reset,
    resetItem,
    resetPhase,
    clear,
    getSnapshot,
    getStorageKey: storageKey,
    validateItem,
    validateChecklist,
    diagnostics,
    getSummary,
    getProgress,
    getRemainingMinutes,
    getWorkspaceState
  });
});
