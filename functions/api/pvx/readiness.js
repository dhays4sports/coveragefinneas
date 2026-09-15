import {withD1RateLimit} from '../../../server/api-rate-limit.mjs';
import {createPVXRecordStore} from '../../../server/d1-json-store.mjs';
import {handlePVXReadiness} from '../../../server/pvx-readiness-api-core.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'pvx-readiness',limit:45,windowSeconds:60},()=>handlePVXReadiness(context.request,{store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
