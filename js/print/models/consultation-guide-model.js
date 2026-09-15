(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./recommendation-model.js'), require('../consumer-language.js'));
  else root.CoverageFitConsultationGuideModel = factory(root.CoverageFitRecommendationModel, root.CoverageFitConsumerLanguage);
})(typeof window !== 'undefined' ? window : globalThis, function (recommendationModel, consumerLanguage) {
  'use strict';

  if (!recommendationModel || typeof recommendationModel.create !== 'function') throw new Error('CoverageFit Recommendation Model is required.');

  const VERSION = '1.5.0';
  const SCHEMA_VERSION = 1;
  const STAGE_LABELS = Object.freeze({
    review_received: 'Review received',
    contact_attempted: 'Contact attempted',
    consultation_scheduled: 'Consultation scheduled',
    consultation_completed: 'Consultation completed',
    proposal_prepared: 'Quote or proposal prepared',
    decision_pending: 'Decision pending',
    closed: 'Closed'
  });
  const OUTCOME_LABELS = Object.freeze({
    none: '',
    policy_bound: 'Policy started',
    current_carrier_retained: 'Stayed with current insurance company',
    declined_price: 'Declined because of price',
    declined_coverage: 'Decided against the coverage option',
    unable_to_reach: 'Unable to reach',
    not_eligible: 'Insurance company did not offer the option or it was not a fit',
    deferred: 'Deferred or future review'
  });

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }
  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }
  function list(value) { return Array.isArray(value) ? value : []; }
  function readerText(value, fallback) {
    const source = text(value, fallback);
    return typeof consumerLanguage?.simplifySystemText === 'function'
      ? consumerLanguage.simplifySystemText(source)
      : source;
  }
  function unique(values, limit) {
    const seen = new Set();
    const result = [];
    list(values).forEach(value => {
      const normalized = text(value);
      if (!normalized || seen.has(normalized.toLowerCase())) return;
      seen.add(normalized.toLowerCase());
      result.push(normalized);
    });
    return typeof limit === 'number' ? result.slice(0, limit) : result;
  }
  function key(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function related(item, recommendation) {
    const recommendationId = text(recommendation?.id);
    const ids = unique([...(item?.sourceIds || []), ...(item?.recommendationIds || []), item?.sourceItemId]);
    if (recommendationId && ids.includes(recommendationId)) return true;
    const left = key(item?.title);
    const right = key(recommendation?.title);
    return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
  }
  function evidenceGuidance(value) {
    const quality = text(value, 'confirmed').toLowerCase();
    if (quality === 'needs-verification') return { actionLabel: 'Check the policy', instruction: 'Confirm what the current policy says before presenting this as a confirmed policy detail.' };
    if (quality === 'missing' || quality === 'partial') return { actionLabel: 'Confirm together', instruction: 'Confirm the missing homeowner detail before making a recommendation.' };
    return { actionLabel: 'Discuss and confirm', instruction: 'Use the saved answer to begin the discussion, then confirm anything specific to the current policy.' };
  }
  function priorityReason(priority, index) {
    const normalized = text(priority, 'Review').toLowerCase();
    if (normalized === 'critical' || normalized === 'high') return 'This is one of the most important home protection topics to discuss.';
    if (index === 0) return 'This is the first remaining topic to discuss from the saved review.';
    return 'This topic follows the more urgent items in the saved review.';
  }
  function sequenceLabel(index) {
    if (index === 0) return 'Address first';
    if (index === 1) return 'Discuss next';
    return 'Also review';
  }
  function meaningfulRecommendation(item) {
    return Boolean(item && text(item.title) && (text(item.explanation || item.summary) || text(item.question || item.conversationStarter) || text(item.producerNotes) || list(item.evidence).length));
  }
  function orderedRecommendations(source, sharedStory) {
    const candidates = list(source?.recommendations).filter(meaningfulRecommendation);
    if (!candidates.length) return [];
    const ranked = recommendationModel.create({ recommendations: candidates }).recommendations;
    const fallback = ranked.map(item => candidates[item.sourceIndex]).filter(Boolean);
    const byId = new Map(candidates.map(item => [text(item?.id), item]).filter(([id]) => id));
    const byTitle = new Map(candidates.map(item => [normalized(item?.title), item]).filter(([title]) => title));
    const ordered = list(sharedStory?.priorities).map(item => byId.get(text(item?.id)) || byTitle.get(normalized(item?.title))).filter(Boolean);
    return [...new Set([...ordered, ...fallback])];
  }
  function normalized(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function relatedGuidanceItem(items, recommendation) {
    const values = list(items);
    const id = text(recommendation?.id);
    const title = normalized(recommendation?.title);
    return values.find(item => id && [item?.findingId, item?.id].map(text).includes(id)) ||
      values.find(item => title && normalized(item?.title) === title) || {};
  }
  function recommendationStatus(planItem) {
    const decision = text(planItem?.decision, 'undecided').toLowerCase();
    const labels = {
      undecided: 'No recommendation recorded',
      consider: 'Discuss / consider',
      recommend: 'Include in formal insurance quote',
      defer: 'Deferred',
      not_recommended: 'Not recommended after review'
    };
    return { state: Object.prototype.hasOwnProperty.call(labels, decision) ? decision : 'undecided', label: labels[decision] || labels.undecided };
  }
  function recommendationReason(status, planItem) {
    const recorded = text(planItem?.producerReason);
    if (recorded) return recorded;
    if (status.state === 'consider') return 'This topic remains under consideration while the homeowner’s preferences and available options are compared.';
    if (status.state === 'recommend') return 'The licensed producer marked this confirmed topic to include in a formal insurance quote. The insurance company still decides the available options and final terms.';
    if (status.state === 'defer') return 'This topic was set aside for now and should be revisited at the recorded follow-up.';
    if (status.state === 'not_recommended') return 'The licensed producer did not include this topic in the current recommendation after the review.';
    return 'No recommendation has been recorded yet. Confirm the open details and discuss the homeowner’s priorities first.';
  }
  function generalMeaning() { return 'The assessment identified a home protection detail worth discussing. It does not by itself determine what the policy covers.'; }
  function generalImportance() { return 'Understanding the homeowner’s needs and what the current policy says helps determine whether any change is worth considering.'; }
  function explanationModel(recommendation, planItem, assistanceItem, confirmation) {
    const status = recommendationStatus(planItem);
    const verified = planItem?.verified === true;
    return {
      status: status.state,
      statusLabel: status.label,
      verified,
      verificationLabel: verified ? 'Confirmed for discussion' : 'Needs confirmation',
      meaning: readerText(assistanceItem?.whatItMeans, generalMeaning()),
      importance: readerText(assistanceItem?.whyItMatters, generalImportance()),
      reason: recommendationReason(status, planItem),
      reasonLabel: status.state === 'undecided' ? 'What happens before a recommendation' : 'Why this decision was recorded',
      confirmation: unique([...(assistanceItem?.verification || []), ...confirmation].map(value => readerText(value)), 4),
      guardrail: consumerLanguage?.FINAL_TERMS || 'The insurance company decides which options are available, what they cost, and the final policy terms. The formal quote and issued policy are the official sources.'
    };
  }
  function topicModel(recommendation, index, timelineItems, checklistItems, recommendationPlan, explanationAssist, sharedPriority) {
    const planItem = timelineItems.find(item => related(item, recommendation)) || {};
    const checklistItem = checklistItems.find(item => related(item, recommendation)) || {};
    const evidence = unique([
      ...list(recommendation?.evidence),
      ...list(planItem?.evidence),
      ...list(checklistItem?.evidence)
    ], 3);
    const confirm = unique([
      recommendation?.evidencePrompt,
      checklistItem?.evidencePrompt,
      planItem?.evidencePrompt,
      checklistItem?.description,
      checklistItem?.coachingNote,
      planItem?.coachingNote,
      ...evidence
    ], 3);
    const priority = text(recommendation?.priority, text(checklistItem?.priority, 'Review'));
    const evidenceQuality = text(recommendation?.evidenceQuality, text(planItem?.evidenceQuality || checklistItem?.evidenceQuality, 'confirmed'));
    const guidance = evidenceGuidance(evidenceQuality);
    const recommendationPlanItem = relatedGuidanceItem(recommendationPlan?.items, recommendation);
    const assistanceItem = relatedGuidanceItem(explanationAssist?.items, recommendation);
    const explanation = explanationModel(recommendation, recommendationPlanItem, assistanceItem, confirm);
    return {
      id: text(recommendation?.id, `guide-topic-${index + 1}`),
      order: index + 1,
      sequenceLabel: text(sharedPriority?.sequenceLabel, sequenceLabel(index)),
      title: text(recommendation?.title, text(planItem?.title, 'Coverage review topic')),
      priority,
      priorityReason: text(sharedPriority?.rationale, priorityReason(priority, index)),
      category: text(recommendation?.category),
      discovered: readerText(recommendation?.explanation || recommendation?.summary, text(planItem?.objective, 'The submitted review identified this as a topic worth confirming.')),
      question: readerText(recommendation?.conversationStarter || recommendation?.question, text(planItem?.prompt || checklistItem?.prompt, 'How does the current policy address this, and what would the homeowner prefer going forward?')),
      direction: readerText(recommendation?.producerNotes, text(planItem?.coachingNote || checklistItem?.coachingNote, 'Confirm the current limits, deductible, added policy options, what the policy does not cover, and the homeowner’s preference before making a recommendation.')),
      evidenceQuality,
      evidenceLabel: text(recommendation?.evidenceLabel, text(planItem?.evidenceLabel || checklistItem?.evidenceLabel, 'Clear response captured')),
      actionLabel: text(sharedPriority?.actionLabel, guidance.actionLabel),
      evidenceInstruction: guidance.instruction,
      evidencePrompt: readerText(recommendation?.evidencePrompt, text(planItem?.evidencePrompt || checklistItem?.evidencePrompt)),
      answerLabel: text(recommendation?.answerLabel, text(planItem?.answerLabel || checklistItem?.answerLabel)),
      confirm: explanation.confirmation,
      recommendation: explanation
    };
  }
  function fallbackTopics(timelineItems) {
    return timelineItems
      .filter(item => text(item?.type) === 'recommendation-topic')
      .slice(0, 3)
      .map((item, index) => topicModel({ id: item.id, title: item.title, summary: item.objective, question: item.prompt, producerNotes: item.coachingNote, sourceIds: item.sourceIds }, index, timelineItems, []));
  }
  function handoffItems(value, limit) {
    return list(value).map((item, index) => ({
      id: text(item?.id || item?.key, `handoff-${index + 1}`),
      key: text(item?.key),
      title: text(item?.title, 'Assessment response'),
      answer: text(item?.answer),
      statement: text(item?.statement, [text(item?.title), text(item?.answer)].filter(Boolean).join(': ')),
      question: text(item?.question),
      evidenceQuality: text(item?.evidenceQuality, 'confirmed'),
      evidenceLabel: text(item?.evidenceLabel),
      category: text(item?.category)
    })).slice(0, limit);
  }

  function evidenceHandoffModel(source, context) {
    const handoff = source?.evidenceHandoff || context?.evidenceHandoff || {};
    const summary = handoff.summary || {};
    return {
      available: Boolean(handoff.available),
      state: text(handoff.state, handoff.available ? 'ready' : 'legacy'),
      summary: {
        total: Number(summary.total || 0),
        confirmed: Number(summary.confirmed || 0),
        verification: Number(summary.verification || 0),
        unresolved: Number(summary.unresolved || 0),
        followUp: Number(summary.followUp || 0)
      },
      confirmedFacts: handoffItems(handoff.confirmedFacts, 4),
      verificationItems: handoffItems(handoff.verificationItems, 4),
      unresolvedQuestions: handoffItems(handoff.unresolvedQuestions, 4),
      guardrail: consumerLanguage?.POLICY_CHECK || 'Confirm reported policy details against the current policy summary and issued policy before making a recommendation.'
    };
  }

  function completionModel(context, legacyDecisions, legacyNextAction, missingInformation) {
    const source = context?.consultationCompletion && typeof context.consultationCompletion === 'object'
      ? context.consultationCompletion : {};
    const value = source?.completion && typeof source.completion === 'object' ? source.completion : {};
    const complete = text(source.status, text(value.state, 'draft')) === 'complete' && Boolean(text(value.decisionSummary) && text(value.nextAction));
    const unresolvedState = complete && text(value.unresolvedState) === 'none' ? 'none' : 'open';
    const quoteState = ['not_requested', 'ready', 'needs_items', 'requested'].includes(text(value.quoteState)) ? text(value.quoteState) : 'not_requested';
    const quoteLabels = {
      not_requested: 'No formal insurance quote requested',
      ready: 'Ready to prepare',
      needs_items: 'Needs information or documents',
      requested: 'Formal insurance quote requested'
    };
    const quoteDetails = {
      not_requested: 'No formal insurance quote was requested in the saved consultation summary.',
      ready: 'The licensed producer recorded that a formal insurance quote is ready to be prepared.',
      needs_items: text(value.quoteRequirements, 'The formal insurance quote still needs information or documents.'),
      requested: text(value.quoteRequirements, 'The licensed producer recorded that a formal insurance quote has been requested.')
    };
    const recommendationDecisions = list(source.decisions).map((item, index) => ({
      id: text(item?.id, `completion-decision-${index + 1}`),
      title: text(item?.title, 'Protection topic'),
      state: text(item?.decision, 'undecided'),
      label: text(item?.label, 'Not decided'),
      verified: item?.verified === true,
      verificationLabel: item?.verified === true ? 'Confirmed' : 'Needs confirmation'
    })).slice(0, 5);
    const followUp = source.followUp && typeof source.followUp === 'object' ? source.followUp : context?.followUp || {};
    return {
      state: complete ? 'complete' : 'draft',
      statusLabel: complete ? 'Consultation summary saved' : 'Consultation summary not yet saved',
      recordedAt: complete ? text(value.updatedAt, text(value.completedAt)) : '',
      decision: {
        available: complete,
        summary: complete ? text(value.decisionSummary) : 'The homeowner’s decisions have not yet been recorded in the consultation summary.'
      },
      unresolved: {
        state: complete ? unresolvedState : 'draft',
        label: complete ? (unresolvedState === 'none' ? 'Nothing remains open' : 'Items remain open') : 'Not yet recorded',
        summary: complete
          ? (unresolvedState === 'none' ? 'The saved consultation summary does not list any open policy, home, document, or homeowner-decision items.' : text(value.unresolvedSummary, 'Open items remain and should be recorded before the consultation is marked complete.'))
          : 'Save the consultation summary before treating any open work as resolved.'
      },
      quote: {
        state: complete ? quoteState : 'draft',
        label: complete ? quoteLabels[quoteState] : 'Not yet recorded',
        summary: complete ? quoteDetails[quoteState] : 'Formal insurance quote status has not yet been recorded.'
      },
      nextAction: {
        available: complete,
        summary: complete ? text(value.nextAction) : text(legacyNextAction, 'Record the agreed next action, who will handle it, and when.'),
        label: complete ? 'Agreed next step' : 'Possible next step'
      },
      recommendationDecisions,
      evidence: {
        openCount: Number(source?.evidence?.openCount || 0),
        findingOpenCount: Number(source?.evidence?.findingOpenCount || 0)
      },
      followUp: {
        state: text(followUp.state, 'none'),
        dueDate: text(followUp.dueDate),
        note: text(followUp.note)
      },
      workingDecisions: complete ? [] : unique(legacyDecisions, 4),
      workingMissingInformation: complete ? [] : unique(missingInformation, 5),
      guardrail: consumerLanguage?.FINAL_TERMS || 'The insurance company decides which options are available, what they cost, and the final policy terms. The formal quote and issued policy are the official sources.'
    };
  }

  function create(printModel) {
    const source = printModel && typeof printModel === 'object' ? printModel : {};
    const context = source.consultationContext || {};
    const producerConsumerStory = context.producerConsumerStory || {};
    const evidenceHandoff = evidenceHandoffModel(source, context);
    const timelineItems = list(source.timeline?.items);
    const checklistItems = list(source.consultationChecklist?.items);
    const recommendations = orderedRecommendations(source, producerConsumerStory);
    const sharedPriorities = list(producerConsumerStory?.priorities);
    const topics = recommendations.length
      ? recommendations.slice(0, 3).map((item, index) => {
          const sharedPriority = sharedPriorities.find(priority => text(priority?.id) === text(item?.id)) ||
            sharedPriorities.find(priority => normalized(priority?.title) === normalized(item?.title));
          return topicModel(item, index, timelineItems, checklistItems, context.recommendationPlan, context.explanationAssist, sharedPriority);
        })
      : fallbackTopics(timelineItems);
    const decisions = unique([
      ...list(context.decisions),
      text(context.dispositionNote),
      OUTCOME_LABELS[text(context.outcome, 'none')] || ''
    ], 4);
    const followUp = context.followUp || {};
    const missingInformation = unique(context.missingInformation, 5);
    const nextAction = text(context.nextAction);
    const completion = completionModel({
      ...context,
      consultationCompletion: producerConsumerStory?.completion || context.consultationCompletion
    }, decisions, nextAction, missingInformation);
    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      modelVersion: VERSION,
      customer: {
        name: text(source.customer?.name, 'Homeowner'),
        email: text(source.customer?.email),
        phone: text(source.customer?.phone)
      },
      propertyAddress: text(source.propertySummary?.address),
      reviewReason: text(producerConsumerStory?.review?.reason, text(context.reviewReason, 'General home protection review')),
      story: {
        kind: text(producerConsumerStory?.review?.kind, 'homeowner'),
        narrative: text(producerConsumerStory?.review?.narrative),
        source: text(producerConsumerStory?.consistency?.source, 'legacy-print-model')
      },
      evidenceHandoff,
      stage: text(producerConsumerStory?.status?.label, text(STAGE_LABELS[text(context.stage)], 'Review received')),
      outcome: text(OUTCOME_LABELS[text(context.outcome, 'none')]),
      followUp: {
        state: text(followUp.state, 'none'),
        dueDate: text(followUp.dueDate),
        note: text(followUp.note)
      },
      topics,
      findingCount: topics.length,
      additionalFindingCount: Math.max(0, recommendations.length - topics.length),
      decisions,
      nextAction,
      missingInformation,
      completion,
      producerConsumerStory: clone(producerConsumerStory),
      source: {
        generatedAt: text(source.generatedAt),
        printEngineVersion: text(source.engineVersion),
        rawContext: clone(context)
      }
    });
  }
  function hasContent(model) { return Boolean(model && (model.topics?.length || model.evidenceHandoff?.available || model.customer?.name || model.reviewReason)); }
  function getDiagnostics(model) {
    const warnings = [];
    if (!model?.topics?.length) warnings.push('No consultation topics are available.');
    model?.topics?.forEach((topic, index) => {
      if (!topic.discovered) warnings.push(`Topic ${index + 1} has no discovery explanation.`);
      if (!topic.question) warnings.push(`Topic ${index + 1} has no conversation question.`);
    });
    return deepFreeze({ valid: hasContent(model), version: VERSION, schemaVersion: SCHEMA_VERSION, warnings, warningCount: warnings.length });
  }

  return Object.freeze({ VERSION, SCHEMA_VERSION, STAGE_LABELS, OUTCOME_LABELS, create, hasContent, getDiagnostics });
});
