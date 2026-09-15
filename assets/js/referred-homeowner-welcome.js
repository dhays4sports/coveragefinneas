(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitReferredHomeownerWelcome = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.3.0';
  const BUILD = 'NP-1.5';
  const PARAMETER = 'ref';
  const PARAMETER_VALUE = 'neighbor';
  const TOKEN_PARAMETER = 'rid';
  const SHARE_PARAMETER = 'share';
  const REFERRAL_TOKEN_PATTERN = /^ref_[A-Za-z0-9_-]{16}$/;
  const SHARE_CHANNELS = Object.freeze(['sms', 'native', 'copy']);
  const VALIDATE_ENDPOINT = '/api/referrals/read';
  const STORAGE_KEY = 'coveragefit.neighborReferral.entry.v1';
  const ENTRY_TTL_MS = 6 * 60 * 60 * 1000;
  const HOME_PATHS = Object.freeze(['/home', '/home/']);
  const ASSESSMENT_PATH = '/assessment/';
  const CLEANUP_KEYS = Object.freeze([
    PARAMETER, TOKEN_PARAMETER, SHARE_PARAMETER, 'bridge', 'source', 'entry', 'campaign',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'creative'
  ]);

  const COPY = Object.freeze({
    title: 'A Neighbor Shared This Home Coverage Review With You | CoverageFit',
    kicker: 'Shared by a homeowner',
    status: 'A neighbor shared this review with you',
    statusDetail: 'They thought this five-minute home coverage review might be useful.',
    context: 'Neighbor-shared review',
    headingMain: 'A Neighbor Shared This',
    headingHighlight: 'Home Coverage Review With You.',
    lead: 'Every home is rated differently.',
    body: 'Complete the short review, and Dylan will personally evaluate your property, coverage needs, and available bundle opportunities.',
    note: 'You’re not requesting an instant quote. You’re starting with a five-minute Coverage Review so the next conversation can be based on your needs.',
    cta: 'Start My 5-Minute Review',
    ctaContext: 'No policy information required. No obligation.'
  });

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function now(options) {
    if (options?.now instanceof Date) return options.now;
    if (typeof options?.now === 'number') return new Date(options.now);
    return new Date();
  }

  function storage(options) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'storage')) return options.storage;
    try { return root.sessionStorage || null; } catch (_) { return null; }
  }

  function safeParse(value) {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
  }

  function getItem(target, key) {
    try { return target?.getItem?.(key) || ''; } catch (_) { return ''; }
  }

  function setItem(target, key, value) {
    try { target?.setItem?.(key, String(value)); return true; } catch (_) { return false; }
  }

  function removeItem(target, key) {
    try { target?.removeItem?.(key); return true; } catch (_) { return false; }
  }

  function isHomePath(pathname) {
    return HOME_PATHS.includes(text(pathname));
  }

  function readExplicitReferral(search) {
    const query = text(search);
    let params;
    try { params = new URLSearchParams(query); } catch (_) { return Object.freeze({ present: false, valid: false }); }
    const values = params.getAll(PARAMETER);
    if (!values.length) return Object.freeze({ present: false, valid: false });
    const validReferral = values.length === 1 && values[0] === PARAMETER_VALUE;
    if (!validReferral) return Object.freeze({ present: true, valid: false });

    const tokenValues = params.getAll(TOKEN_PARAMETER);
    const tokenPresent = tokenValues.length > 0;
    const token = tokenValues.length === 1 ? text(tokenValues[0]) : '';
    const tokenValid = !tokenPresent || (tokenValues.length === 1 && REFERRAL_TOKEN_PATTERN.test(token));
    const shareValues = params.getAll(SHARE_PARAMETER);
    const shareChannel = shareValues.length === 1 && SHARE_CHANNELS.includes(text(shareValues[0])) ? text(shareValues[0]) : '';

    return Object.freeze({
      present: true,
      valid: true,
      tokenPresent,
      tokenValid,
      token: tokenValid ? token : '',
      shareChannel
    });
  }

  function createEntry(options) {
    const explicit = options?.explicit || {};
    const hasValidToken = explicit.tokenPresent === true && explicit.tokenValid === true && REFERRAL_TOKEN_PATTERN.test(text(explicit.token));
    return Object.freeze({
      schemaVersion: '1.2',
      source: 'neighbor-share',
      referralType: PARAMETER_VALUE,
      receivedAt: now(options).toISOString(),
      referralToken: hasValidToken ? text(explicit.token) : '',
      referralId: '',
      tokenStatus: hasValidToken ? 'pending' : 'generic',
      shareChannel: SHARE_CHANNELS.includes(text(explicit.shareChannel)) ? text(explicit.shareChannel) : ''
    });
  }

  function writeEntry(options) {
    const entry = createEntry(options);
    return setItem(storage(options), STORAGE_KEY, JSON.stringify(entry)) ? entry : null;
  }

  function readEntry(options) {
    const entry = safeParse(getItem(storage(options), STORAGE_KEY));
    if (!entry || !['1.0', '1.1', '1.2'].includes(entry.schemaVersion) || entry.referralType !== PARAMETER_VALUE) return null;
    return {
      ...entry,
      schemaVersion: '1.2',
      referralToken: REFERRAL_TOKEN_PATTERN.test(text(entry.referralToken)) ? text(entry.referralToken) : '',
      referralId: /^nref_[a-f0-9]{24}$/.test(text(entry.referralId)) ? text(entry.referralId) : '',
      tokenStatus: ['pending', 'valid', 'generic'].includes(text(entry.tokenStatus)) ? text(entry.tokenStatus) : 'generic',
      shareChannel: SHARE_CHANNELS.includes(text(entry.shareChannel)) ? text(entry.shareChannel) : ''
    };
  }

  function entryIsFresh(entry, options) {
    const receivedAt = Date.parse(entry?.receivedAt || '');
    const age = now(options).getTime() - receivedAt;
    return Number.isFinite(receivedAt) && age >= 0 && age <= ENTRY_TTL_MS;
  }

  function clear(options) {
    return removeItem(storage(options), STORAGE_KEY);
  }


  function cleanVisibleUrl(options) {
    const settings = options || {};
    const locationRef = settings.location || root.location || {};
    const historyRef = settings.history || root.history || {};
    if (!isHomePath(locationRef.pathname) || typeof historyRef.replaceState !== 'function') return false;
    let params;
    try { params = new URLSearchParams(text(locationRef.search)); } catch (_) { return false; }
    let changed = false;
    CLEANUP_KEYS.forEach((key) => {
      if (params.has(key)) {
        params.delete(key);
        changed = true;
      }
    });
    if (!changed) return false;
    const query = params.toString();
    const cleanUrl = `${locationRef.pathname}${query ? `?${query}` : ''}${text(locationRef.hash)}`;
    try {
      historyRef.replaceState(historyRef.state || null, '', cleanUrl);
      return cleanUrl;
    } catch (_) {
      return false;
    }
  }

  function resolveState(options) {
    const settings = options || {};
    const locationRef = settings.location || root.location || {};
    if (!isHomePath(locationRef.pathname)) return Object.freeze({ active: false, reason: 'not_home' });

    const explicit = readExplicitReferral(locationRef.search);
    if (explicit.present) {
      if (!explicit.valid) {
        clear(settings);
        return Object.freeze({ active: false, reason: 'invalid_parameter' });
      }
      const entry = writeEntry({ ...settings, explicit }) || createEntry({ ...settings, explicit });
      return Object.freeze({
        active: true,
        reason: explicit.tokenPresent && !explicit.tokenValid ? 'invalid_token_fallback' : 'valid_parameter',
        entry
      });
    }

    const entry = readEntry(settings);
    if (!entry || !entryIsFresh(entry, settings)) {
      if (entry) clear(settings);
      return Object.freeze({ active: false, reason: entry ? 'expired_session' : 'missing_parameter' });
    }
    return Object.freeze({ active: true, reason: 'session_restored', entry });
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

  async function validateReferralToken(token, options) {
    const settings = options || {};
    const candidate = text(token);
    if (!REFERRAL_TOKEN_PATTERN.test(candidate)) return { valid: false, reason: 'invalid_token' };
    const fetcher = settings.fetch || root.fetch;
    if (typeof fetcher !== 'function') return { valid: false, reason: 'validation_unavailable' };
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    if (controller) timer = setTimeout(() => controller.abort(), Number(settings.timeoutMs) || 4000);
    try {
      const response = await fetcher(settings.validateEndpoint || VALIDATE_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token: candidate }),
        ...(controller ? { signal: controller.signal } : {})
      });
      const body = await parseResponse(response);
      const referral = body?.referral || {};
      if (referral.token !== candidate || referral.referralType !== PARAMETER_VALUE || !/^nref_[a-f0-9]{24}$/.test(text(referral.id))) return { valid: false, reason: 'invalid_response' };
      return {
        valid: true,
        id: text(referral.id),
        token: candidate,
        createdAt: text(referral.createdAt),
        expiresAt: text(referral.expiresAt)
      };
    } catch (error) {
      return { valid: false, reason: text(error?.code, 'validation_unavailable') };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  async function settleReferralToken(entry, options) {
    const current = entry || readEntry(options);
    if (!current || current.tokenStatus !== 'pending' || !REFERRAL_TOKEN_PATTERN.test(text(current.referralToken))) {
      return { valid: current?.tokenStatus === 'valid', entry: current || null, reason: current ? 'not_pending' : 'missing_entry' };
    }
    const result = await validateReferralToken(current.referralToken, options);
    const settledAt = now(options).toISOString();
    const next = result.valid
      ? {
          ...current,
          schemaVersion: '1.2',
          tokenStatus: 'valid',
          referralId: text(result.id),
          validatedAt: settledAt,
          referralExpiresAt: text(result.expiresAt)
        }
      : {
          ...current,
          schemaVersion: '1.2',
          referralToken: '',
          referralId: '',
          tokenStatus: 'generic',
          validatedAt: settledAt,
          validationReason: text(result.reason, 'referral_unavailable')
        };
    setItem(storage(options), STORAGE_KEY, JSON.stringify(next));
    return { valid: result.valid, entry: next, reason: result.valid ? 'validated' : text(result.reason, 'referral_unavailable') };
  }

  function select(documentRef, selector) {
    return documentRef?.querySelector?.(selector) || null;
  }

  function setText(node, value) {
    if (node) node.textContent = text(value);
  }

  function setHidden(node, hidden) {
    if (node) node.hidden = Boolean(hidden);
  }

  function render(options) {
    const settings = options || {};
    const documentRef = settings.document || root.document;
    const state = resolveState(settings);
    if (!documentRef || !state.active) return Object.freeze({ rendered: false, state });
    if (state.reason === 'valid_parameter' || state.reason === 'invalid_token_fallback') cleanVisibleUrl(settings);

    const rootElement = documentRef.documentElement;
    const welcome = select(documentRef, '[data-hero-journey-context]');
    const welcomeIcon = select(documentRef, '.personalized-welcome-icon');
    const status = documentRef.getElementById?.('personalizedWelcomeStatus') || null;
    const detail = documentRef.getElementById?.('personalizedWelcomeDetail') || null;
    const contextReason = select(documentRef, '[data-welcome-context-reason]');
    const contextProperty = select(documentRef, '[data-welcome-context-property]');
    const kicker = select(documentRef, '[data-welcome-kicker]');
    const headingMain = select(documentRef, '[data-welcome-heading-main]');
    const headingHighlight = select(documentRef, '[data-welcome-heading-highlight]');
    const lead = select(documentRef, '[data-welcome-lead]');
    const body = select(documentRef, '[data-welcome-copy]');
    const note = select(documentRef, '[data-welcome-note]');
    const cta = select(documentRef, '[data-welcome-cta]');
    const ctaContext = select(documentRef, '[data-welcome-cta-context]');
    const dashboard = select(documentRef, '[data-home-dashboard]');
    const defaultArt = select(documentRef, '[data-home-default-art]');

    const required = [welcome, status, detail, kicker, headingMain, headingHighlight, lead, body, note, cta];
    if (required.some(node => !node)) return Object.freeze({ rendered: false, state, reason: 'markup_incomplete' });

    documentRef.title = COPY.title;
    if (rootElement?.dataset) {
      rootElement.dataset.welcomeState = 'referred';
      rootElement.dataset.referralState = 'neighbor';
      rootElement.dataset.referralTokenState = state.entry?.tokenStatus || 'generic';
    }

    setText(welcomeIcon, '↗');
    setText(status, COPY.status);
    setText(detail, COPY.statusDetail);
    setText(contextReason, COPY.context);
    setHidden(contextReason, false);
    setText(contextProperty, '');
    setHidden(contextProperty, true);
    setHidden(welcome, false);
    if (welcome?.dataset) welcome.dataset.componentState = 'referred';

    setText(kicker, COPY.kicker);
    kicker.setAttribute?.('aria-label', 'Referral source: neighbor-shared review');
    setText(headingMain, COPY.headingMain);
    setText(headingHighlight, COPY.headingHighlight);
    setText(lead, COPY.lead);
    setText(body, COPY.body);
    setText(note, COPY.note);
    setText(cta, COPY.cta);
    cta.href = ASSESSMENT_PATH;
    cta.setAttribute?.('aria-label', COPY.cta);
    setText(ctaContext, COPY.ctaContext);
    setHidden(ctaContext, false);

    setHidden(dashboard, true);
    setHidden(defaultArt, false);

    const validation = state.entry?.tokenStatus === 'pending'
      ? settleReferralToken(state.entry, settings)
      : Promise.resolve({ valid: state.entry?.tokenStatus === 'valid', entry: state.entry, reason: 'not_pending' });
    root.COVERAGEFIT_REFERRAL_VALIDATION = validation;

    const result = Object.freeze({
      rendered: true,
      state,
      referralType: PARAMETER_VALUE,
      assessmentPath: ASSESSMENT_PATH,
      validation
    });
    root.CoverageFitNeighborWelcome = result;
    return result;
  }

  return Object.freeze({
    VERSION,
    BUILD,
    PARAMETER,
    PARAMETER_VALUE,
    TOKEN_PARAMETER,
    SHARE_PARAMETER,
    REFERRAL_TOKEN_PATTERN,
    SHARE_CHANNELS,
    VALIDATE_ENDPOINT,
    STORAGE_KEY,
    ENTRY_TTL_MS,
    HOME_PATHS,
    ASSESSMENT_PATH,
    CLEANUP_KEYS,
    COPY,
    isHomePath,
    readExplicitReferral,
    createEntry,
    writeEntry,
    readEntry,
    entryIsFresh,
    clear,
    cleanVisibleUrl,
    resolveState,
    validateReferralToken,
    settleReferralToken,
    render
  });
});
