import { sha256Hex, timingSafeTextEqual } from './runtime-crypto.mjs';
import { projectSoloDeskEventBestEffort } from './solo-desk-event-projection.mjs';

export const LEAD_OPERATIONS_BUILD = 'CF-LEAD-OPS-1.3';
export const LEAD_OPERATIONS_SCHEMA = '1.2';
export const LEAD_RECORD_PREFIX = 'lead-ops/lead/';
export const LEAD_SYNC_LOCK_PREFIX = 'lead-ops/sync-lock/';
export const LEAD_STAGES = Object.freeze([
  'started',
  'snapshot_completed',
  'contact_requested',
  'home_profile_ready',
  'policy_review_ready'
]);

const CHECKPOINT_PATTERN = /^408d_[A-Za-z0-9_-]{16,80}$/;
const STAGE_RANK = Object.freeze(Object.fromEntries(LEAD_STAGES.map((stage, index) => [stage, index + 1])));
const MAX_BODY_BYTES = 16 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 730;
const CRM_SYNC_STAGES = new Set(['started', 'contact_requested', 'home_profile_ready', 'policy_review_ready']);
export const LEAD_SOURCE_DEFINITIONS = Object.freeze({
  web_408_general: Object.freeze({ label: 'Web — 408farmers.com General', pipeline: 'personal' }),
  web_408_home: Object.freeze({ label: 'Web — 408farmers.com Home', pipeline: 'personal' }),
  web_408_condo: Object.freeze({ label: 'Web — 408farmers.com Condo', pipeline: 'personal' }),
  web_408_home_auto: Object.freeze({ label: 'Web — 408farmers.com Home + Auto', pipeline: 'personal' }),
  web_408_buyer: Object.freeze({ label: 'Web — 408farmers.com Buyer', pipeline: 'personal' }),
  web_408_life: Object.freeze({ label: 'Web — 408farmers.com Life', pipeline: 'life' }),
  web_408_tech: Object.freeze({ label: 'Web — 408farmers.com Technology', pipeline: 'personal' }),
  web_408_teachers: Object.freeze({ label: 'Web — 408farmers.com Teachers', pipeline: 'personal' }),
  web_408_healthcare: Object.freeze({ label: 'Web — 408farmers.com Healthcare', pipeline: 'personal' }),
  web_408_engineers: Object.freeze({ label: 'Web — 408farmers.com Engineers', pipeline: 'personal' }),
  web_408_contact: Object.freeze({ label: 'Web — 408farmers.com Contact', pipeline: 'personal' }),
  web_coveragefit_home: Object.freeze({ label: 'Web — CoverageFit Home', pipeline: 'personal' }),
  web_coveragefit_business: Object.freeze({ label: 'Web — CoverageFit Business', pipeline: 'personal' }),
  web_coveragefit_landlord: Object.freeze({ label: 'Web — CoverageFit Landlord', pipeline: 'personal' }),
  web_coveragefit_nonrenewal: Object.freeze({ label: 'Web — CoverageFit Non-renewal', pipeline: 'personal' }),
  sms_home: Object.freeze({ label: 'SMS — 408-FARMERS HOME', pipeline: 'personal' }),
  sms_auto: Object.freeze({ label: 'SMS — 408-FARMERS AUTO', pipeline: 'personal' }),
  sms_buyer: Object.freeze({ label: 'SMS — 408-FARMERS BUYER', pipeline: 'personal' }),
  sms_bundle: Object.freeze({ label: 'SMS — 408-FARMERS HOME + AUTO', pipeline: 'personal' }),
  sms_life: Object.freeze({ label: 'SMS — 408-FARMERS LIFE', pipeline: 'life' }),
  sms_business: Object.freeze({ label: 'SMS — 408-FARMERS BUSINESS', pipeline: 'personal' }),
  sms_tech: Object.freeze({ label: 'SMS — 408-FARMERS TECH', pipeline: 'personal' }),
  sms_general: Object.freeze({ label: 'SMS — 408-FARMERS General', pipeline: 'personal' }),
  referral_realtor_buyer: Object.freeze({ label: 'Referral — Realtor Buyer', pipeline: 'personal' }),
  referral_neighbor: Object.freeze({ label: 'Referral — Neighbor', pipeline: 'personal' }),
  referral_408_local: Object.freeze({ label: 'Referral — 408 Local', pipeline: 'personal' })
});
const LEAD_SOURCE_KEYS = new Set(Object.keys(LEAD_SOURCE_DEFINITIONS));
const encoder = new TextEncoder();

const clean = (value, max = 240) => String(value ?? '')
  .trim()
  .replace(/[<>\u0000-\u001f\u007f]/g, '')
  .slice(0, max);
const digits = value => clean(value, 40).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').slice(-10);
const bool = value => value === true || ['true', '1', 'yes', 'on', 'granted', 'confirmed'].includes(clean(value, 20).toLowerCase());
const nowDate = options => {
  const candidate = typeof options?.now === 'function' ? options.now() : options?.now;
  const parsed = candidate instanceof Date ? candidate : candidate ? new Date(candidate) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};
const responseHeaders = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
});
const json = (body, status = 200) => Response.json(body, { status, headers: responseHeaders });
const error = (status, code, message) => json({ ok: false, error: { code, message } }, status);

function timestamp(value, fallback = '') {
  const candidate = clean(value, 40);
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function safeLandingPage(value) {
  try {
    const url = new URL(clean(value, 1000));
    if (url.protocol !== 'https:') return '';
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch (_) {
    const path = clean(value, 500);
    return path.startsWith('/') && !path.startsWith('//') ? path.split('?')[0].split('#')[0] : '';
  }
}

function sourceKeyFromRoute(value) {
  const landing = safeLandingPage(value);
  let host = '';
  let path = landing;
  try {
    const parsed = new URL(landing);
    host = parsed.hostname.toLowerCase();
    path = parsed.pathname;
  } catch (_) {}
  const coverageFitHost = host === 'coveragefit.com' || host === 'www.coveragefit.com' || host === 'review.408farmers.com';
  if (coverageFitHost) {
    if (path.startsWith('/business/')) return 'web_coveragefit_business';
    if (path.startsWith('/landlord/')) return 'web_coveragefit_landlord';
    if (path.startsWith('/nonrenewal/')) return 'web_coveragefit_nonrenewal';
    return 'web_coveragefit_home';
  }
  if (path.startsWith('/condo/')) return 'web_408_condo';
  if (path.startsWith('/auto-bundle/')) return 'web_408_home_auto';
  if (path.startsWith('/buyer/')) return 'web_408_buyer';
  if (path.startsWith('/life/')) return 'web_408_life';
  if (path.startsWith('/tech/')) return 'web_408_tech';
  if (path.startsWith('/teachers/')) return 'web_408_teachers';
  if (path.startsWith('/healthcare/')) return 'web_408_healthcare';
  if (path.startsWith('/engineers/')) return 'web_408_engineers';
  if (path.startsWith('/contact/')) return 'web_408_contact';
  if (path.startsWith('/neighbor/')) return 'referral_neighbor';
  if (path.startsWith('/local/')) return 'referral_408_local';
  if (path.startsWith('/home/')) return 'web_408_home';
  return 'web_408_general';
}

export function resolveLeadSourceKey(source = {}) {
  const explicit = clean(source.source_key ?? source.sourceKey, 80).toLowerCase();
  if (LEAD_SOURCE_KEYS.has(explicit)) return explicit;
  const rawSource = clean(source.source, 120).toLowerCase();
  const track = clean(source.review_track ?? source.product_track ?? source.reviewTrack, 40).toLowerCase();
  if (rawSource.includes('sms') || rawSource.includes('ringcentral')) {
    const smsKey = `sms_${track === 'home_review' ? 'home' : track}`;
    return LEAD_SOURCE_KEYS.has(smsKey) ? smsKey : 'sms_general';
  }
  if (rawSource.includes('coveragefit')) {
    if (track === 'business') return 'web_coveragefit_business';
    if (track === 'landlord') return 'web_coveragefit_landlord';
    if (track === 'nonrenewal') return 'web_coveragefit_nonrenewal';
    return 'web_coveragefit_home';
  }
  return sourceKeyFromRoute(source.landing_page ?? source.route_path ?? source.landingPage);
}

function boundedStage(value, fallback = 'started') {
  const candidate = clean(value, 40).toLowerCase();
  return LEAD_STAGES.includes(candidate) ? candidate : fallback;
}

function retentionExpiresAt(now, env = {}) {
  const configured = Number(env.COVERAGEFIT_LEAD_RETENTION_DAYS);
  const days = Number.isFinite(configured) ? Math.max(30, Math.min(3650, configured)) : DEFAULT_RETENTION_DAYS;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function leadRecordKey(checkpointId) {
  const id = clean(checkpointId, 120);
  return CHECKPOINT_PATTERN.test(id) ? `${LEAD_RECORD_PREFIX}${await sha256Hex(id)}` : '';
}

export function normalizeLeadPayload(source = {}, options = {}) {
  const checkpointId = clean(source.lead_checkpoint_id ?? source.leadCheckpointId, 120);
  if (!CHECKPOINT_PATTERN.test(checkpointId)) return { valid: false, error: 'invalid_checkpoint_id' };
  const stage = boundedStage(source.lead_stage ?? source.stage, 'started');
  const firstName = clean(source.first_name ?? source.firstName, 80);
  const lastName = clean(source.last_name ?? source.lastName, 100);
  const mobile = digits(source.mobile ?? source.phone);
  const email = clean(source.email, 160).toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const sourceKey = resolveLeadSourceKey(source);
  const sourceDefinition = LEAD_SOURCE_DEFINITIONS[sourceKey];
  const state = clean(source.contact_consent_state ?? source.contactConsentState, 30).toLowerCase();
  const version = clean(source.contact_consent_version ?? source.consent_version ?? source.consentVersion, 100);
  const capturedAt = timestamp(source.contact_consent_timestamp ?? source.consent_at ?? source.consentAt);
  const explicitConsent = bool(source.consent ?? source.contact_consent ?? source.contactConsent) || state === 'granted';
  const consentGranted = explicitConsent && Boolean(firstName && mobile && version && capturedAt);
  const contactBasis = clean(source.contact_basis ?? source.contactBasis, 60).toLowerCase();
  const contactBasisVersion = clean(source.contact_basis_version ?? source.contactBasisVersion, 100);
  const contactBasisCapturedAt = timestamp(source.contact_basis_timestamp ?? source.contactBasisTimestamp);
  const requestedTransactionFollowUp = contactBasis === 'requested_transaction_follow_up'
    && sourceKey === 'web_408_life'
    && Boolean(firstName && validEmail && contactBasisVersion && contactBasisCapturedAt);
  const inboundSmsRequest = contactBasis === 'inbound_sms_request'
    && sourceKey.startsWith('sms_')
    && Boolean(mobile.length === 10 && contactBasisVersion && contactBasisCapturedAt);
  const contactPermitted = consentGranted || requestedTransactionFollowUp || inboundSmsRequest;
  const marketingState = clean(source.automated_marketing_sms_consent_state ?? source.automatedMarketingSmsConsentState, 30).toLowerCase();
  const marketingRequested = bool(source.automated_marketing_sms_consent ?? source.automatedMarketingSmsConsent) || marketingState === 'granted';
  const marketingVersion = clean(source.automated_marketing_sms_consent_version ?? source.automatedMarketingSmsConsentVersion, 100);
  const marketingCapturedAt = timestamp(source.automated_marketing_sms_consent_timestamp ?? source.automatedMarketingSmsConsentTimestamp);
  const marketingGranted = consentGranted && marketingRequested && Boolean(marketingVersion && marketingCapturedAt);
  if (stage === 'started' && !contactPermitted) {
    if (!firstName && mobile.length !== 10) return { valid: false, error: 'minimum_identity_required' };
    return { valid: false, error: 'explicit_consent_required' };
  }
  const occurredAt = timestamp(source.submitted_at ?? source.occurred_at, nowDate(options).toISOString());
  return {
    valid: true,
    value: {
      checkpointId,
      stage,
      occurredAt,
      identity: contactPermitted ? {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(mobile.length === 10 ? { mobile } : {}),
        ...(validEmail ? { email } : {})
      } : {},
      consent: {
        agencyContact: {
          granted: consentGranted,
          state: consentGranted ? 'granted' : contactPermitted ? 'requested_transaction' : 'not_granted',
          version: consentGranted ? version : contactPermitted ? contactBasisVersion : '',
          capturedAt: consentGranted ? capturedAt : contactPermitted ? contactBasisCapturedAt : '',
          scope: consentGranted ? 'personal_agency_follow_up' : requestedTransactionFollowUp ? 'life_application_issue_resolution' : inboundSmsRequest ? 'inbound_sms_request_response' : '',
          basis: consentGranted ? 'explicit_agency_contact_consent' : requestedTransactionFollowUp ? 'requested_transaction_follow_up' : inboundSmsRequest ? 'inbound_sms_request' : '',
          callPermitted: consentGranted || (requestedTransactionFollowUp && mobile.length === 10),
          personalTextPermitted: consentGranted || inboundSmsRequest,
          automatedSmsAuthorized: false,
          automatedSmsSuppressed: true,
          emailPermitted: requestedTransactionFollowUp && validEmail
        },
        automatedMarketingSms: {
          requested: marketingRequested,
          granted: marketingGranted,
          state: marketingGranted ? 'granted' : marketingRequested ? 'invalid_evidence' : 'not_granted',
          version: marketingGranted ? marketingVersion : '',
          capturedAt: marketingGranted ? marketingCapturedAt : '',
          seller: marketingGranted ? 'Virginia Tam Insurance Agency, Inc.' : '',
          mobile: marketingGranted ? mobile : '',
          scope: marketingGranted ? 'recurring_automated_insurance_marketing_texts' : '',
          consentRequiredForPurchase: false,
          suppressionAuthoritative: true
        },
        snapshotSaved: false,
        contactRequested: stage === 'contact_requested'
      },
      context: {
        professionalProgram: clean(source.professional_program ?? source.professionalProgram, 40).toLowerCase(),
        professionalRole: clean(source.professional_role ?? source.professionalRole, 80).toLowerCase(),
        professionalRoleLabel: clean(source.professional_role_label ?? source.professionalRoleLabel, 120),
        housing: clean(source.housing_context ?? source.housing, 40).toLowerCase(),
        reviewTrack: clean(source.review_track ?? source.product_track ?? source.reviewTrack, 40).toLowerCase(),
        reviewReason: clean(source.review_reason ?? source.reviewReason, 60).toLowerCase(),
        reviewContext: clean(source.review_context ?? source.reviewContext, 120).toLowerCase(),
        propertyZip: clean(source.property_zip ?? source.propertyZip, 10).replace(/\D/g, '').slice(0, 5),
        propertyType: clean(source.property_type ?? source.propertyType, 40).toLowerCase(),
        currentCarrier: clean(source.current_carrier ?? source.currentCarrier, 60).toLowerCase(),
        renewalTiming: clean(source.renewal_timing ?? source.renewalTiming, 40).toLowerCase(),
        autoVehicleCount: clean(source.auto_vehicle_count ?? source.autoVehicleCount, 20).toLowerCase(),
        fivSignalVersion: clean(source.fiv_signal_version ?? source.fivSignalVersion, 80),
        closingDate: clean(source.closing_date ?? source.closingDate, 40),
        autoNeed: clean(source.auto_need ?? source.autoNeed ?? ((source.review_track ?? source.reviewTrack) === 'auto' ? source.review_reason ?? source.reviewReason : ''), 60).toLowerCase(),
        lifeGoal: clean(source.life_goal ?? source.lifeGoal ?? ((source.review_track ?? source.reviewTrack) === 'life' ? source.review_reason ?? source.reviewReason : ''), 60).toLowerCase(),
        businessType: clean(source.business_type ?? source.businessType, 120),
        businessNeed: clean(source.business_need ?? source.businessNeed ?? ((source.review_track ?? source.reviewTrack) === 'business' ? source.review_reason ?? source.reviewReason : ''), 60).toLowerCase(),
        sourceType: clean(source.source_type ?? source.sourceType, 40).toLowerCase()
      },
      attribution: {
        sourceKey,
        sourceLabel: sourceDefinition.label,
        pipeline: sourceDefinition.pipeline,
        source: clean(source.source, 80),
        campaign: clean(source.campaign, 160),
        campaignId: clean(source.campaign_id ?? source.campaignId, 180),
        campaignVariant: clean(source.campaign_variant ?? source.campaignVariant, 80),
        partnerId: clean(source.partner_id ?? source.partnerId, 120),
        batchId: clean(source.batch_id ?? source.batchId, 120),
        creative: clean(source.creative, 120),
        utm: {
          source: clean(source.utm_source, 120),
          medium: clean(source.utm_medium, 120),
          campaign: clean(source.utm_campaign, 160),
          content: clean(source.utm_content, 160),
          term: clean(source.utm_term, 160)
        },
        landingPage: safeLandingPage(source.landing_page ?? source.route_path)
      }
    }
  };
}

function mergeLead(existing, incoming, now, env) {
  const occurredAt = incoming.occurredAt || now.toISOString();
  const stages = Array.isArray(existing?.stages) ? [...existing.stages] : [];
  if (!stages.some(item => item.stage === incoming.stage)) stages.push({ stage: incoming.stage, occurredAt });
  stages.sort((left, right) => (STAGE_RANK[left.stage] || 99) - (STAGE_RANK[right.stage] || 99));
  const priorStage = boundedStage(existing?.stage, 'started');
  const stage = (STAGE_RANK[incoming.stage] || 0) >= (STAGE_RANK[priorStage] || 0) ? incoming.stage : priorStage;
  const originalConsent = existing?.consent?.agencyContact?.granted || existing?.consent?.agencyContact?.basis ? existing.consent.agencyContact : null;
  const incomingConsent = incoming.consent?.agencyContact?.granted || incoming?.consent?.agencyContact?.basis ? incoming.consent.agencyContact : null;
  const agencyContact = originalConsent?.granted
    ? originalConsent
    : incomingConsent?.granted
      ? incomingConsent
      : originalConsent || incomingConsent || {
    granted: false, state: 'not_granted', version: '', capturedAt: '', scope: '',
    callPermitted: false, personalTextPermitted: false, automatedSmsAuthorized: false,
    automatedSmsSuppressed: true, emailPermitted: false
      };
  const originalMarketing = existing?.consent?.automatedMarketingSms || null;
  const incomingMarketing = incoming?.consent?.automatedMarketingSms || null;
  const automatedMarketingSms = originalMarketing?.granted
    ? originalMarketing
    : incomingMarketing?.granted
      ? incomingMarketing
      : originalMarketing || incomingMarketing || {
        requested: false, granted: false, state: 'not_granted', version: '', capturedAt: '', seller: '', mobile: '', scope: '',
        consentRequiredForPurchase: false, suppressionAuthoritative: true
      };
  return {
    schemaVersion: LEAD_OPERATIONS_SCHEMA,
    build: LEAD_OPERATIONS_BUILD,
    recordType: 'coveragefit_lead_journey',
    checkpointId: incoming.checkpointId || existing.checkpointId,
    stage,
    stages,
    identity: agencyContact.granted || agencyContact.basis ? { ...(existing?.identity || {}), ...(incoming.identity || {}) } : {},
    consent: {
      ...(existing?.consent || {}),
      ...(incoming.consent || {}),
      agencyContact,
      automatedMarketingSms,
      contactRequested: stage === 'contact_requested' || existing?.consent?.contactRequested === true || incoming.consent?.contactRequested === true
    },
    context: { ...(existing?.context || {}), ...(incoming.context || {}) },
    attribution: { ...(existing?.attribution || {}), ...(incoming.attribution || {}), utm: { ...(existing?.attribution?.utm || {}), ...(incoming.attribution?.utm || {}) } },
    crm: existing?.crm || { provider: 'agencyzoom', state: 'pending', attempts: 0, syncedStages: [], lastAttemptAt: '', lastSuccessAt: '', providerRecordId: '', reason: '' },
    createdAt: existing?.createdAt || occurredAt,
    updatedAt: now.toISOString(),
    expiresAt: existing?.expiresAt || retentionExpiresAt(now, env),
    authorization: { bindAuthorized: false, identityMergeAuthorized: false }
  };
}

export async function patchLeadContext(store, checkpointId, patch = {}, options = {}) {
  if (!store?.get || !store?.setJSON) throw new TypeError('CoverageFit lead storage is unavailable.');
  const key = await leadRecordKey(checkpointId);
  if (!key) throw new TypeError('invalid_checkpoint_id');
  const existing = await store.get(key).catch(() => null);
  if (!existing) return null;
  const allowed = {
    unitWaterShutoff: new Set(['independent','building_controlled','unsure']),
    automaticWaterShutoffDevice: new Set(['installed','not_installed','unsure','not_applicable']),
    waterShutoffWillingness: new Set(['yes','maybe','no','not_asked'])
  };
  const next = {};
  for (const [field, values] of Object.entries(allowed)) {
    const value = clean(patch[field], 40).toLowerCase();
    if (values.has(value)) next[field] = value;
  }
  if (!Object.keys(next).length) return existing;
  next.waterShutoffEvidenceStatus = 'customer-reported';
  const updatedAt = nowDate(options).toISOString();
  const record = { ...existing, context: { ...(existing.context || {}), ...next }, updatedAt };
  await store.setJSON(key, record, { metadata: {
    recordType: record.recordType,
    checkpointId: record.checkpointId,
    stage: record.stage,
    createdAt: record.createdAt,
    updatedAt,
    expiresAt: record.expiresAt,
    automatedSmsAuthorized: record.consent?.automatedMarketingSms?.granted === true
  }});
  if (options.db) await projectSoloDeskEventBestEffort({ db: options.db, env: options.env || {} }, { kind:'lead', record });
  return record;
}

export async function upsertLeadJourney(store, source, options = {}) {
  if (!store?.get || !store?.setJSON) throw new TypeError('CoverageFit lead storage is unavailable.');
  const normalized = source?.checkpointId ? { valid: true, value: source } : normalizeLeadPayload(source, options);
  if (!normalized.valid) throw new TypeError(normalized.error);
  const now = nowDate(options);
  const key = await leadRecordKey(normalized.value.checkpointId);
  if (!key) throw new TypeError('invalid_checkpoint_id');
  const existing = await store.get(key).catch(() => null);
  const record = mergeLead(existing, normalized.value, now, options.env || {});
  await store.setJSON(key, record, { metadata: {
    recordType: record.recordType,
    checkpointId: record.checkpointId,
    stage: record.stage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    automatedSmsAuthorized: record.consent?.automatedMarketingSms?.granted === true
  }});
  if(options.db)await projectSoloDeskEventBestEffort({db:options.db,env:options.env||{}},{kind:'lead',record});
  return { key, record, created: !existing };
}

async function hmacHex(secret, message) {
  const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authenticateIntake(request, raw, options = {}) {
  const secret = clean(options.env?.COVERAGEFIT_LEAD_SYNC_SECRET, 500);
  if (secret.length < 32) return { ok: false, response: error(503, 'intake_not_configured', 'Secure lead intake is not configured.') };
  const sentAt = clean(request.headers.get('x-coveragefit-sent-at'), 30);
  const signature = clean(request.headers.get('x-coveragefit-signature'), 128).toLowerCase();
  const parsed = Number(sentAt);
  if (!Number.isFinite(parsed) || Math.abs(nowDate(options).getTime() - parsed) > MAX_CLOCK_SKEW_MS) return { ok: false, response: error(401, 'stale_request', 'The signed lead request is no longer valid.') };
  const expected = await hmacHex(secret, `${sentAt}.${raw}`);
  if (!timingSafeTextEqual(signature, expected)) return { ok: false, response: error(401, 'signature_rejected', 'The signed lead request was rejected.') };
  return { ok: true };
}

function allowedAgencyZoomUrl(value, env = {}) {
  try {
    const url = new URL(clean(value, 1200));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const agencyZoom = host === 'agencyzoom.com' || host.endsWith('.agencyzoom.com');
    const zapier = bool(env.AGENCYZOOM_ALLOW_ZAPIER_WEBHOOK) && host === 'hooks.zapier.com';
    return agencyZoom || zapier ? url : null;
  } catch (_) {
    return null;
  }
}

function agencyZoomRouteMap(env = {}) {
  const raw = env.AGENCYZOOM_SOURCE_ROUTES_JSON;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function agencyZoomConfig(env = {}, automatedMarketingSmsAuthorized = false, sourceKey = 'web_408_general') {
  const safeSourceKey = LEAD_SOURCE_KEYS.has(clean(sourceKey, 80).toLowerCase()) ? clean(sourceKey, 80).toLowerCase() : 'web_408_general';
  const route = agencyZoomRouteMap(env)[safeSourceKey];
  const routeObject = route && typeof route === 'object' && !Array.isArray(route) ? route : {};
  const routeEndpoint = automatedMarketingSmsAuthorized ? routeObject.marketing_url : routeObject.manual_url;
  const endpoint = allowedAgencyZoomUrl(
    routeEndpoint || (automatedMarketingSmsAuthorized ? env.AGENCYZOOM_MARKETING_SMS_WEB_LEAD_URL : env.AGENCYZOOM_WEB_LEAD_URL),
    env
  );
  const routeConfirmation = automatedMarketingSmsAuthorized ? routeObject.marketing_confirmed : routeObject.manual_confirmed;
  const routingConfirmed = routeEndpoint
    ? bool(routeConfirmation)
    : automatedMarketingSmsAuthorized
      ? bool(env.AGENCYZOOM_MARKETING_SMS_AUTOMATION_CONFIRMED)
      : bool(env.AGENCYZOOM_AUTOMATION_SUPPRESSION_CONFIRMED);
  const missing = [];
  if (!endpoint) missing.push(automatedMarketingSmsAuthorized ? 'marketing_sms_web_lead_url' : 'web_lead_url');
  if (!routingConfirmed) missing.push(automatedMarketingSmsAuthorized ? 'marketing_sms_automation_confirmation' : 'automation_suppression_confirmation');
  return {
    configured: missing.length === 0,
    endpoint,
    routingConfirmed,
    sourceKey: safeSourceKey,
    routeSpecific: Boolean(routeEndpoint),
    mode: automatedMarketingSmsAuthorized ? 'automated_marketing_sms' : 'personal_follow_up',
    missing
  };
}

export function projectAgencyZoomLead(record, stage = record?.stage || 'started') {
  const safeStage = boundedStage(stage, 'started');
  const marketing = record?.consent?.automatedMarketingSms || {};
  const marketingAuthorized = marketing.granted === true;
  return {
    schema_version: LEAD_OPERATIONS_SCHEMA,
    integration: 'CoverageFit',
    integration_build: LEAD_OPERATIONS_BUILD,
    event_type: safeStage === 'started' ? 'lead_started' : 'lead_stage_update',
    external_lead_id: clean(record?.checkpointId, 120),
    lead_checkpoint_id: clean(record?.checkpointId, 120),
    lead_stage: safeStage,
    first_name: clean(record?.identity?.firstName, 80),
    last_name: clean(record?.identity?.lastName, 100),
    mobile_phone: clean(record?.identity?.mobile, 20),
    email: clean(record?.identity?.email, 160),
    product_or_review_track: clean(record?.context?.reviewTrack, 40),
    housing_context: clean(record?.context?.housing, 40),
    property_type: clean(record?.context?.propertyType, 40),
    current_carrier: clean(record?.context?.currentCarrier, 60),
    renewal_timing: clean(record?.context?.renewalTiming, 40),
    auto_vehicle_count: clean(record?.context?.autoVehicleCount, 20),
    professional_program: clean(record?.context?.professionalProgram, 40),
    professional_role: clean(record?.context?.professionalRole, 80),
    campaign: clean(record?.attribution?.campaign, 160),
    campaign_id: clean(record?.attribution?.campaignId, 180),
    campaign_variant: clean(record?.attribution?.campaignVariant, 80),
    assigned_producer: 'Dylan Haysbert',
    tags: [
      'CoverageFit Started',
      marketingAuthorized ? 'Automated SMS Consent Verified' : 'Automation Suppressed',
      record?.consent?.agencyContact?.basis === 'requested_transaction_follow_up' ? 'Requested Transaction Follow-up' : 'Personal Follow-up Permitted',
      clean(record?.attribution?.sourceLabel, 120),
      record?.context?.reviewTrack === 'condo' ? 'Condo Opportunity' : ''
    ].filter(Boolean),
    agency_contact_permission: record?.consent?.agencyContact?.granted === true,
    personal_call_permitted: record?.consent?.agencyContact?.callPermitted === true,
    personal_text_permitted: record?.consent?.agencyContact?.personalTextPermitted === true,
    personal_email_permitted: record?.consent?.agencyContact?.emailPermitted === true,
    automated_sms_permission: marketingAuthorized,
    automation_suppressed: !marketingAuthorized,
    consent_version: clean(record?.consent?.agencyContact?.version, 100),
    consent_timestamp: clean(record?.consent?.agencyContact?.capturedAt, 40),
    consent_scope: clean(record?.consent?.agencyContact?.scope, 80),
    automated_marketing_sms_consent_version: marketingAuthorized ? clean(marketing.version, 100) : '',
    automated_marketing_sms_consent_timestamp: marketingAuthorized ? clean(marketing.capturedAt, 40) : '',
    automated_marketing_sms_consent_scope: marketingAuthorized ? clean(marketing.scope, 100) : '',
    automated_marketing_sms_seller: marketingAuthorized ? clean(marketing.seller, 120) : '',
    sms_suppression_remains_authoritative: true,
    contact_basis: clean(record?.consent?.agencyContact?.basis, 80),
    source_key: clean(record?.attribution?.sourceKey, 80),
    source: clean(record?.attribution?.sourceLabel, 120) || 'CoverageFit',
    target_pipeline: clean(record?.attribution?.pipeline, 40)
  };
}

async function saveCrmState(store, key, state, options = {}) {
  const current = await store.get(key).catch(() => null);
  if (!current) return null;
  const now = nowDate(options).toISOString();
  const crm = { ...(current.crm || {}), ...state };
  current.crm = crm;
  current.updatedAt = now;
  await store.setJSON(key, current, { metadata: {
    recordType: current.recordType,
    checkpointId: current.checkpointId,
    stage: current.stage,
    crmState: crm.state,
    createdAt: current.createdAt,
    updatedAt: now,
    expiresAt: current.expiresAt,
    automatedSmsAuthorized: current.consent?.automatedMarketingSms?.granted === true
  }});
  return current;
}

export async function syncAgencyZoomLead(store, checkpointId, stage, options = {}) {
  const key = await leadRecordKey(checkpointId);
  if (!key || !store?.get || !store?.setJSON) return { ok: false, state: 'unavailable' };
  const record = await store.get(key).catch(() => null);
  if (!record) return { ok: false, state: 'not_found' };
  const syncStage = boundedStage(stage, record.stage);
  if (!CRM_SYNC_STAGES.has(syncStage)) return { ok: true, state: 'not_required' };
  if ((record.crm?.syncedStages || []).includes(syncStage)) return { ok: true, state: 'already_synced' };
  const automatedMarketingSmsAuthorized = record.consent?.automatedMarketingSms?.granted === true;
  const config = agencyZoomConfig(options.env || {}, automatedMarketingSmsAuthorized, record?.attribution?.sourceKey);
  if (!config.configured) {
    await saveCrmState(store, key, { state: 'blocked', reason: `missing_${config.missing.join('_and_')}` }, options);
    return { ok: false, state: 'blocked', reason: config.missing.join(',') };
  }

  const lockKey = `${LEAD_SYNC_LOCK_PREFIX}${await sha256Hex(`${checkpointId}:${syncStage}`)}`;
  const now = nowDate(options);
  const existingLock = await store.get(lockKey).catch(() => null);
  if (existingLock && Date.parse(existingLock.expiresAt || '') > now.getTime()) return { ok: true, state: 'in_progress' };
  if (existingLock) await store.delete?.(lockKey).catch(() => {});
  try {
    await store.setJSON(lockKey, {
      recordType: 'coveragefit_lead_sync_lock', checkpointId, stage: syncStage,
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString()
    }, { onlyIfNew: true, metadata: { recordType: 'coveragefit_lead_sync_lock', createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString() } });
  } catch (_) {
    return { ok: true, state: 'in_progress' };
  }

  const attemptedAt = now.toISOString();
  const attempts = Number(record.crm?.attempts || 0) + 1;
  const payload = projectAgencyZoomLead(record, syncStage);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), Number(options.timeoutMs) || 6000) : null;
  try {
    const response = await (options.fetch || globalThis.fetch)(config.endpoint.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': `coveragefit-${record.checkpointId}-${syncStage}`.slice(0, 200),
        'X-CoverageFit-Contract': 'coveragefit-agencyzoom-lead-projection-v1'
      },
      body: JSON.stringify(payload),
      redirect: 'manual',
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response.ok) {
      await saveCrmState(store, key, { state: 'pending_retry', attempts, lastAttemptAt: attemptedAt, reason: `provider_${response.status}` }, options);
      return { ok: false, state: 'pending_retry', providerStatus: response.status };
    }
    let providerRecordId = '';
    try {
      const body = await response.json();
      providerRecordId = clean(body?.leadId ?? body?.lead_id ?? body?.id, 160);
    } catch (_) {}
    const syncedStages = Array.from(new Set([...(record.crm?.syncedStages || []), syncStage]));
    await saveCrmState(store, key, { state: 'synced', attempts, syncedStages, lastAttemptAt: attemptedAt, lastSuccessAt: nowDate(options).toISOString(), providerRecordId, reason: '' }, options);
    return { ok: true, state: 'synced', providerRecordId };
  } catch (cause) {
    await saveCrmState(store, key, { state: 'pending_retry', attempts, lastAttemptAt: attemptedAt, reason: cause?.name === 'AbortError' ? 'timeout' : 'network_error' }, options);
    return { ok: false, state: 'pending_retry' };
  } finally {
    if (timer) clearTimeout(timer);
    await store.delete?.(lockKey).catch(() => {});
  }
}

function scheduleSync(store, record, stage, options = {}) {
  if (!CRM_SYNC_STAGES.has(stage)) return;
  const task = syncAgencyZoomLead(store, record.checkpointId, stage, options).catch(() => null);
  if (typeof options.waitUntil === 'function') options.waitUntil(task);
}

export async function handleLeadIntake(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return error(413, 'payload_too_large', 'The lead payload is too large.');
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return error(415, 'unsupported_media_type', 'JSON is required.');
  let raw = '';
  try { raw = await request.text(); } catch (_) { return error(400, 'invalid_body', 'The lead payload could not be read.'); }
  if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) return error(413, 'payload_too_large', 'The lead payload is too large.');
  const auth = await authenticateIntake(request, raw, options);
  if (!auth.ok) return auth.response;
  let payload;
  try { payload = JSON.parse(raw || '{}'); } catch (_) { return error(400, 'invalid_json', 'Valid JSON is required.'); }
  const normalized = normalizeLeadPayload(payload, options);
  if (!normalized.valid) return error(422, normalized.error, 'The lead checkpoint did not satisfy the minimum durable-capture contract.');
  const result = await upsertLeadJourney(options.store, normalized.value, options);
  scheduleSync(options.store, result.record, result.record.stage, options);
  return json({
    ok: true,
    durable: true,
    delivery: 'coveragefit_d1',
    checkpointId: result.record.checkpointId,
    stage: result.record.stage,
    idempotent: !result.created,
    crm: { state: result.record.crm?.state || 'pending', customerBlocked: false },
    automatedSmsAuthorized: result.record.consent?.automatedMarketingSms?.granted === true
  }, result.created ? 201 : 200);
}

export async function recoverLeadFromWebMapping(mapping, options = {}) {
  const contact = mapping?.contact || {};
  const permission = contact.agencyContactConsent || {};
  const marketing = contact.automatedMarketingSmsConsent || {};
  if (contact.leadCaptureStatus !== 'confirmed' || permission.granted !== true || !contact.leadCheckpointId) return null;
  const normalized = normalizeLeadPayload({
    lead_checkpoint_id: contact.leadCheckpointId,
    lead_stage: 'started',
    first_name: contact.identity?.firstName,
    phone: contact.identity?.mobile,
    contact_consent: true,
    contact_consent_state: 'granted',
    contact_consent_version: permission.version,
    contact_consent_timestamp: permission.capturedAt,
    automated_marketing_sms_consent: marketing.granted === true,
    automated_marketing_sms_consent_state: marketing.granted === true ? 'granted' : 'not_granted',
    automated_marketing_sms_consent_version: marketing.version,
    automated_marketing_sms_consent_timestamp: marketing.capturedAt,
    submitted_at: permission.capturedAt,
    professional_program: mapping.context?.professional?.program,
    professional_role: mapping.context?.professional?.role,
    professional_role_label: mapping.context?.professional?.roleLabel,
    housing_context: mapping.context?.appointment?.housing || (mapping.entry?.productTrack === 'renter' ? 'renter' : mapping.entry?.productTrack === 'buyer' ? 'buyer' : ''),
    review_track: mapping.context?.appointment?.reviewTrack || mapping.entry?.productTrack,
    review_reason: mapping.context?.appointment?.reason,
    review_context: mapping.context?.appointment?.reviewContext,
    property_zip: mapping.context?.appointment?.propertyZip,
    property_type: mapping.context?.appointment?.propertyType || mapping.context?.condo?.propertyType,
    current_carrier: mapping.context?.appointment?.currentCarrier || mapping.context?.condo?.currentCarrier,
    renewal_timing: mapping.context?.appointment?.renewalTiming || mapping.context?.condo?.renewalTiming,
    auto_vehicle_count: mapping.context?.appointment?.autoVehicleCount || mapping.context?.condo?.autoVehicleCount,
    fiv_signal_version: mapping.context?.appointment?.fivSignalVersion || mapping.context?.condo?.fivSignalVersion,
    closing_date: mapping.context?.appointment?.closingDate,
    auto_need: mapping.context?.appointment?.autoNeed,
    life_goal: mapping.context?.appointment?.lifeGoal,
    business_type: mapping.context?.appointment?.businessType,
    business_need: mapping.context?.appointment?.businessNeed,
    source_type: mapping.context?.appointment?.sourceType,
    source: mapping.attribution?.source,
    campaign: mapping.attribution?.campaign,
    campaign_id: mapping.attribution?.campaignId,
    campaign_variant: mapping.attribution?.campaignVariant,
    creative: mapping.attribution?.creative,
    utm_source: mapping.attribution?.utm?.source,
    utm_medium: mapping.attribution?.utm?.medium,
    utm_campaign: mapping.attribution?.utm?.campaign,
    utm_content: mapping.attribution?.utm?.content,
    utm_term: mapping.attribution?.utm?.term,
    route_path: mapping.entry?.routePath
  }, options);
  if (!normalized.valid) return null;
  const result = await upsertLeadJourney(options.store, normalized.value, options);
  scheduleSync(options.store, result.record, 'started', options);
  return result.record;
}

export async function recordLeadMilestone(store, checkpointId, stage, options = {}) {
  const key = await leadRecordKey(checkpointId);
  if (!key || !store?.get || !store?.setJSON) return null;
  const existing = await store.get(key).catch(() => null);
  if (!existing) return null;
  const incoming = {
    checkpointId: existing.checkpointId,
    stage: boundedStage(stage, existing.stage),
    occurredAt: nowDate(options).toISOString(),
    identity: {}, consent: { contactRequested: stage === 'contact_requested' }, context: {}, attribution: {}
  };
  const result = await upsertLeadJourney(store, incoming, options);
  scheduleSync(store, result.record, incoming.stage, options);
  return result.record;
}

export async function handleLeadRetry(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  const configured = clean(options.env?.COVERAGEFIT_LEAD_RETRY_TOKEN, 500);
  const match = clean(request.headers.get('authorization'), 600).match(/^Bearer\s+(.+)$/i);
  if (configured.length < 32 || !match || !timingSafeTextEqual(configured, match[1])) return error(403, 'forbidden', 'Producer authorization is required.');
  if (!options.store?.list || !options.store?.get) return error(503, 'storage_unavailable', 'CoverageFit lead storage is unavailable.');
  const listed = await options.store.list({ prefix: LEAD_RECORD_PREFIX, limit: 100 });
  const records = (await Promise.all((listed.blobs || []).map(item => options.store.get(item.key).catch(() => null)))).filter(Boolean);
  const eligible = records.filter(record => CRM_SYNC_STAGES.has(record.stage) && !(record.crm?.syncedStages || []).includes(record.stage));
  const results = [];
  for (const record of eligible.slice(0, 50)) results.push(await syncAgencyZoomLead(options.store, record.checkpointId, record.stage, options));
  return json({ ok: true, scanned: records.length, attempted: results.length, synced: results.filter(item => item.ok && item.state === 'synced').length, pending: results.filter(item => !item.ok).length });
}

function smsLeadSourceKey(conversation = {}) {
  const intent = clean(conversation.intent, 40).toLowerCase();
  if (intent === 'buyer' && conversation?.attribution?.partnerId) return 'referral_realtor_buyer';
  const mapped = ({ home_review: 'sms_home', auto: 'sms_auto', buyer: 'sms_buyer', bundle: 'sms_bundle', life: 'sms_life', business: 'sms_business', tech: 'sms_tech' })[intent];
  return mapped || 'sms_general';
}

export function smsCheckpointId(conversation = {}) {
  const opaque = clean(conversation.id, 120).replace(/^sms-live-/i, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return opaque.length >= 16 ? `408d_${opaque}` : '';
}

export async function upsertSmsLeadJourney(store, conversation = {}, options = {}) {
  const checkpointId = smsCheckpointId(conversation);
  const mobile = digits(conversation.contactPhone);
  const sourceKey = smsLeadSourceKey(conversation);
  if (!checkpointId || mobile.length !== 10 || sourceKey === 'sms_general') return null;
  const occurredAt = timestamp(conversation.createdAt || conversation.lastInboundAt || conversation.updatedAt, nowDate(options).toISOString());
  const intent = clean(conversation.intent, 40).toLowerCase();
  const answers = conversation?.answers || {};
  const reviewTrack = intent === 'buyer' && answers.autoReview === true
    ? 'bundle'
    : intent === 'tech' && clean(answers.reviewTrack, 40)
      ? clean(answers.reviewTrack, 40).toLowerCase()
      : ({ home_review: 'home', buyer: 'home', bundle: 'bundle', auto: 'auto', life: 'life', business: 'business', tech: 'general' })[intent] || '';
  const reviewReason = clean(answers.reviewReason || answers.autoNeed || answers.lifeGoal || answers.businessNeed || (intent === 'buyer' ? 'new_home_or_vehicle' : intent === 'tech' ? 'comparison' : 'coverage_concern'), 60).toLowerCase();
  const professionalRole = clean(answers.professionalRole, 80);
  const professionalRoleLabel = professionalRole.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  const normalized = normalizeLeadPayload({
    lead_checkpoint_id: checkpointId,
    lead_stage: 'started',
    phone: mobile,
    contact_basis: 'inbound_sms_request',
    contact_basis_version: 'coveragefit-inbound-sms-request-v1',
    contact_basis_timestamp: occurredAt,
    source_key: sourceKey,
    source: 'ringcentral_sms',
    review_track: reviewTrack,
    housing_context: clean(answers.housing ?? answers.occupancy, 40),
    professional_program: clean(answers.professionalProgram, 40),
    professional_role: professionalRole,
    professional_role_label: professionalRoleLabel,
    review_reason: reviewReason,
    property_zip: clean(answers.propertyZip, 10),
    closing_date: clean(answers.closingDateDisplay || answers.closingDate, 40),
    auto_need: clean(answers.autoNeed, 60),
    life_goal: clean(answers.lifeGoal, 60),
    business_type: clean(answers.businessType, 120),
    business_need: clean(answers.businessNeed, 60),
    source_type: `sms_${intent}`,
    campaign: conversation?.attribution?.partnerId ? 'partner_referral' : `${reviewTrack || 'general'}_sms_intake`,
    campaign_id: conversation?.attribution?.partnerId ? clean(conversation.attribution.partnerId, 80) : `rc_sms_${reviewTrack || 'general'}`,
    submitted_at: occurredAt
  }, options);
  if (!normalized.valid) return null;
  const result = await upsertLeadJourney(store, normalized.value, options);
  // The SMS conversation itself is the recoverable early checkpoint. Project
  // to AgencyZoom after the bounded intake reaches Dylan/continuation-ready so
  // the first CRM record already carries the useful answers and source.
  if (['awaiting_producer', 'coveragefit_ready'].includes(clean(conversation.state, 40).toLowerCase())) {
    scheduleSync(store, result.record, 'started', options);
  }
  return result.record;
}
