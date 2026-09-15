import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { createSmsConversationStore } from '../../../server/d1-json-store.mjs';
import { handleSignedWebBooking } from '../../../server/callback-web-booking-core.mjs';

export const onRequest = context => withD1RateLimit(
  context,
  { route:'callback-web-book', limit:30, windowSeconds:60 },
  () => handleSignedWebBooking(context.request, {
    store:context.env?.COVERAGEFIT_DB ? createSmsConversationStore(context.env.COVERAGEFIT_DB) : null,
    db:context.env?.COVERAGEFIT_DB || null,
    env:context.env || {},
    waitUntil:typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null
  })
);
