import {
  appendReadinessExpression,
  appendChangeScopeExpression,
  appendImmutable,
  clearCurrentExpression,
  readinessState,
  extendReadinessRecord
} from './pvx-readiness-core.mjs';
import { TOKEN_PATTERN, hashToken } from './pvx-checkpoint-core.mjs';

const clean=(value,max=240)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,code,message)=>json({ok:false,error:{code,message}},status);
const sameOrigin=request=>{try{const url=new URL(request.url),origin=request.headers.get('Origin');return!origin||origin===url.origin;}catch(_){return false;}};

async function readBody(request){const raw=await request.text();if(raw.length>24000)return{response:fail(413,'payload_too_large','The readiness update is too large.')};try{return{value:JSON.parse(raw||'{}')}}catch(_){return{response:fail(400,'invalid_json','Valid JSON is required.')}}}
function publicState(record){const state=readinessState(record);return{currentActionReadiness:state.currentActionReadiness?{state:state.currentActionReadiness.state,sourceCheckpoint:state.currentActionReadiness.sourceCheckpoint,expressedAt:state.currentActionReadiness.expressedAt}:null,currentChangeScope:state.currentChangeScope?{scope:state.currentChangeScope.scope,sourceCheckpoint:state.currentChangeScope.sourceCheckpoint,expressedAt:state.currentChangeScope.expressedAt}:null,currentDesiredNextAction:state.currentDesiredNextAction?{action:state.currentDesiredNextAction.action,sourceCheckpoint:state.currentDesiredNextAction.sourceCheckpoint,selectedAt:state.currentDesiredNextAction.selectedAt}:null,missingReadiness:state.missingReadiness,missingChangeScope:state.missingChangeScope,inferred:false};}

export async function handlePVXReadiness(request,{store,now=new Date(),cryptoApi=globalThis.crypto}={}){
  if(request.method!=='POST')return fail(405,'method_not_allowed','POST is required.');
  if(!sameOrigin(request))return fail(403,'origin_rejected','The readiness request must come from CoverageFit.');
  if(!store?.get||!store?.setJSON)return fail(503,'storage_unavailable','Secure journey storage is unavailable.');
  const parsed=await readBody(request);if(parsed.response)return parsed.response;
  const token=clean(parsed.value?.token,80);if(!TOKEN_PATTERN.test(token))return fail(404,'journey_unavailable','This CoverageFit journey is unavailable.');
  const key=`pvx/checkpoint/${await hashToken(token,cryptoApi)}`,stored=await store.get(key);
  if(!stored||Date.parse(stored.expiresAt)<=now.getTime())return fail(404,'journey_unavailable','This CoverageFit journey is unavailable.');
  const action=clean(parsed.value?.action,40)||'read';let next=extendReadinessRecord(stored);
  try{
    if(action==='append_readiness')next=appendReadinessExpression(next,parsed.value.expression);
    else if(action==='append_change_scope')next=appendChangeScopeExpression(next,parsed.value.expression);
    else if(action==='append_desired_action')next=appendImmutable(next,'desiredNextActions',parsed.value.expression);
    else if(action==='clear_readiness')next=clearCurrentExpression(next,'actionReadinessExpressions',parsed.value.expression);
    else if(action==='clear_change_scope')next=clearCurrentExpression(next,'changeScopeExpressions',parsed.value.expression);
    else if(action!=='read')return fail(422,'unsupported_action','That readiness action is not supported.');
  }catch(error){return fail(422,'invalid_expression',error.message);}
  if(action!=='read')await store.setJSON(key,next,{metadata:{createdAt:stored.createdAt,updatedAt:now.toISOString(),expiresAt:stored.expiresAt,checkpointType:stored.checkpointType,readinessUpdated:true}});
  return json({ok:true,state:publicState(next),historyCounts:{actionReadinessExpressions:next.actionReadinessExpressions.length,changeScopeExpressions:next.changeScopeExpressions.length}});
}
