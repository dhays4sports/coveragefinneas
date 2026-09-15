import { randomBase64Url, sha256Hex } from './runtime-crypto.mjs';
import { mapWebToPvx, validateWebPvxMapping } from './web-pvx-mapping-core.mjs';
import { REFERRAL_TOKEN_PATTERN, referralKey, referralPublicId, referralRecordIsFresh } from './referral-link-core.mjs';
import { patchLeadContext, recoverLeadFromWebMapping, recordLeadMilestone } from './lead-operations-core.mjs';

export const PVX_WEB_JOURNEY_BUILD = 'CF-TECH-APPOINTMENT-1.0';
export const PVX_WEB_JOURNEY_SCHEMA = '1.0';
export const PVX_WEB_JOURNEY_PREFIX = 'pvx/web-journey/';
export const PVX_WEB_BOOTSTRAP_PREFIX = 'pvx/web-bootstrap/';
export const PVX_WEB_RETURN_PREFIX = 'pvx/web-return/';
export const PVX_WEB_JOURNEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PVX_WEB_RETURN_TTL_MS = 24 * 60 * 60 * 1000;
export const PVX_WEB_RESUME_COOKIE = 'cf_pvx_web_resume';
export const PVX_WEB_RESUME_PATTERN = /^pvxw_[A-Za-z0-9_-]{43}$/;
export const PVX_WEB_BOOTSTRAP_ID_PATTERN = /^pvxb_[A-Za-z0-9_-]{16,80}$/;
export const PVX_WEB_RETURN_PATTERN = /^pvxwr_[A-Za-z0-9_-]{43}$/;
export const DEFAULT_WEB_ORIGINS = Object.freeze([
  'https://408farmers.com',
  'https://www.408farmers.com',
  'https://review.408farmers.com',
  'https://coveragefit.com',
  'https://www.coveragefit.com'
]);
export const PVX_WEB_STAGES = Object.freeze([
  'entry', 'appointment_requested', 'appointment_booked', 'discovery_started', 'snapshot_viewed', 'snapshot_saved',
  'home_profile_started', 'home_profile_ready', 'policy_review_started',
  'coverage_review_ready', 'producer_review_ready', 'continue_later'
]);

const text = (value, max = 240) => String(value ?? '')
  .trim()
  .replace(/[<>\u0000-\u001f\u007f]/g, '')
  .slice(0, max);

function nowDate(options = {}) {
  const candidate = typeof options.now === 'function' ? options.now() : options.now;
  const date = candidate instanceof Date ? candidate : candidate ? new Date(candidate) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function securityHeaders(extra = {}) {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  };
}

function json(body, status = 200, extra = {}) {
  return Response.json(body, { status, headers: securityHeaders(extra) });
}

function htmlError(status, title, message) {
  const body = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><body><main><h1>${title}</h1><p>${message}</p><p><a href="/pvx/start/">Start a new CoverageFit Snapshot</a></p></main></body></html>`;
  return new Response(body, { status, headers: securityHeaders({ 'Content-Type': 'text/html; charset=utf-8' }) });
}

function error(status, code, message) {
  return json({ ok: false, error: { code, message } }, status);
}

function cookieValue(request, name) {
  const cookie = String(request.headers.get('cookie') || '');
  for (const part of cookie.split(';')) {
    const [candidate, ...value] = part.trim().split('=');
    if (candidate === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

function requestSourceOrigin(request) {
  const explicit = text(request.headers.get('origin'), 240);
  if (explicit) return explicit;
  const referer = text(request.headers.get('referer'), 500);
  try { return referer ? new URL(referer).origin : ''; } catch (_) { return ''; }
}

function allowedOrigin(request, options = {}) {
  const sourceOrigin = requestSourceOrigin(request);
  const allowed = new Set(Array.isArray(options.allowedOrigins) ? options.allowedOrigins : DEFAULT_WEB_ORIGINS);
  try {
    const targetOrigin = new URL(request.url).origin;
    if (sourceOrigin === targetOrigin) return { allowed: true, sourceOrigin, targetOrigin };
    return { allowed: allowed.has(sourceOrigin), sourceOrigin, targetOrigin };
  } catch (_) {
    return { allowed: false, sourceOrigin, targetOrigin: '' };
  }
}

function sameOrigin(request) {
  try {
    const origin = request.headers.get('origin');
    return !origin || new URL(origin).origin === new URL(request.url).origin;
  } catch (_) { return false; }
}

async function readBootstrapPayload(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 16000) return { response: htmlError(413, 'Request too large', 'The CoverageFit start request was larger than expected.') };
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  try {
    if (contentType.includes('application/json')) {
      const raw = await request.text();
      if (raw.length > 16000) return { response: htmlError(413, 'Request too large', 'The CoverageFit start request was larger than expected.') };
      return { payload: JSON.parse(raw || '{}') };
    }
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      return { payload: Object.fromEntries([...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : ''])) };
    }
  } catch (_) {
    return { response: htmlError(400, 'Unable to begin', 'The secure CoverageFit start request could not be read.') };
  }
  return { response: htmlError(415, 'Unable to begin', 'CoverageFit expected a standard secure form submission.') };
}

export function createPvxWebResumeToken() {
  return `pvxw_${randomBase64Url(32)}`;
}

export function createPvxWebReturnToken() {
  return `pvxwr_${randomBase64Url(32)}`;
}

export async function pvxWebJourneyKey(token) {
  if (!PVX_WEB_RESUME_PATTERN.test(text(token, 80))) return '';
  return `${PVX_WEB_JOURNEY_PREFIX}${await sha256Hex(token)}`;
}

export async function pvxWebBootstrapKey(sourceOrigin, bootstrapId) {
  if (!PVX_WEB_BOOTSTRAP_ID_PATTERN.test(text(bootstrapId, 90))) return '';
  return `${PVX_WEB_BOOTSTRAP_PREFIX}${await sha256Hex(`${text(sourceOrigin, 240)}:${bootstrapId}`)}`;
}

export async function pvxWebReturnKey(token) {
  if (!PVX_WEB_RETURN_PATTERN.test(text(token, 90))) return '';
  return `${PVX_WEB_RETURN_PREFIX}${await sha256Hex(token)}`;
}

export async function issuePvxWebReturn(loaded, options = {}) {
  const store = options.store;
  if (!loaded?.record || !store?.setJSON) throw new TypeError('A loaded PVX journey is required.');
  const token = createPvxWebReturnToken();
  const now = nowDate(options);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PVX_WEB_RETURN_TTL_MS).toISOString();
  const key = await pvxWebReturnKey(token);
  await store.setJSON(key, { schemaVersion:'1.0', recordType:'pvx_web_return', journeyResumeToken:loaded.token, journeyId:loaded.record.journeyId, createdAt, expiresAt, consumedAt:'' }, { onlyIfNew:true, metadata:{ recordType:'pvx_web_return', journeyId:loaded.record.journeyId, createdAt, updatedAt:createdAt, expiresAt } });
  return { token, url:`/pvx/return/?return=${encodeURIComponent(token)}`, expiresAt };
}

export async function consumePvxWebReturn(token, options = {}) {
  const store = options.store;
  if (!store?.get || !store?.delete || !PVX_WEB_RETURN_PATTERN.test(text(token, 90))) return null;
  const key = await pvxWebReturnKey(token);
  const record = await store.get(key).catch(() => null);
  if (!record || record.consumedAt || Date.parse(record.expiresAt || '') <= nowDate(options).getTime() || !PVX_WEB_RESUME_PATTERN.test(record.journeyResumeToken || '')) return null;
  const journeyKey = await pvxWebJourneyKey(record.journeyResumeToken);
  const journey = await store.get(journeyKey).catch(() => null);
  if (!journey || Date.parse(journey.expiresAt || '') <= nowDate(options).getTime()) return null;
  await store.delete(key);
  return { token:record.journeyResumeToken, record:journey, destination:resolvePvxWebDestination(journey) };
}

export function pvxWebResumeCookie(token, maxAgeSeconds = Math.floor(PVX_WEB_JOURNEY_TTL_MS / 1000)) {
  if (!PVX_WEB_RESUME_PATTERN.test(text(token, 80))) return '';
  return `${PVX_WEB_RESUME_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}; HttpOnly; Secure; SameSite=Lax`;
}

export function resolvePvxWebDestination(record = {}) {
  const stage = text(record.currentStage, 60);
  if (record.seed?.journey?.experience === 'appointment_only') {
    const confirmation = text(record.projection?.appointmentCalendarUrl, 180);
    if (stage === 'appointment_booked' && /^\/appointment\/\?token=[A-Za-z0-9_-]{24,96}$/.test(confirmation)) return confirmation;
    return '/pvx/appointment/';
  }
  if (stage === 'entry' && record.seed?.entry?.type === 'snapshot') return '/pvx/discovery/';
  if (stage === 'discovery_started') return '/pvx/discovery/';
  if (['snapshot_viewed', 'snapshot_saved'].includes(stage)) return '/pvx/snapshot/';
  if (['home_profile_started', 'home_profile_ready'].includes(stage)) return '/pvx/home-profile/';
  if (['policy_review_started', 'coverage_review_ready'].includes(stage)) return '/pvx/policy/';
  if (stage === 'producer_review_ready') return '/pvx/progress/';
  if (stage === 'continue_later') return '/pvx/continue/';
  return '/pvx/start/';
}

function publicJourney(record, includeSeed = false) {
  const result = {
    schemaVersion: record.schemaVersion,
    build: record.build,
    journeyId: record.journeyId,
    source: record.source,
    hostMode: record.hostMode,
    currentStage: record.currentStage,
    currentStep: record.currentStep,
    completedStages: record.completedStages,
    projection: record.projection || {},
    destination: resolvePvxWebDestination(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt
  };
  if (includeSeed) result.seed = record.seed;
  return result;
}

export async function loadPvxWebJourneyFromRequest(request, options = {}) {
  const store = options.store;
  if (!store?.get) return null;
  const token = cookieValue(request, PVX_WEB_RESUME_COOKIE);
  if (!PVX_WEB_RESUME_PATTERN.test(token)) return null;
  const key = await pvxWebJourneyKey(token);
  const record = await store.get(key).catch(() => null);
  if (!record || Date.parse(record.expiresAt || '') <= nowDate(options).getTime()) return null;
  return { key, token, record };
}

async function persistNewJourney(mapping, sourceOrigin, bootstrapId, options = {}) {
  const store = options.store;
  const now = nowDate(options);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PVX_WEB_JOURNEY_TTL_MS).toISOString();
  const token = createPvxWebResumeToken();
  const key = await pvxWebJourneyKey(token);
  const journeyId = `pvxj_${randomBase64Url(16)}`;
  mapping.journey.journeyId = journeyId;
  const appointmentOnly = mapping.journey?.experience === 'appointment_only';
  const record = {
    schemaVersion: PVX_WEB_JOURNEY_SCHEMA,
    build: PVX_WEB_JOURNEY_BUILD,
    recordType: 'pvx_web_journey',
    journeyId,
    source: mapping.entry.source,
    hostMode: mapping.entry.hostMode,
    currentStage: appointmentOnly ? 'appointment_requested' : 'discovery_started',
    currentStep: appointmentOnly ? 'choose_time' : mapping.discovery.currentQuestionId,
    completedStages: ['entry'],
    projection: {},
    seed: mapping,
    createdAt,
    updatedAt: createdAt,
    expiresAt
  };
  await store.setJSON(key, record, { onlyIfNew: true, metadata: {
    recordType: record.recordType, journeyId, source: record.source, hostMode: record.hostMode,
    currentStage: record.currentStage, createdAt, updatedAt: createdAt, expiresAt
  }});
  const aliasKey = await pvxWebBootstrapKey(sourceOrigin, bootstrapId);
  if (aliasKey) {
    try {
      await store.setJSON(aliasKey, {
        schemaVersion: '1.0', recordType: 'pvx_web_bootstrap_alias', token, journeyId, createdAt, expiresAt
      }, { onlyIfNew: true, metadata: { recordType: 'pvx_web_bootstrap_alias', journeyId, createdAt, updatedAt: createdAt, expiresAt } });
    } catch (_) {
      const winner = await store.get(aliasKey).catch(() => null);
      if (winner?.token && PVX_WEB_RESUME_PATTERN.test(winner.token)) {
        const winnerRecord = await store.get(await pvxWebJourneyKey(winner.token)).catch(() => null);
        if (winnerRecord) return { token: winner.token, record: winnerRecord, reused: true };
      }
      throw _;
    }
  }
  return { token, record, reused: false };
}

export async function createOrReusePvxWebJourney(source = {}, options = {}) {
  const store = options.store;
  if (!store?.get || !store?.setJSON) throw new TypeError('PVX journey storage is unavailable.');
  const sourceOrigin = text(options.sourceOrigin, 240);
  const bootstrapId = text(source.bootstrapId || source.bootstrap_id, 90);
  if (!PVX_WEB_BOOTSTRAP_ID_PATTERN.test(bootstrapId)) throw new TypeError('A valid idempotent bootstrap id is required.');
  const aliasKey = await pvxWebBootstrapKey(sourceOrigin, bootstrapId);
  const existing = await store.get(aliasKey).catch(() => null);
  if (existing?.token && PVX_WEB_RESUME_PATTERN.test(existing.token) && Date.parse(existing.expiresAt || '') > nowDate(options).getTime()) {
    const record = await store.get(await pvxWebJourneyKey(existing.token)).catch(() => null);
    if (record) return { mapping: record.seed, token: existing.token, record, reused: true };
  }
  const referral = await resolvePvxWebReferralContext(source, options);
  const mapping = mapWebToPvx(referral.source, options);
  const validation = validateWebPvxMapping(mapping);
  if (!validation.valid) throw new TypeError(`Invalid web-to-PVX mapping: ${validation.errors.join(',')}`);
  if (!mapping.canEnterPvx) return { mapping, token: '', record: null, reused: false };
  const created = await persistNewJourney(mapping, sourceOrigin, bootstrapId, options);
  return { mapping: created.record.seed, ...created };
}

export async function resolvePvxWebReferralContext(source = {}, options = {}) {
  const candidate = { ...(source || {}) };
  const token = text(candidate.referralToken || candidate.referral_token, 80);
  delete candidate.referralToken;
  delete candidate.referral_token;
  if (!token) return { source: candidate, status: candidate.entry_type === 'neighbor' ? 'generic' : 'not_applicable' };
  if (!REFERRAL_TOKEN_PATTERN.test(token) || !options.referralStore?.get) return { source: { ...candidate, referral_status: 'generic_fallback' }, status: 'generic_fallback' };
  const key = await referralKey(token);
  const record = await options.referralStore.get(key).catch(() => null);
  if (!referralRecordIsFresh(record, nowDate(options))) return { source: { ...candidate, referral_status: 'generic_fallback' }, status: 'generic_fallback' };
  const origin = record.origin && typeof record.origin === 'object' ? record.origin : {};
  return {
    status: 'verified',
    source: {
      ...candidate,
      referral_id: await referralPublicId(token),
      referral_status: 'verified',
      campaign: candidate.campaign || origin.campaign || 'neighbor_referral',
      campaign_id: candidate.campaign_id || origin.campaignId || '',
      campaign_variant: candidate.campaign_variant || origin.campaignVariant || '',
      campaign_zip: candidate.campaign_zip || origin.campaignZip || '',
      source: candidate.source || '408farmers_neighbor'
    }
  };
}

export async function advancePvxWebJourney(loaded, options = {}) {
  const store = options.store;
  if (!loaded?.record || !loaded?.key || !store?.setJSON) throw new TypeError('A loaded PVX web journey is required.');
  const stage = text(options.stage, 60);
  if (!PVX_WEB_STAGES.includes(stage)) throw new TypeError('A supported PVX web stage is required.');
  const updatedAt = nowDate(options).toISOString();
  const details = options.details && typeof options.details === 'object' ? options.details : {};
  const record = {
    ...loaded.record,
    currentStage: stage,
    currentStep: text(options.currentStep, 120) || loaded.record.currentStep,
    completedStages: Array.from(new Set([...(loaded.record.completedStages || []), ...(options.completedStage ? [text(options.completedStage, 60)] : [])])).filter(value => PVX_WEB_STAGES.includes(value)),
    projection: {
      ...(loaded.record.projection || {}),
      ...(stage === 'snapshot_viewed' ? { snapshotStatus: 'viewed' } : {}),
      ...(stage === 'snapshot_saved' ? { snapshotStatus: 'saved', latestReportRevision: '1' } : {}),
      ...(stage === 'home_profile_started' ? { homeProfileStatus: 'started' } : {}),
      ...(stage === 'home_profile_ready' ? { homeProfileStatus: 'ready', latestReportRevision: '2H' } : {}),
      ...(stage === 'policy_review_started' ? { policyReviewStatus: 'started' } : {}),
      ...(stage === 'coverage_review_ready' ? { policyReviewStatus: 'ready', latestReportRevision: '2P' } : {}),
      ...(text(details.requestedProducerAction, 80) ? { requestedProducerAction: text(details.requestedProducerAction, 80) } : {}),
      ...(/^\/appointment\/\?token=[A-Za-z0-9_-]{24,96}$/.test(text(details.appointmentCalendarUrl, 180)) ? { appointmentCalendarUrl:text(details.appointmentCalendarUrl,180), appointmentDisplay:text(details.appointmentDisplay,160) } : {}),
      ...(Array.isArray(details.reviewTopics) ? { reviewTopics: details.reviewTopics.slice(0, 3) } : {}),
      ...(Array.isArray(details.topicResponses) ? { topicResponses: details.topicResponses.slice(0, 3) } : {}),
      ...(['independent','building_controlled','unsure'].includes(text(details.unitWaterShutoff,40).toLowerCase()) ? { unitWaterShutoff:text(details.unitWaterShutoff,40).toLowerCase() } : {}),
      ...(['installed','not_installed','unsure','not_applicable'].includes(text(details.automaticWaterShutoffDevice,40).toLowerCase()) ? { automaticWaterShutoffDevice:text(details.automaticWaterShutoffDevice,40).toLowerCase() } : {}),
      ...(['yes','maybe','no','not_asked'].includes(text(details.waterShutoffWillingness,40).toLowerCase()) ? { waterShutoffWillingness:text(details.waterShutoffWillingness,40).toLowerCase() } : {})
    },
    updatedAt
  };
  await store.setJSON(loaded.key, record, { metadata: {
    recordType: record.recordType, journeyId: record.journeyId, source: record.source, hostMode: record.hostMode,
    currentStage: record.currentStage, createdAt: record.createdAt, updatedAt, expiresAt: record.expiresAt
  }});
  const leadCheckpointId = text(record.seed?.contact?.leadCheckpointId, 120);
  const milestone = text(details.requestedProducerAction, 80) === 'contact_requested'
    ? 'contact_requested'
    : stage === 'snapshot_viewed' || stage === 'snapshot_saved'
      ? 'snapshot_completed'
      : stage === 'home_profile_ready'
        ? 'home_profile_ready'
        : stage === 'coverage_review_ready'
          ? 'policy_review_ready'
          : '';
  if (leadCheckpointId && milestone) {
    await recordLeadMilestone(store, leadCheckpointId, milestone, options).catch(() => null);
  }
  if (leadCheckpointId && (details.unitWaterShutoff || details.automaticWaterShutoffDevice || details.waterShutoffWillingness)) {
    await patchLeadContext(store, leadCheckpointId, {
      unitWaterShutoff: details.unitWaterShutoff,
      automaticWaterShutoffDevice: details.automaticWaterShutoffDevice,
      waterShutoffWillingness: details.waterShutoffWillingness
    }, options).catch(() => null);
  }
  return record;
}

export async function handlePvxWebBootstrap(request, options = {}) {
  if (request.method !== 'POST') return htmlError(405, 'Unable to begin', 'CoverageFit requires a secure start submission.');
  const origin = allowedOrigin(request, options);
  if (!origin.allowed) return htmlError(403, 'Unable to begin', 'This CoverageFit start request came from an unrecognized site.');
  const parsed = await readBootstrapPayload(request);
  if (parsed.response) return parsed.response;
  try {
    const result = await createOrReusePvxWebJourney(parsed.payload, { ...options, sourceOrigin: origin.sourceOrigin });
    if (!result.mapping.canEnterPvx) {
      const target = result.mapping.fallbackDestination || '/';
      return new Response(null, { status: 303, headers: securityHeaders({ Location: new URL(target, origin.sourceOrigin || request.url).toString() }) });
    }
    await recoverLeadFromWebMapping(result.mapping, options).catch(() => null);
    return new Response(null, { status: 303, headers: securityHeaders({
      Location: result.reused ? '/pvx/web/?handoff=resume' : '/pvx/web/?handoff=fresh',
      'Set-Cookie': pvxWebResumeCookie(result.token),
      'X-CoverageFit-Bootstrap': result.reused ? 'reused' : 'created'
    }) });
  } catch (_) {
    return htmlError(422, 'Unable to begin', 'The secure CoverageFit start request was incomplete. No personal information was placed in the URL.');
  }
}

export async function handlePvxWebJourney(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'This secure journey request must come from CoverageFit.');
  const loaded = await loadPvxWebJourneyFromRequest(request, options);
  if (!loaded) return error(401, 'resume_unavailable', 'This secure CoverageFit return is unavailable.');
  let payload;
  try { payload = await request.json(); } catch (_) { payload = {}; }
  const action = text(payload.action, 30) || 'load';
  if (action === 'load') return json({ ok: true, journey: publicJourney(loaded.record, true) });
  if (action !== 'update') return error(400, 'invalid_action', 'A supported journey action is required.');
  const stage = text(payload.stage, 60);
  if (!PVX_WEB_STAGES.includes(stage)) return error(400, 'invalid_stage', 'A supported journey stage is required.');
  const record = await advancePvxWebJourney(loaded, {
    ...options,
    stage,
    currentStep: payload.currentStep,
    completedStage: payload.completedStage,
    details: payload.details
  });
  return json({ ok: true, journey: publicJourney(record) });
}

export async function handlePvxWebReturn(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'This secure return request must come from CoverageFit.');
  let payload; try { payload = await request.json(); } catch (_) { payload = {}; }
  const action = text(payload.action, 20);
  if (action === 'issue') {
    const loaded = await loadPvxWebJourneyFromRequest(request, options);
    if (!loaded) return error(401, 'resume_unavailable', 'This CoverageFit journey is unavailable.');
    const access = await issuePvxWebReturn(loaded, options);
    return json({ ok:true, access });
  }
  if (action === 'consume') {
    const consumed = await consumePvxWebReturn(text(payload.token, 90), options);
    if (!consumed) return error(404, 'return_unavailable', 'This secure return has expired or was already used.');
    return json({ ok:true, destination:consumed.destination }, 200, { 'Set-Cookie':pvxWebResumeCookie(consumed.token) });
  }
  return error(422, 'invalid_action', 'Issue or consume a secure return.');
}
