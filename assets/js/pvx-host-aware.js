(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXHostAware = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const BUILD = '408-CF-PVX-WEB-1.7';
  const BRIDGE_KEY = 'coveragefit_pvx_web_bridge_v1';
  const clean = (value, max = 120) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);
  function readBridge() {
    for (const storage of [root.sessionStorage, root.localStorage]) {
      try { const value = JSON.parse(storage?.getItem?.(BRIDGE_KEY) || 'null'); if (value && typeof value === 'object') return value; } catch (_) {}
    }
    return null;
  }
  function resolveMode({ hostname = root.location?.hostname, bridge = readBridge() } = {}) {
    const host = clean(hostname, 160).toLowerCase();
    const hostAware = host === 'review.408farmers.com' || host.endsWith('.408farmers.com');
    const sourceAware = clean(bridge?.entry?.source || bridge?.attribution?.source, 80).toLowerCase().includes('408farmers');
    return hostAware || sourceAware ? '408farmers' : 'coveragefit';
  }
  function install() {
    const doc = root.document;
    if (!doc?.body) return null;
    const bridge = readBridge();
    const mode = resolveMode({ bridge });
    doc.body.dataset.pvxHostMode = mode;
    if (mode !== '408farmers') return { mode, bridge };
    const header = doc.querySelector('.pvx-header__inner');
    if (header && !header.querySelector('.pvx-host-trust')) {
      const trust = doc.createElement('span');
      trust.className = 'pvx-host-trust';
      trust.textContent = 'Personally reviewed by Dylan at 408FARMERS';
      header.appendChild(trust);
    }
    const title = doc.querySelector('.pvx-snapshot-hero h1');
    if (title && !doc.getElementById('pvxHostSnapshotLine')) {
      const line = doc.createElement('p');
      line.id = 'pvxHostSnapshotLine';
      line.className = 'pvx-host-trust';
      line.textContent = 'Your CoverageFit Snapshot — personally reviewed by Dylan at 408FARMERS.';
      title.insertAdjacentElement('afterend', line);
    }
    try { root.dispatchEvent(new CustomEvent('coveragefit:host-mode', { detail: { build: BUILD, mode, entryType: clean(bridge?.entry?.type, 40) } })); } catch (_) {}
    if (doc.body.hasAttribute('data-pvx-snapshot') && root.CoverageFitPVXConsumerEvents) {
      const campaignKey = clean(bridge?.attribution?.campaignId || bridge?.attribution?.campaignVariant, 80);
      root.CoverageFitPVXConsumerEvents.emit('snapshot_viewed', { entryType: clean(bridge?.entry?.type, 40), campaignKey, stage: 'snapshot', hostMode: mode, result: 'viewed' });
    }
    return { mode, bridge };
  }
  if (root.document) root.addEventListener('DOMContentLoaded', install, { once: true });
  return Object.freeze({ VERSION, BUILD, BRIDGE_KEY, readBridge, resolveMode, install });
});
