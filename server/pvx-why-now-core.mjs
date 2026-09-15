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

const cleanText = value => typeof value === 'string' ? value.trim() : '';

export function deriveWhyNowThread(discovery = {}) {
  const answers = discovery?.answers || {};
  const exactWords = discovery?.exactCustomerWords || {};
  const reason = answers.shoppingReason || null;
  const reasonText = cleanText(exactWords.shoppingReason) || WHY_NOW[reason] || '';
  const priorities = Array.isArray(answers.improvementPriorities)
    ? answers.improvementPriorities.filter(value => IMPROVEMENTS[value])
    : [];
  const priorityText = priorities.map(value => IMPROVEMENTS[value]);

  if (!reasonText && priorityText.length === 0) return null;

  const evidenceRefs = [];
  if (reasonText) evidenceRefs.push({
    source: 'pvx_discovery',
    key: 'shoppingReason',
    value: reason,
    exactCustomerWords: cleanText(exactWords.shoppingReason) || null,
    status: 'customer-reported'
  });
  if (priorityText.length) evidenceRefs.push({
    source: 'pvx_discovery',
    key: 'improvementPriorities',
    value: priorities,
    status: 'customer-reported'
  });

  const connection = reasonText && priorityText.length
    ? `${reasonText}. You also want to ${priorityText.slice(0, 2).join(' and ')}.`
    : reasonText || `You want to ${priorityText.slice(0, 2).join(' and ')}.`;

  return Object.freeze({
    schemaVersion: '1.0',
    threadType: 'why_now',
    reasonKey: reason,
    headline: reasonText || 'You are taking a thoughtful first look',
    connection,
    evidenceRefs,
    customerReported: true,
    inferred: false,
    createsTopic: false,
    createsRecommendation: false,
    affectsProtectionScore: false
  });
}

export function validWhyNowThread(thread) {
  if (thread == null) return true;
  return thread.threadType === 'why_now'
    && thread.customerReported === true
    && thread.inferred === false
    && thread.createsTopic === false
    && thread.createsRecommendation === false
    && thread.affectsProtectionScore === false
    && Array.isArray(thread.evidenceRefs)
    && thread.evidenceRefs.every(ref => ref.status === 'customer-reported');
}

export const WHY_NOW_LABELS = WHY_NOW;
export const IMPROVEMENT_LABELS = IMPROVEMENTS;

