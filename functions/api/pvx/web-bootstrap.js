import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { createPVXRecordStore, createReferralLinkStore } from '../../../server/d1-json-store.mjs';
import { handlePvxWebBootstrap } from '../../../server/pvx-web-journey-core.mjs';

export const onRequest = context => withD1RateLimit(
  context,
  { route: 'pvx-web-bootstrap', limit: 30, windowSeconds: 60 },
  () => handlePvxWebBootstrap(context.request, {
    store: context.env?.COVERAGEFIT_DB ? createPVXRecordStore(context.env.COVERAGEFIT_DB) : null,
    referralStore: context.env?.COVERAGEFIT_DB ? createReferralLinkStore(context.env.COVERAGEFIT_DB) : null,
    db: context.env?.COVERAGEFIT_DB || null,
    env: context.env || {},
    waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null
  })
);
