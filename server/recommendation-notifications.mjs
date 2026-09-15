import { notificationConfig } from './producer-notification.mjs';
import { clean } from '../assets/js/recommendation-model.mjs';
export async function deliverRecommendationNotification(event,options) {
  const {repo,env,origin}=options;
  if(!await repo.claimNotification(event.id)) return;
  const config=notificationConfig(env,origin);
  if(!config.configured) {await repo.finishNotification(event.id,false,'Producer email alerts are not configured.');return;}
  try {
    const record=await repo.get(event.recommendation_id);
    const label={proceed:'READY TO PROCEED',question:'CLIENT QUESTION',item:'CLIENT RESPONSE',device_update:'DEVICE NEXT STEP',appointment:'APPOINTMENT CONFIRMED',reschedule:'APPOINTMENT UPDATED',booking_pending:'APPOINTMENT NEEDS CONFIRMATION'}[event.kind] || 'CLIENT UPDATE';
    const lines=[label,record.draft.contact.name,`Recommendation version ${event.revision}`,clean(event.payload?.message,1200),clean(event.payload?.display,200),`Phone: ${record.draft.contact.mobile || 'See appointment details'}`,`Email: ${record.draft.contact.email || 'Not recorded'}`,`${origin}/agent/recommendations/?id=${record.id}`].filter(Boolean);
    const response=await (options.fetch || fetch)('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`cf-recommend-${event.id}`},body:JSON.stringify({from:config.from,to:[config.to],subject:`${label}: ${record.draft.contact.name}`,text:lines.join('\n'),...(config.replyTo?{reply_to:config.replyTo}:{})})});
    if(!response.ok) throw new Error(`Producer alert returned ${response.status}.`);
    await repo.finishNotification(event.id,true);
  } catch(error) {await repo.finishNotification(event.id,false,clean(error.message,200));}
}
export async function retryRecommendationNotifications(options,id=null,max=30) {
  const pending=await options.repo.pendingNotifications(id);
  const bounded=pending.slice(0,max);
  for(const event of bounded) await deliverRecommendationNotification(event,options);
  return bounded.length;
}
