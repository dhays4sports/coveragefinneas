import { smsSend } from '../../../server/cloudflare-pages-handlers.mjs';
export const onRequest = smsSend;
