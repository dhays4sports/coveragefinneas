import {handleSoloDesk} from '../../../server/solo-desk-api.mjs';
import {withD1RateLimit} from '../../../server/cloudflare-rate-limit.mjs';
export const onRequest=context=>withD1RateLimit(context,{route:'solo-desk',limit:180,windowSeconds:60},()=>handleSoloDesk(context));
