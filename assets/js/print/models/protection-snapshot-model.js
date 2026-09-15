(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../protection-score.js'));
  } else {
    root.CoverageFitProtectionSnapshotModel = factory(root.CoverageFitProtectionScore);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (protectionScore) {
  'use strict';

  const VERSION = '1.1.0';
  const SCHEMA_VERSION = 1;

  const INTERPRETATIONS = Object.freeze({
    'well-prepared': 'The answers show strong preparation across most topics reviewed. The conversation can confirm the details and address anything still open.',
    'strong-foundation': 'The answers show a solid starting point, with a few areas worth confirming or strengthening.',
    'review-recommended': 'Several important topics would benefit from discussion and confirmation before a recommendation is made.',
    'several-areas-to-review': 'The answers identify several topics that need attention and confirmation during the review.'
  });

  const PURPOSE = 'The score summarizes how clearly the assessment answers address important home protection topics.';
  const USE_GUIDANCE = 'Use the score to focus the conversation, then confirm household details and what the current policy says before making a recommendation.';
  const GUARDRAIL = 'The score does not decide what is covered, what a policy will cost, whether a company will offer a policy, or whether the current coverage is sufficient.';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function finiteScore(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 100) return null;
    return Math.round(number);
  }

  function bands() {
    const source = Array.isArray(protectionScore?.BANDS) ? protectionScore.BANDS : [];
    return source
      .map(band => ({
        id: String(band?.id || ''),
        label: String(band?.label || ''),
        className: String(band?.className || ''),
        min: Number(band?.min),
        max: Number(band?.max)
      }))
      .filter(band => band.id && band.label && Number.isFinite(band.min) && Number.isFinite(band.max))
      .sort((a, b) => a.min - b.min);
  }

  function create(executiveSummaryModel) {
    const score = finiteScore(executiveSummaryModel?.protectionScore?.value);
    const available = score != null;
    const canonicalBand = available && typeof protectionScore?.bandFor === 'function'
      ? protectionScore.bandFor(score)
      : null;
    const scale = bands().map(band => ({ ...band, active: Boolean(canonicalBand && band.id === canonicalBand.id) }));
    const band = canonicalBand ? {
      id: String(canonicalBand.id || ''),
      label: String(canonicalBand.label || ''),
      className: String(canonicalBand.className || ''),
      min: Number(canonicalBand.min),
      max: Number(canonicalBand.max)
    } : null;

    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      modelVersion: VERSION,
      available,
      value: score,
      position: available ? score : null,
      band,
      scale,
      interpretation: band
        ? INTERPRETATIONS[band.id] || 'Use the conversation to understand the score and confirm the details behind it.'
        : 'A completed assessment is needed before a Protection Score can be shown.',
      purpose: PURPOSE,
      useGuidance: USE_GUIDANCE,
      guardrail: GUARDRAIL,
      methodology: {
        id: String(protectionScore?.METHODOLOGY_ID || ''),
        version: String(protectionScore?.VERSION || ''),
        measure: String(protectionScore?.MEASURE || '')
      }
    });
  }

  function hasContent(model) {
    return Boolean(model && typeof model === 'object' && (model.available || model.interpretation));
  }

  function getDiagnostics(model) {
    const warnings = [];
    if (!model?.available) warnings.push('Protection Score is unavailable.');
    if (model?.available && !model?.band) warnings.push('Protection Score category is unavailable.');
    if (!model?.scale?.length) warnings.push('Protection Score bands are unavailable.');
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
    INTERPRETATIONS,
    PURPOSE,
    USE_GUIDANCE,
    GUARDRAIL,
    create,
    hasContent,
    getDiagnostics
  });
});
