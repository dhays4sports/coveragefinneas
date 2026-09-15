import { authorizeProducer } from './consultation-inbox-core.mjs';
import { sha256Hex } from './runtime-crypto.mjs';
import { normalizeE164, ringCentralConfig, sendRingCentralSms } from './ringcentral-client.mjs';
import { normalizeSmsConsent, smsPermissionSnapshot, smsSendClass } from './sms-consent-core.mjs';
import {
  SMS_CONVERSATION_OWNERS,
  applySmsOwnershipOperation,
  clearSmsReplyContext,
  normalizeSmsOrchestration,
  setSmsReplyContext,
  takeProducerOwnership
} from './sms-orchestrator-core.mjs';

export const SMS_OUTBOUND_GATEWAY_BUILD = 'RC-SMS-1.9.9';
export const SMS_OUTBOUND_REGISTRY_SCHEMA = '1.2';
export const SMS_OUTBOUND_REGISTRY_PREFIX = 'sms-outbound-registry/provider/';
export const SMS_OUTBOUND_FINGERPRINT_PREFIX = 'sms-outbound-registry/fingerprint/';
export const SMS_OUTBOUND_IDEMPOTENCY_PREFIX = 'sms-outbound-idempotency/';
export const SMS_LIVE_CONVERSATION_PREFIX = 'sms-live-conversations/';
export const SMS_OUTBOUND_FINGERPRINT_TTL_MS = 10 * 60 * 1000;
export const SMS_OUTBOUND_ORIGINS = Object.freeze([
  'coveragefit',
  'producer_manual',
  'producer_console',
  'quote_followup',
  'appointment',
  'service',
  'crm',
  'life',
  'commercial',
  'campaign',
  'system',
  'external_unknown'
]);
export const SMS_PROGRAMMATIC_ORIGINS = Object.freeze(SMS_OUTBOUND_ORIGINS.filter(value => !['producer_manual', 'external_unknown'].includes(value)));
export const SMS_REPLY_ROUTES = Object.freeze(['coveragefit', 'producer', 'service', 'life', 'commercial', 'appointment', 'system', 'none']);
export const SMS_OWNERSHIP_EFFECTS = Object.freeze(['preserve', 'producer', 'transfer', 'release']);
export const SMS_REPLY_CONTEXT_MIN_TTL_SECONDS = 5 * 60;
export const SMS_REPLY_CONTEXT_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SMS_REPLY_CONTEXT_DEFAULT_TTL_SECONDS = 48 * 60 * 60;

const MAX_BODY_BYTES = 12000;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_TRANSCRIPT_ITEMS = 60;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function nowDate(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function safeEnum(value, allowed) {
  const candidate = text(value).toLowerCase();
  return allowed.includes(candidate) ? candidate : '';
}

function normalizeProviderMessageId(value) {
  const candidate = text(value);
  return PROVIDER_ID_PATTERN.test(candidate) ? candidate : '';
}

function normalizedMessageBody(value) {
  return text(value).replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_LENGTH);
}

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
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

async function body(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { response: error(413, 'payload_too_large', 'SMS request is too large.') };
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return { response: error(415, 'unsupported_media_type', 'Expected application/json.') };
  try { return { payload: await request.json() }; } catch (_) { return { response: error(400, 'invalid_json', 'A valid SMS request is required.') }; }
}

export class SmsGatewayError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SmsGatewayError';
    this.status = Number(options.status) || 422;
    this.code = text(options.code, 'sms_gateway_error');
  }
}

export async function smsLiveConversationId(contactNumber, businessNumber, secret) {
  const contact = normalizeE164(contactNumber);
  const business = normalizeE164(businessNumber);
  const hashSecret = text(secret);
  if (!contact || !business || hashSecret.length < 16) throw new SmsGatewayError('A valid SMS relationship and conversation secret are required.', { status: 503, code: 'sms_relationship_unavailable' });
  const digest = await sha256Hex(`${hashSecret}|${contact}|${business}`);
  return `sms-live-${digest.slice(0, 40)}`;
}

export function validateOutboundDescriptor(input = {}, options = {}) {
  const to = normalizeE164(input.to);
  const message = text(input.message || input.textBody).slice(0, MAX_MESSAGE_LENGTH);
  const origin = safeEnum(input.origin, options.allowReservedOrigins ? SMS_OUTBOUND_ORIGINS : SMS_PROGRAMMATIC_ORIGINS);
  const workflow = text(input.workflow).toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, 60);
  const replyRoute = safeEnum(input.replyRoute, SMS_REPLY_ROUTES);
  const ownershipEffect = safeEnum(input.ownershipEffect, SMS_OWNERSHIP_EFFECTS);
  const ownershipTarget = safeEnum(input.ownershipTarget, SMS_CONVERSATION_OWNERS);
  const hasExplicitReplyContext = Object.prototype.hasOwnProperty.call(input, 'replyContext')
    || Object.prototype.hasOwnProperty.call(input, 'replyContextType');
  const suppliedReplyContext = text(input.replyContext || input.replyContextType).toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, 60);
  const replyContext = hasExplicitReplyContext
    ? suppliedReplyContext
    : (!['coveragefit', 'none'].includes(replyRoute) ? workflow : '');
  const rawTtl = Number(input.replyContextTtlSeconds);
  const replyContextTtlSeconds = replyContext
    ? Math.max(SMS_REPLY_CONTEXT_MIN_TTL_SECONDS, Math.min(SMS_REPLY_CONTEXT_MAX_TTL_SECONDS, Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : SMS_REPLY_CONTEXT_DEFAULT_TTL_SECONDS))
    : 0;
  if (!to) throw new SmsGatewayError('A valid SMS recipient is required.', { code: 'invalid_recipient' });
  if (!message) throw new SmsGatewayError('A non-empty SMS message is required.', { code: 'invalid_message' });
  if (!origin) throw new SmsGatewayError('A supported outbound origin is required.', { code: 'invalid_origin' });
  if (!workflow) throw new SmsGatewayError('A bounded workflow identifier is required.', { code: 'invalid_workflow' });
  if (!replyRoute) throw new SmsGatewayError('A supported reply route is required.', { code: 'invalid_reply_route' });
  if (!ownershipEffect) throw new SmsGatewayError('A supported ownership effect is required.', { code: 'invalid_ownership_effect' });
  if (ownershipEffect === 'transfer' && (!ownershipTarget || ownershipTarget === 'none')) throw new SmsGatewayError('A transfer ownership effect requires a supported non-empty ownership target.', { code: 'invalid_ownership_target' });
  if (ownershipEffect === 'producer' && ownershipTarget && ownershipTarget !== 'producer') throw new SmsGatewayError('The legacy producer ownership effect can only target the producer.', { code: 'invalid_ownership_target' });
  if (ownershipEffect === 'release' && ownershipTarget && ownershipTarget !== 'none') throw new SmsGatewayError('A release ownership effect cannot declare another owner.', { code: 'invalid_ownership_target' });
  if (origin === 'coveragefit') {
    const staysWithCoverageFit = replyRoute === 'coveragefit' && ownershipEffect === 'preserve';
    const handsToProducer = replyRoute === 'producer' && ownershipEffect === 'producer';
    if (!staysWithCoverageFit && !handsToProducer) {
      throw new SmsGatewayError('CoverageFit outbound messages must either preserve CoverageFit ownership or explicitly complete a producer handoff.', { code: 'unsafe_coveragefit_descriptor' });
    }
  }
  return { to, message, origin, workflow, replyRoute, ownershipEffect, ownershipTarget: ownershipEffect === 'producer' ? 'producer' : ownershipEffect === 'release' ? 'none' : ownershipTarget, replyContext, replyContextTtlSeconds, sendClass: smsSendClass(origin) };
}

async function bodyHash(message) {
  return sha256Hex(normalizedMessageBody(message));
}

async function fingerprintKey(businessPhone, contactPhone, message) {
  const business = normalizeE164(businessPhone);
  const contact = normalizeE164(contactPhone);
  const digest = await sha256Hex(`${business}|${contact}|${normalizedMessageBody(message)}`);
  return `${SMS_OUTBOUND_FINGERPRINT_PREFIX}${digest}`;
}

function providerKey(providerMessageId) {
  const clean = normalizeProviderMessageId(providerMessageId);
  return clean ? `${SMS_OUTBOUND_REGISTRY_PREFIX}${clean}` : '';
}

async function idempotencyKey(businessPhone, contactPhone, key) {
  const digest = await sha256Hex(`${normalizeE164(businessPhone)}|${normalizeE164(contactPhone)}|${text(key)}`);
  return `${SMS_OUTBOUND_IDEMPOTENCY_PREFIX}${digest}`;
}

function registryMetadata(record) {
  return {
    build: SMS_OUTBOUND_GATEWAY_BUILD,
    status: record.status,
    origin: record.origin,
    workflow: record.workflow,
    replyRoute: record.replyRoute,
    ownershipEffect: record.ownershipEffect,
    ownershipTarget: record.ownershipTarget || '',
    replyContext: record.replyContext || '',
    providerMessageId: record.providerMessageId || '',
    createdAt: record.registeredAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt || ''
  };
}

function publicRegistration(record = {}) {
  return {
    registrationId: text(record.registrationId),
    status: text(record.status),
    origin: text(record.origin),
    workflow: text(record.workflow),
    replyRoute: text(record.replyRoute),
    ownershipEffect: text(record.ownershipEffect),
    ownershipTarget: text(record.ownershipTarget),
    replyContext: text(record.replyContext),
    replyContextExpiresAt: text(record.replyContextExpiresAt),
    providerMessageId: text(record.providerMessageId),
    registeredAt: text(record.registeredAt),
    sentAt: text(record.sentAt),
    webhookSeenAt: text(record.webhookSeenAt),
    sendClass: text(record.sendClass),
    build: SMS_OUTBOUND_GATEWAY_BUILD
  };
}

async function writeFingerprintRegistration(store, descriptor, context = {}) {
  const registeredAt = text(context.registeredAt, nowDate(context).toISOString());
  const expiresAt = new Date(Date.parse(registeredAt) + SMS_OUTBOUND_FINGERPRINT_TTL_MS).toISOString();
  const key = await fingerprintKey(context.businessPhone, descriptor.to, descriptor.message);
  const registrationId = text(context.registrationId, crypto.randomUUID());
  const existing = await store.get(key);
  if (existing && typeof existing === 'object' && !existing.providerMessageId && existing.status !== 'failed' && text(existing.registrationId) !== registrationId) {
    const existingExpiry = Date.parse(text(existing.expiresAt));
    const reference = Date.parse(registeredAt);
    if (!Number.isFinite(existingExpiry) || !Number.isFinite(reference) || existingExpiry >= reference) {
      throw new SmsGatewayError('An unresolved outbound registration with the same sender, recipient, and message fingerprint is already active.', { status: 409, code: 'outbound_fingerprint_in_use' });
    }
  }
  const record = {
    schemaVersion: SMS_OUTBOUND_REGISTRY_SCHEMA,
    build: SMS_OUTBOUND_GATEWAY_BUILD,
    registrationId,
    status: text(context.status, 'registered'),
    providerMessageId: text(context.providerMessageId),
    businessPhone: normalizeE164(context.businessPhone),
    contactPhone: descriptor.to,
    bodyHash: await bodyHash(descriptor.message),
    origin: descriptor.origin,
    workflow: descriptor.workflow,
    replyRoute: descriptor.replyRoute,
    ownershipEffect: descriptor.ownershipEffect,
    ownershipTarget: descriptor.ownershipTarget,
    replyContext: descriptor.replyContext,
    replyContextTtlSeconds: descriptor.replyContextTtlSeconds,
    replyContextExpiresAt: descriptor.replyContext ? new Date(Date.parse(registeredAt) + descriptor.replyContextTtlSeconds * 1000).toISOString() : '',
    sendClass: descriptor.sendClass || smsSendClass(descriptor.origin),
    registeredAt,
    sentAt: text(context.sentAt),
    webhookSeenAt: '',
    expiresAt,
    updatedAt: registeredAt
  };
  await store.setJSON(key, record, { metadata: registryMetadata(record) });
  return { key, record };
}

async function writeProviderRegistration(store, fingerprintRecord, providerMessageId, options = {}) {
  const cleanId = normalizeProviderMessageId(providerMessageId);
  if (!cleanId) throw new SmsGatewayError('RingCentral did not return a usable provider message identifier.', { status: 502, code: 'provider_message_id_missing' });
  const sentAt = text(options.sentAt, nowDate(options).toISOString());
  const record = {
    ...clone(fingerprintRecord),
    status: 'sent',
    providerMessageId: cleanId,
    sentAt,
    expiresAt: '',
    updatedAt: sentAt
  };
  const key = providerKey(cleanId);
  if (options.onlyIfNew) {
    const existing = await store.get(key);
    if (existing) {
      if (text(existing.registrationId) !== text(record.registrationId)) {
        throw new SmsGatewayError('RingCentral provider message ID is already bound to another outbound registration.', { status: 409, code: 'provider_message_already_registered' });
      }
      const merged = { ...existing, ...record, webhookSeenAt: text(existing.webhookSeenAt), updatedAt: text(record.updatedAt, existing.updatedAt) };
      await store.setJSON(key, merged, { metadata: registryMetadata(merged) });
      return { key, record: merged };
    }
  }
  await store.setJSON(key, record, { metadata: registryMetadata(record), onlyIfNew: Boolean(options.onlyIfNew) });
  return { key, record };
}

function baseConversation(conversationId, descriptor, businessPhone, occurredAt) {
  const base = {
    schemaVersion: '1.6',
    engineBuild: SMS_OUTBOUND_GATEWAY_BUILD,
    build: SMS_OUTBOUND_GATEWAY_BUILD,
    id: conversationId,
    channel: 'ringcentral_sms',
    contactPhone: descriptor.to,
    businessPhone,
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
    createdAt: occurredAt,
    updatedAt: occurredAt
  };
  base.orchestration = normalizeSmsOrchestration(base, { occurredAt });
  base.smsConsent = normalizeSmsConsent(base, { occurredAt });
  return base;
}

function channelPermission(conversation, descriptor, options = {}) {
  const permission = smsPermissionSnapshot(conversation, { occurredAt: options.occurredAt });
  const orchestration = normalizeSmsOrchestration({ ...conversation, smsConsent: permission.consent });
  if (!permission.allowed) {
    throw new SmsGatewayError('The SMS relationship is suppressed and cannot receive programmatic outbound messages.', { status: 409, code: 'sms_channel_suppressed' });
  }
  if (descriptor.origin === 'coveragefit' && !options.allowRegisteredRetry) {
    const ownsAutomatedConversation = orchestration.ownership.owner === 'coveragefit' && orchestration.automationMode === 'automated';
    const isBoundedProducerHandoff = descriptor.replyRoute === 'producer'
      && descriptor.ownershipEffect === 'producer'
      && orchestration.ownership.owner === 'producer'
      && orchestration.automationMode === 'human_only'
      && ['workflow_awaiting_producer', 'customer_requested_producer'].includes(orchestration.ownership.reason);
    if (!ownsAutomatedConversation && !isBoundedProducerHandoff) {
      throw new SmsGatewayError('CoverageFit automation does not currently own this SMS conversation.', { status: 409, code: 'coveragefit_automation_not_permitted' });
    }
  }
  if (descriptor.origin !== 'coveragefit' && orchestration.ownership.owner === 'coveragefit' && descriptor.replyRoute !== 'coveragefit') {
    const safeTransfer = descriptor.ownershipEffect === 'producer' || (descriptor.ownershipEffect === 'transfer' && descriptor.ownershipTarget && descriptor.ownershipTarget !== 'coveragefit');
    if (!safeTransfer) throw new SmsGatewayError('A non-CoverageFit outbound message cannot leave an active CoverageFit conversation bot-owned when replies belong elsewhere.', { status: 409, code: 'unsafe_active_workflow_collision' });
  }
  return orchestration;
}

function appendRegisteredTranscript(conversation, descriptor, providerMessageId, occurredAt) {
  const transcript = Array.isArray(conversation.transcript) ? conversation.transcript : [];
  const itemId = `rc-${providerMessageId}`;
  if (transcript.some(item => text(item?.id) === itemId)) return { conversation, appended: false };
  const stateBefore = text(conversation.state, 'new');
  const item = {
    id: itemId,
    direction: 'outbound',
    body: descriptor.message,
    occurredAt,
    kind: descriptor.origin === 'coveragefit' ? 'automation' : descriptor.origin,
    stateBefore,
    stateAfter: (descriptor.ownershipEffect === 'producer' || (descriptor.ownershipEffect === 'transfer' && descriptor.ownershipTarget !== 'coveragefit')) ? 'human_takeover' : stateBefore
  };
  return { conversation: { ...conversation, transcript: [...transcript, item].slice(-MAX_TRANSCRIPT_ITEMS) }, appended: true };
}

export function applyRegisteredOutboundToConversation(conversation, registration, options = {}) {
  const occurredAt = text(options.occurredAt || registration.sentAt || registration.registeredAt, nowDate(options).toISOString());
  const descriptor = {
    to: normalizeE164(registration.contactPhone || conversation.contactPhone),
    message: text(options.message).slice(0, MAX_MESSAGE_LENGTH),
    origin: safeEnum(registration.origin, SMS_OUTBOUND_ORIGINS) || 'external_unknown',
    workflow: text(registration.workflow, 'unknown').slice(0, 60),
    replyRoute: safeEnum(registration.replyRoute, SMS_REPLY_ROUTES) || 'producer',
    ownershipEffect: safeEnum(registration.ownershipEffect, SMS_OWNERSHIP_EFFECTS) || 'producer',
    ownershipTarget: safeEnum(registration.ownershipTarget, SMS_CONVERSATION_OWNERS),
    replyContext: text(registration.replyContext).toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, 60),
    replyContextTtlSeconds: Math.max(SMS_REPLY_CONTEXT_MIN_TTL_SECONDS, Math.min(SMS_REPLY_CONTEXT_MAX_TTL_SECONDS, Number(registration.replyContextTtlSeconds) || SMS_REPLY_CONTEXT_DEFAULT_TTL_SECONDS)),
    replyContextExpiresAt: text(registration.replyContextExpiresAt)
  };
  if (descriptor.ownershipEffect === 'producer') descriptor.ownershipTarget = 'producer';
  if (descriptor.ownershipEffect === 'release') descriptor.ownershipTarget = 'none';
  const providerMessageId = normalizeProviderMessageId(options.providerMessageId || registration.providerMessageId);
  let next = { ...conversation };
  const hadTranscript = providerMessageId && Array.isArray(next.transcript) && next.transcript.some(item => text(item?.id) === `rc-${providerMessageId}`);
  if (!hadTranscript && descriptor.message && providerMessageId) {
    const appended = appendRegisteredTranscript(next, descriptor, providerMessageId, occurredAt);
    next = appended.conversation;
    if (appended.appended) next.outboundCount = Math.max(0, Number(next.outboundCount) || 0) + 1;
  }

  const prior = normalizeSmsOrchestration(next, { occurredAt });
  const alreadyCoverageFitHandoff = descriptor.origin === 'coveragefit'
    && next.state === 'awaiting_producer'
    && prior.ownership.owner === 'producer'
    && ['workflow_awaiting_producer', 'customer_requested_producer'].includes(prior.ownership.reason);

  if (!hadTranscript && descriptor.ownershipEffect === 'producer') {
    if (alreadyCoverageFitHandoff) next.orchestration = prior;
    else {
      next.preTakeoverState = prior.workflow.state;
      next.orchestration = takeProducerOwnership(next, { occurredAt, reason: `registered_outbound:${descriptor.origin}` });
      next.state = 'human_takeover';
      next.registeredOwnershipAt = occurredAt;
    }
  } else if (!hadTranscript && descriptor.ownershipEffect === 'transfer') {
    next.preTakeoverState = prior.workflow.state;
    next.orchestration = applySmsOwnershipOperation(next, 'transfer', { occurredAt, owner: descriptor.ownershipTarget, reason: `registered_outbound:${descriptor.origin}` });
    if (descriptor.ownershipTarget !== 'coveragefit') next.state = 'human_takeover';
    next.registeredOwnershipAt = occurredAt;
  } else if (!hadTranscript && descriptor.ownershipEffect === 'release') {
    next.orchestration = applySmsOwnershipOperation(next, 'release', { occurredAt, reason: `registered_outbound:${descriptor.origin}` });
  } else {
    next.orchestration = normalizeSmsOrchestration(next, { occurredAt });
  }

  if (descriptor.replyContext && !['coveragefit', 'none'].includes(descriptor.replyRoute)) {
    next.orchestration = setSmsReplyContext({ ...next, orchestration: next.orchestration }, {
      context: descriptor.replyContext,
      route: descriptor.replyRoute,
      workflow: descriptor.workflow,
      source: descriptor.origin,
      ttlSeconds: descriptor.replyContextTtlSeconds,
      expiresAt: descriptor.replyContextExpiresAt
    }, { occurredAt });
  } else if (descriptor.origin === 'coveragefit' && descriptor.replyRoute === 'coveragefit') {
    next.orchestration = clearSmsReplyContext({ ...next, orchestration: next.orchestration }, { occurredAt });
  }

  next.outboundContext = {
    providerMessageId,
    origin: descriptor.origin,
    workflow: descriptor.workflow,
    replyRoute: descriptor.replyRoute,
    ownershipEffect: descriptor.ownershipEffect,
    ownershipTarget: descriptor.ownershipTarget,
    replyContext: descriptor.replyContext,
    replyContextExpiresAt: descriptor.replyContext ? (next.orchestration?.replyContext?.expiresAt || descriptor.replyContextExpiresAt) : '',
    registrationId: text(registration.registrationId),
    registeredAt: text(registration.registeredAt),
    sentAt: text(registration.sentAt, occurredAt),
    updatedAt: occurredAt
  };
  next.lastOutboundAt = occurredAt;
  next.updatedAt = occurredAt;
  next.schemaVersion = '1.6';
  next.smsConsent = normalizeSmsConsent(next, { occurredAt });
  next.build = SMS_OUTBOUND_GATEWAY_BUILD;
  return next;
}
export async function resolveOutboundRegistration(store, event = {}, options = {}) {
  if (!store?.get) return null;
  const providerMessageId = normalizeProviderMessageId(event.providerMessageId || event.messageId);
  if (providerMessageId) {
    const found = await store.get(providerKey(providerMessageId));
    if (found && typeof found === 'object' && found.status !== 'failed') return { ...found, matchedBy: 'provider_message_id', matchedKey: providerKey(providerMessageId) };
  }
  const businessPhone = normalizeE164(event.businessPhone);
  const contactPhone = normalizeE164(event.contactPhone || event.prospectNumber);
  const message = text(event.message || event.body);
  if (!businessPhone || !contactPhone || !message) return null;
  const fallbackKey = await fingerprintKey(businessPhone, contactPhone, message);
  const found = await store.get(fallbackKey);
  if (!found || typeof found !== 'object' || found.status === 'failed') return null;
  if (found.providerMessageId && providerMessageId && normalizeProviderMessageId(found.providerMessageId) !== providerMessageId) return null;
  const reference = Date.parse(text(event.occurredAt, nowDate(options).toISOString()));
  const expires = Date.parse(text(found.expiresAt));
  if (Number.isFinite(expires) && Number.isFinite(reference) && expires < reference) return null;
  return { ...found, matchedBy: 'fingerprint', matchedKey: fallbackKey };
}

export async function markOutboundRegistrationWebhookSeen(store, registration, providerMessageId, occurredAt) {
  if (!store?.setJSON || !registration) return;
  const cleanId = normalizeProviderMessageId(providerMessageId || registration.providerMessageId);
  const at = text(occurredAt, new Date().toISOString());
  const record = { ...registration, status: 'sent', providerMessageId: cleanId, webhookSeenAt: at, updatedAt: at };
  const matchedKey = text(record.matchedKey);
  delete record.matchedBy;
  delete record.matchedKey;
  if (cleanId) await store.setJSON(providerKey(cleanId), record, { metadata: registryMetadata(record) });
  if (matchedKey.startsWith(SMS_OUTBOUND_FINGERPRINT_PREFIX)) {
    const fingerprintRecord = { ...record, expiresAt: text(registration.expiresAt) };
    await store.setJSON(matchedKey, fingerprintRecord, { metadata: registryMetadata(fingerprintRecord) });
  }
}

export async function registerExternalOutbound(input = {}, options = {}) {
  const store = options.store;
  if (!store?.get || !store?.setJSON) throw new SmsGatewayError('SMS outbound registry storage is unavailable.', { status: 503, code: 'storage_unavailable' });
  const descriptor = validateOutboundDescriptor(input, { allowReservedOrigins: false });
  const config = ringCentralConfig(options.env || {});
  if (!config.fromNumber || text(config.conversationHashSecret).length < 16) throw new SmsGatewayError('The RingCentral sender relationship is not fully configured.', { status: 503, code: 'ringcentral_sender_unavailable' });
  const conversationId = await smsLiveConversationId(descriptor.to, config.fromNumber, config.conversationHashSecret);
  const existingConversation = await store.get(`${SMS_LIVE_CONVERSATION_PREFIX}${conversationId}`);
  if (existingConversation && typeof existingConversation === 'object') channelPermission(existingConversation, descriptor, options);
  const registeredAt = nowDate(options).toISOString();
  const registrationId = crypto.randomUUID();
  const fingerprint = await writeFingerprintRegistration(store, descriptor, { businessPhone: config.fromNumber, registeredAt, registrationId, status: 'registered' });
  const providerMessageId = normalizeProviderMessageId(input.providerMessageId);
  if (!providerMessageId) return { ...fingerprint.record, matchedBy: 'fingerprint' };
  const existing = await store.get(providerKey(providerMessageId));
  if (existing) {
    if (text(existing.registrationId) === registrationId || (existing.origin === descriptor.origin && existing.workflow === descriptor.workflow && existing.contactPhone === descriptor.to)) return existing;
    throw new SmsGatewayError('That provider message identifier is already registered to another outbound context.', { status: 409, code: 'provider_message_already_registered' });
  }
  const provider = await writeProviderRegistration(store, fingerprint.record, providerMessageId, { sentAt: text(input.sentAt, registeredAt), onlyIfNew: true, now: options.now });
  return provider.record;
}

export async function sendSmsThroughGateway(input = {}, options = {}) {
  const store = options.store;
  if (!store?.get || !store?.setJSON) throw new SmsGatewayError('SMS gateway storage is unavailable.', { status: 503, code: 'storage_unavailable' });
  const descriptor = validateOutboundDescriptor(input, { allowReservedOrigins: false });
  const idempotency = text(input.idempotencyKey);
  if (!IDEMPOTENCY_PATTERN.test(idempotency)) throw new SmsGatewayError('A stable idempotency key of 8-120 safe characters is required.', { code: 'invalid_idempotency_key' });
  const env = options.env || {};
  const config = ringCentralConfig(env);
  if (!config.fromNumber || text(config.conversationHashSecret).length < 16) throw new SmsGatewayError('The RingCentral sender relationship is not fully configured.', { status: 503, code: 'ringcentral_sender_unavailable' });
  const conversationId = await smsLiveConversationId(descriptor.to, config.fromNumber, config.conversationHashSecret);
  const conversationKey = `${SMS_LIVE_CONVERSATION_PREFIX}${conversationId}`;
  const occurredAt = nowDate(options).toISOString();
  const snapshot = options.conversationSnapshot && typeof options.conversationSnapshot === 'object' ? options.conversationSnapshot : null;
  let conversation = snapshot && text(snapshot.id) === conversationId ? clone(snapshot) : await store.get(conversationKey);
  if (!conversation || typeof conversation !== 'object') conversation = baseConversation(conversationId, descriptor, config.fromNumber, occurredAt);
  const orchestration = channelPermission(conversation, descriptor, options);
  conversation.orchestration = orchestration;

  const idemKey = await idempotencyKey(config.fromNumber, descriptor.to, idempotency);
  const prior = await store.get(idemKey);
  if (prior?.status === 'sent' && prior.providerMessageId) {
    const registration = await store.get(providerKey(prior.providerMessageId));
    return { ok: true, deduped: true, conversationId, providerMessageId: prior.providerMessageId, registration: publicRegistration(registration || prior) };
  }
  if (prior?.status === 'processing') throw new SmsGatewayError('An SMS send with this idempotency key is already in progress.', { status: 409, code: 'sms_send_in_progress' });
  if (prior?.status === 'failed') throw new SmsGatewayError('This idempotency key belongs to a failed send. Retry with a new idempotency key.', { status: 409, code: 'idempotency_key_failed' });
  const lock = { build: SMS_OUTBOUND_GATEWAY_BUILD, status: 'processing', idempotencyKey: idempotency, conversationId, origin: descriptor.origin, createdAt: occurredAt, updatedAt: occurredAt };
  try {
    await store.setJSON(idemKey, lock, { onlyIfNew: true, metadata: { status: 'processing', origin: descriptor.origin, conversationId, createdAt: occurredAt, updatedAt: occurredAt } });
  } catch (_) {
    const raced = await store.get(idemKey);
    if (raced?.status === 'sent' && raced.providerMessageId) {
      const registration = await store.get(providerKey(raced.providerMessageId));
      return { ok: true, deduped: true, conversationId, providerMessageId: raced.providerMessageId, registration: publicRegistration(registration || raced) };
    }
    throw new SmsGatewayError('An SMS send with this idempotency key is already in progress.', { status: 409, code: 'sms_send_in_progress' });
  }

  const registrationId = crypto.randomUUID();
  const fingerprint = await writeFingerprintRegistration(store, descriptor, { businessPhone: config.fromNumber, registeredAt: occurredAt, registrationId, status: 'pending' });
  let sent;
  try {
    // Re-check the authoritative channel permission immediately before provider delivery.
    channelPermission(conversation, descriptor, { ...options, occurredAt: nowDate(options).toISOString() });
    sent = await sendRingCentralSms({ to: descriptor.to, textBody: descriptor.message }, env, options);
  } catch (cause) {
    const failedAt = nowDate(options).toISOString();
    await store.setJSON(idemKey, { ...lock, status: 'failed', errorCode: text(cause?.code, 'ringcentral_send_failed'), updatedAt: failedAt }, { metadata: { status: 'failed', origin: descriptor.origin, conversationId, createdAt: occurredAt, updatedAt: failedAt } }).catch(() => {});
    await store.setJSON(fingerprint.key, { ...fingerprint.record, status: 'failed', updatedAt: failedAt }, { metadata: { ...registryMetadata(fingerprint.record), status: 'failed', updatedAt: failedAt } }).catch(() => {});
    throw cause;
  }
  const providerMessageId = normalizeProviderMessageId(sent?.id);
  const sentAt = nowDate(options).toISOString();
  const provider = await writeProviderRegistration(store, fingerprint.record, providerMessageId, { sentAt, onlyIfNew: true, now: options.now });
  await store.setJSON(fingerprint.key, { ...provider.record, expiresAt: fingerprint.record.expiresAt }, { metadata: { ...registryMetadata(provider.record), expiresAt: fingerprint.record.expiresAt } });
  conversation = applyRegisteredOutboundToConversation(conversation, provider.record, { providerMessageId, message: descriptor.message, occurredAt: sentAt, now: options.now });
  await store.setJSON(conversationKey, conversation, { metadata: {
    state: conversation.state || '', intent: conversation.intent || '', owner: conversation.orchestration?.ownership?.owner || '', automationMode: conversation.orchestration?.automationMode || '',
    workflowType: conversation.orchestration?.workflow?.type || '', outboundOrigin: descriptor.origin, replyRoute: descriptor.replyRoute,
    createdAt: conversation.createdAt || occurredAt, updatedAt: sentAt
  } });
  await store.setJSON(idemKey, { ...lock, status: 'sent', providerMessageId, registrationId, sentAt, updatedAt: sentAt }, { metadata: { status: 'sent', origin: descriptor.origin, conversationId, createdAt: occurredAt, updatedAt: sentAt } });
  return { ok: true, deduped: false, conversationId, providerMessageId, registration: publicRegistration(provider.record) };
}

export async function handleSmsSend(request, options = {}) {
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Programmatic SMS sends must originate from this CoverageFit site.');
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  const key = text(request.headers.get('idempotency-key') || parsed.payload?.idempotencyKey);
  try {
    const result = await sendSmsThroughGateway({ ...parsed.payload, idempotencyKey: key }, options);
    return json(result, result.deduped ? 200 : 201);
  } catch (cause) {
    if (cause instanceof SmsGatewayError) return error(cause.status, cause.code, cause.message);
    return error(Math.max(500, Number(cause?.status) || 502), text(cause?.code, 'sms_send_failed'), text(cause?.message, 'The SMS could not be sent.').slice(0, 240));
  }
}

export async function handleSmsOutboundRegister(request, options = {}) {
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Outbound SMS registration must originate from this CoverageFit site.');
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  try {
    const registration = await registerExternalOutbound(parsed.payload, options);
    return json({ ok: true, registration: publicRegistration(registration) }, 201);
  } catch (cause) {
    if (cause instanceof SmsGatewayError) return error(cause.status, cause.code, cause.message);
    return error(502, text(cause?.code, 'sms_registration_failed'), 'The outbound SMS context could not be registered.');
  }
}
