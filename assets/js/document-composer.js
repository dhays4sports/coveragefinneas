(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis, require('./print-visibility.js'));
  } else {
    root.CoverageFitPrintDocumentComposer = factory(root, root.CoverageFitPrintVisibilityEngine);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root, defaultVisibilityEngine) {
  'use strict';

  const VERSION = '1.0.0';
  const DOCUMENT_SCHEMA_VERSION = 2;

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); }
    catch (error) { return null; }
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function createComposerError(code, message, details) {
    const error = new Error(message);
    error.name = 'CoverageFitPrintDocumentComposerError';
    error.code = code;
    error.details = deepFreeze(clone(details) || {});
    return error;
  }

  function resolveRegistry(options) {
    const registry = options?.sectionRegistry || root.CoverageFitPrintSectionRegistry || null;
    if (!registry || typeof registry.getRegisteredSections !== 'function') {
      throw createComposerError(
        'PRINT_SECTION_REGISTRY_UNAVAILABLE',
        'The print section registry is required to compose a document.',
        {}
      );
    }
    return registry;
  }

  function validateModel(model) {
    if (!model || typeof model !== 'object' || Array.isArray(model)) {
      throw createComposerError(
        'PRINT_MODEL_INVALID',
        'Document Composer requires an immutable print model object.',
        { receivedType: Array.isArray(model) ? 'array' : typeof model }
      );
    }
    if (!Object.isFrozen(model)) {
      throw createComposerError(
        'PRINT_MODEL_MUTABLE',
        'Document Composer only accepts an immutable print model.',
        {}
      );
    }
    return model;
  }

  function normalizeEntry(entry, registry) {
    const definition = entry.definition || registry.getSection(entry.id);
    const metadata = entry.metadata || registry.getSectionMetadata(entry.id) || {};
    return deepFreeze({
      id: entry.id || metadata.id || definition?.id,
      order: Number.isFinite(Number(metadata.order ?? definition?.order))
        ? Number(metadata.order ?? definition.order)
        : 1000,
      name: metadata.name || definition?.name || entry.id,
      version: metadata.version || definition?.version || '1.0.0',
      definition
    });
  }

  function resolveVisibilityEngine(options) {
    const engine = options?.visibilityEngine || defaultVisibilityEngine || root.CoverageFitPrintVisibilityEngine || null;
    if (!engine || typeof engine.evaluateSections !== 'function') {
      throw createComposerError(
        'PRINT_VISIBILITY_ENGINE_UNAVAILABLE',
        'The print visibility engine is required to compose a document.',
        {}
      );
    }
    return engine;
  }

  function compose(model, options) {
    const settings = options || {};
    const immutableModel = validateModel(model);
    const registry = resolveRegistry(settings);
    const visibilityEngine = resolveVisibilityEngine(settings);
    const entries = registry.getRegisteredSections({ entries: true });

    const registeredSections = entries
      .map(entry => normalizeEntry(entry, registry))
      .sort((a, b) => a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id));

    const visibility = visibilityEngine.evaluateSections(registeredSections, immutableModel, settings);
    const decisionsById = new Map(visibility.decisions.map(item => [item.id, item]));
    const sections = registeredSections
      .filter(section => decisionsById.get(section.id)?.visible)
      .map(section => deepFreeze({ ...section, visibility: decisionsById.get(section.id) }));
    const hiddenSections = registeredSections
      .filter(section => !decisionsById.get(section.id)?.visible)
      .map(section => deepFreeze({
        id: section.id,
        order: section.order,
        name: section.name,
        visibility: decisionsById.get(section.id)
      }));

    const warnings = [];
    if (!registeredSections.length) warnings.push('No print sections are registered.');
    warnings.push(...visibility.warnings);

    const diagnostics = deepFreeze({
      valid: registeredSections.every(section => section.id && section.definition) && visibility.valid,
      composerVersion: VERSION,
      registeredSectionCount: registeredSections.length,
      visibleSectionCount: sections.length,
      hiddenSectionCount: hiddenSections.length,
      sectionIds: sections.map(section => section.id),
      hiddenSectionIds: hiddenSections.map(section => section.id),
      visibility,
      warnings
    });

    return deepFreeze({
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      composerVersion: VERSION,
      state: sections.length ? 'composed' : 'empty',
      composedAt: new Date().toISOString(),
      model: immutableModel,
      sections,
      hiddenSections,
      diagnostics
    });
  }

  function getDiagnostics(options) {
    const registry = resolveRegistry(options || {});
    const registryDiagnostics = typeof registry.getDiagnostics === 'function'
      ? registry.getDiagnostics()
      : null;
    return deepFreeze({
      valid: registryDiagnostics ? registryDiagnostics.valid : true,
      version: VERSION,
      visibilityEngineVersion: (defaultVisibilityEngine || root.CoverageFitPrintVisibilityEngine || {}).VERSION || null,
      registry: registryDiagnostics
    });
  }

  return Object.freeze({
    VERSION,
    DOCUMENT_SCHEMA_VERSION,
    compose,
    getDiagnostics
  });
});
