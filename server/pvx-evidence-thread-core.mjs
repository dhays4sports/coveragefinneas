import { validReviewTopic } from './pvx-meaningful-signal-core.mjs';

const text = (value, max = 320) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);
const RESPONSE_STATES = new Set(['relevant','explain','cost_first','unsure']);

export function evidenceThread(topic = {}, scanOrder = 1) {
  if (!validReviewTopic(topic)) return null;
  return Object.freeze({
    schemaVersion: '1.0',
    recordType: 'advisoryReviewTopic',
    topicKey: text(topic.topicKey, 80),
    scanOrder: Math.max(1, Math.min(3, Number(scanOrder) || 1)),
    scanLabel: String(Math.max(1, Math.min(3, Number(scanOrder) || 1))).padStart(2,'0'),
    label: text(topic.label, 120),
    status: 'worth_reviewing',
    becauseYouToldUs: text(topic.becauseYouToldUs, 320),
    whyWorthReviewing: text(topic.whyWorthReviewing, 480),
    whatDylanWouldWantToUnderstand: text(topic.whatDylanWouldWantToUnderstand, 480),
    evidenceRefs: topic.evidenceRefs.slice(0, 6).map(ref => text(typeof ref === 'string' ? ref : ref?.key, 120)).filter(Boolean),
    recommendation: false,
    severity: null,
    protectionScore: null
  });
}

export function producerEvidenceProjection(topics = [], responses = []) {
  const responseByKey = new Map((Array.isArray(responses) ? responses : []).filter(item => RESPONSE_STATES.has(item?.state)).map(item => [String(item.topicKey), item]));
  return (Array.isArray(topics) ? topics : []).map((topic,index) => evidenceThread(topic,index+1)).filter(Boolean).map(thread => ({
    ...thread,
    response: responseByKey.has(thread.topicKey) ? {
      recordType: 'topicResponse',
      state: responseByKey.get(thread.topicKey).state,
      recommendationResponse: false,
      bindAuthorization: false
    } : null
  }));
}
