(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../print-sections.js'));
  } else {
    root.CoverageFitPrintSections = root.CoverageFitPrintSections || {};
    root.CoverageFitPrintSections['metadata'] = factory(root.CoverageFitPrintSectionRegistry);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (registry) {
  'use strict';

  const section = Object.freeze({
    id: 'metadata',
    name: 'Metadata',
    version: '1.0.0',
    order: 60,
    requiredPaths: Object.freeze(['metadata']),
    shouldRender(model) { return Boolean(model.metadata); },
    emptyState: Object.freeze({ message: 'Consultation metadata is unavailable.' }),
    render(model) { return Object.freeze({ id: this.id, html: '', model: model || null }); }
  });

  if (registry && typeof registry.registerSection === 'function') {
    registry.registerSection(section.id, section, { replace: true });
  }

  return section;
});
