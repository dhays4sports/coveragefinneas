(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitReferralAttribution = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'NP-1.5';
  const STORAGE_KEY = 'coveragefit.neighborReferral.entry.v1';
  const MARKER_KEY = 'coveragefit.neighborReferral.events.v1';
  const EVENT_ENDPOINT = '/api/referrals/event';
  const VALIDATE_ENDPOINT = '/api/referrals/read';
  const TOKEN_PATTERN = /^ref_[A-Za-z0-9_-]{16}$/;
  const ID_PATTERN = /^nref_[a-f0-9]{24}$/;
  const EVENTS = Object.freeze(['neighbor_share_view', 'neighbor_share_click', 'neighbor_referral_visit', 'neighbor_referral_start', 'neighbor_referral_complete']);
  const CHANNELS = Object.freeze(['sms', 'native', 'copy']);
  const ENTRY_TTL_MS = 6 * 60 * 60 * 1000;

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function storage(options) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'storage')) return options.storage;
    try { return root.sessionStorage || null; } catch (_) { return null; }
  }

  function now(options) {
    if (options?.now instanceof Date) return options.now;
    if (typeof options?.now === 'number') return new Date(options.now);
    return new Date();
  }

  function safeParse(value, fallback) {
    try { return value ? JSON.parse(value) : (fallback || null); } catch (_) { return fallback || null; }
  }

  function getItem(target, key) {
    try { return target?.getItem?.(key) || ''; } catch (_) { return ''; }
  }

  function setItem(target, key, value) {
    try { target?.setItem?.(key, String(value)); return true; } catch (_) { return false; }
  }

  function readEntry(options) {
    const entry = safeParse(getItem(storage(options), STORAGE_KEY), null);
    if (!entry || entry.referralType !== 'neighbor') return null;
    const receivedAt = Date.parse(entry.receivedAt || '');
    const age = now(options).getTime() - receivedAt;
    if (!Number.isFinite(receivedAt) || age < 0 || age > ENTRY_TTL_MS) return null;
    return {
      ...entry,
      referralToken: TOKEN_PATTERN.test(text(entry.referralToken)) ? text(entry.referralToken) : '',
      referralId: ID_PATTERN.test(text(entry.referralId)) ? text(entry.referralId) : '',
      tokenStatus: ['pending', 'valid', 'generic'].includes(text(entry.tokenStatus)) ? text(entry.tokenStatus) : 'generic',
      shareChannel: CHANNELS.includes(text(entry.shareChannel)) ? text(entry.shareChannel) : ''
    };
  }

  function writeEntry(entry, options) {
    return Boolean(entry && setItem(storage(options), STORAGE_KEY, JSON.stringify(entry)));
  }

  function sessionId() {
    const fromApi = text(root.CoverageFitAttribution?.get?.()?.sessionId);
    if (fromApi) return fromApi;
    try { return text(root.sessionStorage?.getItem?.('coveragefit_session_id_v1')); } catch (_) { return ''; }
  }

  async function parseResponse(response) {
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (response?.ok) return body || { ok: true };
    const error = new Error(text(body?.error?.message, `Request failed with status ${response?.status || 'unknown'}.`));
    error.code = text(body?.error?.code, 'request_failed');
    error.status = Number(response?.status) || 0;
    throw error;
  }

  async function validatePending(options) {
    const settings = options || {};
    const entry = readEntry(settings);
    if (!entry || entry.tokenStatus === 'generic' || !TOKEN_PATTERN.test(entry.referralToken)) return entry;
    if (entry.tokenStatus === 'valid' && ID_PATTERN.test(entry.referralId)) return entry;
    const fetcher = settings.fetch || root.fetch;
    if (typeof fetcher !== 'function') return entry;
    try {
      const response = await fetcher(settings.validateEndpoint || VALIDATE_ENDPOINT, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token: entry.referralToken })
      });
      const body = await parseResponse(response);
      const referral = body?.referral || {};
      if (referral.token !== entry.referralToken || !ID_PATTERN.test(text(referral.id))) return entry;
      const next = { ...entry, schemaVersion: '1.2', tokenStatus: 'valid', referralId: text(referral.id), validatedAt: now(settings).toISOString(), referralExpiresAt: text(referral.expiresAt) };
      writeEntry(next, settings);
      return next;
    } catch (_) {
      return entry;
    }
  }

  function markers(options) {
    const value = safeParse(getItem(storage(options), MARKER_KEY), {});
    return value && typeof value === 'object' ? value : {};
  }

  function markerId(token, eventName, details) {
    const channel = CHANNELS.includes(text(details?.channel)) ? text(details.channel) : '';
    if (eventName === 'neighbor_share_view') return `${token}|${eventName}`;
    if (eventName === 'neighbor_share_click') return `${token}|${eventName}|${channel || 'unknown'}`;
    if (eventName === 'neighbor_referral_complete') return `${token}|${eventName}|${text(details?.reportId)}`;
    return `${token}|${eventName}|${text(details?.sessionId, sessionId())}`;
  }

  function hasMarker(id, options) {
    return Boolean(markers(options)[id]);
  }

  function saveMarker(id, options) {
    const next = markers(options);
    next[id] = now(options).toISOString();
    return setItem(storage(options), MARKER_KEY, JSON.stringify(next));
  }

  async function trackForToken(token, eventName, details, options) {
    const settings = options || {};
    const candidate = text(token);
    const event = text(eventName);
    if (!TOKEN_PATTERN.test(candidate) || !EVENTS.includes(event)) return { ok: false, reason: 'invalid_event' };
    const input = details || {};
    const id = markerId(candidate, event, input);
    if (!input.force && hasMarker(id, settings)) return { ok: true, accepted: true, deduped: true, local: true };
    const fetcher = settings.fetch || root.fetch;
    if (typeof fetcher !== 'function') return { ok: false, reason: 'fetch_unavailable' };
    const body = {
      token: candidate,
      event,
      channel: CHANNELS.includes(text(input.channel)) ? text(input.channel) : '',
      sessionId: text(input.sessionId, sessionId()),
      landingSource: text(input.landingSource),
      reportId: text(input.reportId)
    };
    try {
      const response = await fetcher(settings.eventEndpoint || EVENT_ENDPOINT, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive: true,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await parseResponse(response);
      if (result?.accepted) saveMarker(id, settings);
      return result || { ok: true };
    } catch (error) {
      return { ok: false, reason: text(error?.code, 'event_unavailable') };
    }
  }

  async function track(eventName, details, options) {
    const entry = await validatePending(options);
    if (!entry || entry.tokenStatus !== 'valid' || !TOKEN_PATTERN.test(entry.referralToken)) return { ok: false, reason: 'referral_unavailable' };
    return trackForToken(entry.referralToken, eventName, { ...(details || {}), channel: text(details?.channel, entry.shareChannel) }, options);
  }

  function getContext(options) {
    const entry = readEntry(options);
    if (!entry || entry.tokenStatus !== 'valid' || !entry.referralId) return Object.freeze({ active: false, referralId: '', referralSource: '', referralChannel: '', referralReceivedAt: '' });
    return Object.freeze({
      active: true,
      referralId: entry.referralId,
      referralSource: 'neighbor-share',
      referralChannel: entry.shareChannel,
      referralReceivedAt: text(entry.receivedAt)
    });
  }

  function bindStart(documentRef, options) {
    const documentValue = documentRef || root.document;
    if (!documentValue?.querySelectorAll) return 0;
    const links = Array.from(documentValue.querySelectorAll('[data-welcome-cta], a[href="/assessment/"], a[href="/assessment"]'));
    links.forEach((link) => {
      if (link.dataset?.referralStartBound === 'true') return;
      if (link.dataset) link.dataset.referralStartBound = 'true';
      link.addEventListener?.('click', () => { track('neighbor_referral_start', { landingSource: 'coveragefit_home' }, options).catch(() => {}); });
    });
    return links.length;
  }

  async function autoInitialize(options) {
    const settings = options || {};
    const locationRef = settings.location || root.location || {};
    const pathname = text(locationRef.pathname);
    if (pathname === '/home' || pathname === '/home/') {
      const entry = await validatePending(settings);
      if (entry?.tokenStatus === 'valid') await track('neighbor_referral_visit', { landingSource: 'coveragefit_home' }, settings);
      bindStart(settings.document || root.document, settings);
      return { ok: true, stage: 'visit', context: getContext(settings) };
    }
    if (pathname === '/assessment' || pathname === '/assessment/') {
      const entry = await validatePending(settings);
      if (entry?.tokenStatus === 'valid') await track('neighbor_referral_start', { landingSource: 'coveragefit_assessment' }, settings);
      return { ok: true, stage: 'start', context: getContext(settings) };
    }
    return { ok: false, reason: 'route_not_tracked' };
  }

  function markComplete(reportId, options) {
    return track('neighbor_referral_complete', { reportId: text(reportId), landingSource: 'coveragefit_assessment' }, options);
  }

  function boot() {
    if (!root.document) return;
    const run = () => { autoInitialize().catch(() => {}); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  }

  const api = Object.freeze({ VERSION, BUILD, STORAGE_KEY, MARKER_KEY, EVENT_ENDPOINT, VALIDATE_ENDPOINT, TOKEN_PATTERN, ID_PATTERN, EVENTS, CHANNELS, readEntry, writeEntry, validatePending, getContext, trackForToken, track, bindStart, autoInitialize, markComplete });
  boot();
  return api;
});
