import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { createPVXRecordStore } from '../../../server/d1-json-store.mjs';
import { handleLeadRetry } from '../../../server/lead-operations-core.mjs';

export const onRequest = context => withD1RateLimit(
  context,
  { route: 'lead-retry', limit: 12, windowSeconds: 60 },
  () => handleLeadRetry(context.request, {
    store: context.env?.COVERAGEFIT_DB ? createPVXRecordStore(context.env.COVERAGEFIT_DB) : null,
    env: context.env || {}
  })
);

