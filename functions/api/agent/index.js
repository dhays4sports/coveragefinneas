import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { agentCapabilityManifest } from '../../../server/agent-capability-core.mjs';

const headers = {
  'Cache-Control':'public, max-age=300, must-revalidate',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff'
};

function handle(request, env = {}) {
  if (request.method !== 'GET') {
    return Response.json({ ok:false, error:{ code:'method_not_allowed', message:'GET is required.' } }, { status:405, headers });
  }
  return Response.json({
    ok:true,
    ...agentCapabilityManifest(env),
    apiBase:'https://coveragefit.com/api/agent',
    documentation:'https://coveragefit.com/docs/agent-api/',
    openapi:'https://coveragefit.com/openapi.json',
    endpoints:{
      capabilities:'https://coveragefit.com/api/agent/capabilities',
      invoke:'https://coveragefit.com/api/agent/invoke'
    },
    support:'https://coveragefit.com/support/',
    privacy:'https://coveragefit.com/privacy/',
    terms:'https://coveragefit.com/terms/'
  }, { headers });
}

export const onRequest = context => withD1RateLimit(
  context,
  { route:'agent-api-root', limit:120, windowSeconds:60 },
  () => handle(context.request, context.env || {})
);
