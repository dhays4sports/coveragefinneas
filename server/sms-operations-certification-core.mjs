import { missingRingCentralConfiguration, normalizeE164, ringCentralConfig } from './ringcentral-client.mjs';
import { normalizeSmsConsent } from './sms-consent-core.mjs';
import { normalizeSmsOrchestration } from './sms-orchestrator-core.mjs';

export const SMS_SHARED_NUMBER_CERTIFICATION_BUILD = 'RC-SMS-1.9.8';
export const SMS_SHARED_NUMBER_CERTIFICATION_SCHEMA = '1.0';
export const SMS_SHARED_NUMBER_CERTIFICATION_SCOPE = 'pre_port_application';
export const SMS_SHARED_NUMBER_CARRIER_STATUS = 'pending_rc_sms_1_10';

const LIVE_PREFIX = 'sms-live-conversations/';
const RETRY_PREFIX = 'sms-ops/retry/';
const HEALTH_KEY = 'sms-ops/health/ringcentral-webhook';
const REQUIRED_PRODUCER_BINDINGS = Object.freeze(['COVERAGEFIT_PRODUCER_ACCESS_TOKEN']);

const text = (value, fallback = '') => {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
};

const nowDate = options => {
  const value = typeof options?.now === 'function' ? options.now() : options?.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

function countBy(list, keyFn) {
  const result = {};
  for (const item of list) {
    const key = text(keyFn(item), 'unknown');
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function safeHealth(value = {}) {
  if (!value || typeof value !== 'object') return { observed: false, lastEventAt: '', lastSuccessAt: '', lastFailureAt: '', successCount: 0, failureCount: 0, lastFailureCode: '' };
  return {
    observed: Boolean(text(value.lastEventAt || value.lastSuccessAt || value.lastFailureAt)),
    lastEventAt: text(value.lastEventAt),
    lastSuccessAt: text(value.lastSuccessAt),
    lastFailureAt: text(value.lastFailureAt),
    successCount: Math.max(0, Number(value.successCount) || 0),
    failureCount: Math.max(0, Number(value.failureCount) || 0),
    lastFailureCode: text(value.lastFailureCode).slice(0, 80)
  };
}

function publicConfiguration(env = {}) {
  const rc = ringCentralConfig(env);
  const missing = [...missingRingCentralConfiguration(env)];
  for (const name of REQUIRED_PRODUCER_BINDINGS) {
    if (!text(env?.[name])) missing.push(name);
  }
  const uniqueMissing = [...new Set(missing)].sort();
  return {
    complete: uniqueMissing.length === 0,
    missing: uniqueMissing,
    senderConfigured: Boolean(normalizeE164(rc.fromNumber)),
    webhookConfigured: Boolean(rc.webhookUrl),
    authenticationConfigured: Boolean(rc.clientId && rc.clientSecret && rc.jwt),
    webhookValidationConfigured: Boolean(rc.webhookValidationToken),
    conversationHashConfigured: Boolean(rc.conversationHashSecret),
    producerAccessConfigured: Boolean(text(env?.COVERAGEFIT_PRODUCER_ACCESS_TOKEN))
  };
}

async function storageEvidence(store, occurredAt) {
  if (!store?.list || !store?.get) {
    return {
      available: false,
      relationships: { total: 0, active: 0, optedOut: 0, providerSuppressed: 0, ownerCounts: {}, replyContextActive: 0 },
      retries: { total: 0, pending: 0, sent: 0, failed: 0, suppressed: 0 },
      webhook: safeHealth()
    };
  }
  const [liveList, retryList, health] = await Promise.all([
    store.list({ prefix: LIVE_PREFIX, limit: 500 }),
    store.list({ prefix: RETRY_PREFIX, limit: 500 }),
    store.get(HEALTH_KEY)
  ]);
  const live = (await Promise.all((liveList?.blobs || []).map(item => store.get(item.key)))).filter(value => value && typeof value === 'object');
  const retries = (await Promise.all((retryList?.blobs || []).map(item => store.get(item.key)))).filter(value => value && typeof value === 'object');
  const normalized = live.map(conversation => {
    const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
    const consent = normalizeSmsConsent(conversation, { occurredAt });
    return { orchestration, consent };
  });
  return {
    available: true,
    relationships: {
      total: normalized.length,
      active: normalized.filter(item => item.consent.status === 'active').length,
      optedOut: normalized.filter(item => item.consent.status === 'opted_out').length,
      providerSuppressed: normalized.filter(item => ['blocked', 'opted_out'].includes(item.consent.providerStatus)).length,
      ownerCounts: countBy(normalized, item => item.orchestration.ownership?.owner || 'none'),
      replyContextActive: normalized.filter(item => Boolean(item.orchestration.replyContext)).length
    },
    retries: {
      total: retries.length,
      pending: retries.filter(item => item.status === 'pending').length,
      sent: retries.filter(item => item.status === 'sent').length,
      failed: retries.filter(item => item.status === 'failed').length,
      suppressed: retries.filter(item => item.status === 'suppressed').length
    },
    webhook: safeHealth(health)
  };
}

/**
 * Non-destructive operational readiness snapshot. This certifies only the
 * application/shared-number contract. It intentionally cannot certify the final
 * 408-FARMERS carrier identity before RC-SMS-1.10.
 */
export async function buildSharedNumberCertificationSnapshot(options = {}) {
  const occurredAt = nowDate(options).toISOString();
  const config = publicConfiguration(options.env || {});
  const operationsBuild = text(options.operationsBuild);
  const operationsBuildSynchronized = operationsBuild === SMS_SHARED_NUMBER_CERTIFICATION_BUILD;
  const storage = await storageEvidence(options.store, occurredAt);
  const blockers = [];
  if (!operationsBuildSynchronized) blockers.push('operations_build_mismatch');
  if (!config.complete) blockers.push('runtime_configuration_incomplete');
  if (!storage.available) blockers.push('operations_storage_unavailable');
  const warnings = [];
  if (!storage.webhook.observed) warnings.push('webhook_runtime_evidence_not_observed');
  if (storage.retries.pending > 0) warnings.push('pending_retry_jobs_present');
  if (storage.retries.failed > 0) warnings.push('failed_retry_jobs_present');

  const ready = blockers.length === 0;
  return Object.freeze({
    schemaVersion: SMS_SHARED_NUMBER_CERTIFICATION_SCHEMA,
    build: SMS_SHARED_NUMBER_CERTIFICATION_BUILD,
    scope: SMS_SHARED_NUMBER_CERTIFICATION_SCOPE,
    generatedAt: occurredAt,
    status: ready ? 'ready_for_rc_sms_1_10' : 'blocked_pre_port',
    applicationCertification: operationsBuildSynchronized ? 'certified' : 'not_certified',
    carrierCertification: SMS_SHARED_NUMBER_CARRIER_STATUS,
    readyForPortCertification: ready,
    blockers,
    warnings,
    runtime: {
      operationsBuild,
      operationsBuildSynchronized,
      configuration: config
    },
    evidence: storage,
    privacy: {
      containsPhoneNumbers: false,
      containsMessageBodies: false,
      containsSecrets: false,
      exposesOnlyConfigurationBooleansAndMissingBindingNames: true
    },
    boundary: 'Final 408-FARMERS sender assignment, carrier behavior, and live STOP/START delivery remain RC-SMS-1.10.'
  });
}
