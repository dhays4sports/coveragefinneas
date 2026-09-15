import { resolveSmsPartnerAttribution } from './realtor-partner-registry.mjs';
import { normalizeSmsCommand, normalizeSmsEntryKeyword, normalizeSmsIntent, SMS_STATES } from './sms-conversation-core.mjs';

export const SMS_ORCHESTRATOR_BUILD = 'RC-SMS-1.9.9';
export const SMS_ORCHESTRATION_SCHEMA = '1.2';
export const SMS_CHANNEL_STATUSES = Object.freeze(['active', 'opted_out']);
export const SMS_CONVERSATION_OWNERS = Object.freeze(['none', 'coveragefit', 'producer', 'service', 'life', 'commercial', 'appointment', 'system']);
export const SMS_AUTOMATION_MODES = Object.freeze(['automated', 'assist_only', 'human_only', 'suppressed']);
export const SMS_WORKFLOW_STATUSES = Object.freeze(['idle', 'active', 'paused', 'awaiting_producer', 'completed']);
export const SMS_OWNERSHIP_OPERATIONS = Object.freeze(['acquire', 'transfer', 'pause', 'resume', 'release', 'close']);
export const SMS_REPLY_CONTEXT_ROUTES = Object.freeze(['coveragefit', 'producer', 'service', 'life', 'commercial', 'appointment', 'system', 'none']);
export const SMS_PRODUCER_START_WORKFLOWS = Object.freeze([
  'coveragefit_homebuyer',
  'coveragefit_home_review',
  'coveragefit_bundle',
  'coveragefit_auto',
  'coveragefit_life',
  'coveragefit_business',
  'coveragefit_tech',
  'coveragefit_other',
  'quote_followup',
  'service',
  'appointment',
  'life',
  'commercial',
  'system'
]);
export const SMS_REPLY_CONTEXT_DEFAULT_TTL_SECONDS = 48 * 60 * 60;
export const SMS_REPLY_CONTEXT_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_WORKFLOW_EPISODES = 20;

const COVERAGEFIT_ACTIVE_STATES = new Set([
  'intent_requested',
  'buyer_address_requested',
  'buyer_closing_date_requested',
  'buyer_occupancy_requested',
  'buyer_bundle_requested',
  'home_review_address_requested',
  'home_review_reason_requested',
  'bundle_address_requested',
  'bundle_occupancy_requested',
  'bundle_status_requested',
  'auto_need_requested',
  'life_goal_requested',
  'business_type_requested',
  'business_need_requested',
  'tech_role_requested',
  'tech_housing_requested',
  'other_category_requested',
  'coveragefit_ready'
]);

const META_STATES = new Set(['human_takeover', 'opted_out']);
const WORKFLOW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const WORKFLOW_TOKEN_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,59}$/;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function safeState(value, fallback = 'new') {
  const candidate = text(value).toLowerCase();
  return SMS_STATES.includes(candidate) ? candidate : fallback;
}

function safeWorkflowState(value, fallback = 'new') {
  const candidate = text(value).toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, 60);
  return candidate && WORKFLOW_TOKEN_PATTERN.test(candidate) ? candidate : fallback;
}

function safeWorkflowType(value, fallback = 'none') {
  const candidate = text(value).toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, 60);
  return candidate && WORKFLOW_TOKEN_PATTERN.test(candidate) ? candidate : fallback;
}

function safeEnum(value, allowed, fallback) {
  const candidate = text(value).toLowerCase();
  return allowed.includes(candidate) ? candidate : fallback;
}

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}

function nowMs(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function workflowTypeFromConversation(conversation = {}) {
  const category = text(conversation.answers?.requestCategory).toLowerCase();
  if (category === 'servicing') return 'service';
  if (category === 'landlord') return 'direct_landlord';
  if (category === 'business') return 'commercial';
  if (category === 'life') return 'life';
  if (category === 'special') return 'direct_special';
  const intent = text(conversation.intent).toLowerCase();
  if (intent === 'buyer') return 'coveragefit_homebuyer';
  if (intent === 'home_review') return 'coveragefit_home_review';
  if (intent === 'bundle') return 'coveragefit_bundle';
  if (intent === 'auto') return 'coveragefit_auto';
  if (intent === 'life') return 'coveragefit_life';
  if (intent === 'business') return 'coveragefit_business';
  if (intent === 'tech') return 'coveragefit_tech';
  if (intent === 'other') return 'coveragefit_other';
  const state = safeState(conversation.state);
  return state === 'new' ? 'none' : 'coveragefit_intake';
}

function workflowStatusFromState(state, owner = 'none') {
  if (state === 'completed') return 'completed';
  if (state === 'awaiting_producer') return 'awaiting_producer';
  if (state === 'human_takeover' || owner === 'producer') return 'paused';
  if (state === 'new') return 'idle';
  if (state === 'opted_out') return 'paused';
  return 'active';
}

function inferredOwner(state) {
  if (state === 'awaiting_producer' || state === 'human_takeover') return 'producer';
  if (COVERAGEFIT_ACTIVE_STATES.has(state)) return 'coveragefit';
  return 'none';
}

function inferredAutomationMode(state, owner) {
  if (state === 'opted_out') return 'suppressed';
  if (owner === 'coveragefit') return 'automated';
  if (owner === 'producer') return 'human_only';
  return owner === 'none' ? 'assist_only' : 'assist_only';
}

function generatedWorkflowId(type, startedAt, conversationId = '') {
  const stamp = text(startedAt).replace(/[^0-9]/g, '').slice(0, 14) || 'legacy';
  const suffix = text(conversationId).replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase();
  return `wf-${safeWorkflowType(type, 'workflow')}-${stamp}${suffix ? `-${suffix}` : ''}`.slice(0, 80);
}

function normalizeWorkflowEpisode(value = {}) {
  if (!value || typeof value !== 'object') return null;
  const type = safeWorkflowType(value.type, 'none');
  if (type === 'none') return null;
  const startedAt = text(value.startedAt);
  const idCandidate = text(value.id);
  return {
    id: WORKFLOW_ID_PATTERN.test(idCandidate) ? idCandidate : generatedWorkflowId(type, startedAt),
    type,
    status: safeEnum(value.status, SMS_WORKFLOW_STATUSES, 'completed'),
    state: safeWorkflowState(value.state, 'new'),
    startedAt,
    endedAt: text(value.endedAt || value.completedAt),
    outcome: text(value.outcome, 'completed').toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, 60),
    ownerAtEnd: safeEnum(value.ownerAtEnd, SMS_CONVERSATION_OWNERS, 'none')
  };
}

function normalizeWorkflowEpisodes(existing = []) {
  const list = Array.isArray(existing) ? existing : [];
  const seen = new Set();
  const normalized = [];
  for (const raw of list.slice(-MAX_WORKFLOW_EPISODES * 2)) {
    const episode = normalizeWorkflowEpisode(raw);
    if (!episode || seen.has(episode.id)) continue;
    seen.add(episode.id);
    normalized.push(episode);
  }
  return normalized.slice(-MAX_WORKFLOW_EPISODES);
}

function normalizeReplyContext(value, options = {}) {
  if (!value || typeof value !== 'object') return null;
  const route = safeEnum(value.route || value.replyRoute, SMS_REPLY_CONTEXT_ROUTES, 'none');
  const context = safeWorkflowType(value.context || value.type || value.workflow, 'none');
  if (route === 'none' || context === 'none') return null;
  const createdAt = text(value.createdAt || value.registeredAt || options.occurredAt);
  const expiresAt = text(value.expiresAt);
  const reference = nowMs(options.occurredAt || new Date().toISOString());
  const expiry = nowMs(expiresAt);
  if (Number.isFinite(expiry) && Number.isFinite(reference) && expiry <= reference) return null;
  return {
    id: text(value.id, `reply-${context}-${text(createdAt).replace(/[^0-9]/g, '').slice(0, 14) || 'context'}`).replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 80),
    context,
    route,
    workflow: safeWorkflowType(value.workflow, context),
    source: safeWorkflowType(value.source, 'system'),
    createdAt,
    expiresAt
  };
}

function modeForOwner(owner) {
  if (owner === 'coveragefit') return 'automated';
  if (owner === 'producer') return 'human_only';
  return 'assist_only';
}

function workflowIsCoverageFit(type) {
  return safeWorkflowType(type).startsWith('coveragefit_');
}

function archiveCurrentWorkflow(orchestration, options = {}) {
  const current = orchestration.workflow || {};
  const type = safeWorkflowType(current.type, 'none');
  const prior = normalizeWorkflowEpisodes(orchestration.workflowEpisodes);
  if (type === 'none' || current.status === 'idle') return prior;
  if (current.status === 'completed' && prior.some(item => item.id === current.id)) return prior;
  const endedAt = text(options.endedAt || options.occurredAt || orchestration.updatedAt);
  const requestedOutcome = current.status === 'completed' ? 'completed' : text(options.outcome, 'superseded');
  const outcome = requestedOutcome.toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, 60);
  const episode = normalizeWorkflowEpisode({
    id: current.id,
    type,
    status: 'completed',
    state: current.state,
    startedAt: current.startedAt,
    endedAt,
    outcome,
    ownerAtEnd: orchestration.ownership?.owner || 'none'
  });
  const withoutSame = prior.filter(item => item.id !== episode?.id);
  return episode ? [...withoutSame, episode].slice(-MAX_WORKFLOW_EPISODES) : prior;
}

/**
 * Backward-compatible normalization for live records created before RC-SMS-1.9.2.
 * No database migration is required: the orchestration envelope is projected from
 * the legacy conversation state, then persisted on the next write.
 */
export function normalizeSmsOrchestration(conversation = {}, options = {}) {
  const existing = conversation.orchestration && typeof conversation.orchestration === 'object'
    ? conversation.orchestration
    : {};
  const legacyState = safeState(conversation.state);
  const existingWorkflow = existing.workflow && typeof existing.workflow === 'object' ? existing.workflow : {};
  const existingOwnership = existing.ownership && typeof existing.ownership === 'object' ? existing.ownership : {};
  const existingChannel = existing.channel && typeof existing.channel === 'object' ? existing.channel : {};
  const now = text(options.occurredAt || conversation.updatedAt || conversation.createdAt || new Date().toISOString());

  const owner = safeEnum(existingOwnership.owner || existing.owner, SMS_CONVERSATION_OWNERS, inferredOwner(legacyState));
  const consentStatus = text(conversation.smsConsent?.status).toLowerCase();
  const channelStatus = safeEnum(existingChannel.status || existing.channelStatus || consentStatus, SMS_CHANNEL_STATUSES, legacyState === 'opted_out' ? 'opted_out' : 'active');
  const automationMode = safeEnum(existing.automationMode, SMS_AUTOMATION_MODES, inferredAutomationMode(legacyState, owner));

  let workflowState = safeWorkflowState(existingWorkflow.state, legacyState);
  if (META_STATES.has(legacyState) && existingWorkflow.state) workflowState = safeWorkflowState(existingWorkflow.state, 'new');
  if (META_STATES.has(legacyState) && !existingWorkflow.state) {
    workflowState = safeWorkflowState(conversation.resumeState || conversation.preTakeoverState, 'new');
  }

  const workflowType = safeWorkflowType(existingWorkflow.type, workflowTypeFromConversation({ ...conversation, state: workflowState }));
  const workflowStatus = safeEnum(existingWorkflow.status, SMS_WORKFLOW_STATUSES, workflowStatusFromState(legacyState, owner));
  const startedAt = text(existingWorkflow.startedAt, workflowState !== 'new' ? text(conversation.createdAt, now) : '');
  const workflowIdCandidate = text(existingWorkflow.id);
  const workflowId = workflowType === 'none' ? '' : WORKFLOW_ID_PATTERN.test(workflowIdCandidate)
    ? workflowIdCandidate
    : generatedWorkflowId(workflowType, startedAt || now, conversation.id);
  const workflowEpisodes = normalizeWorkflowEpisodes(existing.workflowEpisodes || conversation.workflowEpisodes || []);
  const replyContext = normalizeReplyContext(existing.replyContext || conversation.replyContext, { occurredAt: now });

  return {
    schemaVersion: SMS_ORCHESTRATION_SCHEMA,
    build: SMS_ORCHESTRATOR_BUILD,
    channel: {
      status: channelStatus,
      updatedAt: text(existingChannel.updatedAt, now)
    },
    ownership: {
      owner,
      previousOwner: safeEnum(existingOwnership.previousOwner, SMS_CONVERSATION_OWNERS, 'none'),
      reason: text(existingOwnership.reason, owner === 'coveragefit' ? 'coveragefit_workflow' : owner === 'producer' ? 'producer_required' : 'unassigned').slice(0, 80),
      acquiredAt: text(existingOwnership.acquiredAt, now),
      updatedAt: text(existingOwnership.updatedAt, now)
    },
    automationMode,
    workflow: {
      id: workflowId,
      type: workflowType,
      status: workflowStatus,
      state: workflowState,
      previousState: safeWorkflowState(existingWorkflow.previousState, 'new'),
      startedAt,
      updatedAt: text(existingWorkflow.updatedAt, now)
    },
    workflowEpisodes,
    replyContext,
    lastRoute: text(existing.lastRoute).slice(0, 40),
    lastRouteReason: text(existing.lastRouteReason).slice(0, 100),
    updatedAt: text(existing.updatedAt, now)
  };
}

export function setSmsReplyContext(conversation = {}, context = {}, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
  const route = safeEnum(context.route || context.replyRoute, SMS_REPLY_CONTEXT_ROUTES, 'none');
  const contextName = safeWorkflowType(context.context || context.type || context.workflow, 'none');
  if (route === 'none' || contextName === 'none') return { ...orchestration, replyContext: null, updatedAt: occurredAt };
  const ttlSeconds = Math.max(300, Math.min(SMS_REPLY_CONTEXT_MAX_TTL_SECONDS, Number(context.ttlSeconds) || SMS_REPLY_CONTEXT_DEFAULT_TTL_SECONDS));
  const expiresAt = text(context.expiresAt, new Date(Date.parse(occurredAt) + ttlSeconds * 1000).toISOString());
  return {
    ...orchestration,
    replyContext: normalizeReplyContext({
      id: context.id,
      context: contextName,
      route,
      workflow: safeWorkflowType(context.workflow, orchestration.workflow.type === 'none' ? contextName : orchestration.workflow.type),
      source: safeWorkflowType(context.source, 'system'),
      createdAt: occurredAt,
      expiresAt
    }, { occurredAt }),
    updatedAt: occurredAt
  };
}

export function clearSmsReplyContext(conversation = {}, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  return { ...normalizeSmsOrchestration(conversation, { occurredAt }), replyContext: null, updatedAt: occurredAt };
}

export function applySmsOwnershipOperation(conversation = {}, operation, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  const op = safeEnum(operation, SMS_OWNERSHIP_OPERATIONS, '');
  if (!op) throw new Error('Unsupported SMS ownership operation.');
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
  const currentOwner = orchestration.ownership.owner;
  const targetOwner = safeEnum(options.owner || options.targetOwner, SMS_CONVERSATION_OWNERS, currentOwner);
  const reason = text(options.reason, `ownership_${op}`).slice(0, 80);
  const workflowState = orchestration.workflow.state;
  const completed = orchestration.workflow.status === 'completed' || workflowState === 'completed';

  if (op === 'close') {
    return {
      ...orchestration,
      ownership: { owner: 'none', previousOwner: currentOwner, reason, acquiredAt: occurredAt, updatedAt: occurredAt },
      automationMode: 'assist_only',
      workflow: { ...orchestration.workflow, status: 'completed', previousState: orchestration.workflow.state, updatedAt: occurredAt },
      workflowEpisodes: archiveCurrentWorkflow(orchestration, { occurredAt, outcome: text(options.outcome, 'completed') }),
      replyContext: null,
      lastRoute: 'none',
      lastRouteReason: reason,
      updatedAt: occurredAt
    };
  }

  if (op === 'release') {
    return {
      ...orchestration,
      ownership: { owner: 'none', previousOwner: currentOwner, reason, acquiredAt: occurredAt, updatedAt: occurredAt },
      automationMode: 'assist_only',
      workflow: { ...orchestration.workflow, status: completed ? 'completed' : orchestration.workflow.status, updatedAt: occurredAt },
      lastRoute: 'none',
      lastRouteReason: reason,
      updatedAt: occurredAt
    };
  }

  if (op === 'pause') {
    const pauseOwner = targetOwner === 'none' ? 'producer' : targetOwner;
    return {
      ...orchestration,
      ownership: { owner: pauseOwner, previousOwner: currentOwner, reason, acquiredAt: occurredAt, updatedAt: occurredAt },
      automationMode: pauseOwner === 'producer' ? 'human_only' : 'assist_only',
      workflow: { ...orchestration.workflow, status: completed ? 'completed' : 'paused', previousState: orchestration.workflow.previousState, updatedAt: occurredAt },
      lastRoute: pauseOwner,
      lastRouteReason: reason,
      updatedAt: occurredAt
    };
  }

  if (op === 'resume') {
    let resumeOwner = targetOwner;
    if (resumeOwner === currentOwner || resumeOwner === 'none') {
      resumeOwner = orchestration.ownership.previousOwner !== 'none'
        ? orchestration.ownership.previousOwner
        : workflowIsCoverageFit(orchestration.workflow.type) ? 'coveragefit' : currentOwner === 'none' ? 'producer' : currentOwner;
    }
    return {
      ...orchestration,
      ownership: { owner: resumeOwner, previousOwner: currentOwner, reason, acquiredAt: occurredAt, updatedAt: occurredAt },
      automationMode: completed ? 'assist_only' : modeForOwner(resumeOwner),
      workflow: { ...orchestration.workflow, status: completed ? 'completed' : 'active', updatedAt: occurredAt },
      lastRoute: resumeOwner,
      lastRouteReason: reason,
      updatedAt: occurredAt
    };
  }

  const nextOwner = targetOwner === 'none' ? (op === 'acquire' ? 'producer' : 'none') : targetOwner;
  return {
    ...orchestration,
    ownership: { owner: nextOwner, previousOwner: currentOwner, reason, acquiredAt: occurredAt, updatedAt: occurredAt },
    automationMode: modeForOwner(nextOwner),
    workflow: {
      ...orchestration.workflow,
      status: completed ? 'completed' : nextOwner === 'producer' && orchestration.workflow.status === 'active' ? 'paused' : orchestration.workflow.status,
      updatedAt: occurredAt
    },
    lastRoute: nextOwner,
    lastRouteReason: reason,
    updatedAt: occurredAt
  };
}

export function startSmsWorkflowEpisode(conversation = {}, workflowType, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  const type = safeWorkflowType(workflowType, 'none');
  if (!SMS_PRODUCER_START_WORKFLOWS.includes(type)) throw new Error('Unsupported SMS workflow type.');
  const current = normalizeSmsOrchestration(conversation, { occurredAt });
  const episodes = archiveCurrentWorkflow(current, { occurredAt, outcome: text(options.previousOutcome, 'superseded') });
  const mapping = {
    coveragefit_homebuyer: { owner: 'coveragefit', state: 'buyer_address_requested', intent: 'buyer', mode: 'automated' },
    coveragefit_home_review: { owner: 'coveragefit', state: 'home_review_address_requested', intent: 'home_review', mode: 'automated' },
    coveragefit_bundle: { owner: 'coveragefit', state: 'bundle_address_requested', intent: 'bundle', mode: 'automated' },
    coveragefit_auto: { owner: 'coveragefit', state: 'auto_need_requested', intent: 'auto', mode: 'automated' },
    coveragefit_life: { owner: 'coveragefit', state: 'life_goal_requested', intent: 'life', mode: 'automated' },
    coveragefit_business: { owner: 'coveragefit', state: 'business_type_requested', intent: 'business', mode: 'automated' },
    coveragefit_tech: { owner: 'coveragefit', state: 'tech_role_requested', intent: 'tech', mode: 'automated' },
    coveragefit_other: { owner: 'coveragefit', state: 'other_category_requested', intent: 'other', mode: 'automated' },
    quote_followup: { owner: 'producer', state: 'active', intent: '', mode: 'human_only' },
    service: { owner: 'producer', state: 'active', intent: '', mode: 'human_only' },
    appointment: { owner: 'producer', state: 'active', intent: '', mode: 'human_only' },
    life: { owner: 'producer', state: 'active', intent: '', mode: 'human_only' },
    commercial: { owner: 'producer', state: 'active', intent: '', mode: 'human_only' },
    system: { owner: 'producer', state: 'active', intent: '', mode: 'human_only' }
  };
  const next = mapping[type];
  const id = generatedWorkflowId(type, occurredAt, conversation.id);
  const orchestration = {
    ...current,
    ownership: { owner: next.owner, previousOwner: current.ownership.owner, reason: 'producer_started_workflow', acquiredAt: occurredAt, updatedAt: occurredAt },
    automationMode: next.mode,
    workflow: {
      id,
      type,
      status: 'active',
      state: next.state,
      previousState: current.workflow.state,
      startedAt: occurredAt,
      updatedAt: occurredAt
    },
    workflowEpisodes: episodes,
    replyContext: null,
    lastRoute: next.owner,
    lastRouteReason: 'producer_started_workflow',
    updatedAt: occurredAt
  };
  return {
    orchestration,
    legacyState: workflowIsCoverageFit(type) ? next.state : 'human_takeover',
    intent: next.intent,
    resetAnswers: true
  };
}

export function takeProducerOwnership(conversation = {}, options = {}) {
  return applySmsOwnershipOperation(conversation, 'pause', {
    ...options,
    owner: 'producer',
    reason: text(options.reason, 'producer_manual_outbound')
  });
}

export function releaseToCoverageFit(conversation = {}, workflowState, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  const state = safeState(workflowState, safeState(normalizeSmsOrchestration(conversation).workflow.state, 'new'));
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
  const waiting = state === 'awaiting_producer' || state === 'completed';
  return {
    ...orchestration,
    ownership: {
      owner: waiting ? (state === 'awaiting_producer' ? 'producer' : 'none') : 'coveragefit',
      previousOwner: orchestration.ownership.owner,
      reason: waiting ? (state === 'awaiting_producer' ? 'workflow_awaiting_producer' : 'workflow_completed') : text(options.reason, 'producer_resumed_coveragefit').slice(0, 80),
      acquiredAt: occurredAt,
      updatedAt: occurredAt
    },
    automationMode: waiting ? (state === 'completed' ? 'assist_only' : 'human_only') : 'automated',
    workflow: {
      ...orchestration.workflow,
      type: orchestration.workflow.type === 'none' ? workflowTypeFromConversation({ ...conversation, state }) : orchestration.workflow.type,
      status: state === 'completed' ? 'completed' : state === 'awaiting_producer' ? 'awaiting_producer' : 'active',
      previousState: orchestration.workflow.state,
      state,
      startedAt: orchestration.workflow.startedAt || occurredAt,
      updatedAt: occurredAt
    },
    replyContext: waiting ? orchestration.replyContext : null,
    lastRoute: waiting ? (state === 'awaiting_producer' ? 'producer' : 'none') : 'coveragefit',
    lastRouteReason: waiting ? 'workflow_transition' : 'producer_resume',
    updatedAt: occurredAt
  };
}

export function applyCoverageFitResult(conversation = {}, routed = {}, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  const nextState = safeState(routed.state, safeState(normalizeSmsOrchestration(conversation).workflow.state, 'new'));
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
  const command = text(routed.command).toLowerCase();

  if (nextState === 'opted_out') {
    return {
      ...orchestration,
      channel: { status: 'opted_out', updatedAt: occurredAt },
      ownership: { owner: 'none', previousOwner: orchestration.ownership.owner, reason: 'stop_command', acquiredAt: occurredAt, updatedAt: occurredAt },
      automationMode: 'suppressed',
      workflow: { ...orchestration.workflow, status: 'paused', previousState: orchestration.workflow.state, updatedAt: occurredAt },
      replyContext: null,
      lastRoute: 'suppressed',
      lastRouteReason: 'stop_command',
      updatedAt: occurredAt
    };
  }

  const workflowType = workflowTypeFromConversation({
    ...conversation,
    state: nextState,
    intent: Object.prototype.hasOwnProperty.call(routed, 'intent') ? routed.intent : conversation.intent,
    answers: routed.resetAnswers ? {} : { ...(conversation.answers || {}), ...(routed.answers || {}) }
  });
  const producerOwned = nextState === 'awaiting_producer' || command === 'human';
  const completed = nextState === 'completed';

  return {
    ...orchestration,
    channel: { status: 'active', updatedAt: occurredAt },
    ownership: {
      owner: completed ? 'none' : producerOwned ? 'producer' : 'coveragefit',
      previousOwner: orchestration.ownership.owner,
      reason: completed ? 'workflow_completed' : producerOwned ? (command === 'human' ? 'customer_requested_producer' : 'workflow_awaiting_producer') : 'coveragefit_workflow',
      acquiredAt: producerOwned || completed || orchestration.ownership.owner !== 'coveragefit' ? occurredAt : orchestration.ownership.acquiredAt,
      updatedAt: occurredAt
    },
    automationMode: completed ? 'assist_only' : producerOwned ? 'human_only' : 'automated',
    workflow: {
      ...orchestration.workflow,
      id: orchestration.workflow.id || generatedWorkflowId(workflowType, occurredAt, conversation.id),
      type: workflowType,
      status: completed ? 'completed' : producerOwned ? 'awaiting_producer' : 'active',
      previousState: orchestration.workflow.state,
      state: nextState,
      startedAt: orchestration.workflow.startedAt || (nextState !== 'new' ? occurredAt : ''),
      updatedAt: occurredAt
    },
    replyContext: producerOwned || completed ? orchestration.replyContext : null,
    lastRoute: producerOwned ? 'producer' : completed ? 'none' : 'coveragefit',
    lastRouteReason: producerOwned ? 'workflow_transition' : completed ? 'workflow_completed' : 'coveragefit_result',
    updatedAt: occurredAt
  };
}

/**
 * Resolve who is allowed to consume an inbound message before the CoverageFit
 * state machine runs. An active expiring reply context is evaluated independently
 * of relationship ownership, allowing a producer-owned relationship to route a
 * bounded reply to appointment/service/life/commercial handling without surrendering
 * the long-term owner.
 */
export function resolveSmsInboundRoute(conversation = {}, messageBody, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
  const rawBody = text(messageBody).slice(0, 1000);
  const partnerResolution = resolveSmsPartnerAttribution(rawBody, options.partnerRegistry || []);
  const body = text(partnerResolution.matched ? partnerResolution.cleanedBody : rawBody).slice(0, 800);
  const command = normalizeSmsCommand(body);
  const intent = normalizeSmsIntent(body);
  const entryKeywordIntent = normalizeSmsEntryKeyword(body);
  const workflowState = safeState(orchestration.workflow.state, safeState(conversation.state, 'new'));

  if (orchestration.channel.status === 'opted_out' || workflowState === 'opted_out' || safeState(conversation.state) === 'opted_out') {
    if (command === 'start') return { route: 'coveragefit', reason: 'opt_in_command', command, intent, orchestration };
    return { route: command === 'stop' ? 'coveragefit' : 'suppressed', reason: 'channel_opted_out', command, intent, orchestration };
  }

  if (command === 'stop') return { route: 'coveragefit', reason: 'stop_command', command, intent, orchestration };
  if (command === 'restart') return { route: 'coveragefit', reason: 'explicit_restart', command, intent, orchestration };
  if (command === 'human') return { route: 'coveragefit', reason: 'explicit_producer_request', command, intent, orchestration };

  // A standalone intake keyword is a deliberate request to begin that intake,
  // even if an older callback or producer-owned episode exists on the shared
  // number. STOP remains globally authoritative above this boundary.
  if (entryKeywordIntent) return { route: 'coveragefit', reason: 'explicit_entry_keyword', command, intent: entryKeywordIntent, orchestration };

  if (orchestration.replyContext?.route && orchestration.replyContext.route !== 'none') {
    return {
      route: orchestration.replyContext.route,
      reason: `reply_context:${orchestration.replyContext.context}`.slice(0, 100),
      command,
      intent,
      orchestration,
      replyContext: clone(orchestration.replyContext)
    };
  }

  if (orchestration.ownership.owner === 'producer' || orchestration.automationMode === 'human_only') {
    return { route: 'producer', reason: 'producer_ownership', command, intent, orchestration };
  }

  if (['service', 'life', 'commercial', 'appointment', 'system'].includes(orchestration.ownership.owner)) {
    return { route: orchestration.ownership.owner, reason: 'specialized_owner', command, intent, orchestration };
  }

  if (orchestration.ownership.owner === 'coveragefit' && orchestration.automationMode === 'automated') {
    return { route: 'coveragefit', reason: 'active_coveragefit_workflow', command, intent, orchestration };
  }

  if (['rush', 'start', 'help'].includes(command)) return { route: 'coveragefit', reason: 'explicit_coveragefit_command', command, intent, orchestration };
  if (intent) return { route: 'coveragefit', reason: 'explicit_coveragefit_intent', command, intent, orchestration };
  if (partnerResolution.active && partnerResolution.defaultIntent) return { route: 'coveragefit', reason: 'partner_attributed_entry', command, intent: partnerResolution.defaultIntent, orchestration };

  return { route: 'producer', reason: 'ambiguous_shared_number_inbound', command, intent, orchestration };
}

export function markProducerInbound(conversation = {}, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  const orchestration = takeProducerOwnership(conversation, { occurredAt, reason: text(options.reason, 'producer_owned_inbound') });
  return {
    ...orchestration,
    lastRoute: 'producer',
    lastRouteReason: text(options.reason, 'producer_owned_inbound').slice(0, 100),
    updatedAt: occurredAt
  };
}

export function markSpecializedInbound(conversation = {}, route, options = {}) {
  const occurredAt = text(options.occurredAt || conversation.updatedAt || new Date().toISOString());
  const normalizedRoute = safeEnum(route, SMS_REPLY_CONTEXT_ROUTES, 'producer');
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
  return {
    ...orchestration,
    automationMode: orchestration.ownership.owner === 'coveragefit' ? 'assist_only' : orchestration.automationMode,
    lastRoute: normalizedRoute,
    lastRouteReason: text(options.reason, `specialized_route:${normalizedRoute}`).slice(0, 100),
    updatedAt: occurredAt
  };
}

export function orchestrationSummary(conversation = {}) {
  const orchestration = normalizeSmsOrchestration(conversation);
  return clone({
    channelStatus: orchestration.channel.status,
    owner: orchestration.ownership.owner,
    previousOwner: orchestration.ownership.previousOwner,
    automationMode: orchestration.automationMode,
    workflowId: orchestration.workflow.id,
    workflowType: orchestration.workflow.type,
    workflowStatus: orchestration.workflow.status,
    workflowState: orchestration.workflow.state,
    workflowEpisodeCount: orchestration.workflowEpisodes.length,
    replyContext: orchestration.replyContext ? {
      context: orchestration.replyContext.context,
      route: orchestration.replyContext.route,
      workflow: orchestration.replyContext.workflow,
      source: orchestration.replyContext.source,
      expiresAt: orchestration.replyContext.expiresAt
    } : null,
    route: orchestration.lastRoute,
    routeReason: orchestration.lastRouteReason,
    build: orchestration.build
  });
}
