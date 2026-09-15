import {TOKEN_PATTERN,hashToken} from './pvx-checkpoint-core.mjs';

export const SUCCESS_STATES=Object.freeze(['continue_later','exploring']);
export const CAMPAIGN_DISPOSITIONS=Object.freeze(['active','contact_declined','continue_later','exploring']);
const clean=(value,max=240)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,code,message)=>json({ok:false,error:{code,message}},status);
const sameOrigin=request=>{try{const url=new URL(request.url),origin=request.headers.get('Origin');return!origin||origin===url.origin;}catch{return false;}};

export function reminderDecision(record={},channel,now=new Date()){
  const requested=record.consent?.contact===true&&!record.contactRequestCanceledAt,permitted=channel==='sms'?record.consent?.sms===true&&record.globalSmsSuppressed!==true:channel==='call'?record.consent?.call===true:channel==='email'?record.consent?.email===true:false;
  if(!requested)return{allowed:false,reason:'no_active_contact_request'};
  if(!permitted)return{allowed:false,reason:channel==='sms'?'sms_not_permitted_or_suppressed':'channel_not_permitted'};
  if(record.globalDnc===true||record.smsSuppression?.status==='opted_out')return{allowed:false,reason:'global_suppression'};
  const reminders=(record.followUpReminders||[]).filter(item=>item.channel===channel),latest=reminders.at(-1),requestAt=Date.parse(record.contactRequestedAt||record.createdAt||'');
  if(reminders.length>=2)return{allowed:false,reason:'bounded_limit_reached'};
  if(Number.isFinite(requestAt)&&now.getTime()-requestAt>7*86400000)return{allowed:false,reason:'request_window_expired'};
  if(latest&&now.getTime()-Date.parse(latest.sentAt)<24*3600000)return{allowed:false,reason:'minimum_interval'};
  return{allowed:true,reason:'explicit_active_channel_permission',remaining:2-reminders.length};
}

function publicPreferences(record={}){return{campaignDisposition:record.campaignDisposition||'active',contactRequested:record.consent?.contact===true&&!record.contactRequestCanceledAt,preferredMethod:record.contact?.preferredMethod||'',contactRequestCanceledAt:record.contactRequestCanceledAt||'',globalDncChanged:false,globalSmsConsentChanged:false,reportAvailable:Boolean(record.snapshot),selfServiceAvailable:true};}

export async function handlePVXFollowUpPreferences(request,{store,now=new Date(),cryptoApi=globalThis.crypto}={}){
  if(request.method!=='POST')return fail(405,'method_not_allowed','POST is required.');
  if(!sameOrigin(request))return fail(403,'origin_rejected','The preference update must come from CoverageFit.');
  if(!store?.get||!store?.setJSON)return fail(503,'storage_unavailable','Secure journey storage is unavailable.');
  let body;try{const raw=await request.text();if(raw.length>16000)return fail(413,'payload_too_large','The preference update is too large.');body=JSON.parse(raw||'{}');}catch{return fail(400,'invalid_json','Valid JSON is required.');}
  const token=clean(body.token,80);if(!TOKEN_PATTERN.test(token))return fail(404,'journey_unavailable','This CoverageFit journey is unavailable.');
  const key=`pvx/checkpoint/${await hashToken(token,cryptoApi)}`,record=await store.get(key);if(!record||Date.parse(record.expiresAt)<=now.getTime())return fail(404,'journey_unavailable','This CoverageFit journey is unavailable.');
  const action=clean(body.action,40),at=now.toISOString();
  if(action==='decline_session'){
    const sessionId=clean(body.sessionId,100);if(!sessionId)return fail(422,'session_required','A private session id is required.');
    const duplicate=(record.contactPromptDeclines||[]).some(item=>item.sessionId===sessionId);if(!duplicate)record.contactPromptDeclines=[...(record.contactPromptDeclines||[]),{sessionId,declinedAt:at,scope:'same_session',source:'customer_entered'}];record.campaignDisposition='contact_declined';
  }else if(action==='record_success_state'){
    const state=clean(body.state,40);if(!SUCCESS_STATES.includes(state))return fail(422,'invalid_success_state','That customer state is not supported.');record.campaignDisposition=state;record.customerSuccessStates=[...(record.customerSuccessStates||[]),{state,selectedAt:at,source:'customer_entered',abandonment:false}];
  }else if(action==='cancel_contact'){
    record.contactRequestHistory=[...(record.contactRequestHistory||[]),{action:'canceled',occurredAt:at,source:'customer_entered',priorPreferredMethod:record.contact?.preferredMethod||''}];record.contactRequestCanceledAt=at;record.consent={...(record.consent||{}),contact:false,sms:false,call:false,email:false};record.producerNotification={...(record.producerNotification||{}),status:'canceled'};record.campaignDisposition='contact_declined';
  }else if(action==='update_channel'){
    if(record.consent?.contact!==true||record.contactRequestCanceledAt)return fail(409,'no_active_contact_request','There is no active contact request to update.');
    const method=clean(body.preferredMethod,20);if(!['call','text','email'].includes(method))return fail(422,'invalid_channel','Choose call, text or email.');
    if(method==='call'&&!record.contact?.mobile)return fail(422,'mobile_required','A mobile number is required for a call request.');if(method==='email'&&!record.contact?.email)return fail(422,'email_required','An email address is required for an email request.');if(method==='text'&&record.consent?.sms!==true)return fail(409,'sms_permission_required','Text cannot be selected without existing SMS permission.');
    record.contactRequestHistory=[...(record.contactRequestHistory||[]),{action:'channel_updated',occurredAt:at,source:'customer_entered',priorPreferredMethod:record.contact?.preferredMethod||'',preferredMethod:method}];record.contact={...(record.contact||{}),preferredMethod:method,requestType:method};record.consent={...(record.consent||{}),call:method==='call',email:method==='email',sms:method==='text'&&record.consent?.sms===true};
  }else return fail(422,'unsupported_action','That follow-up preference action is not supported.');
  await store.setJSON(key,record,{metadata:{createdAt:record.createdAt,updatedAt:at,expiresAt:record.expiresAt,followUpPreferenceUpdated:true}});
  return json({ok:true,preferences:publicPreferences(record)});
}

