import {repository} from './recommendation-repository.mjs';
import {retryRecommendationNotifications} from './recommendation-notifications.mjs';
import {cleanupProtectionSessions} from './protection-bridge.mjs';
import {cleanupDeviceSessions} from './device-task-bridge.mjs';
import {withD1RateLimit} from './cloudflare-rate-limit.mjs';
import {resolveProducerEnvironment} from './cloudflare-pages-handlers.mjs';
export async function recommendationMaintenance(context){
  const env=await resolveProducerEnvironment(context.env||{}),secret=String(env.COVERAGEFIT_RECOMMENDATION_MAINTENANCE_SECRET||'');
  const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  if(context.request.method!=='POST')return reply({ok:false},405);
  if(env.COVERAGEFIT_RECOMMENDATIONS_ENABLED!=='true'||secret.length<32||!env.COVERAGEFIT_DB)return reply({ok:false,error:'Maintenance is not configured.'},503);
  const expected=`Bearer ${secret}`,actual=context.request.headers.get('authorization')||'';let diff=expected.length^actual.length;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(actual.charCodeAt(i)||0);if(diff)return reply({ok:false},403);
  return withD1RateLimit({...context,env},{route:'recommendation-maintenance',limit:12,windowSeconds:3600,failClosed:true},async()=>{
    try{const opts={env,repo:repository(env.COVERAGEFIT_DB),origin:new URL(context.request.url).origin,fetch:context.fetch||fetch};const attempted=await retryRecommendationNotifications(opts,null,3);if(env.COVERAGEFIT_SMARTDEVICES_ENABLED==='true'){await cleanupDeviceSessions(env.COVERAGEFIT_DB);try{await cleanupProtectionSessions(env.COVERAGEFIT_DB);}catch{/* Optional additive migration may not yet be installed. */}}return reply({ok:true,attempted});}
    catch{return reply({ok:false,error:'Maintenance was interrupted; pending records are retained.'},503);}
  });
}
