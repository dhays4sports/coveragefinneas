import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { createPVXRecordStore } from '../../../server/d1-json-store.mjs';
import { handlePvxWebJourney } from '../../../server/pvx-web-journey-core.mjs';

export const onRequest = context => withD1RateLimit(
  context,
  { route: 'pvx-web-journey', limit: 180, windowSeconds: 60 },
  () => handlePvxWebJourney(context.request, {
    store: context.env?.COVERAGEFIT_DB ? createPVXRecordStore(context.env.COVERAGEFIT_DB) : null,
    db: context.env?.COVERAGEFIT_DB || null,
    env: context.env || {}
  })
);

