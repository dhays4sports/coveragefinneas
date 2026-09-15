import {DEVICE_STATES} from '../assets/js/device-task-model.mjs';
const encoder=new TextEncoder(), UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const deviceFail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
export const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export async function deviceSignature(secret,text){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
export function bridgeConfig(env){
  if(env.COVERAGEFIT_SMARTDEVICES_ENABLED!=='true'||String(env.SMARTDEVICES_BRIDGE_SECRET||'').length<32)deviceFail(503,'device_disabled','Connected device guidance is not activated. Your insurance review still works; ask Dylan for help.');
  let origin;try{origin=new URL(env.SMARTDEVICES_ORIGIN);}catch{deviceFail(503,'device_origin','The device connection needs configuration.');}
  if(origin.protocol!=='https:'||origin.origin!==env.SMARTDEVICES_ORIGIN||origin.username||origin.password)deviceFail(503,'device_origin','The device connection needs an exact HTTPS origin.');
  return {origin:origin.origin,secret:env.SMARTDEVICES_BRIDGE_SECRET};
}
const selectTask=(revision,optionId,policyId)=>{const option=revision.payload.options.find(o=>o.id===optionId),policy=option?.policies.find(p=>p.id===policyId);if(!policy?.deviceTask?.enabled)deviceFail(404,'device_task','This device task is unavailable.');return {option,policy,task:policy.deviceTask};};
function current(record,revision,option,policy){
  if(!revision||revision.revoked_at||Date.parse(revision.expires_at)<=Date.now())deviceFail(410,'review_expired','Return to Dylan for a current review.');
  if(record.current_revision!==revision.revision)deviceFail(409,'superseded','The insurance recommendation changed. Reopen the latest review before updating this task.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const producerRecordedBound=policy?.deviceTask?.kind==='after-binding'&&['bound','partial'].includes(record.outcome?.kind)&&record.outcome?.policyIds?.includes(policy.id);
  if(!producerRecordedBound&&option.policies.some(p=>p.quoteExpiresOn&&p.quoteExpiresOn<today))deviceFail(409,'quote_expired','The quote needs confirmation. Contact Dylan before updating this task.');
}
export async function launchDeviceTask(client,value,opts){
  const config=bridgeConfig(opts.env),{record,revision}=client,{option,policy}=selectTask(revision,value.optionId,value.policyId);current(record,revision,option,policy);
  if(value.consent!==true)deviceFail(422,'device_consent','Confirm the limited context you want to share.');
  const token=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const expiresAt=new Date(Date.now()+60*60*1000).toISOString();
  await opts.db.prepare('INSERT INTO cf_device_sessions(token_hash,recommendation_id,revision,option_id,policy_id,expires_at) VALUES(?1,?2,?3,?4,?5,?6)').bind(await digest(token),record.id,revision.revision,option.id,policy.id,expiresAt).run();
  return {ok:true,launchUrl:`${config.origin}/insurance-task#h=${token}`,returnKey:token,expiresAt};
}
export async function latestDeviceUpdates(opts,id,revision){
  const data=await opts.db.prepare('SELECT option_id,policy_id,sequence,payload_json,created_at FROM cf_device_updates u WHERE recommendation_id=?1 AND revision=?2 AND sequence=(SELECT MAX(u2.sequence) FROM cf_device_updates u2 WHERE u2.recommendation_id=u.recommendation_id AND u2.revision=u.revision AND u2.option_id=u.option_id AND u2.policy_id=u.policy_id) ORDER BY created_at DESC LIMIT 24').bind(id,revision).all();
  const seen=new Set();return (data.results||[]).filter(row=>{const key=`${row.option_id}:${row.policy_id}`;if(seen.has(key))return false;seen.add(key);return true;}).map(row=>({...row,payload:JSON.parse(row.payload_json),payload_json:undefined}));
}
export async function deviceClientContext(opts,id,revision){
  if(opts.env.COVERAGEFIT_SMARTDEVICES_ENABLED!=='true')return {deviceBridgeEnabled:false,deviceUpdates:[]};
  try{bridgeConfig(opts.env);return {deviceBridgeEnabled:true,deviceUpdates:await latestDeviceUpdates(opts,id,revision)};}
  catch{return {deviceBridgeEnabled:false,deviceUpdates:[],deviceUpdatesUnavailable:true};}
}
export async function deviceWorkQueue(opts,owner){
  if(opts.env.COVERAGEFIT_SMARTDEVICES_ENABLED!=='true')return [];
  const data=await opts.db.prepare(`SELECT u.*,json_extract(r.draft_json,'$.contact.name') AS client_name,
    EXISTS(SELECT 1 FROM cf_recommendation_events e WHERE e.recommendation_id=u.recommendation_id AND e.revision=u.revision AND e.kind='proceed' AND json_extract(e.payload_json,'$.optionId')=u.option_id) AS requested_proceed
    FROM cf_device_updates u JOIN cf_recommendations r ON r.id=u.recommendation_id
    WHERE r.owner_id=?1 AND r.current_revision=u.revision
    AND NOT EXISTS(SELECT 1 FROM cf_device_reviews reviewed WHERE reviewed.update_request_id=u.request_id)
    AND u.sequence=(SELECT MAX(u2.sequence) FROM cf_device_updates u2 WHERE u2.recommendation_id=u.recommendation_id AND u2.revision=u.revision AND u2.option_id=u.option_id AND u2.policy_id=u.policy_id)
    ORDER BY requested_proceed DESC,u.created_at DESC LIMIT 100`).bind(owner).all();
  return (data.results||[]).map(row=>({recommendationId:row.recommendation_id,optionId:row.option_id,policyId:row.policy_id,clientName:row.client_name,requestedProceed:Boolean(row.requested_proceed),state:JSON.parse(row.payload_json).state,updatedAt:row.created_at}));
}
export async function recordDeviceReview(opts,record,requestId,actor){
  if(!UUID.test(requestId||''))deviceFail(422,'device_review','Choose an actual customer update to review.');
  const update=await opts.db.prepare('SELECT * FROM cf_device_updates WHERE request_id=?1 AND recommendation_id=?2 AND revision=?3').bind(requestId,record.id,record.current_revision).first();
  if(!update)deviceFail(409,'device_review','This update is no longer part of the current recommendation.');
  const latest=await opts.db.prepare('SELECT MAX(sequence) AS sequence FROM cf_device_updates WHERE recommendation_id=?1 AND revision=?2 AND option_id=?3 AND policy_id=?4').bind(record.id,update.revision,update.option_id,update.policy_id).first();
  if(latest.sequence!==update.sequence)deviceFail(409,'device_review','A newer device update needs review. Refresh the record.');
  await opts.db.prepare("INSERT OR IGNORE INTO cf_device_reviews(update_request_id,actor_id,status,created_at) VALUES(?1,?2,'professional-reviewed',?3)").bind(requestId,actor,new Date().toISOString()).run();
  return {ok:true,reviewStatus:'professional-reviewed',carrierDetermination:'unknown'};
}
export async function deviceBridge(request,raw,opts){
  const config=bridgeConfig(opts.env),timestamp=request.headers.get('x-device-timestamp')||'',nonce=request.headers.get('x-device-nonce')||'',signature=request.headers.get('x-device-signature')||'';
  if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>120000||!UUID.test(nonce)||!/^[a-f0-9]{64}$/.test(signature))deviceFail(403,'device_auth','Device connection could not be verified.');
  const expected=await deviceSignature(config.secret,`${timestamp}\n${nonce}\n${raw}`);let diff=0;for(let i=0;i<64;i++)diff|=signature.charCodeAt(i)^expected.charCodeAt(i);if(diff)deviceFail(403,'device_auth','Device connection could not be verified.');
  let value;try{value=JSON.parse(raw);}catch{deviceFail(400,'device_body','Invalid device request.');}
  if(!['read','save'].includes(value.operation)||!/^[A-Za-z0-9_-]{43}$/.test(value.token||''))deviceFail(422,'device_request','Invalid device request.');
  const nonceResult=await opts.db.prepare('INSERT OR IGNORE INTO cf_device_nonces(nonce,expires_at) VALUES(?1,?2)').bind(nonce,new Date(Date.now()+300000).toISOString()).run();if(nonceResult.meta?.changes!==1)deviceFail(409,'device_replay','This connection request was already processed. Retry with a new connection request.');
  const session=await opts.db.prepare('SELECT * FROM cf_device_sessions WHERE token_hash=?1').bind(await digest(value.token)).first();
  if(!session||Date.parse(session.expires_at)<=Date.now())deviceFail(410,'device_expired','This device session expired. Reopen device guidance from your insurance review.');
  const record=await opts.repo.get(session.recommendation_id),revision=await opts.repo.revision(session.recommendation_id,session.revision);
  if(!record||!revision)deviceFail(410,'device_expired','This review is unavailable.');
  const {option,policy,task}=selectTask(revision,session.option_id,session.policy_id);current(record,revision,option,policy);
  const scope=[record.id,revision.revision,option.id,policy.id];
  const latest=await opts.db.prepare('SELECT sequence,payload_json FROM cf_device_updates WHERE recommendation_id=?1 AND revision=?2 AND option_id=?3 AND policy_id=?4 ORDER BY sequence DESC LIMIT 1').bind(...scope).first();
  const version=latest?.sequence||0;
  if(value.operation==='read')return {ok:true,task:{capability:task.capability,jurisdiction:task.jurisdiction,kind:task.kind,dueDate:task.dueDate,assertionSource:task.assertionSource},policy:{carrier:policy.carrier,product:policy.product},version,progress:latest?JSON.parse(latest.payload_json):null,expiresAt:session.expires_at};
  if(value.consent!==true||!UUID.test(value.requestId||'')||!Number.isInteger(value.expectedVersion)||value.expectedVersion<0||!Object.hasOwn(DEVICE_STATES,value.state))deviceFail(422,'device_update','Confirm a supported update and permission to share it with Dylan.');
  const deviceId=value.deviceId||'';
  if(deviceId&&!['moen-flo-shutoff','phyn-plus-v2'].includes(deviceId))deviceFail(422,'device_model','This device is not part of the water shutoff pilot.');
  if(value.state==='considering'&&!deviceId)deviceFail(422,'device_model','Choose the device you are considering.');
  const payload={state:value.state,deviceId,assertionSource:'consumer-self-reported',consentPurpose:'insurance-device-task-update'};
  let saved=await opts.db.prepare('SELECT * FROM cf_device_updates WHERE request_id=?1').bind(value.requestId).first();
  if(saved&&(saved.recommendation_id!==record.id||saved.revision!==revision.revision||saved.option_id!==option.id||saved.policy_id!==policy.id||saved.payload_json!==JSON.stringify(payload)))deviceFail(409,'device_idempotency','This update identifier was already used for different information. Reopen the task.');
  if(!saved){
    if(value.expectedVersion!==version)deviceFail(409,'device_conflict','This task was updated elsewhere. Reload it before saving your changes.');
    try{await opts.db.prepare('INSERT INTO cf_device_updates(request_id,recommendation_id,revision,option_id,policy_id,sequence,payload_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)').bind(value.requestId,...scope,version+1,JSON.stringify(payload),new Date().toISOString()).run();}
    catch{deviceFail(409,'device_conflict','Another update may have arrived. Reload the task before trying again.');}
    saved={sequence:version+1};
  }
  // A retry repairs an interrupted outbox write; the event key prevents duplication.
  const event=await opts.repo.event(record.id,revision.revision,'device_update',`device:${value.requestId}`,{...payload,optionId:option.id,policyId:policy.id,updateRequestId:value.requestId,message:`${DEVICE_STATES[payload.state]}${deviceId?` (${deviceId})`:''}. Professional review and insurer acceptance remain separate.`});
  return {ok:true,saved:true,version:saved.sequence,progress:payload,event};
}
export async function cleanupDeviceSessions(db){
  const now=new Date().toISOString();
  await db.batch([db.prepare('DELETE FROM cf_device_sessions WHERE token_hash IN (SELECT token_hash FROM cf_device_sessions WHERE expires_at<?1 LIMIT 500)').bind(now),db.prepare('DELETE FROM cf_device_nonces WHERE nonce IN (SELECT nonce FROM cf_device_nonces WHERE expires_at<?1 LIMIT 500)').bind(now)]);
}
