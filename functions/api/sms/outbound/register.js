import { smsOutboundRegister } from '../../../../server/cloudflare-pages-handlers.mjs';
export const onRequest = smsOutboundRegister;
