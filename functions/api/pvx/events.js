import { createPVXRecordStore } from '../../../server/d1-json-store.mjs';
import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { handlePvxEvent } from '../../../server/pvx-event-core.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'pvx-meaningful-events',limit:180,windowSeconds:60},()=>handlePvxEvent(context.request,{store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
