(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisoryWorkspaceData = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-workspace-data-ready', {
      detail: { version: api.VERSION, build: api.BUILD }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.1';

  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const parse = value => {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
  };

  function baseApi(options) {
    return options?.workspaceData || root.CoverageFitWorkspaceData || null;
  }

  function contractApi(options) {
    return options?.contract || root.CoverageFitAdvisoryDiscoveryContract || null;
  }

  function consultationApi(options) {
    return options?.consultationRecords || root.CoverageFitConsultationRecords || null;
  }

  function selectedReport(baseSnapshot, options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'report')) return clone(options.report);
    if (Object.prototype.hasOwnProperty.call(options, 'consultationRecord')) return clone(options.consultationRecord?.report || null);

    const consultations = consultationApi(options);
    const storage = options.storage || root.localStorage;
    const consultationId = String(baseSnapshot?.source?.consultationId || '').trim();
    if (consultationId && consultations?.get) {
      const selected = consultations.get(consultationId, { storage });
      if (selected?.report) return clone(selected.report);
    }
    if (consultations?.getActive) {
      const active = consultations.getActive({ storage });
      if (active?.report) return clone(active.report);
    }

    const reportKey = baseApi(options)?.REPORT_KEY || 'coveragefit_home_report';
    try { return parse(storage?.getItem?.(reportKey)); } catch (_) { return null; }
  }

  function normalizeDiscovery(report, baseSnapshot, options = {}) {
    const contract = contractApi(options);
    if (!contract?.normalize) return clone(report?.discoveryProfile) || null;
    return contract.normalize(report?.discoveryProfile || { product: baseSnapshot?.product || 'home' });
  }

  function getSnapshot(options = {}) {
    const base = baseApi(options);
    if (!base?.getSnapshot) return null;
    const snapshot = base.getSnapshot(options);
    const report = selectedReport(snapshot, options);
    return {
      ...clone(snapshot),
      discoveryProfile: normalizeDiscovery(report, snapshot, options)
    };
  }

  function getDiscoveryProfile(options = {}) {
    const snapshot = getSnapshot(options);
    return clone(snapshot?.discoveryProfile || null);
  }

  return Object.freeze({
    VERSION,
    BUILD,
    getSnapshot,
    getDiscoveryProfile
  });
});
