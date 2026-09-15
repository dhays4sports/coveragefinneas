(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitPostSubmissionShare = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.4.0';
  const BUILD = 'NP-1.5';
  const RECEIPT_KEY = 'coveragefit.neighborShare.receipt.v1';
  const RECEIPT_TTL_MS = 2 * 60 * 60 * 1000;
  const DEFAULT_SHARE_URL = 'https://408farmers.com/neighbor/';
  const REFERRAL_CREATE_ENDPOINT = '/api/referrals/create';
  const REFERRAL_TOKEN_PATTERN = /^ref_[A-Za-z0-9_-]{16}$/;
  const SHARE_CHANNELS = Object.freeze(['sms', 'native', 'copy']);
  const SHARE_TITLE = 'Local five-minute home coverage review';
  const MESSAGE_PREFIX = "Hey, I just used this local five-minute home coverage review. It’s personally reviewed by Dylan at the Virginia Tam Insurance Agency, not an instant quote. Sharing in case it helps:";

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

  function getItem(target, key) {
    try { return target?.getItem?.(key) || ''; } catch (_) { return ''; }
  }

  function setItem(target, key, value) {
    try { target?.setItem?.(key, String(value)); return true; } catch (_) { return false; }
  }

  function safeParse(value) {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
  }

  function normalizeShareUrl(value) {
    const candidate = text(value, DEFAULT_SHARE_URL);
    try {
      const url = new URL(candidate, DEFAULT_SHARE_URL);
      if (!/^https?:$/.test(url.protocol)) return DEFAULT_SHARE_URL;
      url.hash = '';
      return url.toString();
    } catch (_) {
      return DEFAULT_SHARE_URL;
    }
  }

  function buildMessage(url) {
    return `${MESSAGE_PREFIX} ${normalizeShareUrl(url)}`;
  }

  function buildChannelUrl(url, channel) {
    const normalized = normalizeShareUrl(url);
    if (!SHARE_CHANNELS.includes(text(channel))) return normalized;
    try {
      const target = new URL(normalized);
      target.searchParams.set('share', channel);
      return target.toString();
    } catch (_) {
      return normalized;
    }
  }

  function tokenFromUrl(value) {
    try {
      const url = new URL(normalizeShareUrl(value));
      const queryToken = text(url.searchParams.get('rid'));
      if (REFERRAL_TOKEN_PATTERN.test(queryToken)) return queryToken;
      const pathMatch = url.pathname.match(/^\/neighbor\/r\/(ref_[A-Za-z0-9_-]{16})\/?$/);
      return pathMatch && REFERRAL_TOKEN_PATTERN.test(pathMatch[1]) ? pathMatch[1] : '';
    } catch (_) { return ''; }
  }

  function isAppleMobile(userAgent, maxTouchPoints) {
    const ua = text(userAgent);
    return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && Number(maxTouchPoints) > 1);
  }

  function isMobileDevice(userAgent, maxTouchPoints) {
    return isAppleMobile(userAgent, maxTouchPoints) || /Android|Mobile/i.test(text(userAgent));
  }

  function buildSmsHref(url, userAgent, maxTouchPoints) {
    const separator = isAppleMobile(userAgent, maxTouchPoints) ? '&body=' : '?body=';
    return `sms:${separator}${encodeURIComponent(buildMessage(url))}`;
  }

  function markSuccessfulSubmission(details, options) {
    const input = details || {};
    const succeeded = input.success === true
      || input.formSubmissionSucceeded === true
      || input.remoteSubmissionSucceeded === true;
    const reportId = text(input.reportId);
    if (!succeeded || !reportId || text(input.assessment, 'home').toLowerCase() !== 'home') return false;

    const receipt = {
      schemaVersion: '1.0',
      success: true,
      assessment: 'home',
      reportId,
      submittedAt: text(input.submittedAt, now(options).toISOString()),
      formSubmissionSucceeded: input.formSubmissionSucceeded === true,
      remoteSubmissionSucceeded: input.remoteSubmissionSucceeded === true,
      dismissed: false
    };
    return setItem(storage(options), RECEIPT_KEY, JSON.stringify(receipt));
  }

  function readReceipt(options) {
    const receipt = safeParse(getItem(storage(options), RECEIPT_KEY));
    return receipt && receipt.schemaVersion === '1.0' ? receipt : null;
  }

  function writeReceipt(receipt, options) {
    return Boolean(receipt && receipt.schemaVersion === '1.0' && setItem(storage(options), RECEIPT_KEY, JSON.stringify(receipt)));
  }

  function isEligible(receipt, context, options) {
    const input = receipt || {};
    const current = context || {};
    if (!input.success || input.dismissed || input.assessment !== 'home') return false;
    if (!text(input.reportId) || text(input.reportId) !== text(current.reportId)) return false;
    if (current.reportReady !== true) return false;
    const submittedAt = new Date(input.submittedAt).getTime();
    const age = now(options).getTime() - submittedAt;
    return Number.isFinite(submittedAt) && age >= 0 && age <= RECEIPT_TTL_MS;
  }

  function referralAccessIsFresh(access, options) {
    const token = text(access?.token);
    const url = normalizeShareUrl(access?.url);
    const expiresAt = Date.parse(access?.expiresAt || '');
    return Boolean(
      REFERRAL_TOKEN_PATTERN.test(token)
      && tokenFromUrl(url) === token
      && Number.isFinite(expiresAt)
      && expiresAt > now(options).getTime()
    );
  }

  function saveReferralAccess(access, options) {
    if (!referralAccessIsFresh(access, options)) return false;
    const receipt = readReceipt(options);
    if (!receipt) return false;
    receipt.referral = {
      schemaVersion: '1.0',
      token: text(access.token),
      url: normalizeShareUrl(access.url),
      createdAt: text(access.createdAt),
      expiresAt: text(access.expiresAt)
    };
    return writeReceipt(receipt, options);
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

  async function requestWithTimeout(url, options, timeoutMs, fetchImpl) {
    const fetcher = fetchImpl || root.fetch;
    if (typeof fetcher !== 'function') throw Object.assign(new Error('Fetch is unavailable.'), { code: 'fetch_unavailable' });
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetcher(url, { ...options, ...(controller ? { signal: controller.signal } : {}) }); }
    finally { if (timer !== null) clearTimeout(timer); }
  }

  async function ensureReferralLink(reportId, options) {
    const settings = options || {};
    const receipt = readReceipt(settings);
    if (referralAccessIsFresh(receipt?.referral, settings)) {
      return { ok: true, access: { ...receipt.referral }, cached: true };
    }
    const id = text(reportId);
    if (!id) return { ok: false, url: DEFAULT_SHARE_URL, reason: 'report_missing' };
    try {
      const response = await requestWithTimeout(settings.referralEndpoint || REFERRAL_CREATE_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reportId: id })
      }, Number(settings.timeoutMs) || 5000, settings.fetch);
      const body = await parseResponse(response);
      const access = body?.access || {};
      if (!referralAccessIsFresh(access, settings)) throw Object.assign(new Error('The referral service returned an invalid access record.'), { code: 'invalid_access_record' });
      saveReferralAccess(access, settings);
      return { ok: true, access: { ...access }, cached: false };
    } catch (error) {
      return { ok: false, url: DEFAULT_SHARE_URL, reason: text(error?.code, 'referral_unavailable') };
    }
  }

  function dismiss(options) {
    const receipt = readReceipt(options);
    if (!receipt) return false;
    receipt.dismissed = true;
    receipt.dismissedAt = now(options).toISOString();
    return writeReceipt(receipt, options);
  }

  async function copyText(value, options) {
    const settings = options || {};
    const navigatorRef = settings.navigator || root.navigator || {};
    const documentRef = settings.document || root.document;
    if (navigatorRef.clipboard?.writeText) {
      try {
        await navigatorRef.clipboard.writeText(String(value));
        return true;
      } catch (_) {}
    }
    if (!documentRef?.createElement || !documentRef.body) return false;
    const field = documentRef.createElement('textarea');
    field.value = String(value);
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    documentRef.body.appendChild(field);
    field.select();
    field.setSelectionRange?.(0, field.value.length);
    let copied = false;
    try { copied = documentRef.execCommand?.('copy') === true; } catch (_) {}
    field.remove?.();
    return copied;
  }

  function setFeedback(target, message, tone) {
    if (!target) return;
    target.textContent = message;
    target.dataset.tone = tone || 'neutral';
  }

  function trackReferralEvent(token, eventName, details) {
    if (!REFERRAL_TOKEN_PATTERN.test(text(token))) return Promise.resolve({ ok: false, reason: 'token_missing' });
    const tracker = root.CoverageFitReferralAttribution;
    if (!tracker?.trackForToken) return Promise.resolve({ ok: false, reason: 'tracker_unavailable' });
    return tracker.trackForToken(token, eventName, details || {}).catch(() => ({ ok: false, reason: 'event_unavailable' }));
  }

  async function initialize(options) {
    const settings = options || {};
    const documentRef = settings.document || root.document;
    const navigatorRef = settings.navigator || root.navigator || {};
    const locationRef = settings.location || root.location || {};
    const section = documentRef?.querySelector?.('[data-neighbor-share]');
    if (!section) return { ok: false, reason: 'module_missing' };

    const reportReady = await (settings.reportReady || root.COVERAGEFIT_PROSPECT_REPORT_READY || Promise.resolve({ ok: false }));
    const reportId = text(reportReady?.access?.reportId)
      || text(root.CoverageFitProspectReports?.readIdFromLocation?.(locationRef));
    const receipt = readReceipt(settings);
    if (!isEligible(receipt, { reportId, reportReady: reportReady?.ok === true }, settings)) {
      section.hidden = true;
      return { ok: false, reason: 'not_eligible' };
    }

    const genericUrl = normalizeShareUrl(section.dataset.shareUrl || DEFAULT_SHARE_URL);
    const referral = await ensureReferralLink(reportId, settings);
    const shareUrl = normalizeShareUrl(referral.ok ? referral.access.url : genericUrl);
    const referralToken = tokenFromUrl(shareUrl);
    const textButton = section.querySelector('[data-neighbor-text]');
    const shareButton = section.querySelector('[data-neighbor-native-share]');
    const copyButton = section.querySelector('[data-neighbor-copy]');
    const dismissButton = section.querySelector('[data-neighbor-dismiss]');
    const feedback = section.querySelector('[data-neighbor-feedback]');
    const visibleLink = section.querySelector('[data-neighbor-visible-link]');
    if (visibleLink) {
      visibleLink.href = shareUrl;
      visibleLink.textContent = shareUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    textButton?.addEventListener('click', async () => {
      const channelUrl = buildChannelUrl(shareUrl, 'sms');
      const userAgent = text(navigatorRef.userAgent);
      const maxTouchPoints = Number(navigatorRef.maxTouchPoints) || 0;
      if (isMobileDevice(userAgent, maxTouchPoints)) {
        trackReferralEvent(referralToken, 'neighbor_share_click', { channel: 'sms', landingSource: 'coveragefit_report' });
        locationRef.href = buildSmsHref(channelUrl, userAgent, maxTouchPoints);
        setFeedback(feedback, 'Your messaging app is opening with the review message ready.', 'success');
        return;
      }
      const copied = await copyText(buildMessage(channelUrl), { navigator: navigatorRef, document: documentRef });
      if (copied) trackReferralEvent(referralToken, 'neighbor_share_click', { channel: 'sms', landingSource: 'coveragefit_report' });
      setFeedback(feedback, copied
        ? 'Neighbor message copied. Paste it into Messages, email, or another app.'
        : 'Copy the review link below and share it with a neighbor.', copied ? 'success' : 'error');
    });

    shareButton?.addEventListener('click', async () => {
      const channelUrl = buildChannelUrl(shareUrl, 'native');
      if (typeof navigatorRef.share === 'function') {
        try {
          await navigatorRef.share({ title: SHARE_TITLE, text: MESSAGE_PREFIX, url: channelUrl });
          trackReferralEvent(referralToken, 'neighbor_share_click', { channel: 'native', landingSource: 'coveragefit_report' });
          setFeedback(feedback, 'Thanks for sharing the review.', 'success');
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      const copied = await copyText(channelUrl, { navigator: navigatorRef, document: documentRef });
      if (copied) trackReferralEvent(referralToken, 'neighbor_share_click', { channel: 'native', landingSource: 'coveragefit_report' });
      setFeedback(feedback, copied
        ? 'Review link copied. It is ready to paste wherever you would like to share it.'
        : 'Use the review link below to share it manually.', copied ? 'success' : 'error');
    });

    copyButton?.addEventListener('click', async () => {
      const channelUrl = buildChannelUrl(shareUrl, 'copy');
      const copied = await copyText(channelUrl, { navigator: navigatorRef, document: documentRef });
      if (copied) trackReferralEvent(referralToken, 'neighbor_share_click', { channel: 'copy', landingSource: 'coveragefit_report' });
      setFeedback(feedback, copied ? 'Review link copied.' : 'Select the review link below to copy it.', copied ? 'success' : 'error');
    });

    dismissButton?.addEventListener('click', () => {
      dismiss(settings);
      section.hidden = true;
    });

    section.hidden = false;
    if (referral.ok && referralToken) {
      trackReferralEvent(referralToken, 'neighbor_share_view', { landingSource: 'coveragefit_report' });
    }
    return {
      ok: true,
      reportId,
      shareUrl,
      referralToken,
      uniqueReferral: referral.ok === true,
      fallbackReason: referral.ok ? '' : referral.reason
    };
  }

  function autoInitialize() {
    if (!root.document) return;
    const run = () => initialize().catch(() => {});
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  }

  const api = Object.freeze({
    VERSION,
    BUILD,
    RECEIPT_KEY,
    RECEIPT_TTL_MS,
    DEFAULT_SHARE_URL,
    REFERRAL_CREATE_ENDPOINT,
    REFERRAL_TOKEN_PATTERN,
    SHARE_CHANNELS,
    SHARE_TITLE,
    MESSAGE_PREFIX,
    normalizeShareUrl,
    buildMessage,
    buildChannelUrl,
    tokenFromUrl,
    buildSmsHref,
    isMobileDevice,
    markSuccessfulSubmission,
    readReceipt,
    writeReceipt,
    isEligible,
    referralAccessIsFresh,
    saveReferralAccess,
    ensureReferralLink,
    dismiss,
    copyText,
    trackReferralEvent,
    initialize
  });

  autoInitialize();
  return api;
});
