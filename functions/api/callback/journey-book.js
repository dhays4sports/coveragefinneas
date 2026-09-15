import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { createPVXRecordStore, createSmsConversationStore } from '../../../server/d1-json-store.mjs';
import { handleJourneyWebBooking } from '../../../server/callback-web-booking-core.mjs';

export const onRequest = context => withD1RateLimit(
  context,
  { route:'callback-journey-book', limit:12, windowSeconds:60 },
  () => handleJourneyWebBooking(context.request, {
    store:context.env?.COVERAGEFIT_DB ? createSmsConversationStore(context.env.COVERAGEFIT_DB) : null,
    leadStore:context.env?.COVERAGEFIT_DB ? createPVXRecordStore(context.env.COVERAGEFIT_DB) : null,
    db:context.env?.COVERAGEFIT_DB || null,
    env:context.env || {},
    waitUntil:typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null
  })
);
