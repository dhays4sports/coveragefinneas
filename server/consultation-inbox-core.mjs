import { byteLength, randomUUID, timingSafeTextEqual } from './runtime-crypto.mjs';
import {
  initialNotificationState,
  normalizeNotification,
  sendNewReviewNotification,
  shouldAttemptNewReviewNotification
} from './producer-notification.mjs';

export const INBOX_SCHEMA_VERSION = '1.0';
export const RECORD_VERSION = '1.8.0';
export const STORE_NAME = 'coveragefit-consultations-v1';
export const RECORD_PREFIX = 'records/';
export const MAX_BODY_BYTES = 320000;
export const MAX_INBOX_RECORDS = 100;
export const RECORD_STATUSES = Object.freeze(['new', 'opened', 'acknowledged']);
export const FOLLOW_UP_STATES = Object.freeze(['none', 'scheduled', 'completed']);
export const CONSULTATION_STAGES = Object.freeze(['review_received', 'contact_attempted', 'consultation_scheduled', 'consultation_completed', 'proposal_prepared', 'decision_pending', 'closed']);
export const CONSULTATION_OUTCOMES = Object.freeze(['none', 'policy_bound', 'current_carrier_retained', 'declined_price', 'declined_coverage', 'unable_to_reach', 'not_eligible', 'deferred']);
export const RECOMMENDATION_DECISIONS = Object.freeze(['undecided', 'consider', 'recommend', 'defer', 'not_recommended']);
export const MAX_PRODUCER_NOTES = 50;
export const MAX_ACTIVITY_EVENTS = 100;
export const ACTIVITY_TYPES = Object.freeze([
  'delivered', 'opened', 'acknowledged',
  'follow_up_scheduled', 'follow_up_updated', 'follow_up_completed', 'follow_up_cleared',
  'stage_changed', 'outcome_recorded', 'consultation_reopened', 'disposition_updated',
  'recommendation_plan_updated',
  'consultation_completion_saved',
  'producer_note', 'consultation_document_opened', 'customer_report_opened', 'producer_notified'
]);

const ID_PATTERN = /^consultation-[a-z0-9-]{6,80}$/i;
const STATUS_RANK = Object.freeze({ new: 1, opened: 2, acknowledged: 3 });

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function error(status, code, message) {
  return json({ ok: false, error: { code, message } }, status);
}

function safeEqual(left, right) {
  return timingSafeTextEqual(left, right);
}

function bearerToken(request) {
  const header = text(request.headers.get('authorization'));
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function sameOrigin(request) {
  const origin = text(request.headers.get('origin'));
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
}

function contentLength(request) {
  const parsed = Number(request.headers.get('content-length'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function statusValue(value, fallback = 'new') {
  const normalized = text(value).toLowerCase();
  if (normalized === 'ready') return fallback;
  return RECORD_STATUSES.includes(normalized) ? normalized : fallback;
}

function timestamp(value, fallback = '') {
  const candidate = text(value, fallback);
  if (!candidate) return '';
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function dateOnly(value, fallback = '') {
  const candidate = text(value, fallback);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return fallback;
  const date = new Date(`${candidate}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate ? fallback : candidate;
}

function followUpState(value, fallback = 'none') {
  const normalized = text(value).toLowerCase();
  return FOLLOW_UP_STATES.includes(normalized) ? normalized : fallback;
}

function consultationStage(value, fallback = 'review_received') {
  const normalized = text(value).toLowerCase();
  return CONSULTATION_STAGES.includes(normalized) ? normalized : fallback;
}

function consultationOutcome(value, fallback = 'none') {
  const normalized = text(value).toLowerCase();
  return CONSULTATION_OUTCOMES.includes(normalized) ? normalized : fallback;
}

function stageLabel(value) {
  return ({
    review_received: 'Review received',
    contact_attempted: 'Contact attempted',
    consultation_scheduled: 'Consultation scheduled',
    consultation_completed: 'Consultation completed',
    proposal_prepared: 'Proposal prepared',
    decision_pending: 'Decision pending',
    closed: 'Closed'
  })[consultationStage(value)] || 'Review received';
}

function outcomeLabel(value) {
  return ({
    none: 'No final outcome',
    policy_bound: 'Policy bound',
    current_carrier_retained: 'Stayed with current carrier',
    declined_price: 'Declined — price',
    declined_coverage: 'Declined — coverage',
    unable_to_reach: 'Unable to reach',
    not_eligible: 'Not eligible / not a fit',
    deferred: 'Deferred / future review'
  })[consultationOutcome(value)] || 'No final outcome';
}

function safeIdPart(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

function activityId(type, occurredAt, suffix = '') {
  const base = ['activity', safeIdPart(type), safeIdPart(occurredAt), safeIdPart(suffix)].filter(Boolean).join('-');
  return base.slice(0, 120) || `activity-${randomUUID()}`;
}

function normalizeProducerNote(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note)) return null;
  const body = text(note.body || note.note).slice(0, 1000);
  const createdAt = timestamp(note.createdAt || note.occurredAt);
  if (!body || !createdAt) return null;
  return {
    id: text(note.id, `note-${randomUUID()}`).slice(0, 120),
    body,
    createdAt,
    author: text(note.author, 'Producer').slice(0, 80)
  };
}

function normalizeActivityEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const type = text(event.type).toLowerCase();
  const occurredAt = timestamp(event.occurredAt || event.createdAt);
  if (!ACTIVITY_TYPES.includes(type) || !occurredAt) return null;
  return {
    id: text(event.id, activityId(type, occurredAt, event.detail)).slice(0, 120),
    type,
    occurredAt,
    title: text(event.title).slice(0, 160),
    detail: text(event.detail).slice(0, 1000),
    actor: text(event.actor, type === 'delivered' ? 'CoverageFit' : 'Producer').slice(0, 80)
  };
}

function activityTitle(type) {
  return ({
    delivered: 'Review delivered',
    opened: 'Review opened',
    acknowledged: 'Review acknowledged',
    follow_up_scheduled: 'Follow-up scheduled',
    follow_up_updated: 'Follow-up updated',
    follow_up_completed: 'Follow-up completed',
    follow_up_cleared: 'Follow-up cleared',
    stage_changed: 'Consultation stage changed',
    outcome_recorded: 'Final outcome recorded',
    consultation_reopened: 'Consultation reopened',
    disposition_updated: 'Consultation disposition updated',
    recommendation_plan_updated: 'Recommendation plan updated',
    consultation_completion_saved: 'Consultation completion saved',
    producer_note: 'Producer note added',
    consultation_document_opened: 'Consultation document opened',
    customer_report_opened: 'Customer report opened',
    producer_notified: 'Producer email alert sent'
  })[type] || 'Consultation activity';
}

function activityEvent(type, occurredAt, detail = '', actor = 'Producer', suffix = '') {
  const stamp = timestamp(occurredAt, new Date().toISOString());
  return normalizeActivityEvent({
    id: activityId(type, stamp, suffix || detail),
    type,
    occurredAt: stamp,
    title: activityTitle(type),
    detail,
    actor
  });
}

function normalizeNotes(record) {
  const notes = Array.isArray(record?.notes) ? record.notes : [];
  const seen = new Set();
  return notes.map(normalizeProducerNote).filter(note => {
    if (!note || seen.has(note.id)) return false;
    seen.add(note.id);
    return true;
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-MAX_PRODUCER_NOTES);
}

function normalizeActivity(record, notes = normalizeNotes(record)) {
  const events = Array.isArray(record?.activity) ? record.activity.map(normalizeActivityEvent).filter(Boolean) : [];
  const delivery = normalizeDelivery(record, timestamp(record?.createdAt, new Date().toISOString()));
  const currentStatus = statusValue(record?.status);
  const followUp = normalizeFollowUp(record);
  const ensure = event => {
    if (!event || events.some(item => item.id === event.id || (item.type === event.type && item.occurredAt === event.occurredAt && item.detail === event.detail))) return;
    events.push(event);
  };
  if (delivery.deliveredAt) ensure(activityEvent('delivered', delivery.deliveredAt, 'Completed homeowner review received in the producer inbox.', 'CoverageFit', record?.id));
  const notification = normalizeNotification(record?.notification);
  if (notification.state === 'sent' && notification.sentAt) ensure(activityEvent('producer_notified', notification.sentAt, 'A privacy-safe new-review email alert was sent to the configured producer address.', 'CoverageFit', record?.id));
  if (delivery.openedAt || ['opened', 'acknowledged'].includes(currentStatus)) ensure(activityEvent('opened', delivery.openedAt || record?.statusUpdatedAt, 'The producer opened this consultation record.', 'Producer', record?.id));
  if (delivery.acknowledgedAt || currentStatus === 'acknowledged') ensure(activityEvent('acknowledged', delivery.acknowledgedAt || record?.statusUpdatedAt, 'The producer acknowledged receipt of this review.', 'Producer', record?.id));
  const hasFollowUpEventAt = stamp => events.some(item => item.type.startsWith('follow_up_') && item.occurredAt === stamp);
  if (followUp.state === 'scheduled' && followUp.updatedAt && !hasFollowUpEventAt(followUp.updatedAt)) ensure(activityEvent('follow_up_scheduled', followUp.updatedAt, [followUp.dueDate ? `Due ${followUp.dueDate}.` : '', followUp.note].filter(Boolean).join(' '), 'Producer', record?.id));
  if (followUp.state === 'completed' && followUp.completedAt && !hasFollowUpEventAt(followUp.completedAt)) ensure(activityEvent('follow_up_completed', followUp.completedAt, [followUp.dueDate ? `Scheduled for ${followUp.dueDate}.` : '', followUp.note].filter(Boolean).join(' '), 'Producer', record?.id));
  const disposition = normalizeDisposition(record);
  const hasDispositionEventAt = stamp => events.some(item => ['stage_changed', 'outcome_recorded', 'consultation_reopened', 'disposition_updated'].includes(item.type) && item.occurredAt === stamp);
  if (disposition.stageUpdatedAt && disposition.stage !== 'review_received' && !hasDispositionEventAt(disposition.stageUpdatedAt)) {
    ensure(activityEvent('stage_changed', disposition.stageUpdatedAt, `Consultation moved to ${stageLabel(disposition.stage)}.`, 'Producer', record?.id));
  }
  if (disposition.outcomeUpdatedAt && disposition.outcome !== 'none' && !hasDispositionEventAt(disposition.outcomeUpdatedAt)) {
    ensure(activityEvent('outcome_recorded', disposition.outcomeUpdatedAt, `Final outcome: ${outcomeLabel(disposition.outcome)}.`, 'Producer', record?.id));
  }
  notes.forEach(note => ensure(activityEvent('producer_note', note.createdAt, note.body, note.author, note.id)));
  const unique = new Map();
  events.forEach(event => unique.set(event.id, event));
  return [...unique.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(-MAX_ACTIVITY_EVENTS);
}

function appendActivity(record, event) {
  const normalized = normalizeActivityEvent(event);
  if (!normalized) return normalizeActivity(record);
  const events = normalizeActivity(record);
  if (events.some(item => item.id === normalized.id)) return events;
  const last = events[events.length - 1];
  if (last && last.type === normalized.type && last.detail === normalized.detail && Math.abs(new Date(normalized.occurredAt) - new Date(last.occurredAt)) < 15000) return events;
  return [...events, normalized].slice(-MAX_ACTIVITY_EVENTS);
}

function normalizeFollowUp(record, fallback = null) {
  const source = record?.followUp && typeof record.followUp === 'object' ? record.followUp : {};
  const previous = fallback && typeof fallback === 'object' ? fallback : {};
  const state = followUpState(source.state, followUpState(previous.state));
  const dueDate = state === 'none' ? '' : dateOnly(source.dueDate, dateOnly(previous.dueDate));
  const note = state === 'none' ? '' : text(source.note, text(previous.note)).slice(0, 240);
  const updatedAt = timestamp(source.updatedAt, timestamp(previous.updatedAt));
  const scheduledAt = state === 'scheduled' || state === 'completed'
    ? timestamp(source.scheduledAt, timestamp(previous.scheduledAt, updatedAt))
    : '';
  const completedAt = state === 'completed'
    ? timestamp(source.completedAt, timestamp(previous.completedAt, updatedAt))
    : '';
  return { state, dueDate, note, scheduledAt, completedAt, updatedAt };
}


function normalizeDisposition(record, fallback = null) {
  const source = record?.disposition && typeof record.disposition === 'object' ? record.disposition : {};
  const previous = fallback && typeof fallback === 'object' ? fallback : {};
  const stage = consultationStage(source.stage, consultationStage(previous.stage));
  const requestedOutcome = consultationOutcome(source.outcome, consultationOutcome(previous.outcome));
  const outcome = stage === 'closed' ? requestedOutcome : 'none';
  const updatedAt = timestamp(source.updatedAt, timestamp(previous.updatedAt));
  const stageUpdatedAt = timestamp(source.stageUpdatedAt, timestamp(previous.stageUpdatedAt, updatedAt));
  const outcomeUpdatedAt = outcome !== 'none'
    ? timestamp(source.outcomeUpdatedAt, timestamp(previous.outcomeUpdatedAt, updatedAt))
    : '';
  const closedAt = stage === 'closed'
    ? timestamp(source.closedAt, timestamp(previous.closedAt, updatedAt))
    : '';
  return {
    stage,
    outcome,
    note: text(source.note, text(previous.note)).slice(0, 240),
    stageUpdatedAt,
    outcomeUpdatedAt,
    closedAt,
    updatedAt
  };
}

export function normalizeRecommendationPlan(record, fallback = null) {
  const source = record?.recommendationPlan && typeof record.recommendationPlan === 'object'
    ? record.recommendationPlan
    : (record?.items && typeof record === 'object' ? record : {});
  const previous = fallback && typeof fallback === 'object' ? fallback : {};
  const plan = Object.keys(source).length ? source : previous;
  const seen = new Set();
  const items = (Array.isArray(plan?.items) ? plan.items : []).slice(0, 5).map((item, index) => {
    const findingId = text(item?.findingId || item?.id).slice(0, 120);
    const decisionValue = text(item?.decision, 'undecided').toLowerCase();
    const verified = item?.verified === true;
    const decision = RECOMMENDATION_DECISIONS.includes(decisionValue) && (decisionValue !== 'recommend' || verified)
      ? decisionValue
      : 'undecided';
    return {
      id: text(item?.id, `recommendation-${index + 1}`).slice(0, 140),
      findingId,
      title: text(item?.title, 'Protection topic').slice(0, 160),
      decision,
      verified,
      verifiedAt: verified ? timestamp(item?.verifiedAt) : '',
      producerReason: text(item?.producerReason).slice(0, 500),
      updatedAt: timestamp(item?.updatedAt)
    };
  }).filter(item => item.findingId && !seen.has(item.findingId) && seen.add(item.findingId));
  const summary = { total: items.length, verified: 0, unverified: 0, undecided: 0, consider: 0, recommend: 0, defer: 0, notRecommended: 0 };
  items.forEach(item => {
    summary[item.verified ? 'verified' : 'unverified'] += 1;
    if (item.decision === 'not_recommended') summary.notRecommended += 1;
    else if (Object.prototype.hasOwnProperty.call(summary, item.decision)) summary[item.decision] += 1;
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
    summary,
    updatedAt: timestamp(plan?.updatedAt)
  };
}

export function normalizeConsultationCompletion(record, fallback = null) {
  const source = record?.completion && typeof record.completion === 'object' ? record.completion : (record && typeof record === 'object' ? record : {});
  const previous = fallback && typeof fallback === 'object' ? fallback : {};
  const unresolvedValue = text(source.unresolvedState, text(previous.unresolvedState, 'open')).toLowerCase();
  const quoteValue = text(source.quoteState, text(previous.quoteState, 'not_requested')).toLowerCase();
  const unresolvedState = ['open', 'none'].includes(unresolvedValue) ? unresolvedValue : 'open';
  const quoteState = ['not_requested', 'ready', 'needs_items', 'requested'].includes(quoteValue) ? quoteValue : 'not_requested';
  return {
    schemaVersion: '1.0',
    state: text(source.state, text(previous.state, 'draft')).toLowerCase() === 'complete' ? 'complete' : 'draft',
    decisionSummary: text(source.decisionSummary, text(previous.decisionSummary)).slice(0, 700),
    unresolvedState,
    unresolvedSummary: unresolvedState === 'none' ? '' : text(source.unresolvedSummary, text(previous.unresolvedSummary)).slice(0, 900),
    quoteState,
    quoteRequirements: quoteState === 'not_requested' ? '' : text(source.quoteRequirements, text(previous.quoteRequirements)).slice(0, 900),
    nextAction: text(source.nextAction, text(previous.nextAction)).slice(0, 700),
    completedAt: timestamp(source.completedAt, timestamp(previous.completedAt)),
    updatedAt: timestamp(source.updatedAt, timestamp(previous.updatedAt))
  };
}

function checklistUpdatedAt(value) {
  const parsed = new Date(value?.lastUpdatedAt || value?.createdAt || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeChecklistProgress(record, fallback = null) {
  const supplied = record?.checklistProgress && typeof record.checklistProgress === 'object'
    ? record.checklistProgress
    : (record?.storageSchemaVersion && Array.isArray(record?.items) ? record : null);
  const previous = fallback && typeof fallback === 'object' ? fallback : null;
  const source = supplied && (!previous || checklistUpdatedAt(supplied) >= checklistUpdatedAt(previous)) ? supplied : previous;
  if (!source || source.storageSchemaVersion !== '1.0') return null;
  const checklistId = text(source.checklistId).slice(0, 160);
  const planFingerprint = text(source.planFingerprint).slice(0, 120);
  const createdAt = timestamp(source.createdAt);
  const lastUpdatedAt = timestamp(source.lastUpdatedAt);
  const seen = new Set();
  const items = (Array.isArray(source.items) ? source.items : []).slice(0, 60).map(item => ({
    id: text(item?.id).slice(0, 160),
    status: ['pending', 'active', 'complete'].includes(text(item?.status).toLowerCase()) ? text(item.status).toLowerCase() : '',
    updatedAt: timestamp(item?.updatedAt)
  })).filter(item => item.id && item.status && !seen.has(item.id) && seen.add(item.id));
  if (!checklistId || !planFingerprint || !lastUpdatedAt || !items.length) return null;
  return {
    storageSchemaVersion: '1.0',
    checklistSchemaVersion: text(source.checklistSchemaVersion, '1.0').slice(0, 20),
    engineVersion: text(source.engineVersion).slice(0, 20),
    checklistId,
    planFingerprint,
    plannerVersion: text(source.plannerVersion).slice(0, 20),
    createdAt,
    lastUpdatedAt,
    currentPhaseId: text(source.currentPhaseId).slice(0, 120),
    items
  };
}

function customerFromReport(report) {
  const consumer = report?.consumer || {};
  const prospect = report?.prospectProfile || {};
  const name = text(consumer.name) || text(prospect.fullName) ||
    [consumer.firstName || prospect.firstName, consumer.lastName || prospect.lastName].filter(Boolean).join(' ').trim();
  return {
    name,
    firstName: text(consumer.firstName || prospect.firstName),
    lastName: text(consumer.lastName || prospect.lastName),
    email: text(consumer.email || prospect.email),
    phone: text(consumer.phone || prospect.phone),
    propertyAddress: text(consumer.propertyAddress || prospect.propertyAddress || prospect?.address?.formattedAddress),
    reviewContext: text(consumer.reviewContext || report?.reviewContext || prospect.reviewContext, 'General coverage review')
  };
}

function normalizeDelivery(record, fallbackTimestamp) {
  const source = record?.delivery || {};
  const deliveredAt = timestamp(source.deliveredAt || record?.deliveredAt || record?.createdAt, fallbackTimestamp);
  const currentStatus = statusValue(record?.status);
  const newAt = timestamp(source.newAt, deliveredAt);
  const openedAt = currentStatus === 'opened' || currentStatus === 'acknowledged'
    ? timestamp(source.openedAt, timestamp(record?.updatedAt, deliveredAt))
    : timestamp(source.openedAt);
  const acknowledgedAt = currentStatus === 'acknowledged'
    ? timestamp(source.acknowledgedAt, timestamp(record?.updatedAt, openedAt || deliveredAt))
    : timestamp(source.acknowledgedAt);
  return {
    state: 'delivered',
    deliveredAt,
    newAt,
    openedAt,
    acknowledgedAt
  };
}

export function normalizeStoredRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const id = text(record.id);
  if (!ID_PATTERN.test(id) || text(record.product).toLowerCase() !== 'home') return null;
  const createdAt = timestamp(record.createdAt, timestamp(record.updatedAt, new Date().toISOString()));
  const status = statusValue(record.status);
  return {
    ...clone(record),
    schemaVersion: INBOX_SCHEMA_VERSION,
    recordVersion: text(record.recordVersion, RECORD_VERSION),
    id,
    product: 'home',
    status,
    createdAt,
    updatedAt: timestamp(record.updatedAt, createdAt),
    statusUpdatedAt: timestamp(record.statusUpdatedAt, timestamp(record.updatedAt, createdAt)),
    customer: clone(record.customer) || {},
    assessment: clone(record.assessment) || {},
    integration: clone(record.integration) || {},
    delivery: normalizeDelivery({ ...record, status }, createdAt),
    notification: normalizeNotification(record.notification),
    followUp: normalizeFollowUp(record),
    disposition: normalizeDisposition(record),
    recommendationPlan: normalizeRecommendationPlan(record),
    completion: normalizeConsultationCompletion(record),
    checklistProgress: normalizeChecklistProgress(record),
    notes: normalizeNotes(record),
    activity: normalizeActivity({ ...record, status }),
    report: clone(record.report) || null
  };
}

function summarize(record) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized) return null;
  return {
    id: normalized.id,
    schemaVersion: normalized.schemaVersion,
    recordVersion: normalized.recordVersion,
    product: normalized.product,
    status: normalized.status,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    statusUpdatedAt: normalized.statusUpdatedAt,
    customer: clone(normalized.customer),
    assessment: clone(normalized.assessment),
    integration: clone(normalized.integration),
    delivery: clone(normalized.delivery),
    notification: clone(normalized.notification),
    followUp: clone(normalized.followUp),
    disposition: clone(normalized.disposition),
    recommendationPlan: clone(normalized.recommendationPlan),
    completion: clone(normalized.completion),
    checklistProgress: clone(normalized.checklistProgress),
    notes: clone(normalized.notes),
    activity: clone(normalized.activity)
  };
}

export function normalizeRemoteRecord(report, options = {}) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null;
  const id = text(report?.consultationRecord?.id || options.id);
  if (!ID_PATTERN.test(id)) return null;
  const product = text(report.assessment, 'home').toLowerCase();
  if (product !== 'home') return null;
  const customer = customerFromReport(report);
  if (!customer.name || !customer.email) return null;
  const submittedAt = timestamp(options.submittedAt, new Date().toISOString());
  const createdAt = timestamp(report?.consultationRecord?.createdAt || report.createdAt, submittedAt);
  const score = Number(report.score);
  return {
    schemaVersion: INBOX_SCHEMA_VERSION,
    recordVersion: RECORD_VERSION,
    id,
    product,
    status: 'new',
    createdAt,
    updatedAt: submittedAt,
    statusUpdatedAt: submittedAt,
    customer,
    assessment: {
      score: Number.isFinite(score) ? score : null,
      status: text(report.status, 'Review Summary'),
      topPriority: text(report.topPriority),
      strongest: text(report.strongest)
    },
    integration: {
      source: text(report?.integration?.source || report?.attribution?.source),
      campaign: text(report?.integration?.campaign || report?.attribution?.campaign),
      referralSource: text(report?.integration?.referralSource || report?.attribution?.referralSource),
      entry: text(report?.integration?.entry || report?.attribution?.entry),
      sessionId: text(report?.integration?.sessionId || report?.attribution?.sessionId)
    },
    delivery: {
      state: 'delivered',
      deliveredAt: submittedAt,
      newAt: submittedAt,
      openedAt: '',
      acknowledgedAt: ''
    },
    notification: initialNotificationState('pending'),
    followUp: {
      state: 'none',
      dueDate: '',
      note: '',
      scheduledAt: '',
      completedAt: '',
      updatedAt: ''
    },
    disposition: {
      stage: 'review_received',
      outcome: 'none',
      note: '',
      stageUpdatedAt: submittedAt,
      outcomeUpdatedAt: '',
      closedAt: '',
      updatedAt: submittedAt
    },
    recommendationPlan: normalizeRecommendationPlan({}),
    completion: normalizeConsultationCompletion({}),
    checklistProgress: null,
    notes: [],
    activity: [activityEvent('delivered', submittedAt, 'Completed homeowner review received in the producer inbox.', 'CoverageFit', id)],
    report: clone(report)
  };
}

async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const declaredLength = contentLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    return { response: error(413, 'payload_too_large', 'The request payload is too large.') };
  }
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return { response: error(415, 'unsupported_media_type', 'Expected an application/json request.') };
  }
  let raw = '';
  try { raw = await request.text(); } catch (_) {
    return { response: error(400, 'invalid_body', 'The request body could not be read.') };
  }
  if (!raw || byteLength(raw) > maxBytes) {
    return { response: error(raw ? 413 : 400, raw ? 'payload_too_large' : 'invalid_body', raw ? 'The request payload is too large.' : 'A request payload is required.') };
  }
  try { return { payload: JSON.parse(raw) }; }
  catch (_) { return { response: error(400, 'invalid_json', 'The request payload is not valid JSON.') }; }
}

async function parseSubmission(request) {
  const parsed = await readJsonBody(request);
  if (parsed.response) return parsed;
  const payload = parsed.payload;
  if (text(payload.website)) {
    return { response: json({ ok: true, accepted: true }, 202) };
  }
  const report = payload.record || payload.report;
  const record = normalizeRemoteRecord(report, { submittedAt: new Date().toISOString() });
  if (!record) {
    return { response: error(422, 'invalid_consultation', 'A completed Home consultation record with name, email, and opaque record ID is required.') };
  }
  return { payload, record };
}

function recordMetadata(record) {
  return {
    schemaVersion: INBOX_SCHEMA_VERSION,
    recordVersion: text(record.recordVersion, RECORD_VERSION),
    product: record.product,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    statusUpdatedAt: text(record.statusUpdatedAt),
    deliveredAt: text(record?.delivery?.deliveredAt),
    openedAt: text(record?.delivery?.openedAt),
    acknowledgedAt: text(record?.delivery?.acknowledgedAt),
    notificationState: text(record?.notification?.state, 'legacy'),
    notificationAttemptedAt: text(record?.notification?.attemptedAt),
    notificationSentAt: text(record?.notification?.sentAt),
    followUpState: text(record?.followUp?.state, 'none'),
    followUpDueDate: text(record?.followUp?.dueDate),
    followUpUpdatedAt: text(record?.followUp?.updatedAt),
    consultationStage: text(record?.disposition?.stage, 'review_received'),
    consultationOutcome: text(record?.disposition?.outcome, 'none'),
    dispositionUpdatedAt: text(record?.disposition?.updatedAt),
    consultationClosedAt: text(record?.disposition?.closedAt),
    recommendationPlanState: text(record?.recommendationPlan?.state, 'empty'),
    recommendationCount: Number(record?.recommendationPlan?.summary?.recommend || 0),
    recommendationPlanUpdatedAt: text(record?.recommendationPlan?.updatedAt),
    consultationCompletionState: text(record?.completion?.state, 'draft'),
    consultationCompletedAt: text(record?.completion?.completedAt),
    consultationCompletionUpdatedAt: text(record?.completion?.updatedAt),
    checklistProgressUpdatedAt: text(record?.checklistProgress?.lastUpdatedAt),
    noteCount: Array.isArray(record?.notes) ? record.notes.length : 0,
    activityUpdatedAt: text(record?.activity?.[record.activity.length - 1]?.occurredAt)
  };
}

export async function handleConsultationSubmission(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'The consultation must be submitted from this CoverageFit site.');
  const parsed = await parseSubmission(request);
  if (parsed.response) return parsed.response;
  const store = options.store;
  if (!store?.setJSON) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  try {
    const key = `${RECORD_PREFIX}${parsed.record.id}`;
    const existing = store.get ? normalizeStoredRecord(await store.get(key, { type: 'json', consistency: 'strong' })) : null;
    const record = existing ? {
      ...parsed.record,
      status: existing.status,
      createdAt: existing.createdAt || parsed.record.createdAt,
      delivery: existing.delivery,
      notification: existing.notification,
      followUp: existing.followUp,
      disposition: existing.disposition,
      recommendationPlan: existing.recommendationPlan,
      completion: existing.completion,
      checklistProgress: existing.checklistProgress,
      notes: existing.notes,
      activity: existing.activity,
      updatedAt: parsed.record.updatedAt,
      statusUpdatedAt: existing.statusUpdatedAt
    } : parsed.record;
    await store.setJSON(key, record, { metadata: recordMetadata(record) });
    const notificationRequired = (!existing || shouldAttemptNewReviewNotification(existing.notification)) && shouldAttemptNewReviewNotification(record.notification);
    const deliverNotification = async () => {
      if (!notificationRequired) return record;
      const notification = await sendNewReviewNotification(record, {
        env: options.env || {},
        fetch: options.fetch,
        requestUrl: request.url,
        timeoutMs: options.notificationTimeoutMs
      });
      const activity = notification.state === 'sent'
        ? appendActivity(record, activityEvent('producer_notified', notification.sentAt || notification.attemptedAt, 'A privacy-safe new-review email alert was sent to the configured producer address.', 'CoverageFit', record.id))
        : record.activity;
      const finalRecord = { ...record, recordVersion: RECORD_VERSION, notification, activity };
      try {
        await store.setJSON(key, finalRecord, { metadata: recordMetadata(finalRecord) });
      } catch (notificationWriteCause) {
        console.error('CoverageFit producer notification metadata write failed', notificationWriteCause);
      }
      return finalRecord;
    };
    if (notificationRequired && typeof options.waitUntil === 'function') {
      options.waitUntil(deliverNotification().catch(cause => {
        console.error('CoverageFit producer notification background delivery failed', cause);
      }));
      return json({ ok: true, accepted: true, record: summarize(record) }, 201);
    }
    const finalRecord = await deliverNotification();
    return json({ ok: true, accepted: true, record: summarize(finalRecord) }, 201);
  } catch (cause) {
    console.error('CoverageFit consultation submission failed', cause);
    return error(503, 'storage_write_failed', 'The consultation could not be added to the producer inbox.');
  }
}

export function authorizeProducer(request, env = {}) {
  const expected = text(env.COVERAGEFIT_PRODUCER_ACCESS_TOKEN);
  if (expected.length < 24) return { ok: false, response: error(503, 'inbox_not_configured', 'The secure producer inbox has not been configured.') };
  if (!safeEqual(bearerToken(request), expected)) return { ok: false, response: error(401, 'unauthorized', 'A valid producer inbox access key is required.') };
  return { ok: true };
}

export async function handleConsultationInbox(request, options = {}) {
  if (request.method !== 'GET') return error(405, 'method_not_allowed', 'GET is required.');
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const store = options.store;
  if (!store?.list || !store?.get) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  let limit = 50;
  try {
    const candidate = Number(new URL(request.url).searchParams.get('limit'));
    if (Number.isFinite(candidate) && candidate > 0) limit = Math.min(MAX_INBOX_RECORDS, Math.floor(candidate));
  } catch (_) {}
  try {
    const listed = await store.list({ prefix: RECORD_PREFIX });
    const keys = (listed?.blobs || []).map(item => item.key).filter(key => key.startsWith(RECORD_PREFIX));
    const loaded = await Promise.allSettled(keys.map(key => store.get(key, { type: 'json', consistency: 'strong' })));
    const records = loaded
      .filter(result => result.status === 'fulfilled')
      .map(result => normalizeStoredRecord(result.value))
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, limit);
    const counts = RECORD_STATUSES.reduce((result, status) => {
      result[status] = records.filter(record => record.status === status).length;
      return result;
    }, {});
    counts.followUpScheduled = records.filter(record => record.followUp?.state === 'scheduled').length;
    counts.followUpCompleted = records.filter(record => record.followUp?.state === 'completed').length;
    counts.followUpUnscheduled = records.filter(record => record.followUp?.state === 'none').length;
    counts.closed = records.filter(record => record.disposition?.stage === 'closed').length;
    counts.active = records.filter(record => record.disposition?.stage !== 'closed').length;
    return json({ ok: true, schemaVersion: INBOX_SCHEMA_VERSION, count: records.length, counts, records });
  } catch (cause) {
    console.error('CoverageFit producer inbox read failed', cause);
    return error(503, 'storage_read_failed', 'The producer inbox could not be loaded.');
  }
}

function advanceStatus(record, requestedStatus, changedAt) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized) return null;
  const target = statusValue(requestedStatus, '');
  if (!target) return null;
  const currentRank = STATUS_RANK[normalized.status] || 1;
  const targetRank = STATUS_RANK[target] || 0;
  const nextStatus = targetRank > currentRank ? target : normalized.status;
  const stamp = timestamp(changedAt, new Date().toISOString());
  const delivery = { ...normalized.delivery };
  if (nextStatus === 'opened' || nextStatus === 'acknowledged') delivery.openedAt = delivery.openedAt || stamp;
  if (nextStatus === 'acknowledged') delivery.acknowledgedAt = delivery.acknowledgedAt || stamp;
  const changed = nextStatus !== normalized.status;
  const eventType = nextStatus === 'acknowledged' ? 'acknowledged' : 'opened';
  const detail = nextStatus === 'acknowledged'
    ? 'The producer acknowledged receipt of this review.'
    : 'The producer opened this consultation record.';
  return {
    ...normalized,
    recordVersion: RECORD_VERSION,
    status: nextStatus,
    updatedAt: normalized.updatedAt,
    statusUpdatedAt: changed ? stamp : normalized.statusUpdatedAt,
    delivery,
    activity: changed ? appendActivity(normalized, activityEvent(eventType, stamp, detail, 'Producer', normalized.id)) : normalized.activity
  };
}

export async function handleConsultationStatus(request, options = {}) {
  if (request.method !== 'PATCH') return error(405, 'method_not_allowed', 'PATCH is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Consultation status can only be changed from this CoverageFit site.');
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const parsed = await readJsonBody(request, 16000);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.consultationId || parsed.payload?.id);
  const requestedStatus = text(parsed.payload?.status).toLowerCase();
  if (!ID_PATTERN.test(id)) return error(422, 'invalid_consultation_id', 'A valid opaque consultation ID is required.');
  if (!RECORD_STATUSES.includes(requestedStatus) || requestedStatus === 'new') {
    return error(422, 'invalid_status', 'Consultation status must advance to opened or acknowledged.');
  }
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  try {
    const key = `${RECORD_PREFIX}${id}`;
    const existing = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!existing) return error(404, 'consultation_not_found', 'The consultation record could not be found.');
    const updated = advanceStatus(existing, requestedStatus, new Date().toISOString());
    if (!updated) return error(422, 'invalid_consultation', 'The stored consultation record is invalid.');
    await store.setJSON(key, updated, { metadata: recordMetadata(updated) });
    return json({ ok: true, record: summarize(updated) });
  } catch (cause) {
    console.error('CoverageFit consultation status update failed', cause);
    return error(503, 'storage_write_failed', 'The consultation status could not be updated.');
  }
}

function applyFollowUp(record, payload, changedAt) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized) return null;
  const requestedState = followUpState(payload?.state, '');
  if (!requestedState) return null;
  const stamp = timestamp(changedAt, new Date().toISOString());
  const existing = normalized.followUp || normalizeFollowUp({});
  if (requestedState === 'completed' && !['scheduled', 'completed'].includes(existing.state)) return null;
  if (requestedState === 'none') {
    return {
      ...normalized,
      recordVersion: RECORD_VERSION,
      updatedAt: normalized.updatedAt,
      followUp: { state: 'none', dueDate: '', note: '', scheduledAt: '', completedAt: '', updatedAt: stamp },
      activity: existing.state === 'none'
        ? normalized.activity
        : appendActivity(normalized, activityEvent('follow_up_cleared', stamp, 'The scheduled producer follow-up was cleared.', 'Producer', normalized.id))
    };
  }
  const dueDate = dateOnly(payload?.dueDate, existing.dueDate);
  const note = text(payload?.note, existing.note).slice(0, 240);
  if (requestedState === 'scheduled' && !dueDate) return null;
  const scheduledAt = requestedState === 'scheduled'
    ? (existing.state === 'scheduled' && existing.scheduledAt ? existing.scheduledAt : stamp)
    : (existing.scheduledAt || stamp);
  const eventType = requestedState === 'completed'
    ? 'follow_up_completed'
    : existing.state === 'scheduled' ? 'follow_up_updated' : 'follow_up_scheduled';
  const detail = requestedState === 'completed'
    ? [dueDate ? `Scheduled for ${dueDate}.` : '', note].filter(Boolean).join(' ')
    : [dueDate ? `Due ${dueDate}.` : '', note].filter(Boolean).join(' ');
  return {
    ...normalized,
    recordVersion: RECORD_VERSION,
    updatedAt: normalized.updatedAt,
    followUp: {
      state: requestedState,
      dueDate,
      note,
      scheduledAt,
      completedAt: requestedState === 'completed' ? stamp : '',
      updatedAt: stamp
    },
    activity: appendActivity(normalized, activityEvent(eventType, stamp, detail, 'Producer', normalized.id))
  };
}

export async function handleConsultationFollowUp(request, options = {}) {
  if (request.method !== 'PATCH') return error(405, 'method_not_allowed', 'PATCH is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Consultation follow-up can only be changed from this CoverageFit site.');
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const parsed = await readJsonBody(request, 18000);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.consultationId || parsed.payload?.id);
  const requestedState = followUpState(parsed.payload?.state, '');
  if (!ID_PATTERN.test(id)) return error(422, 'invalid_consultation_id', 'A valid opaque consultation ID is required.');
  if (!requestedState) return error(422, 'invalid_follow_up_state', 'Follow-up state must be none, scheduled, or completed.');
  if (requestedState === 'scheduled' && !dateOnly(parsed.payload?.dueDate)) {
    return error(422, 'invalid_follow_up_date', 'A valid follow-up date is required when scheduling follow-up.');
  }
  if (text(parsed.payload?.note).length > 240) {
    return error(422, 'follow_up_note_too_long', 'The follow-up action note must be 240 characters or fewer.');
  }
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  try {
    const key = `${RECORD_PREFIX}${id}`;
    const existing = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!existing) return error(404, 'consultation_not_found', 'The consultation record could not be found.');
    const updated = applyFollowUp(existing, parsed.payload, new Date().toISOString());
    if (!updated) return error(422, 'invalid_follow_up', 'The follow-up details could not be applied.');
    await store.setJSON(key, updated, { metadata: recordMetadata(updated) });
    return json({ ok: true, record: summarize(updated) });
  } catch (cause) {
    console.error('CoverageFit consultation follow-up update failed', cause);
    return error(503, 'storage_write_failed', 'The consultation follow-up could not be updated.');
  }
}


function applyDisposition(record, payload, changedAt) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized) return null;
  const stage = consultationStage(payload?.stage, '');
  if (!stage) return null;
  const requestedOutcome = consultationOutcome(payload?.outcome, 'none');
  if (stage === 'closed' && requestedOutcome === 'none') return null;
  if (stage !== 'closed' && requestedOutcome !== 'none') return null;
  const note = text(payload?.note).slice(0, 240);
  const current = normalizeDisposition(normalized);
  const stamp = timestamp(changedAt, new Date().toISOString());
  const stageChanged = stage !== current.stage;
  const outcomeChanged = requestedOutcome !== current.outcome;
  const noteChanged = note !== current.note;
  const reopened = current.stage === 'closed' && stage !== 'closed';
  let activity = normalized.activity;
  if (stageChanged) {
    const detail = reopened
      ? `Consultation reopened at ${stageLabel(stage)}.${note ? ` ${note}` : ''}`
      : `Stage changed from ${stageLabel(current.stage)} to ${stageLabel(stage)}.${note ? ` ${note}` : ''}`;
    activity = appendActivity({ ...normalized, activity }, activityEvent(reopened ? 'consultation_reopened' : 'stage_changed', stamp, detail, 'Producer', normalized.id));
  }
  if (stage === 'closed' && outcomeChanged) {
    const detail = `Final outcome: ${outcomeLabel(requestedOutcome)}.${note ? ` ${note}` : ''}`;
    activity = appendActivity({ ...normalized, activity }, activityEvent('outcome_recorded', stamp, detail, 'Producer', normalized.id));
  } else if (!stageChanged && !outcomeChanged && noteChanged) {
    activity = appendActivity({ ...normalized, activity }, activityEvent('disposition_updated', stamp, note ? `Disposition note updated: ${note}` : 'Disposition note cleared.', 'Producer', normalized.id));
  }
  return {
    ...normalized,
    recordVersion: RECORD_VERSION,
    updatedAt: normalized.updatedAt,
    disposition: {
      stage,
      outcome: stage === 'closed' ? requestedOutcome : 'none',
      note,
      stageUpdatedAt: stageChanged ? stamp : current.stageUpdatedAt,
      outcomeUpdatedAt: stage === 'closed' && outcomeChanged ? stamp : (stage === 'closed' ? current.outcomeUpdatedAt : ''),
      closedAt: stage === 'closed' ? (current.stage === 'closed' && current.closedAt ? current.closedAt : stamp) : '',
      updatedAt: (stageChanged || outcomeChanged || noteChanged) ? stamp : current.updatedAt
    },
    activity
  };
}

export async function handleConsultationDisposition(request, options = {}) {
  if (request.method !== 'PATCH') return error(405, 'method_not_allowed', 'PATCH is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Consultation disposition can only be changed from this CoverageFit site.');
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const parsed = await readJsonBody(request, 18000);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.consultationId || parsed.payload?.id);
  const stage = consultationStage(parsed.payload?.stage, '');
  const outcome = consultationOutcome(parsed.payload?.outcome, 'none');
  if (!ID_PATTERN.test(id)) return error(422, 'invalid_consultation_id', 'A valid opaque consultation ID is required.');
  if (!stage) return error(422, 'invalid_consultation_stage', 'Choose a supported consultation stage.');
  if (stage === 'closed' && outcome === 'none') return error(422, 'outcome_required', 'A final outcome is required when closing a consultation.');
  if (stage !== 'closed' && outcome !== 'none') return error(422, 'outcome_requires_closed_stage', 'A final outcome can only be recorded when the consultation is closed.');
  if (text(parsed.payload?.note).length > 240) return error(422, 'disposition_note_too_long', 'The disposition note must be 240 characters or fewer.');
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  try {
    const key = `${RECORD_PREFIX}${id}`;
    const existing = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!existing) return error(404, 'consultation_not_found', 'The consultation record could not be found.');
    const updated = applyDisposition(existing, parsed.payload, new Date().toISOString());
    if (!updated) return error(422, 'invalid_disposition', 'The consultation stage and outcome could not be applied.');
    await store.setJSON(key, updated, { metadata: recordMetadata(updated) });
    return json({ ok: true, record: summarize(updated) });
  } catch (cause) {
    console.error('CoverageFit consultation disposition update failed', cause);
    return error(503, 'storage_write_failed', 'The consultation disposition could not be updated.');
  }
}

export function applyRecommendationPlan(record, recommendationPlan, changedAt) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized) return null;
  const stamp = timestamp(changedAt, new Date().toISOString());
  const plan = normalizeRecommendationPlan({ recommendationPlan: { ...recommendationPlan, updatedAt: stamp } }, normalized.recommendationPlan);
  if (!plan.items.length) return null;
  if (plan.items.some(item => item.decision === 'recommend' && (!item.verified || !item.producerReason))) return null;
  if (plan.items.some(item => item.decision === 'not_recommended' && !item.producerReason)) return null;
  const prior = JSON.stringify(normalized.recommendationPlan?.items || []);
  const next = JSON.stringify(plan.items);
  const detail = `${plan.summary.recommend} recommended for carrier quote, ${plan.summary.consider} to consider, ${plan.summary.defer} deferred, and ${plan.summary.notRecommended} not recommended.`;
  return {
    ...normalized,
    recordVersion: RECORD_VERSION,
    updatedAt: normalized.updatedAt,
    recommendationPlan: plan,
    activity: prior === next
      ? normalized.activity
      : appendActivity(normalized, activityEvent('recommendation_plan_updated', stamp, detail, 'Producer', normalized.id))
  };
}

export async function handleConsultationRecommendations(request, options = {}) {
  if (request.method !== 'PATCH') return error(405, 'method_not_allowed', 'PATCH is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Consultation recommendations can only be changed from this CoverageFit site.');
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const parsed = await readJsonBody(request, 40000);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.consultationId || parsed.payload?.id);
  const plan = parsed.payload?.recommendationPlan || parsed.payload?.plan;
  if (!ID_PATTERN.test(id)) return error(422, 'invalid_consultation_id', 'A valid opaque consultation ID is required.');
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.items) || !plan.items.length || plan.items.length > 5) {
    return error(422, 'invalid_recommendation_plan', 'A recommendation plan with one to five priority findings is required.');
  }
  for (const item of plan.items) {
    const decision = text(item?.decision, 'undecided').toLowerCase();
    if (!text(item?.findingId || item?.id) || !RECOMMENDATION_DECISIONS.includes(decision)) {
      return error(422, 'invalid_recommendation_item', 'Each recommendation item requires a finding ID and supported producer judgment.');
    }
    if (decision === 'recommend' && item?.verified !== true) {
      return error(422, 'recommendation_verification_required', 'A finding must be producer-verified before it can be recommended.');
    }
    if (['recommend', 'not_recommended'].includes(decision) && !text(item?.producerReason)) {
      return error(422, 'recommendation_reason_required', 'Producer reasoning is required for recommended and not-recommended findings.');
    }
    if (text(item?.producerReason).length > 500) return error(422, 'recommendation_reason_too_long', 'Producer reasoning must be 500 characters or fewer.');
  }
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  try {
    const key = `${RECORD_PREFIX}${id}`;
    const existing = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!existing) return error(404, 'consultation_not_found', 'The consultation record could not be found.');
    const updated = applyRecommendationPlan(existing, plan, new Date().toISOString());
    if (!updated) return error(422, 'invalid_recommendation_plan', 'The recommendation plan could not be applied.');
    await store.setJSON(key, updated, { metadata: recordMetadata(updated) });
    return json({ ok: true, record: summarize(updated) });
  } catch (cause) {
    console.error('CoverageFit consultation recommendation update failed', cause);
    return error(503, 'storage_write_failed', 'The recommendation plan could not be saved.');
  }
}

export function applyChecklistProgress(record, checklistProgress) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized) return null;
  const progress = normalizeChecklistProgress(checklistProgress, normalized.checklistProgress);
  if (!progress) return null;
  return {
    ...normalized,
    recordVersion: RECORD_VERSION,
    updatedAt: normalized.updatedAt,
    checklistProgress: progress
  };
}

export async function handleConsultationChecklist(request, options = {}) {
  if (request.method !== 'PATCH') return error(405, 'method_not_allowed', 'PATCH is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Consultation progress can only be saved from this CoverageFit site.');
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const parsed = await readJsonBody(request, 50000);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.consultationId || parsed.payload?.id);
  const progress = parsed.payload?.checklistProgress;
  if (!ID_PATTERN.test(id)) return error(422, 'invalid_consultation_id', 'A valid opaque consultation ID is required.');
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return error(422, 'invalid_checklist_progress', 'A structured checklist progress record is required.');
  if (progress.storageSchemaVersion !== '1.0' || !text(progress.checklistId) || !text(progress.planFingerprint)) {
    return error(422, 'invalid_checklist_identity', 'Checklist schema and plan identity are required.');
  }
  if (!timestamp(progress.lastUpdatedAt)) return error(422, 'invalid_checklist_timestamp', 'Checklist progress requires a valid update timestamp.');
  if (!Array.isArray(progress.items) || !progress.items.length || progress.items.length > 60) {
    return error(422, 'invalid_checklist_items', 'Checklist progress requires one to sixty items.');
  }
  const itemIds = new Set();
  for (const item of progress.items) {
    const itemId = text(item?.id);
    if (!itemId || itemId.length > 160 || itemIds.has(itemId) || !['pending', 'active', 'complete'].includes(text(item?.status).toLowerCase())) {
      return error(422, 'invalid_checklist_item', 'Each checklist item requires a unique bounded ID and supported status.');
    }
    itemIds.add(itemId);
  }
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  try {
    const key = `${RECORD_PREFIX}${id}`;
    const existing = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!existing) return error(404, 'consultation_not_found', 'The consultation record could not be found.');
    const normalizedExisting = normalizeStoredRecord(existing);
    const stale = checklistUpdatedAt(progress) < checklistUpdatedAt(normalizedExisting?.checklistProgress);
    const updated = applyChecklistProgress(existing, progress);
    if (!updated) return error(422, 'invalid_checklist_progress', 'The checklist progress could not be applied.');
    if (!stale) await store.setJSON(key, updated, { metadata: recordMetadata(updated) });
    return json({ ok: true, stale, record: summarize(stale ? normalizedExisting : updated) });
  } catch (cause) {
    console.error('CoverageFit consultation checklist update failed', cause);
    return error(503, 'storage_write_failed', 'The consultation progress could not be saved.');
  }
}

export function applyConsultationCompletion(record, completion, changedAt) {
  const normalized = normalizeStoredRecord(record);
  if (!normalized) return null;
  if (!text(completion?.decisionSummary) || !text(completion?.nextAction)) return null;
  if (text(completion?.unresolvedState).toLowerCase() === 'open' && !text(completion?.unresolvedSummary)) return null;
  if (text(completion?.quoteState).toLowerCase() === 'needs_items' && !text(completion?.quoteRequirements)) return null;
  const stamp = timestamp(changedAt, new Date().toISOString());
  const value = normalizeConsultationCompletion({ completion: { ...completion, state: 'complete', completedAt: text(completion?.completedAt, stamp), updatedAt: stamp } }, normalized.completion);
  if (!value.decisionSummary || !value.nextAction) return null;
  if (value.unresolvedState === 'open' && !value.unresolvedSummary) return null;
  if (value.quoteState === 'needs_items' && !value.quoteRequirements) return null;
  const currentStageIndex = CONSULTATION_STAGES.indexOf(normalized.disposition.stage);
  const completedStageIndex = CONSULTATION_STAGES.indexOf('consultation_completed');
  const disposition = currentStageIndex < completedStageIndex
    ? { ...normalized.disposition, stage: 'consultation_completed', stageUpdatedAt: stamp, updatedAt: stamp }
    : normalized.disposition;
  const detail = `Completion recorded · unresolved ${value.unresolvedState === 'none' ? 'none' : 'open'} · quote ${value.quoteState.replace(/_/g, ' ')}.`;
  return {
    ...normalized,
    recordVersion: RECORD_VERSION,
    completion: value,
    disposition,
    activity: appendActivity(normalized, activityEvent('consultation_completion_saved', stamp, detail, 'Producer', normalized.id))
  };
}

export async function handleConsultationCompletion(request, options = {}) {
  if (request.method !== 'PATCH') return error(405, 'method_not_allowed', 'PATCH is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Consultation completion can only be saved from this CoverageFit site.');
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const parsed = await readJsonBody(request, 30000);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.consultationId || parsed.payload?.id);
  const completion = parsed.payload?.completion;
  if (!ID_PATTERN.test(id)) return error(422, 'invalid_consultation_id', 'A valid opaque consultation ID is required.');
  if (!completion || typeof completion !== 'object' || Array.isArray(completion)) return error(422, 'invalid_completion', 'A structured consultation completion record is required.');
  if (!text(completion.decisionSummary)) return error(422, 'decision_required', 'Record what the homeowner decided or is considering.');
  if (text(completion.decisionSummary).length > 700) return error(422, 'decision_too_long', 'The decision summary must be 700 characters or fewer.');
  if (!['open', 'none'].includes(text(completion.unresolvedState).toLowerCase())) return error(422, 'invalid_unresolved_state', 'Choose whether unresolved items remain.');
  if (text(completion.unresolvedState).toLowerCase() === 'open' && !text(completion.unresolvedSummary)) return error(422, 'unresolved_summary_required', 'List the unresolved items.');
  if (text(completion.unresolvedSummary).length > 900) return error(422, 'unresolved_summary_too_long', 'The unresolved summary must be 900 characters or fewer.');
  if (!['not_requested', 'ready', 'needs_items', 'requested'].includes(text(completion.quoteState).toLowerCase())) return error(422, 'invalid_quote_state', 'Choose a supported carrier-quote status.');
  if (text(completion.quoteState).toLowerCase() === 'needs_items' && !text(completion.quoteRequirements)) return error(422, 'quote_requirements_required', 'List what is still needed for the carrier quote.');
  if (text(completion.quoteRequirements).length > 900) return error(422, 'quote_requirements_too_long', 'Quote requirements must be 900 characters or fewer.');
  if (!text(completion.nextAction)) return error(422, 'next_action_required', 'Record who will do what next.');
  if (text(completion.nextAction).length > 700) return error(422, 'next_action_too_long', 'The next action must be 700 characters or fewer.');
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  try {
    const key = `${RECORD_PREFIX}${id}`;
    const existing = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!existing) return error(404, 'consultation_not_found', 'The consultation record could not be found.');
    const updated = applyConsultationCompletion(existing, completion, new Date().toISOString());
    if (!updated) return error(422, 'invalid_completion', 'The consultation completion could not be applied.');
    await store.setJSON(key, updated, { metadata: recordMetadata(updated) });
    return json({ ok: true, record: summarize(updated) });
  } catch (cause) {
    console.error('CoverageFit consultation completion update failed', cause);
    return error(503, 'storage_write_failed', 'The consultation completion could not be saved.');
  }
}

export async function handleConsultationActivity(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Consultation activity can only be recorded from this CoverageFit site.');
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  const parsed = await readJsonBody(request, 20000);
  if (parsed.response) return parsed.response;
  const id = text(parsed.payload?.consultationId || parsed.payload?.id);
  const type = text(parsed.payload?.type).toLowerCase();
  if (!ID_PATTERN.test(id)) return error(422, 'invalid_consultation_id', 'A valid opaque consultation ID is required.');
  if (!['producer_note', 'consultation_document_opened', 'customer_report_opened'].includes(type)) {
    return error(422, 'invalid_activity_type', 'Unsupported consultation activity type.');
  }
  const noteBody = text(parsed.payload?.note || parsed.payload?.detail);
  if (type === 'producer_note' && !noteBody) return error(422, 'note_required', 'Enter a producer note before saving.');
  if (noteBody.length > 1000) return error(422, 'note_too_long', 'Producer notes must be 1000 characters or fewer.');
  const store = options.store;
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'The producer inbox storage service is unavailable.');
  try {
    const key = `${RECORD_PREFIX}${id}`;
    const existing = normalizeStoredRecord(await store.get(key, { type: 'json', consistency: 'strong' }));
    if (!existing) return error(404, 'consultation_not_found', 'The consultation record could not be found.');
    const stamp = new Date().toISOString();
    let notes = existing.notes;
    let event;
    if (type === 'producer_note') {
      const note = normalizeProducerNote({ id: `note-${randomUUID()}`, body: noteBody, createdAt: stamp, author: 'Producer' });
      notes = [...notes, note].slice(-MAX_PRODUCER_NOTES);
      event = activityEvent('producer_note', stamp, note.body, note.author, note.id);
    } else {
      const detail = type === 'consultation_document_opened'
        ? 'The producer opened the printable consultation document.'
        : 'The producer opened the customer-facing report.';
      event = activityEvent(type, stamp, detail, 'Producer', id);
    }
    const updated = {
      ...existing,
      recordVersion: RECORD_VERSION,
      updatedAt: existing.updatedAt,
      notes,
      activity: appendActivity({ ...existing, notes }, event)
    };
    await store.setJSON(key, updated, { metadata: recordMetadata(updated) });
    return json({ ok: true, record: summarize(updated) });
  } catch (cause) {
    console.error('CoverageFit consultation activity update failed', cause);
    return error(503, 'storage_write_failed', 'The consultation activity could not be saved.');
  }
}
