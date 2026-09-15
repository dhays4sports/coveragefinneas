(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis);
  } else {
    root.CoverageFitPrintSectionRegistry = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const sections = new Map();

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

  function createRegistryError(code, message, details) {
    const error = new Error(message);
    error.name = 'CoverageFitPrintSectionRegistryError';
    error.code = code;
    error.details = deepFreeze(clone(details) || {});
    return error;
  }

  function normalizeId(id) {
    if (typeof id !== 'string' || !id.trim()) {
      throw createRegistryError(
        'PRINT_SECTION_ID_INVALID',
        'Section id must be a non-empty string.',
        { id }
      );
    }

    const normalized = id.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(normalized)) {
      throw createRegistryError(
        'PRINT_SECTION_ID_INVALID',
        'Section id may contain letters, numbers, periods, underscores, and hyphens.',
        { id, normalized }
      );
    }
    return normalized;
  }

  function normalizeOrder(value) {
    if (value == null || value === '') return 1000;
    const order = Number(value);
    if (!Number.isFinite(order)) {
      throw createRegistryError(
        'PRINT_SECTION_ORDER_INVALID',
        'Section order must be a finite number.',
        { order: value }
      );
    }
    return order;
  }

  function normalizeMetadata(id, definition, options) {
    const supplied = options?.metadata || {};
    return deepFreeze({
      id,
      name: typeof supplied.name === 'string' && supplied.name.trim()
        ? supplied.name.trim()
        : (typeof definition.name === 'string' && definition.name.trim() ? definition.name.trim() : id),
      version: typeof supplied.version === 'string' && supplied.version.trim()
        ? supplied.version.trim()
        : (typeof definition.version === 'string' && definition.version.trim() ? definition.version.trim() : '1.0.0'),
      order: normalizeOrder(supplied.order ?? definition.order),
      production: supplied.production !== false,
      registeredAt: new Date().toISOString()
    });
  }

  function validateSection(id, definition) {
    const errors = [];
    let normalizedId = null;

    try { normalizedId = normalizeId(id); }
    catch (error) { errors.push(error.message); }

    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      errors.push('Section definition must be an object.');
    }

    if (definition && definition.id != null) {
      try {
        const definitionId = normalizeId(definition.id);
        if (normalizedId && definitionId !== normalizedId) {
          errors.push(`Section definition id ${definitionId} does not match registration id ${normalizedId}.`);
        }
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (definition && definition.order != null && !Number.isFinite(Number(definition.order))) {
      errors.push('Section order must be a finite number when provided.');
    }

    return deepFreeze({
      id: normalizedId,
      valid: errors.length === 0,
      errors
    });
  }

  function registerSection(id, definition, options) {
    const normalizedId = normalizeId(id);
    const settings = options || {};
    const validation = validateSection(normalizedId, definition);

    if (!validation.valid) {
      throw createRegistryError(
        'PRINT_SECTION_INVALID',
        `Section ${normalizedId} failed registration validation.`,
        { id: normalizedId, errors: validation.errors }
      );
    }

    if (sections.has(normalizedId) && settings.replace !== true) {
      throw createRegistryError(
        'PRINT_SECTION_DUPLICATE',
        `Section ${normalizedId} is already registered.`,
        { id: normalizedId }
      );
    }

    const metadata = normalizeMetadata(normalizedId, definition, settings);
    const entry = Object.freeze({
      id: normalizedId,
      definition,
      metadata
    });

    sections.set(normalizedId, entry);
    return metadata;
  }

  function unregisterSection(id) {
    const normalizedId = normalizeId(id);
    return sections.delete(normalizedId);
  }

  function getSection(id) {
    const entry = sections.get(normalizeId(id));
    return entry ? entry.definition : null;
  }

  function getSectionMetadata(id) {
    const entry = sections.get(normalizeId(id));
    return entry ? entry.metadata : null;
  }

  function hasSection(id) {
    try { return sections.has(normalizeId(id)); }
    catch (error) { return false; }
  }

  function getRegisteredSections(options) {
    const settings = options || {};
    const entries = Array.from(sections.values()).sort((a, b) => {
      if (a.metadata.order !== b.metadata.order) return a.metadata.order - b.metadata.order;
      return a.id.localeCompare(b.id);
    });

    if (settings.detailed === true || settings.metadata === true) {
      return deepFreeze(entries.map(entry => entry.metadata));
    }
    if (settings.entries === true) {
      return Object.freeze(entries.slice());
    }
    return deepFreeze(entries.map(entry => entry.id));
  }

  function clearRegistry() {
    const removed = sections.size;
    sections.clear();
    return removed;
  }

  function getDiagnostics() {
    const metadata = getRegisteredSections({ detailed: true });
    const duplicateOrders = [];
    const byOrder = new Map();

    metadata.forEach(item => {
      const ids = byOrder.get(item.order) || [];
      ids.push(item.id);
      byOrder.set(item.order, ids);
    });
    byOrder.forEach((ids, order) => {
      if (ids.length > 1) duplicateOrders.push(deepFreeze({ order, ids }));
    });

    return deepFreeze({
      valid: metadata.every(item => item.id && item.version && Number.isFinite(item.order)),
      version: VERSION,
      sectionCount: metadata.length,
      sections: metadata,
      duplicateOrders,
      warnings: duplicateOrders.map(item => `Sections ${item.ids.join(', ')} share order ${item.order}.`)
    });
  }

  return Object.freeze({
    VERSION,
    registerSection,
    unregisterSection,
    getSection,
    getSectionMetadata,
    hasSection,
    getRegisteredSections,
    clearRegistry,
    validateSection,
    getDiagnostics
  });
});
