(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis);
  } else {
    root.CoverageFitPrintVisibilityEngine = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';

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

  function createVisibilityError(code, message, details) {
    const error = new Error(message);
    error.name = 'CoverageFitPrintVisibilityError';
    error.code = code;
    error.details = deepFreeze(clone(details) || {});
    return error;
  }

  function hasMeaningfulValue(value) {
    if (value == null) return false;
    if (typeof value === 'string') return Boolean(value.trim());
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.some(hasMeaningfulValue);
    if (typeof value === 'object') {
      if (value.available === false) return false;
      if (value.available === true) return true;
      return Object.keys(value).some(key => key !== 'available' && hasMeaningfulValue(value[key]));
    }
    return false;
  }

  function getPath(source, path) {
    if (!path) return source;
    return String(path).split('.').reduce((current, key) => {
      if (current == null || typeof current !== 'object') return undefined;
      return current[key];
    }, source);
  }

  function normalizeEmptyState(section, model, reason) {
    let value = section.emptyState;
    if (typeof value === 'function') value = value(model, reason);
    if (value == null) {
      value = {
        title: section.name || section.id || 'Section unavailable',
        message: 'No consultation data is available for this section.'
      };
    } else if (typeof value === 'string') {
      value = { title: section.name || section.id || 'Section unavailable', message: value };
    }
    return deepFreeze({
      title: String(value.title || section.name || section.id || 'Section unavailable'),
      message: String(value.message || 'No consultation data is available for this section.'),
      code: String(value.code || 'PRINT_SECTION_DATA_UNAVAILABLE')
    });
  }

  function evaluateSection(section, model, options) {
    const settings = options || {};
    if (!section || typeof section !== 'object') {
      throw createVisibilityError('PRINT_SECTION_INVALID', 'A section definition is required.', {});
    }
    if (!model || typeof model !== 'object' || Array.isArray(model)) {
      throw createVisibilityError('PRINT_MODEL_INVALID', 'A print model object is required.', {});
    }

    const requiredPaths = Array.isArray(section.requiredPaths) ? section.requiredPaths : [];
    const missingPaths = requiredPaths.filter(path => !hasMeaningfulValue(getPath(model, path)));
    let visible = missingPaths.length === 0;
    let reason = visible ? 'visible' : 'missing-required-data';
    let evaluationError = null;

    if (visible && typeof section.shouldRender === 'function') {
      try {
        visible = section.shouldRender(model, settings) !== false;
        if (!visible) reason = 'section-rule-hidden';
      } catch (error) {
        visible = false;
        reason = 'visibility-rule-error';
        evaluationError = {
          name: error.name || 'Error',
          message: error.message || String(error)
        };
      }
    }

    return deepFreeze({
      id: section.id || null,
      visible,
      reason,
      missingPaths,
      emptyState: visible ? null : normalizeEmptyState(section, model, reason),
      error: evaluationError
    });
  }

  function evaluateSections(sections, model, options) {
    const list = Array.isArray(sections) ? sections : [];
    const decisions = list.map(section => evaluateSection(section.definition || section, model, options));
    const visibleCount = decisions.filter(item => item.visible).length;
    return deepFreeze({
      valid: decisions.every(item => item.reason !== 'visibility-rule-error'),
      version: VERSION,
      totalCount: decisions.length,
      visibleCount,
      hiddenCount: decisions.length - visibleCount,
      decisions,
      warnings: decisions
        .filter(item => item.reason === 'visibility-rule-error')
        .map(item => `Visibility rule failed for ${item.id}.`)
    });
  }

  return Object.freeze({
    VERSION,
    hasMeaningfulValue,
    getPath,
    evaluateSection,
    evaluateSections
  });
});
