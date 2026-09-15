(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitAdvisorySignalEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-signal-engine-ready', {
      detail: { version: api.VERSION, build: api.BUILD }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CF-ADV-1.2';
  const ENGINE_ID = 'coveragefit-advisory-signal-engine-v1';
  const ENGINE_SIGNAL_PREFIX = 'cfadv12-';
  const SOURCE = 'coveragefit_assessment';

  const RULES = Object.freeze([
    Object.freeze({
      id: 'vehicle-dependency',
      output: 'vehicleDependency.high',
      label: 'High vehicle dependency',
      requiredFacts: Object.freeze(['onlyVehicle', 'dailyUse'])
    }),
    Object.freeze({
      id: 'home-commitment',
      output: 'homeCommitment.high',
      label: 'High home commitment',
      requiredFacts: Object.freeze(['homeOwnership', 'stayIntent'])
    }),
    Object.freeze({
      id: 'incumbent-relationship',
      output: 'incumbentRelationship.strong',
      label: 'Strong incumbent relationship',
      requiredFacts: Object.freeze(['currentCarrierTenure', 'likesService'])
    }),
    Object.freeze({
      id: 'tradeoff-preference',
      output: 'tradeoffPreference',
      label: 'Customer tradeoff preference',
      requiredFacts: Object.freeze(['primaryPriority'])
    })
  ]);

  const FACT_ALIASES = Object.freeze({
    onlyVehicle: Object.freeze(['onlyvehicle', 'onlycar', 'vehicleonly', 'solevehicle']),
    dailyUse: Object.freeze(['dailyuse', 'vehicledailyuse', 'dailyvehicleuse', 'dailycommuteuse']),
    homeOwnership: Object.freeze(['homeownership', 'ownershiptype', 'residencetype', 'propertyoccupancy', 'occupancy']),
    stayIntent: Object.freeze(['stayintent', 'plannedstay', 'ownershiphorizon', 'homestayintent', 'longtermstay']),
    currentCarrierTenure: Object.freeze(['currentcarriertenure', 'carriertenure', 'tenurewithcarrier', 'currenttenure']),
    likesService: Object.freeze(['likesservice', 'currentcarrierlikeservice', 'servicepreference', 'incumbentservice']),
    primaryPriority: Object.freeze(['primarypriority', 'insurancepriority', 'reviewpriority'])
  });

  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const compact = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const asArray = value => Array.isArray(value) ? value : [];
  const uniqueEvidence = refs => {
    const seen = new Set();
    return asArray(refs).filter(Boolean).map(ref => ({
      source: String(ref.source || 'unknown'),
      key: String(ref.key || ''),
      label: String(ref.label || ''),
      capturedAt: String(ref.capturedAt || '')
    })).filter(ref => ref.key || ref.label).filter(ref => {
      const identity = `${ref.source}|${ref.key}|${ref.label}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  };
  const recordEvidence = record => uniqueEvidence(record?.evidenceRefs || []);
  const hasEvidence = record => recordEvidence(record).length > 0;
  const evidenceKeys = record => recordEvidence(record).map(ref => compact(ref.key));
  const valueText = record => String(record?.value ?? record?.text ?? record?.label ?? '').trim();
  const aliasesFor = key => FACT_ALIASES[key] || [];
  const evidenceMatches = (record, key) => {
    const aliases = new Set(aliasesFor(key));
    return evidenceKeys(record).some(candidate => aliases.has(candidate));
  };

  function contractApi() {
    if (root?.CoverageFitAdvisoryDiscoveryContract) return root.CoverageFitAdvisoryDiscoveryContract;
    if (typeof require === 'function') {
      try { return require('./advisory-discovery-contract.js'); } catch (_) { return null; }
    }
    return null;
  }

  function normalizeProfile(profile) {
    const contract = contractApi();
    return contract?.normalize ? contract.normalize(profile || {}) : clone(profile || {});
  }

  function observation(key, value, record, location) {
    const evidenceRefs = recordEvidence(record);
    if (!evidenceRefs.length) return null;
    return {
      key,
      value: String(value ?? '').trim(),
      normalizedValue: compact(value),
      source: String(record?.source || evidenceRefs[0]?.source || 'unknown'),
      location,
      evidenceRefs
    };
  }

  function pushObservation(target, key, value, record, location) {
    const next = observation(key, value, record, location);
    if (!next) return;
    const signature = `${key}|${next.normalizedValue}|${next.evidenceRefs.map(ref => `${ref.source}:${ref.key}`).join(',')}`;
    if (target[key].some(item => item.signature === signature)) return;
    Object.defineProperty(next, 'signature', { value: signature, enumerable: false });
    target[key].push(next);
  }

  function semanticMarker(record, target, location) {
    if (!hasEvidence(record)) return;
    const marker = compact(record?.value || record?.label);
    const markerMap = {
      onlyvehicle: ['onlyVehicle', 'yes'],
      solevehicle: ['onlyVehicle', 'yes'],
      dailyuse: ['dailyUse', 'yes'],
      dailyvehicleuse: ['dailyUse', 'yes'],
      primaryresidence: ['homeOwnership', 'primaryResidence'],
      owneroccupied: ['homeOwnership', 'primaryResidence'],
      longterm: ['stayIntent', 'longTerm'],
      longtermstay: ['stayIntent', 'longTerm']
    };
    const mapped = markerMap[marker];
    if (mapped) pushObservation(target, mapped[0], mapped[1], record, location);
  }

  function scanRecord(record, target, location, explicitKey) {
    if (!record || typeof record !== 'object' || !hasEvidence(record)) return;
    if (explicitKey) pushObservation(target, explicitKey, valueText(record), record, location);
    for (const key of Object.keys(FACT_ALIASES)) {
      if (evidenceMatches(record, key)) pushObservation(target, key, valueText(record), record, location);
    }
    semanticMarker(record, target, location);
  }

  function collectExplicitFacts(profile) {
    const normalized = normalizeProfile(profile);
    const facts = {
      onlyVehicle: [],
      dailyUse: [],
      homeOwnership: [],
      stayIntent: [],
      currentCarrierTenure: [],
      likesService: [],
      primaryPriority: []
    };

    scanRecord(normalized?.primaryPriority, facts, 'primaryPriority', 'primaryPriority');
    scanRecord(normalized?.currentRelationship?.tenure, facts, 'currentRelationship.tenure', 'currentCarrierTenure');

    asArray(normalized?.currentRelationship?.likes).forEach((record, index) => {
      scanRecord(record, facts, `currentRelationship.likes[${index}]`);
      const text = compact(`${record?.value || ''} ${record?.label || ''}`);
      if (text.includes('service') && hasEvidence(record)) {
        pushObservation(facts, 'likesService', 'yes', record, `currentRelationship.likes[${index}]`);
      }
    });

    const scanGroup = (records, prefix) => asArray(records).forEach((record, index) => scanRecord(record, facts, `${prefix}[${index}]`));
    scanGroup(normalized?.lifestyleDependencies, 'lifestyleDependencies');
    scanGroup(normalized?.householdContext?.facts, 'householdContext.facts');
    scanGroup(normalized?.protectionProfile?.facts, 'protectionProfile.facts');
    scanGroup(normalized?.outcomeConcerns, 'outcomeConcerns');
    scanGroup(normalized?.currentCoveragePreferences, 'currentCoveragePreferences');

    asArray(normalized?.customerStatements).forEach((statement, index) => {
      if (!hasEvidence(statement)) return;
      const keyToken = compact(statement.sourceKey);
      for (const key of Object.keys(FACT_ALIASES)) {
        if (aliasesFor(key).includes(keyToken)) {
          pushObservation(facts, key, statement.text, statement, `customerStatements[${index}]`);
        }
      }
    });

    return facts;
  }

  const YES = new Set(['yes', 'true', '1', 'y', 'only', 'daily', 'primaryresidence', 'owneroccupied']);
  const NO = new Set(['no', 'false', '0', 'n', 'notonly', 'secondaryvehicle']);

  function classifyBoolean(value) {
    const token = compact(value);
    if (YES.has(token)) return true;
    if (NO.has(token)) return false;
    if (token.startsWith('yes')) return true;
    if (token.startsWith('no')) return false;
    return null;
  }

  function classifyOwnership(value) {
    const token = compact(value);
    if (['primaryresidence', 'owneroccupied', 'primaryhome', 'ownprimaryresidence'].includes(token)) return 'primary';
    if (['rental', 'investmentproperty', 'secondaryhome', 'vacant', 'tenantoccupied'].includes(token)) return 'other';
    return null;
  }

  function classifyStayIntent(value) {
    const token = compact(value);
    if (['longterm', 'longtermstay', 'stayinglongterm', 'foreverhome', '5plus', '5plusyears', 'fiveplusyears'].includes(token)) return 'long';
    if (['shortterm', 'sellingsoon', 'movingsoon', 'under2years', 'lesstwotwoyears'].includes(token)) return 'short';
    if (token.includes('longterm') || token.includes('stayingawhile') || token.includes('stayawhile')) return 'long';
    if (token.includes('sellsoon') || token.includes('movesoon')) return 'short';
    return null;
  }

  function parseTenureYears(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const numeric = raw.match(/(\d+(?:\.\d+)?)/);
    if (!numeric) return null;
    const amount = Number(numeric[1]);
    if (!Number.isFinite(amount) || amount < 0) return null;
    const lower = raw.toLowerCase();
    const years = lower.includes('month') ? amount / 12 : amount;
    return years <= 100 ? years : null;
  }

  function classifyPriority(value) {
    const token = compact(value);
    if (!token) return null;
    if (['balance', 'balanced', 'rightbalance', 'balancedprotectionandprice', 'priceandprotection', 'costandprotection'].includes(token)) return 'balanced';
    if (token.includes('balance')) return 'balanced';
    if (['price', 'cost', 'lowestprice', 'lowestcost', 'keepcostdown', 'savings', 'save'].includes(token)) return 'price';
    if (token.includes('lowest') || token.includes('keepcost') || token.includes('savings')) return 'price';
    if (['protection', 'strongprotection', 'strongestprotection', 'coverage', 'protectstrongly'].includes(token)) return 'protection';
    if (token.includes('protect') || token.includes('coverage')) return 'protection';
    return null;
  }

  function classified(observations, classifier) {
    return asArray(observations).map(item => ({ item, classValue: classifier(item.value) })).filter(entry => entry.classValue !== null);
  }

  function conflict(entries) {
    return new Set(entries.map(entry => String(entry.classValue))).size > 1;
  }

  function refsFrom(entries) {
    return uniqueEvidence(entries.flatMap(entry => entry.item?.evidenceRefs || []));
  }

  function signal(ruleId, key, label, status, confidence, refs, timestamp) {
    if (!refs?.length) return null;
    return {
      id: `${ENGINE_SIGNAL_PREFIX}${ruleId}`,
      key,
      label,
      status,
      confidence,
      source: SOURCE,
      evidenceRefs: uniqueEvidence(refs),
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function candidate(ruleId, conceptKey, conceptLabel, entries, timestamp) {
    const refs = refsFrom(entries);
    return signal(ruleId, `${conceptKey}.needsConfirmation`, `${conceptLabel} needs confirmation`, 'candidate', 0.5, refs, timestamp);
  }

  function deriveDetailed(profile) {
    const normalized = normalizeProfile(profile);
    const facts = collectExplicitFacts(normalized);
    const signals = [];
    const diagnostics = [];
    const timestamp = normalized?.updatedAt || normalized?.createdAt || new Date().toISOString();

    // Vehicle dependency: both facts must explicitly resolve yes. Contradictory evidence becomes a candidate signal.
    const onlyVehicle = classified(facts.onlyVehicle, classifyBoolean);
    const dailyUse = classified(facts.dailyUse, classifyBoolean);
    if (onlyVehicle.length && dailyUse.length) {
      if (conflict(onlyVehicle) || conflict(dailyUse)) {
        const next = candidate('vehicle-dependency', 'vehicleDependency', 'Vehicle dependency', [...onlyVehicle, ...dailyUse], timestamp);
        if (next) signals.push(next);
        diagnostics.push({ ruleId: 'vehicle-dependency', outcome: 'candidate_conflict' });
      } else if (onlyVehicle[0].classValue === true && dailyUse[0].classValue === true) {
        const next = signal('vehicle-dependency', 'vehicleDependency.high', 'High vehicle dependency', 'active', 0.98, refsFrom([...onlyVehicle, ...dailyUse]), timestamp);
        if (next) signals.push(next);
        diagnostics.push({ ruleId: 'vehicle-dependency', outcome: 'active' });
      } else {
        diagnostics.push({ ruleId: 'vehicle-dependency', outcome: 'condition_not_met' });
      }
    } else {
      diagnostics.push({ ruleId: 'vehicle-dependency', outcome: 'insufficient_evidence' });
    }

    // Home commitment: primary residence + explicit long-term stay intent.
    const ownership = classified(facts.homeOwnership, classifyOwnership);
    const stayIntent = classified(facts.stayIntent, classifyStayIntent);
    if (ownership.length && stayIntent.length) {
      if (conflict(ownership) || conflict(stayIntent)) {
        const next = candidate('home-commitment', 'homeCommitment', 'Home commitment', [...ownership, ...stayIntent], timestamp);
        if (next) signals.push(next);
        diagnostics.push({ ruleId: 'home-commitment', outcome: 'candidate_conflict' });
      } else if (ownership[0].classValue === 'primary' && stayIntent[0].classValue === 'long') {
        const next = signal('home-commitment', 'homeCommitment.high', 'High home commitment', 'active', 0.98, refsFrom([...ownership, ...stayIntent]), timestamp);
        if (next) signals.push(next);
        diagnostics.push({ ruleId: 'home-commitment', outcome: 'active' });
      } else {
        diagnostics.push({ ruleId: 'home-commitment', outcome: 'condition_not_met' });
      }
    } else {
      diagnostics.push({ ruleId: 'home-commitment', outcome: 'insufficient_evidence' });
    }

    // Incumbent relationship: at least 10 years + explicit positive service preference.
    const tenure = classified(facts.currentCarrierTenure, parseTenureYears);
    const service = classified(facts.likesService, classifyBoolean);
    if (tenure.length && service.length) {
      if (conflict(tenure) || conflict(service)) {
        const next = candidate('incumbent-relationship', 'incumbentRelationship', 'Incumbent relationship', [...tenure, ...service], timestamp);
        if (next) signals.push(next);
        diagnostics.push({ ruleId: 'incumbent-relationship', outcome: 'candidate_conflict' });
      } else if (tenure[0].classValue >= 10 && service[0].classValue === true) {
        const next = signal('incumbent-relationship', 'incumbentRelationship.strong', 'Strong incumbent relationship', 'active', 0.97, refsFrom([...tenure, ...service]), timestamp);
        if (next) signals.push(next);
        diagnostics.push({ ruleId: 'incumbent-relationship', outcome: 'active' });
      } else {
        diagnostics.push({ ruleId: 'incumbent-relationship', outcome: 'condition_not_met' });
      }
    } else {
      diagnostics.push({ ruleId: 'incumbent-relationship', outcome: 'insufficient_evidence' });
    }

    // Tradeoff preference: direct priority only; no preference is inferred from price/coverage behavior elsewhere.
    const priorities = classified(facts.primaryPriority, classifyPriority);
    if (priorities.length) {
      if (conflict(priorities)) {
        const next = candidate('tradeoff-preference', 'tradeoffPreference', 'Tradeoff preference', priorities, timestamp);
        if (next) signals.push(next);
        diagnostics.push({ ruleId: 'tradeoff-preference', outcome: 'candidate_conflict' });
      } else {
        const preference = priorities[0].classValue;
        const label = preference === 'balanced' ? 'Balanced price and protection preference'
          : preference === 'price' ? 'Price-first preference'
            : 'Protection-first preference';
        const next = signal('tradeoff-preference', `tradeoffPreference.${preference}`, label, 'active', 0.99, refsFrom(priorities), timestamp);
        if (next) signals.push(next);
        diagnostics.push({ ruleId: 'tradeoff-preference', outcome: 'active' });
      }
    } else {
      diagnostics.push({ ruleId: 'tradeoff-preference', outcome: 'insufficient_evidence' });
    }

    return Object.freeze({
      facts: clone(facts),
      signals: clone(signals),
      diagnostics: clone(diagnostics)
    });
  }

  function derive(profile) {
    return deriveDetailed(profile).signals;
  }

  function apply(profile) {
    const contract = contractApi();
    const normalized = normalizeProfile(profile);
    const derived = derive(normalized);
    const preserved = asArray(normalized?.customerSignals).filter(item => !String(item?.id || '').startsWith(ENGINE_SIGNAL_PREFIX));
    if (!contract?.normalize) {
      return { ...clone(normalized), customerSignals: [...preserved, ...derived] };
    }
    return contract.normalize({
      ...normalized,
      customerSignals: [...preserved, ...derived]
    });
  }

  function ownsSignal(signalValue) {
    return String(signalValue?.id || '').startsWith(ENGINE_SIGNAL_PREFIX);
  }

  return Object.freeze({
    VERSION,
    BUILD,
    ENGINE_ID,
    ENGINE_SIGNAL_PREFIX,
    RULES,
    FACT_ALIASES,
    collectExplicitFacts,
    deriveDetailed,
    derive,
    apply,
    ownsSignal
  });
});
