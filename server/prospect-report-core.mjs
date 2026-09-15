import { byteLength, randomBase64Url, sha256Hex } from './runtime-crypto.mjs';

export const REPORT_SCHEMA_VERSION = '1.0';
export const REPORT_RECORD_VERSION = '1.0.0';
export const STORE_NAME = 'coveragefit-prospect-reports-v1';
export const RECORD_PREFIX = 'reports/';
export const REPORT_TTL_DAYS = 30;
export const REPORT_TTL_MS = REPORT_TTL_DAYS * 24 * 60 * 60 * 1000;
export const MAX_BODY_BYTES = 320000;
export const REPORT_ID_PATTERN = /^report_[A-Za-z0-9_-]{43}$/;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function error(status, code, message, detail = {}) {
  return json({ ok: false, error: { code, message, ...detail } }, status);
}

function sameOrigin(request) {
  const origin = text(request.headers.get('origin'));
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
}

function contentLength(request) {
  const parsed = Number(request.headers.get('content-length'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function timestamp(value, fallback = '') {
  const candidate = text(value, fallback);
  if (!candidate) return '';
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const declaredLength = contentLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    return { response: error(413, 'payload_too_large', 'The report payload is too large.') };
  }
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return { response: error(415, 'unsupported_media_type', 'Expected an application/json request.') };
  }
  let raw = '';
  try { raw = await request.text(); } catch (_) {
    return { response: error(400, 'invalid_body', 'The report payload could not be read.') };
  }
  if (!raw || byteLength(raw) > maxBytes) {
    return { response: error(raw ? 413 : 400, raw ? 'payload_too_large' : 'invalid_body', raw ? 'The report payload is too large.' : 'A report payload is required.') };
  }
  try { return { payload: JSON.parse(raw) }; }
  catch (_) { return { response: error(400, 'invalid_json', 'The report payload is not valid JSON.') }; }
}

function reportCustomer(report) {
  const consumer = report?.consumer || {};
  const prospect = report?.prospectProfile || {};
  const name = text(consumer.name) || [consumer.firstName || prospect.firstName, consumer.lastName || prospect.lastName].filter(Boolean).join(' ').trim();
  return {
    name,
    email: text(consumer.email || prospect.email)
  };
}

export function reportIsReady(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  if (text(report.assessment, 'home').toLowerCase() !== 'home') return false;
  const customer = reportCustomer(report);
  const completion = report.assessmentCompletion;
  const completionReady = !completion || (completion.scoreIsFinal !== false && Number(completion.missingRequiredCount || 0) === 0);
  return Boolean(customer.name && customer.email && Number.isFinite(Number(report.score)) && completionReady);
}

export function publicReportPayload(report) {
  const output = clone(report) || {};
  output.assessment = 'home';
  output.consumer = { ...(output.consumer || {}) };
  delete output.consumer.email;
  delete output.consumer.phone;
  delete output.prospectProfile;
  delete output.personalizationContext;
  delete output.consultationRecord;
  if (output.integration && typeof output.integration === 'object') {
    output.integration = { ...output.integration };
    delete output.integration.sessionId;
  }
  if (output.attribution && typeof output.attribution === 'object') {
    output.attribution = { ...output.attribution };
    delete output.attribution.sessionId;
  }
  delete output.prospectReport;
  return output;
}

export function createReportId() {
  return `report_${randomBase64Url(32)}`;
}

export async function reportKey(reportId) {
  if (!REPORT_ID_PATTERN.test(text(reportId))) return '';
  return `${RECORD_PREFIX}${await sha256Hex(reportId)}`;
}


function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const createdAt = timestamp(record.createdAt);
  const expiresAt = timestamp(record.expiresAt);
  const publicCustomerName = text(record?.report?.consumer?.name || [record?.report?.consumer?.firstName, record?.report?.consumer?.lastName].filter(Boolean).join(' '));
  if (!createdAt || !expiresAt || text(record?.report?.assessment, 'home').toLowerCase() !== 'home' || !publicCustomerName || !Number.isFinite(Number(record?.report?.score))) return null;
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    recordVersion: text(record.recordVersion, REPORT_RECORD_VERSION),
    product: 'home',
    createdAt,
    expiresAt,
    report: publicReportPayload(record.report)
  };
}

function recordMetadata(record) {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    recordVersion: REPORT_RECORD_VERSION,
    product: 'home',
    createdAt: record.createdAt,
    expiresAt: record.expiresAt
  };
}

export async function handleProspectReportCreate(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'The private report must be created from this CoverageFit site.');
  const parsed = await readJsonBody(request);
  if (parsed.response) return parsed.response;
  if (text(parsed.payload?.website)) return json({ ok: true, accepted: true }, 202);
  const report = parsed.payload?.report;
  if (!reportIsReady(report)) {
    return error(422, 'invalid_report', 'A completed Home Protection Snapshot with a customer name, email, and score is required.');
  }
  const store = options.store;
  if (!store?.setJSON) return error(503, 'storage_unavailable', 'Private report storage is unavailable.');
  const now = options.now instanceof Date ? options.now : new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + REPORT_TTL_MS).toISOString();
  const record = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    recordVersion: REPORT_RECORD_VERSION,
    product: 'home',
    createdAt,
    expiresAt,
    report: publicReportPayload(report)
  };
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = createReportId();
      const key = await reportKey(id);
      try {
        await store.setJSON(key, record, { metadata: recordMetadata(record), onlyIfNew: true });
        const operationsRef = text(report?.integration?.operationsRef || report?.prospectProfile?.integration?.operationsRef);
        if (/^sot_[A-Za-z0-9_-]{22}$/.test(operationsRef) && options.operationsStore?.get && options.operationsStore?.setJSON) {
          const map = await options.operationsStore.get(`sms-ops/handoff-map/${await sha256Hex(operationsRef)}`).catch(() => null);
          const smsConversationId = text(map?.conversationId);
          if (/^sms-live-[a-f0-9]{32,64}$/i.test(smsConversationId)) {
            const smsKey = `sms-live-conversations/${smsConversationId}`;
            const conversation = await options.operationsStore.get(smsKey).catch(() => null);
            if (conversation && typeof conversation === 'object') {
              conversation.coverageFitStartedAt = conversation.coverageFitStartedAt || createdAt;
              conversation.coverageFitCompletedAt = createdAt;
              conversation.updatedAt = createdAt;
              await options.operationsStore.setJSON(smsKey, conversation, { metadata: { state: conversation.state || '', intent: conversation.intent || '', coverageFitCompleted: true, createdAt: conversation.createdAt || createdAt, updatedAt: createdAt } }).catch(() => {});
            }
          }
        }
        return json({
          ok: true,
          access: { id, createdAt, expiresAt, ttlDays: REPORT_TTL_DAYS }
        }, 201);
      } catch (cause) {
        if (attempt === 2) throw cause;
      }
    }
  } catch (cause) {
    console.error('CoverageFit private report creation failed', cause);
    return error(503, 'storage_write_failed', 'The private report could not be saved.');
  }
  return error(503, 'storage_write_failed', 'The private report could not be saved.');
}

export async function handleProspectReportRead(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'The private report must be opened from this CoverageFit site.');
  const parsed = await readJsonBody(request, 16000);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.reportId);
  if (!REPORT_ID_PATTERN.test(id)) return error(404, 'report_unavailable', 'This private Protection Snapshot is unavailable.');
  const store = options.store;
  if (!store?.get) return error(503, 'storage_unavailable', 'Private report storage is unavailable.');
  const key = await reportKey(id);
  try {
    const stored = await store.get(key, { type: 'json', consistency: 'strong' });
    const record = normalizeRecord(stored);
    if (!record) return error(404, 'report_unavailable', 'This private Protection Snapshot is unavailable.');
    const now = options.now instanceof Date ? options.now : new Date();
    if (new Date(record.expiresAt).getTime() <= now.getTime()) {
      try { await store.delete?.(key); } catch (_) {}
      return error(410, 'report_expired', 'This private Protection Snapshot has expired.', { expiresAt: record.expiresAt });
    }
    return json({
      ok: true,
      report: record.report,
      access: {
        id,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        ttlDays: REPORT_TTL_DAYS
      }
    });
  } catch (cause) {
    console.error('CoverageFit private report read failed', cause);
    return error(503, 'storage_read_failed', 'The private report could not be opened right now.');
  }
}
