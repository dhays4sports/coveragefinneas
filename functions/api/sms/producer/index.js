import { smsProducerHandoff } from '../../../../server/cloudflare-pages-handlers.mjs';
export const onRequest = smsProducerHandoff;
