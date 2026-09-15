(() => {
  'use strict';

  const VERSION = '1.2';
  const STORAGE_KEY = 'coveragefit_attribution_v1';
  const SESSION_KEY = 'coveragefit_attribution_session_v1';
  const SESSION_ID_KEY = 'coveragefit_session_id_v1';
  const ALLOWED = [
    'campaign','campaign_id','campaign_variant','campaign_zip','source','entry','assessment','medium','ref','creative','adset','ad',
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','gbraid','wbraid','gclsrc'
  ];

  const clean = (value, max = 160) => String(value || '')
    .trim()
    .replace(/[<>\u0000-\u001F\u007F]/g, '')
    .slice(0, max);

  const readJSON = (storage, key) => {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
  };

  const writeJSON = (storage, key, value) => {
    try { storage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  const makeId = () => {
    try {
      const cryptoApi = typeof window !== 'undefined' ? window.crypto : null;
      if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    } catch (_) {}
    return `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  };

  let sessionId = '';
  try { sessionId = sessionStorage.getItem(SESSION_ID_KEY) || ''; } catch (_) {}
  if (!sessionId) {
    sessionId = makeId();
    try { sessionStorage.setItem(SESSION_ID_KEY, sessionId); } catch (_) {}
  }

  const params = new URLSearchParams(location.search);
  let incoming = {};
  ALLOWED.forEach((key) => {
    const value = clean(params.get(key));
    if (value) incoming[key] = value;
  });
  if (window.CoverageFitCampaignIdentifiers?.apply) {
    incoming = window.CoverageFitCampaignIdentifiers.apply(incoming);
  }

  const now = new Date().toISOString();
  const landing = {
    path: location.pathname,
    url: `${location.origin}${location.pathname}`,
    referrer: clean(document.referrer, 300)
  };

  const existingFirst = readJSON(localStorage, STORAGE_KEY);
  const existingSession = readJSON(sessionStorage, SESSION_KEY);
  const hasIncoming = Object.keys(incoming).length > 0;

  const firstTouch = existingFirst || {
    version: VERSION,
    sessionId,
    capturedAt: now,
    ...landing,
    ...incoming
  };

  if (!existingFirst) writeJSON(localStorage, STORAGE_KEY, firstTouch);

  const lastTouch = {
    version: VERSION,
    sessionId,
    capturedAt: hasIncoming ? now : (existingSession?.lastTouch?.capturedAt || firstTouch.capturedAt),
    ...landing,
    ...(existingSession?.lastTouch || {}),
    ...(hasIncoming ? incoming : {})
  };

  const session = {
    version: VERSION,
    sessionId,
    firstTouch,
    lastTouch,
    currentPath: location.pathname,
    updatedAt: now
  };
  writeJSON(sessionStorage, SESSION_KEY, session);

  const compact = () => ({
    version: VERSION,
    sessionId,
    firstTouch: { ...firstTouch },
    lastTouch: { ...lastTouch },
    currentPath: location.pathname,
    updatedAt: new Date().toISOString()
  });

  const current = () => {
    const data = compact();
    return {
      sessionId: data.sessionId,
      campaign: data.lastTouch.campaign || data.firstTouch.campaign || '',
      campaignId: data.lastTouch.campaign_id || data.firstTouch.campaign_id || '',
      campaignVariant: data.lastTouch.campaign_variant || data.firstTouch.campaign_variant || '',
      campaignZip: data.lastTouch.campaign_zip || data.firstTouch.campaign_zip || '',
      source: data.lastTouch.source || data.lastTouch.utm_source || data.firstTouch.source || data.firstTouch.utm_source || 'direct',
      entry: data.lastTouch.entry || data.firstTouch.entry || data.firstTouch.path || '',
      assessment: data.lastTouch.assessment || data.firstTouch.assessment || '',
      medium: data.lastTouch.medium || data.lastTouch.utm_medium || data.firstTouch.medium || data.firstTouch.utm_medium || '',
      clickIds: {
        gclid: data.lastTouch.gclid || data.firstTouch.gclid || '',
        gbraid: data.lastTouch.gbraid || data.firstTouch.gbraid || '',
        wbraid: data.lastTouch.wbraid || data.firstTouch.wbraid || '',
        gclsrc: data.lastTouch.gclsrc || data.firstTouch.gclsrc || ''
      },
      utm: {
        source: data.lastTouch.utm_source || data.firstTouch.utm_source || '',
        medium: data.lastTouch.utm_medium || data.firstTouch.utm_medium || '',
        campaign: data.lastTouch.utm_campaign || data.firstTouch.utm_campaign || '',
        term: data.lastTouch.utm_term || data.firstTouch.utm_term || '',
        content: data.lastTouch.utm_content || data.firstTouch.utm_content || ''
      },
      firstTouch: data.firstTouch,
      lastTouch: data.lastTouch
    };
  };

  const ensureHidden = (form, name, value) => {
    let input = form.querySelector(`input[name="${name}"]`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.appendChild(input);
    }
    input.value = value || '';
  };

  const enrichForm = (form) => {
    if (!form) return;
    const value = current();
    ensureHidden(form, 'cf_session_id', value.sessionId);
    ensureHidden(form, 'campaign', value.campaign);
    ensureHidden(form, 'campaign_id', value.campaignId);
    ensureHidden(form, 'campaign_variant', value.campaignVariant);
    ensureHidden(form, 'campaign_zip', value.campaignZip);
    ensureHidden(form, 'campaign_source', value.source);
    ensureHidden(form, 'campaign_entry', value.entry);
    ensureHidden(form, 'campaign_medium', value.medium);
    ensureHidden(form, 'utm_source', value.utm.source);
    ensureHidden(form, 'utm_medium', value.utm.medium);
    ensureHidden(form, 'utm_campaign', value.utm.campaign);
    ensureHidden(form, 'utm_term', value.utm.term);
    ensureHidden(form, 'utm_content', value.utm.content);
    ensureHidden(form, 'gclid', value.clickIds.gclid);
    ensureHidden(form, 'gbraid', value.clickIds.gbraid);
    ensureHidden(form, 'wbraid', value.clickIds.wbraid);
    ensureHidden(form, 'gclsrc', value.clickIds.gclsrc);
    ensureHidden(form, 'attribution_payload', JSON.stringify(compact()));
  };

  const decorateUrl = (url, overrides = {}) => {
    const target = new URL(url, location.origin);
    const value = current();
    const fields = {
      campaign: value.campaign,
      campaign_id: value.campaignId,
      campaign_variant: value.campaignVariant,
      campaign_zip: value.campaignZip,
      source: value.source,
      entry: value.entry,
      assessment: value.assessment,
      utm_source: value.utm.source,
      utm_medium: value.utm.medium,
      utm_campaign: value.utm.campaign,
      utm_term: value.utm.term,
      utm_content: value.utm.content,
      gclid: value.clickIds.gclid,
      gbraid: value.clickIds.gbraid,
      wbraid: value.clickIds.wbraid,
      gclsrc: value.clickIds.gclsrc,
      ...overrides
    };
    Object.entries(fields).forEach(([key, val]) => {
      if (val && !target.searchParams.has(key)) target.searchParams.set(key, val);
    });
    return target.toString();
  };

  window.CoverageFitAttribution = {
    version: VERSION,
    get: current,
    getPayload: compact,
    enrichForm,
    decorateUrl,
    clear() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_ID_KEY); } catch (_) {}
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('form').forEach(enrichForm);
  });
})();
