(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXWhyNow = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  const WHY_NOW = Object.freeze({
    renewal_increase: 'Your renewal price changed',
    renewal_approaching: 'Your renewal is approaching',
    buying_home: 'You are buying a home',
    nonrenewal_concern: 'You have a nonrenewal concern',
    service_change: 'You want a different service experience',
    life_change: 'Something changed in your life',
    comparison: 'You want a useful second opinion',
    renovation: 'Your home has changed',
    something_else: 'You have another reason for reviewing'
  });
  const IMPROVEMENTS = Object.freeze({
    understanding: 'understand what you have',
    claim_support: 'feel supported in a claim',
    agent_access: 'reach your agent more easily',
    coordination: 'coordinate your insurance',
    price_only: 'keep price central',
    not_sure: 'decide what matters most'
  });
  const clean = value => typeof value === 'string' ? value.trim() : '';
  function derive(discovery) {
    const answers = discovery?.answers || {};
    const exact = discovery?.exactCustomerWords || {};
    const reason = answers.shoppingReason || null;
    const headline = clean(exact.shoppingReason) || WHY_NOW[reason] || '';
    const priorities = Array.isArray(answers.improvementPriorities)
      ? answers.improvementPriorities.filter(value => IMPROVEMENTS[value]) : [];
    const priorityText = priorities.map(value => IMPROVEMENTS[value]);
    if (!headline && !priorityText.length) return null;
    const evidenceRefs = [];
    if (headline) evidenceRefs.push({source:'pvx_discovery', key:'shoppingReason', value:reason, exactCustomerWords:clean(exact.shoppingReason)||null, status:'customer-reported'});
    if (priorityText.length) evidenceRefs.push({source:'pvx_discovery', key:'improvementPriorities', value:priorities, status:'customer-reported'});
    return Object.freeze({
      schemaVersion:'1.0', threadType:'why_now', reasonKey:reason,
      headline:headline || 'You are taking a thoughtful first look',
      connection:headline && priorityText.length
        ? `${headline}. You also want to ${priorityText.slice(0,2).join(' and ')}.`
        : headline || `You want to ${priorityText.slice(0,2).join(' and ')}.`,
      evidenceRefs, customerReported:true, inferred:false, createsTopic:false,
      createsRecommendation:false, affectsProtectionScore:false
    });
  }
  return Object.freeze({VERSION:'1.0.0', BUILD:'CF-PVX-READY-1.1', WHY_NOW, IMPROVEMENTS, derive});
});
