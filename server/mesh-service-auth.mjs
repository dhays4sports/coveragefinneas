import { sha256Hex, timingSafeTextEqual } from './runtime-crypto.mjs';

export const MESH_SERVICE_AUTH_VERSION = 'mesh-service-auth-v1';
export const COVERAGEFIT_MESH_AUTH_BUILD = 'CF-MESH-SERVICE-AUTH-1.0';

const encoder = new TextEncoder();
const MAX_TTL_MS = 120_000;
const DEFAULT_CLOCK_SKEW_MS = 30_000;
const HEADER_NAME = 'x-mesh-service-auth';
const OPAQUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

function jsonError(status, code, message, details = []) {
  return Response.json({ ok:false, error:{ code, message, ...(details.length ? { details } : {}) } }, {
    status,
    headers:{
      'Cache-Control':'private, no-store, max-age=0',
      'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      'Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff'
    }
  });
}

function base64UrlDecode(value) {
  const text = clean(value, 8192);
  if (!text) throw new Error('SERVICE_AUTH_HEADER_REQUIRED');
  if (text.startsWith('{')) return text;
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (_) {
    throw new Error('SERVICE_AUTH_HEADER_INVALID');
  }
}

function parseAssertion(request) {
  const header = request.headers.get(HEADER_NAME);
  let parsed;
  try { parsed = JSON.parse(base64UrlDecode(header)); }
  catch (error) { throw new Error(error instanceof Error ? error.message : 'SERVICE_AUTH_HEADER_INVALID'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('SERVICE_AUTH_HEADER_INVALID');
  return parsed;
}

function normalizePath(value) {
  const path = clean(value, 1000);
  if (!path.startsWith('/') || path.includes('#')) throw new Error('SERVICE_AUTH_PATH_INVALID');
  return path;
}

function normalizeMethod(value) {
  const method = clean(value, 20).toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw new Error('SERVICE_AUTH_METHOD_INVALID');
  return method;
}

async function hmacSha256Hex(secret, value) {
  const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function canonical(assertion) {
  return [
    assertion.version,
    assertion.serviceId,
    assertion.audience,
    assertion.method,
    assertion.path,
    assertion.bodyDigest,
    assertion.issuedAt,
    assertion.expiresAt,
    assertion.nonce
  ].join('\n');
}

function allowedServices(env = {}) {
  return clean(env.COVERAGEFIT_MESH_ALLOWED_SERVICE_IDS, 2000)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

async function consumeNonce(db, assertion, nowIso) {
  if (!db?.prepare) throw new Error('SERVICE_AUTH_REPLAY_STORE_REQUIRED');
  try {
    await db.prepare(
      `INSERT INTO cf_mesh_service_auth_nonces(nonce,service_id,expires_at,created_at) VALUES(?1,?2,?3,?4)`
    ).bind(assertion.nonce, assertion.serviceId, assertion.expiresAt, nowIso).run();
  } catch (_) {
    throw new Error('SERVICE_AUTH_NONCE_REPLAYED');
  }
  if (Math.random() < 0.02) {
    db.prepare('DELETE FROM cf_mesh_service_auth_nonces WHERE expires_at < ?1').bind(nowIso).run().catch(() => {});
  }
}

export async function verifyCoverageFitMeshServiceRequest(request, rawBody, options = {}) {
  const env = options.env || {};
  const db = options.db;
  const secret = clean(env.COVERAGEFIT_MESH_SERVICE_AUTH_SECRET, 1000);
  if (secret.length < 32) return { ok:false, response:jsonError(503, 'mesh_auth_not_configured', 'Mesh service authentication is not configured.') };
  const allowed = allowedServices(env);
  if (!allowed.length) return { ok:false, response:jsonError(503, 'mesh_service_allowlist_not_configured', 'Mesh service allowlist is not configured.') };

  let assertion;
  try { assertion = parseAssertion(request); }
  catch (error) { return { ok:false, response:jsonError(401, clean(error?.message, 120) || 'service_auth_invalid', 'The Mesh service assertion was rejected.') } ; }

  const reasons = [];
  if (assertion.version !== MESH_SERVICE_AUTH_VERSION) reasons.push('SERVICE_AUTH_VERSION_UNSUPPORTED');
  if (!OPAQUE_PATTERN.test(clean(assertion.serviceId, 192))) reasons.push('SERVICE_AUTH_SERVICE_ID_INVALID');
  if (!OPAQUE_PATTERN.test(clean(assertion.audience, 192))) reasons.push('SERVICE_AUTH_AUDIENCE_INVALID');
  if (!OPAQUE_PATTERN.test(clean(assertion.nonce, 192))) reasons.push('SERVICE_AUTH_NONCE_INVALID');
  if (!allowed.includes(assertion.serviceId)) reasons.push('SERVICE_AUTH_SERVICE_NOT_ALLOWED');

  const expectedAudience = clean(env.COVERAGEFIT_MESH_SERVICE_AUDIENCE, 192) || 'provider:coveragefit';
  if (assertion.audience !== expectedAudience) reasons.push('SERVICE_AUTH_AUDIENCE_MISMATCH');
  const expectedMethod = normalizeMethod(request.method);
  const expectedPath = normalizePath(new URL(request.url).pathname);
  if (assertion.method !== expectedMethod) reasons.push('SERVICE_AUTH_METHOD_MISMATCH');
  if (assertion.path !== expectedPath) reasons.push('SERVICE_AUTH_PATH_MISMATCH');

  const expectedBodyDigest = `sha256:${await sha256Hex(rawBody)}`;
  if (!timingSafeTextEqual(assertion.bodyDigest, expectedBodyDigest)) reasons.push('SERVICE_AUTH_BODY_DIGEST_MISMATCH');

  const issued = Date.parse(assertion.issuedAt);
  const expires = Date.parse(assertion.expiresAt);
  const now = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();
  const skewMs = Math.max(0, Math.min(120_000, Number(env.COVERAGEFIT_MESH_SERVICE_AUTH_CLOCK_SKEW_MS) || DEFAULT_CLOCK_SKEW_MS));
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || !Number.isFinite(nowMs)) reasons.push('SERVICE_AUTH_TIME_INVALID');
  else {
    if (issued > nowMs + skewMs) reasons.push('SERVICE_AUTH_NOT_YET_VALID');
    if (expires <= nowMs - skewMs) reasons.push('SERVICE_AUTH_EXPIRED');
    if (expires <= issued || expires - issued > MAX_TTL_MS) reasons.push('SERVICE_AUTH_WINDOW_INVALID');
  }

  const unsigned = {
    version:assertion.version,
    serviceId:assertion.serviceId,
    audience:assertion.audience,
    method:assertion.method,
    path:assertion.path,
    bodyDigest:assertion.bodyDigest,
    issuedAt:assertion.issuedAt,
    expiresAt:assertion.expiresAt,
    nonce:assertion.nonce
  };
  const expectedSignature = await hmacSha256Hex(secret, canonical(unsigned));
  if (!timingSafeTextEqual(clean(assertion.signature, 256).toLowerCase(), expectedSignature)) reasons.push('SERVICE_AUTH_SIGNATURE_INVALID');

  if (reasons.length) return { ok:false, response:jsonError(401, 'mesh_service_auth_rejected', 'The Mesh service assertion was rejected.', reasons) };
  try { await consumeNonce(db, assertion, now.toISOString()); }
  catch (error) { return { ok:false, response:jsonError(409, clean(error?.message, 120) || 'mesh_service_replay_rejected', 'The Mesh service request was already used.') } ; }

  return { ok:true, serviceId:assertion.serviceId, assertion };
}
