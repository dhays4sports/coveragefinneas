(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis);
  } else {
    root.CoverageFitPrintAdapterRegistry = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '0.1.0';
  const ADAPTER_CONTRACT_VERSION = 1;
  const DEFAULT_TYPE = 'home';
  const adapters = new Map();

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function normalizeType(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function validateAdapter(adapter) {
    if (!adapter || typeof adapter !== 'object') throw new TypeError('Print adapter must be an object.');
    if (!normalizeType(adapter.id)) throw new TypeError('Print adapter id is required.');
    if (typeof adapter.createSnapshot !== 'function') throw new TypeError('Print adapter createSnapshot(context) is required.');
    return true;
  }

  function registerAdapter(type, adapter, options) {
    const id = normalizeType(type || adapter?.id);
    validateAdapter(adapter);
    if (!id) throw new TypeError('Print adapter type is required.');
    const replace = Boolean(options?.replace);
    if (adapters.has(id) && !replace) throw new Error(`Print adapter already registered: ${id}.`);
    adapters.set(id, adapter);
    return adapter;
  }

  function getAdapter(type) {
    return adapters.get(normalizeType(type)) || null;
  }

  function hasAdapter(type) {
    return adapters.has(normalizeType(type));
  }

  function listAdapters() {
    return deepFreeze(Array.from(adapters.entries()).map(([type, adapter]) => ({
      type,
      id: String(adapter.id || type),
      version: String(adapter.version || ''),
      contractVersion: adapter.contractVersion ?? ADAPTER_CONTRACT_VERSION
    })));
  }

  function resolveType(input) {
    const explicit = normalizeType(input?.adapterType || input?.type || input?.product);
    if (explicit && adapters.has(explicit)) return explicit;
    return DEFAULT_TYPE;
  }

  function createSnapshot(type, context) {
    const resolvedType = resolveType({ adapterType: type });
    const adapter = getAdapter(resolvedType);
    if (!adapter) throw new Error(`Unknown print adapter: ${resolvedType}.`);
    const snapshot = adapter.createSnapshot(context || {});
    if (!snapshot || typeof snapshot !== 'object') throw new TypeError(`Print adapter ${resolvedType} returned an invalid snapshot.`);
    return deepFreeze(snapshot);
  }

  const HomePrintAdapter = Object.freeze({
    id: 'home',
    version: '1.0.0',
    contractVersion: ADAPTER_CONTRACT_VERSION,
    createSnapshot(context) {
      const settings = context.settings || {};
      const dependencies = context.dependencies || {};
      const workspaceSnapshot = settings.workspaceSnapshot || dependencies.workspaceData?.getSnapshot?.() || null;
      const conversationPlan = settings.conversationPlan || dependencies.planner?.getPlan?.(workspaceSnapshot) || null;
      const checklistState = settings.checklistState || dependencies.checklist?.getWorkspaceState?.() || null;
      return {
        adapterType: 'home',
        adapterId: this.id,
        adapterVersion: this.version,
        product: workspaceSnapshot?.product || 'Home',
        workspaceSnapshot,
        conversationPlan,
        checklistState
      };
    }
  });

  registerAdapter(DEFAULT_TYPE, HomePrintAdapter);

  return Object.freeze({
    VERSION,
    ADAPTER_CONTRACT_VERSION,
    DEFAULT_TYPE,
    HomePrintAdapter,
    registerAdapter,
    getAdapter,
    hasAdapter,
    listAdapters,
    resolveType,
    createSnapshot
  });
});
