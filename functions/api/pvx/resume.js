import { withD1RateLimit } from '../../../server/api-rate-limit.mjs';
import { createPVXRecordStore } from '../../../server/d1-json-store.mjs';
import { handlePVXResume } from '../../../server/pvx-resume-core.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'pvx-resume',limit:45,windowSeconds:60},()=>handlePVXResume(context.request,{store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
