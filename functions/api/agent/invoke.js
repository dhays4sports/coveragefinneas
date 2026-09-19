import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { createPVXRecordStore, createSmsConversationStore } from '../../../server/d1-json-store.mjs';
import { handleAgentCapabilityInvoke } from '../../../server/agent-capability-core.mjs';

export const onRequest = context => withD1RateLimit(
  context,
  { route:'agent-capability-invoke', limit:120, windowSeconds:60, failClosed:true },
  () => handleAgentCapabilityInvoke(context.request, {
    store:context.env?.COVERAGEFIT_DB ? createPVXRecordStore(context.env.COVERAGEFIT_DB) : null,
    smsStore:context.env?.COVERAGEFIT_DB ? createSmsConversationStore(context.env.COVERAGEFIT_DB) : null,
    db:context.env?.COVERAGEFIT_DB || null,
    env:context.env || {},
    waitUntil:typeof context.waitUntil === 'function' ? context.waitUntil.bind(context) : null
  })
);
