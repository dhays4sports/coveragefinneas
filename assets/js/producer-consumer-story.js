(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./consultation-command-center.js'),
      require('./recommendation-builder.js'),
      require('./consultation-completion.js')
    );
  } else {
    root.CoverageFitProducerConsumerStory = factory(
      root.CoverageFitConsultationCommandCenter,
      root.CoverageFitRecommendationBuilder,
      root.CoverageFitConsultationCompletion
    );
  }
})(typeof window !== 'undefined' ? window : globalThis, function (commandCenter, recommendationBuilder, consultationCompletion) {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = '1.0';

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback || '';
  }

  function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function uniqueItems(values, limit) {
    const seen = new Set();
    const result = [];
    list(values).forEach((item, index) => {
      const title = text(item?.title || item);
      const key = title.toLowerCase();
      if (!title || seen.has(key)) return;
      seen.add(key);
      result.push({
        id: text(item?.id, `shared-detail-${index + 1}`),
        title,
        detail: text(item?.detail || item?.question),
        kind: text(item?.kind, 'detail'),
        label: text(item?.label, 'Confirm')
      });
    });
    return result.slice(0, limit || 6);
  }

  function missingInformation(snapshot) {
    const missing = [];
    const customer = snapshot?.customer || {};
    const coverage = snapshot?.property?.coverage || {};
    if (!text(customer.phone)) missing.push('Homeowner phone number');
    if (!text(customer.email)) missing.push('Homeowner email address');
    if (!text(snapshot?.property?.address)) missing.push('Confirmed property address');
    if (coverage.replacementCost == null || coverage.replacementCost === '') missing.push('Current estimated rebuilding amount');
    if (coverage.deductible == null || coverage.deductible === '') missing.push('Current property deductible');
    if (!text(coverage.currentCarrier)) missing.push('Current insurance company');
    if (coverage.currentPremium == null || coverage.currentPremium === '') missing.push('Current annual policy cost');
    if (!text(coverage.renewalDate)) missing.push('Next policy date');
    return missing.slice(0, 6);
  }

  function recordValue(record, key) {
    if (record?.remote && record.remote[key] != null) return record.remote[key];
    return record?.[key];
  }

  function build(snapshot, record, options) {
    const settings = options || {};
    if (!commandCenter || typeof commandCenter.build !== 'function') throw new Error('CoverageFit Consultation Command Center is required.');
    if (!recommendationBuilder || typeof recommendationBuilder.build !== 'function') throw new Error('CoverageFit Recommendation Builder is required.');
    if (!consultationCompletion || typeof consultationCompletion.build !== 'function') throw new Error('CoverageFit Consultation Completion is required.');

    const disposition = recordValue(record, 'disposition') || {};
    const stage = text(settings.stage, text(disposition.stage, 'review_received'));
    const command = commandCenter.build(snapshot, { stage, checklist: settings.checklist || null });
    const savedPlan = recordValue(record, 'recommendationPlan') || snapshot?.consultation?.recommendationPlan || null;
    const recommendationPlan = recommendationBuilder.build(snapshot, savedPlan);
    const completion = consultationCompletion.build(snapshot, record, settings.completionDraft);
    const recommendationByFinding = new Map(list(recommendationPlan?.items).map(item => [text(item?.findingId), item]).filter(([id]) => id));

    const priorities = list(command.priorities).map((item, index) => {
      const recommendation = recommendationByFinding.get(text(item.id)) || {};
      return {
        id: text(item.id, `shared-priority-${index + 1}`),
        rank: index + 1,
        sequenceLabel: text(item.sequenceLabel, index === 0 ? 'Discuss first' : 'Discuss next'),
        title: text(item.title, 'Protection topic'),
        detail: text(item.detail),
        rationale: text(item.rationale),
        actionLabel: text(item.actionLabel, 'Discuss finding'),
        priority: text(item.priority, 'Review topic'),
        findingType: text(item.findingType, 'review-topic'),
        evidenceQuality: text(item.evidenceQuality, 'confirmed'),
        recommendation: {
          state: text(recommendation.decision, 'undecided'),
          label: text(recommendation.decisionLabel, 'Not decided'),
          verified: recommendation.verified === true,
          reason: text(recommendation.producerReason)
        }
      };
    });

    const missing = missingInformation(snapshot).map((title, index) => ({
      id: `shared-missing-${index + 1}`,
      title,
      kind: 'missing',
      label: 'Confirm'
    }));
    const detailsToConfirm = uniqueItems([...list(command.verify), ...missing], 6);
    const completionValue = completion?.completion || {};
    const complete = completion?.status === 'complete' && Boolean(text(completionValue.nextAction));
    const nextAction = complete ? {
      state: 'agreed',
      label: 'Agreed next step',
      title: text(completionValue.nextAction),
      detail: 'Saved in the consultation summary.'
    } : {
      state: 'working',
      label: text(command.action?.eyebrow, 'Next action'),
      title: text(command.action?.title, 'Continue the consultation'),
      detail: text(command.action?.detail)
    };
    const verification = command.verification || {};

    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      version: VERSION,
      consultationId: text(snapshot?.consultation?.id, text(record?.id)),
      identity: {
        name: text(command.who?.name, 'Homeowner name not provided'),
        property: text(command.who?.property, 'Property address not provided')
      },
      review: {
        reason: text(command.why?.reason, 'Review reason not provided'),
        reasonDetail: text(command.why?.detail),
        kind: text(command.story?.kind, 'homeowner'),
        narrative: text(command.story?.narrative),
        note: text(command.story?.note)
      },
      status: {
        stage: text(command.status?.stage, stage),
        label: text(command.status?.label, 'Review received'),
        detail: text(command.status?.detail)
      },
      priorities,
      verification: {
        state: text(verification.state, 'legacy'),
        knownCount: Number(verification.knownCount || 0),
        inferredCount: Number(verification.inferredCount || 0),
        missingCount: Number(verification.missingCount || 0),
        confirmationCount: Number(verification.confirmationCount || 0),
        reviewCount: Number(verification.reviewCount || 0),
        detailsToConfirm,
        guardrail: text(verification.guardrail, text(command.guardrail))
      },
      recommendations: {
        state: text(recommendationPlan?.state, 'not-started'),
        summary: recommendationPlan?.summary || {},
        items: list(recommendationPlan?.items).map(item => ({
          findingId: text(item?.findingId),
          title: text(item?.title, 'Protection topic'),
          decision: text(item?.decision, 'undecided'),
          decisionLabel: text(item?.decisionLabel, 'Not decided'),
          verified: item?.verified === true,
          producerReason: text(item?.producerReason)
        }))
      },
      completion,
      nextAction,
      consistency: {
        source: 'coveragefit-producer-consumer-story',
        immutable: true,
        prioritySource: 'consultation-command-center',
        recommendationSource: 'recommendation-builder',
        completionSource: 'consultation-completion'
      }
    });
  }

  function getDiagnostics(model) {
    const warnings = [];
    if (!text(model?.review?.reason)) warnings.push('Review reason is unavailable.');
    if (!list(model?.priorities).length) warnings.push('No shared priority findings are available.');
    if (!text(model?.nextAction?.title)) warnings.push('No shared next action is available.');
    return deepFreeze({
      valid: Boolean(model && text(model.identity?.name) && text(model.review?.reason)),
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      warningCount: warnings.length,
      warnings
    });
  }

  return Object.freeze({ VERSION, SCHEMA_VERSION, build, missingInformation, getDiagnostics });
});
