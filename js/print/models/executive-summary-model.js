(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../consumer-language.js'));
  } else {
    root.CoverageFitExecutiveSummaryModel = factory(root.CoverageFitConsumerLanguage);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (consumerLanguage) {
  'use strict';

  const VERSION = '1.4.0';
  const SCHEMA_VERSION = 1;

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

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function finiteNumber(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function uniqueStrings(values, limit) {
    const seen = new Set();
    const result = [];
    (Array.isArray(values) ? values : []).forEach(value => {
      const normalized = text(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    });
    return typeof limit === 'number' ? result.slice(0, limit) : result;
  }

  function recommendationPriority(item) {
    return text(item?.title || item?.summary || item?.question);
  }

  function buildPriorities(printModel) {
    const shared = Array.isArray(printModel?.consultationContext?.producerConsumerStory?.priorities)
      ? printModel.consultationContext.producerConsumerStory.priorities.map(item => text(item?.title))
      : [];
    const recommendations = Array.isArray(printModel?.recommendations) ? printModel.recommendations : [];
    const candidates = [...shared, ...recommendations.map(recommendationPriority)];
    candidates.push(printModel?.assessment?.topPriority);
    return uniqueStrings(candidates, 3);
  }

  function cleanPriority(value) {
    return text(value).replace(/^(review|confirm|discuss|evaluate|consider)\s+/i, '').replace(/[.]+$/, '');
  }

  function buildNextSteps(printModel, priorities) {
    const steps = priorities.map(priority => {
      const topic = cleanPriority(priority);
      return topic ? `Discuss ${topic} and confirm what the current policy says.` : '';
    });
    const nextAction = text(printModel?.consultationContext?.nextAction);
    if (nextAction) steps.unshift(nextAction);
    return uniqueStrings(steps, 3);
  }

  function buildOverview(printModel, priorities, strengths, missingInformation, nextSteps) {
    const sharedStory = printModel?.consultationContext?.producerConsumerStory || {};
    const sourceReviewPurpose = text(sharedStory?.review?.reason, text(printModel?.consultationContext?.reviewReason));
    const sourcePriority = text(priorities[0] || printModel?.assessment?.topPriority);
    const strongestArea = text(strengths[0] || printModel?.assessment?.strongest);
    const reviewPurpose = sourceReviewPurpose || 'General home protection review';
    const firstPriority = sourcePriority || 'Review what the current policy says';
    const sourceSummary = text(printModel?.executiveSummary);
    const hasReviewContent = Boolean(sourceReviewPurpose || sourcePriority || strongestArea);
    const summary = sourceSummary || (hasReviewContent
      ? `This review brings the homeowner's current protection details into one place. The first focus is ${firstPriority}. Any open details should be confirmed before a recommendation is made.`
      : '');
    const confirmationCount = missingInformation.length;
    const confirmationSummary = confirmationCount
      ? `${confirmationCount} detail${confirmationCount === 1 ? '' : 's'} still need${confirmationCount === 1 ? 's' : ''} to be confirmed before a recommendation is made.`
      : 'The submitted review did not identify any major missing details.';

    return {
      reviewPurpose,
      summary,
      strongestArea,
      firstPriority,
      confirmationCount,
      confirmationSummary,
      nextAction: text(sharedStory?.nextAction?.title, text(nextSteps[0], 'Review the priority topics, confirm what the current policy says, and record the agreed next step.')),
      storyKind: text(sharedStory?.review?.kind, 'homeowner'),
      storyNarrative: text(sharedStory?.review?.narrative)
    };
  }

  function create(printModel) {
    const source = printModel && typeof printModel === 'object' ? printModel : {};
    const priorities = buildPriorities(source);
    const strengths = uniqueStrings(source.strengths, 3);
    const sharedDetails = Array.isArray(source.consultationContext?.producerConsumerStory?.verification?.detailsToConfirm)
      ? source.consultationContext.producerConsumerStory.verification.detailsToConfirm.map(item => text(item?.title))
      : [];
    const legacyDetails = Array.isArray(source.consultationContext?.missingInformation) ? source.consultationContext.missingInformation : [];
    const missingInformation = uniqueStrings([...sharedDetails, ...legacyDetails], 5);
    const nextSteps = buildNextSteps(source, priorities);
    const score = finiteNumber(source.assessment?.score);
    const overview = buildOverview(source, priorities, strengths, missingInformation, nextSteps);
    const model = {
      schemaVersion: SCHEMA_VERSION,
      modelVersion: VERSION,
      client: {
        name: text(source.customer?.name),
        email: text(source.customer?.email),
        phone: text(source.customer?.phone)
      },
      property: {
        address: text(source.propertySummary?.address),
        available: Boolean(source.propertySummary?.available)
      },
      contact: {
        email: text(source.customer?.email),
        phone: text(source.customer?.phone)
      },
      reviewReason: overview.reviewPurpose,
      missingInformation,
      consultation: {
        title: text(source.metadata?.title, 'CoverageFit Consultation'),
        date: text(source.metadata?.consultationDate || source.generatedAt),
        preparedBy: text(source.metadata?.preparedBy),
        agency: text(source.metadata?.agency),
        product: text(source.metadata?.product)
      },
      protectionScore: {
        value: score,
        status: text(source.assessment?.status),
        strongestArea: text(source.assessment?.strongest),
        topPriority: text(source.assessment?.topPriority)
      },
      summary: overview.summary,
      strengths,
      priorities,
      nextSteps,
      overview,
      producerConsumerStory: clone(source.consultationContext?.producerConsumerStory),
      source: {
        printSchemaVersion: source.schemaVersion ?? null,
        printEngineVersion: text(source.engineVersion),
        generatedAt: text(source.generatedAt)
      }
    };
    return deepFreeze(model);
  }

  function hasContent(model) {
    if (!model || typeof model !== 'object') return false;
    return Boolean(
      text(model.client?.name) ||
      text(model.property?.address) ||
      finiteNumber(model.protectionScore?.value) != null ||
      text(model.summary) ||
      (Array.isArray(model.priorities) && model.priorities.length)
    );
  }

  function getDiagnostics(model) {
    const warnings = [];
    if (!text(model?.client?.name)) warnings.push('Client name is unavailable.');
    if (!text(model?.property?.address)) warnings.push('Property address is unavailable.');
    if (finiteNumber(model?.protectionScore?.value) == null) warnings.push('Protection Score is unavailable.');
    if (!text(model?.consultation?.date)) warnings.push('Consultation date is unavailable.');
    if (!text(model?.consultation?.preparedBy)) warnings.push('Prepared-by name is unavailable.');
    return deepFreeze({
      valid: hasContent(model),
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      warningCount: warnings.length,
      warnings
    });
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    create,
    hasContent,
    getDiagnostics
  });
});
