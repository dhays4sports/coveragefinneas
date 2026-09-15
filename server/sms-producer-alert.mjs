import {
  initialNotificationState,
  notificationConfig,
  RESEND_EMAIL_ENDPOINT
} from './producer-notification.mjs';

export const SMS_PRODUCER_ALERT_BUILD = 'RC-SMS-1.9.8';
export const SMS_PRODUCER_ALERT_SCHEMA_VERSION = '1.0';
export const SMS_PRODUCER_ALERT_TYPES = Object.freeze([
  'intake_complete',
  'personal_response_requested',
  'direct_handling_required',
  'automation_escalated',
  'test'
]);

const text = (value, fallback = '') => {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
};

const MAX_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 5000;

const retryableStatus = status => status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

async function fetchWithTimeout(fetcher, url, init, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetcher(url, { ...init, ...(controller ? { signal: controller.signal } : {}) }); }
  finally { if (timer !== null) clearTimeout(timer); }
}

async function responseId(response) {
  try { return text((await response.json())?.id).slice(0, 160); }
  catch (_) { return ''; }
}

function timestamp(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

const truthy = (value, fallback = true) => {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
};

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const safeOrigin = value => {
  try {
    const url = new URL(text(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : '';
  } catch (_) {
    return '';
  }
};

const intentLabel = value => ({
  buyer: 'Homebuyer',
  home_review: 'Current-home review',
  bundle: 'Home + auto review',
  other: 'Direct handling request'
})[text(value)] || 'Unclassified request';

const alertLabel = value => ({
  intake_complete: 'Intake complete — CoverageFit link sent',
  personal_response_requested: 'Personal response requested',
  direct_handling_required: 'Direct handling required',
  automation_escalated: 'Automation could not classify request',
  test: 'Pre-port notification test'
})[text(value)] || 'Producer attention requested';

export function smsProducerAlertConfig(env = {}, requestUrl = '') {
  const enabled = truthy(env.RCSMS_PRODUCER_ALERTS_ENABLED, true);
  const base = notificationConfig({
    ...env,
    COVERAGEFIT_NEW_REVIEW_NOTIFICATIONS_ENABLED: enabled ? 'true' : 'false'
  }, requestUrl);
  return Object.freeze({ ...base, enabled, operationsUrl: base.origin ? `${base.origin}/agent/sms-operations/` : '' });
}

export function actionableSmsAlertType({ beforeState = '', conversation = {}, routed = {} } = {}) {
  if (text(beforeState) === 'awaiting_producer' || conversation.state !== 'awaiting_producer') return '';
  if (conversation.handoff?.url) return 'intake_complete';
  if (text(routed.command) === 'human') return 'personal_response_requested';
  if (conversation.intent === 'other' && conversation.answers?.requestCategory) return 'direct_handling_required';
  if (Number(conversation.invalidIntentAttempts) >= 2) return 'automation_escalated';
  return '';
}

export function initialSmsProducerAlert({ type, eventId, createdAt, state = 'pending', details = {} } = {}) {
  const notification = initialNotificationState(state, details);
  return Object.freeze({
    schemaVersion: SMS_PRODUCER_ALERT_SCHEMA_VERSION,
    build: SMS_PRODUCER_ALERT_BUILD,
    type: SMS_PRODUCER_ALERT_TYPES.includes(type) ? type : 'personal_response_requested',
    eventId: text(eventId).slice(0, 220),
    state: notification.state,
    createdAt: text(createdAt),
    attemptedAt: notification.attemptedAt,
    sentAt: notification.sentAt,
    providerMessageId: notification.providerMessageId,
    reason: notification.reason,
    providerStatus: notification.providerStatus
  });
}

export function normalizeSmsProducerAlert(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = SMS_PRODUCER_ALERT_TYPES.includes(text(value.type)) ? text(value.type) : '';
  const eventId = text(value.eventId).slice(0, 220);
  if (!type || !eventId) return null;
  return initialSmsProducerAlert({ type, eventId, createdAt: value.createdAt, state: value.state, details: value });
}

export function prepareSmsProducerAlert(conversation = {}, context = {}) {
  const type = actionableSmsAlertType({ beforeState: context.beforeState, conversation, routed: context.routed });
  if (!type) return null;
  const sourceMessageId = text(context.sourceMessageId, 'message');
  const eventId = `${text(conversation.id, 'conversation')}:${type}:${sourceMessageId}`.slice(0, 220);
  const existing = normalizeSmsProducerAlert(conversation.producerAlert);
  if (existing?.eventId === eventId) return null;
  return initialSmsProducerAlert({ type, eventId, createdAt: text(context.occurredAt, new Date().toISOString()) });
}

export function buildSmsProducerAlertEmail(conversation = {}, alert = {}, config = {}) {
  const rush = conversation.answers?.priority === 'rush';
  const type = SMS_PRODUCER_ALERT_TYPES.includes(text(alert.type)) ? text(alert.type) : 'personal_response_requested';
  const subject = `${rush ? '[RUSH] ' : ''}${type === 'test' ? '[TEST] ' : ''}New 408-FARMERS SMS lead waiting`;
  const status = alertLabel(type);
  const intent = type === 'test' ? 'Test notification' : intentLabel(conversation.intent);
  const attribution = conversation.attribution?.partnerId ? 'Realtor referral' : 'Direct / not captured';
  const origin = safeOrigin(config.origin);
  const dashboardUrl = origin
    ? `${origin}/agent/sms-operations/${type === 'test' ? '' : `?conversation_id=${encodeURIComponent(text(conversation.id))}`}`
    : text(config.operationsUrl);
  const plain = [
    type === 'test' ? 'This is a privacy-safe pre-port test of the 408-FARMERS SMS producer alert.' : 'A 408-FARMERS SMS conversation is waiting for Dylan.',
    '',
    `Status: ${status}`,
    `Intent: ${intent}`,
    `Priority: ${rush ? 'RUSH / time-sensitive' : 'Standard'}`,
    `Attribution: ${attribution}`,
    '',
    `Open SMS Operations: ${dashboardUrl}`,
    '',
    'For privacy, this alert excludes the prospect’s name, phone number, property address, closing date, transcript, partner identity, and insurance details.'
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f8;font-family:Arial,sans-serif;color:#173047"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #dbe5e8;border-radius:16px;padding:28px"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#527080">408-FARMERS SMS producer alert</p><h1 style="margin:0 0 14px;font-size:26px;line-height:1.2">${escapeHtml(rush ? 'Time-sensitive SMS lead waiting' : type === 'test' ? 'Test alert delivered' : 'SMS lead waiting')}</h1><p style="margin:0 0 18px;line-height:1.6">${escapeHtml(status)}</p><table style="width:100%;margin:0 0 22px;border-collapse:collapse"><tr><td style="padding:8px 0;color:#647985">Intent</td><td style="padding:8px 0;font-weight:700">${escapeHtml(intent)}</td></tr><tr><td style="padding:8px 0;color:#647985">Priority</td><td style="padding:8px 0;font-weight:700">${escapeHtml(rush ? 'RUSH / time-sensitive' : 'Standard')}</td></tr><tr><td style="padding:8px 0;color:#647985">Attribution</td><td style="padding:8px 0;font-weight:700">${escapeHtml(attribution)}</td></tr></table><p style="margin:0 0 24px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#0e5c4a;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px">Open SMS Operations</a></p><p style="margin:0;color:#647985;font-size:12px;line-height:1.55">For privacy, this alert excludes prospect identity, contact information, property details, transcript, partner identity, and insurance details.</p></div></div></body></html>`;
  return Object.freeze({ subject, text: plain, html, dashboardUrl });
}

export async function sendSmsProducerAlert(conversation = {}, alert = {}, options = {}) {
  const config = smsProducerAlertConfig(options.env || {}, options.requestUrl || '');
  const email = buildSmsProducerAlertEmail(conversation, alert, config);
  const attemptedAt = timestamp(options);
  let notification;
  if (!config.enabled) notification = initialNotificationState('skipped', { attemptedAt, reason: 'disabled' });
  else if (!config.configured) notification = initialNotificationState('skipped', { attemptedAt, reason: 'not_configured' });
  else {
    const fetcher = options.fetch || globalThis.fetch;
    if (typeof fetcher !== 'function') notification = initialNotificationState('failed', { attemptedAt, reason: 'fetch_unavailable' });
    else {
      const payload = { from: config.from, to: [config.to], subject: email.subject, text: email.text, html: email.html, ...(config.replyTo ? { reply_to: config.replyTo } : {}) };
      const headers = { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': `coveragefit-sms-producer-alert-${text(alert.eventId, 'unknown-sms-alert')}`.slice(0, 256) };
      let lastStatus = null;
      let lastReason = 'provider_unavailable';
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const response = await fetchWithTimeout(fetcher, RESEND_EMAIL_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload) }, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
          lastStatus = response.status;
          if (response.ok) {
            notification = initialNotificationState('sent', { attemptedAt, sentAt: timestamp(options), providerMessageId: await responseId(response), providerStatus: response.status });
            break;
          }
          lastReason = retryableStatus(response.status) ? 'provider_unavailable' : 'provider_rejected';
          if (!retryableStatus(response.status) || attempt === MAX_ATTEMPTS) break;
        } catch (cause) {
          lastReason = cause?.name === 'AbortError' ? 'timeout' : 'network_error';
          if (attempt === MAX_ATTEMPTS) break;
        }
      }
      if (!notification) notification = initialNotificationState('failed', { attemptedAt, reason: lastReason, providerStatus: lastStatus });
    }
  }
  return initialSmsProducerAlert({
    type: alert.type,
    eventId: alert.eventId,
    createdAt: alert.createdAt,
    state: notification.state,
    details: notification
  });
}

export async function sendSmsProducerTestAlert(options = {}) {
  const nowValue = typeof options.now === 'function' ? options.now() : options.now;
  const nowDate = nowValue instanceof Date ? nowValue : nowValue ? new Date(nowValue) : new Date();
  const createdAt = Number.isNaN(nowDate.getTime()) ? new Date().toISOString() : nowDate.toISOString();
  const alert = initialSmsProducerAlert({ type: 'test', eventId: `test:${createdAt}`, createdAt });
  const conversation = { id: '', intent: '', answers: { priority: 'standard' }, attribution: null };
  return sendSmsProducerAlert(conversation, alert, options);
}
