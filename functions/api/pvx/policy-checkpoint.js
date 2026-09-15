import { withD1RateLimit } from '../../../server/api-rate-limit.mjs';
import { createPVXRecordStore, createSmsConversationStore } from '../../../server/d1-json-store.mjs';
import { handlePVXPolicyCheckpoint } from '../../../server/pvx-policy-checkpoint-core.mjs';
import { advancePvxSmsJourney, loadPvxSmsJourneyFromRequest } from '../../../server/pvx-sms-journey-core.mjs';
import { hashToken } from '../../../server/pvx-checkpoint-core.mjs';
import { recordLeadMilestone } from '../../../server/lead-operations-core.mjs';
import { advancePvxWebJourney, loadPvxWebJourneyFromRequest } from '../../../server/pvx-web-journey-core.mjs';

export const onRequest = context => withD1RateLimit(context, { route: 'pvx-policy-checkpoint', limit: 20, windowSeconds: 60 }, async () => {
  const db = context.env?.COVERAGEFIT_DB;
  const store = db ? createPVXRecordStore(db) : null;
  const operationsStore = db ? createSmsConversationStore(db) : null;
  const submitted = await context.request.clone().json().catch(() => ({}));
  const response = await handlePVXPolicyCheckpoint(context.request, { store, db, env: context.env || {} });
  if (response.status === 201) {
    const loaded = await loadPvxSmsJourneyFromRequest(context.request, { store });
    if (loaded) await advancePvxSmsJourney(loaded, { store, operationsStore, stage: 'coverage_review_ready', currentStage: 'current-policy', currentStep: 'complete', completedStage: 'coverage_review_ready' });
    const webJourney = await loadPvxWebJourneyFromRequest(context.request, { store });
    if (webJourney) await advancePvxWebJourney(webJourney, { store, db, env: context.env || {}, waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null, stage: 'coverage_review_ready', currentStep: 'complete', completedStage: 'coverage_review_ready' });
    const checkpoint = submitted.token ? await store?.get(`pvx/checkpoint/${await hashToken(String(submitted.token).slice(0,80))}`).catch(() => null) : null;
    if (checkpoint?.attribution?.leadCheckpointId) await recordLeadMilestone(store, checkpoint.attribution.leadCheckpointId, 'policy_review_ready', { db, env: context.env || {}, waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null });
  }
  return response;
});
