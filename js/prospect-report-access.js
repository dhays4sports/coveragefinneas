(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitProspectReports = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = '1.0';
  const CREATE_ENDPOINT = '/api/reports/create';
  const READ_ENDPOINT = '/api/reports/read';
  const LOCAL_STORE_KEY = 'coveragefit.privateReports.v1';
  const SERVER_ID_PATTERN = /^report_[A-Za-z0-9_-]{43}$/;
  const LOCAL_ID_PATTERN = /^local_[A-Za-z0-9_-]{24,80}$/;
  const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_LOCAL_REPORTS = 5;

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }

  function storage(options) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'storage')) return options.storage;
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function safeParse(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
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

  function now(options) {
    return options?.now instanceof Date ? options.now : new Date();
  }

  function readLocalStore(options) {
    const parsed = safeParse(getItem(storage(options), LOCAL_STORE_KEY), null);
    return parsed && parsed.schemaVersion === SCHEMA_VERSION && parsed.reports && typeof parsed.reports === 'object'
      ? parsed
      : { schemaVersion: SCHEMA_VERSION, updatedAt: '', reports: {} };
  }

  function writeLocalStore(storeValue, options) {
    const entries = Object.entries(storeValue.reports || {})
      .filter(([, value]) => value && typeof value === 'object')
      .sort((a, b) => String(b[1].createdAt || '').localeCompare(String(a[1].createdAt || '')))
      .slice(0, MAX_LOCAL_REPORTS);
    const normalized = {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now(options).toISOString(),
      reports: Object.fromEntries(entries)
    };
    return setItem(storage(options), LOCAL_STORE_KEY, JSON.stringify(normalized));
  }

  function reportIsReady(report) {
    const consumer = report?.consumer || {};
    const completion = report?.assessmentCompletion;
    const completionReady = !completion || (completion.scoreIsFinal !== false && Number(completion.missingRequiredCount || 0) === 0);
    return Boolean(
      report &&
      text(report.assessment, 'home').toLowerCase() === 'home' &&
      text(consumer.name || [consumer.firstName, consumer.lastName].filter(Boolean).join(' ')) &&
      text(consumer.email) &&
      Number.isFinite(Number(report.score)) &&
      completionReady
    );
  }

  function randomLocalId() {
    const bytes = new Uint8Array(24);
    try { root.crypto?.getRandomValues?.(bytes); }
    catch (_) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    let binary = '';
    bytes.forEach(value => { binary += String.fromCharCode(value); });
    const encoded = typeof root.btoa === 'function'
      ? root.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
      : Array.from(bytes).map(value => value.toString(16).padStart(2, '0')).join('');
    return `local_${encoded}`;
  }

  function cache(reportId, report, access, options) {
    const id = text(reportId);
    if (!(SERVER_ID_PATTERN.test(id) || LOCAL_ID_PATTERN.test(id)) || !report || typeof report !== 'object') return false;
    const target = readLocalStore(options);
    const createdAt = text(access?.createdAt, now(options).toISOString());
    const expiresAt = text(access?.expiresAt, new Date(now(options).getTime() + LOCAL_TTL_MS).toISOString());
    target.reports[id] = {
      createdAt,
      expiresAt,
      localOnly: Boolean(access?.localOnly || LOCAL_ID_PATTERN.test(id)),
      report: clone(report)
    };
    return writeLocalStore(target, options);
  }

  function removeLocal(reportId, options) {
    const target = readLocalStore(options);
    if (!Object.prototype.hasOwnProperty.call(target.reports, reportId)) return false;
    delete target.reports[reportId];
    return writeLocalStore(target, options);
  }

  function readLocal(reportId, options) {
    const target = readLocalStore(options);
    const entry = target.reports?.[reportId];
    if (!entry?.report) return { ok: false, code: 'report_unavailable' };
    const expiresAt = text(entry.expiresAt);
    if (!expiresAt || new Date(expiresAt).getTime() <= now(options).getTime()) {
      removeLocal(reportId, options);
      return { ok: false, code: 'report_expired', expiresAt };
    }
    return {
      ok: true,
      reportId,
      report: clone(entry.report),
      createdAt: text(entry.createdAt),
      expiresAt,
      durable: false,
      localOnly: Boolean(entry.localOnly),
      cached: true
    };
  }

  async function parseResponse(response) {
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (response.ok) return body || { ok: true };
    const error = new Error(text(body?.error?.message, `Request failed with status ${response.status}.`));
    error.code = text(body?.error?.code, 'request_failed');
    error.status = response.status;
    error.expiresAt = text(body?.error?.expiresAt);
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

  async function create(report, options) {
    const settings = options || {};
    if (!reportIsReady(report)) return { ok: false, code: 'invalid_report', message: 'A completed Home Protection Snapshot is required.' };
    try {
      const response = await requestWithTimeout(settings.endpoint || CREATE_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, website: text(settings.honeypot), report })
      }, Number(settings.timeoutMs) || 5000, settings.fetch);
      const body = await parseResponse(response);
      const id = text(body?.access?.id);
      const expiresAt = text(body?.access?.expiresAt);
      if (!SERVER_ID_PATTERN.test(id) || !expiresAt) throw Object.assign(new Error('The report service returned an invalid access record.'), { code: 'invalid_access_record' });
      cache(id, report, { ...body.access, localOnly: false }, settings);
      return { ok: true, reportId: id, createdAt: text(body.access.createdAt), expiresAt, durable: true, localOnly: false };
    } catch (error) {
      const id = randomLocalId();
      const createdAt = now(settings).toISOString();
      const expiresAt = new Date(now(settings).getTime() + LOCAL_TTL_MS).toISOString();
      cache(id, report, { createdAt, expiresAt, localOnly: true }, settings);
      return {
        ok: true,
        reportId: id,
        createdAt,
        expiresAt,
        durable: false,
        localOnly: true,
        warningCode: text(error?.code, 'storage_unavailable'),
        warningMessage: text(error?.message, 'The server-backed report could not be saved.')
      };
    }
  }

  async function retrieve(reportId, options) {
    const settings = options || {};
    const id = text(reportId);
    if (LOCAL_ID_PATTERN.test(id)) return readLocal(id, settings);
    if (!SERVER_ID_PATTERN.test(id)) return { ok: false, code: 'report_unavailable' };
    try {
      const response = await requestWithTimeout(settings.readEndpoint || READ_ENDPOINT, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reportId: id })
      }, Number(settings.timeoutMs) || 6500, settings.fetch);
      const body = await parseResponse(response);
      if (!body?.report) throw Object.assign(new Error('The private report response was incomplete.'), { code: 'invalid_report_response' });
      const access = body.access || {};
      cache(id, body.report, { ...access, localOnly: false }, settings);
      return {
        ok: true,
        reportId: id,
        report: clone(body.report),
        createdAt: text(access.createdAt),
        expiresAt: text(access.expiresAt),
        durable: true,
        localOnly: false,
        cached: false
      };
    } catch (error) {
      if (error?.code === 'report_expired' || error?.status === 410) {
        removeLocal(id, settings);
        return { ok: false, code: 'report_expired', expiresAt: text(error?.expiresAt), status: 410 };
      }
      if (error?.code === 'report_unavailable' || error?.status === 404) {
        removeLocal(id, settings);
        return { ok: false, code: 'report_unavailable', status: 404 };
      }
      const cached = readLocal(id, settings);
      if (cached.ok) return { ...cached, durable: true, localOnly: false, cached: true, warningCode: text(error?.code, 'storage_unavailable') };
      return { ok: false, code: text(error?.code, 'storage_unavailable'), status: Number(error?.status) || 0, message: text(error?.message) };
    }
  }

  function readIdFromLocation(locationValue) {
    const location = locationValue || root.location || {};
    try {
      const hash = text(location.hash).replace(/^#/, '');
      const hashParams = new URLSearchParams(hash);
      const fromHash = text(hashParams.get('report_id'));
      if (fromHash) return fromHash;
      const fromQuery = text(new URLSearchParams(location.search || '').get('report_id'));
      return fromQuery;
    } catch (_) { return ''; }
  }

  function buildUrl(reportId, reportPath) {
    const id = text(reportId);
    const path = text(reportPath, '/home/report/');
    return id ? `${path}#report_id=${encodeURIComponent(id)}` : path;
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    CREATE_ENDPOINT,
    READ_ENDPOINT,
    LOCAL_STORE_KEY,
    SERVER_ID_PATTERN,
    LOCAL_ID_PATTERN,
    reportIsReady,
    create,
    retrieve,
    cache,
    readLocal,
    removeLocal,
    readIdFromLocation,
    buildUrl
  });
});
