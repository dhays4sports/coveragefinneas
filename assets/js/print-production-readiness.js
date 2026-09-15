(function (root, factory) {
  'use strict';
  const api = factory();
  root.CoverageFitPrintProductionReadiness = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const PROFILE_VERSION = 'PC-1.4';
  const REQUIRED_MARKERS = Object.freeze([
    Object.freeze({ id: 'document', label: 'Complete consultation document', token: 'data-print-shell="body"' }),
    Object.freeze({ id: 'header', label: 'Running document header', token: 'data-print-shell="header"' }),
    Object.freeze({ id: 'footer', label: 'Running document footer', token: 'data-print-shell="footer"' }),
    Object.freeze({ id: 'letter', label: 'US Letter page profile', token: '@page{size:letter;margin:0}' }),
    Object.freeze({ id: 'color', label: 'Print color preservation', token: 'print-color-adjust:exact' }),
    Object.freeze({ id: 'pagination', label: 'Paged-media numbering', token: 'counter(page)' }),
    Object.freeze({ id: 'final-page', label: 'No blank trailing page', token: '.cf-report-body>.cf-print-section:last-child{break-after:auto;page-break-after:auto}' }),
    Object.freeze({ id: 'readability', label: 'Paragraph split protection', token: 'orphans:3;widows:3' })
  ]);
  const SETUP_STEPS = Object.freeze([
    'Use US Letter paper in portrait orientation.',
    'Keep scale at Default or 100%.',
    'Turn on background graphics for the intended CoverageFit colors.',
    'Turn off the browser\'s own headers and footers.',
    'Review every page in the preview before printing or sharing the PDF.'
  ]);

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  function safeDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return 'undated';
    return date.toISOString().slice(0, 10);
  }

  function buildFileName(output) {
    return `CoverageFit-Consultation-${safeDate(output?.model?.generatedAt || output?.model?.metadata?.consultationDate)}.pdf`;
  }

  function certify(output, environment) {
    const source = output || {};
    const html = text(source.html);
    const diagnostics = source.diagnostics || {};
    const settings = environment || {};
    const checks = REQUIRED_MARKERS.map(requirement => deepFreeze({
      id: requirement.id,
      label: requirement.label,
      pass: html.includes(requirement.token)
    }));
    checks.unshift(deepFreeze({
      id: 'renderer',
      label: 'Print renderer diagnostics',
      pass: source.type === 'html' && diagnostics.valid === true && diagnostics.reportShellValid === true
    }));
    checks.push(deepFreeze({
      id: 'browser-print',
      label: 'Browser print service',
      pass: settings.canPrint !== false
    }));
    const blockers = checks.filter(item => !item.pass).map(item => item.label);
    const warnings = [];
    if (diagnostics.reportShellCertified !== true) warnings.push('Review missing producer or document-reference details before sharing.');
    const ready = blockers.length === 0;
    return deepFreeze({
      version: VERSION,
      profileVersion: PROFILE_VERSION,
      state: ready ? 'ready' : 'blocked',
      ready,
      label: ready ? 'Ready for Letter print/PDF' : 'Print setup needs attention',
      paper: 'US Letter',
      orientation: 'Portrait',
      scale: 'Default or 100%',
      backgroundGraphics: 'On',
      browserHeadersAndFooters: 'Off',
      fileName: buildFileName(source),
      checks,
      blockers,
      warnings,
      setupSteps: SETUP_STEPS
    });
  }

  function getProfile() {
    return deepFreeze({
      version: PROFILE_VERSION,
      paper: 'US Letter',
      orientation: 'Portrait',
      pageWidth: '8.5in',
      pageHeight: '11in',
      setupSteps: SETUP_STEPS
    });
  }

  return Object.freeze({ VERSION, PROFILE_VERSION, REQUIRED_MARKERS, SETUP_STEPS, certify, getProfile, buildFileName });
});
