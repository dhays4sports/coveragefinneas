(function (root, factory) {
  'use strict';
  const api = factory();
  root.CoverageFitAdvisoryDiscoveryContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:advisory-discovery-contract-ready', {
      detail: { version: api.VERSION, schemaVersion: api.SCHEMA_VERSION, build: api.BUILD }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = '1.0';
  const BUILD = 'CF-ADV-1.1';
  const CONTRACT_ID = 'coveragefit-advisory-discovery-profile-v1';
  const MAX_TEXT = 500;
  const MAX_LIST = 24;

  const SOURCE_TYPES = Object.freeze([
    '408farmers_handoff',
    'coveragefit_assessment',
    'coveragefit_consultation',
    'producer_note',
    'customer_report',
    'sms_handoff',
    'legacy_context',
    'unknown'
  ]);
  const RECOMMENDATION_RESPONSE_STATES = Object.freeze([
    'accepted_logic',
    'needs_explanation',
    'prefers_savings',
    'undecided'
  ]);
  const SIGNAL_STATUSES = Object.freeze(['candidate', 'active', 'superseded', 'dismissed']);

  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  const text = (value, limit = MAX_TEXT) => String(value ?? '').trim().slice(0, limit);
  const bool = value => value === true;
  const sourceType = value => SOURCE_TYPES.includes(text(value, 80)) ? text(value, 80) : 'unknown';
  const uniqueStrings = (values, limit = MAX_LIST) => [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 240)).filter(Boolean))].slice(0, limit);
  const asList = value => Array.isArray(value) ? value : [];
  const iso = value => {
    const candidate = text(value, 40);
    if (!candidate) return '';
    const parsed = Date.parse(candidate);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
  };

  function normalizeEvidenceRef(value, fallbackSource) {
    if (typeof value === 'string') {
      const key = text(value, 180);
      return key ? { source: sourceType(fallbackSource), key, label: '', capturedAt: '' } : null;
    }
    if (!value || typeof value !== 'object') return null;
    const key = text(value.key || value.sourceKey || value.field || value.id, 180);
    const label = text(value.label || value.question || value.description, 240);
    if (!key && !label) return null;
    return {
      source: sourceType(value.source || fallbackSource),
      key,
      label,
      capturedAt: iso(value.capturedAt || value.createdAt || value.updatedAt)
    };
  }

  function normalizeEvidenceRefs(values, fallbackSource) {
    const seen = new Set();
    return asList(values).map(value => normalizeEvidenceRef(value, fallbackSource)).filter(Boolean).filter(item => {
      const key = `${item.source}|${item.key}|${item.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_LIST);
  }

  function normalizeValueRecord(value, options = {}) {
    if (value == null || value === '') return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      const normalizedValue = text(value, options.valueLimit || 240);
      if (!normalizedValue) return null;
      return {
        value: normalizedValue,
        label: '',
        source: sourceType(options.source),
        evidenceRefs: normalizeEvidenceRefs(options.evidenceRefs, options.source),
        capturedAt: iso(options.capturedAt)
      };
    }
    const normalizedValue = text(value.value ?? value.key ?? value.code, options.valueLimit || 240);
    const label = text(value.label ?? value.text ?? value.display, 300);
    if (!normalizedValue && !label) return null;
    return {
      value: normalizedValue,
      label,
      source: sourceType(value.source || options.source),
      evidenceRefs: normalizeEvidenceRefs(value.evidenceRefs || value.evidence || options.evidenceRefs, value.source || options.source),
      capturedAt: iso(value.capturedAt || value.createdAt || value.updatedAt || options.capturedAt)
    };
  }

  function normalizeValueRecords(values, options = {}) {
    const seen = new Set();
    return asList(values).map(value => normalizeValueRecord(value, options)).filter(Boolean).filter(item => {
      const evidenceIdentity = (item.evidenceRefs || []).map(ref => `${ref.source}:${ref.key}:${ref.label}`).join('|');
      const key = `${item.value}|${item.label}|${evidenceIdentity}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_LIST);
  }

  function normalizeStatement(value, index = 0, fallbackSource = 'unknown') {
    if (!value) return null;
    const source = typeof value === 'object' ? sourceType(value.source || fallbackSource) : sourceType(fallbackSource);
    const statementText = text(typeof value === 'string' ? value : value.text || value.statement || value.value, MAX_TEXT);
    if (!statementText) return null;
    return {
      id: text(typeof value === 'object' ? value.id : '', 120) || `statement-${index + 1}`,
      topic: text(typeof value === 'object' ? value.topic : '', 120),
      text: statementText,
      source,
      sourceKey: text(typeof value === 'object' ? value.sourceKey || value.key : '', 180),
      capturedAt: iso(typeof value === 'object' ? value.capturedAt || value.createdAt : ''),
      evidenceRefs: normalizeEvidenceRefs(typeof value === 'object' ? value.evidenceRefs || value.evidence : [], source)
    };
  }

  function normalizeStatements(values, fallbackSource) {
    const seen = new Set();
    return asList(values).map((value, index) => normalizeStatement(value, index, fallbackSource)).filter(Boolean).filter(item => {
      const key = `${item.topic}|${item.text}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_LIST);
  }

  function normalizeRelationship(value = {}) {
    const source = sourceType(value.source);
    return {
      carrier: normalizeValueRecord(value.carrier, { source }),
      tenure: normalizeValueRecord(value.tenure, { source }),
      likes: normalizeValueRecords(value.likes, { source }),
      wouldChange: normalizeValueRecords(value.wouldChange, { source }),
      mustKeep: normalizeValueRecords(value.mustKeep, { source }),
      notes: normalizeStatements(value.notes, source)
    };
  }

  function normalizeContextGroup(value = {}, fallbackSource = 'unknown') {
    const source = sourceType(value.source || fallbackSource);
    return {
      source,
      facts: normalizeValueRecords(value.facts, { source }),
      statements: normalizeStatements(value.statements, source),
      notes: normalizeStatements(value.notes, source)
    };
  }

  function normalizeSignal(value, index = 0) {
    if (!value || typeof value !== 'object') return null;
    const id = text(value.id, 120) || `signal-${index + 1}`;
    const key = text(value.key || value.type, 120);
    if (!key) return null;
    const status = SIGNAL_STATUSES.includes(text(value.status, 40)) ? text(value.status, 40) : 'candidate';
    return {
      id,
      key,
      label: text(value.label, 240),
      status,
      confidence: Number.isFinite(Number(value.confidence)) ? Math.max(0, Math.min(1, Number(value.confidence))) : null,
      source: sourceType(value.source),
      evidenceRefs: normalizeEvidenceRefs(value.evidenceRefs || value.evidence, value.source),
      createdAt: iso(value.createdAt),
      updatedAt: iso(value.updatedAt)
    };
  }

  function normalizeAnchorCopy(value = {}) {
    return {
      becauseYouToldUs: text(value.becauseYouToldUs, MAX_TEXT),
      personalMeaning: text(value.personalMeaning, MAX_TEXT),
      whyThisFits: text(value.whyThisFits, MAX_TEXT),
      discussionPrompt: text(value.discussionPrompt, MAX_TEXT),
      buyInPrompt: text(value.buyInPrompt, MAX_TEXT),
      priceTradeoff: text(value.priceTradeoff, MAX_TEXT)
    };
  }

  function normalizeAnchor(value, index = 0) {
    if (!value || typeof value !== 'object') return null;
    const recommendationKey = text(value.recommendationKey || value.topic || value.key, 160);
    if (!recommendationKey) return null;
    const copyVariants = value.copyVariants && typeof value.copyVariants === 'object' ? value.copyVariants : {};
    return {
      id: text(value.id, 120) || `anchor-${index + 1}`,
      recommendationKey,
      recommendationSourceId: text(value.recommendationSourceId, 160),
      recommendationTitle: text(value.recommendationTitle || value.title, 180),
      personalized: value.personalized === true,
      genericFallback: value.genericFallback === true,
      supportingSignalKeys: uniqueStrings(value.supportingSignalKeys, MAX_LIST),
      becauseYouToldUs: text(value.becauseYouToldUs, MAX_TEXT),
      personalMeaning: text(value.personalMeaning, MAX_TEXT),
      whyThisFits: text(value.whyThisFits, MAX_TEXT),
      discussionPrompt: text(value.discussionPrompt, MAX_TEXT),
      buyInPrompt: text(value.buyInPrompt, MAX_TEXT),
      priceTradeoff: text(value.priceTradeoff, MAX_TEXT),
      copyVariants: {
        customer: normalizeAnchorCopy(copyVariants.customer || {}),
        producer: normalizeAnchorCopy(copyVariants.producer || {})
      },
      source: sourceType(value.source),
      evidenceRefs: normalizeEvidenceRefs(value.evidenceRefs || value.evidence, value.source),
      createdAt: iso(value.createdAt),
      updatedAt: iso(value.updatedAt)
    };
  }

  function normalizeRecommendationResponse(value, index = 0) {
    if (!value || typeof value !== 'object') return null;
    const recommendationKey = text(value.recommendationKey || value.topic || value.key, 160);
    if (!recommendationKey) return null;
    const requestedState = text(value.state || value.status, 60);
    return {
      id: text(value.id, 120) || `response-${index + 1}`,
      recommendationKey,
      state: RECOMMENDATION_RESPONSE_STATES.includes(requestedState) ? requestedState : 'undecided',
      customerWords: text(value.customerWords || value.note, MAX_TEXT),
      source: sourceType(value.source || 'coveragefit_consultation'),
      capturedAt: iso(value.capturedAt || value.createdAt || value.updatedAt)
    };
  }

  function create(input = {}) {
    const source = input.source && typeof input.source === 'object' ? input.source : {};
    const now = iso(input.updatedAt || input.createdAt) || new Date().toISOString();
    const createdAt = iso(input.createdAt) || now;
    const profile = {
      schemaVersion: SCHEMA_VERSION,
      contractVersion: VERSION,
      contractId: CONTRACT_ID,
      build: BUILD,
      product: text(input.product || 'home', 80) || 'home',
      createdAt,
      updatedAt: now,
      source: {
        primary: sourceType(source.primary || input.sourceType),
        integrationSessionId: text(source.integrationSessionId || input.integrationSessionId, 160),
        entryPoint: text(source.entryPoint || input.entryPoint, 160),
        inherited: bool(source.inherited),
        evidenceRefs: normalizeEvidenceRefs(source.evidenceRefs || input.evidenceRefs, source.primary || input.sourceType)
      },
      reasonForReview: normalizeValueRecord(input.reasonForReview, { source: source.primary || input.sourceType }),
      currentRelationship: normalizeRelationship(input.currentRelationship || {}),
      primaryPriority: normalizeValueRecord(input.primaryPriority, { source: source.primary || input.sourceType }),
      secondaryPriorities: normalizeValueRecords(input.secondaryPriorities, { source: source.primary || input.sourceType }),
      lifestyleDependencies: normalizeValueRecords(input.lifestyleDependencies, { source: source.primary || input.sourceType }),
      householdContext: normalizeContextGroup(input.householdContext, source.primary || input.sourceType),
      protectionProfile: normalizeContextGroup(input.protectionProfile, source.primary || input.sourceType),
      outcomeConcerns: normalizeValueRecords(input.outcomeConcerns, { source: source.primary || input.sourceType }),
      currentCoveragePreferences: normalizeValueRecords(input.currentCoveragePreferences, { source: source.primary || input.sourceType }),
      customerStatements: normalizeStatements(input.customerStatements, source.primary || input.sourceType),
      customerSignals: asList(input.customerSignals).map(normalizeSignal).filter(Boolean).slice(0, MAX_LIST),
      recommendationAnchors: asList(input.recommendationAnchors).map(normalizeAnchor).filter(Boolean).slice(0, MAX_LIST),
      recommendationResponses: asList(input.recommendationResponses).map(normalizeRecommendationResponse).filter(Boolean).slice(0, MAX_LIST),
      guardrails: {
        discoveryDoesNotAffectProtectionScore: true,
        recommendationIsNotCustomerDecision: true,
        buyInIsNotBindingAuthorization: true,
        personalizationRequiresEvidence: true,
        zeroRepeatCompatible: true
      }
    };
    return profile;
  }

  function seedFromExistingContext(context = {}) {
    const journey = context.journey || context.personalization?.journey || {};
    const prospect = context.prospect || {};
    const integration = context.integration || prospect.integration || {};
    const directReviewReason = text(
      context.reviewReason || journey.reviewReason || context.reviewContext || prospect.reviewContext,
      300
    );
    const source = prospect && Object.keys(prospect).length ? '408farmers_handoff' : 'legacy_context';
    const reasonForReview = directReviewReason ? {
      value: directReviewReason,
      label: directReviewReason,
      source,
      evidenceRefs: [{ source, key: 'reviewContext', label: 'Existing review reason' }]
    } : null;
    const currentCarrier = text(
      context.currentCarrier || prospect.currentCarrier || prospect?.coverage?.currentCarrier || prospect?.currentCoverage?.currentCarrier,
      180
    );
    return create({
      product: context.product || context.assessment || 'home',
      source: {
        primary: source,
        integrationSessionId: integration.sessionId || context.personalization?.sessionId || '',
        entryPoint: integration.entry || integration.entryPoint || journey.entryPoint || '',
        inherited: Boolean(directReviewReason || currentCarrier),
        evidenceRefs: directReviewReason ? [{ source, key: 'reviewContext', label: 'Existing review reason' }] : []
      },
      reasonForReview,
      currentRelationship: currentCarrier ? {
        source,
        carrier: {
          value: currentCarrier,
          label: currentCarrier,
          source,
          evidenceRefs: [{ source, key: 'currentCarrier', label: 'Existing carrier field' }]
        }
      } : {}
    });
  }

  function merge(base, patch) {
    const left = create(base || {});
    const right = create({ ...(patch || {}), createdAt: left.createdAt });
    const mergeRecords = (a, b) => normalizeValueRecords([...(a || []), ...(b || [])]);
    const mergeStatements = (a, b) => normalizeStatements([...(a || []), ...(b || [])]);
    const merged = create({
      ...left,
      ...right,
      createdAt: left.createdAt,
      updatedAt: right.updatedAt || new Date().toISOString(),
      source: {
        ...left.source,
        ...right.source,
        primary: right.source?.primary !== 'unknown' ? right.source.primary : left.source?.primary,
        evidenceRefs: [...(left.source?.evidenceRefs || []), ...(right.source?.evidenceRefs || [])]
      },
      reasonForReview: right.reasonForReview || left.reasonForReview,
      currentRelationship: {
        source: right.currentRelationship?.source || left.currentRelationship?.source,
        carrier: right.currentRelationship?.carrier || left.currentRelationship?.carrier,
        tenure: right.currentRelationship?.tenure || left.currentRelationship?.tenure,
        likes: mergeRecords(left.currentRelationship?.likes, right.currentRelationship?.likes),
        wouldChange: mergeRecords(left.currentRelationship?.wouldChange, right.currentRelationship?.wouldChange),
        mustKeep: mergeRecords(left.currentRelationship?.mustKeep, right.currentRelationship?.mustKeep),
        notes: mergeStatements(left.currentRelationship?.notes, right.currentRelationship?.notes)
      },
      primaryPriority: right.primaryPriority || left.primaryPriority,
      secondaryPriorities: mergeRecords(left.secondaryPriorities, right.secondaryPriorities),
      lifestyleDependencies: mergeRecords(left.lifestyleDependencies, right.lifestyleDependencies),
      householdContext: {
        source: right.householdContext?.source || left.householdContext?.source,
        facts: mergeRecords(left.householdContext?.facts, right.householdContext?.facts),
        statements: mergeStatements(left.householdContext?.statements, right.householdContext?.statements),
        notes: mergeStatements(left.householdContext?.notes, right.householdContext?.notes)
      },
      protectionProfile: {
        source: right.protectionProfile?.source || left.protectionProfile?.source,
        facts: mergeRecords(left.protectionProfile?.facts, right.protectionProfile?.facts),
        statements: mergeStatements(left.protectionProfile?.statements, right.protectionProfile?.statements),
        notes: mergeStatements(left.protectionProfile?.notes, right.protectionProfile?.notes)
      },
      outcomeConcerns: mergeRecords(left.outcomeConcerns, right.outcomeConcerns),
      currentCoveragePreferences: mergeRecords(left.currentCoveragePreferences, right.currentCoveragePreferences),
      customerStatements: mergeStatements(left.customerStatements, right.customerStatements),
      customerSignals: [...(left.customerSignals || []), ...(right.customerSignals || [])],
      recommendationAnchors: [...(left.recommendationAnchors || []), ...(right.recommendationAnchors || [])],
      recommendationResponses: [...(left.recommendationResponses || []), ...(right.recommendationResponses || [])]
    });
    return merged;
  }

  function validate(profile) {
    const candidate = create(profile || {});
    const errors = [];
    const warnings = [];
    if (candidate.schemaVersion !== SCHEMA_VERSION) errors.push('Unsupported advisory discovery schema version.');
    if (candidate.contractId !== CONTRACT_ID) errors.push('Advisory discovery contract identifier is missing or invalid.');
    candidate.customerSignals.forEach(signal => {
      if (!signal.evidenceRefs.length) warnings.push(`Customer signal ${signal.id} has no evidence reference.`);
    });
    candidate.recommendationAnchors.forEach(anchor => {
      const claimsPersonalization = Boolean(anchor.personalized || anchor.becauseYouToldUs || anchor.personalMeaning || anchor.supportingSignalKeys.length);
      if (claimsPersonalization && !anchor.evidenceRefs.length) warnings.push(`Personalized recommendation anchor ${anchor.id} has no evidence reference.`);
      if (anchor.personalized && !anchor.becauseYouToldUs) warnings.push(`Personalized recommendation anchor ${anchor.id} has no customer-linked rationale.`);
    });
    return { valid: errors.length === 0, errors, warnings, profile: candidate };
  }

  function hasDiscovery(profile) {
    const value = create(profile || {});
    return Boolean(
      value.reasonForReview ||
      value.currentRelationship.carrier ||
      value.currentRelationship.tenure ||
      value.currentRelationship.likes.length ||
      value.currentRelationship.wouldChange.length ||
      value.currentRelationship.mustKeep.length ||
      value.primaryPriority ||
      value.secondaryPriorities.length ||
      value.lifestyleDependencies.length ||
      value.householdContext.facts.length ||
      value.householdContext.statements.length ||
      value.protectionProfile.facts.length ||
      value.protectionProfile.statements.length ||
      value.outcomeConcerns.length ||
      value.currentCoveragePreferences.length ||
      value.customerStatements.length
    );
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    BUILD,
    CONTRACT_ID,
    SOURCE_TYPES,
    SIGNAL_STATUSES,
    RECOMMENDATION_RESPONSE_STATES,
    create,
    normalize: create,
    seedFromExistingContext,
    merge,
    validate,
    hasDiscovery,
    clone
  });
});
