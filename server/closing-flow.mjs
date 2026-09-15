import producer from '../producer.json' with {type:'json'};
import {clean} from '../assets/js/recommendation-model.mjs';

export const CLOSE_BUILD='CF-CLOSE-1.0';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CHANNELS=new Set(['live','phone','video','email','text','other']);
const DECISIONS=new Set(['proceed','not_ready','declined_price','declined_coverage','deferred','other']);
const PREP_STATES=new Set(['started','ready_for_bind_confirmation']);
const parse=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};
const iso=()=>new Date().toISOString();
function fail(status,code,message){throw Object.assign(new Error(message),{status,code});}
function channel(value){const v=clean(value,40).toLowerCase();if(!CHANNELS.has(v))fail(422,'channel','Choose how the recommendation or close was delivered.');return v;}

export function closingFlow(repo){
  const stmt=(sql,...args)=>repo.db.prepare(sql).bind(...args);
  async function events(id){const data=await stmt('SELECT * FROM cf_close_events WHERE recommendation_id=? ORDER BY created_at,id',id).all();return (data.results||[]).map(r=>({...r,payload:parse(r.payload_json)}));}
  async function clientProceed(id){const row=await stmt("SELECT revision,payload_json,created_at FROM cf_recommendation_events WHERE recommendation_id=? AND kind='proceed' ORDER BY created_at LIMIT 1",id).first();return row?{revision:row.revision,payload:parse(row.payload_json),createdAt:row.created_at}:null;}
  async function view(record){
    const all=await events(record.id),proceed=await clientProceed(record.id),find=kind=>all.find(e=>e.kind===kind),latest=kind=>[...all].reverse().find(e=>e.kind===kind);
    const delivery=find('recommendation_delivered'),ask=find('close_ask'),decision=latest('customer_decision'),prep=latest('bind_prep'),outcome=record.outcome||{};
    const deliveredAt=record.sent_at||delivery?.created_at||null,closeAskedAt=ask?.created_at||proceed?.createdAt||null;
    let customerDecision=decision?.payload?.decision||null,decisionAt=decision?.created_at||null,decisionBasis=decision?'producer_recorded':null;
    if(!customerDecision&&proceed){customerDecision='proceed';decisionAt=proceed.createdAt;decisionBasis='client_proceed_request';}
    let stage=record.current_revision?'prepared':'draft';
    if(deliveredAt)stage='delivered';if(closeAskedAt)stage='close_asked';if(customerDecision)stage='decision_recorded';if(prep)stage='bind_prep';if(['bound','partial'].includes(outcome.kind))stage='bound';else if(['declined_price','declined_coverage','deferred','unable_to_reach'].includes(outcome.kind))stage='closed_or_deferred';
    return {build:CLOSE_BUILD,stage,deliveredAt,deliveryBasis:record.sent_at?'recorded_sent':delivery?'producer_recorded_live_delivery':null,closeAskedAt,closeAskBasis:ask?'producer_recorded_close_ask':proceed?'client_proceed_request':null,customerDecision,decisionAt,decisionBasis,bindPrep:prep?{state:prep.payload.state,at:prep.created_at,note:prep.payload.note||''}:null,outcome,events:all.map(e=>({id:e.id,kind:e.kind,revision:e.revision,createdAt:e.created_at,payload:e.payload}))};
  }
  async function record(record,value){
    if(!record.current_revision)fail(422,'not_prepared','Prepare an approved recommendation before recording closing activity.');
    if(!UUID.test(value.requestId||''))fail(422,'request_id','Reload the recommendation before recording this closing step.');
    const kind=clean(value.kind,40);if(!['recommendation_delivered','close_ask','customer_decision','bind_prep'].includes(kind))fail(422,'close_event','Choose a supported closing step.');
    const revision=Number(value.revision||record.current_revision);if(revision!==record.current_revision)fail(409,'revision','Record closing activity against the current approved recommendation.');
    const options=(await repo.revision(record.id,revision))?.payload?.options||[];const optionIds=new Set(options.map(o=>String(o.id))),optionId=clean(value.optionId,120);if(optionId&&!optionIds.has(optionId))fail(422,'option','Choose an option from the current approved recommendation.');
    const payload={optionId,note:clean(value.note,1200)};
    if(kind==='recommendation_delivered'||kind==='close_ask')payload.channel=channel(value.channel);
    if(kind==='customer_decision'){
      const decision=clean(value.decision,40).toLowerCase();if(!DECISIONS.has(decision))fail(422,'decision','Choose the customer decision that was actually expressed.');payload.decision=decision;
      if(decision==='proceed'&&!optionId)fail(422,'option','Choose the option the customer decided to move forward with.');
      if(decision==='deferred'){const follow=String(value.followUpAt||'');if(follow&&(!Number.isFinite(Date.parse(follow))||Date.parse(follow)<Date.now()-60000))fail(422,'follow_up','Choose a valid future follow-up time.');payload.followUpAt=follow?new Date(follow).toISOString():'';}
    }
    if(kind==='bind_prep'){const state=clean(value.state,50);if(!PREP_STATES.has(state))fail(422,'bind_prep','Choose the actual bind-preparation state.');payload.state=state;}
    const at=iso(),id=`close_${crypto.randomUUID()}`;
    try{await stmt('INSERT INTO cf_close_events(id,recommendation_id,revision,kind,request_id,actor_id,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?)',id,record.id,revision,kind,value.requestId,producer.id,JSON.stringify(payload),at).run();await stmt('UPDATE cf_recommendations SET updated_at=? WHERE id=?',at,record.id).run();}
    catch(error){const prior=await stmt('SELECT * FROM cf_close_events WHERE request_id=?',value.requestId).first();if(!prior)throw error;const p=parse(prior.payload_json);if(prior.recommendation_id!==record.id||prior.kind!==kind||JSON.stringify(p)!==JSON.stringify(payload))fail(409,'request_reused','That closing save request was already used for a different update. Reload before trying again.');}
    return view(await repo.get(record.id));
  }
  return {view,record,events};
}
