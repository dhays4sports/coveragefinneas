import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { createPVXRecordStore } from '../../../server/d1-json-store.mjs';
import { handleLeadIntake } from '../../../server/lead-operations-core.mjs';

export const onRequest = context => withD1RateLimit(
  context,
  { route: 'lead-intake', limit: 240, windowSeconds: 60 },
  () => handleLeadIntake(context.request, {
    store: context.env?.COVERAGEFIT_DB ? createPVXRecordStore(context.env.COVERAGEFIT_DB) : null,
    db: context.env?.COVERAGEFIT_DB || null,
    env: context.env || {},
    waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null
  })
);

