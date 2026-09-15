import { normalizeSmsOrchestration } from './sms-orchestrator-core.mjs';

export const SMS_CONSENT_BUILD = 'RC-SMS-1.9.8';
export const SMS_CONSENT_SCHEMA = '1.0';
export const SMS_CONSENT_STATUSES = Object.freeze(['active', 'opted_out']);
export const SMS_PROVIDER_CONSENT_STATUSES = Object.freeze(['unknown', 'active', 'opted_out', 'blocked']);
export const SMS_CONSENT_SOURCES = Object.freeze(['legacy', 'customer_command', 'provider', 'producer', 'system']);
export const SMS_SEND_CLASSES = Object.freeze(['automated', 'human_initiated']);

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function safeEnum(value, allowed, fallback) {
  const candidate = text(value).toLowerCase();
  return allowed.includes(candidate) ? candidate : fallback;
}

function nowIso(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/**
 * Channel-level consent is projected from legacy fields so old rows remain valid
 * without a D1 migration. Once written, smsConsent is authoritative for all
 * programmatic send decisions on the sender/recipient relationship.
 */
export function normalizeSmsConsent(conversation = {}, options = {}) {
  const existing = conversation.smsConsent && typeof conversation.smsConsent === 'object'
    ? conversation.smsConsent
    : conversation.consent && typeof conversation.consent === 'object'
      ? conversation.consent
      : {};
  const occurredAt = text(options.occurredAt || conversation.updatedAt || conversation.createdAt, nowIso(options));
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
  const legacyOptedOut = text(conversation.state).toLowerCase() === 'opted_out'
    || orchestration.channel.status === 'opted_out'
    || orchestration.automationMode === 'suppressed'
    || Boolean(text(conversation.optedOutAt));
  const status = safeEnum(existing.status, SMS_CONSENT_STATUSES, legacyOptedOut ? 'opted_out' : 'active');
  const optedOutAt = status === 'opted_out'
    ? text(existing.optedOutAt || conversation.optedOutAt, occurredAt)
    : text(existing.optedOutAt || conversation.optedOutAt);
  const optedInAt = text(existing.optedInAt || conversation.resumedAt);
  const source = safeEnum(existing.source, SMS_CONSENT_SOURCES, existing.status ? 'system' : 'legacy');
  const lastCommand = text(existing.lastCommand || conversation.lastCommand).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  let providerStatus = safeEnum(existing.providerStatus, SMS_PROVIDER_CONSENT_STATUSES, 'unknown');
  // A persisted provider suppression is authoritative. Do not infer provider active
  // merely because our own application status says active.
  if (providerStatus === 'unknown' && status === 'opted_out' && source === 'provider') providerStatus = 'opted_out';
  return {
    schemaVersion: SMS_CONSENT_SCHEMA,
    build: SMS_CONSENT_BUILD,
    status,
    optedOutAt,
    optedInAt,
    source,
    lastCommand,
    providerStatus,
    providerUpdatedAt: text(existing.providerUpdatedAt),
    updatedAt: text(existing.updatedAt, occurredAt)
  };
}

export function smsSendClass(origin) {
  return text(origin).toLowerCase() === 'producer_console' ? 'human_initiated' : 'automated';
}

export function smsPermissionSnapshot(conversation = {}, options = {}) {
  const consent = normalizeSmsConsent(conversation, options);
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt: options.occurredAt });
  const providerSuppressed = ['opted_out', 'blocked'].includes(consent.providerStatus);
  const applicationSuppressed = consent.status === 'opted_out'
    || orchestration.channel.status === 'opted_out'
    || orchestration.automationMode === 'suppressed';
  return {
    allowed: !applicationSuppressed && !providerSuppressed,
    status: consent.status,
    providerStatus: consent.providerStatus,
    applicationSuppressed,
    providerSuppressed,
    consent
  };
}

export function applySmsConsentCommand(conversation = {}, command, options = {}) {
  const occurredAt = text(options.occurredAt, nowIso(options));
  const normalized = text(command).toLowerCase();
  if (!['stop', 'start'].includes(normalized)) return { ...conversation, smsConsent: normalizeSmsConsent(conversation, { occurredAt }) };
  const currentConsent = normalizeSmsConsent(conversation, { occurredAt });
  const orchestration = normalizeSmsOrchestration(conversation, { occurredAt });
  if (normalized === 'stop') {
    const consent = {
      ...currentConsent,
      status: 'opted_out',
      optedOutAt: occurredAt,
      source: 'customer_command',
      lastCommand: 'stop',
      providerStatus: safeEnum(options.providerStatus, SMS_PROVIDER_CONSENT_STATUSES, currentConsent.providerStatus),
      providerUpdatedAt: options.providerStatus ? occurredAt : currentConsent.providerUpdatedAt,
      updatedAt: occurredAt
    };
    return {
      ...conversation,
      state: 'opted_out',
      optedOutAt: occurredAt,
      lastCommand: 'stop',
      smsConsent: consent,
      orchestration: {
        ...orchestration,
        channel: { status: 'opted_out', updatedAt: occurredAt },
        ownership: {
          owner: 'none',
          previousOwner: orchestration.ownership.owner,
          reason: 'global_stop_command',
          acquiredAt: occurredAt,
          updatedAt: occurredAt
        },
        automationMode: 'suppressed',
        workflow: {
          ...orchestration.workflow,
          status: orchestration.workflow.status === 'completed' ? 'completed' : 'paused',
          previousState: orchestration.workflow.state,
          updatedAt: occurredAt
        },
        replyContext: null,
        lastRoute: 'suppressed',
        lastRouteReason: 'global_stop_command',
        updatedAt: occurredAt
      },
      updatedAt: occurredAt
    };
  }

  // START re-opens only the channel. It intentionally does not resume/restart an
  // old workflow. A preserved workflow becomes producer-owned/human-only until an
  // explicit producer action or explicit RESTART starts automation again.
  const hasWorkflow = orchestration.workflow?.type && orchestration.workflow.type !== 'none'
    && orchestration.workflow.status !== 'completed';
  const nextOwner = hasWorkflow ? 'producer' : 'none';
  const consent = {
    ...currentConsent,
    status: 'active',
    optedInAt: occurredAt,
    source: 'customer_command',
    lastCommand: 'start',
    providerStatus: safeEnum(options.providerStatus, SMS_PROVIDER_CONSENT_STATUSES, ['opted_out', 'blocked'].includes(currentConsent.providerStatus) ? 'unknown' : currentConsent.providerStatus),
    providerUpdatedAt: options.providerStatus ? occurredAt : currentConsent.providerUpdatedAt,
    updatedAt: occurredAt
  };
  return {
    ...conversation,
    state: hasWorkflow ? 'human_takeover' : 'new',
    optedOutAt: '',
    resumedAt: occurredAt,
    lastCommand: 'start',
    smsConsent: consent,
    orchestration: {
      ...orchestration,
      channel: { status: 'active', updatedAt: occurredAt },
      ownership: {
        owner: nextOwner,
        previousOwner: orchestration.ownership.owner,
        reason: 'channel_permission_restored',
        acquiredAt: occurredAt,
        updatedAt: occurredAt
      },
      automationMode: hasWorkflow ? 'human_only' : 'assist_only',
      workflow: {
        ...orchestration.workflow,
        status: orchestration.workflow.status === 'completed' ? 'completed' : hasWorkflow ? 'paused' : orchestration.workflow.status,
        updatedAt: occurredAt
      },
      replyContext: null,
      lastRoute: hasWorkflow ? 'producer' : 'none',
      lastRouteReason: 'channel_permission_restored',
      updatedAt: occurredAt
    },
    updatedAt: occurredAt
  };
}

export function reconcileSmsProviderConsent(conversation = {}, providerStatus, options = {}) {
  const occurredAt = text(options.occurredAt, nowIso(options));
  const status = safeEnum(providerStatus, SMS_PROVIDER_CONSENT_STATUSES, '');
  if (!status) return { ...conversation, smsConsent: normalizeSmsConsent(conversation, { occurredAt }) };
  const consent = normalizeSmsConsent(conversation, { occurredAt });
  const providerSuppressed = ['opted_out', 'blocked'].includes(status);
  const nextConsent = {
    ...consent,
    status: providerSuppressed ? 'opted_out' : consent.status,
    optedOutAt: providerSuppressed ? (consent.optedOutAt || occurredAt) : consent.optedOutAt,
    source: 'provider',
    providerStatus: status,
    providerUpdatedAt: occurredAt,
    updatedAt: occurredAt
  };
  if (!providerSuppressed) return { ...conversation, smsConsent: nextConsent, updatedAt: occurredAt };
  return applySmsConsentCommand({ ...conversation, smsConsent: nextConsent }, 'stop', { occurredAt, providerStatus: status });
}
