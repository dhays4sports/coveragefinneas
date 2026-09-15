import { randomBase64Url, sha256Hex } from './runtime-crypto.mjs';
import { createSmsPvxJourney } from './pvx-sms-journey-core.mjs';

export const SMS_HANDOFF_BUILD = 'RC-SMS-1.11.0';
export const SMS_HANDOFF_SCHEMA_VERSION = '1.2';
export const SMS_HANDOFF_PREFIX = 'sms-handoffs/';
export const SMS_HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;
export const SMS_HANDOFF_TOKEN_PATTERN = /^sh_[A-Za-z0-9_-]{22}$/;
export const SMS_HANDOFF_PATH = '/sms/continue/';

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}
function clean(value, max = 220) { return text(value).replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, max); }
function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }});
}
function error(status, code, message, detail = {}) { return json({ ok: false, error: { code, message, ...detail } }, status); }
function sameOrigin(request) {
  const origin = text(request.headers.get('origin'));
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
}
function nowDate(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
export function createSmsHandoffToken() { return `sh_${randomBase64Url(16)}`; }
export async function smsHandoffKey(token) {
  if (!SMS_HANDOFF_TOKEN_PATTERN.test(text(token))) return '';
  return `${SMS_HANDOFF_PREFIX}${await sha256Hex(token)}`;
}
export function smsHandoffUrl(token, requestOrOrigin = 'https://coveragefit.com') {
  if (!SMS_HANDOFF_TOKEN_PATTERN.test(text(token))) return '';
  let origin = 'https://coveragefit.com';
  try { origin = new URL(typeof requestOrOrigin === 'string' ? requestOrOrigin : requestOrOrigin.url).origin; } catch (_) {}
  return new URL(`${SMS_HANDOFF_PATH}?token=${encodeURIComponent(token)}`, `${origin}/`).toString();
}
function handoffPayload(conversation) {
  const answers = conversation?.answers && typeof conversation.answers === 'object' ? conversation.answers : {};
  const partnerId = clean(conversation?.attribution?.partnerId, 64);
  return {
    source: '408farmers_sms',
    intent: clean(conversation?.intent, 40),
    campaign: partnerId ? 'partner_referral' : `${clean(conversation?.intent, 40) || 'home'}_sms_intake`,
    campaignId: partnerId ? `${clean(conversation?.intent, 40) || 'home'}_partner_${partnerId}_sms` : `rc_sms_${clean(conversation?.intent, 40) || 'home'}`,
    entry: 'sms_handoff',
    assessment: clean(conversation?.intent, 40) === 'life' ? 'life' : clean(conversation?.intent, 40) === 'business' ? 'business' : 'home',
    reviewContext: !clean(conversation?.intent, 40) || conversation?.intent === 'buyer' ? 'Buying a home' : conversation?.intent === 'home_review' ? 'Reviewing current home coverage' : conversation?.intent === 'bundle' ? 'Home and auto together' : 'Coverage review',
    propertyAddress: clean(answers.propertyAddress),
    closingDate: clean(answers.closingDate, 40),
    closingDateDisplay: clean(answers.closingDateDisplay, 120),
    closingTiming: clean(answers.closingTiming, 80),
    occupancy: clean(answers.occupancy, 40),
    autoReview: answers.autoReview === true ? true : answers.autoReview === false ? false : null,
    reviewReason: clean(answers.reviewReason, 60),
    bundleStatus: clean(answers.bundleStatus, 60),
    autoNeed: clean(answers.autoNeed, 60),
    requestCategory: clean(answers.requestCategory, 60),
    propertyZip: clean(answers.propertyZip, 10),
    housing: clean(answers.housing, 40),
    professionalProgram: clean(answers.professionalProgram, 40),
    professionalRole: clean(answers.professionalRole, 80),
    lifeGoal: clean(answers.lifeGoal, 60),
    businessType: clean(answers.businessType, 120),
    businessNeed: clean(answers.businessNeed, 60),
    priority: answers.priority === 'rush' ? 'rush' : 'standard',
    rushRequested: answers.rushRequested === true,
    partnerId,
    partnerName: clean(conversation?.attribution?.partnerName, 100),
    partnerCode: clean(conversation?.attribution?.partnerCode, 16),
    referralSource: clean(conversation?.attribution?.referralSource, 60),
    entryMethod: clean(conversation?.attribution?.entryMethod, 30),
    conversationId: clean(conversation?.id, 100)
  };
}
export async function createSmsHandoff(conversation, options = {}) {
  if (!conversation || conversation.state !== 'coveragefit_ready') throw new TypeError('A CoverageFit-ready SMS conversation is required.');
  const store = options.store;
  if (!store?.setJSON) throw new TypeError('SMS handoff storage is unavailable.');
  const now = nowDate(options);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SMS_HANDOFF_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createSmsHandoffToken();
    const key = await smsHandoffKey(token);
    const operationsRef = `sot_${randomBase64Url(16)}`;
    const record = {
      schemaVersion: SMS_HANDOFF_SCHEMA_VERSION,
      build: SMS_HANDOFF_BUILD,
      createdAt,
      expiresAt,
      payload: { ...handoffPayload(conversation), operationsRef }
    };
    try {
      await store.setJSON(key, record, { onlyIfNew: true, metadata: {
        schemaVersion: SMS_HANDOFF_SCHEMA_VERSION,
        build: SMS_HANDOFF_BUILD,
        source: '408farmers_sms',
        createdAt,
        updatedAt: createdAt,
        expiresAt
      }});
      if (options.operationsStore?.setJSON && conversation?.id) {
        const mapKey = `sms-ops/handoff-map/${await sha256Hex(operationsRef)}`;
        await options.operationsStore.setJSON(mapKey, { build: SMS_HANDOFF_BUILD, operationsRef, conversationId: clean(conversation.id,100), createdAt, expiresAt }, { metadata: { build: SMS_HANDOFF_BUILD, createdAt, updatedAt: createdAt, expiresAt } }).catch(() => {});
      }
      return { token, url: smsHandoffUrl(token, options.origin || 'https://coveragefit.com'), createdAt, expiresAt };
    } catch (cause) { if (attempt === 2) throw cause; }
  }
  throw new Error('Unable to create SMS handoff.');
}
export function smsHandoffIsFresh(record, now = new Date()) {
  const expiresAt = Date.parse(record?.expiresAt || '');
  return Boolean(record && record.schemaVersion === SMS_HANDOFF_SCHEMA_VERSION && Number.isFinite(expiresAt) && expiresAt > now.getTime());
}
export async function handleSmsHandoffRead(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'This handoff must be opened from CoverageFit.');
  let payload;
  try { payload = await request.json(); } catch (_) { return error(400, 'invalid_json', 'A valid handoff request is required.'); }
  const token = text(payload?.token);
  if (!SMS_HANDOFF_TOKEN_PATTERN.test(token)) return error(404, 'handoff_unavailable', 'This secure continuation is unavailable.', { fallbackUrl: '/pvx/start/' });
  const store = options.store;
  if (!store?.get || !store?.setJSON || !options.journeyStore?.get || !options.journeyStore?.setJSON) return error(503, 'storage_unavailable', 'Secure continuation storage is unavailable.', { fallbackUrl: '/pvx/start/' });
  let recordKey = '';
  let bootstrapLockKey = '';
  let bootstrapClaimId = '';
  try {
    recordKey = await smsHandoffKey(token);
    const record = await store.get(recordKey);
    const now = nowDate(options);
    if (!record) return error(404, 'handoff_unavailable', 'This secure continuation is unavailable.', { fallbackUrl: '/pvx/start/' });
    if (!smsHandoffIsFresh(record, now)) return error(410, 'handoff_expired', 'This secure continuation has expired.', { fallbackUrl: '/pvx/start/' });
    if (record.consumedAt) return error(409, 'handoff_consumed', 'This secure continuation has already been used.', { fallbackUrl: '/pvx/start/' });
    bootstrapLockKey = `pvx/sms-bootstrap/${await sha256Hex(token)}`;
    bootstrapClaimId = `claim_${randomBase64Url(12)}`;
    const existingLock = await options.journeyStore.get(bootstrapLockKey).catch(() => null);
    if (existingLock && Date.parse(existingLock.expiresAt || '') <= now.getTime()) await options.journeyStore.delete?.(bootstrapLockKey).catch(() => {});
    try {
      await options.journeyStore.setJSON(bootstrapLockKey, { build: 'CF-PVX-SMS-1.5', claimId: bootstrapClaimId, status: 'in_progress', createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString() }, { onlyIfNew: true, metadata: { build: 'CF-PVX-SMS-1.5', status: 'in_progress', createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString() } });
    } catch (_) {
      return error(409, 'handoff_in_progress', 'This secure continuation is already being opened.', { fallbackUrl: '/pvx/start/' });
    }
    const source = record.payload || {};
    let conversation = null;
    let conversationKey = '';
    if (options.operationsStore?.get && options.operationsStore?.setJSON && source.conversationId) {
      for (const key of [`sms-live-conversations/${source.conversationId}`, `sms-conversations/${source.conversationId}`]) {
        const candidate = await options.operationsStore.get(key).catch(() => null);
        if (candidate && typeof candidate === 'object') {
          conversation = candidate;
          conversationKey = key;
          break;
        }
      }
    }
    const journey = await createSmsPvxJourney({
      ...source,
      intent: source.intent || conversation?.intent,
      mobile: conversation?.contactPhone,
      smsConsent: conversation?.smsConsent,
      customerWords: conversation?.transcript,
      owner: conversation?.orchestration?.ownership?.owner,
      automationMode: conversation?.orchestration?.automationMode
    }, {
      store: options.journeyStore,
      conversation,
      now
    });
    if (!journey.mapping.canEnterPvx) {
      await options.journeyStore.delete?.(bootstrapLockKey).catch(() => {});
      return error(409, 'producer_handling', 'A producer is handling this request.', { fallbackUrl: '/pvx/start/' });
    }
    const consumedAt = now.toISOString();
    await store.setJSON(recordKey, {
      ...record,
      consumedAt,
      journeyId: journey.record.journeyId,
      payload: {
        source: source.source,
        intent: source.intent,
        conversationId: source.conversationId,
        operationsRef: source.operationsRef
      }
    }, { metadata: {
      schemaVersion: record.schemaVersion,
      build: record.build,
      source: source.source || '408farmers_sms',
      createdAt: record.createdAt,
      updatedAt: consumedAt,
      expiresAt: record.expiresAt,
      consumed: true
    }});
    await options.journeyStore.setJSON(bootstrapLockKey, { build: 'CF-PVX-SMS-1.5', claimId: bootstrapClaimId, status: 'completed', journeyId: journey.record.journeyId, createdAt: now.toISOString(), completedAt: consumedAt, expiresAt: record.expiresAt }, { metadata: { build: 'CF-PVX-SMS-1.5', status: 'completed', journeyId: journey.record.journeyId, createdAt: now.toISOString(), updatedAt: consumedAt, expiresAt: record.expiresAt } });
    if (conversation && conversationKey) {
      conversation.coverageFitStartedAt = conversation.coverageFitStartedAt || consumedAt;
      conversation.pvxJourney = {
        journeyId: journey.record.journeyId,
        state: 'pvx_started',
        currentStage: journey.record.currentStage,
        currentStep: journey.record.currentStep,
        completedStages: ['sms_intake_complete'],
        smsIntent: conversation.intent || source.intent || '',
        shoppingMotivation: journey.mapping.discovery?.exactCustomerWords?.shoppingReason || '',
        snapshotStatus: 'not_started',
        homeProfileStatus: 'not_started',
        policyReviewStatus: 'not_started',
        exactCustomerWords: Array.isArray(journey.mapping.evidence?.customerWords) ? journey.mapping.evidence.customerWords.slice(0, 12) : [],
        attribution: journey.mapping.attribution || {},
        updatedAt: consumedAt
      };
      conversation.updatedAt = consumedAt;
      await options.operationsStore.setJSON(conversationKey, conversation, { metadata: {
        state: conversation.state || '',
        intent: conversation.intent || '',
        coverageFitStarted: true,
        pvxJourneyId: journey.record.journeyId,
        createdAt: conversation.createdAt || consumedAt,
        updatedAt: consumedAt
      } });
    }
    return json({ ok: true, handoff: {
      source: source.source,
      campaign: source.campaign,
      campaignId: source.campaignId,
      entry: source.entry,
      assessment: source.assessment,
      reviewContext: source.reviewContext,
      propertyAddress: source.propertyAddress,
      closingDate: source.closingDate,
      closingDateDisplay: source.closingDateDisplay,
      closingTiming: source.closingTiming,
      occupancy: source.occupancy,
      autoReview: source.autoReview,
      reviewReason: source.reviewReason,
      bundleStatus: source.bundleStatus,
      autoNeed: source.autoNeed,
      requestCategory: source.requestCategory,
      priority: source.priority,
      rushRequested: source.rushRequested,
      partnerId: source.partnerId,
      partnerName: source.partnerName,
      referralSource: source.referralSource,
      entryMethod: source.entryMethod,
      operationsRef: source.operationsRef,
      expiresAt: record.expiresAt
    }, pvx: {
      journeyId: journey.record.journeyId,
      destination: journey.record.destination,
      exactStage: journey.record.currentStage,
      exactStep: journey.record.currentStep,
      seed: journey.mapping
    }}, 200, { 'Set-Cookie': journey.cookie });
  } catch (cause) {
    console.error('CoverageFit SMS handoff read failed', cause);
    if (bootstrapLockKey && options.journeyStore?.delete) {
      const latest = recordKey ? await store.get(recordKey).catch(() => null) : null;
      if (!latest?.consumedAt) await options.journeyStore.delete(bootstrapLockKey).catch(() => {});
    }
    return error(503, 'handoff_read_failed', 'This secure continuation could not be loaded.', { fallbackUrl: '/pvx/start/' });
  }
}
