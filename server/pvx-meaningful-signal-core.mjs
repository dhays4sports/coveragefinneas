export const MEANINGFUL_SIGNAL_BUILD = 'CF-PVX-INSIGHT-1.0';
export const MEANINGFUL_SIGNAL_SCHEMA = '1.0';
export const MAX_REVIEW_TOPICS = 3;

export const SIGNAL_CLASSES = Object.freeze({
  customer_answer: Object.freeze({ customerSafe: true, provenanceRequired: true }),
  discovery_fact: Object.freeze({ customerSafe: true, provenanceRequired: true }),
  advisory_review_topic: Object.freeze({ customerSafe: true, provenanceRequired: true }),
  topic_response: Object.freeze({ customerSafe: true, provenanceRequired: true }),
  property_fact: Object.freeze({ customerSafe: true, provenanceRequired: true }),
  evidence_quality: Object.freeze({ customerSafe: true, provenanceRequired: true }),
  recommendation: Object.freeze({ customerSafe: true, provenanceRequired: true, meaningfulPolicyEvidenceRequired: true }),
  protection_score: Object.freeze({ customerSafe: true, meaningfulPolicyEvidenceRequired: true }),
  workflow_state: Object.freeze({ customerSafe: true, provenanceRequired: false }),
  producer_status: Object.freeze({ customerSafe: 'projection_only', provenanceRequired: true }),
  attribution: Object.freeze({ customerSafe: false, provenanceRequired: true }),
  internal_only: Object.freeze({ customerSafe: false, provenanceRequired: true })
});

export const INSIGHT_DELTA_STATES = Object.freeze([
  'added', 'confirmed', 'changed', 'resolved', 'still_needed', 'removed_due_to_stale_evidence'
]);

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

export function validReviewTopic(topic) {
  return Boolean(
    topic &&
    topic.status === 'worth_reviewing' &&
    topic.recommendation === false &&
    Array.isArray(topic.evidenceRefs) &&
    topic.evidenceRefs.length > 0 &&
    String(topic.topicKey || '').trim() &&
    String(topic.label || '').trim()
  );
}

export function orderedReviewTopics(snapshot = {}) {
  const seen = new Set();
  return (Array.isArray(snapshot.whatDylanWouldLookAtFirst) ? snapshot.whatDylanWouldLookAtFirst : [])
    .filter(validReviewTopic)
    .filter(topic => {
      const key = String(topic.topicKey);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_REVIEW_TOPICS)
    .map((topic, index) => ({ ...clone(topic), scanOrder: index + 1, scanLabel: String(index + 1).padStart(2, '0') }));
}

export function snapshotSignalSurface(snapshot = {}) {
  const topics = orderedReviewTopics(snapshot);
  return Object.freeze({
    schemaVersion: MEANINGFUL_SIGNAL_SCHEMA,
    contractId: 'coveragefit-meaningful-signal-surface-v1',
    build: MEANINGFUL_SIGNAL_BUILD,
    title: 'Your CoverageFit Snapshot',
    topicCount: topics.length,
    countLabel: topics.length === 0 ? 'No forced areas to review' : `${topics.length} ${topics.length === 1 ? 'area' : 'areas'} worth reviewing`,
    primaryTopic: topics[0] || null,
    topics,
    numberingMeaning: 'scan_order_only',
    recommendations: [],
    policyFindings: [],
    protectionScore: null,
    guardrails: Object.freeze({
      discoveryOnly: true,
      currentPolicyEvaluated: false,
      policyDeficiencyFound: false,
      severityRanking: false,
      fakeActivity: false
    })
  });
}

export function validInsightDelta(delta = {}) {
  return Boolean(
    INSIGHT_DELTA_STATES.includes(delta.state) &&
    String(delta.key || '').trim() &&
    Array.isArray(delta.evidenceRefs) &&
    delta.evidenceRefs.length > 0 &&
    delta.recommendation !== true &&
    delta.eligibilityDecision !== true
  );
}
