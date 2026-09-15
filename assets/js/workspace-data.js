(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitWorkspaceData = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:workspace-data-ready', {
      detail: { version: api.VERSION, schemaVersion: api.SCHEMA_VERSION }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.5.0';
  const SCHEMA_VERSION = '1.0';
  const REPORT_KEY = 'coveragefit_home_report';
  const PROPERTY_KEY = 'coveragefit_property_profile_v1';
  const CONSULTATION_STORE_KEY = 'coveragefit.consultations.v1';
  const CONSULTATION_ACTIVE_KEY = 'coveragefit.consultations.active';
  const PRODUCT = 'home';

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }

  function safeParse(value) {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
  }

  function storageGet(storage, key) {
    try { return storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null; } catch (_) { return null; }
  }

  function consultationApi() {
    return root.CoverageFitConsultationRecords && typeof root.CoverageFitConsultationRecords.get === 'function'
      ? root.CoverageFitConsultationRecords
      : null;
  }

  function requestedConsultationId(options) {
    const supplied = stringValue(options?.consultationId);
    if (supplied) return supplied;
    try {
      return stringValue(new URLSearchParams(root.location?.search || '').get('consultation_id'));
    } catch (_) {
      return '';
    }
  }

  function readConsultation(options) {
    if (Object.prototype.hasOwnProperty.call(options, 'consultationRecord')) return clone(options.consultationRecord);
    const api = consultationApi();
    if (!api) return null;
    const settings = { storage: options.storage || root.localStorage };
    const requested = requestedConsultationId(options);
    if (requested) {
      const selected = api.get(requested, settings);
      if (selected) return selected;
    }
    return api.getActive(settings);
  }

  function readReport(options, consultation) {
    if (Object.prototype.hasOwnProperty.call(options, 'report')) return clone(options.report);
    if (consultation?.report) return clone(consultation.report);
    const storage = options.storage || root.localStorage;
    return safeParse(storageGet(storage, REPORT_KEY));
  }

  function readPropertyProfile(report, options) {
    if (Object.prototype.hasOwnProperty.call(options, 'propertyProfile')) return clone(options.propertyProfile);
    if (report && report.propertyProfile) return clone(report.propertyProfile);
    try {
      const loaded = root.CoverageFitPropertyIntelligence?.load?.();
      if (loaded) return clone(loaded);
    } catch (_) {}
    const storage = options.storage || root.localStorage;
    return safeParse(storageGet(storage, PROPERTY_KEY));
  }

  function stringValue(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function buildEntryContext(report) {
    const prospect = report?.prospectProfile || {};
    const personalization = report?.personalizationContext || {};
    const journey = personalization?.journey || {};
    const integration = report?.integration || prospect?.integration || {};
    const attribution = report?.attribution || {};
    const lastTouch = attribution?.lastTouch || attribution?.current || {};
    const firstTouch = attribution?.firstTouch || {};
    const smsContext = prospect?.smsContext || report?.smsContext || {};
    const closingUrgency = stringValue(
      journey?.closingUrgency || prospect?.closingUrgency || smsContext?.priority || (smsContext?.rushRequested ? 'rush' : '')
    );
    const urgencyKey = closingUrgency.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const source = stringValue(integration?.source || journey?.source || attribution?.source || lastTouch?.source || lastTouch?.utm_source || firstTouch?.source || firstTouch?.utm_source);
    const entryPoint = stringValue(integration?.entry || journey?.entryPoint || attribution?.entry || lastTouch?.entry || firstTouch?.entry || firstTouch?.path);
    const entryMethod = stringValue(integration?.entryMethod || journey?.entryMethod);
    const smsKey = [source, entryPoint, entryMethod].join(' ').toLowerCase();
    return {
      occupationSegment: stringValue(journey?.occupationSegment || prospect?.occupationSegment),
      housingContext: stringValue(journey?.housingContext || prospect?.housingContext),
      closingDate: stringValue(journey?.closingDate || prospect?.closingDate || smsContext?.closingDate),
      occupancy: stringValue(journey?.occupancy || prospect?.occupancy || smsContext?.occupancy),
      closingUrgency,
      autoReview: typeof smsContext?.autoReview === 'boolean' ? smsContext.autoReview : null,
      rush: Boolean(smsContext?.rushRequested || smsContext?.priority === 'rush' || /(^|_)(rush|urgent|immediate|within_7_days)($|_)/.test(urgencyKey)),
      source,
      campaign: stringValue(integration?.campaign || journey?.campaign || attribution?.campaign || lastTouch?.campaign || lastTouch?.utm_campaign || firstTouch?.campaign || firstTouch?.utm_campaign),
      campaignId: stringValue(integration?.campaignId || journey?.campaignId || lastTouch?.campaign_id || firstTouch?.campaign_id),
      campaignVariant: stringValue(integration?.campaignVariant || journey?.campaignVariant || lastTouch?.campaign_variant || firstTouch?.campaign_variant),
      campaignZip: stringValue(integration?.campaignZip || journey?.campaignZip || lastTouch?.campaign_zip || firstTouch?.campaign_zip),
      referralSource: stringValue(integration?.referralSource || journey?.referralSource || attribution?.referralSource || lastTouch?.ref || firstTouch?.ref),
      partnerId: stringValue(integration?.partnerId || journey?.partnerId || prospect?.integration?.partnerId),
      partnerName: stringValue(integration?.partnerName || journey?.partnerName || prospect?.integration?.partnerName),
      entryMethod,
      entryPoint,
      launchSurface: stringValue(integration?.launchSurface || journey?.launchSurface || prospect?.integration?.launchSurface),
      medium: stringValue(journey?.medium || attribution?.medium || lastTouch?.medium || lastTouch?.utm_medium || firstTouch?.medium || firstTouch?.utm_medium),
      prefilled: Boolean(integration?.prefilled || journey?.prefilled || (prospect && Object.keys(prospect).length)),
      sms: Boolean(Object.keys(smsContext).length || /sms|text/.test(smsKey))
    };
  }

  function scoreStatus(score, suppliedStatus) {
    if (stringValue(suppliedStatus)) return stringValue(suppliedStatus);
    if (score == null) return 'Review Summary';
    return root.CoverageFitProtectionScore?.bandFor?.(score)?.label || 'Review Recommended';
  }

  function fullName(report) {
    return stringValue(
      report?.consumer?.name ||
      [report?.consumer?.firstName, report?.consumer?.lastName].filter(Boolean).join(' ') ||
      report?.profile?.name ||
      [report?.profile?.firstName, report?.profile?.lastName].filter(Boolean).join(' ') ||
      report?.firstName,
      'Not provided'
    );
  }

  function normalizeEvidenceQuality(value, fallback) {
    const normalized = stringValue(value).toLowerCase();
    if (['confirmed', 'partial', 'needs-verification', 'missing'].includes(normalized)) return normalized;
    return fallback || 'confirmed';
  }

  function normalizeRecommendation(item, index) {
    const evidence = Array.isArray(item?.supportingAnswers)
      ? item.supportingAnswers
      : Array.isArray(item?.evidence) ? item.evidence : [];
    const evidenceQuality = normalizeEvidenceQuality(item?.evidenceQuality, 'confirmed');
    return {
      id: stringValue(item?.ruleId || item?.id || item?.key || item?.tag || item?.category, `topic-${index + 1}`),
      questionKey: stringValue(item?.key || item?.questionKey || item?.ruleId),
      order: index + 1,
      title: stringValue(item?.name || item?.title || item?.tag || item?.category, 'Protection topic'),
      category: stringValue(item?.category || item?.tag, 'General review'),
      priority: stringValue(item?.priority || item?.impactLabel || item?.impact, 'Review topic'),
      confidence: numberValue(item?.confidence),
      explanation: stringValue(
        item?.clientExplanation || item?.insight || item?.whyMatters,
        'This answer created a useful topic to confirm during the licensed review.'
      ),
      conversationStarter: stringValue(
        item?.conversationStarter || item?.discussionQuestion || item?.question,
        'Can we confirm how this topic is addressed by the current policy?'
      ),
      producerNotes: stringValue(item?.producerNotes || item?.agentNotes, ''),
      evidenceQuality,
      evidenceLabel: stringValue(item?.evidenceLabel, evidenceQuality === 'confirmed' ? 'Clear response captured' : evidenceQuality === 'partial' ? 'Open detail to resolve' : evidenceQuality === 'missing' ? 'Answer not captured' : 'Needs policy verification'),
      evidenceSufficient: item?.evidenceSufficient !== false && evidenceQuality === 'confirmed',
      evidenceBasis: stringValue(item?.evidenceBasis),
      evidencePrompt: stringValue(item?.evidencePrompt || item?.question),
      answerLabel: stringValue(item?.label || item?.answer || item?.value),
      evidence: evidence.filter(Boolean).map(String),
      source: clone(item)
    };
  }

  function evidenceAnswerSource(report) {
    if (Array.isArray(report?.answers)) return report.answers;
    if (report?.industryResponses && typeof report.industryResponses === 'object') {
      return Object.entries(report.industryResponses).map(([key, value]) => ({ key, ...(value || {}) }));
    }
    return [];
  }

  function evidenceItem(item, index, priorityOrder) {
    const key = stringValue(item?.key || item?.questionKey, `answer-${index + 1}`);
    const title = stringValue(item?.title || item?.question || item?.tag || item?.category, 'Assessment response');
    const answer = stringValue(item?.label || item?.answer || item?.value, item?.answered === false ? 'No answer recorded' : 'Response captured');
    const quality = normalizeEvidenceQuality(item?.evidenceQuality, item?.answered === false ? 'missing' : 'confirmed');
    const prompt = stringValue(item?.evidencePrompt || item?.discussionQuestion || item?.question, quality === 'confirmed' ? `Confirm that the reported ${title.toLowerCase()} remains accurate.` : `Confirm ${title.toLowerCase()} during the licensed review.`);
    const priorityIndex = priorityOrder.has(key) ? priorityOrder.get(key) : Number.MAX_SAFE_INTEGER;
    return {
      id: `evidence-${key}`,
      key,
      order: index + 1,
      priorityOrder: priorityIndex === Number.MAX_SAFE_INTEGER ? null : priorityIndex + 1,
      title,
      category: stringValue(item?.category || item?.tag, 'General review'),
      answer,
      statement: `${title}: ${answer}`,
      question: prompt,
      evidenceQuality: quality,
      evidenceLabel: stringValue(item?.evidenceLabel, quality === 'confirmed' ? 'Confirmed fact' : quality === 'partial' ? 'Unresolved detail' : quality === 'missing' ? 'Unanswered question' : 'Verify against policy'),
      evidenceBasis: stringValue(item?.evidenceBasis || item?.insight),
      findingType: stringValue(item?.findingType),
      required: item?.required !== false,
      answered: item?.answered !== false && quality !== 'missing',
      scoreImpact: numberValue(item?.scoreImpact),
      propertyAware: Boolean(item?.propertyAware),
      reviewReasonAware: Boolean(item?.reviewReasonAware),
      source: clone(item)
    };
  }

  function sortEvidenceItems(items) {
    return items.slice().sort((left, right) => {
      const leftPriority = left.priorityOrder == null ? Number.MAX_SAFE_INTEGER : left.priorityOrder;
      const rightPriority = right.priorityOrder == null ? Number.MAX_SAFE_INTEGER : right.priorityOrder;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.order - right.order;
    });
  }

  function buildEvidenceHandoff(report) {
    const completion = report?.assessmentCompletion || null;
    const priorities = recommendationSource(report);
    const priorityOrder = new Map(priorities.map((item, index) => [stringValue(item?.key || item?.questionKey || item?.ruleId), index]).filter(([key]) => key));
    const items = evidenceAnswerSource(report).map((item, index) => evidenceItem(item, index, priorityOrder));
    const hasEvidenceMetadata = Boolean(completion) || items.some(item => item?.source?.evidenceQuality || item?.source?.evidenceLabel || item?.source?.evidenceBasis);
    const confirmedFacts = items.filter(item => item.evidenceQuality === 'confirmed' && item.answered);
    const verificationItems = sortEvidenceItems(items.filter(item => item.evidenceQuality === 'needs-verification'));
    const unresolvedQuestions = sortEvidenceItems(items.filter(item => item.evidenceQuality === 'partial' || item.evidenceQuality === 'missing'));
    const followUpCount = verificationItems.length + unresolvedQuestions.length;
    return {
      schemaVersion: '1.0',
      handoffVersion: '1.0.0',
      available: hasEvidenceMetadata && items.length > 0,
      state: !hasEvidenceMetadata || !items.length ? 'legacy' : unresolvedQuestions.length ? 'open-questions' : verificationItems.length ? 'verification-needed' : 'ready',
      completionState: stringValue(completion?.state, hasEvidenceMetadata ? 'complete' : 'legacy'),
      scoreIsFinal: completion?.scoreIsFinal !== false,
      scoreFormulaChanged: false,
      summary: {
        total: items.length,
        confirmed: confirmedFacts.length,
        verification: verificationItems.length,
        unresolved: unresolvedQuestions.length,
        followUp: followUpCount
      },
      confirmedFacts,
      verificationItems,
      unresolvedQuestions,
      guardrail: 'These are homeowner-reported assessment responses. Confirm policy language, limits, deductibles, endorsements, exclusions, and underwriting details before making a recommendation.'
    };
  }

  function recommendationSource(report) {
    if (Array.isArray(report?.recommendations) && report.recommendations.length) return report.recommendations;
    if (Array.isArray(report?.priorities)) return report.priorities;
    return [];
  }

  function readPropertyField(profile, aliases) {
    const sources = [profile?.data, profile?.fields, profile].filter(Boolean);
    for (const source of sources) {
      for (const key of aliases) {
        const candidate = source[key];
        if (candidate && typeof candidate === 'object' && Object.prototype.hasOwnProperty.call(candidate, 'value')) return candidate.value;
        if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
      }
    }
    return null;
  }

  function propertyAddress(profile) {
    const address = profile?.address || profile?.normalizedAddress;
    if (typeof address === 'string') return address.trim();
    if (address && typeof address === 'object') {
      return stringValue(address.formatted) || [
        address.line1 || address.street,
        address.line2,
        address.city,
        [address.state, address.postalCode || address.zip].filter(Boolean).join(' ')
      ].filter(Boolean).join(', ');
    }
    return stringValue(readPropertyField(profile, ['address', 'propertyAddress']));
  }

  function propertyConfirmation(profile) {
    if (!profile) return { label: 'No property profile saved', verifiedCount: 0, requiresConfirmation: true };
    const meta = profile.fieldMeta || profile.fields || {};
    const rows = Object.values(meta).filter(value => value && typeof value === 'object');
    const verifiedCount = rows.filter(value => value.verifiedByUser).length;
    if (verifiedCount) return {
      label: `${verifiedCount} field${verifiedCount === 1 ? '' : 's'} customer-confirmed`,
      verifiedCount,
      requiresConfirmation: false
    };
    if (profile.verifiedByUser) return { label: 'Customer-confirmed', verifiedCount: 1, requiresConfirmation: false };
    return { label: 'Property details require confirmation', verifiedCount: 0, requiresConfirmation: true };
  }

  function readReportField(report, aliases) {
    const sources = [
      report?.coverage,
      report?.currentCoverage,
      report?.policySnapshot,
      report?.policy,
      report?.consumer,
      report?.profile,
      report?.prospectProfile,
      report
    ].filter(Boolean);
    for (const source of sources) {
      for (const key of aliases) {
        const candidate = source[key];
        if (candidate && typeof candidate === 'object' && Object.prototype.hasOwnProperty.call(candidate, 'value')) return candidate.value;
        if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
      }
    }
    return null;
  }

  function normalizeCoverage(report, profile) {
    const profileCoverage = profile?.coverage || profile?.currentCoverage || profile?.policy || {};
    function firstValue(aliases) {
      for (const key of aliases) {
        const candidate = profileCoverage[key];
        if (candidate && typeof candidate === 'object' && Object.prototype.hasOwnProperty.call(candidate, 'value')) return candidate.value;
        if (candidate !== undefined && candidate !== null && candidate !== '') return candidate;
      }
      const profileValue = readPropertyField(profile, aliases);
      return profileValue !== null && profileValue !== '' ? profileValue : readReportField(report, aliases);
    }
    return {
      replacementCost: firstValue(['replacementCost', 'reconstructionCost', 'dwellingLimit', 'coverageA', 'rebuildValue']),
      deductible: firstValue(['deductible', 'allOtherPerilsDeductible', 'aopDeductible', 'propertyDeductible']),
      currentCarrier: firstValue(['currentCarrier', 'carrier', 'insuranceCarrier']),
      currentPremium: firstValue(['currentPremium', 'annualPremium', 'premium']),
      renewalDate: firstValue(['renewalDate', 'expirationDate', 'policyExpiration', 'cancellationDate'])
    };
  }

  function normalizeProperty(profile, report) {
    const confirmation = propertyConfirmation(profile);
    return {
      available: Boolean(profile),
      address: propertyAddress(profile),
      yearBuilt: readPropertyField(profile, ['yearBuilt', 'year_built']),
      livingArea: readPropertyField(profile, ['squareFeet', 'livingArea', 'sqft']),
      stories: readPropertyField(profile, ['stories']),
      construction: readPropertyField(profile, ['constructionType', 'construction']),
      roof: readPropertyField(profile, ['roofType', 'roof', 'roofYear']),
      foundation: readPropertyField(profile, ['foundationType', 'foundation']),
      pool: readPropertyField(profile, ['pool', 'hasPool']),
      detachedStructures: readPropertyField(profile, ['detachedStructures', 'hasDetachedStructures']),
      coverage: normalizeCoverage(report, profile),
      quality: clone(profile?.quality) || null,
      confirmation,
      source: clone(profile)
    };
  }

  function buildDiagnostics(report, property, recommendations) {
    const warnings = [];
    if (!report) warnings.push('No saved Home report was found.');
    if (report && numberValue(report.score) == null) warnings.push('The saved report does not contain a numeric Protection Score.');
    if (report && fullName(report) === 'Not provided') warnings.push('Customer name is not available in the saved report.');
    if (report && !recommendations.length) warnings.push('No recommendation topics are available in the saved report.');
    if (report && !property.available) warnings.push('No Property Intelligence profile is available.');
    return {
      isReady: Boolean(report),
      hasReport: Boolean(report),
      hasProperty: property.available,
      recommendationCount: recommendations.length,
      warnings
    };
  }

  function getSnapshot(options) {
    const settings = options || {};
    const consultation = readConsultation(settings);
    const report = readReport(settings, consultation);
    if (!report || typeof report !== 'object' || !Object.keys(report).length) {
      return {
        schemaVersion: SCHEMA_VERSION,
        adapterVersion: VERSION,
        product: PRODUCT,
        state: 'empty',
        generatedAt: new Date().toISOString(),
        source: { reportKey: REPORT_KEY, propertyKey: PROPERTY_KEY, reportVersion: null, consultationId: null, storageMode: 'empty' },
        consultation: null,
        customer: { name: 'Not provided', firstName: '', lastName: '', email: '', phone: '', propertyAddress: '', reviewContext: '' },
        integration: { source: '', campaign: '', entry: '', sessionId: '', prefilled: false },
        entryContext: { occupationSegment: '', housingContext: '', closingDate: '', occupancy: '', closingUrgency: '', autoReview: null, rush: false, source: '', campaign: '', campaignId: '', campaignVariant: '', campaignZip: '', referralSource: '', partnerId: '', partnerName: '', entryMethod: '', entryPoint: '', launchSurface: '', medium: '', prefilled: false, sms: false },
        assessment: { createdAt: null, score: null, status: 'Review Summary', strongest: '', topPriority: '' },
        evidenceHandoff: { schemaVersion: '1.0', handoffVersion: '1.0.0', available: false, state: 'legacy', completionState: 'legacy', scoreIsFinal: true, scoreFormulaChanged: false, summary: { total: 0, confirmed: 0, verification: 0, unresolved: 0, followUp: 0 }, confirmedFacts: [], verificationItems: [], unresolvedQuestions: [], guardrail: 'Confirm assessment responses against the issued policy before making a recommendation.' },
        strengths: [],
        recommendations: [],
        property: normalizeProperty(readPropertyProfile(null, settings), null),
        executiveSummary: '',
        diagnostics: { isReady: false, hasReport: false, hasProperty: false, recommendationCount: 0, warnings: ['No saved Home report was found.'] }
      };
    }

    const property = normalizeProperty(readPropertyProfile(report, settings), report);
    const recommendations = recommendationSource(report).slice(0, 20).map(normalizeRecommendation);
    const evidenceHandoff = buildEvidenceHandoff(report);
    const strengths = Array.isArray(report.strengths) ? report.strengths.filter(Boolean).map(String) : [];
    const score = numberValue(report.score);
    const primaryTopic = recommendations[0]?.title || stringValue(report.topPriority, 'the customer’s current policy details');
    const primaryStrength = strengths[0] || stringValue(report.strongest, 'completion of a structured protection review');
    const executiveSummary = stringValue(report.executiveSummary) ||
      `Begin with ${primaryTopic}, while recognizing ${primaryStrength}. Use the consultation to confirm limits, deductibles, endorsements, exclusions, and current household details against the issued policy.`;

    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      adapterVersion: VERSION,
      product: stringValue(report.assessment, PRODUCT),
      state: 'ready',
      generatedAt: new Date().toISOString(),
      source: {
        reportKey: REPORT_KEY,
        propertyKey: PROPERTY_KEY,
        reportVersion: stringValue(report.version) || null,
        consultationId: stringValue(consultation?.id) || null,
        storageMode: consultation?.id ? 'consultation-record' : 'legacy-report'
      },
      consultation: consultation?.id ? {
        id: stringValue(consultation.id),
        status: stringValue(consultation.status, consultation?.remote?.status || 'ready'),
        createdAt: stringValue(consultation.createdAt || report.createdAt) || null,
        updatedAt: stringValue(consultation.updatedAt) || null,
        durable: true,
        remote: clone(consultation.remote) || null,
        recommendationPlan: clone(consultation?.remote?.recommendationPlan || consultation?.recommendationPlan) || null,
        completion: clone(consultation?.remote?.completion || consultation?.completion) || null,
        checklistProgress: clone(consultation?.checklistProgress || consultation?.remote?.checklistProgress) || null
      } : null,
      customer: {
        name: fullName(report),
        firstName: stringValue(report?.consumer?.firstName || report?.prospectProfile?.firstName || report?.profile?.firstName),
        lastName: stringValue(report?.consumer?.lastName || report?.prospectProfile?.lastName || report?.profile?.lastName),
        email: stringValue(report?.consumer?.email || report?.prospectProfile?.email || report?.profile?.email),
        phone: stringValue(report?.consumer?.phone || report?.prospectProfile?.phone || report?.profile?.phone),
        propertyAddress: stringValue(report?.consumer?.propertyAddress || report?.prospectProfile?.propertyAddress || property.address),
        reviewContext: stringValue(report?.consumer?.reviewContext || report?.reviewContext || report?.prospectProfile?.reviewContext)
      },
      integration: {
        source: stringValue(report?.integration?.source || report?.attribution?.source),
        campaign: stringValue(report?.integration?.campaign || report?.attribution?.campaign),
        entry: stringValue(report?.integration?.entry || report?.attribution?.entry),
        sessionId: stringValue(report?.integration?.sessionId || report?.attribution?.sessionId),
        prefilled: Boolean(report?.integration?.prefilled || report?.prospectProfile)
      },
      entryContext: buildEntryContext(report),
      assessment: {
        createdAt: stringValue(report.createdAt) || null,
        score,
        status: scoreStatus(score, report.status),
        strongest: primaryStrength,
        topPriority: primaryTopic,
        trigger: stringValue(report.trigger),
        categories: clone(report.categories) || {},
        methodology: clone(report.scoreMethodology) || null,
        scoreDiagnostics: clone(report.scoreDiagnostics) || null,
        completion: clone(report.assessmentCompletion) || null
      },
      strengths,
      recommendations,
      evidenceHandoff,
      property,
      executiveSummary,
      attribution: clone(report.attribution),
      diagnostics: null
    };
    snapshot.diagnostics = buildDiagnostics(report, property, recommendations);
    return snapshot;
  }

  function listConsultations(options) {
    const api = consultationApi();
    if (!api || typeof api.list !== 'function') return [];
    return api.list({ storage: options?.storage || root.localStorage });
  }

  function getConsultation(id, options) {
    const api = consultationApi();
    if (!api || typeof api.get !== 'function') return null;
    return api.get(stringValue(id), { storage: options?.storage || root.localStorage });
  }

  function selectConsultation(id, options) {
    const settings = options || {};
    const api = consultationApi();
    if (!api || typeof api.select !== 'function') return null;
    const targetStorage = settings.storage || root.localStorage;
    const record = api.select(id, { storage: targetStorage, dispatch: false });
    if (!record) return null;
    if (settings.mirrorLegacy !== false && record.report) {
      try { targetStorage?.setItem?.(REPORT_KEY, JSON.stringify(record.report)); } catch (_) {}
    }
    if (settings.dispatch !== false && root.dispatchEvent && root.CustomEvent) {
      root.dispatchEvent(new root.CustomEvent('coveragefit:workspace-data-refresh', {
        detail: { reason: 'consultation-selected', consultationId: record.id }
      }));
    }
    return clone(record);
  }

  function subscribe(callback) {
    if (typeof callback !== 'function' || !root.addEventListener) return function () {};
    const handler = event => {
      if (!event || event.key === REPORT_KEY || event.key === PROPERTY_KEY || event.key === CONSULTATION_STORE_KEY || event.key === CONSULTATION_ACTIVE_KEY || event.type === 'coveragefit:workspace-data-refresh' || event.type === 'coveragefit:consultation-record-created' || event.type === 'coveragefit:consultation-record-selected' || event.type === 'coveragefit:consultation-record-updated') {
        callback(getSnapshot(), event);
      }
    };
    root.addEventListener('storage', handler);
    root.addEventListener('coveragefit:workspace-data-refresh', handler);
    root.addEventListener('coveragefit:consultation-record-created', handler);
    root.addEventListener('coveragefit:consultation-record-selected', handler);
    root.addEventListener('coveragefit:consultation-record-updated', handler);
    return function unsubscribe() {
      root.removeEventListener('storage', handler);
      root.removeEventListener('coveragefit:workspace-data-refresh', handler);
      root.removeEventListener('coveragefit:consultation-record-created', handler);
      root.removeEventListener('coveragefit:consultation-record-selected', handler);
      root.removeEventListener('coveragefit:consultation-record-updated', handler);
    };
  }


  function updateConsultationDisposition(id, disposition, options) {
    const settings = options || {};
    const api = consultationApi();
    if (!api || typeof api.updateDisposition !== 'function') return null;
    const updated = api.updateDisposition(id, disposition, {
      storage: settings.storage || root.localStorage,
      dispatch: false
    });
    if (updated && settings.dispatch !== false && root.dispatchEvent && root.CustomEvent) {
      root.dispatchEvent(new root.CustomEvent('coveragefit:workspace-data-refresh', {
        detail: { reason: 'consultation-disposition-updated', consultationId: updated.id }
      }));
    }
    return clone(updated);
  }

  function updateConsultationRecommendationPlan(id, recommendationPlan, options) {
    const settings = options || {};
    const api = consultationApi();
    if (!api || typeof api.updateRecommendationPlan !== 'function') return null;
    const updated = api.updateRecommendationPlan(id, recommendationPlan, {
      storage: settings.storage || root.localStorage,
      dispatch: false
    });
    if (updated && settings.dispatch !== false && root.dispatchEvent && root.CustomEvent) {
      root.dispatchEvent(new root.CustomEvent('coveragefit:workspace-data-refresh', {
        detail: { reason: 'consultation-recommendation-plan-updated', consultationId: updated.id }
      }));
    }
    return clone(updated);
  }

  function updateConsultationCompletion(id, completion, options) {
    const settings = options || {};
    const api = consultationApi();
    if (!api || typeof api.updateCompletion !== 'function') return null;
    const updated = api.updateCompletion(id, completion, {
      storage: settings.storage || root.localStorage,
      dispatch: false
    });
    if (updated && settings.dispatch !== false && root.dispatchEvent && root.CustomEvent) {
      root.dispatchEvent(new root.CustomEvent('coveragefit:workspace-data-refresh', {
        detail: { reason: 'consultation-completion-updated', consultationId: updated.id }
      }));
    }
    return clone(updated);
  }

  function updateConsultationChecklistProgress(id, checklistProgress, options) {
    const settings = options || {};
    const api = consultationApi();
    if (!api || typeof api.updateChecklistProgress !== 'function') return null;
    const updated = api.updateChecklistProgress(id, checklistProgress, {
      storage: settings.storage || root.localStorage,
      dispatch: false
    });
    if (updated && settings.dispatch !== false && root.dispatchEvent && root.CustomEvent) {
      root.dispatchEvent(new root.CustomEvent('coveragefit:workspace-data-refresh', {
        detail: { reason: 'consultation-checklist-progress-updated', consultationId: updated.id }
      }));
    }
    return clone(updated);
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    REPORT_KEY,
    PROPERTY_KEY,
    CONSULTATION_STORE_KEY,
    CONSULTATION_ACTIVE_KEY,
    getSnapshot,
    listConsultations,
    getConsultation,
    selectConsultation,
    updateConsultationDisposition,
    updateConsultationRecommendationPlan,
    updateConsultationCompletion,
    updateConsultationChecklistProgress,
    subscribe
  });
});
