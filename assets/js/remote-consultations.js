(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitRemoteConsultations = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:remote-consultations-ready', {
      detail: { version: api.VERSION, schemaVersion: api.SCHEMA_VERSION }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.7.0';
  const SCHEMA_VERSION = '1.0';
  const SUBMIT_ENDPOINT = '/api/consultations/submit';
  const INBOX_ENDPOINT = '/api/consultations/inbox';
  const STATUS_ENDPOINT = '/api/consultations/status';
  const FOLLOW_UP_ENDPOINT = '/api/consultations/follow-up';
  const ACTIVITY_ENDPOINT = '/api/consultations/activity';
  const DISPOSITION_ENDPOINT = '/api/consultations/disposition';
  const RECOMMENDATIONS_ENDPOINT = '/api/consultations/recommendations';
  const COMPLETION_ENDPOINT = '/api/consultations/completion';
  const CHECKLIST_ENDPOINT = '/api/consultations/checklist';
  const TOKEN_KEY = 'coveragefit.producerInbox.token';
  const SYNCED_AT_KEY = 'coveragefit.producerInbox.syncedAt';
  const LAST_SUBMISSION_KEY = 'coveragefit.producerInbox.lastSubmission';
  const EVENTS = Object.freeze({
    SUBMITTED: 'coveragefit:remote-consultation-submitted',
    SYNCED: 'coveragefit:producer-inbox-synced',
    STATUS_CHANGED: 'coveragefit:producer-inbox-status-changed',
    FOLLOW_UP_CHANGED: 'coveragefit:producer-inbox-follow-up-changed',
    ACTIVITY_CHANGED: 'coveragefit:producer-inbox-activity-changed',
    DISPOSITION_CHANGED: 'coveragefit:producer-inbox-disposition-changed',
    RECOMMENDATIONS_CHANGED: 'coveragefit:producer-inbox-recommendations-changed',
    COMPLETION_CHANGED: 'coveragefit:producer-inbox-completion-changed',
    CHECKLIST_CHANGED: 'coveragefit:producer-inbox-checklist-changed',
    ERROR: 'coveragefit:producer-inbox-error'
  });

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
    try { return root.sessionStorage || null; } catch (_) { return null; }
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

  function dispatch(name, detail) {
    try {
      if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent(name, { detail: clone(detail) }));
    } catch (_) {}
  }

  async function parseResponse(response) {
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (response.ok) return body || { ok: true };
    const error = new Error(text(body?.error?.message, `Request failed with status ${response.status}.`));
    error.code = text(body?.error?.code, 'request_failed');
    error.status = response.status;
    throw error;
  }

  async function requestWithTimeout(url, options, timeoutMs, fetchImpl) {
    const fetcher = fetchImpl || root.fetch;
    if (typeof fetcher !== 'function') throw Object.assign(new Error('Fetch is unavailable.'), { code: 'fetch_unavailable' });
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetcher(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  function reportIsReady(report) {
    return Boolean(
      report &&
      report.assessment === 'home' &&
      /^consultation-[a-z0-9-]{6,80}$/i.test(text(report?.consultationRecord?.id)) &&
      text(report?.consumer?.name) &&
      text(report?.consumer?.email)
    );
  }

  async function submit(report, options) {
    const settings = options || {};
    if (!reportIsReady(report)) return { ok: false, skipped: true, reason: 'incomplete_record' };
    const target = storage(settings);
    try {
      const response = await requestWithTimeout(settings.endpoint || SUBMIT_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          website: text(settings.honeypot),
          record: report
        })
      }, Number(settings.timeoutMs) || 4500, settings.fetch);
      const body = await parseResponse(response);
      const result = {
        ok: true,
        recordId: text(body?.record?.id || report.consultationRecord.id),
        status: text(body?.record?.status, 'new'),
        deliveredAt: text(body?.record?.delivery?.deliveredAt),
        submittedAt: new Date().toISOString()
      };
      setItem(target, LAST_SUBMISSION_KEY, JSON.stringify(result));
      dispatch(EVENTS.SUBMITTED, result);
      return result;
    } catch (error) {
      const result = { ok: false, code: text(error?.code, 'submission_failed'), message: text(error?.message, 'Remote consultation submission failed.') };
      setItem(target, LAST_SUBMISSION_KEY, JSON.stringify(result));
      dispatch(EVENTS.ERROR, { operation: 'submit', ...result });
      return result;
    }
  }

  function getToken(options) {
    return text(getItem(storage(options), TOKEN_KEY));
  }

  function setToken(token, options) {
    const normalized = text(token);
    if (normalized.length < 24) return false;
    return setItem(storage(options), TOKEN_KEY, normalized);
  }

  function clearToken(options) {
    return removeItem(storage(options), TOKEN_KEY);
  }

  function getLastSyncedAt(options) {
    return text(getItem(storage(options), SYNCED_AT_KEY));
  }

  function recordsApi(options) {
    return options?.records || root.CoverageFitConsultationRecords || null;
  }

  function importRecords(remoteRecords, options) {
    const api = recordsApi(options);
    if (!api?.upsert) return { imported: 0, activeId: '' };
    const list = Array.isArray(remoteRecords) ? remoteRecords.slice() : [];
    const ordered = list.sort((a, b) => String(a.delivery?.deliveredAt || a.createdAt).localeCompare(String(b.delivery?.deliveredAt || b.createdAt)));
    let imported = 0;
    ordered.forEach(record => {
      if (!record?.report || !record?.id) return;
      const saved = api.upsert(record.report, {
        storage: options?.localStorage || root.localStorage,
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        remote: { ...record, syncedAt: new Date().toISOString() },
        dispatch: false
      });
      if (saved) imported += 1;
    });
    const newest = list.slice().sort((a, b) => String(b.delivery?.deliveredAt || b.createdAt).localeCompare(String(a.delivery?.deliveredAt || a.createdAt)))[0];
    if (newest?.id && api.select) api.select(newest.id, { storage: options?.localStorage || root.localStorage, dispatch: false });
    return { imported, activeId: text(newest?.id) };
  }

  async function sync(options) {
    const settings = options || {};
    const target = storage(settings);
    const token = text(settings.token || getToken(settings));
    if (token.length < 24) throw Object.assign(new Error('Enter the producer inbox access key.'), { code: 'missing_access_key' });
    const response = await requestWithTimeout(`${settings.endpoint || INBOX_ENDPOINT}?limit=${Math.min(100, Math.max(1, Number(settings.limit) || 50))}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
    }, Number(settings.timeoutMs) || 8000, settings.fetch);
    const body = await parseResponse(response);
    const imported = importRecords(body.records, settings);
    const syncedAt = new Date().toISOString();
    setItem(target, SYNCED_AT_KEY, syncedAt);
    const result = {
      ok: true,
      count: Number(body.count) || 0,
      counts: clone(body.counts) || {},
      imported: imported.imported,
      activeId: imported.activeId,
      syncedAt
    };
    dispatch(EVENTS.SYNCED, result);
    return result;
  }

  async function updateStatus(consultationId, status, options) {
    const settings = options || {};
    const id = text(consultationId);
    const targetStatus = text(status).toLowerCase();
    const token = text(settings.token || getToken(settings));
    if (!/^consultation-[a-z0-9-]{6,80}$/i.test(id)) throw Object.assign(new Error('A valid consultation record is required.'), { code: 'invalid_consultation_id' });
    if (!['opened', 'acknowledged'].includes(targetStatus)) throw Object.assign(new Error('Unsupported consultation status.'), { code: 'invalid_status' });
    if (token.length < 24) throw Object.assign(new Error('Connect the secure producer inbox first.'), { code: 'missing_access_key' });
    const response = await requestWithTimeout(settings.endpoint || STATUS_ENDPOINT, {
      method: 'PATCH',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consultationId: id, status: targetStatus })
    }, Number(settings.timeoutMs) || 6000, settings.fetch);
    const body = await parseResponse(response);
    const record = body?.record || null;
    const api = recordsApi(settings);
    if (record && api?.updateRemote) {
      api.updateRemote(id, record, {
        storage: settings.localStorage || root.localStorage,
        dispatch: settings.dispatch !== false
      });
    }
    const result = { ok: true, recordId: id, status: text(record?.status, targetStatus), record: clone(record) };
    dispatch(EVENTS.STATUS_CHANGED, result);
    return result;
  }

  function markOpened(consultationId, options) {
    return updateStatus(consultationId, 'opened', options);
  }

  function acknowledge(consultationId, options) {
    return updateStatus(consultationId, 'acknowledged', options);
  }

  async function updateFollowUp(consultationId, followUp, options) {
    const settings = options || {};
    const id = text(consultationId);
    const state = text(followUp?.state).toLowerCase();
    const token = text(settings.token || getToken(settings));
    if (!/^consultation-[a-z0-9-]{6,80}$/i.test(id)) throw Object.assign(new Error('A valid consultation record is required.'), { code: 'invalid_consultation_id' });
    if (!['none', 'scheduled', 'completed'].includes(state)) throw Object.assign(new Error('Unsupported follow-up state.'), { code: 'invalid_follow_up_state' });
    if (state === 'scheduled' && !/^\d{4}-\d{2}-\d{2}$/.test(text(followUp?.dueDate))) {
      throw Object.assign(new Error('Choose a valid follow-up date.'), { code: 'invalid_follow_up_date' });
    }
    if (token.length < 24) throw Object.assign(new Error('Connect the secure producer inbox first.'), { code: 'missing_access_key' });
    const response = await requestWithTimeout(settings.endpoint || FOLLOW_UP_ENDPOINT, {
      method: 'PATCH',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        consultationId: id,
        state,
        dueDate: text(followUp?.dueDate),
        note: text(followUp?.note).slice(0, 240)
      })
    }, Number(settings.timeoutMs) || 6000, settings.fetch);
    const body = await parseResponse(response);
    const record = body?.record || null;
    const api = recordsApi(settings);
    if (record && api?.updateRemote) {
      api.updateRemote(id, record, {
        storage: settings.localStorage || root.localStorage,
        dispatch: settings.dispatch !== false
      });
    }
    const result = { ok: true, recordId: id, followUp: clone(record?.followUp) || null, record: clone(record) };
    dispatch(EVENTS.FOLLOW_UP_CHANGED, result);
    return result;
  }

  function scheduleFollowUp(consultationId, dueDate, note, options) {
    return updateFollowUp(consultationId, { state: 'scheduled', dueDate, note }, options);
  }

  function completeFollowUp(consultationId, options) {
    return updateFollowUp(consultationId, { state: 'completed' }, options);
  }

  function clearFollowUp(consultationId, options) {
    return updateFollowUp(consultationId, { state: 'none' }, options);
  }


  async function updateActivity(consultationId, activity, options) {
    const settings = options || {};
    const id = text(consultationId);
    const type = text(activity?.type).toLowerCase();
    const note = text(activity?.note || activity?.detail).slice(0, 1000);
    const token = text(settings.token || getToken(settings));
    if (!/^consultation-[a-z0-9-]{6,80}$/i.test(id)) throw Object.assign(new Error('A valid consultation record is required.'), { code: 'invalid_consultation_id' });
    if (!['producer_note', 'consultation_document_opened', 'customer_report_opened'].includes(type)) throw Object.assign(new Error('Unsupported consultation activity.'), { code: 'invalid_activity_type' });
    if (type === 'producer_note' && !note) throw Object.assign(new Error('Enter a producer note before saving.'), { code: 'note_required' });
    if (token.length < 24) throw Object.assign(new Error('Connect the secure producer inbox first.'), { code: 'missing_access_key' });
    const response = await requestWithTimeout(settings.endpoint || ACTIVITY_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: type !== 'producer_note',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consultationId: id, type, note })
    }, Number(settings.timeoutMs) || 6000, settings.fetch);
    const body = await parseResponse(response);
    const record = body?.record || null;
    const api = recordsApi(settings);
    if (record && api?.updateRemote) {
      api.updateRemote(id, record, {
        storage: settings.localStorage || root.localStorage,
        dispatch: settings.dispatch !== false
      });
    }
    const result = { ok: true, recordId: id, notes: clone(record?.notes) || [], activity: clone(record?.activity) || [], record: clone(record) };
    dispatch(EVENTS.ACTIVITY_CHANGED, result);
    return result;
  }

  function addNote(consultationId, note, options) {
    return updateActivity(consultationId, { type: 'producer_note', note }, options);
  }

  function logActivity(consultationId, type, options) {
    return updateActivity(consultationId, { type }, options);
  }


  async function updateDisposition(consultationId, disposition, options) {
    const settings = options || {};
    const id = text(consultationId);
    const stage = text(disposition?.stage).toLowerCase();
    const outcome = text(disposition?.outcome, 'none').toLowerCase();
    const note = text(disposition?.note).slice(0, 240);
    const token = text(settings.token || getToken(settings));
    const stages = ['review_received', 'contact_attempted', 'consultation_scheduled', 'consultation_completed', 'proposal_prepared', 'decision_pending', 'closed'];
    const outcomes = ['none', 'policy_bound', 'current_carrier_retained', 'declined_price', 'declined_coverage', 'unable_to_reach', 'not_eligible', 'deferred'];
    if (!/^consultation-[a-z0-9-]{6,80}$/i.test(id)) throw Object.assign(new Error('A valid consultation record is required.'), { code: 'invalid_consultation_id' });
    if (!stages.includes(stage)) throw Object.assign(new Error('Choose a supported consultation stage.'), { code: 'invalid_consultation_stage' });
    if (!outcomes.includes(outcome)) throw Object.assign(new Error('Choose a supported consultation outcome.'), { code: 'invalid_consultation_outcome' });
    if (stage === 'closed' && outcome === 'none') throw Object.assign(new Error('Choose a final outcome before closing the consultation.'), { code: 'outcome_required' });
    if (stage !== 'closed' && outcome !== 'none') throw Object.assign(new Error('A final outcome can only be recorded when the consultation is closed.'), { code: 'outcome_requires_closed_stage' });
    if (token.length < 24) throw Object.assign(new Error('Connect the secure producer inbox first.'), { code: 'missing_access_key' });
    const response = await requestWithTimeout(settings.endpoint || DISPOSITION_ENDPOINT, {
      method: 'PATCH',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consultationId: id, stage, outcome, note })
    }, Number(settings.timeoutMs) || 6000, settings.fetch);
    const body = await parseResponse(response);
    const record = body?.record || null;
    const api = recordsApi(settings);
    if (record && api?.updateRemote) {
      api.updateRemote(id, record, {
        storage: settings.localStorage || root.localStorage,
        dispatch: settings.dispatch !== false
      });
    }
    const result = { ok: true, recordId: id, disposition: clone(record?.disposition) || null, record: clone(record) };
    dispatch(EVENTS.DISPOSITION_CHANGED, result);
    return result;
  }

  async function updateRecommendationPlan(consultationId, recommendationPlan, options) {
    const settings = options || {};
    const id = text(consultationId);
    const token = text(settings.token || getToken(settings));
    if (!/^consultation-[a-z0-9-]{6,80}$/i.test(id)) throw Object.assign(new Error('A valid consultation record is required.'), { code: 'invalid_consultation_id' });
    if (!recommendationPlan || !Array.isArray(recommendationPlan.items) || !recommendationPlan.items.length) {
      throw Object.assign(new Error('A structured recommendation plan is required.'), { code: 'invalid_recommendation_plan' });
    }
    if (token.length < 24) throw Object.assign(new Error('Connect the secure producer inbox first.'), { code: 'missing_access_key' });
    const response = await requestWithTimeout(settings.endpoint || RECOMMENDATIONS_ENDPOINT, {
      method: 'PATCH',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consultationId: id, recommendationPlan })
    }, Number(settings.timeoutMs) || 6000, settings.fetch);
    const body = await parseResponse(response);
    const record = body?.record || null;
    const api = recordsApi(settings);
    if (record && api?.updateRemote) {
      api.updateRemote(id, record, {
        storage: settings.localStorage || root.localStorage,
        dispatch: settings.dispatch !== false
      });
    }
    const result = { ok: true, recordId: id, recommendationPlan: clone(record?.recommendationPlan) || null, record: clone(record) };
    dispatch(EVENTS.RECOMMENDATIONS_CHANGED, result);
    return result;
  }

  async function updateCompletion(consultationId, completion, options) {
    const settings = options || {};
    const id = text(consultationId);
    const token = text(settings.token || getToken(settings));
    if (!/^consultation-[a-z0-9-]{6,80}$/i.test(id)) throw Object.assign(new Error('A valid consultation record is required.'), { code: 'invalid_consultation_id' });
    if (!completion || typeof completion !== 'object') throw Object.assign(new Error('A structured completion record is required.'), { code: 'invalid_completion' });
    if (token.length < 24) throw Object.assign(new Error('Connect the secure producer inbox first.'), { code: 'missing_access_key' });
    const response = await requestWithTimeout(settings.endpoint || COMPLETION_ENDPOINT, {
      method: 'PATCH',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consultationId: id, completion })
    }, Number(settings.timeoutMs) || 6000, settings.fetch);
    const body = await parseResponse(response);
    const record = body?.record || null;
    const api = recordsApi(settings);
    if (record && api?.updateRemote) api.updateRemote(id, record, { storage: settings.localStorage || root.localStorage, dispatch: settings.dispatch !== false });
    const result = { ok: true, recordId: id, completion: clone(record?.completion) || null, record: clone(record) };
    dispatch(EVENTS.COMPLETION_CHANGED, result);
    return result;
  }

  async function updateChecklistProgress(consultationId, checklistProgress, options) {
    const settings = options || {};
    const id = text(consultationId);
    const token = text(settings.token || getToken(settings));
    if (!/^consultation-[a-z0-9-]{6,80}$/i.test(id)) throw Object.assign(new Error('A valid consultation record is required.'), { code: 'invalid_consultation_id' });
    if (!checklistProgress || checklistProgress.storageSchemaVersion !== '1.0' || !Array.isArray(checklistProgress.items) || !checklistProgress.items.length) {
      throw Object.assign(new Error('A structured checklist progress record is required.'), { code: 'invalid_checklist_progress' });
    }
    if (token.length < 24) throw Object.assign(new Error('Connect the secure producer inbox first.'), { code: 'missing_access_key' });
    const response = await requestWithTimeout(settings.endpoint || CHECKLIST_ENDPOINT, {
      method: 'PATCH',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: settings.keepalive === true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consultationId: id, checklistProgress })
    }, Number(settings.timeoutMs) || 6000, settings.fetch);
    const body = await parseResponse(response);
    const record = body?.record || null;
    const api = recordsApi(settings);
    if (record && api?.updateRemote) api.updateRemote(id, record, { storage: settings.localStorage || root.localStorage, dispatch: settings.dispatch !== false });
    const result = { ok: true, stale: body?.stale === true, recordId: id, checklistProgress: clone(record?.checklistProgress) || null, record: clone(record) };
    dispatch(EVENTS.CHECKLIST_CHANGED, result);
    return result;
  }

  function connection(options) {
    return {
      connected: getToken(options).length >= 24,
      lastSyncedAt: getLastSyncedAt(options)
    };
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    SUBMIT_ENDPOINT,
    INBOX_ENDPOINT,
    STATUS_ENDPOINT,
    FOLLOW_UP_ENDPOINT,
    ACTIVITY_ENDPOINT,
    DISPOSITION_ENDPOINT,
    RECOMMENDATIONS_ENDPOINT,
    COMPLETION_ENDPOINT,
    CHECKLIST_ENDPOINT,
    TOKEN_KEY,
    SYNCED_AT_KEY,
    LAST_SUBMISSION_KEY,
    EVENTS,
    reportIsReady,
    submit,
    getToken,
    setToken,
    clearToken,
    getLastSyncedAt,
    importRecords,
    sync,
    updateStatus,
    markOpened,
    acknowledge,
    updateFollowUp,
    scheduleFollowUp,
    completeFollowUp,
    clearFollowUp,
    updateActivity,
    addNote,
    logActivity,
    updateDisposition,
    updateRecommendationPlan,
    updateCompletion,
    updateChecklistProgress,
    connection
  });
});
