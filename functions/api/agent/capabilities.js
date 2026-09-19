import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { handleAgentCapabilities } from '../../../server/agent-capability-core.mjs';

export const onRequest = context => withD1RateLimit(
  context,
  { route:'agent-capabilities', limit:120, windowSeconds:60 },
  () => handleAgentCapabilities(context.request, { env:context.env || {} })
);
