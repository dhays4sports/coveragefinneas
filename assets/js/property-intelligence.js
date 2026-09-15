(() => {
  'use strict';

  const VERSION = '1.0.0';
  const STORAGE_KEY = 'coveragefit_property_profile_v1';
  const CACHE_PREFIX = 'coveragefit_property_cache_v1:';
  const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const PROFILE_FIELDS = [
    'yearBuilt','squareFeet','stories','constructionType','roofType','roofYear',
    'foundationType','lotSizeSqFt','bedrooms','bathrooms','county','parcelId',
    'fireRisk','floodZone','pool','detachedStructures','estimatedReplacementCost'
  ];

  const nowIso = () => new Date().toISOString();
  const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
  const numberOrNull = value => {
    if (value === '' || value == null) return null;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const boolOrNull = value => value === true || value === false ? value : null;
  const normalizeState = value => clean(value || '').toUpperCase().slice(0, 2);
  const normalizeZip = value => {
    const match = String(value || '').match(/\b\d{5}(?:-\d{4})?\b/);
    return match ? match[0] : '';
  };
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function createSessionId() {
    try {
      const cryptoApi = typeof window !== 'undefined' ? window.crypto : null;
      if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    } catch (_) {}
    return `cfpi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeAddress(input = {}) {
    if (typeof input === 'string') input = { formatted: input };
    const formatted = clean(input.formatted || input.fullAddress || '');
    const address = {
      line1: clean(input.line1 || input.street || input.address1 || ''),
      line2: clean(input.line2 || input.unit || input.address2 || ''),
      city: clean(input.city || ''),
      state: normalizeState(input.state || input.region || ''),
      postalCode: normalizeZip(input.postalCode || input.zip || formatted),
      county: clean(input.county || ''),
      country: clean(input.country || 'US').toUpperCase(),
      latitude: numberOrNull(input.latitude ?? input.lat),
      longitude: numberOrNull(input.longitude ?? input.lng),
      formatted,
      providerPlaceId: clean(input.providerPlaceId || input.placeId || '')
    };
    if (!address.formatted) {
      address.formatted = [address.line1, address.line2, address.city, [address.state, address.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    }
    address.normalizedKey = slug([address.line1, address.city, address.state, address.postalCode].filter(Boolean).join('-'));
    address.isComplete = Boolean(address.line1 && address.city && address.state && address.postalCode);
    return address;
  }

  function normalizeFieldValue(field, value) {
    const numeric = new Set(['yearBuilt','squareFeet','stories','roofYear','lotSizeSqFt','bedrooms','bathrooms','estimatedReplacementCost']);
    const boolean = new Set(['pool','detachedStructures']);
    if (numeric.has(field)) return numberOrNull(value);
    if (boolean.has(field)) return boolOrNull(value);
    return clean(value ?? '') || null;
  }

  function normalizePropertyData(raw = {}, provider = {}) {
    const data = {};
    PROFILE_FIELDS.forEach(field => { data[field] = normalizeFieldValue(field, raw[field]); });
    const fieldMeta = {};
    PROFILE_FIELDS.forEach(field => {
      const hasValue = data[field] !== null && data[field] !== '';
      const supplied = raw.fieldMeta?.[field] || {};
      fieldMeta[field] = {
        source: supplied.source || (hasValue ? provider.id || 'unknown' : 'missing'),
        confidence: hasValue ? Math.max(0, Math.min(1, Number(supplied.confidence ?? provider.defaultConfidence ?? 0.65))) : 0,
        verifiedByUser: Boolean(supplied.verifiedByUser),
        updatedAt: supplied.updatedAt || nowIso()
      };
    });
    return { data, fieldMeta };
  }

  function calculateConfidence(profile) {
    const weights = {
      yearBuilt: 12, squareFeet: 14, stories: 8, constructionType: 8, roofType: 7,
      roofYear: 7, foundationType: 5, county: 5, fireRisk: 8, floodZone: 5,
      pool: 5, detachedStructures: 5, lotSizeSqFt: 4, bedrooms: 3, bathrooms: 3, parcelId: 1
    };
    let earned = 0, possible = 0, completedWeight = 0;
    Object.entries(weights).forEach(([field, weight]) => {
      possible += weight;
      const value = profile?.data?.[field];
      const present = value !== null && value !== '';
      if (!present) return;
      completedWeight += weight;
      const meta = profile.fieldMeta?.[field] || {};
      const quality = meta.verifiedByUser ? 1 : Math.max(0.25, Number(meta.confidence || 0.5));
      earned += weight * quality;
    });
    const addressBonus = profile?.address?.isComplete ? 5 : profile?.address?.postalCode ? 2 : 0;
    const confidence = Math.round(Math.min(100, ((earned + addressBonus) / (possible + 5)) * 100));
    const completeness = Math.round(Math.min(100, ((completedWeight + addressBonus) / (possible + 5)) * 100));
    return {
      confidence,
      completeness,
      label: confidence >= 85 ? 'High confidence' : confidence >= 65 ? 'Good starting point' : confidence >= 40 ? 'Needs confirmation' : 'Limited property data',
      missingFields: Object.keys(weights).filter(field => profile?.data?.[field] === null || profile?.data?.[field] === '')
    };
  }

  function createProfile({ address = {}, raw = {}, provider = {}, status = 'ready', errors = [] } = {}) {
    const normalizedAddress = normalizeAddress(address);
    const normalized = normalizePropertyData(raw, provider);
    const profile = {
      schemaVersion: '1.0',
      intelligenceVersion: VERSION,
      profileId: createSessionId(),
      status,
      address: normalizedAddress,
      data: normalized.data,
      fieldMeta: normalized.fieldMeta,
      provider: {
        id: provider.id || 'manual',
        name: provider.name || 'Manual confirmation',
        retrievedAt: provider.retrievedAt || nowIso(),
        requestId: provider.requestId || ''
      },
      errors: Array.isArray(errors) ? errors : [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    profile.quality = calculateConfidence(profile);
    return profile;
  }

  function mergeProfile(base, updates = {}, options = {}) {
    const profile = base ? JSON.parse(JSON.stringify(base)) : createProfile();
    if (updates.address) profile.address = normalizeAddress({ ...profile.address, ...updates.address });
    const dataUpdates = updates.data || updates;
    PROFILE_FIELDS.forEach(field => {
      if (!(field in dataUpdates)) return;
      profile.data[field] = normalizeFieldValue(field, dataUpdates[field]);
      profile.fieldMeta[field] = {
        ...(profile.fieldMeta[field] || {}),
        source: options.source || updates.fieldMeta?.[field]?.source || 'user',
        confidence: options.verifiedByUser ? 1 : Number(updates.fieldMeta?.[field]?.confidence ?? profile.fieldMeta[field]?.confidence ?? 0.8),
        verifiedByUser: Boolean(options.verifiedByUser ?? updates.fieldMeta?.[field]?.verifiedByUser),
        updatedAt: nowIso()
      };
    });
    profile.updatedAt = nowIso();
    profile.status = options.status || profile.status || 'ready';
    profile.quality = calculateConfidence(profile);
    return profile;
  }

  class ProviderRegistry {
    constructor() { this.providers = new Map(); }
    register(provider) {
      if (!provider?.id || typeof provider.lookup !== 'function') throw new Error('Property provider requires an id and lookup(address, context) function.');
      this.providers.set(provider.id, provider);
      return this;
    }
    get(id) { return this.providers.get(id); }
    has(id) { return this.providers.has(id); }
    list() { return [...this.providers.values()].map(({ id, name, supports }) => ({ id, name, supports: supports || [] })); }
  }

  class PropertyCache {
    constructor({ ttlMs = DEFAULT_TTL_MS, storage = null } = {}) {
      this.ttlMs = ttlMs;
      this.storage = storage || (() => { try { return localStorage; } catch (_) { return null; } })();
      this.memory = new Map();
    }
    key(address) { return `${CACHE_PREFIX}${normalizeAddress(address).normalizedKey || 'unknown'}`; }
    get(address) {
      const key = this.key(address); let item = this.memory.get(key);
      if (!item && this.storage) { try { item = JSON.parse(this.storage.getItem(key) || 'null'); } catch (_) {} }
      if (!item) return null;
      if (Date.now() - Number(item.cachedAt || 0) > this.ttlMs) { this.delete(address); return null; }
      return item.profile || null;
    }
    set(address, profile) {
      const key = this.key(address), item = { cachedAt: Date.now(), profile };
      this.memory.set(key, item);
      if (this.storage) { try { this.storage.setItem(key, JSON.stringify(item)); } catch (_) {} }
      return profile;
    }
    delete(address) {
      const key = this.key(address); this.memory.delete(key);
      if (this.storage) { try { this.storage.removeItem(key); } catch (_) {} }
    }
  }

  class PropertyIntelligenceService {
    constructor({ registry = new ProviderRegistry(), cache = new PropertyCache(), providerOrder = [] } = {}) {
      this.registry = registry;
      this.cache = cache;
      this.providerOrder = providerOrder;
    }
    async lookup(addressInput, context = {}) {
      const address = normalizeAddress(addressInput);
      if (!address.formatted && !address.postalCode) return createProfile({ address, status: 'manual_required', errors: ['Address information is required.'] });
      if (!context.forceRefresh) {
        const cached = this.cache.get(address);
        if (cached) return { ...cached, status: 'cached' };
      }
      const providerIds = context.providerIds || this.providerOrder;
      const errors = [];
      for (const id of providerIds) {
        const provider = this.registry.get(id);
        if (!provider) continue;
        try {
          const result = await provider.lookup(address, context);
          if (!result) continue;
          const profile = createProfile({ address: result.address || address, raw: result.data || result, provider: { ...provider, ...(result.provider || {}) }, status: 'ready' });
          this.cache.set(address, profile);
          return profile;
        } catch (error) {
          errors.push(`${id}: ${error?.message || 'lookup failed'}`);
        }
      }
      return createProfile({ address, status: 'manual_required', errors });
    }
    save(profile) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (_) {}
      return profile;
    }
    load() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { return null; }
    }
    clear() {
      try { localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
  }

  const registry = new ProviderRegistry();
  registry.register({
    id: 'manual',
    name: 'Manual confirmation',
    defaultConfidence: 1,
    supports: PROFILE_FIELDS,
    async lookup(address) { return { address, data: {} }; }
  });
  const cache = new PropertyCache();
  const service = new PropertyIntelligenceService({ registry, cache, providerOrder: [] });

  const api = {
    VERSION, STORAGE_KEY, PROFILE_FIELDS,
    normalizeAddress, createProfile, mergeProfile, calculateConfidence,
    ProviderRegistry, PropertyCache, PropertyIntelligenceService,
    registry, cache, service,
    registerProvider: provider => registry.register(provider),
    lookup: (address, context) => service.lookup(address, context),
    save: profile => service.save(profile),
    load: () => service.load(),
    clear: () => service.clear()
  };

  window.CoverageFitPropertyIntelligence = api;
  window.dispatchEvent(new CustomEvent('coveragefit:property-intelligence-ready', { detail: { version: VERSION } }));
})();
