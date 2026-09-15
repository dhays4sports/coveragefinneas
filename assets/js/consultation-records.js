(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitConsultationRecords = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:consultation-records-ready', {
      detail: { version: api.VERSION, schemaVersion: api.SCHEMA_VERSION }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.7.0';
  const SCHEMA_VERSION = '1.0';
  const STORE_KEY = 'coveragefit.consultations.v1';
  const ACTIVE_KEY = 'coveragefit.consultations.active';
  const MAX_RECORDS = 25;
  const REMOTE_STATUSES = Object.freeze(['new', 'opened', 'acknowledged']);
  const CONSULTATION_STAGES = Object.freeze(['review_received', 'contact_attempted', 'consultation_scheduled', 'consultation_completed', 'proposal_prepared', 'decision_pending', 'closed']);
  const CONSULTATION_OUTCOMES = Object.freeze(['none', 'policy_bound', 'current_carrier_retained', 'declined_price', 'declined_coverage', 'unable_to_reach', 'not_eligible', 'deferred']);
  const RECOMMENDATION_DECISIONS = Object.freeze(['undecided', 'consider', 'recommend', 'defer', 'not_recommended']);
  const STATUS_RANK = Object.freeze({ ready: 0, new: 1, opened: 2, acknowledged: 3 });
  const EVENTS = Object.freeze({
    CREATED: 'coveragefit:consultation-record-created',
    SELECTED: 'coveragefit:consultation-record-selected',
    UPDATED: 'coveragefit:consultation-record-updated'
  });

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function safeParse(value) {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
  }

  function storage(options) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'storage')) return options.storage;
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function storageGet(target, key) {
    try { return target?.getItem?.(key) || null; } catch (_) { return null; }
  }

  function storageSet(target, key, value) {
    try { target?.setItem?.(key, value); return true; } catch (_) { return false; }
  }

  function hash(value) {
    const input = String(value || '');
    let result = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      result ^= input.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function nowIso(options) {
    if (typeof options?.now === 'function') return options.now().toISOString();
    return new Date().toISOString();
  }

  function normalizeStatus(value, fallback) {
    const normalized = text(value).toLowerCase();
    if (normalized === 'ready') return fallback || 'ready';
    return REMOTE_STATUSES.includes(normalized) ? normalized : (fallback || 'ready');
  }

  function mergeStatus(left, right) {
    const a = normalizeStatus(left, 'ready');
    const b = normalizeStatus(right, 'ready');
    return (STATUS_RANK[b] || 0) > (STATUS_RANK[a] || 0) ? b : a;
  }

  function emptyStore() {
    return { schemaVersion: SCHEMA_VERSION, updatedAt: '', records: [] };
  }

  function readStore(options) {
    const parsed = safeParse(storageGet(storage(options), STORE_KEY));
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.records)) return emptyStore();
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: text(parsed.updatedAt),
      records: parsed.records.filter(record => record && typeof record === 'object' && text(record.id))
    };
  }

  function reportCustomer(report) {
    const prospect = report?.prospectProfile || {};
    const consumer = report?.consumer || {};
    const profile = report?.profile || {};
    const name = text(consumer.name) || text(prospect.fullName) || text(profile.name) ||
      [consumer.firstName || prospect.firstName || profile.firstName, consumer.lastName || prospect.lastName || profile.lastName]
        .filter(Boolean).join(' ').trim();
    return {
      name: name || 'Not provided',
      firstName: text(consumer.firstName || prospect.firstName || profile.firstName),
      lastName: text(consumer.lastName || prospect.lastName || profile.lastName),
      email: text(consumer.email || prospect.email || profile.email),
      phone: text(consumer.phone || prospect.phone || profile.phone),
      propertyAddress: text(consumer.propertyAddress || prospect.propertyAddress || prospect?.address?.formattedAddress),
      reviewContext: text(consumer.reviewContext || report?.reviewContext || prospect.reviewContext, 'General coverage review')
    };
  }

  function createId(report, options) {
    const supplied = text(options?.id || report?.consultationRecord?.id);
    if (supplied && /^consultation-[a-z0-9-]{6,80}$/i.test(supplied)) return supplied;
    const integration = report?.integration || {};
    const customer = reportCustomer(report);
    const seed = [
      text(report?.assessment, 'home'),
      text(integration.sessionId || report?.attribution?.sessionId),
      text(report?.createdAt, nowIso(options)),
      customer.email,
      customer.propertyAddress
    ].join('|');
    return `consultation-${hash(seed)}`;
  }

  function normalizeFollowUp(source, fallback) {
    const current = source?.followUp && typeof source.followUp === 'object' ? source.followUp : {};
    const previous = fallback && typeof fallback === 'object' ? fallback : {};
    const stateValue = text(current.state, text(previous.state, 'none')).toLowerCase();
    const state = ['none', 'scheduled', 'completed'].includes(stateValue) ? stateValue : 'none';
    const dueDate = state === 'none' ? '' : text(current.dueDate, text(previous.dueDate));
    return {
      state,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : '',
      note: state === 'none' ? '' : text(current.note, text(previous.note)).slice(0, 240),
      scheduledAt: state === 'none' ? '' : text(current.scheduledAt, text(previous.scheduledAt)),
      completedAt: state === 'completed' ? text(current.completedAt, text(previous.completedAt)) : '',
      updatedAt: text(current.updatedAt, text(previous.updatedAt))
    };
  }




  function normalizeDisposition(source, fallback) {
    const current = source?.disposition && typeof source.disposition === 'object' ? source.disposition : (source && typeof source === 'object' ? source : {});
    const previous = fallback && typeof fallback === 'object' ? fallback : {};
    const stageValue = text(current.stage, text(previous.stage, 'review_received')).toLowerCase();
    const stage = CONSULTATION_STAGES.includes(stageValue) ? stageValue : 'review_received';
    const outcomeValue = text(current.outcome, text(previous.outcome, 'none')).toLowerCase();
    const outcome = stage === 'closed' && CONSULTATION_OUTCOMES.includes(outcomeValue) ? outcomeValue : 'none';
    return {
      stage,
      outcome,
      note: text(current.note, text(previous.note)).slice(0, 240),
      stageUpdatedAt: text(current.stageUpdatedAt, text(previous.stageUpdatedAt)),
      outcomeUpdatedAt: outcome === 'none' ? '' : text(current.outcomeUpdatedAt, text(previous.outcomeUpdatedAt)),
      closedAt: stage === 'closed' ? text(current.closedAt, text(previous.closedAt)) : '',
      updatedAt: text(current.updatedAt, text(previous.updatedAt))
    };
  }

  function normalizeRecommendationPlan(source, fallback) {
    const current = source?.recommendationPlan && typeof source.recommendationPlan === 'object'
      ? source.recommendationPlan
      : (source?.items && typeof source === 'object' ? source : null);
    const previous = fallback && typeof fallback === 'object' ? fallback : {};
    const plan = current || previous;
    const seen = new Set();
    const items = (Array.isArray(plan?.items) ? plan.items : []).slice(0, 5).map((item, index) => {
      const findingId = text(item?.findingId || item?.id).slice(0, 120);
      const decisionValue = text(item?.decision, 'undecided').toLowerCase();
      const verified = item?.verified === true;
      return {
        id: text(item?.id, `recommendation-${index + 1}`).slice(0, 140),
        findingId,
        title: text(item?.title, 'Protection topic').slice(0, 160),
        decision: verified || decisionValue !== 'recommend' ? (RECOMMENDATION_DECISIONS.includes(decisionValue) ? decisionValue : 'undecided') : 'undecided',
        verified,
        verifiedAt: verified ? text(item?.verifiedAt).slice(0, 40) : '',
        producerReason: text(item?.producerReason).slice(0, 500),
        updatedAt: text(item?.updatedAt).slice(0, 40)
      };
    }).filter(item => item.findingId && !seen.has(item.findingId) && seen.add(item.findingId));
    const counts = { total: items.length, verified: 0, unverified: 0, undecided: 0, consider: 0, recommend: 0, defer: 0, notRecommended: 0 };
    items.forEach(item => {
      counts[item.verified ? 'verified' : 'unverified'] += 1;
      if (item.decision === 'not_recommended') counts.notRecommended += 1;
      else if (Object.prototype.hasOwnProperty.call(counts, item.decision)) counts[item.decision] += 1;
    });
    const state = !items.length
      ? 'empty'
      : items.every(item => item.decision !== 'undecided') && items.some(item => item.decision === 'recommend')
        ? 'structured'
        : items.some(item => item.decision !== 'undecided' || item.verified || item.producerReason) ? 'draft' : 'not-started';
    return {
      schemaVersion: '1.0',
      builderVersion: text(plan?.builderVersion, '1.0.0'),
      state,
      items,
      summary: counts,
      updatedAt: text(plan?.updatedAt).slice(0, 40)
    };
  }

  function normalizeCompletion(source, fallback) {
    const current = source?.completion && typeof source.completion === 'object' ? source.completion : (source && typeof source === 'object' ? source : {});
    const previous = fallback && typeof fallback === 'object' ? fallback : {};
    const unresolvedState = ['open', 'none'].includes(text(current.unresolvedState, text(previous.unresolvedState, 'open')).toLowerCase())
      ? text(current.unresolvedState, text(previous.unresolvedState, 'open')).toLowerCase() : 'open';
    const quoteState = ['not_requested', 'ready', 'needs_items', 'requested'].includes(text(current.quoteState, text(previous.quoteState, 'not_requested')).toLowerCase())
      ? text(current.quoteState, text(previous.quoteState, 'not_requested')).toLowerCase() : 'not_requested';
    return {
      schemaVersion: '1.0',
      state: text(current.state, text(previous.state, 'draft')).toLowerCase() === 'complete' ? 'complete' : 'draft',
      decisionSummary: text(current.decisionSummary, text(previous.decisionSummary)).slice(0, 700),
      unresolvedState,
      unresolvedSummary: unresolvedState === 'none' ? '' : text(current.unresolvedSummary, text(previous.unresolvedSummary)).slice(0, 900),
      quoteState,
      quoteRequirements: quoteState === 'not_requested' ? '' : text(current.quoteRequirements, text(previous.quoteRequirements)).slice(0, 900),
      nextAction: text(current.nextAction, text(previous.nextAction)).slice(0, 700),
      completedAt: text(current.completedAt, text(previous.completedAt)).slice(0, 40),
      updatedAt: text(current.updatedAt, text(previous.updatedAt)).slice(0, 40)
    };
  }

  function checklistStamp(value) {
    const parsed = new Date(value?.lastUpdatedAt || value?.createdAt || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeChecklistProgress(source, fallback) {
    const supplied = source?.checklistProgress && typeof source.checklistProgress === 'object'
      ? source.checklistProgress
      : (source?.storageSchemaVersion && Array.isArray(source?.items) ? source : null);
    const previous = fallback && typeof fallback === 'object' ? fallback : null;
    const candidate = supplied && (!previous || checklistStamp(supplied) >= checklistStamp(previous)) ? supplied : previous;
    if (!candidate || candidate.storageSchemaVersion !== '1.0') return null;
    const checklistId = text(candidate.checklistId).slice(0, 160);
    const planFingerprint = text(candidate.planFingerprint).slice(0, 120);
    const createdAt = text(candidate.createdAt).slice(0, 40);
    const lastUpdatedAt = text(candidate.lastUpdatedAt).slice(0, 40);
    const seen = new Set();
    const items = (Array.isArray(candidate.items) ? candidate.items : []).slice(0, 60).map(item => ({
      id: text(item?.id).slice(0, 160),
      status: ['pending', 'active', 'complete'].includes(text(item?.status).toLowerCase()) ? text(item.status).toLowerCase() : '',
      updatedAt: text(item?.updatedAt).slice(0, 40)
    })).filter(item => item.id && item.status && !seen.has(item.id) && seen.add(item.id));
    if (!checklistId || !planFingerprint || !lastUpdatedAt || !items.length) return null;
    return {
      storageSchemaVersion: '1.0',
      checklistSchemaVersion: text(candidate.checklistSchemaVersion, '1.0').slice(0, 20),
      engineVersion: text(candidate.engineVersion).slice(0, 20),
      checklistId,
      planFingerprint,
      plannerVersion: text(candidate.plannerVersion).slice(0, 20),
      createdAt,
      lastUpdatedAt,
      currentPhaseId: text(candidate.currentPhaseId).slice(0, 120),
      items
    };
  }

  function normalizeNotes(source, fallback) {
    const current = Array.isArray(source?.notes) ? source.notes : null;
    const previous = Array.isArray(fallback) ? fallback : [];
    const list = current || previous;
    const seen = new Set();
    return list.map(note => ({
      id: text(note?.id),
      body: text(note?.body || note?.note).slice(0, 1000),
      createdAt: text(note?.createdAt || note?.occurredAt),
      author: text(note?.author, 'Producer').slice(0, 80)
    })).filter(note => note.id && note.body && note.createdAt && !seen.has(note.id) && seen.add(note.id)).slice(-50);
  }

  function normalizeActivity(source, fallback) {
    const current = Array.isArray(source?.activity) ? source.activity : null;
    const previous = Array.isArray(fallback) ? fallback : [];
    const allowed = new Set(['delivered','opened','acknowledged','follow_up_scheduled','follow_up_updated','follow_up_completed','follow_up_cleared','stage_changed','outcome_recorded','consultation_reopened','disposition_updated','recommendation_plan_updated','consultation_completion_saved','producer_note','consultation_document_opened','customer_report_opened','producer_notified']);
    const seen = new Set();
    return (current || previous).map(event => ({
      id: text(event?.id),
      type: text(event?.type).toLowerCase(),
      occurredAt: text(event?.occurredAt || event?.createdAt),
      title: text(event?.title).slice(0, 160),
      detail: text(event?.detail).slice(0, 1000),
      actor: text(event?.actor, 'Producer').slice(0, 80)
    })).filter(event => event.id && allowed.has(event.type) && event.occurredAt && !seen.has(event.id) && seen.add(event.id)).slice(-100);
  }

  function normalizeRemote(remote, fallback) {
    const source = remote && typeof remote === 'object' ? remote : null;
    if (!source && !fallback?.serverBacked) return null;
    const previous = fallback && typeof fallback === 'object' ? fallback : {};
    const delivery = source?.delivery || {};
    const status = mergeStatus(previous.status, source?.status);
    return {
      serverBacked: true,
      status: status === 'ready' ? 'new' : status,
      deliveredAt: text(delivery.deliveredAt || source?.deliveredAt || previous.deliveredAt || source?.createdAt),
      newAt: text(delivery.newAt || previous.newAt || delivery.deliveredAt || source?.createdAt),
      openedAt: text(delivery.openedAt || previous.openedAt),
      acknowledgedAt: text(delivery.acknowledgedAt || previous.acknowledgedAt),
      syncedAt: text(source?.syncedAt || previous.syncedAt),
      statusUpdatedAt: text(source?.statusUpdatedAt || previous.statusUpdatedAt || source?.updatedAt),
      followUp: normalizeFollowUp(source, previous.followUp),
      disposition: normalizeDisposition(source, previous.disposition),
      recommendationPlan: normalizeRecommendationPlan(source, previous.recommendationPlan),
      completion: normalizeCompletion(source, previous.completion),
      checklistProgress: normalizeChecklistProgress(source, previous.checklistProgress),
      notes: normalizeNotes(source, previous.notes),
      activity: normalizeActivity(source, previous.activity)
    };
  }

  function normalizeRecord(report, options) {
    if (!report || typeof report !== 'object' || !Object.keys(report).length) return null;
    const customer = reportCustomer(report);
    const timestamp = nowIso(options);
    const createdAt = text(options?.createdAt || report?.consultationRecord?.createdAt || report?.createdAt, timestamp);
    const id = createId(report, options);
    const remote = normalizeRemote(options?.remote);
    return {
      schemaVersion: SCHEMA_VERSION,
      recordVersion: VERSION,
      id,
      product: text(report.assessment, 'home'),
      status: remote?.status || 'ready',
      createdAt,
      updatedAt: text(options?.updatedAt || options?.remote?.updatedAt, timestamp),
      statusUpdatedAt: text(options?.remote?.statusUpdatedAt, timestamp),
      customer,
      assessment: {
        score: Number.isFinite(Number(report.score)) ? Number(report.score) : null,
        status: text(report.status, 'Review Summary'),
        topPriority: text(report.topPriority),
        strongest: text(report.strongest)
      },
      displacementContext: clone(report?.displacementContext || report?.prospectProfile?.displacementContext) || null,
      integration: {
        source: text(report?.integration?.source || report?.attribution?.source),
        campaign: text(report?.integration?.campaign || report?.attribution?.campaign),
        referralSource: text(report?.integration?.referralSource || report?.attribution?.referralSource),
        entry: text(report?.integration?.entry || report?.attribution?.entry),
        sessionId: text(report?.integration?.sessionId || report?.attribution?.sessionId)
      },
      disposition: normalizeDisposition(remote?.disposition || options?.disposition || report?.consultationRecord),
      recommendationPlan: normalizeRecommendationPlan(remote?.recommendationPlan || options?.recommendationPlan || report?.consultationRecord?.recommendationPlan),
      completion: normalizeCompletion(remote?.completion || options?.completion || report?.consultationRecord?.completion),
      checklistProgress: normalizeChecklistProgress(remote?.checklistProgress || options?.checklistProgress || report?.consultationRecord?.checklistProgress),
      remote,
      report: clone(report)
    };
  }

  function summary(record) {
    if (!record) return null;
    return {
      id: text(record.id),
      product: text(record.product, 'home'),
      status: text(record.status, record.remote?.status || 'ready'),
      createdAt: text(record.createdAt),
      updatedAt: text(record.updatedAt),
      statusUpdatedAt: text(record.statusUpdatedAt),
      customer: clone(record.customer) || {},
      assessment: clone(record.assessment) || {},
      integration: clone(record.integration) || {},
      displacementContext: clone(record.displacementContext) || null,
      disposition: clone(record.disposition) || normalizeDisposition({}),
      recommendationPlan: clone(record.recommendationPlan) || normalizeRecommendationPlan({}),
      completion: clone(record.completion) || normalizeCompletion({}),
      checklistProgress: clone(record.checklistProgress) || null,
      remote: clone(record.remote) || null
    };
  }

  function writeStore(target, storeValue) {
    const payload = JSON.stringify(storeValue);
    if (storageSet(target, STORE_KEY, payload)) return true;
    const compact = { ...storeValue, records: storeValue.records.slice(0, 10) };
    return storageSet(target, STORE_KEY, JSON.stringify(compact));
  }

  function dispatch(name, detail) {
    try {
      if (root.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent(name, { detail: clone(detail) }));
    } catch (_) {}
  }

  function upsert(report, options) {
    const settings = options || {};
    const target = storage(settings);
    if (!target) return null;
    const record = normalizeRecord(report, settings);
    if (!record || record.product !== 'home') return null;
    const storeValue = readStore({ storage: target });
    const existing = storeValue.records.find(item => item.id === record.id);
    if (existing?.createdAt) record.createdAt = existing.createdAt;
    record.disposition = normalizeDisposition(record.remote?.disposition || settings.disposition || existing?.disposition, existing?.disposition);
    record.recommendationPlan = normalizeRecommendationPlan(record.remote?.recommendationPlan || settings.recommendationPlan || existing?.recommendationPlan, existing?.recommendationPlan);
    record.completion = normalizeCompletion(record.remote?.completion || settings.completion || existing?.completion, existing?.completion);
    record.checklistProgress = normalizeChecklistProgress(record.remote?.checklistProgress || settings.checklistProgress || existing?.checklistProgress, existing?.checklistProgress);
    if (existing?.remote || record.remote) {
      record.remote = normalizeRemote(settings.remote, existing?.remote);
      record.status = mergeStatus(existing?.status, record.remote?.status);
      if (record.remote) record.remote.status = record.status === 'ready' ? 'new' : record.status;
    } else if (existing?.status) {
      record.status = existing.status;
    }
    const records = [record, ...storeValue.records.filter(item => item.id !== record.id)]
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, MAX_RECORDS);
    const nextStore = { schemaVersion: SCHEMA_VERSION, updatedAt: record.updatedAt, records };
    if (!writeStore(target, nextStore)) return null;
    storageSet(target, ACTIVE_KEY, record.id);
    if (settings.dispatch !== false) dispatch(existing ? EVENTS.UPDATED : EVENTS.CREATED, summary(record));
    return clone(record);
  }

  function updateRemote(id, remoteRecord, options) {
    const settings = options || {};
    const target = storage(settings);
    if (!target) return null;
    const storeValue = readStore({ storage: target });
    const index = storeValue.records.findIndex(item => item.id === text(id));
    if (index < 0) return null;
    const existing = storeValue.records[index];
    const remote = normalizeRemote(remoteRecord, existing.remote);
    if (!remote) return null;
    const updatedAt = text(remoteRecord?.updatedAt, nowIso(settings));
    const next = {
      ...existing,
      recordVersion: VERSION,
      status: mergeStatus(existing.status, remote.status),
      updatedAt: existing.updatedAt,
      statusUpdatedAt: text(remoteRecord?.statusUpdatedAt, updatedAt),
      disposition: normalizeDisposition(remoteRecord, existing.disposition),
      recommendationPlan: normalizeRecommendationPlan(remoteRecord, existing.recommendationPlan),
      completion: normalizeCompletion(remoteRecord, existing.completion),
      checklistProgress: normalizeChecklistProgress(remoteRecord, existing.checklistProgress),
      remote: { ...remote, status: mergeStatus(existing.status, remote.status), statusUpdatedAt: text(remoteRecord?.statusUpdatedAt, updatedAt) }
    };
    const records = storeValue.records.slice();
    records[index] = next;
    const nextStore = { schemaVersion: SCHEMA_VERSION, updatedAt: text(next.updatedAt, updatedAt), records };
    if (!writeStore(target, nextStore)) return null;
    if (settings.dispatch !== false) dispatch(EVENTS.UPDATED, summary(next));
    return clone(next);
  }


  function updateDisposition(id, disposition, options) {
    const settings = options || {};
    const target = storage(settings);
    if (!target) return null;
    const storeValue = readStore({ storage: target });
    const index = storeValue.records.findIndex(item => item.id === text(id));
    if (index < 0) return null;
    const existing = storeValue.records[index];
    const normalized = normalizeDisposition(disposition, existing.disposition);
    if (normalized.stage === 'closed' && normalized.outcome === 'none') return null;
    if (normalized.stage !== 'closed' && text(disposition?.outcome).toLowerCase() && text(disposition?.outcome).toLowerCase() !== 'none') return null;
    const stamp = nowIso(settings);
    const next = {
      ...existing,
      recordVersion: VERSION,
      disposition: {
        ...normalized,
        stageUpdatedAt: normalized.stage !== existing.disposition?.stage ? stamp : text(existing.disposition?.stageUpdatedAt, stamp),
        outcomeUpdatedAt: normalized.outcome !== text(existing.disposition?.outcome, 'none') && normalized.outcome !== 'none' ? stamp : (normalized.outcome === 'none' ? '' : text(existing.disposition?.outcomeUpdatedAt)),
        closedAt: normalized.stage === 'closed' ? (existing.disposition?.stage === 'closed' && existing.disposition?.closedAt ? existing.disposition.closedAt : stamp) : '',
        updatedAt: stamp
      }
    };
    const records = storeValue.records.slice();
    records[index] = next;
    const nextStore = { schemaVersion: SCHEMA_VERSION, updatedAt: stamp, records };
    if (!writeStore(target, nextStore)) return null;
    if (settings.dispatch !== false) dispatch(EVENTS.UPDATED, summary(next));
    return clone(next);
  }

  function updateRecommendationPlan(id, recommendationPlan, options) {
    const settings = options || {};
    const target = storage(settings);
    if (!target) return null;
    const storeValue = readStore({ storage: target });
    const index = storeValue.records.findIndex(item => item.id === text(id));
    if (index < 0) return null;
    const requestedItems = Array.isArray(recommendationPlan?.items) ? recommendationPlan.items : [];
    if (!requestedItems.length || requestedItems.length > 5) return null;
    if (requestedItems.some(item => text(item?.decision).toLowerCase() === 'recommend' && (item?.verified !== true || !text(item?.producerReason)))) return null;
    if (requestedItems.some(item => text(item?.decision).toLowerCase() === 'not_recommended' && !text(item?.producerReason))) return null;
    const existing = storeValue.records[index];
    const stamp = nowIso(settings);
    const normalized = normalizeRecommendationPlan({ recommendationPlan: { ...recommendationPlan, updatedAt: text(recommendationPlan?.updatedAt, stamp) } }, existing.recommendationPlan);
    const next = { ...existing, recordVersion: VERSION, recommendationPlan: normalized };
    const records = storeValue.records.slice();
    records[index] = next;
    const nextStore = { schemaVersion: SCHEMA_VERSION, updatedAt: stamp, records };
    if (!writeStore(target, nextStore)) return null;
    if (settings.dispatch !== false) dispatch(EVENTS.UPDATED, summary(next));
    return clone(next);
  }

  function updateCompletion(id, completion, options) {
    const settings = options || {};
    const target = storage(settings);
    if (!target) return null;
    const storeValue = readStore({ storage: target });
    const index = storeValue.records.findIndex(item => item.id === text(id));
    if (index < 0) return null;
    const existing = storeValue.records[index];
    const stamp = nowIso(settings);
    if (!text(completion?.decisionSummary) || !text(completion?.nextAction)) return null;
    if (text(completion?.unresolvedState).toLowerCase() === 'open' && !text(completion?.unresolvedSummary)) return null;
    if (text(completion?.quoteState).toLowerCase() === 'needs_items' && !text(completion?.quoteRequirements)) return null;
    const normalized = normalizeCompletion({ completion: { ...completion, state: 'complete', completedAt: text(completion?.completedAt, stamp), updatedAt: stamp } }, existing.completion);
    if (!normalized.decisionSummary || !normalized.nextAction) return null;
    if (normalized.unresolvedState === 'open' && !normalized.unresolvedSummary) return null;
    if (normalized.quoteState === 'needs_items' && !normalized.quoteRequirements) return null;
    const stageRank = CONSULTATION_STAGES.indexOf(existing.disposition?.stage || 'review_received');
    const completedRank = CONSULTATION_STAGES.indexOf('consultation_completed');
    const disposition = stageRank < completedRank
      ? normalizeDisposition({ ...existing.disposition, stage: 'consultation_completed', stageUpdatedAt: stamp, updatedAt: stamp }, existing.disposition)
      : existing.disposition;
    const next = { ...existing, recordVersion: VERSION, completion: normalized, disposition };
    const records = storeValue.records.slice();
    records[index] = next;
    if (!writeStore(target, { schemaVersion: SCHEMA_VERSION, updatedAt: stamp, records })) return null;
    if (settings.dispatch !== false) dispatch(EVENTS.UPDATED, summary(next));
    return clone(next);
  }

  function updateChecklistProgress(id, checklistProgress, options) {
    const settings = options || {};
    const target = storage(settings);
    if (!target) return null;
    const storeValue = readStore({ storage: target });
    const index = storeValue.records.findIndex(item => item.id === text(id));
    if (index < 0) return null;
    const existing = storeValue.records[index];
    const normalized = normalizeChecklistProgress(checklistProgress, existing.checklistProgress);
    if (!normalized) return null;
    const next = { ...existing, recordVersion: VERSION, checklistProgress: normalized };
    if (next.remote) next.remote = { ...next.remote, checklistProgress: normalizeChecklistProgress(checklistProgress, next.remote.checklistProgress) };
    const records = storeValue.records.slice();
    records[index] = next;
    const stamp = nowIso(settings);
    if (!writeStore(target, { schemaVersion: SCHEMA_VERSION, updatedAt: stamp, records })) return null;
    if (settings.dispatch !== false) dispatch(EVENTS.UPDATED, summary(next));
    return clone(next);
  }

  function get(id, options) {
    const requested = text(id);
    if (!requested) return null;
    const record = readStore(options).records.find(item => item.id === requested);
    return clone(record || null);
  }

  function list(options) {
    return readStore(options).records
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .map(summary);
  }

  function getActive(options) {
    const target = storage(options);
    const activeId = text(storageGet(target, ACTIVE_KEY));
    const active = get(activeId, { storage: target });
    if (active) return active;
    const first = readStore({ storage: target }).records[0];
    return clone(first || null);
  }

  function select(id, options) {
    const settings = options || {};
    const target = storage(settings);
    const record = get(id, { storage: target });
    if (!record || !storageSet(target, ACTIVE_KEY, record.id)) return null;
    if (settings.dispatch !== false) dispatch(EVENTS.SELECTED, summary(record));
    return record;
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    STORE_KEY,
    ACTIVE_KEY,
    MAX_RECORDS,
    REMOTE_STATUSES,
    CONSULTATION_STAGES,
    CONSULTATION_OUTCOMES,
    EVENTS,
    createId,
    upsert,
    updateRemote,
    updateDisposition,
    updateRecommendationPlan,
    updateCompletion,
    updateChecklistProgress,
    get,
    getActive,
    list,
    select
  });
});
