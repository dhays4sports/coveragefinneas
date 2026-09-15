import { smsCallbackCron } from '../../../../server/cloudflare-pages-handlers.mjs';
export const onRequest = smsCallbackCron;
