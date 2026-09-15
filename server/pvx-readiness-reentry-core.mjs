import {TOKEN_PATTERN,hashToken} from './pvx-checkpoint-core.mjs';

export const REENTRY_REASONS=Object.freeze({
  renewal_approaching:{label:'My renewal is approaching.',materialContextChanged:true,projectionField:'why_now',changeScopeRelevant:false},
  premium_changed:{label:'My premium changed.',materialContextChanged:true,projectionField:'why_now',changeScopeRelevant:false},
  considering_comparison:{label:'I’m considering a comparison.',materialContextChanged:true,projectionField:'desired_next_action',changeScopeRelevant:true},
  ready_to_continue:{label:'I’m ready to continue.',materialContextChanged:false,projectionField:'none',changeScopeRelevant:false}
});

const clean=(value,max=500)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,code,message)=>json({ok:false,error:{code,message}},status);
const sameOrigin=request=>{try{const url=new URL(request.url),origin=request.headers.get('Origin');return!origin||origin===url.origin;}catch{return false;}};

function routeForResume(resumeState={}){
  const stage=clean(resumeState.exactStage,80);
  if(/home[-_ ]?profile/i.test(stage))return'/pvx/home-profile/';
  if(/policy|coverage[-_ ]?review/i.test(stage))return'/pvx/policy/';
  if(/discovery|address|entry/i.test(stage))return'/pvx/discovery/';
  if(/snapshot|result/i.test(stage))return'/pvx/snapshot/';
  return'/pvx/continue/';
}

export function reentryPlan(reasonKey,record={}){
  const reason=REENTRY_REASONS[reasonKey];
  if(!reason)return null;
  return Object.freeze({reasonKey,label:reason.label,materialContextChanged:reason.materialContextChanged,readinessRefreshAvailable:reason.materialContextChanged,readinessRefreshRequired:false,changeScopeRelevant:reason.changeScopeRelevant,changeScopeRequired:false,exactStage:clean(record.resumeState?.exactStage,80)||'continuation',exactStep:clean(record.resumeState?.exactStep,80)||'choice',route:routeForResume(record.resumeState),guardrails:{readinessInferred:false,changeScopeInferred:false,leadCreated:false,contactPlanCreated:false,protectionScoreChanged:false,recommendationCreated:false}});
}

function projectionDelta(reasonKey,priorReasonKey=''){
  if(reasonKey===priorReasonKey)return null;
  if(reasonKey==='renewal_approaching')return{type:'changed',field:'why_now',explanation:'Your CoverageFit now reflects that your renewal is approaching.',evidenceRefs:['customer_update:renewal_approaching']};
  if(reasonKey==='premium_changed')return{type:'changed',field:'why_now',explanation:'Your CoverageFit now reflects that your premium changed.',evidenceRefs:['customer_update:premium_changed']};
  return null;
}

export async function handlePVXReadinessReentry(request,{store,now=new Date(),cryptoApi=globalThis.crypto}={}){
  if(request.method!=='POST')return fail(405,'method_not_allowed','POST is required.');
  if(!sameOrigin(request))return fail(403,'origin_rejected','The return update must come from CoverageFit.');
  if(!store?.get||!store?.setJSON)return fail(503,'storage_unavailable','Secure journey storage is unavailable.');
  let body;try{const raw=await request.text();if(raw.length>24000)return fail(413,'payload_too_large','The return update is too large.');body=JSON.parse(raw||'{}');}catch{return fail(400,'invalid_json','Valid JSON is required.');}
  const token=clean(body.token,80),reasonKey=clean(body.reasonKey,60),exactWords=clean(body.exactWords,500);
  if(!TOKEN_PATTERN.test(token))return fail(404,'journey_unavailable','This CoverageFit journey is unavailable.');
  const key=`pvx/checkpoint/${await hashToken(token,cryptoApi)}`,record=await store.get(key);
  if(!record||Date.parse(record.expiresAt)<=now.getTime())return fail(404,'journey_unavailable','This CoverageFit journey is unavailable.');
  const plan=reentryPlan(reasonKey,record);if(!plan)return fail(422,'reason_required','Choose why you are returning.');
  const prior=[...(record.reentryUpdates||[])].at(-1)||null,at=now.toISOString(),duplicate=prior?.reasonKey===reasonKey&&prior?.exactCustomerWords===exactWords,delta=duplicate?null:projectionDelta(reasonKey,prior?.reasonKey||'');
  const update={updateId:duplicate?prior.updateId:`pvu_${at.replace(/\D/g,'')}`,reasonKey,label:plan.label,exactCustomerWords:exactWords,source:'customer_entered',selectedAt:duplicate?prior.selectedAt:at,materialContextChanged:plan.materialContextChanged,projectionDelta:delta,inferred:false};
  if(!duplicate)record.reentryUpdates=[...(record.reentryUpdates||[]),update];
  record.resumeState={...(record.resumeState||{}),status:'active',updatedAt:at};
  await store.setJSON(key,record,{metadata:{createdAt:record.createdAt,updatedAt:at,expiresAt:record.expiresAt,reentryReason:reasonKey}});
  return json({ok:true,created:!duplicate,update,plan,deltaCreated:Boolean(delta),delta,resumeState:record.resumeState},duplicate?200:201);
}

export function latestReentryUpdate(record={}){
  const item=[...(record.reentryUpdates||[])].sort((a,b)=>String(a.selectedAt||'').localeCompare(String(b.selectedAt||''))).at(-1)||null;
  return item?{reasonKey:item.reasonKey,label:item.label,selectedAt:item.selectedAt,materialContextChanged:item.materialContextChanged===true,projectionDelta:item.projectionDelta||null,inferred:false}:null;
}
