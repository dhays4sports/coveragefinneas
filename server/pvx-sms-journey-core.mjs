import { randomBase64Url, sha256Hex } from './runtime-crypto.mjs';
import { mapSmsToPvx, validateSmsPvxMapping } from './sms-pvx-mapping-core.mjs';

export const PVX_SMS_JOURNEY_BUILD = 'CF-APPOINTMENT-FIRST-1.0';
export const PVX_SMS_JOURNEY_SCHEMA = '1.0';
export const PVX_SMS_JOURNEY_PREFIX = 'pvx/sms-journey/';
export const PVX_SMS_JOURNEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PVX_SMS_RESUME_COOKIE = 'cf_pvx_sms_resume';
export const PVX_SMS_RESUME_PATTERN = /^pvxs_[A-Za-z0-9_-]{43}$/;

export const PVX_SMS_STAGES = Object.freeze([
  'sms_intake_complete', 'appointment_requested', 'appointment_booked',
  'pvx_started',
  'discovery_started',
  'snapshot_viewed',
  'snapshot_saved',
  'home_profile_started',
  'home_profile_ready',
  'policy_review_started',
  'coverage_review_ready',
  'producer_review_ready'
]);

const text = (value, max = 240) => String(value ?? '')
  .trim()
  .replace(/[<>\u0000-\u001f\u007f]/g, '')
  .slice(0, max);

function nowDate(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  }});
}

function error(status, code, message) {
  return json({ ok: false, error: { code, message } }, status);
}

function sameOrigin(request) {
  const origin = text(request.headers.get('origin'));
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
}

function cookieValue(request, name) {
  const cookie = String(request.headers.get('cookie') || '');
  for (const part of cookie.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return '';
}

export function createPvxSmsResumeToken() {
  return `pvxs_${randomBase64Url(32)}`;
}

export async function pvxSmsJourneyKey(token) {
  if (!PVX_SMS_RESUME_PATTERN.test(text(token, 80))) return '';
  return `${PVX_SMS_JOURNEY_PREFIX}${await sha256Hex(token)}`;
}

export function pvxSmsResumeCookie(token, maxAgeSeconds = Math.floor(PVX_SMS_JOURNEY_TTL_MS / 1000)) {
  if (!PVX_SMS_RESUME_PATTERN.test(text(token, 80))) return '';
  return `${PVX_SMS_RESUME_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}; HttpOnly; Secure; SameSite=Strict`;
}

function publicJourney(record, includeSeed = false) {
  const response = {
    journeyId: record.journeyId,
    smsConversationId: record.smsConversationId,
    destination: record.destination,
    currentStage: record.currentStage,
    currentStep: record.currentStep,
    completedStages: record.completedStages,
    projection: record.projection || {},
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt
  };
  if (includeSeed) response.seed = record.seed;
  return response;
}

export async function loadPvxSmsJourneyFromRequest(request, options = {}) {
  const store = options.store;
  if (!store?.get) return null;
  const token = cookieValue(request, PVX_SMS_RESUME_COOKIE);
  if (!PVX_SMS_RESUME_PATTERN.test(token)) return null;
  const key = await pvxSmsJourneyKey(token);
  const record = await store.get(key).catch(() => null);
  if (!record || Date.parse(record.expiresAt || '') <= nowDate(options).getTime()) return null;
  return { key, record };
}

export async function createSmsPvxJourney(source = {}, options = {}) {
  const store = options.store;
  if (!store?.setJSON) throw new TypeError('PVX journey storage is unavailable.');
  const mapping = mapSmsToPvx(source, { conversation: options.conversation });
  const validation = validateSmsPvxMapping(mapping);
  if (!validation.valid) throw new TypeError(`Invalid SMS-to-PVX mapping: ${validation.errors.join(',')}`);
  if (!mapping.canEnterPvx) return { mapping, record: null, token: '', cookie: '' };
  const now = nowDate(options);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PVX_SMS_JOURNEY_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createPvxSmsResumeToken();
    const key = await pvxSmsJourneyKey(token);
    const journeyId = `pvxj_${randomBase64Url(16)}`;
    mapping.journey.journeyId = journeyId;
    const record = {
      schemaVersion: PVX_SMS_JOURNEY_SCHEMA,
      build: PVX_SMS_JOURNEY_BUILD,
      journeyId,
      smsConversationId: mapping.journey.smsConversationId,
      destination: mapping.destination,
      currentStage: mapping.journey.experience === 'appointment_only' ? 'appointment_requested' : 'discovery_started',
      currentStep: mapping.journey.experience === 'appointment_only' ? 'choose_time' : mapping.journey.resumeState.exactStep,
      completedStages: ['sms_intake_complete'],
      state: mapping.journey.experience === 'appointment_only' ? 'appointment_requested' : 'pvx_started',
      seed: mapping,
      createdAt,
      updatedAt: createdAt,
      expiresAt
    };
    try {
      await store.setJSON(key, record, { onlyIfNew: true, metadata: {
        schemaVersion: PVX_SMS_JOURNEY_SCHEMA,
        build: PVX_SMS_JOURNEY_BUILD,
        journeyId,
        smsConversationId: record.smsConversationId,
        state: record.state,
        createdAt,
        updatedAt: createdAt,
        expiresAt
      }});
      return { mapping, record, token, cookie: pvxSmsResumeCookie(token) };
    } catch (cause) {
      if (attempt === 2) throw cause;
    }
  }
  throw new Error('Unable to create PVX journey.');
}

function projectJourneyState(previous = {}, stage, details = {}) {
  const next = { ...previous };
  if (stage === 'appointment_booked') {
    next.appointmentStatus = 'scheduled';
    if (text(details.appointmentCalendarUrl, 180)) next.appointmentCalendarUrl = text(details.appointmentCalendarUrl, 180);
    if (text(details.appointmentDisplay, 160)) next.appointmentDisplay = text(details.appointmentDisplay, 160);
  }
  if (stage === 'snapshot_viewed') next.snapshotStatus = 'viewed';
  if (stage === 'snapshot_saved') { next.snapshotStatus = 'saved'; next.latestReportRevision = '1'; }
  if (stage === 'home_profile_started') next.homeProfileStatus = 'started';
  if (stage === 'home_profile_ready') { next.homeProfileStatus = 'ready'; next.latestReportRevision = '2H'; }
  if (stage === 'policy_review_started') next.policyReviewStatus = 'started';
  if (stage === 'coverage_review_ready') { next.policyReviewStatus = 'ready'; next.latestReportRevision = '2P'; }
  if (stage === 'producer_review_ready') { next.producerReviewStatus = 'ready'; next.latestReportRevision = text(details.reportRevision, 20) || next.latestReportRevision || '3'; }
  if (Array.isArray(details.reviewTopics)) next.reviewTopics = details.reviewTopics.slice(0, 3).map(item => ({ topicKey: text(item?.topicKey, 80), label: text(item?.label, 140), status: 'worth_reviewing' }));
  if (Array.isArray(details.topicResponses)) next.topicResponses = details.topicResponses.slice(0, 3).map(item => ({ topicKey: text(item?.topicKey, 80), response: text(item?.response || item?.state, 80) }));
  if (text(details.preferredContactChannel, 20)) next.preferredContactChannel = text(details.preferredContactChannel, 20);
  if (text(details.requestedProducerAction, 80)) next.requestedProducerAction = text(details.requestedProducerAction, 80);
  return next;
}

export async function advancePvxSmsJourney(loaded, options = {}) {
  const store = options.store;
  const record = loaded?.record;
  const key = loaded?.key;
  const stage = text(options.stage, 60);
  if (!record || !key || !store?.setJSON) throw new TypeError('A loaded PVX SMS journey is required.');
  if (!PVX_SMS_STAGES.includes(stage)) throw new TypeError('A supported PVX SMS stage is required.');
  const now = nowDate(options), updatedAt = now.toISOString();
  const completedStages = Array.from(new Set([
    ...(Array.isArray(record.completedStages) ? record.completedStages : []),
    ...(text(options.completedStage, 60) ? [text(options.completedStage, 60)] : [])
  ])).filter(value => PVX_SMS_STAGES.includes(value));
  const projection = projectJourneyState(record.projection, stage, options.details);
  const next = {
    ...record,
    state: stage,
    currentStage: text(options.currentStage, 60) || stage,
    currentStep: text(options.currentStep, 120) || record.currentStep,
    completedStages,
    projection,
    updatedAt
  };
  await store.setJSON(key, next, { metadata: {
    schemaVersion: next.schemaVersion, build: next.build, journeyId: next.journeyId, smsConversationId: next.smsConversationId,
    state: next.state, createdAt: next.createdAt, updatedAt, expiresAt: next.expiresAt
  }});
  if (options.operationsStore?.get && options.operationsStore?.setJSON && next.smsConversationId) {
    for (const conversationKey of [`sms-live-conversations/${next.smsConversationId}`, `sms-conversations/${next.smsConversationId}`]) {
      const conversation = await options.operationsStore.get(conversationKey).catch(() => null);
      if (!conversation || typeof conversation !== 'object') continue;
      conversation.pvxJourney = {
        ...(conversation.pvxJourney && typeof conversation.pvxJourney === 'object' ? conversation.pvxJourney : {}),
        journeyId: next.journeyId,
        state: next.state,
        currentStage: next.currentStage,
        currentStep: next.currentStep,
        completedStages: next.completedStages,
        ...projection,
        updatedAt
      };
      conversation.updatedAt = updatedAt;
      await options.operationsStore.setJSON(conversationKey, conversation, { metadata: {
        state: conversation.state || '', intent: conversation.intent || '', pvxJourneyId: next.journeyId, pvxState: next.state,
        createdAt: conversation.createdAt || updatedAt, updatedAt
      }});
      break;
    }
  }
  return next;
}

export async function handlePvxSmsJourney(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'This journey must be opened from CoverageFit.');
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'Secure journey storage is unavailable.');
  const token = cookieValue(request, PVX_SMS_RESUME_COOKIE);
  if (!PVX_SMS_RESUME_PATTERN.test(token)) return error(401, 'resume_unavailable', 'This secure return is unavailable.');
  let payload;
  try { payload = await request.json(); } catch (_) { payload = {}; }
  const key = await pvxSmsJourneyKey(token);
  const record = await store.get(key).catch(() => null);
  const now = nowDate(options);
  if (!record) return error(401, 'resume_unavailable', 'This secure return is unavailable.');
  if (Date.parse(record.expiresAt || '') <= now.getTime()) return error(410, 'resume_expired', 'This secure return has expired.');
  const action = text(payload?.action, 30) || 'load';
  if (action === 'load') return json({ ok: true, journey: publicJourney(record, true) });
  if (action !== 'update') return error(400, 'invalid_action', 'A supported journey action is required.');
  const stage = text(payload?.stage, 60);
  if (!PVX_SMS_STAGES.includes(stage)) return error(400, 'invalid_stage', 'A supported journey stage is required.');
  const next = await advancePvxSmsJourney({ key, record }, {
    ...options,
    stage,
    currentStage: payload?.currentStage,
    currentStep: payload?.currentStep,
    completedStage: payload?.completedStage,
    details: payload?.details
  });
  return json({ ok: true, journey: publicJourney(next) });
}
