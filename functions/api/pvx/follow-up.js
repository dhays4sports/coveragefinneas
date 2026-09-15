import {withD1RateLimit} from '../../../server/api-rate-limit.mjs';
import {createPVXRecordStore} from '../../../server/d1-json-store.mjs';
import {handlePVXFollowUpPreferences} from '../../../server/pvx-followup-preferences-core.mjs';

export const onRequest=context=>withD1RateLimit(context,{route:'pvx-follow-up',limit:30,windowSeconds:60},()=>handlePVXFollowUpPreferences(context.request,{store:context.env?.COVERAGEFIT_DB?createPVXRecordStore(context.env.COVERAGEFIT_DB):null}));
