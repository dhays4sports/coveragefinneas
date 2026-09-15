import {
  listRingCentralMessageHistory,
  normalizeE164,
  ringCentralConfig
} from './ringcentral-client.mjs';
import { writeOpsAudit } from './sms-operations-core.mjs';

export const RINGCENTRAL_RECOVERY_BUILD = 'RC-RECOVERY-1.0';
export const RINGCENTRAL_RECOVERY_CURSOR_KEY = 'sms-ringcentral-recovery/cursor';
export const RINGCENTRAL_RECOVERY_LOCK_KEY = 'sms-ringcentral-recovery/lock';

const DEFAULT_LOOKBACK_HOURS = 72;
const DEFAULT_OVERLAP_MINUTES = 15;
const DEFAULT_MAX_MESSAGES = 100;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function number(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function instant(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nowDate(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function recoveryConfig(env = {}) {
  return {
    lookbackHours: number(env.RINGCENTRAL_RECOVERY_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS, 1, 168),
    overlapMinutes: number(env.RINGCENTRAL_RECOVERY_OVERLAP_MINUTES, DEFAULT_OVERLAP_MINUTES, 1, 120),
    maxMessages: number(env.RINGCENTRAL_RECOVERY_MAX_MESSAGES, DEFAULT_MAX_MESSAGES, 1, 500)
  };
}

function safeCursor(value = {}) {
  return {
    schemaVersion: '1.0',
    build: RINGCENTRAL_RECOVERY_BUILD,
    lastConfirmedEventAt: text(value.lastConfirmedEventAt).slice(0, 60),
    lastConfirmedMessageId: text(value.lastConfirmedMessageId).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120),
    lastRecoveryStartedAt: text(value.lastRecoveryStartedAt).slice(0, 60),
    lastRecoveryCompletedAt: text(value.lastRecoveryCompletedAt).slice(0, 60),
    lastRecoveryCompletedThrough: text(value.lastRecoveryCompletedThrough).slice(0, 60),
    lastRecoveryStatus: text(value.lastRecoveryStatus).slice(0, 40),
    lastRecoveryCounts: value.lastRecoveryCounts && typeof value.lastRecoveryCounts === 'object'
      ? {
          found: Math.max(0, Number(value.lastRecoveryCounts.found) || 0),
          replayed: Math.max(0, Number(value.lastRecoveryCounts.replayed) || 0),
          deduped: Math.max(0, Number(value.lastRecoveryCounts.deduped) || 0),
          ignored: Math.max(0, Number(value.lastRecoveryCounts.ignored) || 0),
          failed: Math.max(0, Number(value.lastRecoveryCounts.failed) || 0)
        }
      : null
  };
}

export async function noteConfirmedRingCentralWebhookEvent(store, event = {}, options = {}) {
  if (!store?.get || !store?.setJSON || options.recoveryReplay === true) return null;
  const occurredAt = text(event.occurredAt) || nowDate(options).toISOString();
  const existing = safeCursor(await store.get(RINGCENTRAL_RECOVERY_CURSOR_KEY) || {});
  if (instant(existing.lastConfirmedEventAt) > instant(occurredAt)) return existing;
  const cursor = {
    ...existing,
    lastConfirmedEventAt: occurredAt,
    lastConfirmedMessageId: text(event.messageId).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120)
  };
  await store.setJSON(RINGCENTRAL_RECOVERY_CURSOR_KEY, cursor, {
    metadata: { status: cursor.lastRecoveryStatus || 'tracking', build: RINGCENTRAL_RECOVERY_BUILD, createdAt: occurredAt, updatedAt: nowDate(options).toISOString() }
  });
  return cursor;
}

export async function ringCentralRecoveryStatus(store) {
  if (!store?.get) return null;
  return safeCursor(await store.get(RINGCENTRAL_RECOVERY_CURSOR_KEY) || {});
}

function inboundSmsRecord(record, configuredNumber) {
  if (!record || typeof record !== 'object') return false;
  const destinations = Array.isArray(record.to) ? record.to : [];
  const target = destinations.find(item => item?.target === true) || destinations[0];
  return text(record.type).toUpperCase() === 'SMS'
    && text(record.direction).toLowerCase() === 'inbound'
    && normalizeE164(target?.phoneNumber) === normalizeE164(configuredNumber)
    && Boolean(normalizeE164(record.from?.phoneNumber))
    && Boolean(text(record.id));
}

function replayPayload(record) {
  return {
    uuid: `coveragefit-recovery-${text(record.id).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120)}`,
    timestamp: text(record.creationTime),
    body: record
  };
}

async function acquireRecoveryLock(store, startedAt) {
  const expiresAt = new Date(Date.parse(startedAt) + 10 * 60000).toISOString();
  try {
    await store.setJSON(RINGCENTRAL_RECOVERY_LOCK_KEY, { build: RINGCENTRAL_RECOVERY_BUILD, startedAt, expiresAt }, {
      onlyIfNew: true,
      metadata: { status: 'running', build: RINGCENTRAL_RECOVERY_BUILD, createdAt: startedAt, updatedAt: startedAt, expiresAt }
    });
    return true;
  } catch (_) {
    const existing = await store.get(RINGCENTRAL_RECOVERY_LOCK_KEY).catch(() => null);
    if (instant(existing?.expiresAt) > Date.parse(startedAt)) return false;
    await store.setJSON(RINGCENTRAL_RECOVERY_LOCK_KEY, { build: RINGCENTRAL_RECOVERY_BUILD, startedAt, expiresAt }, {
      metadata: { status: 'running', build: RINGCENTRAL_RECOVERY_BUILD, createdAt: startedAt, updatedAt: startedAt, expiresAt }
    });
    return true;
  }
}

export async function recoverMissedRingCentralSms(options = {}) {
  const store = options.store;
  const env = options.env || {};
  const processEvent = options.processEvent;
  if (!store?.get || !store?.setJSON || !store?.delete) throw new TypeError('RingCentral recovery storage is unavailable.');
  if (typeof processEvent !== 'function') throw new TypeError('A normal webhook event processor is required for RingCentral recovery.');
  const started = nowDate(options);
  const startedAt = started.toISOString();
  if (!(await acquireRecoveryLock(store, startedAt))) return { ok: true, skipped: true, reason: 'recovery_already_running' };

  const config = recoveryConfig(env);
  const ringCentral = ringCentralConfig(env);
  const prior = safeCursor(await store.get(RINGCENTRAL_RECOVERY_CURSOR_KEY) || {});
  const floor = started.getTime() - config.lookbackHours * 3600000;
  const checkpoint = instant(prior.lastRecoveryCompletedThrough) || instant(prior.lastConfirmedEventAt) || floor;
  const fromMs = Math.max(floor, checkpoint - config.overlapMinutes * 60000);
  const dateFrom = new Date(fromMs).toISOString();
  const dateTo = startedAt;
  const running = { ...prior, lastRecoveryStartedAt: startedAt, lastRecoveryStatus: 'running' };
  await store.setJSON(RINGCENTRAL_RECOVERY_CURSOR_KEY, running, {
    metadata: { status: 'running', build: RINGCENTRAL_RECOVERY_BUILD, createdAt: prior.lastConfirmedEventAt || startedAt, updatedAt: startedAt }
  });

  const counts = { found: 0, replayed: 0, deduped: 0, ignored: 0, failed: 0 };
  let earliestFailureAt = 0;
  let page = 1;
  const records = [];
  const listHistory = typeof options.listHistory === 'function' ? options.listHistory : listRingCentralMessageHistory;
  try {
    while (records.length < config.maxMessages) {
      const batch = await listHistory({ dateFrom, dateTo, page, perPage: Math.min(100, config.maxMessages - records.length) }, env, options);
      for (const record of batch.records) {
        if (inboundSmsRecord(record, ringCentral.fromNumber)) records.push(record);
        if (records.length >= config.maxMessages) break;
      }
      if (!batch.hasMore || records.length >= config.maxMessages) break;
      page += 1;
    }
    records.sort((left, right) => instant(left.creationTime) - instant(right.creationTime));
    counts.found = records.length;

    for (const record of records) {
      const messageId = text(record.id).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120);
      if (!messageId) { counts.ignored += 1; continue; }
      if (await store.get(`sms-live-events/${messageId}`)) { counts.deduped += 1; continue; }
      try {
        const result = await processEvent(replayPayload(record));
        if (!result?.ok) throw new Error(text(result?.error?.code, 'replay_failed'));
        if (result.deduped) counts.deduped += 1;
        else if (result.ignored) counts.ignored += 1;
        else counts.replayed += 1;
      } catch (_) {
        counts.failed += 1;
        const failedAt = instant(record.creationTime) || fromMs;
        earliestFailureAt = earliestFailureAt ? Math.min(earliestFailureAt, failedAt) : failedAt;
      }
    }

    const completedAt = nowDate(options).toISOString();
    const completedThrough = new Date(earliestFailureAt ? Math.max(fromMs, earliestFailureAt - 1) : Date.parse(dateTo)).toISOString();
    const latest = safeCursor(await store.get(RINGCENTRAL_RECOVERY_CURSOR_KEY) || running);
    const cursor = {
      ...latest,
      lastRecoveryCompletedAt: completedAt,
      lastRecoveryCompletedThrough: completedThrough,
      lastRecoveryStatus: counts.failed ? 'partial' : 'completed',
      lastRecoveryCounts: counts
    };
    await store.setJSON(RINGCENTRAL_RECOVERY_CURSOR_KEY, cursor, {
      metadata: { status: cursor.lastRecoveryStatus, build: RINGCENTRAL_RECOVERY_BUILD, createdAt: prior.lastConfirmedEventAt || startedAt, updatedAt: completedAt }
    });
    await writeOpsAudit(store, 'ringcentral_recovery_completed', {
      detail: `RingCentral history recovery ${cursor.lastRecoveryStatus}: ${counts.replayed} replayed, ${counts.deduped} already processed, ${counts.failed} failed.`
    }, options).catch(() => null);
    return { ok: counts.failed === 0, status: cursor.lastRecoveryStatus, dateFrom, dateTo, counts, completedThrough };
  } catch (cause) {
    const failedAt = nowDate(options).toISOString();
    const latest = safeCursor(await store.get(RINGCENTRAL_RECOVERY_CURSOR_KEY) || running);
    await store.setJSON(RINGCENTRAL_RECOVERY_CURSOR_KEY, {
      ...latest,
      lastRecoveryCompletedAt: failedAt,
      lastRecoveryStatus: 'failed',
      lastRecoveryCounts: counts
    }, { metadata: { status: 'failed', build: RINGCENTRAL_RECOVERY_BUILD, createdAt: prior.lastConfirmedEventAt || startedAt, updatedAt: failedAt } });
    await writeOpsAudit(store, 'ringcentral_recovery_failed', { detail: text(cause?.message, 'RingCentral history recovery failed.').slice(0, 240) }, options).catch(() => null);
    throw cause;
  } finally {
    await store.delete(RINGCENTRAL_RECOVERY_LOCK_KEY).catch(() => null);
  }
}
