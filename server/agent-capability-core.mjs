import { sha256Hex } from './runtime-crypto.mjs';
import { leadRecordKey, recordLeadMilestone } from './lead-operations-core.mjs';
import { bookCallbackWebAppointment, callbackConfig } from './sms-callback-scheduling-core.mjs';
import { verifyCoverageFitMeshServiceRequest } from './mesh-service-auth.mjs';

export const AGENT_CAPABILITY_BUILD = 'CF-AGENT-CAPABILITY-1.0';
export const AGENT_CAPABILITY_SCHEMA = '1.0';
export const AGENT_CAPABILITY_EXECUTION_MODES = Object.freeze(['PREPARE_ONLY', 'LIVE_BOUNDED']);
export const AGENT_CAPABILITIES = Object.freeze([
  Object.freeze({
    capabilityId:'insurance.coverage_review.request',
    description:'Request a CoverageFit insurance coverage review for an existing CoverageFit contact reference.',
    jurisdiction:'US-CA',
    authorityRequirement:'PERMISSION',
    executionClass:'CONSEQUENTIAL'
  }),
  Object.freeze({
    capabilityId:'insurance.callback.schedule',
    description:'Schedule a callback through CoverageFit for an existing contact with call permission.',
    jurisdiction:'US-CA',
    authorityRequirement:'PERMISSION',
    executionClass:'CONSEQUENTIAL'
  }),
  Object.freeze({
    capabilityId:'insurance.agent.connect',
    description:'Request a licensed human handoff through CoverageFit for an existing contact reference.',
    jurisdiction:'US-CA',
    authorityRequirement:'PERMISSION',
    executionClass:'CONSEQUENTIAL'
  })
]);

const CAPABILITY_IDS = new Set(AGENT_CAPABILITIES.map(item => item.capabilityId));
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CHECKPOINT_PATTERN = /^408d_[A-Za-z0-9_-]{16,80}$/;
const MAX_BODY_BYTES = 32 * 1024;
const AUTHORITY_MAX_AGE_MS = 2 * 60 * 1000;
const AUTHORITY_FUTURE_SKEW_MS = 30 * 1000;
const encoder = new TextEncoder();

const clean = (value, max = 500) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);
const responseHeaders = Object.freeze({
  'Cache-Control':'private, no-store, max-age=0',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff'
});
const json = (body, status = 200) => Response.json(body, { status, headers:responseHeaders });
const error = (status, code, message) => json({ ok:false, error:{ code, message } }, status);

function opaque(value, field, required = true) {
  const candidate = clean(value, 192);
  if (!candidate && !required) return '';
  if (!REF_PATTERN.test(candidate)) throw Object.assign(new Error(`${field}_invalid`), { status:422 });
  return candidate;
}

function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw Object.assign(new Error(`${label}_field_forbidden:${key}`), { status:422 });
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error(`${label}_object_required`), { status:422 });
  return value;
}

function timestamp(value, field) {
  const parsed = Date.parse(clean(value, 80));
  if (!Number.isFinite(parsed)) throw Object.assign(new Error(`${field}_invalid`), { status:422 });
  return new Date(parsed).toISOString();
}

function executionMode(env = {}) {
  const mode = clean(env.COVERAGEFIT_AGENT_EXECUTION_MODE, 40).toUpperCase() || 'PREPARE_ONLY';
  const liveEnabled = ['1','true','yes','on','enabled'].includes(clean(env.COVERAGEFIT_AGENT_LIVE_BOUNDED_ENABLED, 20).toLowerCase());
  if (mode === 'LIVE_BOUNDED' && liveEnabled) return 'LIVE_BOUNDED';
  return 'PREPARE_ONLY';
}

function normalizeAuthority(value, now = new Date()) {
  const authority = object(value, 'authority');
  onlyKeys(authority, new Set(['decision','evaluationRef','evaluatedAt','permissionRef','mandateRef']), 'authority');
  if (authority.decision !== 'ALLOW') throw Object.assign(new Error('mesh_authority_allow_required'), { status:403 });
  const evaluatedAt = timestamp(authority.evaluatedAt, 'authority_evaluated_at');
  const age = now.getTime() - Date.parse(evaluatedAt);
  if (age > AUTHORITY_MAX_AGE_MS || age < -AUTHORITY_FUTURE_SKEW_MS) throw Object.assign(new Error('mesh_authority_stale'), { status:409 });
  return {
    decision:'ALLOW',
    evaluationRef:opaque(authority.evaluationRef, 'authority_evaluation_ref'),
    evaluatedAt,
    permissionRef:opaque(authority.permissionRef, 'authority_permission_ref', false),
    mandateRef:opaque(authority.mandateRef, 'authority_mandate_ref', false)
  };
}

function normalizeDistribution(value = {}) {
  const distribution = object(value || {}, 'distribution');
  onlyKeys(distribution, new Set(['platform','adapterRef','experienceRef','sourceSurface']), 'distribution');
  return {
    platform:clean(distribution.platform, 40).toUpperCase(),
    adapterRef:opaque(distribution.adapterRef, 'distribution_adapter_ref', false),
    experienceRef:opaque(distribution.experienceRef, 'distribution_experience_ref', false),
    sourceSurface:clean(distribution.sourceSurface, 80)
  };
}

function normalizeInput(capabilityId, value) {
  const input = object(value, 'input');
  if (capabilityId === 'insurance.coverage_review.request') {
    onlyKeys(input, new Set(['contactRef','lineOfBusiness','state','reason']), 'input');
    const lineOfBusiness = clean(input.lineOfBusiness, 20).toUpperCase();
    if (!['HOME','AUTO','BUNDLE'].includes(lineOfBusiness)) throw Object.assign(new Error('line_of_business_invalid'), { status:422 });
    if (clean(input.state, 10).toUpperCase() !== 'CA') throw Object.assign(new Error('california_only'), { status:422 });
    return {
      contactRef:checkpointRef(input.contactRef),
      lineOfBusiness,
      state:'CA',
      reason:clean(input.reason, 300)
    };
  }
  if (capabilityId === 'insurance.callback.schedule') {
    onlyKeys(input, new Set(['contactRef','requestedStart','timezone','topic']), 'input');
    const rawStart = clean(input.requestedStart, 80);
    if (!/T/.test(rawStart) || !/(Z|[+-]\d{2}:\d{2})$/i.test(rawStart)) throw Object.assign(new Error('requested_start_timezone_required'), { status:422 });
    const timezone = clean(input.timezone, 96);
    if (!timezone) throw Object.assign(new Error('timezone_required'), { status:422 });
    try { new Intl.DateTimeFormat('en-US', { timeZone:timezone }).format(new Date()); }
    catch (_) { throw Object.assign(new Error('timezone_invalid'), { status:422 }); }
    return {
      contactRef:checkpointRef(input.contactRef),
      requestedStart:timestamp(rawStart, 'requested_start'),
      timezone,
      topic:clean(input.topic, 160)
    };
  }
  if (capabilityId === 'insurance.agent.connect') {
    onlyKeys(input, new Set(['contactRef','topic','urgency']), 'input');
    const topic = clean(input.topic, 20).toUpperCase();
    const urgency = clean(input.urgency, 20).toUpperCase() || 'NORMAL';
    if (!['HOME','AUTO','BUNDLE','GENERAL'].includes(topic)) throw Object.assign(new Error('agent_topic_invalid'), { status:422 });
    if (!['NORMAL','RUSH'].includes(urgency)) throw Object.assign(new Error('urgency_invalid'), { status:422 });
    return { contactRef:checkpointRef(input.contactRef), topic, urgency };
  }
  throw Object.assign(new Error('capability_unsupported'), { status:404 });
}

function checkpointRef(value) {
  const ref = clean(value, 120);
  if (!CHECKPOINT_PATTERN.test(ref)) throw Object.assign(new Error('coveragefit_contact_ref_invalid'), { status:422 });
  return ref;
}

function normalizeInvocation(payload, now = new Date()) {
  const root = object(payload, 'request');
  onlyKeys(root, new Set(['schemaVersion','invocationId','capabilityId','issuedAt','applicationRef','providerRef','jurisdiction','authority','distribution','input']), 'request');
  const requestedSchema = clean(root.schemaVersion, 20) || AGENT_CAPABILITY_SCHEMA;
  if (requestedSchema !== AGENT_CAPABILITY_SCHEMA) throw Object.assign(new Error('schema_version_unsupported'), { status:422 });
  const capabilityId = clean(root.capabilityId, 120);
  if (!CAPABILITY_IDS.has(capabilityId)) throw Object.assign(new Error('capability_not_exposed'), { status:404 });
  if (clean(root.applicationRef, 120) !== 'application:coveragefit') throw Object.assign(new Error('application_ref_invalid'), { status:422 });
  if (clean(root.providerRef, 120) !== 'provider:coveragefit') throw Object.assign(new Error('provider_ref_invalid'), { status:422 });
  if (clean(root.jurisdiction, 20).toUpperCase() !== 'US-CA') throw Object.assign(new Error('california_only'), { status:422 });
  const issuedAt = timestamp(root.issuedAt, 'issued_at');
  const issuedAge = now.getTime() - Date.parse(issuedAt);
  if (issuedAge > 5 * 60 * 1000 || issuedAge < -AUTHORITY_FUTURE_SKEW_MS) throw Object.assign(new Error('invocation_stale'), { status:409 });
  return {
    schemaVersion:requestedSchema,
    invocationId:opaque(root.invocationId, 'invocation_id'),
    capabilityId,
    issuedAt,
    applicationRef:'application:coveragefit',
    providerRef:'provider:coveragefit',
    jurisdiction:'US-CA',
    authority:normalizeAuthority(root.authority, now),
    distribution:normalizeDistribution(root.distribution || {}),
    input:normalizeInput(capabilityId, root.input)
  };
}

function contactPermission(record, capabilityId) {
  const agency = record?.consent?.agencyContact || {};
  const hasRelationshipPermission = agency.granted === true || Boolean(agency.basis);
  if (!hasRelationshipPermission) return { ok:false, code:'coveragefit_contact_permission_required' };
  if (capabilityId === 'insurance.callback.schedule' && !(agency.callPermitted === true && clean(record?.identity?.mobile, 20))) {
    return { ok:false, code:'coveragefit_call_permission_required' };
  }
  if (capabilityId === 'insurance.agent.connect' && ![agency.callPermitted, agency.personalTextPermitted, agency.emailPermitted].some(Boolean)) {
    return { ok:false, code:'coveragefit_contact_channel_required' };
  }
  return { ok:true };
}

async function resolveContact(store, contactRef) {
  if (!store?.get) throw Object.assign(new Error('coveragefit_storage_unavailable'), { status:503 });
  const key = await leadRecordKey(contactRef);
  if (!key) throw Object.assign(new Error('coveragefit_contact_ref_invalid'), { status:422 });
  const record = await store.get(key).catch(() => null);
  if (!record) throw Object.assign(new Error('coveragefit_contact_not_found'), { status:404 });
  return record;
}

function localDateTime(iso, timeZone) {
  const date = new Date(iso);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date:`${parts.year}-${parts.month}-${parts.day}`, time:`${parts.hour}:${parts.minute}` };
}

async function deterministicUuidV4(value) {
  const hex = await sha256Hex(value);
  const chars = hex.slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ['8','9','a','b'][parseInt(chars[16], 16) % 4];
  const joined = chars.join('');
  return `${joined.slice(0,8)}-${joined.slice(8,12)}-${joined.slice(12,16)}-${joined.slice(16,20)}-${joined.slice(20,32)}`;
}

async function invocationDigest(invocation) {
  return sha256Hex(JSON.stringify(invocation));
}

async function existingInvocation(db, invocationId) {
  if (!db?.prepare) return null;
  return db.prepare('SELECT * FROM cf_agent_capability_invocations WHERE invocation_id=?1').bind(invocationId).first();
}

async function claimInvocation(db, invocation, serviceId, digest) {
  if (!db?.prepare) throw Object.assign(new Error('coveragefit_database_unavailable'), { status:503 });
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO cf_agent_capability_invocations(
        invocation_id,service_id,capability_id,contact_ref,request_digest,request_json,authority_ref,source_platform,adapter_ref,experience_ref,source_surface,status,result_ref,result_json,created_at,updated_at
      ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'PROCESSING','','{}',?12,?12)`
    ).bind(
      invocation.invocationId,
      serviceId,
      invocation.capabilityId,
      invocation.input.contactRef,
      digest,
      JSON.stringify(invocation),
      invocation.authority.evaluationRef,
      invocation.distribution.platform,
      invocation.distribution.adapterRef,
      invocation.distribution.experienceRef,
      invocation.distribution.sourceSurface,
      now
    ).run();
    return { claimed:true, row:null };
  } catch (_) {
    return { claimed:false, row:await existingInvocation(db, invocation.invocationId) };
  }
}

async function finishInvocation(db, invocationId, status, result) {
  if (!db?.prepare) throw Object.assign(new Error('coveragefit_database_unavailable'), { status:503 });
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE cf_agent_capability_invocations SET status=?2,result_ref=?3,result_json=?4,updated_at=?5 WHERE invocation_id=?1`
  ).bind(invocationId, status, clean(result?.resourceRef, 192), JSON.stringify(result || {}), now).run();
}

function previousResult(row) {
  try { return row?.result_json ? JSON.parse(row.result_json) : {}; } catch (_) { return {}; }
}

function preparedResult(invocation, contact) {
  return {
    status:'PREPARED',
    resourceRef:`cf-agent-invocation:${invocation.invocationId}`,
    contactRef:invocation.input.contactRef,
    capabilityId:invocation.capabilityId,
    executionStatus:'NOT_EXECUTED',
    nextRequiredBoundary:'COVERAGEFIT_AGENT_EXECUTION_ENABLEMENT',
    coverageFitConsentState:contact?.consent?.agencyContact?.state || 'unknown',
    humanHandoffRequired:true
  };
}

async function executeBounded(invocation, contact, options = {}) {
  const permission = contactPermission(contact, invocation.capabilityId);
  if (!permission.ok) throw Object.assign(new Error(permission.code), { status:403 });

  if (invocation.capabilityId === 'insurance.callback.schedule') {
    if (!options.smsStore) throw Object.assign(new Error('callback_storage_unavailable'), { status:503 });
    const config = callbackConfig(options.env || {});
    const slot = localDateTime(invocation.input.requestedStart, config.timeZone);
    const requestId = await deterministicUuidV4(`coveragefit-agent-callback|${invocation.invocationId}`);
    const booked = await bookCallbackWebAppointment({
      requestId,
      correlationId:invocation.input.contactRef,
      firstName:contact?.identity?.firstName || '',
      phone:contact?.identity?.mobile || '',
      productType:'general',
      source:`agent_${(invocation.distribution.platform || 'mesh').toLowerCase()}`,
      date:slot.date,
      time:slot.time,
      callRequestVersion:AGENT_CAPABILITY_BUILD,
      callRequestTimestamp:invocation.authority.evaluatedAt,
      callRequestEvidenceSource:'mesh_authority_evaluation'
    }, {
      store:options.smsStore,
      db:options.db,
      env:options.env || {},
      waitUntil:options.waitUntil,
      now:options.now
    });
    if (!booked.available) return {
      status:'ALTERNATIVES_REQUIRED',
      resourceRef:`cf-agent-invocation:${invocation.invocationId}`,
      capabilityId:invocation.capabilityId,
      contactRef:invocation.input.contactRef,
      alternatives:booked.alternatives || [],
      executionStatus:'BOUNDED_EXECUTION_ATTEMPTED'
    };
    return {
      status:'SCHEDULED',
      resourceRef:booked.booking?.requestId || requestId,
      capabilityId:invocation.capabilityId,
      contactRef:invocation.input.contactRef,
      scheduledStart:booked.booking?.scheduledStart || '',
      scheduledEnd:booked.booking?.scheduledEnd || '',
      scheduledDisplay:booked.booking?.scheduledDisplay || '',
      calendarUrl:booked.calendarUrl || '',
      idempotent:booked.idempotent === true,
      humanHandoffRequired:true,
      executionStatus:'BOUNDED_EXECUTION_COMPLETED'
    };
  }

  const updated = await recordLeadMilestone(options.store, invocation.input.contactRef, 'contact_requested', {
    db:options.db,
    env:options.env || {},
    waitUntil:options.waitUntil,
    now:options.now
  });
  if (!updated) throw Object.assign(new Error('coveragefit_contact_not_found'), { status:404 });

  return {
    status:invocation.capabilityId === 'insurance.agent.connect' ? 'HUMAN_HANDOFF_REQUESTED' : 'REVIEW_REQUEST_RECORDED',
    resourceRef:`lead:${updated.checkpointId}`,
    capabilityId:invocation.capabilityId,
    contactRef:updated.checkpointId,
    leadStage:updated.stage,
    humanHandoffRequired:true,
    executionStatus:'BOUNDED_EXECUTION_COMPLETED'
  };
}

export function agentCapabilityManifest(env = {}) {
  return {
    schemaVersion:AGENT_CAPABILITY_SCHEMA,
    build:AGENT_CAPABILITY_BUILD,
    applicationRef:'application:coveragefit',
    providerRef:'provider:coveragefit',
    jurisdiction:'US-CA',
    executionMode:executionMode(env),
    authorityPolicy:'MESH_ALLOW_REQUIRED_AND_COVERAGEFIT_CONSENT_REMAINS_AUTHORITATIVE',
    serviceAuth:{ version:'mesh-service-auth-v1', audience:clean(env.COVERAGEFIT_MESH_SERVICE_AUDIENCE, 192) || 'provider:coveragefit' },
    capabilities:AGENT_CAPABILITIES,
    contactRefPolicy:'EXISTING_COVERAGEFIT_CHECKPOINT_REQUIRED',
    canonicalSystemOfRecord:'COVERAGEFIT'
  };
}

export async function handleAgentCapabilities(request, options = {}) {
  if (request.method !== 'GET') return error(405, 'method_not_allowed', 'GET is required.');
  return json({ ok:true, ...agentCapabilityManifest(options.env || {}) });
}

export async function handleAgentCapabilityInvoke(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!options.db?.prepare) return error(503, 'database_unavailable', 'CoverageFit agent capability storage is unavailable.');
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return error(413, 'payload_too_large', 'The capability request is too large.');
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return error(415, 'unsupported_media_type', 'JSON is required.');
  let raw = '';
  try { raw = await request.text(); } catch (_) { return error(400, 'invalid_body', 'The capability request could not be read.'); }
  if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) return error(413, 'payload_too_large', 'The capability request is too large.');

  const auth = await verifyCoverageFitMeshServiceRequest(request, raw, { db:options.db, env:options.env || {}, now:options.now });
  if (!auth.ok) return auth.response;

  let parsed;
  try { parsed = JSON.parse(raw || '{}'); } catch (_) { return error(400, 'invalid_json', 'Valid JSON is required.'); }

  try {
    const now = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : new Date();
    const invocation = normalizeInvocation(parsed, now);
    const digest = await invocationDigest(invocation);
    const contact = await resolveContact(options.store, invocation.input.contactRef);
    const permission = contactPermission(contact, invocation.capabilityId);
    if (!permission.ok) return error(403, permission.code, 'CoverageFit contact permissions do not allow this capability.');

    const claim = await claimInvocation(options.db, invocation, auth.serviceId, digest);
    if (!claim.claimed) {
      const prior = claim.row;
      if (!prior || prior.request_digest !== digest || prior.service_id !== auth.serviceId) return error(409, 'invocation_id_reused', 'This invocation identifier was already used for different request data.');
      if (prior.status === 'PROCESSING') return error(409, 'invocation_in_progress', 'This invocation is already being processed.');
      return json({ ok:true, idempotent:true, build:AGENT_CAPABILITY_BUILD, executionMode:executionMode(options.env || {}), result:previousResult(prior) });
    }

    const mode = executionMode(options.env || {});
    let result;
    try {
      if (mode === 'LIVE_BOUNDED') result = await executeBounded(invocation, contact, options);
      else result = preparedResult(invocation, contact);
      await finishInvocation(options.db, invocation.invocationId, result.status, result);
    } catch (executionError) {
      const failed = {
        status:'FAILED',
        resourceRef:`cf-agent-invocation:${invocation.invocationId}`,
        capabilityId:invocation.capabilityId,
        contactRef:invocation.input.contactRef,
        errorCode:clean(executionError?.message, 160) || 'bounded_execution_failed',
        executionStatus:mode === 'LIVE_BOUNDED' ? 'BOUNDED_EXECUTION_FAILED' : 'NOT_EXECUTED'
      };
      await finishInvocation(options.db, invocation.invocationId, 'FAILED', failed).catch(() => {});
      throw executionError;
    }

    return json({
      ok:true,
      idempotent:false,
      build:AGENT_CAPABILITY_BUILD,
      executionMode:mode,
      authorityEvaluationRef:invocation.authority.evaluationRef,
      distribution:invocation.distribution,
      result
    }, mode === 'LIVE_BOUNDED' ? 200 : 202);
  } catch (cause) {
    const status = Number(cause?.status) || (/not_found|not_exposed/.test(String(cause?.message)) ? 404 : /stale|reused/.test(String(cause?.message)) ? 409 : 422);
    return error(status, clean(cause?.message, 160) || 'agent_capability_invalid', 'The agent capability request could not be accepted.');
  }
}
