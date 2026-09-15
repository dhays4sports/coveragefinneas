(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoverageFitConsumerLanguage = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = 1;

  const REPLACEMENTS = Object.freeze([
    Object.freeze([/formal carrier[- ]quot(?:e|ing)/gi, 'formal insurance quote']),
    Object.freeze([/carrier[- ]quote/gi, 'insurance quote']),
    Object.freeze([/carrier forms/gi, 'insurance company forms']),
    Object.freeze([/carrier wording/gi, 'insurance company wording']),
    Object.freeze([/carrier confirmation/gi, 'insurance company confirmation']),
    Object.freeze([/carrier availability/gi, 'insurance company availability']),
    Object.freeze([/carrier eligibility/gi, 'insurance company eligibility rules']),
    Object.freeze([/carrier requirements/gi, 'insurance company requirements']),
    Object.freeze([/underwriting eligibility/gi, 'insurance company eligibility review']),
    Object.freeze([/underwriting requirements/gi, 'insurance company review requirements']),
    Object.freeze([/underwriting guidance/gi, 'insurance company review guidance']),
    Object.freeze([/underwriting action/gi, 'insurance company decision']),
    Object.freeze([/carrier underwriting/gi, 'insurance company review']),
    Object.freeze([/\bunderwriting\b/gi, 'insurance company review']),
    Object.freeze([/declarations page/gi, 'current policy summary (declarations page)']),
    Object.freeze([/current declarations/gi, 'current policy summary']),
    Object.freeze([/the declarations/gi, 'the current policy summary']),
    Object.freeze([/\bendorsements\b/gi, 'added policy options']),
    Object.freeze([/\bexclusions\b/gi, 'what the policy does not cover']),
    Object.freeze([/\binsureds\b/gi, 'people covered by the policy']),
    Object.freeze([/peril-specific/gi, 'cause-specific']),
    Object.freeze([/valuation basis/gi, 'method used to value belongings']),
    Object.freeze([/named-insured requirements/gi, 'policyholder-name requirements']),
    Object.freeze([/required underlying limits/gi, 'required home and auto liability limits']),
    Object.freeze([/qualifying underlying policies/gi, 'qualifying home and auto policies']),
    Object.freeze([/coverage fact/gi, 'confirmed policy detail']),
    Object.freeze([/policy-specific/gi, 'specific to the current policy'])
  ]);

  const FINAL_TERMS = 'This document supports a coverage conversation. The insurance company decides which options are available, what they cost, and the final policy terms. The formal quote and issued policy are the official sources.';
  const POLICY_CHECK = 'Confirm reported policy details against the current policy summary and issued policy before making a recommendation.';

  function text(value) {
    if (value === 0) return '0';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  function simplifySystemText(value) {
    let result = text(value);
    REPLACEMENTS.forEach(([pattern, replacement]) => {
      result = result.replace(pattern, match => /^[A-Z]/.test(match) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement);
    });
    return result.replace(/\s{2,}/g, ' ').trim();
  }

  function diagnostics() {
    const sample = simplifySystemText('Confirm current declarations, endorsements, exclusions, underwriting guidance, and the formal carrier quote.');
    const errors = [];
    if (!sample.includes('current policy summary')) errors.push('Policy-summary explanation is unavailable.');
    if (!sample.includes('added policy options')) errors.push('Added-policy-option explanation is unavailable.');
    if (!sample.includes('what the policy does not cover')) errors.push('Not-covered explanation is unavailable.');
    if (!sample.includes('formal insurance quote')) errors.push('Insurance-quote explanation is unavailable.');
    return Object.freeze({ valid: errors.length === 0, version: VERSION, schemaVersion: SCHEMA_VERSION, errors: Object.freeze(errors) });
  }

  return Object.freeze({ VERSION, SCHEMA_VERSION, REPLACEMENTS, FINAL_TERMS, POLICY_CHECK, simplifySystemText, diagnostics });
});
