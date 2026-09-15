import { authorizeProducer } from './consultation-inbox-core.mjs';
import { timingSafeTextEqual } from './runtime-crypto.mjs';
import { createSmsHandoff } from './sms-handoff-core.mjs';
import { partnerRegistryFromEnv, resolveSmsPartnerAttribution } from './realtor-partner-registry.mjs';
import { buildSmsProducerSummary } from './sms-producer-handoff-core.mjs';
import { upsertSmsLeadJourney } from './lead-operations-core.mjs';
import { queueSmsRetry, updateWebhookHealth, writeOpsAudit } from './sms-operations-core.mjs';
import {
  normalizeSmsProducerAlert,
  prepareSmsProducerAlert,
  sendSmsProducerAlert
} from './sms-producer-alert.mjs';
import {
  SMS_ENGINE_BUILD,
  SMS_INTENT_MENU,
  SMS_STATES,
  normalizeSmsCommand,
  routeSmsInbound
} from './sms-conversation-core.mjs';
import {
  applySmsConsentCommand,
  normalizeSmsConsent
} from './sms-consent-core.mjs';
import {
  SMS_ORCHESTRATOR_BUILD,
  applyCoverageFitResult,
  clearSmsReplyContext,
  markProducerInbound,
  markSpecializedInbound,
  normalizeSmsOrchestration,
  orchestrationSummary,
  resolveSmsInboundRoute,
  startSmsWorkflowEpisode,
  takeProducerOwnership
} from './sms-orchestrator-core.mjs';
import {
  SMS_OUTBOUND_GATEWAY_BUILD,
  applyRegisteredOutboundToConversation,
  markOutboundRegistrationWebhookSeen,
  resolveOutboundRegistration,
  sendSmsThroughGateway,
  smsLiveConversationId
} from './sms-outbound-gateway.mjs';
import {
  RingCentralApiError,
  createOrRenewRingCentralSmsWebhook,
  findConfiguredSmsNumber,
  findSmsWebhookSubscription,
  listRingCentralPhoneNumbers,
  listRingCentralSubscriptions,
  maintainRingCentralSmsWebhook,
  missingRingCentralConfiguration,
  normalizeE164,
  phoneNumberSupportsSms,
  readRingCentralMessage,
  ringCentralConfig,
  ringCentralSubscriptionHealth
} from './ringcentral-client.mjs';
import {
  handleCallbackInbound,
  markCallbackSequenceReplied,
  shouldHandleCallbackInbound
} from './sms-callback-scheduling-core.mjs';
import { sendProducerCallNowAlert } from './producer-booking-alert-core.mjs';
import {
  noteConfirmedRingCentralWebhookEvent,
  recoverMissedRingCentralSms,
  ringCentralRecoveryStatus
} from './ringcentral-webhook-recovery-core.mjs';

export const RC_SMS_CONNECTION_BUILD = 'RC-SMS-1.11.1';
export const RC_SMS_WELCOME_MESSAGE = SMS_INTENT_MENU;
export const LIVE_CONVERSATION_PREFIX = 'sms-live-conversations/';
export const LIVE_EVENT_PREFIX = 'sms-live-events/';
export const RINGCENTRAL_MAINTENANCE_STATE_KEY = 'sms-ops/health/ringcentral-subscription-maintenance';
const MAX_WEBHOOK_BYTES = 64000;
const MAX_TRANSCRIPT_ITEMS = 60;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function nowIso(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function error(status, code, message) {
  return json({ ok: false, error: { code, message } }, status);
}

function sameOrigin(request) {
  const origin = text(request.headers.get('origin'));
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
}

function maskNumber(value) {
  const number = normalizeE164(value);
  return number ? `+1 ••• ••• ${number.slice(-4)}` : '';
}

function safeSubscription(record, options = {}) {
  if (!record || typeof record !== 'object') return null;
  const health = ringCentralSubscriptionHealth(record, options);
  return {
    id: text(record.id).slice(0, 120),
    status: text(record.status, 'Unknown').slice(0, 40),
    expirationTime: text(record.expirationTime).slice(0, 60),
    expiresIn: Number(record.expiresIn) || 0,
    healthy: health.active,
    healthState: health.state,
    healthReason: health.reason,
    remainingSeconds: health.remainingSeconds
  };
}

async function readMaintenanceState(store) {
  if (!store?.get) return null;
  const record = await store.get(RINGCENTRAL_MAINTENANCE_STATE_KEY).catch(() => null);
  if (!record || typeof record !== 'object') return null;
  return {
    status: text(record.status).slice(0, 40),
    action: text(record.action).slice(0, 40),
    subscriptionHealth: text(record.subscriptionHealth).slice(0, 40),
    checkedAt: text(record.checkedAt).slice(0, 60),
    nextExpirationTime: text(record.nextExpirationTime).slice(0, 60),
    errorCode: text(record.errorCode).slice(0, 80)
  };
}

async function writeMaintenanceState(store, patch = {}, options = {}) {
  if (!store?.setJSON) return null;
  const checkedAt = nowIso(options);
  const record = {
    build: RC_SMS_CONNECTION_BUILD,
    status: text(patch.status, 'ok').slice(0, 40),
    action: text(patch.action, 'checked').slice(0, 40),
    subscriptionHealth: text(patch.subscriptionHealth).slice(0, 40),
    checkedAt,
    nextExpirationTime: text(patch.nextExpirationTime).slice(0, 60),
    errorCode: text(patch.errorCode).slice(0, 80)
  };
  await store.setJSON(RINGCENTRAL_MAINTENANCE_STATE_KEY, record, { metadata: { status: record.status, action: record.action, createdAt: checkedAt, updatedAt: checkedAt } }).catch(() => null);
  return record;
}

function subscriptionConnectionState(senderReady, health) {
  if (!senderReady) return 'sender_unavailable';
  if (health.active) return 'connected';
  return `subscription_${health.state}`;
}

function transcriptItem(direction, body, occurredAt, options = {}) {
  return {
    id: text(options.id, `${direction}-${occurredAt}`).slice(0, 120),
    direction,
    body: text(body).slice(0, 1000),
    occurredAt,
    kind: text(options.kind, direction === 'inbound' ? 'prospect' : 'automation').slice(0, 40),
    stateBefore: text(options.stateBefore).slice(0, 40),
    stateAfter: text(options.stateAfter).slice(0, 40)
  };
}

function normalizeLiveConversation(value) {
  if (!value || typeof value !== 'object' || !/^sms-live-[a-f0-9]{32,64}$/i.test(text(value.id))) return null;
  const contactPhone = normalizeE164(value.contactPhone);
  const businessPhone = normalizeE164(value.businessPhone);
  if (!contactPhone || !businessPhone) return null;
  const state = text(value.state).toLowerCase();
  return {
    schemaVersion: '1.6',
    engineBuild: SMS_ENGINE_BUILD,
    build: RC_SMS_CONNECTION_BUILD,
    id: text(value.id),
    channel: 'ringcentral_sms',
    contactPhone,
    businessPhone,
    state: SMS_STATES.includes(state) ? state : 'new',
    intent: text(value.intent).slice(0, 40),
    answers: value.answers && typeof value.answers === 'object' && !Array.isArray(value.answers) ? JSON.parse(JSON.stringify(value.answers)) : {},
    attribution: value.attribution && typeof value.attribution === 'object' && !Array.isArray(value.attribution) ? JSON.parse(JSON.stringify(value.attribution)) : null,
    invalidIntentAttempts: Math.max(0, Math.min(2, Number(value.invalidIntentAttempts) || 0)),
    lastCommand: text(value.lastCommand).slice(0, 40),
    welcomeSentAt: text(value.welcomeSentAt),
    optedOutAt: text(value.optedOutAt),
    resumedAt: text(value.resumedAt),
    inboundCount: Math.max(0, Number(value.inboundCount) || 0),
    outboundCount: Math.max(0, Number(value.outboundCount) || 0),
    lastInboundAt: text(value.lastInboundAt),
    lastOutboundAt: text(value.lastOutboundAt),
    transcript: Array.isArray(value.transcript) ? value.transcript.filter(item => item && typeof item === 'object').slice(-MAX_TRANSCRIPT_ITEMS) : [],
    createdAt: text(value.createdAt),
    handoff: value.handoff && typeof value.handoff === 'object' ? { url: text(value.handoff.url), createdAt: text(value.handoff.createdAt), expiresAt: text(value.handoff.expiresAt) } : null,
    producerSummary: value.producerSummary && typeof value.producerSummary === 'object' ? JSON.parse(JSON.stringify(value.producerSummary)) : null,
    producerAlert: normalizeSmsProducerAlert(value.producerAlert),
    producerDisposition: text(value.producerDisposition),
    manualTakeoverAt: text(value.manualTakeoverAt),
    completedAt: text(value.completedAt),
    preTakeoverState: text(value.preTakeoverState),
    registeredOwnershipAt: text(value.registeredOwnershipAt),
    deliveryFailure: value.deliveryFailure && typeof value.deliveryFailure === 'object' ? JSON.parse(JSON.stringify(value.deliveryFailure)) : null,
    retryPending: Boolean(value.retryPending),
    outboundContext: value.outboundContext && typeof value.outboundContext === 'object' ? JSON.parse(JSON.stringify(value.outboundContext)) : null,
    callbackSequence: value.callbackSequence && typeof value.callbackSequence === 'object' ? JSON.parse(JSON.stringify(value.callbackSequence)) : null,
    callbackScheduling: value.callbackScheduling && typeof value.callbackScheduling === 'object' ? JSON.parse(JSON.stringify(value.callbackScheduling)) : null,
    callbackPreparation: value.callbackPreparation && typeof value.callbackPreparation === 'object' ? JSON.parse(JSON.stringify(value.callbackPreparation)) : null,
    orchestration: normalizeSmsOrchestration(value),
    smsConsent: normalizeSmsConsent(value),
    updatedAt: text(value.updatedAt)
  };
}

function appendTranscript(conversation, ...items) {
  return { ...conversation, transcript: [...conversation.transcript, ...items].slice(-MAX_TRANSCRIPT_ITEMS) };
}

function metadata(conversation) {
  return {
    state: conversation.state,
    intent: conversation.intent,
    channel: conversation.channel,
    engineBuild: SMS_ENGINE_BUILD,
    build: RC_SMS_CONNECTION_BUILD,
    inboundCount: conversation.inboundCount,
    outboundCount: conversation.outboundCount,
    invalidIntentAttempts: conversation.invalidIntentAttempts,
    welcomeSent: Boolean(conversation.welcomeSentAt),
    optedOut: conversation.smsConsent?.status === 'opted_out' || conversation.state === 'opted_out',
    priority: conversation.answers?.priority || 'standard',
    partnerId: conversation.attribution?.partnerId || '',
    referralSource: conversation.attribution?.referralSource || '',
    entryMethod: conversation.attribution?.entryMethod || '',
    producerAlertState: conversation.producerAlert?.state || '',
    producerAlertType: conversation.producerAlert?.type || '',
    owner: conversation.orchestration?.ownership?.owner || '',
    automationMode: conversation.orchestration?.automationMode || '',
    workflowType: conversation.orchestration?.workflow?.type || '',
    workflowStatus: conversation.orchestration?.workflow?.status || '',
    workflowState: conversation.orchestration?.workflow?.state || '',
    orchestratorBuild: SMS_ORCHESTRATOR_BUILD,
    outboundGatewayBuild: SMS_OUTBOUND_GATEWAY_BUILD,
    outboundOrigin: conversation.outboundContext?.origin || '',
    replyRoute: conversation.outboundContext?.replyRoute || '',
    replyContextRoute: conversation.orchestration?.replyContext?.route || '',
    consentStatus: conversation.smsConsent?.status || '',
    providerConsentStatus: conversation.smsConsent?.providerStatus || '',
    replyContextType: conversation.orchestration?.replyContext?.context || '',
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

async function deliverProducerAlert(store, conversationKey, conversation, alert, request, options = {}) {
  const delivered = await sendSmsProducerAlert(conversation, alert, {
    env: options.env || {},
    requestUrl: request.url,
    fetch: options.notificationFetch || options.fetch,
    now: options.now
  });
  const latest = normalizeLiveConversation(await store.get(conversationKey));
  if (!latest || latest.producerAlert?.eventId !== delivered.eventId) return delivered;
  latest.producerAlert = delivered;
  await store.setJSON(conversationKey, latest, { metadata: metadata(latest) });
  await writeOpsAudit(store, delivered.state === 'sent' ? 'producer_alert_sent' : `producer_alert_${delivered.state}`, {
    conversationId: latest.id,
    detail: delivered.state === 'sent'
      ? `Privacy-safe ${delivered.type} producer email alert sent.`
      : `Producer email alert ${delivered.state}: ${delivered.reason || 'no reason recorded'}.`
  }, options);
  return delivered;
}

async function acquireEvent(store, key, occurredAt) {
  try {
    await store.setJSON(key, { status: 'processing', build: RC_SMS_CONNECTION_BUILD, occurredAt }, {
      onlyIfNew: true,
      metadata: { status: 'processing', build: RC_SMS_CONNECTION_BUILD, createdAt: occurredAt, updatedAt: occurredAt }
    });
    return true;
  } catch (_) {
    return !(await store.get(key));
  }
}

function normalizeSmsEvent(payload, configuredNumber) {
  const body = payload?.body;
  if (!body || typeof body !== 'object') return { ignored: 'missing_body' };
  if (text(body.type).toUpperCase() !== 'SMS') return { ignored: 'not_sms' };
  const direction = text(body.direction).toLowerCase();
  if (!['inbound', 'outbound'].includes(direction)) return { ignored: 'unsupported_direction' };
  const configured = normalizeE164(configuredNumber);
  const fromNumber = normalizeE164(body.from?.phoneNumber);
  const destinations = Array.isArray(body.to) ? body.to : [];
  const target = destinations.find(item => item?.target === true) || destinations[0];
  const toNumber = normalizeE164(target?.phoneNumber);
  if (!fromNumber || !toNumber) return { ignored: 'missing_phone_number' };
  if (direction === 'inbound' && configured !== toNumber) return { ignored: 'different_destination' };
  if (direction === 'outbound' && configured !== fromNumber) return { ignored: 'different_source' };
  const messageId = text(body.id || payload.uuid).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120);
  if (!messageId) return { ignored: 'missing_message_id' };
  return {
    ignored: '',
    direction,
    messageId,
    fromNumber,
    toNumber,
    prospectNumber: direction === 'inbound' ? fromNumber : toNumber,
    businessNumber: configured,
    body: text(body.subject).slice(0, 1000),
    occurredAt: text(body.creationTime || payload.timestamp)
  };
}

async function verifySmsEventAgainstRingCentral(event, env, options = {}) {
  let record;
  try {
    record = await readRingCentralMessage(event.messageId, env, options);
  } catch (_) {
    return false;
  }
  if (!record || typeof record !== 'object') return false;
  const id = text(record.id).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120);
  const direction = text(record.direction).toLowerCase();
  const fromNumber = normalizeE164(record.from?.phoneNumber);
  const destinations = Array.isArray(record.to) ? record.to : [];
  const toNumber = normalizeE164((destinations.find(item => item?.target === true) || destinations[0])?.phoneNumber);
  return id === event.messageId
    && text(record.type).toUpperCase() === 'SMS'
    && direction === event.direction
    && fromNumber === event.fromNumber
    && toNumber === event.toNumber;
}

async function parseWebhookBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) return { response: error(413, 'payload_too_large', 'Webhook payload is too large.') };
  let raw = '';
  try { raw = await request.text(); } catch (_) { return { response: error(400, 'invalid_body', 'Webhook body could not be read.') }; }
  if (raw.length > MAX_WEBHOOK_BYTES) return { response: error(413, 'payload_too_large', 'Webhook payload is too large.') };
  if (!raw.trim()) return { raw, payload: null };
  try { return { raw, payload: JSON.parse(raw) }; } catch (_) { return { response: error(400, 'invalid_json', 'Webhook payload is not valid JSON.') }; }
}

export async function handleRingCentralWebhook(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  const parsed = await parseWebhookBody(request);
  if (parsed.response) return parsed.response;

  const validationHeader = text(request.headers.get('validation-token'));
  const verificationHeader = text(request.headers.get('verification-token'));
  if (validationHeader && !parsed.raw?.trim()) {
    return new Response('', {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Validation-Token': validationHeader,
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  }

  const env = options.env || {};
  const config = ringCentralConfig(env);
  const missing = missingRingCentralConfiguration(env, { forWebhookOnly: true });
  if (missing.length) return error(503, 'ringcentral_webhook_not_configured', 'RingCentral webhook configuration is incomplete.');
  // `Validation-Token` is the developer-supplied Subscription API secret and
  // can be checked directly. `Verification-Token` is a separate RingCentral
  // token and must not be compared to our validation secret. When the
  // developer validation header is absent, authenticate the event by reading
  // the referenced message back from RingCentral before processing it.
  if (validationHeader && !timingSafeTextEqual(validationHeader, config.webhookValidationToken)) {
    return error(401, 'invalid_validation_token', 'RingCentral webhook validation failed.');
  }
  const store = options.store;
  if (!store?.get || !store?.setJSON || !store?.delete) return error(503, 'storage_unavailable', 'SMS connection storage is unavailable.');

  const event = normalizeSmsEvent(parsed.payload, config.fromNumber);
  if (event.ignored) return json({ ok: true, ignored: true, reason: event.ignored });
  if (!validationHeader) {
    const verifiedByApi = await verifySmsEventAgainstRingCentral(event, env, options);
    if (!verifiedByApi) return error(401, 'unverified_ringcentral_event', 'RingCentral webhook event could not be authenticated.');
  }
  const occurredAt = event.occurredAt || nowIso(options);
  await noteConfirmedRingCentralWebhookEvent(store, { ...event, occurredAt }, {
    ...options,
    recoveryReplay: request.headers.get('x-coveragefit-recovery-replay') === '1'
  });
  const eventKey = `${LIVE_EVENT_PREFIX}${event.messageId}`;
  const existingEvent = await store.get(eventKey);
  if (existingEvent) return json({ ok: true, deduped: true });
  const locked = await acquireEvent(store, eventKey, occurredAt);
  if (!locked || await store.get(eventKey).then(value => value?.status !== 'processing')) return json({ ok: true, deduped: true });

  try {
    const conversationId = await smsLiveConversationId(event.prospectNumber, event.businessNumber, config.conversationHashSecret);
    const conversationKey = `${LIVE_CONVERSATION_PREFIX}${conversationId}`;
    const stored = normalizeLiveConversation(await store.get(conversationKey));
    const createdAt = stored?.createdAt || occurredAt;
    let conversation = stored || {
      schemaVersion: '1.6',
      engineBuild: SMS_ENGINE_BUILD,
      build: RC_SMS_CONNECTION_BUILD,
      id: conversationId,
      channel: 'ringcentral_sms',
      contactPhone: event.prospectNumber,
      businessPhone: event.businessNumber,
      state: 'new',
      intent: '',
      answers: {},
      attribution: null,
      invalidIntentAttempts: 0,
      lastCommand: '',
      welcomeSentAt: '',
      optedOutAt: '',
      resumedAt: '',
      inboundCount: 0,
      outboundCount: 0,
      lastInboundAt: '',
      lastOutboundAt: '',
      transcript: [],
      createdAt,
      updatedAt: occurredAt
    };
    conversation.orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
    conversation.smsConsent = normalizeSmsConsent(conversation, { occurredAt });

    const before = conversation.state;
    if (event.direction === 'outbound') {
      const registration = await resolveOutboundRegistration(store, {
        providerMessageId: event.messageId,
        businessPhone: event.businessNumber,
        contactPhone: event.prospectNumber,
        message: event.body,
        occurredAt
      }, options);
      if (registration) {
        conversation = applyRegisteredOutboundToConversation(conversation, registration, {
          providerMessageId: event.messageId,
          message: event.body,
          occurredAt
        });
        conversation.producerSummary = buildSmsProducerSummary(conversation);
        await store.setJSON(conversationKey, conversation, { metadata: metadata(conversation) });
        await markOutboundRegistrationWebhookSeen(store, registration, event.messageId, occurredAt);
        const processedAt = nowIso(options);
        await store.setJSON(eventKey, {
          status: 'processed', replied: false, conversationId, state: conversation.state, direction: 'outbound',
          registeredOutbound: true, outboundOrigin: registration.origin, workflow: registration.workflow,
          replyRoute: registration.replyRoute, ownershipEffect: registration.ownershipEffect,
          matchedBy: registration.matchedBy || 'provider_message_id', build: RC_SMS_CONNECTION_BUILD, occurredAt, processedAt
        }, { metadata: { status: 'processed', replied: false, state: conversation.state, build: RC_SMS_CONNECTION_BUILD, createdAt: occurredAt, updatedAt: processedAt } });
        return json({
          ok: true, deduped: false, replied: false, registeredOutbound: true, state: conversation.state,
          outboundOrigin: registration.origin, replyRoute: registration.replyRoute,
          ownershipEffect: registration.ownershipEffect, matchedBy: registration.matchedBy || 'provider_message_id'
        });
      }
      const knownAutomation = conversation.transcript.some(item => text(item?.id) === `rc-${event.messageId}` && ['automation', 'operator', 'automation_retry'].includes(text(item?.kind)));
      if (knownAutomation) {
        const processedAt = nowIso(options);
        await store.setJSON(eventKey, { status: 'processed', replied: false, conversationId, state: conversation.state, direction: 'outbound', automationEcho: true, build: RC_SMS_CONNECTION_BUILD, occurredAt, processedAt }, { metadata: { status: 'processed', replied: false, state: conversation.state, build: RC_SMS_CONNECTION_BUILD, createdAt: occurredAt, updatedAt: processedAt } });
        return json({ ok: true, deduped: false, replied: false, automationEcho: true, state: conversation.state });
      }
      conversation = appendTranscript(conversation, transcriptItem('outbound', event.body, occurredAt, {
        id: `rc-${event.messageId}`,
        kind: 'producer',
        stateBefore: before,
        stateAfter: 'human_takeover'
      }));
      conversation.orchestration = takeProducerOwnership(conversation, { occurredAt, reason: 'unregistered_outbound_message' });
      conversation.orchestration = clearSmsReplyContext({ ...conversation, orchestration: conversation.orchestration }, { occurredAt });
      conversation.preTakeoverState = conversation.orchestration.workflow.state;
      conversation.state = 'human_takeover';
      conversation.manualTakeoverAt = occurredAt;
      conversation.outboundContext = {
        providerMessageId: event.messageId,
        origin: 'external_unknown',
        workflow: 'unknown',
        replyRoute: 'producer',
        ownershipEffect: 'producer',
        registrationId: '',
        registeredAt: '',
        sentAt: occurredAt,
        updatedAt: occurredAt
      };
      conversation.lastOutboundAt = occurredAt;
      conversation.outboundCount += 1;
      conversation.updatedAt = occurredAt;
      conversation.producerSummary = buildSmsProducerSummary(conversation);
      await store.setJSON(conversationKey, conversation, { metadata: metadata(conversation) });
      const processedAt = nowIso(options);
      await store.setJSON(eventKey, { status: 'processed', replied: false, conversationId, state: conversation.state, direction: 'outbound', manualTakeover: true, outboundOrigin: 'external_unknown', build: RC_SMS_CONNECTION_BUILD, occurredAt, processedAt }, { metadata: { status: 'processed', replied: false, state: conversation.state, build: RC_SMS_CONNECTION_BUILD, createdAt: occurredAt, updatedAt: processedAt } });
      return json({ ok: true, deduped: false, replied: false, manualTakeover: true, outboundOrigin: 'external_unknown', state: conversation.state });
    }

    conversation = appendTranscript(conversation, transcriptItem('inbound', event.body, occurredAt, {
      id: `rc-${event.messageId}`,
      stateBefore: before,
      stateAfter: before
    }));
    conversation.inboundCount += 1;
    conversation.lastInboundAt = occurredAt;
    conversation.updatedAt = occurredAt;

    const partnerRegistry = options.partnerRegistry || partnerRegistryFromEnv(env);
    const partnerResolution = resolveSmsPartnerAttribution(event.body, partnerRegistry);
    if (partnerResolution.active) conversation.attribution = partnerResolution.attribution;

    const globalConsentCommand = normalizeSmsCommand(event.body);
    if (globalConsentCommand === 'stop' || globalConsentCommand === 'start') {
      await markCallbackSequenceReplied(conversation, event.body, { ...options, env, store, now: occurredAt });
      conversation = applySmsConsentCommand(conversation, globalConsentCommand, { occurredAt });
      conversation.updatedAt = occurredAt;
      conversation.producerSummary = buildSmsProducerSummary(conversation);
      await store.setJSON(conversationKey, conversation, { metadata: metadata(conversation) });
      await writeOpsAudit(store, `sms_consent_${globalConsentCommand}`, {
        conversationId,
        detail: globalConsentCommand === 'stop' ? 'Customer globally suppressed automated SMS.' : 'Customer restored SMS channel permission without restarting a workflow.'
      }, options);
      const processedAt = nowIso(options);
      await store.setJSON(eventKey, {
        status: 'processed', replied: false, conversationId, state: conversation.state, direction: 'inbound',
        routedTo: globalConsentCommand === 'stop' ? 'suppressed' : 'consent', routeReason: `global_${globalConsentCommand}_command`,
        consentStatus: conversation.smsConsent?.status || '', build: RC_SMS_CONNECTION_BUILD, occurredAt, processedAt
      }, { metadata: { status: 'processed', replied: false, state: conversation.state, build: RC_SMS_CONNECTION_BUILD, createdAt: occurredAt, updatedAt: processedAt } });
      await updateWebhookHealth(store, { success: true }, options);
      return json({
        ok: true, deduped: false, replied: false, state: conversation.state,
        routedTo: globalConsentCommand === 'stop' ? 'suppressed' : 'consent', routeReason: `global_${globalConsentCommand}_command`,
        consent: conversation.smsConsent, orchestration: orchestrationSummary(conversation)
      });
    }

    // A response to any callback invitation—including an AgencyZoom message
    // seen as an unregistered RingCentral outbound—stops the remaining callback
    // sequence. Date/time replies then enter the bounded appointment workflow.
    await markCallbackSequenceReplied(conversation, event.body, { ...options, env, store, now: occurredAt });
    if (shouldHandleCallbackInbound(conversation, event.body, { ...options, env, now: occurredAt })) {
      const callbackResult = await handleCallbackInbound(conversation, event.body, {
        ...options,
        env,
        store,
        now: occurredAt,
        origin: new URL(request.url).origin
      });
      if (callbackResult.handled) {
        const callAnytime = callbackResult.contactChoice === 'anytime';
        const callNow = callbackResult.contactChoice === 'now';
        const exitsScheduling = callAnytime || callNow;
        conversation = callbackResult.conversation;
        conversation.preTakeoverState = conversation.orchestration?.workflow?.state || conversation.preTakeoverState || before;
        conversation.orchestration = markSpecializedInbound(conversation, 'appointment', { occurredAt, reason: 'callback_scheduling_reply' });
        if (exitsScheduling) {
          conversation.orchestration = clearSmsReplyContext({ ...conversation, orchestration: conversation.orchestration }, { occurredAt });
        }
        conversation.state = 'human_takeover';
        conversation.updatedAt = occurredAt;
        let replied = false;
        const replyBody = text(callbackResult.reply);
        if (replyBody) {
          try {
            await sendSmsThroughGateway({
              to: event.fromNumber,
              message: replyBody,
              origin: 'appointment',
              workflow: 'missed_call_callback_v1',
              replyRoute: 'appointment',
              ownershipEffect: 'transfer',
              ownershipTarget: 'appointment',
              replyContext: exitsScheduling ? '' : 'callback_time_request',
              replyContextTtlSeconds: exitsScheduling ? 0 : 7 * 86400,
              idempotencyKey: `callback-reply:${event.messageId}`
            }, { ...options, env, store, conversationSnapshot: conversation });
            conversation = normalizeLiveConversation(await store.get(conversationKey)) || conversation;
            conversation.deliveryFailure = null;
            conversation.retryPending = false;
            replied = true;
          } catch (sendError) {
            const retry = await queueSmsRetry(store, {
              conversationId,
              to: event.fromNumber,
              body: replyBody,
              sourceMessageId: event.messageId,
              origin: 'appointment',
              workflow: 'missed_call_callback_v1',
              replyRoute: 'appointment',
              ownershipEffect: 'transfer',
              error: sendError?.message
            }, options);
            conversation.deliveryFailure = { at: occurredAt, code: text(sendError?.code, 'ringcentral_send_failed'), message: 'Callback SMS delivery failed and was queued for retry.' };
            conversation.retryPending = Boolean(retry);
          }
        }
        // Only offer preparation after the confirmation was successfully sent.
        // A failed optional invitation never changes or retries the booking.
        if (replied && callbackResult.followupReply && !conversation.callbackPreparation?.invitedAt) {
          try {
            conversation.callbackPreparation = {...conversation.callbackPreparation, invitedAt: occurredAt, status: 'invited'};
            await sendSmsThroughGateway({
              to: event.fromNumber, message: callbackResult.followupReply,
              origin: 'appointment', workflow: 'missed_call_callback_v1', replyRoute: 'appointment',
              ownershipEffect: 'preserve',
              idempotencyKey: `callback-preparation:${conversation.callbackScheduling.googleEventId}`
            }, {...options, env, store, conversationSnapshot: conversation});
            conversation = normalizeLiveConversation(await store.get(conversationKey)) || conversation;
          } catch (_) {
            conversation.callbackPreparation = {...conversation.callbackPreparation, invitationDelivery: 'failed'};
          }
        }
        let producerAlert = null;
        if (callNow) {
          producerAlert = await sendProducerCallNowAlert({
            eventId: event.messageId,
            firstName: conversation.callbackSequence?.firstName || conversation.answers?.firstName || '',
            prospectPhone: event.fromNumber,
            customerMessage: event.body
          }, { ...options, env, store });
          conversation.callbackScheduling = {
            ...(conversation.callbackScheduling || {}),
            producerAlert: {
              status: producerAlert.status,
              reason: producerAlert.reason || '',
              attemptedAt: occurredAt
            }
          };
          await writeOpsAudit(store, `sms_call_now_alert_${producerAlert.status}`, {
            conversationId,
            detail: producerAlert.status === 'sent'
              ? 'Producer received an immediate call-now SMS alert.'
              : `Producer call-now SMS alert ${producerAlert.status}: ${producerAlert.reason || 'unknown reason'}.`
          }, options);
        }
        conversation.producerSummary = buildSmsProducerSummary(conversation);
        await store.setJSON(conversationKey, conversation, { metadata: metadata(conversation) });
        const processedAt = nowIso(options);
        await store.setJSON(eventKey, {
          status: 'processed', replied, conversationId, state: conversation.state, direction: 'inbound',
          routedTo: 'appointment', routeReason: 'callback_scheduling_reply', callbackStatus: conversation.callbackScheduling?.status || '',
          build: RC_SMS_CONNECTION_BUILD, occurredAt, processedAt
        }, { metadata: { status: 'processed', replied, state: conversation.state, build: RC_SMS_CONNECTION_BUILD, createdAt: occurredAt, updatedAt: processedAt } });
        await updateWebhookHealth(store, { success: true }, options);
        return json({ ok: true, deduped: false, replied, deliveryQueued: Boolean(conversation.retryPending), state: conversation.state, routedTo: 'appointment', callbackStatus: conversation.callbackScheduling?.status || '', producerAlertStatus: producerAlert?.status || '', orchestration: orchestrationSummary(conversation) });
      }
    }

    const routeDecision = resolveSmsInboundRoute(conversation, event.body, { occurredAt, partnerRegistry });
    conversation.orchestration = routeDecision.orchestration;
    if (routeDecision.route !== 'coveragefit') {
      if (routeDecision.route === 'producer') {
        conversation.orchestration = markProducerInbound(conversation, { occurredAt, reason: routeDecision.reason });
        conversation.preTakeoverState = conversation.orchestration.workflow.state;
        conversation.state = 'human_takeover';
      } else if (['service', 'life', 'commercial', 'appointment', 'system'].includes(routeDecision.route)) {
        conversation.preTakeoverState = conversation.orchestration.workflow.state;
        conversation.orchestration = markSpecializedInbound(conversation, routeDecision.route, { occurredAt, reason: routeDecision.reason });
        conversation.state = 'human_takeover';
      }
      conversation.updatedAt = occurredAt;
      conversation.producerSummary = buildSmsProducerSummary(conversation);
      await store.setJSON(conversationKey, conversation, { metadata: metadata(conversation) });
      const processedAt = nowIso(options);
      await store.setJSON(eventKey, {
        status: 'processed', replied: false, conversationId, state: conversation.state, direction: 'inbound',
        routedTo: routeDecision.route, routeReason: routeDecision.reason, build: RC_SMS_CONNECTION_BUILD, occurredAt, processedAt
      }, { metadata: { status: 'processed', replied: false, state: conversation.state, build: RC_SMS_CONNECTION_BUILD, createdAt: occurredAt, updatedAt: processedAt } });
      await updateWebhookHealth(store, { success: true }, options);
      return json({
        ok: true, deduped: false, replied: false, state: conversation.state, intent: conversation.intent,
        routedTo: routeDecision.route, routeReason: routeDecision.reason, orchestration: orchestrationSummary(conversation)
      });
    }

    let workflowState = conversation.orchestration?.workflow?.state || before;
    const explicitKeywordReentry = routeDecision.reason === 'explicit_entry_keyword'
      && ['buyer', 'home_review', 'bundle', 'auto', 'life', 'business', 'tech'].includes(routeDecision.intent);
    const completedWorkflowReentry = conversation.orchestration?.workflow?.status === 'completed'
      && routeDecision.reason === 'explicit_coveragefit_intent'
      && ['buyer', 'home_review', 'bundle', 'auto', 'life', 'business', 'tech', 'other'].includes(routeDecision.intent);
    const workflowReentry = explicitKeywordReentry || completedWorkflowReentry;
    if (workflowReentry) {
      const workflowType = ({
        buyer: 'coveragefit_homebuyer',
        home_review: 'coveragefit_home_review',
        bundle: 'coveragefit_bundle',
        auto: 'coveragefit_auto',
        life: 'coveragefit_life',
        business: 'coveragefit_business',
        tech: 'coveragefit_tech',
        other: 'coveragefit_other'
      })[routeDecision.intent];
      const started = startSmsWorkflowEpisode(conversation, workflowType, {
        occurredAt,
        previousOutcome: explicitKeywordReentry ? 'replaced_by_explicit_entry_keyword' : 'completed_before_explicit_reentry'
      });
      conversation.orchestration = started.orchestration;
      conversation.state = 'new';
      conversation.intent = '';
      conversation.answers = {};
      conversation.handoff = null;
      conversation.completedAt = '';
      conversation.producerDisposition = '';
      conversation.preTakeoverState = started.orchestration.workflow.state;
      workflowState = 'new';
    }
    const routed = routeSmsInbound({ ...conversation, state: workflowState }, event.body, {
      mode: 'live',
      isFirstMessage: workflowReentry || (!conversation.welcomeSentAt && conversation.inboundCount === 1),
      now: options.now || occurredAt,
      partnerRegistry
    });
    conversation.state = routed.state || workflowState;
    if (Object.prototype.hasOwnProperty.call(routed, 'intent')) conversation.intent = text(routed.intent).slice(0, 40);
    if (routed.resetAnswers) conversation.answers = {};
    else if (routed.answers && typeof routed.answers === 'object') conversation.answers = { ...conversation.answers, ...routed.answers };
    conversation.invalidIntentAttempts = Math.max(0, Number(routed.invalidIntentAttempts) || 0);
    conversation.lastCommand = text(routed.command).slice(0, 40);
    if (conversation.state === 'opted_out') conversation.optedOutAt = occurredAt;
    if (routed.command === 'start') {
      conversation.optedOutAt = '';
      conversation.resumedAt = occurredAt;
    }
    conversation.orchestration = applyCoverageFitResult(conversation, routed, { occurredAt });

    let replied = false;
    let replyBody = text(routed.reply);
    if (conversation.state === 'coveragefit_ready' && !conversation.handoff?.url) {
      const handoffStore = options.handoffStore || options.store;
      if (!handoffStore?.setJSON) throw new Error('Secure SMS handoff storage is unavailable.');
      const access = await createSmsHandoff(conversation, {
        store: handoffStore,
        now: options.now || occurredAt,
        origin: new URL(request.url).origin,
        operationsStore: store
      });
      conversation.handoff = access;
      replyBody = `${replyBody}

Choose your callback time here: ${access.url}
Dylan will collect any quote or application details during or after your conversation.`;
    }
    if (replyBody) {
      try {
        const coverageFitHandoffReply = conversation.state === 'awaiting_producer'
          && conversation.orchestration?.ownership?.owner === 'producer';
        await sendSmsThroughGateway({
          to: event.fromNumber,
          message: replyBody,
          origin: 'coveragefit',
          workflow: conversation.orchestration?.workflow?.type || 'coveragefit_intake',
          replyRoute: coverageFitHandoffReply ? 'producer' : 'coveragefit',
          ownershipEffect: coverageFitHandoffReply ? 'producer' : 'preserve',
          idempotencyKey: `coveragefit:${event.messageId}`
        }, { ...options, env, store, conversationSnapshot: conversation });
        conversation = normalizeLiveConversation(await store.get(conversationKey)) || conversation;
        conversation.deliveryFailure = null;
        conversation.retryPending = false;
        if (!conversation.welcomeSentAt) conversation.welcomeSentAt = occurredAt;
        replied = true;
      } catch (sendError) {
        const retry = await queueSmsRetry(store, {
          conversationId,
          to: event.fromNumber,
          body: replyBody,
          sourceMessageId: event.messageId,
          origin: 'coveragefit',
          workflow: conversation.orchestration?.workflow?.type || 'coveragefit_intake',
          replyRoute: 'coveragefit',
          ownershipEffect: 'preserve',
          error: sendError?.message
        }, options);
        conversation.deliveryFailure = { at: occurredAt, code: text(sendError?.code, 'ringcentral_send_failed'), message: 'Automated SMS delivery failed and was queued for retry.' };
        conversation.retryPending = Boolean(retry);
        await writeOpsAudit(store, 'delivery_failed', { conversationId, message: sendError?.message || 'Automated SMS delivery failed.' }, options);
      }
    }

    if (conversation.state === 'coveragefit_ready' && conversation.handoff?.url) {
      conversation.state = 'awaiting_producer';
      conversation.orchestration = applyCoverageFitResult(conversation, { ...routed, state: 'awaiting_producer' }, { occurredAt });
    }
    const producerAlert = prepareSmsProducerAlert(conversation, {
      beforeState: before,
      routed,
      occurredAt,
      sourceMessageId: event.messageId
    });
    if (producerAlert) conversation.producerAlert = producerAlert;
    conversation.updatedAt = occurredAt;
    conversation.producerSummary = buildSmsProducerSummary(conversation);
    await store.setJSON(conversationKey, conversation, { metadata: metadata(conversation) });
    if (options.leadStore && conversation.intent) {
      await upsertSmsLeadJourney(options.leadStore, conversation, {
        ...options,
        env,
        waitUntil: options.waitUntil
      }).catch(() => null);
    }
    const processedAt = nowIso(options);
    await store.setJSON(eventKey, {
      status: 'processed',
      replied,
      conversationId,
      state: conversation.state,
      intent: conversation.intent,
      command: conversation.lastCommand,
      build: RC_SMS_CONNECTION_BUILD,
      occurredAt,
      processedAt
    }, { metadata: { status: 'processed', replied, state: conversation.state, build: RC_SMS_CONNECTION_BUILD, createdAt: occurredAt, updatedAt: processedAt } });
    await updateWebhookHealth(store, { success: true }, options);
    if (producerAlert) {
      const delivery = deliverProducerAlert(store, conversationKey, conversation, producerAlert, request, options).catch(async cause => {
        await writeOpsAudit(store, 'producer_alert_failed', {
          conversationId,
          detail: `Producer email alert failed safely: ${text(cause?.message, 'delivery error')}`
        }, options);
      });
      if (typeof options.waitUntil === 'function') options.waitUntil(delivery);
      else await delivery;
    }
    return json({ ok: true, deduped: false, replied, deliveryQueued: Boolean(conversation.retryPending), state: conversation.state, intent: conversation.intent, command: conversation.lastCommand, routedTo: conversation.orchestration?.lastRoute || 'coveragefit', orchestration: orchestrationSummary(conversation) });
  } catch (cause) {
    await store.delete(eventKey).catch(() => {});
    const message = cause instanceof RingCentralApiError ? cause.message : 'The inbound SMS could not be processed.';
    const code = cause instanceof RingCentralApiError ? cause.code : 'sms_processing_failed';
    await updateWebhookHealth(store, { success: false, code }, options);
    await writeOpsAudit(store, 'webhook_failure', { message }, options);
    return error(cause instanceof RingCentralApiError ? Math.max(500, cause.status) : 502, code, message);
  }
}

export async function ringCentralConnectionStatus(env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const missing = missingRingCentralConfiguration(env);
  const [recovery, maintenance] = await Promise.all([
    ringCentralRecoveryStatus(options.store).catch(() => null),
    readMaintenanceState(options.store)
  ]);
  const base = {
    configured: missing.length === 0,
    missing,
    environment: config.serverUrl.includes('sandbox') ? 'sandbox' : 'production',
    fromNumber: maskNumber(config.fromNumber),
    webhookUrl: config.webhookUrl,
    connected: false,
    senderReady: false,
    connectionState: missing.length ? 'configuration_required' : 'unchecked',
    phoneNumber: null,
    subscription: null,
    subscriptionHealth: ringCentralSubscriptionHealth(null, options),
    recovery,
    maintenance
  };
  if (missing.length) return base;
  try {
    const [phoneNumbers, subscriptions] = await Promise.all([
      listRingCentralPhoneNumbers(env, options),
      listRingCentralSubscriptions(env, options)
    ]);
    const phoneNumber = findConfiguredSmsNumber(phoneNumbers, config.fromNumber);
    const subscription = findSmsWebhookSubscription(subscriptions, config.webhookUrl, options);
    const senderReady = Boolean(phoneNumber && phoneNumberSupportsSms(phoneNumber));
    const subscriptionHealth = ringCentralSubscriptionHealth(subscription, options);
    return {
      ...base,
      connected: Boolean(senderReady && subscriptionHealth.active),
      senderReady,
      connectionState: subscriptionConnectionState(senderReady, subscriptionHealth),
      phoneNumber: {
        found: Boolean(phoneNumber),
        smsSender: senderReady,
        number: maskNumber(config.fromNumber)
      },
      subscription: safeSubscription(subscription, options),
      subscriptionHealth
    };
  } catch (cause) {
    return {
      ...base,
      error: {
        code: text(cause?.code, 'ringcentral_status_failed'),
        message: text(cause?.message, 'RingCentral status could not be checked.').slice(0, 240)
      }
    };
  }
}

async function replayRecoveredRingCentralPayload(payload, request, options = {}) {
  const config = ringCentralConfig(options.env || {});
  const webhookUrl = config.webhookUrl || new URL('/api/sms/ringcentral/webhook', request.url).toString();
  const replayRequest = new Request(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Validation-Token': config.webhookValidationToken,
      'X-CoverageFit-Recovery-Replay': '1'
    },
    body: JSON.stringify(payload)
  });
  const response = await handleRingCentralWebhook(replayRequest, options);
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...body };
}

export async function runRingCentralRecovery(request, options = {}) {
  return recoverMissedRingCentralSms({
    ...options,
    processEvent: payload => replayRecoveredRingCentralPayload(payload, request, options)
  });
}

function maintenanceAuthorization(request, env = {}) {
  const expected = ringCentralConfig(env).maintenanceSecret;
  if (!expected) return { ok: false, response: error(503, 'ringcentral_maintenance_not_configured', 'RingCentral automatic maintenance is not configured.') };
  const supplied = text(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
  if (!supplied || !timingSafeTextEqual(supplied, expected)) return { ok: false, response: error(401, 'unauthorized', 'RingCentral maintenance authorization is required.') };
  return { ok: true };
}

async function recoveryAfterReconnect(result, request, options = {}) {
  if (!['created', 'recreated'].includes(text(result?.action))) return { started: false, reason: 'continuous_subscription' };
  const recoveryTask = runRingCentralRecovery(request, options);
  if (typeof options.waitUntil === 'function') {
    options.waitUntil(recoveryTask.catch(cause => writeOpsAudit(options.store, 'ringcentral_recovery_failed', {
      detail: text(cause?.message, 'RingCentral history recovery failed after webhook reconnection.').slice(0, 240)
    }, options).catch(() => null)));
    return { started: true, mode: 'background' };
  }
  return recoveryTask;
}

export async function handleRingCentralRecovery(request, options = {}) {
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'RingCentral recovery can only be started from this CoverageFit site.');
  const missing = missingRingCentralConfiguration(options.env || {});
  if (missing.length) return error(503, 'ringcentral_not_configured', `Missing RingCentral configuration: ${missing.join(', ')}`);
  try {
    const recovery = await runRingCentralRecovery(request, options);
    return json({ ok: true, recovery });
  } catch (cause) {
    return error(cause instanceof RingCentralApiError ? Math.max(400, cause.status) : 502, text(cause?.code, 'ringcentral_recovery_failed'), text(cause?.message, 'RingCentral missed-message recovery failed.'));
  }
}

export async function handleRingCentralMaintenance(request, options = {}) {
  const env = options.env || {};
  const authorization = maintenanceAuthorization(request, env);
  if (!authorization.ok) return authorization.response;
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  const missing = missingRingCentralConfiguration(env);
  if (missing.length) return error(503, 'ringcentral_not_configured', `Missing RingCentral configuration: ${missing.join(', ')}`);
  try {
    const phoneNumbers = await listRingCentralPhoneNumbers(env, options);
    const phoneNumber = findConfiguredSmsNumber(phoneNumbers, ringCentralConfig(env).fromNumber);
    if (!phoneNumber || !phoneNumberSupportsSms(phoneNumber)) {
      const code = phoneNumber ? 'sms_sender_unavailable' : 'sender_not_assigned';
      await writeMaintenanceState(options.store, { status: 'failed', action: 'sender_check', subscriptionHealth: 'unverified', errorCode: code }, options);
      await writeOpsAudit(options.store, 'ringcentral_maintenance_failed', { detail: code }, options);
      return error(409, code, phoneNumber ? 'The configured RingCentral number does not currently include the SmsSender capability.' : 'The configured RingCentral number is not assigned to the authenticated extension.');
    }

    const result = await maintainRingCentralSmsWebhook(env, options);
    const health = ringCentralSubscriptionHealth(result.subscription, options);
    await writeMaintenanceState(options.store, {
      status: health.active ? 'ok' : 'warning',
      action: result.action,
      subscriptionHealth: health.state,
      nextExpirationTime: result.subscription?.expirationTime
    }, options);
    if (result.action !== 'healthy') {
      await writeOpsAudit(options.store, `ringcentral_subscription_${result.action}`, { detail: `Automatic RingCentral maintenance action: ${result.action}.` }, options);
    }
    const recovery = await recoveryAfterReconnect(result, request, options);
    return json({ ok: health.active, action: result.action, subscription: safeSubscription(result.subscription, options), recovery }, result.created ? 201 : 200);
  } catch (cause) {
    const code = text(cause?.code, 'ringcentral_maintenance_failed');
    await writeMaintenanceState(options.store, { status: 'failed', action: 'maintenance', subscriptionHealth: 'unknown', errorCode: code }, options);
    await writeOpsAudit(options.store, 'ringcentral_maintenance_failed', { detail: text(cause?.message, code).slice(0, 240) }, options);
    return error(cause instanceof RingCentralApiError ? Math.max(400, cause.status) : 502, code, text(cause?.message, 'RingCentral automatic maintenance failed.'));
  }
}

export async function handleRingCentralStatus(request, options = {}) {
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  if (request.method !== 'GET') return error(405, 'method_not_allowed', 'GET is required.');
  const status = await ringCentralConnectionStatus(options.env || {}, options);
  return json({ ok: true, status });
}

export async function handleRingCentralSubscription(request, options = {}) {
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'The RingCentral connection can only be changed from this CoverageFit site.');
  const env = options.env || {};
  const missing = missingRingCentralConfiguration(env);
  if (missing.length) return error(503, 'ringcentral_not_configured', `Missing RingCentral configuration: ${missing.join(', ')}`);
  try {
    const phoneNumbers = await listRingCentralPhoneNumbers(env, options);
    const phoneNumber = findConfiguredSmsNumber(phoneNumbers, ringCentralConfig(env).fromNumber);
    if (!phoneNumber) return error(409, 'sender_not_assigned', 'The configured RingCentral number is not assigned to the authenticated extension.');
    if (!phoneNumberSupportsSms(phoneNumber)) return error(409, 'sms_sender_unavailable', 'The configured RingCentral number does not currently include the SmsSender capability.');
    const result = await createOrRenewRingCentralSmsWebhook(env, options);
    const health = ringCentralSubscriptionHealth(result.subscription, options);
    await writeMaintenanceState(options.store, { status: health.active ? 'ok' : 'warning', action: result.action, subscriptionHealth: health.state, nextExpirationTime: result.subscription?.expirationTime }, options);
    const recovery = await recoveryAfterReconnect(result, request, options);
    return json({ ok: health.active, created: result.created, action: result.action, subscription: safeSubscription(result.subscription, options), recovery }, result.created ? 201 : 200);
  } catch (cause) {
    return error(cause instanceof RingCentralApiError ? Math.max(400, cause.status) : 502, text(cause?.code, 'ringcentral_subscription_failed'), text(cause?.message, 'The RingCentral webhook subscription could not be created.'));
  }
}
