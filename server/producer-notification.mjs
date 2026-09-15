export const NOTIFICATION_SCHEMA_VERSION = '1.0';
export const NOTIFICATION_VERSION = '1.0.0';
export const NOTIFICATION_PROVIDER = 'resend';
export const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails';
export const NOTIFICATION_STATES = Object.freeze(['pending', 'sent', 'failed', 'skipped', 'legacy']);

const DEFAULT_SUBJECT = 'New CoverageFit review ready';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 2;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function truthy(value, fallback = true) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function validMailbox(value) {
  const candidate = text(value);
  if (!candidate || candidate.length > 320 || /[\r\n]/.test(candidate)) return false;
  const bracketed = candidate.match(/<([^<>]+)>\s*$/);
  const address = text(bracketed ? bracketed[1] : candidate);
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}

function safeOrigin(value, fallback = '') {
  const candidate = text(value, fallback);
  try {
    const url = new URL(candidate);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return url.origin;
  } catch (_) {
    return '';
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function normalizeNotificationState(value, fallback = 'legacy') {
  const normalized = text(value).toLowerCase();
  return NOTIFICATION_STATES.includes(normalized) ? normalized : fallback;
}

export function notificationConfig(env = {}, requestUrl = '') {
  const enabled = truthy(env.COVERAGEFIT_NEW_REVIEW_NOTIFICATIONS_ENABLED, true);
  const apiKey = text(env.RESEND_API_KEY);
  const to = text(env.COVERAGEFIT_PRODUCER_NOTIFICATION_EMAIL);
  const from = text(env.COVERAGEFIT_NOTIFICATION_FROM);
  const replyTo = text(env.COVERAGEFIT_NOTIFICATION_REPLY_TO);
  const requestOrigin = (() => {
    try { return new URL(requestUrl).origin; } catch (_) { return ''; }
  })();
  const origin = safeOrigin(env.COVERAGEFIT_SITE_URL, requestOrigin);
  const missing = [];
  if (!apiKey) missing.push('api_key');
  if (!validMailbox(to)) missing.push('recipient');
  if (!validMailbox(from)) missing.push('sender');
  if (!origin) missing.push('site_origin');
  return Object.freeze({
    enabled,
    configured: enabled && missing.length === 0,
    provider: NOTIFICATION_PROVIDER,
    apiKey,
    to,
    from,
    replyTo: validMailbox(replyTo) ? replyTo : '',
    origin,
    workspaceUrl: origin ? `${origin}/agent/workspace/` : '',
    missing: Object.freeze(missing)
  });
}

export function initialNotificationState(state = 'pending', details = {}) {
  const normalized = normalizeNotificationState(state, 'pending');
  return {
    schemaVersion: NOTIFICATION_SCHEMA_VERSION,
    notificationVersion: NOTIFICATION_VERSION,
    channel: 'email',
    provider: NOTIFICATION_PROVIDER,
    state: normalized,
    attemptedAt: text(details.attemptedAt),
    sentAt: text(details.sentAt),
    providerMessageId: text(details.providerMessageId).slice(0, 160),
    reason: text(details.reason).slice(0, 80),
    providerStatus: Number.isFinite(Number(details.providerStatus)) ? Number(details.providerStatus) : null
  };
}

export function normalizeNotification(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initialNotificationState('legacy', { reason: 'metadata_unavailable' });
  const state = normalizeNotificationState(value.state, 'legacy');
  return initialNotificationState(state, value);
}

export function shouldAttemptNewReviewNotification(existingNotification) {
  if (!existingNotification) return true;
  const state = normalizeNotification(existingNotification).state;
  return ['pending', 'failed', 'skipped'].includes(state);
}

export function buildNewReviewEmail(config) {
  const subject = DEFAULT_SUBJECT;
  const workspaceUrl = config.workspaceUrl;
  const textBody = [
    'A new Home Coverage Review is ready in the secure CoverageFit Agent Workspace.',
    '',
    `Open Agent Workspace: ${workspaceUrl}`,
    '',
    'For privacy, this alert intentionally excludes the homeowner’s name, contact information, property address, Protection Score, and assessment details.'
  ].join('\n');
  const htmlBody = `<!doctype html><html><body style="margin:0;background:#f4f7f8;font-family:Arial,sans-serif;color:#173047"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #dbe5e8;border-radius:16px;padding:28px"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#527080">CoverageFit producer alert</p><h1 style="margin:0 0 14px;font-size:26px;line-height:1.2">New review ready</h1><p style="margin:0 0 22px;line-height:1.6">A new Home Coverage Review is ready in your secure Agent Workspace.</p><p style="margin:0 0 24px"><a href="${escapeHtml(workspaceUrl)}" style="display:inline-block;background:#0e5c4a;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px">Open Agent Workspace</a></p><p style="margin:0;color:#647985;font-size:12px;line-height:1.55">For privacy, this alert intentionally excludes the homeowner’s name, contact information, property address, Protection Score, and assessment details.</p></div></div></body></html>`;
  return Object.freeze({ subject, text: textBody, html: htmlBody });
}

function retryableStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithTimeout(fetcher, url, init, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, ...(controller ? { signal: controller.signal } : {}) });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function providerResponseId(response) {
  try {
    const body = await response.json();
    return text(body?.id).slice(0, 160);
  } catch (_) {
    return '';
  }
}

export async function sendNewReviewNotification(record, options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const attemptedAt = text(now(), new Date().toISOString());
  const config = notificationConfig(options.env || {}, options.requestUrl || '');
  if (!config.enabled) return initialNotificationState('skipped', { attemptedAt, reason: 'disabled' });
  if (!config.configured) return initialNotificationState('skipped', { attemptedAt, reason: 'not_configured' });

  const fetcher = options.fetch || globalThis.fetch;
  if (typeof fetcher !== 'function') return initialNotificationState('failed', { attemptedAt, reason: 'fetch_unavailable' });
  const email = buildNewReviewEmail(config);
  const id = text(record?.id, 'unknown-review');
  const payload = {
    from: config.from,
    to: [config.to],
    subject: email.subject,
    text: email.text,
    html: email.html,
    ...(config.replyTo ? { reply_to: config.replyTo } : {})
  };
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Idempotency-Key': `coveragefit-new-review-${id}`.slice(0, 256)
  };

  let lastStatus = null;
  let lastReason = 'provider_unavailable';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(fetcher, RESEND_EMAIL_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      }, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
      lastStatus = response.status;
      if (response.ok) {
        return initialNotificationState('sent', {
          attemptedAt,
          sentAt: text(now(), attemptedAt),
          providerMessageId: await providerResponseId(response),
          providerStatus: response.status
        });
      }
      lastReason = retryableStatus(response.status) ? 'provider_unavailable' : 'provider_rejected';
      if (!retryableStatus(response.status) || attempt === MAX_ATTEMPTS) break;
    } catch (error) {
      lastReason = error?.name === 'AbortError' ? 'timeout' : 'network_error';
      if (attempt === MAX_ATTEMPTS) break;
    }
  }
  return initialNotificationState('failed', {
    attemptedAt,
    reason: lastReason,
    providerStatus: lastStatus
  });
}
