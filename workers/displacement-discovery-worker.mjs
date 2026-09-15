import {createPVXRecordStore} from '../server/d1-json-store.mjs';
import {runDiscoveryCycle,DISCOVERY_BUILD} from '../server/displacement-discovery-core.mjs';

export default {
  async scheduled(controller,env,ctx){
    if(!env?.COVERAGEFIT_DB){console.error(`${DISCOVERY_BUILD}: COVERAGEFIT_DB binding missing`);return}
    const store=createPVXRecordStore(env.COVERAGEFIT_DB);
    ctx.waitUntil(runDiscoveryCycle({env,store,mode:'scheduled'}).then(result=>console.log(`${DISCOVERY_BUILD}: scheduled discovery`,JSON.stringify({ok:result.ok,added:result.added||0,requests:result.apiRequests||0,budgetStopped:result.budgetStopped||false}))).catch(error=>console.error(`${DISCOVERY_BUILD}: scheduled discovery failed`,error)));
  }
};
