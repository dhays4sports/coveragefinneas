import {withD1RateLimit} from '../../../server/api-rate-limit.mjs';
import {createPVXRecordStore} from '../../../server/d1-json-store.mjs';
import {handlePVXReadinessReentry} from '../../../server/pvx-readiness-reentry-core.mjs';

export const onRequest=context=>withD1RateLimit(context,{route:'pvx-reentry',limit:30,windowSeconds:60},()=>handlePVXReadinessReentry(context.request,{store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
