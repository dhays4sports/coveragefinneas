import {withD1RateLimit} from '../../../server/cloudflare-rate-limit.mjs';
import {createPVXRecordStore} from '../../../server/d1-json-store.mjs';
import {handleOutreachOpportunities} from '../../../server/displacement-outreach-core.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'displacement-outreach-opportunities',limit:90,windowSeconds:60},()=>handleOutreachOpportunities(context.request,{env:context.env||{},store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
