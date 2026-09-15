import { byteLength, randomBase64Url, sha256Hex } from './runtime-crypto.mjs';
import { reportKey, REPORT_ID_PATTERN } from './prospect-report-core.mjs';
import { resolveFlyerCampaign } from './campaign-identifiers.mjs';

export const REFERRAL_SCHEMA_VERSION = '1.0';
export const REFERRAL_RECORD_VERSION = '1.0.0';
export const REFERRAL_TYPE = 'neighbor';
export const REFERRAL_PREFIX = 'referrals/';
export const ORIGIN_PREFIX = 'origins/';
export const REFERRAL_TTL_DAYS = 90;
export const REFERRAL_TTL_MS = REFERRAL_TTL_DAYS * 24 * 60 * 60 * 1000;
export const MAX_BODY_BYTES = 16000;
export const REFERRAL_TOKEN_PATTERN = /^ref_[A-Za-z0-9_-]{16}$/;
export const CANONICAL_REFERRAL_ORIGIN = 'https://408farmers.com';
export const CANONICAL_REFERRAL_PATH = '/neighbor/';
export const CANONICAL_REFERRAL_TOKEN_PATH = '/neighbor/r/';

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function clean(value, max = 160) {
  return text(value).replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, max);
}

function timestamp(value, fallback = '') {
  const candidate = text(value, fallback);
  if (!candidate) return '';
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
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

async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const declaredLength = contentLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    return { response: error(413, 'payload_too_large', 'The referral request is too large.') };
  }
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return { response: error(415, 'unsupported_media_type', 'Expected an application/json request.') };
  }
  let raw = '';
  try { raw = await request.text(); } catch (_) {
    return { response: error(400, 'invalid_body', 'The referral request could not be read.') };
  }
  if (!raw || byteLength(raw) > maxBytes) {
    return { response: error(raw ? 413 : 400, raw ? 'payload_too_large' : 'invalid_body', raw ? 'The referral request is too large.' : 'A referral request is required.') };
  }
  try { return { payload: JSON.parse(raw) }; }
  catch (_) { return { response: error(400, 'invalid_json', 'The referral request is not valid JSON.') }; }
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return '';
}

function postalCodeFromText(value) {
  const match = text(value).match(/(?:^|\D)(\d{5})(?:-\d{4})?(?:\D|$)/);
  return match ? match[1] : '';
}

export function originContext(report, createdAt = '') {
  const source = report && typeof report === 'object' ? report : {};
  const attribution = source.attribution && typeof source.attribution === 'object' ? source.attribution : {};
  const integration = source.integration && typeof source.integration === 'object' ? source.integration : {};
  const firstTouch = attribution.firstTouch && typeof attribution.firstTouch === 'object' ? attribution.firstTouch : {};
  const lastTouch = attribution.lastTouch && typeof attribution.lastTouch === 'object' ? attribution.lastTouch : {};
  const property = source.propertyProfile && typeof source.propertyProfile === 'object' ? source.propertyProfile : {};
  const propertyAddress = property.address && typeof property.address === 'object' ? property.address : {};
  const consumer = source.consumer && typeof source.consumer === 'object' ? source.consumer : {};

  const zip = firstValue(
    propertyAddress.postalCode,
    property.postalCode,
    source.propertyPersonalization?.postalCode,
    postalCodeFromText(consumer.propertyAddress),
    postalCodeFromText(consumer.detail)
  ).match(/^\d{5}$/)?.[0] || '';

  const flyer = resolveFlyerCampaign({
    campaignId: firstValue(integration.campaignId, attribution.campaignId, lastTouch.campaign_id, firstTouch.campaign_id),
    campaign: firstValue(integration.campaign, attribution.campaign, lastTouch.campaign, lastTouch.utm_campaign, firstTouch.campaign, firstTouch.utm_campaign),
    campaignVariant: firstValue(integration.campaignVariant, attribution.campaignVariant, lastTouch.campaign_variant, firstTouch.campaign_variant),
    campaignZip: firstValue(integration.campaignZip, attribution.campaignZip, lastTouch.campaign_zip, firstTouch.campaign_zip),
    utm_content: firstValue(lastTouch.utm_content, firstTouch.utm_content)
  });
  const campaign = flyer.active
    ? flyer.campaignId
    : firstValue(integration.campaign, attribution.campaign, lastTouch.campaign, lastTouch.utm_campaign, firstTouch.campaign, firstTouch.utm_campaign);

  return Object.freeze({
    source: firstValue(integration.source, attribution.source, lastTouch.source, lastTouch.utm_source, firstTouch.source, firstTouch.utm_source, 'direct'),
    campaign,
    campaignId: flyer.active ? flyer.campaignId : firstValue(integration.campaignId, attribution.campaignId, lastTouch.campaign_id, firstTouch.campaign_id),
    campaignVariant: flyer.active ? flyer.campaignVariant : firstValue(integration.campaignVariant, attribution.campaignVariant, lastTouch.campaign_variant, firstTouch.campaign_variant),
    campaignZip: flyer.active ? flyer.campaignZip : firstValue(integration.campaignZip, attribution.campaignZip, lastTouch.campaign_zip, firstTouch.campaign_zip),
    medium: firstValue(attribution.medium, lastTouch.medium, lastTouch.utm_medium, firstTouch.medium, firstTouch.utm_medium),
    content: firstValue(lastTouch.utm_content, firstTouch.utm_content),
    entry: firstValue(integration.entry, attribution.entry, lastTouch.entry, firstTouch.entry, firstTouch.path),
    zip,
    submissionCreatedAt: timestamp(createdAt || source.createdAt)
  });
}

export function createReferralToken() {
  return `ref_${randomBase64Url(12)}`;
}

export function referralUrl(token, options = {}) {
  const candidate = text(token);
  const origin = text(options.origin, CANONICAL_REFERRAL_ORIGIN).replace(/\/$/, '');
  if (!REFERRAL_TOKEN_PATTERN.test(candidate)) return new URL(CANONICAL_REFERRAL_PATH, `${origin}/`).toString();
  return new URL(`${CANONICAL_REFERRAL_TOKEN_PATH}${candidate}`, `${origin}/`).toString();
}

export async function referralKey(token) {
  if (!REFERRAL_TOKEN_PATTERN.test(text(token))) return '';
  return `${REFERRAL_PREFIX}${await sha256Hex(token)}`;
}

export async function referralPublicId(token) {
  if (!REFERRAL_TOKEN_PATTERN.test(text(token))) return '';
  return `nref_${(await sha256Hex(token)).slice(0, 24)}`;
}

export async function originAliasKey(reportId) {
  if (!REPORT_ID_PATTERN.test(text(reportId))) return '';
  return `${ORIGIN_PREFIX}${await sha256Hex(reportId)}`;
}

export function referralRecordIsFresh(record, now) {
  const expiresAt = Date.parse(record?.expiresAt || '');
  return Boolean(
    record
    && record.schemaVersion === REFERRAL_SCHEMA_VERSION
    && record.referralType === REFERRAL_TYPE
    && Number.isFinite(expiresAt)
    && expiresAt > now.getTime()
  );
}

function publicAccess(token, record, reused = false) {
  return {
    token,
    url: referralUrl(token),
    referralType: REFERRAL_TYPE,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    ttlDays: REFERRAL_TTL_DAYS,
    reused: Boolean(reused)
  };
}

function referralMetadata(record) {
  return {
    schemaVersion: REFERRAL_SCHEMA_VERSION,
    recordVersion: REFERRAL_RECORD_VERSION,
    referralType: REFERRAL_TYPE,
    source: record.origin.source,
    campaign: record.origin.campaign,
    campaignId: record.origin.campaignId || '',
    campaignVariant: record.origin.campaignVariant || '',
    campaignZip: record.origin.campaignZip || '',
    zip: record.origin.zip,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt
  };
}

async function readOriginReport(reportId, reportStore, now) {
  if (!reportStore?.get) return { error: error(503, 'storage_unavailable', 'Private report storage is unavailable.') };
  const key = await reportKey(reportId);
  if (!key) return { error: error(404, 'report_unavailable', 'The completed Home review is unavailable.') };
  try {
    const stored = await reportStore.get(key);
    const report = stored?.report;
    const expiresAt = Date.parse(stored?.expiresAt || '');
    if (!stored || !report || text(report.assessment, 'home').toLowerCase() !== 'home') {
      return { error: error(404, 'report_unavailable', 'The completed Home review is unavailable.') };
    }
    if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) {
      return { error: error(410, 'report_expired', 'The completed Home review has expired.') };
    }
    return { key, stored, report };
  } catch (cause) {
    console.error('CoverageFit referral origin read failed', cause);
    return { error: error(503, 'storage_read_failed', 'The completed Home review could not be verified.') };
  }
}

export async function handleReferralLinkCreate(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Referral links must be created from this CoverageFit site.');
  const parsed = await readJsonBody(request);
  if (parsed.response) return parsed.response;
  const reportId = text(parsed.payload?.reportId);
  if (!REPORT_ID_PATTERN.test(reportId)) return error(404, 'report_unavailable', 'The completed Home review is unavailable.');

  const referralStore = options.referralStore;
  if (!referralStore?.get || !referralStore?.setJSON) return error(503, 'storage_unavailable', 'Referral-link storage is unavailable.');
  const now = options.now instanceof Date ? options.now : new Date();
  const originReport = await readOriginReport(reportId, options.reportStore, now);
  if (originReport.error) return originReport.error;
  const aliasKey = await originAliasKey(reportId);

  try {
    const alias = await referralStore.get(aliasKey);
    if (alias?.token && REFERRAL_TOKEN_PATTERN.test(alias.token) && referralRecordIsFresh(alias, now)) {
      const existingKey = await referralKey(alias.token);
      const existing = await referralStore.get(existingKey);
      if (referralRecordIsFresh(existing, now)) {
        return json({ ok: true, access: publicAccess(alias.token, existing, true) }, 200);
      }
    }

    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + REFERRAL_TTL_MS).toISOString();
    const origin = originContext(originReport.report, originReport.stored?.createdAt);
    const originSubmissionId = await sha256Hex(reportId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = createReferralToken();
      const key = await referralKey(token);
      const record = {
        schemaVersion: REFERRAL_SCHEMA_VERSION,
        recordVersion: REFERRAL_RECORD_VERSION,
        referralType: REFERRAL_TYPE,
        createdAt,
        expiresAt,
        originSubmissionId,
        origin
      };
      try {
        await referralStore.setJSON(key, record, { metadata: referralMetadata(record), onlyIfNew: true });
        await referralStore.setJSON(aliasKey, {
          schemaVersion: REFERRAL_SCHEMA_VERSION,
          referralType: REFERRAL_TYPE,
          token,
          createdAt,
          expiresAt
        }, { metadata: { schemaVersion: REFERRAL_SCHEMA_VERSION, recordType: 'origin-alias', createdAt, expiresAt } });
        return json({ ok: true, access: publicAccess(token, record, false) }, 201);
      } catch (cause) {
        if (attempt === 2) throw cause;
      }
    }
  } catch (cause) {
    console.error('CoverageFit referral link creation failed', cause);
    return error(503, 'storage_write_failed', 'The referral link could not be created.');
  }
  return error(503, 'storage_write_failed', 'The referral link could not be created.');
}

export async function handleReferralLinkRead(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Referral links must be opened from this CoverageFit site.');
  const parsed = await readJsonBody(request);
  if (parsed.response) return parsed.response;
  const token = text(parsed.payload?.token);
  if (!REFERRAL_TOKEN_PATTERN.test(token)) {
    return error(404, 'referral_unavailable', 'This neighbor-shared review link is unavailable.', { fallbackUrl: referralUrl('') });
  }
  const referralStore = options.referralStore;
  if (!referralStore?.get) return error(503, 'storage_unavailable', 'Referral-link storage is unavailable.', { fallbackUrl: referralUrl('') });
  const key = await referralKey(token);
  try {
    const record = await referralStore.get(key);
    if (!record || record.schemaVersion !== REFERRAL_SCHEMA_VERSION || record.referralType !== REFERRAL_TYPE) {
      return error(404, 'referral_unavailable', 'This neighbor-shared review link is unavailable.', { fallbackUrl: referralUrl('') });
    }
    const now = options.now instanceof Date ? options.now : new Date();
    if (!referralRecordIsFresh(record, now)) {
      try { await referralStore.delete?.(key); } catch (_) {}
      return error(410, 'referral_expired', 'This neighbor-shared review link has expired.', { fallbackUrl: referralUrl(''), expiresAt: timestamp(record.expiresAt) });
    }
    return json({
      ok: true,
      referral: {
        id: await referralPublicId(token),
        token,
        referralType: REFERRAL_TYPE,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        ttlDays: REFERRAL_TTL_DAYS
      }
    });
  } catch (cause) {
    console.error('CoverageFit referral link read failed', cause);
    return error(503, 'storage_read_failed', 'This neighbor-shared review link could not be verified.', { fallbackUrl: referralUrl('') });
  }
}
