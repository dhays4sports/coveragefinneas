import {withD1RateLimit} from '../../../server/cloudflare-rate-limit.mjs';
import {analyzeOutreachOpportunity} from '../../../server/displacement-outreach-core.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'displacement-outreach-ai',limit:30,windowSeconds:60},()=>analyzeOutreachOpportunity(context.request,{env:context.env||{}}));
