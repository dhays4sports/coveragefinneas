import {withD1RateLimit} from '../../../server/cloudflare-rate-limit.mjs';
import {createPVXRecordStore} from '../../../server/d1-json-store.mjs';
import {handleOutreachDiscovery} from '../../../server/displacement-discovery-core.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'displacement-outreach-discovery',limit:12,windowSeconds:60},()=>handleOutreachDiscovery(context.request,{env:context.env||{},store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
