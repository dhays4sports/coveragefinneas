export const PVX_READINESS_BUILD = 'CF-PVX-READY-1.0';
export const PVX_READINESS_CONTRACT = 'coveragefit-action-readiness-v1';

export const ACTION_READINESS_STATES = Object.freeze([
  'open_if_fit',
  'wants_explanation_first',
  'price_dependent',
  'exploring',
  'not_sure'
]);

export const CHANGE_SCOPES = Object.freeze([
  'coverage_structure',
  'carrier',
  'either',
  'not_sure'
]);

export const DESIRED_NEXT_ACTIONS = Object.freeze([
  'understand_snapshot',
  'ask_about_topics',
  'see_if_comparison_is_worthwhile',
  'become_quote_ready',
  'review_current_policy',
  'continue_independently',
  'continue_later'
]);

export const SOURCE_CHECKPOINTS = Object.freeze([
  'snapshot',
  'home_profile',
  'policy_review',
  'combined_review',
  'customer_update',
  'producer_conversation'
]);

export const EXPRESSION_SOURCES = Object.freeze([
  'customer_entered',
  'producer_recorded_customer_statement'
]);

export const SEMANTIC_BOUNDARIES = Object.freeze({
  readinessIsTopicResponse: false,
  readinessIsRecommendationResponse: false,
  readinessIsContactPermission: false,
  readinessIsQuoteReadiness: false,
  readinessIsCarrierEligibility: false,
  changeScopeIsReadiness: false,
  changeScopeIsDesiredAction: false,
  changeScopeIsRecommendationResponse: false,
  changeScopeIsAuthorizationToBind: false,
  desiredActionIsContactRequest: false,
  contactRequestIsChannelPermission: false,
  opportunityProjectionIsLeadScore: false,
  discoveryOrReadinessAffectsProtectionScore: false
});

const clean = (value, max = 240) => String(value ?? '')
  .trim()
  .replace(/[<>\u0000-\u001f\u007f]/g, '')
  .slice(0, max);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const iso = value => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};
const evidence = value => [...new Set((Array.isArray(value) ? value : [])
  .map(item => clean(item, 160))
  .filter(Boolean))].slice(0, 20);

function expressionId(value, prefix) {
  const candidate = clean(value, 120);
  if (!new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,100}$`).test(candidate)) {
    throw new TypeError(`A valid ${prefix} expression id is required.`);
  }
  return candidate;
}

export function normalizeActionReadiness(value = {}) {
  if (!ACTION_READINESS_STATES.includes(value.state)) throw new TypeError('Unsupported action-readiness state.');
  if (!SOURCE_CHECKPOINTS.includes(value.sourceCheckpoint)) throw new TypeError('A valid source checkpoint is required.');
  if (!EXPRESSION_SOURCES.includes(value.source || 'customer_entered')) throw new TypeError('Unsupported expression source.');
  if (value.source === 'producer_recorded_customer_statement' && !clean(value.exactCustomerWords, 800)) throw new TypeError('Producer-recorded customer statements require preserved wording.');
  return Object.freeze({
    expressionId: expressionId(value.expressionId, 'pvr'),
    journeyId: clean(value.journeyId, 120),
    state: value.state,
    sourceCheckpoint: value.sourceCheckpoint,
    sourceReportRevision: clean(value.sourceReportRevision, 20),
    promptVersion: clean(value.promptVersion || '1.0', 20),
    evidenceRefs: evidence(value.evidenceRefs),
    exactCustomerWords: clean(value.exactCustomerWords, 800),
    expressedAt: iso(value.expressedAt),
    supersedesExpressionId: clean(value.supersedesExpressionId, 120),
    source: value.source || 'customer_entered',
    status: ['active', 'cleared', 'stale'].includes(value.status) ? value.status : 'active'
  });
}

export function normalizeChangeScope(value = {}) {
  if (!CHANGE_SCOPES.includes(value.scope)) throw new TypeError('Unsupported change scope.');
  if (!SOURCE_CHECKPOINTS.includes(value.sourceCheckpoint)) throw new TypeError('A valid source checkpoint is required.');
  if (!EXPRESSION_SOURCES.includes(value.source || 'customer_entered')) throw new TypeError('Unsupported expression source.');
  if (value.source === 'producer_recorded_customer_statement' && !clean(value.exactCustomerWords, 800)) throw new TypeError('Producer-recorded customer statements require preserved wording.');
  return Object.freeze({
    expressionId: expressionId(value.expressionId, 'pvs'),
    journeyId: clean(value.journeyId, 120),
    scope: value.scope,
    sourceCheckpoint: value.sourceCheckpoint,
    sourceReadinessExpressionId: clean(value.sourceReadinessExpressionId, 120),
    promptVersion: clean(value.promptVersion || '1.0', 20),
    evidenceRefs: evidence(value.evidenceRefs),
    exactCustomerWords: clean(value.exactCustomerWords, 800),
    expressedAt: iso(value.expressedAt),
    supersedesExpressionId: clean(value.supersedesExpressionId, 120),
    source: value.source || 'customer_entered',
    status: ['active', 'cleared', 'stale'].includes(value.status) ? value.status : 'active'
  });
}

export function normalizeDesiredAction(value = {}) {
  if (!DESIRED_NEXT_ACTIONS.includes(value.action)) throw new TypeError('Unsupported desired next action.');
  return Object.freeze({
    actionId: expressionId(value.actionId, 'pva'),
    journeyId: clean(value.journeyId, 120),
    action: value.action,
    sourceCheckpoint: SOURCE_CHECKPOINTS.includes(value.sourceCheckpoint) ? value.sourceCheckpoint : 'snapshot',
    evidenceRefs: evidence(value.evidenceRefs),
    selectedAt: iso(value.selectedAt),
    supersedesActionId: clean(value.supersedesActionId, 120),
    status: ['active', 'cleared', 'stale'].includes(value.status) ? value.status : 'active'
  });
}

export function extendReadinessRecord(record = {}) {
  return {
    ...clone(record),
    readinessSchemaVersion: '1.0',
    readinessContractId: PVX_READINESS_CONTRACT,
    actionReadinessExpressions: Array.isArray(record.actionReadinessExpressions)
      ? record.actionReadinessExpressions.map(normalizeActionReadiness)
      : [],
    changeScopeExpressions: Array.isArray(record.changeScopeExpressions)
      ? record.changeScopeExpressions.map(normalizeChangeScope)
      : [],
    desiredNextActions: Array.isArray(record.desiredNextActions)
      ? record.desiredNextActions.map(normalizeDesiredAction)
      : [],
    producerContactRequests: Array.isArray(record.producerContactRequests) ? clone(record.producerContactRequests) : [],
    producerObservations: Array.isArray(record.producerObservations) ? clone(record.producerObservations) : [],
    producerOpportunityProjection: record.producerOpportunityProjection && typeof record.producerOpportunityProjection === 'object'
      ? clone(record.producerOpportunityProjection)
      : null
  };
}

export function appendProducerObservation(record, value = {}) {
  const next = extendReadinessRecord(record);
  const observationId = expressionId(value.observationId, 'pvo');
  if (next.producerObservations.some(item => item.observationId === observationId)) throw new TypeError('Immutable producer observation history cannot be overwritten.');
  next.producerObservations = [...next.producerObservations, Object.freeze({
    observationId,
    producerId: clean(value.producerId, 120),
    observation: clean(value.observation, 800),
    observedAt: iso(value.observedAt),
    source: 'producer_observation',
    customerStatement: false
  })];
  return next;
}

export function appendImmutable(record, collection, value) {
  const next = extendReadinessRecord(record);
  const normalizer = collection === 'actionReadinessExpressions'
    ? normalizeActionReadiness
    : collection === 'changeScopeExpressions'
      ? normalizeChangeScope
      : collection === 'desiredNextActions'
        ? normalizeDesiredAction
        : null;
  if (!normalizer) throw new TypeError('Unsupported readiness collection.');
  const item = normalizer(value);
  const idKey = collection === 'desiredNextActions' ? 'actionId' : 'expressionId';
  const existing = next[collection].find(entry => entry[idKey] === item[idKey]);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(item)) throw new TypeError('Immutable readiness history cannot be overwritten.');
    return next;
  }
  next[collection] = [...next[collection], item];
  return next;
}

export function currentExplicit(items = [], valueKey) {
  const latest = [...(Array.isArray(items) ? items : [])]
    .filter(item => item?.[valueKey])
    .sort((a, b) => String(a.expressedAt || a.selectedAt || '').localeCompare(String(b.expressedAt || b.selectedAt || '')))
    .at(-1) || null;
  return latest?.status === 'active' ? latest : null;
}

export function appendReadinessExpression(record, value) {
  const state = readinessState(record);
  return appendImmutable(record, 'actionReadinessExpressions', {
    ...value,
    supersedesExpressionId: value.supersedesExpressionId || state.currentActionReadiness?.expressionId || ''
  });
}

export function appendChangeScopeExpression(record, value) {
  const state = readinessState(record);
  return appendImmutable(record, 'changeScopeExpressions', {
    ...value,
    supersedesExpressionId: value.supersedesExpressionId || state.currentChangeScope?.expressionId || ''
  });
}

export function clearCurrentExpression(record, collection, value = {}) {
  const state = readinessState(record);
  const current = collection === 'actionReadinessExpressions' ? state.currentActionReadiness
    : collection === 'changeScopeExpressions' ? state.currentChangeScope : null;
  if (!current) return extendReadinessRecord(record);
  const payload = collection === 'actionReadinessExpressions'
    ? {...current, ...value, expressionId:value.expressionId, state:current.state, status:'cleared', supersedesExpressionId:current.expressionId}
    : {...current, ...value, expressionId:value.expressionId, scope:current.scope, status:'cleared', supersedesExpressionId:current.expressionId};
  return appendImmutable(record, collection, payload);
}

export function markCurrentExpressionStale(record, collection, value = {}) {
  const state = readinessState(record);
  const current = collection === 'actionReadinessExpressions' ? state.currentActionReadiness
    : collection === 'changeScopeExpressions' ? state.currentChangeScope : null;
  if (!current) return extendReadinessRecord(record);
  const payload = collection === 'actionReadinessExpressions'
    ? {...current, ...value, expressionId:value.expressionId, state:current.state, status:'stale', supersedesExpressionId:current.expressionId}
    : {...current, ...value, expressionId:value.expressionId, scope:current.scope, status:'stale', supersedesExpressionId:current.expressionId};
  return appendImmutable(record, collection, payload);
}

export function readinessState(record = {}) {
  const next = extendReadinessRecord(record);
  return Object.freeze({
    currentActionReadiness: currentExplicit(next.actionReadinessExpressions, 'state'),
    currentChangeScope: currentExplicit(next.changeScopeExpressions, 'scope'),
    currentDesiredNextAction: currentExplicit(next.desiredNextActions, 'action'),
    missingReadiness: next.actionReadinessExpressions.length === 0,
    missingChangeScope: next.changeScopeExpressions.length === 0,
    inferred: false
  });
}
