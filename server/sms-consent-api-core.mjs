import { authorizeProducer } from './consultation-inbox-core.mjs';
import { normalizeSmsConsent, reconcileSmsProviderConsent, smsPermissionSnapshot } from './sms-consent-core.mjs';
import { writeOpsAudit } from './sms-operations-core.mjs';

export const SMS_CONSENT_API_BUILD = 'RC-SMS-1.9.8';
const LIVE_PREFIX = 'sms-live-conversations/';
const LIVE_ID = /^sms-live-[a-f0-9]{32,64}$/i;
const MAX_BODY_BYTES = 6000;
const PROVIDER_STATUSES = new Set(['unknown', 'active', 'opted_out', 'blocked']);

const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' } });
const error = (status, code, message) => json({ ok: false, error: { code, message } }, status);
const nowIso = options => {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};
function sameOrigin(request) {
  try { return new URL(text(request.headers.get('origin'))).origin === new URL(request.url).origin; } catch (_) { return false; }
}
async function parseBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { response: error(413, 'payload_too_large', 'Consent request is too large.') };
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return { response: error(415, 'unsupported_media_type', 'Expected application/json.') };
  try { return { payload: await request.json() }; } catch (_) { return { response: error(400, 'invalid_json', 'A valid consent request is required.') }; }
}
function publicConsent(conversation, options = {}) {
  const permission = smsPermissionSnapshot(conversation, options);
  return {
    ...permission.consent,
    automationAllowed: permission.allowed,
    applicationSuppressed: permission.applicationSuppressed,
    providerSuppressed: permission.providerSuppressed
  };
}

export async function handleSmsConsent(request, options = {}) {
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'SMS consent storage is unavailable.');
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const conversationId = text(url.searchParams.get('conversation_id'));
    if (!LIVE_ID.test(conversationId)) return error(422, 'invalid_conversation_id', 'A valid SMS conversation identifier is required.');
    const conversation = await store.get(`${LIVE_PREFIX}${conversationId}`);
    if (!conversation || typeof conversation !== 'object') return error(404, 'conversation_not_found', 'The SMS relationship was not found.');
    return json({ ok: true, build: SMS_CONSENT_API_BUILD, conversationId, consent: publicConsent(conversation, { occurredAt: nowIso(options) }) });
  }

  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'GET or POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Consent reconciliation must originate from this CoverageFit site.');
  const parsed = await parseBody(request);
  if (parsed.response) return parsed.response;
  const conversationId = text(parsed.payload?.conversationId);
  const action = text(parsed.payload?.action).toLowerCase();
  if (!LIVE_ID.test(conversationId)) return error(422, 'invalid_conversation_id', 'A valid SMS conversation identifier is required.');
  if (action !== 'reconcile_provider') return error(422, 'invalid_action', 'Only provider consent reconciliation is supported here.');
  const providerStatus = text(parsed.payload?.providerStatus).toLowerCase();
  if (!PROVIDER_STATUSES.has(providerStatus)) return error(422, 'invalid_provider_status', 'A supported provider consent status is required.');
  const key = `${LIVE_PREFIX}${conversationId}`;
  let conversation = await store.get(key);
  if (!conversation || typeof conversation !== 'object') return error(404, 'conversation_not_found', 'The SMS relationship was not found.');
  const occurredAt = nowIso(options);
  conversation = reconcileSmsProviderConsent(conversation, providerStatus, { occurredAt });
  conversation.smsConsent = normalizeSmsConsent(conversation, { occurredAt });
  conversation.updatedAt = occurredAt;
  await store.setJSON(key, conversation, { metadata: {
    state: conversation.state || '', consentStatus: conversation.smsConsent.status, providerConsentStatus: conversation.smsConsent.providerStatus,
    createdAt: conversation.createdAt || occurredAt, updatedAt: occurredAt, build: SMS_CONSENT_API_BUILD
  } });
  await writeOpsAudit(store, 'sms_consent_provider_reconciled', { conversationId, detail: `Provider consent status reconciled to ${providerStatus}.` }, options);
  return json({ ok: true, build: SMS_CONSENT_API_BUILD, conversationId, consent: publicConsent(conversation, { occurredAt }) });
}
