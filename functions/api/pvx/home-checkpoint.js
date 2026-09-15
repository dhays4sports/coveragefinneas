import { withD1RateLimit } from '../../../server/api-rate-limit.mjs';
import { createPVXRecordStore, createSmsConversationStore } from '../../../server/d1-json-store.mjs';
import { handlePVXHomeCheckpoint } from '../../../server/pvx-home-checkpoint-core.mjs';
import { advancePvxSmsJourney, loadPvxSmsJourneyFromRequest } from '../../../server/pvx-sms-journey-core.mjs';
import { hashToken } from '../../../server/pvx-checkpoint-core.mjs';
import { recordLeadMilestone } from '../../../server/lead-operations-core.mjs';

export const onRequest = context => withD1RateLimit(context, { route: 'pvx-home-checkpoint', limit: 20, windowSeconds: 60 }, async () => {
  const db = context.env?.COVERAGEFIT_DB;
  const store = db ? createPVXRecordStore(db) : null;
  const operationsStore = db ? createSmsConversationStore(db) : null;
  const submitted = await context.request.clone().json().catch(() => ({}));
  const response = await handlePVXHomeCheckpoint(context.request, { store, db, env: context.env || {} });
  if (response.status === 201) {
    const loaded = await loadPvxSmsJourneyFromRequest(context.request, { store });
    if (loaded) await advancePvxSmsJourney(loaded, { store, operationsStore, stage: 'home_profile_ready', currentStage: 'home-profile', currentStep: 'complete', completedStage: 'home_profile_ready' });
    const checkpoint = submitted.token ? await store?.get(`pvx/checkpoint/${await hashToken(String(submitted.token).slice(0,80))}`).catch(() => null) : null;
    if (checkpoint?.attribution?.leadCheckpointId) await recordLeadMilestone(store, checkpoint.attribution.leadCheckpointId, 'home_profile_ready', { db, env: context.env || {}, waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null });
  }
  return response;
});
