import { authorizeProducer } from './consultation-inbox-core.mjs';
import { normalizeE164 } from './ringcentral-client.mjs';
import { sendSmsThroughGateway } from './sms-outbound-gateway.mjs';
import { SMS_STATES } from './sms-conversation-core.mjs';
import { normalizeSmsConsent, smsPermissionSnapshot } from './sms-consent-core.mjs';
import { writeOpsAudit } from './sms-operations-core.mjs';
import {
  SMS_CONVERSATION_OWNERS,
  SMS_PRODUCER_START_WORKFLOWS,
  applySmsOwnershipOperation,
  clearSmsReplyContext,
  normalizeSmsOrchestration,
  releaseToCoverageFit,
  startSmsWorkflowEpisode,
  takeProducerOwnership
} from './sms-orchestrator-core.mjs';

export const SMS_PRODUCER_HANDOFF_BUILD = 'RC-SMS-1.9.9';
const LIVE_CONVERSATION_PREFIX = 'sms-live-conversations/';
export const SMS_PRODUCER_ACTIONS = Object.freeze([
  'pause', 'resume', 'resend_handoff', 'complete', 'not_proceeding',
  'take_ownership', 'return_to_coveragefit', 'pause_automation', 'resume_workflow',
  'close_workflow', 'start_workflow', 'transfer_ownership', 'release_ownership', 'clear_reply_context'
]);
const LIVE_ID = /^sms-live-[a-f0-9]{32,64}$/i;
const MAX_BODY_BYTES = 8000;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' } });
}
function error(status, code, message) { return json({ ok: false, error: { code, message } }, status); }
function sameOrigin(request) {
  const origin = text(request.headers.get('origin'));
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
}
function nowIso(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
function phoneDisplay(value) {
  const n = normalizeE164(value);
  return n ? `${n.slice(0, 2)} (${n.slice(2, 5)}) ${n.slice(5, 8)}-${n.slice(8)}` : 'Unknown';
}
function occupancyLabel(value) {
  return ({ primary_home: 'Primary', rental_property: 'Rental', second_home: 'Second home', not_sure: 'Not sure' })[text(value)] || 'Not captured';
}

export function buildSmsProducerSummary(conversation = {}) {
  const answers = conversation.answers && typeof conversation.answers === 'object' ? conversation.answers : {};
  const attribution = conversation.attribution && typeof conversation.attribution === 'object' ? conversation.attribution : {};
  const handoff = conversation.handoff && typeof conversation.handoff === 'object' ? conversation.handoff : null;
  const summary = {
    conversationId: text(conversation.id),
    buyer: phoneDisplay(conversation.contactPhone || conversation.testPhone),
    intent: text(conversation.intent, 'Not captured'),
    referredBy: text(attribution.partnerName, 'Direct / no partner captured'),
    partnerId: text(attribution.partnerId),
    property: text(answers.propertyAddress, 'Not captured'),
    closing: text(answers.closingDateDisplay || answers.closingDateRaw || answers.closingDate, 'Not captured'),
    occupancy: occupancyLabel(answers.occupancy),
    autoReview: typeof answers.autoReview === 'boolean' ? (answers.autoReview ? 'Yes' : 'No') : 'Not captured',
    reviewReason: text(answers.reviewReason, 'Not captured'),
    bundleStatus: text(answers.bundleStatus, 'Not captured'),
    requestCategory: text(answers.requestCategory, 'Not captured'),
    autoNeed: text(answers.autoNeed, 'Not captured'),
    lifeGoal: text(answers.lifeGoal, 'Not captured'),
    businessType: text(answers.businessType, 'Not captured'),
    businessNeed: text(answers.businessNeed, 'Not captured'),
    professionalRole: text(answers.professionalRole, 'Not captured'),
    housing: text(answers.housing, 'Not captured'),
    priority: answers.priority === 'rush' ? 'RUSH / time-sensitive' : 'Standard',
    coverageFit: handoff?.url ? 'Link delivered / available' : 'Not delivered',
    state: text(conversation.state, 'new'),
    updatedAt: text(conversation.updatedAt)
  };
  const title = conversation.intent === 'buyer' ? 'NEW 408-FARMERS BUYER' : conversation.intent === 'home_review' ? 'NEW 408-FARMERS HOME REVIEW' : conversation.intent === 'bundle' ? 'NEW 408-FARMERS HOME + AUTO' : conversation.intent === 'auto' ? 'NEW 408-FARMERS AUTO' : conversation.intent === 'life' ? 'NEW 408-FARMERS LIFE' : conversation.intent === 'business' ? 'NEW 408-FARMERS BUSINESS' : conversation.intent === 'tech' ? 'NEW 408-FARMERS TECH' : 'NEW 408-FARMERS REQUEST';
  summary.text = [
    title,
    '',
    `Buyer: ${summary.buyer}`,
    `Referred by: ${summary.referredBy}`,
    `Property: ${summary.property}`,
    `Closing: ${summary.closing}`,
    `Occupancy: ${summary.occupancy}`,
    `Auto review: ${summary.autoReview}`,
    ...(conversation.intent === 'home_review' ? [`Review reason: ${summary.reviewReason}`] : []),
    ...(conversation.intent === 'bundle' ? [`Current policies: ${summary.bundleStatus}`] : []),
    ...(conversation.intent === 'other' ? [`Request: ${summary.requestCategory}`] : []),
    ...(conversation.intent === 'auto' ? [`Auto need: ${summary.autoNeed}`] : []),
    ...(conversation.intent === 'life' ? [`Life goal: ${summary.lifeGoal}`] : []),
    ...(conversation.intent === 'business' ? [`Business type: ${summary.businessType}`, `Business need: ${summary.businessNeed}`] : []),
    ...(conversation.intent === 'tech' ? [`Technology role: ${summary.professionalRole}`, `Housing: ${summary.housing}`] : []),
    `Priority: ${summary.priority}`,
    ...(conversation.callbackScheduling?.status === 'scheduled' ? [`Appointment: ${text(conversation.callbackScheduling.proposedDisplay)}`] : []),
    ...Object.entries(conversation.callbackPreparation?.answers || {}).map(([key, value]) => `Call preparation — ${key}: ${text(value)}`),
    `CoverageFit: ${summary.coverageFit}`
  ].join('\n');
  return summary;
}

export function determineGuidedResumeState(conversation = {}) {
  const intent = text(conversation.intent);
  if (!intent) return 'intent_requested';
  const a = conversation.answers || {};
  if (intent === 'buyer') {
    if (!text(a.propertyAddress)) return 'buyer_address_requested';
    if (!text(a.closingDateDisplay || a.closingDateRaw || a.closingDate)) return 'buyer_closing_date_requested';
    if (!text(a.occupancy)) return 'buyer_occupancy_requested';
    if (typeof a.autoReview !== 'boolean') return 'buyer_bundle_requested';
  } else if (intent === 'home_review') {
    if (!text(a.propertyAddress)) return 'home_review_address_requested';
    if (!text(a.reviewReason)) return 'home_review_reason_requested';
  } else if (intent === 'bundle') {
    if (!text(a.propertyAddress)) return 'bundle_address_requested';
    if (!text(a.occupancy)) return 'bundle_occupancy_requested';
    if (!text(a.bundleStatus)) return 'bundle_status_requested';
  } else if (intent === 'auto') {
    if (!text(a.autoNeed)) return 'auto_need_requested';
    return 'awaiting_producer';
  } else if (intent === 'life') {
    if (!text(a.lifeGoal)) return 'life_goal_requested';
    return 'awaiting_producer';
  } else if (intent === 'business') {
    if (!text(a.businessType)) return 'business_type_requested';
    if (!text(a.businessNeed)) return 'business_need_requested';
    return 'awaiting_producer';
  } else if (intent === 'tech') {
    if (!text(a.professionalRole)) return 'tech_role_requested';
    if (!text(a.housing)) return 'tech_housing_requested';
    return 'awaiting_producer';
  } else if (intent === 'other') return text(a.requestCategory) ? 'awaiting_producer' : 'other_category_requested';
  return conversation.handoff?.url ? 'awaiting_producer' : 'coveragefit_ready';
}

function cleanConversation(value) {
  if (!value || typeof value !== 'object' || !LIVE_ID.test(text(value.id))) return null;
  const state = text(value.state).toLowerCase();
  const normalizedState = SMS_STATES.includes(state) ? state : 'new';
  const normalized = {
    ...value,
    state: normalizedState,
    transcript: Array.isArray(value.transcript) ? value.transcript.slice(-80) : []
  };
  normalized.orchestration = normalizeSmsOrchestration(normalized);
  normalized.smsConsent = normalizeSmsConsent(normalized);
  normalized.producerSummary = buildSmsProducerSummary(normalized);
  return normalized;
}

function metadata(conversation) {
  return {
    state: conversation.state,
    intent: text(conversation.intent),
    priority: conversation.answers?.priority || 'standard',
    partnerId: conversation.attribution?.partnerId || '',
    producerHandoff: true,
    owner: conversation.orchestration?.ownership?.owner || '',
    automationMode: conversation.orchestration?.automationMode || '',
    workflowType: conversation.orchestration?.workflow?.type || '',
    workflowStatus: conversation.orchestration?.workflow?.status || '',
    replyRoute: conversation.orchestration?.replyContext?.route || '',
    workflowEpisodeCount: Array.isArray(conversation.orchestration?.workflowEpisodes) ? conversation.orchestration.workflowEpisodes.length : 0,
    consentStatus: conversation.smsConsent?.status || '',
    providerConsentStatus: conversation.smsConsent?.providerStatus || '',
    updatedAt: conversation.updatedAt,
    createdAt: conversation.createdAt,
    build: SMS_PRODUCER_HANDOFF_BUILD
  };
}

function transcriptItem(body, occurredAt, before, after, kind = 'operator') {
  return { id: `operator-${occurredAt}-${Math.random().toString(36).slice(2, 8)}`, direction: 'outbound', body: text(body).slice(0, 1000), occurredAt, kind, stateBefore: before, stateAfter: after };
}

async function parseBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { response: error(413, 'payload_too_large', 'The producer action is too large.') };
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return { response: error(415, 'unsupported_media_type', 'Expected application/json.') };
  let raw = '';
  try { raw = await request.text(); } catch (_) { return { response: error(400, 'invalid_body', 'The producer action could not be read.') }; }
  if (!raw || raw.length > MAX_BODY_BYTES) return { response: error(raw ? 413 : 400, 'invalid_body', 'A valid producer action is required.') };
  try { return { payload: JSON.parse(raw) }; } catch (_) { return { response: error(400, 'invalid_json', 'The producer action is not valid JSON.') }; }
}

export async function handleSmsProducerHandoff(request, options = {}) {
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const store = options.store;
  if (!store?.get || !store?.setJSON || !store?.list) return error(503, 'storage_unavailable', 'SMS producer handoff storage is unavailable.');

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const id = text(url.searchParams.get('conversation_id'));
    if (id) {
      if (!LIVE_ID.test(id)) return error(422, 'invalid_conversation_id', 'A valid live SMS conversation ID is required.');
      const conversation = cleanConversation(await store.get(`${LIVE_CONVERSATION_PREFIX}${id}`));
      if (!conversation) return error(404, 'conversation_not_found', 'The live SMS conversation was not found.');
      return json({ ok: true, conversation });
    }
    const listed = await store.list({ prefix: LIVE_CONVERSATION_PREFIX, limit: 100 });
    const keys = (listed?.blobs || []).map(item => item.key).filter(key => key.startsWith(LIVE_CONVERSATION_PREFIX));
    const loaded = await Promise.all(keys.map(key => store.get(key)));
    const conversations = loaded.map(cleanConversation).filter(Boolean).filter(item => ['awaiting_producer', 'human_takeover'].includes(item.state)).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return json({ ok: true, count: conversations.length, conversations });
  }

  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'GET or POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Producer SMS actions can only be changed from this CoverageFit site.');
  const parsed = await parseBody(request);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.conversationId);
  const action = text(parsed.payload?.action).toLowerCase();
  if (!LIVE_ID.test(id)) return error(422, 'invalid_conversation_id', 'A valid live SMS conversation ID is required.');
  if (!SMS_PRODUCER_ACTIONS.includes(action)) return error(422, 'invalid_action', 'Unsupported producer SMS action.');
  const key = `${LIVE_CONVERSATION_PREFIX}${id}`;
  let conversation = cleanConversation(await store.get(key));
  if (!conversation) return error(404, 'conversation_not_found', 'The live SMS conversation was not found.');
  const occurredAt = nowIso(options);
  const before = conversation.state;

  if (action === 'resend_handoff') {
    const url = text(conversation.handoff?.url);
    if (!url) return error(409, 'handoff_unavailable', 'This conversation does not have a CoverageFit continuation link to resend.');
    const message = `Here is your secure CoverageFit continuation link again: ${url}`;
    await sendSmsThroughGateway({
      to: conversation.contactPhone,
      message,
      origin: 'producer_console',
      workflow: conversation.orchestration?.workflow?.type || 'coveragefit_handoff',
      replyRoute: 'producer',
      ownershipEffect: 'producer',
      replyContext: 'coveragefit_handoff',
      idempotencyKey: `producer-handoff:${id}:${occurredAt}`.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 120)
    }, { ...options, store, env: options.env || {} });
    conversation = cleanConversation(await store.get(key)) || conversation;
  } else {
    const canonicalAction = ({ pause: 'pause_automation', resume: 'return_to_coveragefit', complete: 'close_workflow', not_proceeding: 'close_workflow' })[action] || action;
    const permission = smsPermissionSnapshot(conversation, { occurredAt });
    const requestedOwner = text(parsed.payload?.owner).toLowerCase();
    const releaseWouldResumeCoverageFit = canonicalAction === 'release_ownership'
      && (text(conversation.orchestration?.workflow?.type).startsWith('coveragefit_') || text(conversation.orchestration?.workflow?.type) === 'coveragefit_intake')
      && conversation.orchestration?.workflow?.status !== 'completed';
    const automationReactivation = ['return_to_coveragefit', 'resume_workflow'].includes(canonicalAction)
      || releaseWouldResumeCoverageFit
      || (canonicalAction === 'transfer_ownership' && requestedOwner === 'coveragefit')
      || (canonicalAction === 'start_workflow' && text(parsed.payload?.workflowType).toLowerCase().startsWith('coveragefit_'));
    if (automationReactivation && !permission.allowed) {
      return error(409, 'sms_channel_suppressed', 'SMS automation cannot be resumed while the channel is opted out or provider-suppressed.');
    }
    const currentWorkflowState = text(conversation.orchestration?.workflow?.state);
    const currentWorkflowType = text(conversation.orchestration?.workflow?.type);
    const validCoverageFitState = SMS_STATES.includes(currentWorkflowState)
      && !['new', 'human_takeover', 'opted_out', 'completed', 'awaiting_producer'].includes(currentWorkflowState);
    const exactResumeState = validCoverageFitState ? currentWorkflowState : determineGuidedResumeState(conversation);
    let note = '';

    if (canonicalAction === 'take_ownership' || canonicalAction === 'pause_automation') {
      conversation.preTakeoverState = currentWorkflowState || determineGuidedResumeState(conversation);
      conversation.orchestration = canonicalAction === 'take_ownership'
        ? applySmsOwnershipOperation(conversation, 'transfer', { occurredAt, owner: 'producer', reason: 'producer_took_ownership' })
        : takeProducerOwnership(conversation, { occurredAt, reason: 'producer_paused_automation' });
      conversation.orchestration = clearSmsReplyContext({ ...conversation, orchestration: conversation.orchestration }, { occurredAt });
      conversation.state = 'human_takeover';
      note = canonicalAction === 'take_ownership' ? 'Dylan took ownership of the SMS relationship.' : 'Automation paused by Dylan.';
    } else if (canonicalAction === 'return_to_coveragefit') {
      if (!currentWorkflowType.startsWith('coveragefit_') && currentWorkflowType !== 'coveragefit_intake') return error(409, 'coveragefit_workflow_unavailable', 'This conversation does not have a CoverageFit workflow to resume.');
      conversation.state = exactResumeState;
      conversation.orchestration = releaseToCoverageFit(conversation, exactResumeState, { occurredAt, reason: 'producer_returned_to_coveragefit' });
      conversation.orchestration = clearSmsReplyContext({ ...conversation, orchestration: conversation.orchestration }, { occurredAt });
      note = 'Conversation returned to the preserved CoverageFit workflow.';
    } else if (canonicalAction === 'resume_workflow') {
      conversation.orchestration = applySmsOwnershipOperation(conversation, 'resume', { occurredAt, reason: 'producer_resumed_workflow' });
      if (currentWorkflowType.startsWith('coveragefit_') || currentWorkflowType === 'coveragefit_intake') {
        conversation.state = exactResumeState;
        conversation.orchestration = releaseToCoverageFit(conversation, exactResumeState, { occurredAt, reason: 'producer_resumed_workflow' });
      } else {
        conversation.state = 'human_takeover';
      }
      note = 'Current workflow resumed without replacing its workflow episode.';
    } else if (canonicalAction === 'close_workflow') {
      const outcome = action === 'not_proceeding' ? 'not_proceeding' : text(parsed.payload?.outcome, 'completed');
      conversation.orchestration = applySmsOwnershipOperation(conversation, 'close', { occurredAt, reason: 'producer_closed_workflow', outcome });
      conversation.state = 'completed';
      conversation.completedAt = occurredAt;
      conversation.producerDisposition = outcome;
      note = outcome === 'not_proceeding' ? 'Workflow marked not proceeding by Dylan.' : 'Workflow closed by Dylan.';
    } else if (canonicalAction === 'start_workflow') {
      const workflowType = text(parsed.payload?.workflowType).toLowerCase();
      if (!SMS_PRODUCER_START_WORKFLOWS.includes(workflowType)) return error(422, 'invalid_workflow_type', 'A supported workflow type is required.');
      const started = startSmsWorkflowEpisode(conversation, workflowType, { occurredAt, previousOutcome: 'superseded_by_new_workflow' });
      conversation.orchestration = started.orchestration;
      conversation.state = started.legacyState;
      conversation.intent = started.intent;
      if (started.resetAnswers) conversation.answers = {};
      conversation.handoff = null;
      conversation.completedAt = '';
      conversation.producerDisposition = '';
      conversation.preTakeoverState = started.orchestration.workflow.state;
      note = `Started new workflow: ${workflowType}.`;
    } else if (canonicalAction === 'transfer_ownership') {
      const owner = text(parsed.payload?.owner).toLowerCase();
      if (!SMS_CONVERSATION_OWNERS.includes(owner) || owner === 'none') return error(422, 'invalid_owner', 'A supported non-empty ownership target is required.');
      conversation.preTakeoverState = currentWorkflowState || conversation.preTakeoverState;
      conversation.orchestration = applySmsOwnershipOperation(conversation, 'transfer', { occurredAt, owner, reason: 'producer_transferred_ownership' });
      if (owner === 'coveragefit') {
        conversation.state = exactResumeState;
        conversation.orchestration = releaseToCoverageFit(conversation, exactResumeState, { occurredAt, reason: 'producer_transferred_to_coveragefit' });
      } else conversation.state = 'human_takeover';
      note = `Ownership transferred to ${owner}.`;
    } else if (canonicalAction === 'release_ownership') {
      if ((currentWorkflowType.startsWith('coveragefit_') || currentWorkflowType === 'coveragefit_intake') && conversation.orchestration?.workflow?.status !== 'completed') {
        conversation.state = exactResumeState;
        conversation.orchestration = releaseToCoverageFit(conversation, exactResumeState, { occurredAt, reason: 'producer_released_to_preserved_coveragefit' });
        conversation.orchestration = clearSmsReplyContext({ ...conversation, orchestration: conversation.orchestration }, { occurredAt });
        note = 'Producer ownership released and the preserved CoverageFit workflow resumed.';
      } else {
        conversation.orchestration = applySmsOwnershipOperation(conversation, 'release', { occurredAt, reason: 'producer_released_ownership' });
        conversation.state = 'human_takeover';
        note = 'Explicit conversation ownership released; workflow context remains preserved.';
      }
    } else if (canonicalAction === 'clear_reply_context') {
      conversation.orchestration = clearSmsReplyContext(conversation, { occurredAt });
      note = 'Expiring reply context cleared.';
    } else {
      return error(422, 'invalid_action', 'Unsupported producer SMS action.');
    }

    const disposition = action === 'not_proceeding' ? 'not_proceeding' : action === 'complete' ? 'completed' : text(conversation.producerDisposition);
    if (action === 'not_proceeding' || action === 'complete') conversation.producerDisposition = disposition;
    conversation.transcript = [...conversation.transcript, transcriptItem(note, occurredAt, before, conversation.state)].slice(-80);
  }
  conversation.updatedAt = occurredAt;
  conversation.producerSummary = buildSmsProducerSummary(conversation);
  await store.setJSON(key, conversation, { metadata: metadata(conversation) });
  await writeOpsAudit(store, `producer_${action}`, { conversationId: id, detail: `Producer action: ${action}` }, options);
  return json({ ok: true, action, conversation });
}
