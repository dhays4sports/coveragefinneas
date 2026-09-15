import { byteLength, sha256Hex } from './runtime-crypto.mjs';
import { reportKey, REPORT_ID_PATTERN } from './prospect-report-core.mjs';
import {
  REFERRAL_SCHEMA_VERSION,
  REFERRAL_TYPE,
  REFERRAL_TOKEN_PATTERN,
  referralKey,
  referralPublicId,
  referralRecordIsFresh
} from './referral-link-core.mjs';

export const REFERRAL_EVENT_SCHEMA_VERSION = '1.0';
export const REFERRAL_EVENT_RECORD_VERSION = '1.0.0';
export const REFERRAL_EVENT_PREFIX = 'events/';
export const REFERRAL_EVENT_TTL_DAYS = 180;
export const REFERRAL_EVENT_TTL_MS = REFERRAL_EVENT_TTL_DAYS * 24 * 60 * 60 * 1000;
export const MAX_BODY_BYTES = 16000;
export const REFERRAL_EVENTS = Object.freeze([
  'neighbor_share_view',
  'neighbor_share_click',
  'neighbor_referral_visit',
  'neighbor_referral_start',
  'neighbor_referral_complete'
]);
export const SHARE_CHANNELS = Object.freeze(['sms', 'native', 'copy']);

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function clean(value, max = 120) {
  return text(value).replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, max);
}

function postalCode(value) {
  return text(value).match(/(?:^|\D)(\d{5})(?:-\d{4})?(?:\D|$)/)?.[1] || '';
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

async function readJsonBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { response: error(413, 'payload_too_large', 'The referral event is too large.') };
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return { response: error(415, 'unsupported_media_type', 'Expected an application/json request.') };
  let raw = '';
  try { raw = await request.text(); } catch (_) { return { response: error(400, 'invalid_body', 'The referral event could not be read.') }; }
  if (!raw || byteLength(raw) > MAX_BODY_BYTES) return { response: error(raw ? 413 : 400, raw ? 'payload_too_large' : 'invalid_body', raw ? 'The referral event is too large.' : 'A referral event is required.') };
  try { return { payload: JSON.parse(raw) }; } catch (_) { return { response: error(400, 'invalid_json', 'The referral event is not valid JSON.') }; }
}

async function readReferral(token, referralStore, now) {
  if (!referralStore?.get) return { error: error(503, 'storage_unavailable', 'Referral storage is unavailable.') };
  const key = await referralKey(token);
  try {
    const record = await referralStore.get(key);
    if (!record || record.schemaVersion !== REFERRAL_SCHEMA_VERSION || record.referralType !== REFERRAL_TYPE) return { error: error(404, 'referral_unavailable', 'This referral is unavailable.') };
    if (!referralRecordIsFresh(record, now)) return { error: error(410, 'referral_expired', 'This referral has expired.') };
    return { record };
  } catch (cause) {
    console.error('CoverageFit referral event origin read failed', cause);
    return { error: error(503, 'storage_read_failed', 'This referral could not be verified.') };
  }
}

async function readDestinationReport(reportId, reportStore, referralId, now) {
  if (!REPORT_ID_PATTERN.test(text(reportId))) return { error: error(422, 'report_required', 'A completed server-backed Home report is required.') };
  if (!reportStore?.get) return { error: error(503, 'storage_unavailable', 'Private report storage is unavailable.') };
  const key = await reportKey(reportId);
  try {
    const stored = await reportStore.get(key);
    const report = stored?.report;
    const expiresAt = Date.parse(stored?.expiresAt || '');
    if (!report || text(report.assessment, 'home').toLowerCase() !== 'home') return { error: error(404, 'report_unavailable', 'The completed Home review is unavailable.') };
    if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return { error: error(410, 'report_expired', 'The completed Home review has expired.') };
    if (text(report.integration?.referralId) !== referralId) return { error: error(409, 'referral_mismatch', 'The completed review does not match this referral.') };
    const property = report.propertyProfile?.address || {};
    const destinationZip = postalCode(property.postalCode || report.propertyProfile?.postalCode || report.consumer?.propertyAddress || report.consumer?.detail);
    return { report, destinationZip, destinationSubmissionId: await sha256Hex(reportId) };
  } catch (cause) {
    console.error('CoverageFit referral completion report read failed', cause);
    return { error: error(503, 'storage_read_failed', 'The completed Home review could not be verified.') };
  }
}

function normalizeEvent(value) {
  const candidate = text(value);
  return REFERRAL_EVENTS.includes(candidate) ? candidate : '';
}

function normalizeChannel(value) {
  const candidate = text(value);
  return SHARE_CHANNELS.includes(candidate) ? candidate : '';
}

function normalizeSession(value) {
  const candidate = clean(value, 100);
  return /^[A-Za-z0-9_-]{8,100}$/.test(candidate) ? candidate : '';
}

async function dedupePart(eventName, payload, referralId, reportData) {
  if (eventName === 'neighbor_share_view') return 'origin';
  if (eventName === 'neighbor_share_click') return normalizeChannel(payload.channel) || 'unknown';
  if (eventName === 'neighbor_referral_complete') return reportData?.destinationSubmissionId || '';
  const sessionId = normalizeSession(payload.sessionId);
  return sessionId ? await sha256Hex(sessionId) : '';
}

function eventMetadata(record) {
  return {
    schemaVersion: REFERRAL_EVENT_SCHEMA_VERSION,
    recordVersion: REFERRAL_EVENT_RECORD_VERSION,
    eventName: record.eventName,
    referralId: record.referralId,
    campaignId: record.origin.campaignId || record.origin.campaign || '',
    campaignVariant: record.origin.campaignVariant || '',
    originZip: record.origin.campaignZip || record.origin.zip || '',
    destinationZip: record.destinationZip || '',
    occurredAt: record.occurredAt,
    expiresAt: record.expiresAt
  };
}

export async function referralEventKey(token, eventName, dedupeValue) {
  if (!REFERRAL_TOKEN_PATTERN.test(text(token)) || !normalizeEvent(eventName) || !text(dedupeValue)) return '';
  return `${REFERRAL_EVENT_PREFIX}${await sha256Hex(`${token}|${eventName}|${dedupeValue}`)}`;
}

export async function handleReferralEvent(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Referral events must be recorded from this CoverageFit site.');
  const parsed = await readJsonBody(request);
  if (parsed.response) return parsed.response;
  const payload = parsed.payload || {};
  const token = text(payload.token);
  const eventName = normalizeEvent(payload.event);
  if (!REFERRAL_TOKEN_PATTERN.test(token) || !eventName) return error(422, 'invalid_event', 'A valid referral token and event are required.');
  if (!options.eventStore?.get || !options.eventStore?.setJSON) return error(503, 'storage_unavailable', 'Referral event storage is unavailable.');

  const now = options.now instanceof Date ? options.now : new Date();
  const source = await readReferral(token, options.referralStore, now);
  if (source.error) return source.error;
  const referralId = await referralPublicId(token);
  let reportData = null;
  if (eventName === 'neighbor_referral_complete') {
    reportData = await readDestinationReport(text(payload.reportId), options.reportStore, referralId, now);
    if (reportData.error) return reportData.error;
  }
  const dedupeValue = await dedupePart(eventName, payload, referralId, reportData);
  if (!dedupeValue) return error(422, 'dedupe_context_required', 'This referral event is missing its session, channel, or completion context.');
  const key = await referralEventKey(token, eventName, dedupeValue);
  const occurredAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + REFERRAL_EVENT_TTL_MS).toISOString();
  const origin = source.record.origin && typeof source.record.origin === 'object' ? source.record.origin : {};
  const record = {
    schemaVersion: REFERRAL_EVENT_SCHEMA_VERSION,
    recordVersion: REFERRAL_EVENT_RECORD_VERSION,
    eventName,
    referralId,
    referralType: REFERRAL_TYPE,
    channel: normalizeChannel(payload.channel) || clean(payload.channel, 30),
    landingSource: clean(payload.landingSource, 80),
    sessionIdHash: ['neighbor_referral_visit', 'neighbor_referral_start'].includes(eventName) ? dedupeValue : '',
    destinationSubmissionId: reportData?.destinationSubmissionId || '',
    destinationZip: reportData?.destinationZip || '',
    origin: {
      source: clean(origin.source, 100),
      campaign: clean(origin.campaign, 180),
      campaignId: clean(origin.campaignId, 180),
      campaignVariant: clean(origin.campaignVariant, 30),
      campaignZip: clean(origin.campaignZip, 10),
      medium: clean(origin.medium, 80),
      content: clean(origin.content, 180),
      entry: clean(origin.entry, 160),
      zip: clean(origin.zip, 10)
    },
    occurredAt,
    expiresAt
  };

  try {
    const existing = await options.eventStore.get(key);
    if (existing) return json({ ok: true, accepted: true, deduped: true, event: { name: eventName, referralId, occurredAt: existing.occurredAt || occurredAt } }, 200);
    await options.eventStore.setJSON(key, record, { metadata: eventMetadata(record), onlyIfNew: true });
    return json({ ok: true, accepted: true, deduped: false, event: { name: eventName, referralId, occurredAt } }, 201);
  } catch (cause) {
    try {
      const existing = await options.eventStore.get(key);
      if (existing) return json({ ok: true, accepted: true, deduped: true, event: { name: eventName, referralId, occurredAt: existing.occurredAt || occurredAt } }, 200);
    } catch (_) {}
    console.error('CoverageFit referral event write failed', cause);
    return error(503, 'storage_write_failed', 'The referral event could not be recorded.');
  }
}
