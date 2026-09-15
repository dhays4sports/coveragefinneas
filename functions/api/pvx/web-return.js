import { withD1RateLimit } from '../../../server/cloudflare-rate-limit.mjs';
import { createPVXRecordStore } from '../../../server/d1-json-store.mjs';
import { handlePvxWebReturn } from '../../../server/pvx-web-journey-core.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'pvx-web-return',limit:30,windowSeconds:60},()=>handlePvxWebReturn(context.request,{store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
