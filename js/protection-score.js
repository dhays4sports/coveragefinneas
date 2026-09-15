(function (root, factory) {
  'use strict';
  const api = factory();
  root.CoverageFitProtectionScore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const METHODOLOGY_ID = 'coveragefit-protection-score-v1';
  const MEASURE = 'review-readiness-and-clarity';
  const DEFAULT_UNANSWERED_IMPACT = 0.75;

  const IMPACT_LEVELS = Object.freeze({
    none: 0,
    limited: 0.25,
    moderate: 0.5,
    material: 0.75,
    full: 1
  });

  const FINDING_TYPES = Object.freeze({
    STRENGTH: 'strength',
    CONSIDERATION: 'consideration',
    UNCERTAINTY: 'uncertainty',
    IDENTIFIED_GAP: 'identified-gap'
  });

  const EVIDENCE_QUALITY = Object.freeze({
    CONFIRMED: 'confirmed',
    PARTIAL: 'partial',
    NEEDS_VERIFICATION: 'needs-verification',
    MISSING: 'missing'
  });

  const EVIDENCE_LABELS = Object.freeze({
    [EVIDENCE_QUALITY.CONFIRMED]: 'Clear response captured',
    [EVIDENCE_QUALITY.PARTIAL]: 'Useful context, details incomplete',
    [EVIDENCE_QUALITY.NEEDS_VERIFICATION]: 'Needs policy verification',
    [EVIDENCE_QUALITY.MISSING]: 'Response still needed'
  });

  const FINDING_PRIORITY_BONUS = Object.freeze({
    [FINDING_TYPES.IDENTIFIED_GAP]: 2,
    [FINDING_TYPES.UNCERTAINTY]: 1,
    [FINDING_TYPES.CONSIDERATION]: 0,
    [FINDING_TYPES.STRENGTH]: 0
  });

  const BANDS = Object.freeze([
    Object.freeze({ min: 85, max: 100, id: 'well-prepared', label: 'Well Prepared', className: 'strong' }),
    Object.freeze({ min: 70, max: 84, id: 'strong-foundation', label: 'Strong Foundation', className: 'good' }),
    Object.freeze({ min: 50, max: 69, id: 'review-recommended', label: 'Review Recommended', className: 'review' }),
    Object.freeze({ min: 0, max: 49, id: 'several-areas-to-review', label: 'Several Areas to Review', className: 'priority' })
  ]);

  function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, number(value, min)));
  }

  function round(value, digits) {
    const factor = 10 ** (digits || 0);
    return Math.round((number(value, 0) + Number.EPSILON) * factor) / factor;
  }

  function bandFor(score) {
    const normalized = clamp(Math.round(number(score, 0)), 0, 100);
    return BANDS.find(band => normalized >= band.min) || BANDS[BANDS.length - 1];
  }

  function impactFromLegacy(answer, question) {
    const points = number(answer?.points, 0);
    if (points >= 0) return 0;
    const weight = Math.max(1, number(question?.weight ?? answer?.weight, 1));
    return clamp(Math.abs(points) / weight, 0, 1);
  }

  function impactFor(answer, question) {
    if (!answer) return clamp(question?.unansweredImpact ?? DEFAULT_UNANSWERED_IMPACT, 0, 1);
    if (Number.isFinite(Number(answer.scoreImpact))) return clamp(answer.scoreImpact, 0, 1);
    if (answer.impactLevel && Object.prototype.hasOwnProperty.call(IMPACT_LEVELS, answer.impactLevel)) {
      return IMPACT_LEVELS[answer.impactLevel];
    }
    return impactFromLegacy(answer, question);
  }

  function findingTypeFor(answer, impact) {
    if (!answer && impact > 0) return FINDING_TYPES.UNCERTAINTY;
    if (answer?.findingType && Object.values(FINDING_TYPES).includes(answer.findingType)) return answer.findingType;
    if (impact <= 0) return FINDING_TYPES.STRENGTH;
    const label = String(answer?.label || '').toLowerCase();
    if (/not sure|unsure|unknown|never (checked|reviewed)|do not know|don't know/.test(label)) return FINDING_TYPES.UNCERTAINTY;
    if (/^no\b|uninsured|would struggle|low|missing|not included/.test(label) || impact >= 0.9) return FINDING_TYPES.IDENTIFIED_GAP;
    return FINDING_TYPES.CONSIDERATION;
  }

  function severityLabel(impact) {
    if (impact >= 0.9) return 'High review priority';
    if (impact >= 0.7) return 'Material review priority';
    if (impact >= 0.45) return 'Moderate review priority';
    if (impact > 0) return 'Limited review priority';
    return 'Confirmed starting point';
  }

  function evidenceQualityFor(answer, question, findingType) {
    if (!answer) return EVIDENCE_QUALITY.MISSING;
    const explicit = String(answer.evidenceQuality || '').trim().toLowerCase();
    if (Object.values(EVIDENCE_QUALITY).includes(explicit)) return explicit;

    const text = `${answer.label || ''} ${answer.sub || ''}`.toLowerCase();
    if (findingType === FINDING_TYPES.UNCERTAINTY || /not sure|unsure|do not know|don't know|cannot confirm|unclear|unconfirmed|have not (?:reviewed|confirmed|evaluated)|not been (?:reviewed|confirmed|evaluated)/.test(text)) {
      return EVIDENCE_QUALITY.NEEDS_VERIFICATION;
    }
    if (/believe|may be included|some details|other details|discussion was limited|still evaluating|not complete|do not know the (?:amount|limit|percentage|treatment|method)|not how it was calculated/.test(text)) {
      return EVIDENCE_QUALITY.PARTIAL;
    }
    return EVIDENCE_QUALITY.CONFIRMED;
  }

  function evidenceBasisFor(quality, answer, question) {
    if (quality === EVIDENCE_QUALITY.MISSING) return 'No response was recorded for this required review topic.';
    if (quality === EVIDENCE_QUALITY.NEEDS_VERIFICATION) return 'The response identifies a topic that still requires policy, document, or licensed confirmation.';
    if (quality === EVIDENCE_QUALITY.PARTIAL) return 'The response provides useful context, but one or more material details remain incomplete.';
    if (answer?.findingType === FINDING_TYPES.IDENTIFIED_GAP) return 'The homeowner clearly identified a decision or review gap that can be carried into the licensed conversation.';
    return 'The homeowner provided a clear response that can be carried into the licensed conversation.';
  }

  function evidenceSummary(findings) {
    const items = Array.isArray(findings) ? findings : [];
    const required = items.filter(finding => finding.required !== false);
    const missingRequired = required.filter(finding => finding.evidenceQuality === EVIDENCE_QUALITY.MISSING);
    const optionalSkipped = items.filter(finding => finding.required === false && finding.evidenceQuality === EVIDENCE_QUALITY.MISSING);
    const confirmed = items.filter(finding => finding.evidenceQuality === EVIDENCE_QUALITY.CONFIRMED);
    const partial = items.filter(finding => finding.evidenceQuality === EVIDENCE_QUALITY.PARTIAL);
    const needsVerification = items.filter(finding => finding.evidenceQuality === EVIDENCE_QUALITY.NEEDS_VERIFICATION);
    const answered = items.filter(finding => finding.answered);
    const followUp = [...partial, ...needsVerification];
    const completionRate = required.length ? Math.round(100 * (required.length - missingRequired.length) / required.length) : 100;
    const state = missingRequired.length
      ? 'incomplete'
      : followUp.length
        ? 'complete-with-verification'
        : 'complete';
    const label = state === 'incomplete'
      ? 'Assessment incomplete'
      : state === 'complete-with-verification'
        ? 'Complete with verification items'
        : 'Evidence ready';
    const message = state === 'incomplete'
      ? `${missingRequired.length} required ${missingRequired.length === 1 ? 'response is' : 'responses are'} still needed before the Snapshot can be finalized.`
      : followUp.length
        ? `${confirmed.length} ${confirmed.length === 1 ? 'response is' : 'responses are'} clear, and ${followUp.length} ${followUp.length === 1 ? 'topic needs' : 'topics need'} policy or licensed confirmation.`
        : `All ${confirmed.length} recorded ${confirmed.length === 1 ? 'response is' : 'responses are'} clear enough to carry into the licensed review.`;

    return {
      methodologyId: 'coveragefit-assessment-evidence-quality-v1',
      version: '1.0.0',
      state,
      label,
      message,
      totalQuestionCount: items.length,
      requiredQuestionCount: required.length,
      answeredCount: answered.length,
      confirmedCount: confirmed.length,
      partialCount: partial.length,
      needsVerificationCount: needsVerification.length,
      followUpCount: followUp.length,
      missingRequiredCount: missingRequired.length,
      optionalSkippedCount: optionalSkipped.length,
      completionRate,
      scoreIsFinal: missingRequired.length === 0,
      scoreFormulaChanged: false,
      missingQuestionKeys: missingRequired.map(finding => finding.key),
      followUpQuestionKeys: followUp.map(finding => finding.key)
    };
  }

  function normalizeQuestions(questions) {
    return (Array.isArray(questions) ? questions : []).map((question, index) => ({
      ...question,
      __index: index,
      weight: Math.max(0, number(question?.weight, 0)),
      category: String(question?.category || 'Overall review'),
      required: question?.required !== false,
      priorityBoost: Math.max(0, number(question?.priorityBoost, 0)),
      propertyAware: Boolean(question?.propertyAware),
      propertyContext: String(question?.propertyContext || ''),
      applicabilityReason: String(question?.applicabilityReason || ''),
      propertyPriorityBoost: Math.max(0, number(question?.propertyPriorityBoost, 0)),
      reviewReasonAware: Boolean(question?.reviewReasonAware),
      reviewReasonKey: String(question?.reviewReasonKey || 'general'),
      reviewReasonLabel: String(question?.reviewReasonLabel || ''),
      reviewReasonContext: String(question?.reviewReasonContext || ''),
      reviewReasonApplicabilityReason: String(question?.reviewReasonApplicabilityReason || ''),
      reviewReasonPriorityBoost: Math.max(0, number(question?.reviewReasonPriorityBoost, 0))
    }));
  }

  function selectionFor(selections, key) {
    if (!selections) return null;
    if (typeof selections.get === 'function') return selections.get(key) || null;
    return selections[key] || null;
  }

  function findingFor(question, answer) {
    const impact = impactFor(answer, question);
    const type = findingTypeFor(answer, impact);
    const evidenceQuality = evidenceQualityFor(answer, question, type);
    const weightedPenalty = round(question.weight * impact, 2);
    const priorityBoost = impact > 0 ? question.priorityBoost : 0;
    const priorityScore = round(weightedPenalty + (FINDING_PRIORITY_BONUS[type] || 0) + priorityBoost, 2);
    return {
      key: question.key,
      order: question.__index,
      title: question.title,
      tag: answer?.tag || question.tag || question.title,
      category: question.category,
      label: answer?.label || 'Not answered',
      value: answer?.value || '',
      insight: answer?.insight || (answer ? answer.label : 'This topic was not confirmed.'),
      question: answer?.question || `Confirm ${String(answer?.tag || question.tag || question.title || 'this topic').toLowerCase()} during the licensed review.`,
      findingType: type,
      scoreImpact: impact,
      impactLevel: answer?.impactLevel || null,
      evidenceQuality,
      evidenceLabel: EVIDENCE_LABELS[evidenceQuality],
      evidenceSufficient: evidenceQuality === EVIDENCE_QUALITY.CONFIRMED,
      evidenceBasis: evidenceBasisFor(evidenceQuality, answer, question),
      evidencePrompt: evidenceQuality === EVIDENCE_QUALITY.CONFIRMED ? '' : (answer?.question || `Confirm ${String(answer?.tag || question.tag || question.title || 'this topic').toLowerCase()} during the licensed review.`),
      required: question.required,
      severityLabel: severityLabel(impact),
      weight: question.weight,
      weightedPenalty,
      priorityBoost,
      priorityScore,
      propertyPriorityBoost: impact > 0 ? question.propertyPriorityBoost : 0,
      reviewReasonAware: question.reviewReasonAware,
      reviewReasonKey: question.reviewReasonKey,
      reviewReasonLabel: question.reviewReasonLabel,
      reviewReasonContext: question.reviewReasonContext,
      reviewReasonApplicabilityReason: question.reviewReasonApplicabilityReason,
      reviewReasonPriorityBoost: impact > 0 ? question.reviewReasonPriorityBoost : 0,
      propertyAware: question.propertyAware,
      propertyContext: question.propertyContext,
      applicabilityReason: question.applicabilityReason,
      points: impact > 0 ? -Math.round(weightedPenalty) : 0,
      answered: Boolean(answer)
    };
  }

  function priorityComparator(a, b) {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    if (b.weightedPenalty !== a.weightedPenalty) return b.weightedPenalty - a.weightedPenalty;
    const typeDifference = (FINDING_PRIORITY_BONUS[b.findingType] || 0) - (FINDING_PRIORITY_BONUS[a.findingType] || 0);
    if (typeDifference) return typeDifference;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.order - b.order;
  }

  function strengthComparator(a, b) {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.order - b.order;
  }

  function evaluate(input) {
    const settings = input || {};
    const questions = normalizeQuestions(settings.questions);
    const findings = questions
      .filter(question => question.weight > 0)
      .map(question => findingFor(question, selectionFor(settings.selections, question.key)));

    const totalWeight = round(findings.reduce((sum, finding) => sum + finding.weight, 0), 2);
    const totalPenalty = round(findings.reduce((sum, finding) => sum + finding.weightedPenalty, 0), 2);
    const score = totalWeight > 0
      ? clamp(Math.round(100 * (1 - totalPenalty / totalWeight)), 0, 100)
      : 100;
    const band = bandFor(score);

    const categoryMap = new Map();
    findings.forEach(finding => {
      if (!categoryMap.has(finding.category)) {
        categoryMap.set(finding.category, { name: finding.category, weight: 0, penalty: 0, findings: [] });
      }
      const category = categoryMap.get(finding.category);
      category.weight += finding.weight;
      category.penalty += finding.weightedPenalty;
      category.findings.push(finding);
    });

    const categories = Array.from(categoryMap.values()).map(category => {
      const categoryScore = category.weight > 0
        ? clamp(Math.round(100 * (1 - category.penalty / category.weight)), 0, 100)
        : 100;
      return {
        name: category.name,
        score: categoryScore,
        weight: round(category.weight, 2),
        weightedPenalty: round(category.penalty, 2),
        status: bandFor(categoryScore).label,
        priorityCount: category.findings.filter(finding => finding.scoreImpact > 0).length
      };
    });

    const priorities = findings.filter(finding => finding.scoreImpact > 0).sort(priorityComparator);
    const strengths = findings.filter(finding => finding.findingType === FINDING_TYPES.STRENGTH).sort(strengthComparator);
    const completion = evidenceSummary(findings);

    return {
      methodology: {
        id: settings.methodology?.id || METHODOLOGY_ID,
        version: settings.methodology?.version || VERSION,
        measure: settings.methodology?.measure || MEASURE,
        description: settings.methodology?.description || 'A response-based measure of how clearly important protection topics are understood, confirmed, or identified for licensed review. It is not a coverage adequacy determination.',
        totalWeight,
        totalPenalty,
        bands: BANDS.map(bandItem => ({ ...bandItem }))
      },
      score,
      status: band.label,
      band: { ...band },
      categories,
      findings,
      priorities,
      strengths,
      evidence: completion,
      completion
    };
  }

  return Object.freeze({
    VERSION,
    METHODOLOGY_ID,
    MEASURE,
    IMPACT_LEVELS,
    FINDING_TYPES,
    FINDING_PRIORITY_BONUS,
    EVIDENCE_QUALITY,
    EVIDENCE_LABELS,
    BANDS,
    bandFor,
    impactFor,
    findingTypeFor,
    evidenceQualityFor,
    evidenceSummary,
    evaluate
  });
});
