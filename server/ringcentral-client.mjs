const TOKEN_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const DEFAULT_SERVER_URL = 'https://platform.ringcentral.com';
const SMS_EVENT_FILTER = '/restapi/v1.0/account/~/extension/~/message-store/instant?type=SMS';
const tokenCache = new Map();

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function integer(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function normalizeE164(value) {
  const raw = text(value).replace(/[\s().-]/g, '');
  if (/^\+1[2-9]\d{9}$/.test(raw)) return raw;
  if (/^1[2-9]\d{9}$/.test(raw)) return `+${raw}`;
  if (/^[2-9]\d{9}$/.test(raw)) return `+1${raw}`;
  return '';
}

function serverUrl(value) {
  const candidate = text(value, DEFAULT_SERVER_URL).replace(/\/+$/, '');
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') return DEFAULT_SERVER_URL;
    return parsed.origin;
  } catch (_) {
    return DEFAULT_SERVER_URL;
  }
}

function absoluteHttpsUrl(value) {
  try {
    const parsed = new URL(text(value));
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch (_) {
    return '';
  }
}

export function ringCentralConfig(env = {}) {
  return Object.freeze({
    serverUrl: serverUrl(env.RINGCENTRAL_SERVER_URL),
    clientId: text(env.RINGCENTRAL_CLIENT_ID),
    clientSecret: text(env.RINGCENTRAL_CLIENT_SECRET),
    jwt: text(env.RINGCENTRAL_JWT_TOKEN),
    fromNumber: normalizeE164(env.RINGCENTRAL_FROM_NUMBER),
    accountId: text(env.RINGCENTRAL_ACCOUNT_ID, '~'),
    extensionId: text(env.RINGCENTRAL_EXTENSION_ID, '~'),
    webhookUrl: absoluteHttpsUrl(env.RINGCENTRAL_WEBHOOK_URL),
    webhookValidationToken: text(env.RINGCENTRAL_WEBHOOK_VALIDATION_TOKEN),
    conversationHashSecret: text(env.RINGCENTRAL_CONVERSATION_HASH_SECRET),
    maintenanceSecret: text(env.RINGCENTRAL_MAINTENANCE_SECRET || env.CALLBACK_CRON_SECRET),
    subscriptionExpiresIn: integer(env.RINGCENTRAL_SUBSCRIPTION_EXPIRES_IN, 604799, 900, 604799),
    subscriptionRenewBeforeSeconds: integer(env.RINGCENTRAL_SUBSCRIPTION_RENEW_BEFORE_SECONDS, 86400, 3600, 259200)
  });
}

export function missingRingCentralConfiguration(env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const fields = [
    ['RINGCENTRAL_CLIENT_ID', config.clientId],
    ['RINGCENTRAL_CLIENT_SECRET', config.clientSecret],
    ['RINGCENTRAL_JWT_TOKEN', config.jwt],
    ['RINGCENTRAL_FROM_NUMBER', config.fromNumber],
    ['RINGCENTRAL_WEBHOOK_URL', config.webhookUrl],
    ['RINGCENTRAL_WEBHOOK_VALIDATION_TOKEN', config.webhookValidationToken],
    ['RINGCENTRAL_CONVERSATION_HASH_SECRET', config.conversationHashSecret]
  ];
  const required = options.forWebhookOnly
    ? fields.filter(([name]) => ['RINGCENTRAL_FROM_NUMBER', 'RINGCENTRAL_WEBHOOK_VALIDATION_TOKEN', 'RINGCENTRAL_CONVERSATION_HASH_SECRET'].includes(name))
    : fields;
  return required.filter(([, value]) => !value).map(([name]) => name);
}

function base64(value) {
  return btoa(String(value || ''));
}

function nowMs(options = {}) {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

function safeErrorBody(body) {
  if (!body || typeof body !== 'object') return {};
  return {
    code: text(body.errorCode || body.error || body.code).slice(0, 80),
    message: text(body.message || body.error_description || body.description, 'RingCentral request failed.').slice(0, 240)
  };
}

export class RingCentralApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'RingCentralApiError';
    this.status = Number(options.status) || 502;
    this.code = text(options.code, 'ringcentral_request_failed');
  }
}

async function parseResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return { message: raw.slice(0, 240) }; }
}

export function clearRingCentralTokenCache() {
  tokenCache.clear();
}

export async function getRingCentralAccessToken(env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const missing = missingRingCentralConfiguration(env).filter(name => !['RINGCENTRAL_FROM_NUMBER', 'RINGCENTRAL_WEBHOOK_URL', 'RINGCENTRAL_WEBHOOK_VALIDATION_TOKEN', 'RINGCENTRAL_CONVERSATION_HASH_SECRET'].includes(name));
  if (missing.length) throw new RingCentralApiError(`Missing RingCentral authentication configuration: ${missing.join(', ')}`, { status: 503, code: 'ringcentral_not_configured' });

  const cacheKey = `${config.serverUrl}|${config.clientId}|${config.jwt.slice(-16)}`;
  const cached = tokenCache.get(cacheKey);
  const now = nowMs(options);
  if (cached?.accessToken && cached.expiresAt > now + 60000) return cached.accessToken;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new RingCentralApiError('Fetch is unavailable for RingCentral authentication.', { status: 503, code: 'fetch_unavailable' });
  const body = new URLSearchParams({ grant_type: TOKEN_GRANT, assertion: config.jwt });
  let response;
  try {
    response = await fetchImpl(`${config.serverUrl}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${base64(`${config.clientId}:${config.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: body.toString()
    });
  } catch (_) {
    throw new RingCentralApiError('RingCentral authentication could not be reached.', { status: 502, code: 'ringcentral_auth_unreachable' });
  }
  const payload = await parseResponse(response);
  if (!response.ok || !text(payload.access_token)) {
    const detail = safeErrorBody(payload);
    throw new RingCentralApiError(detail.message || 'RingCentral authentication failed.', { status: response.status || 502, code: detail.code || 'ringcentral_auth_failed' });
  }
  const expiresIn = integer(payload.expires_in, 3600, 60, 86400);
  tokenCache.set(cacheKey, { accessToken: payload.access_token, expiresAt: now + (expiresIn * 1000) });
  return payload.access_token;
}

export async function ringCentralRequest(pathname, init = {}, env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const accessToken = await getRingCentralAccessToken(env, options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const path = String(pathname || '').startsWith('/') ? String(pathname) : `/${pathname}`;
  let response;
  try {
    response = await fetchImpl(`${config.serverUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {})
      }
    });
  } catch (_) {
    throw new RingCentralApiError('RingCentral API could not be reached.', { status: 502, code: 'ringcentral_api_unreachable' });
  }
  const payload = await parseResponse(response);
  if (!response.ok) {
    const detail = safeErrorBody(payload);
    if (response.status === 401) clearRingCentralTokenCache();
    throw new RingCentralApiError(detail.message || 'RingCentral API request failed.', { status: response.status || 502, code: detail.code || 'ringcentral_api_failed' });
  }
  return payload;
}

function accountExtensionPath(config, suffix) {
  return `/restapi/v1.0/account/${encodeURIComponent(config.accountId)}/extension/${encodeURIComponent(config.extensionId)}${suffix}`;
}

export async function listRingCentralPhoneNumbers(env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const payload = await ringCentralRequest(accountExtensionPath(config, '/phone-number'), { method: 'GET' }, env, options);
  return Array.isArray(payload.records) ? payload.records : [];
}

export function findConfiguredSmsNumber(records, configuredNumber) {
  const target = normalizeE164(configuredNumber);
  return (Array.isArray(records) ? records : []).find(record => normalizeE164(record?.phoneNumber) === target) || null;
}

export function phoneNumberSupportsSms(record) {
  const features = Array.isArray(record?.features) ? record.features.map(value => text(value).toLowerCase()) : [];
  return features.includes('smssender');
}

export async function sendRingCentralSms({ to, textBody }, env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const recipient = normalizeE164(to);
  const bodyText = text(textBody).slice(0, 1000);
  if (!config.fromNumber || !recipient || !bodyText) throw new RingCentralApiError('A configured sender, valid recipient, and message body are required.', { status: 422, code: 'invalid_sms_request' });
  return ringCentralRequest(accountExtensionPath(config, '/sms'), {
    method: 'POST',
    body: JSON.stringify({
      from: { phoneNumber: config.fromNumber },
      to: [{ phoneNumber: recipient }],
      text: bodyText
    })
  }, env, options);
}

export async function listRingCentralSubscriptions(env = {}, options = {}) {
  const payload = await ringCentralRequest('/restapi/v1.0/subscription', { method: 'GET' }, env, options);
  return Array.isArray(payload.records) ? payload.records : [];
}

function subscriptionRemainingSeconds(record, options = {}) {
  const expiration = Date.parse(text(record?.expirationTime));
  if (Number.isFinite(expiration)) return Math.floor((expiration - nowMs(options)) / 1000);
  const expiresIn = Number(record?.expiresIn);
  return Number.isFinite(expiresIn) ? Math.floor(expiresIn) : 0;
}

export function ringCentralSubscriptionHealth(record, options = {}) {
  if (!record || typeof record !== 'object') {
    return Object.freeze({ active: false, state: 'missing', reason: 'No matching inbound SMS webhook subscription exists.', remainingSeconds: 0 });
  }
  const status = text(record.status, 'Unknown');
  const normalizedStatus = status.toLowerCase();
  const remainingSeconds = subscriptionRemainingSeconds(record, options);
  if (record.blacklistedData || normalizedStatus === 'blacklisted') {
    return Object.freeze({ active: false, state: 'blacklisted', reason: 'RingCentral permanently suspended this webhook after delivery failures.', remainingSeconds });
  }
  if (normalizedStatus === 'suspended') {
    return Object.freeze({ active: false, state: 'suspended', reason: 'RingCentral has suspended this webhook subscription.', remainingSeconds });
  }
  if (remainingSeconds <= 0) {
    return Object.freeze({ active: false, state: 'expired', reason: 'The inbound SMS webhook subscription has expired.', remainingSeconds });
  }
  if (normalizedStatus !== 'active') {
    return Object.freeze({ active: false, state: 'inactive', reason: `The inbound SMS webhook status is ${status}.`, remainingSeconds });
  }
  return Object.freeze({ active: true, state: 'active', reason: 'The inbound SMS webhook subscription is active.', remainingSeconds });
}

function isSmsInstantEventFilter(value) {
  const raw = text(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw, 'https://ringcentral.invalid');
    const parts = parsed.pathname.split('/').filter(Boolean);
    const accountIndex = parts.indexOf('account');
    const extensionIndex = parts.indexOf('extension');
    const messageStoreIndex = parts.indexOf('message-store');
    return parts[0] === 'restapi'
      && parts[1] === 'v1.0'
      && accountIndex === 2
      && Boolean(parts[accountIndex + 1])
      && extensionIndex === 4
      && Boolean(parts[extensionIndex + 1])
      && messageStoreIndex === 6
      && parts[messageStoreIndex + 1] === 'instant'
      && text(parsed.searchParams.get('type')).toUpperCase() === 'SMS';
  } catch (_) {
    return false;
  }
}

export function matchingSmsWebhookSubscriptions(records, webhookUrl) {
  const target = absoluteHttpsUrl(webhookUrl);
  return (Array.isArray(records) ? records : []).filter(record => {
    const filters = Array.isArray(record?.eventFilters) ? record.eventFilters : [];
    return text(record?.deliveryMode?.transportType).toLowerCase() === 'webhook'
      && absoluteHttpsUrl(record?.deliveryMode?.address) === target
      && filters.some(isSmsInstantEventFilter);
  });
}

export function findSmsWebhookSubscription(records, webhookUrl, options = {}) {
  const matches = matchingSmsWebhookSubscriptions(records, webhookUrl);
  return matches.sort((left, right) => {
    const leftHealth = ringCentralSubscriptionHealth(left, options);
    const rightHealth = ringCentralSubscriptionHealth(right, options);
    if (leftHealth.active !== rightHealth.active) return leftHealth.active ? -1 : 1;
    return rightHealth.remainingSeconds - leftHealth.remainingSeconds;
  })[0] || null;
}

function subscriptionBody(config) {
  return {
    eventFilters: [SMS_EVENT_FILTER],
    deliveryMode: {
      transportType: 'WebHook',
      address: config.webhookUrl,
      validationToken: config.webhookValidationToken
    },
    expiresIn: config.subscriptionExpiresIn
  };
}

export async function readRingCentralMessage(messageId, env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const id = text(messageId).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 120);
  if (!id) throw new RingCentralApiError('A RingCentral message ID is required.', { status: 422, code: 'invalid_message_id' });
  return ringCentralRequest(accountExtensionPath(config, `/message-store/${encodeURIComponent(id)}`), { method: 'GET' }, env, options);
}

export async function listRingCentralMessageHistory(input = {}, env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const dateFrom = text(input.dateFrom).slice(0, 60);
  const dateTo = text(input.dateTo).slice(0, 60);
  const page = integer(input.page, 1, 1, 10000);
  const perPage = integer(input.perPage, 100, 1, 1000);
  const query = new URLSearchParams({
    messageType: 'SMS',
    direction: 'Inbound',
    page: String(page),
    perPage: String(perPage)
  });
  if (dateFrom) query.set('dateFrom', dateFrom);
  if (dateTo) query.set('dateTo', dateTo);
  const payload = await ringCentralRequest(accountExtensionPath(config, `/message-store?${query.toString()}`), { method: 'GET' }, env, options);
  const records = Array.isArray(payload.records) ? payload.records : [];
  const currentPage = integer(payload.paging?.page, page, 1, 10000);
  const totalPages = integer(payload.paging?.totalPages, currentPage, currentPage, 10000);
  return { records, page: currentPage, totalPages, hasMore: currentPage < totalPages };
}

export async function createOrRenewRingCentralSmsWebhook(env = {}, options = {}) {
  return maintainRingCentralSmsWebhook(env, { ...options, forceRenew: true });
}

export async function maintainRingCentralSmsWebhook(env = {}, options = {}) {
  const config = ringCentralConfig(env);
  const missing = missingRingCentralConfiguration(env);
  if (missing.length) throw new RingCentralApiError(`Missing RingCentral configuration: ${missing.join(', ')}`, { status: 503, code: 'ringcentral_not_configured' });
  const records = await listRingCentralSubscriptions(env, options);
  const existing = findSmsWebhookSubscription(records, config.webhookUrl, options);
  const health = ringCentralSubscriptionHealth(existing, options);
  const shouldRenew = health.active && (Boolean(options.forceRenew) || health.remainingSeconds <= config.subscriptionRenewBeforeSeconds);
  let replacementTarget = existing;

  if (health.active && !shouldRenew) {
    return { created: false, replaced: false, renewed: false, action: 'healthy', previousStatus: existing?.status || '', subscription: existing, health };
  }

  if (shouldRenew && existing?.id) {
    try {
      const renewed = await ringCentralRequest(`/restapi/v1.0/subscription/${encodeURIComponent(existing.id)}/renew`, {
        method: 'POST',
        body: JSON.stringify({ expiresIn: config.subscriptionExpiresIn })
      }, env, options);
      return {
        created: false,
        replaced: false,
        renewed: true,
        action: 'renewed',
        previousStatus: existing.status || '',
        subscription: renewed,
        health: ringCentralSubscriptionHealth(renewed, options)
      };
    } catch (cause) {
      // A renewal can fail if RingCentral invalidated the subscription between
      // the status check and this request. Re-read before replacing it so a
      // successful-but-interrupted renewal does not create a duplicate.
      const refreshed = findSmsWebhookSubscription(await listRingCentralSubscriptions(env, options), config.webhookUrl, options);
      const refreshedHealth = ringCentralSubscriptionHealth(refreshed, options);
      if (refreshedHealth.active && refreshedHealth.remainingSeconds > config.subscriptionRenewBeforeSeconds) {
        return { created: false, replaced: false, renewed: true, action: 'renewed', previousStatus: existing.status || '', subscription: refreshed, health: refreshedHealth };
      }
      // Preserve a still-active subscription if renewal failed transiently. The
      // scheduled maintainer will retry; deleting a working webhook here would
      // turn a recoverable API error into an avoidable outage.
      if (refreshedHealth.active) throw cause;
      replacementTarget = refreshed;
    }
  }

  if (replacementTarget?.id) {
    await ringCentralRequest(`/restapi/v1.0/subscription/${encodeURIComponent(replacementTarget.id)}`, {
      method: 'DELETE'
    }, env, options);
  }

  const replacement = await ringCentralRequest('/restapi/v1.0/subscription', {
    method: 'POST',
    body: JSON.stringify(subscriptionBody(config))
  }, env, options);
  return {
    created: true,
    replaced: Boolean(replacementTarget?.id),
    renewed: false,
    action: replacementTarget?.id ? 'recreated' : 'created',
    previousStatus: replacementTarget?.status || '',
    subscription: replacement,
    health: ringCentralSubscriptionHealth(replacement, options)
  };
}

export { SMS_EVENT_FILTER };
