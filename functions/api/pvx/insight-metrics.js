import { createPVXRecordStore } from '../../../server/d1-json-store.mjs';
import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { handleInsightAttribution } from '../../../server/pvx-insight-attribution-core.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'pvx-insight-metrics',limit:30,windowSeconds:60},()=>handleInsightAttribution(context.request,{env:context.env||{},store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
