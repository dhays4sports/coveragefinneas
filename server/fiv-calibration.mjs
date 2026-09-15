import {clean,fail,validId} from '../assets/js/solo-desk-model.mjs';
const parse=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};
const stamp=()=>new Date().toISOString();

export const FIV_CALIBRATION_BUILD='CF-FIV-1.1';
export const EFFORT_CATEGORIES=Object.freeze(['outreach','discovery','quote_preparation','recommendation','closing','other_sales']);
const EFFORT_SET=new Set(EFFORT_CATEGORIES);
const QUEUE_ORDER=Object.freeze(['shoot_now','quick_play','develop','nurture','low_priority','unclassified']);
const QUEUE_LABELS=Object.freeze({shoot_now:'🔥 Shoot now',quick_play:'⚡ Quick play',develop:'🏀 Develop',nurture:'🌱 Nurture',low_priority:'⬇ Low priority',unclassified:'Unclassified'});
const iso=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const ratio=(a,b)=>b?Math.round((a/b)*1000)/10:null;
const moneyRatio=(cents,minutes)=>minutes?Math.round(((cents*60)/minutes)):null;
const evidenceStatus=n=>n>=30?'usable':n>=10?'directional':'early';

export async function captureFivCalibrationBaseline(repo,opportunityId,projection){
  if(!projection||projection.status!=='ready'||!validId(opportunityId))return null;
  const at=stamp();
  try{
    await repo.sql(`INSERT OR IGNORE INTO cf_fiv_calibration_baselines(workspace_id,opportunity_id,fit,intent,value,queue,projection_json,engine,basis,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      repo.scope.workspace,opportunityId,projection.fit?.level||'unknown',projection.intent?.level||'unknown',projection.value?.level||'unknown',projection.queue||'unclassified',JSON.stringify(projection),projection.engine||'CF-FIV-1.1','first_ready',at).run();
    const row=await repo.sql('SELECT * FROM cf_fiv_calibration_baselines WHERE workspace_id=? AND opportunity_id=?',repo.scope.workspace,opportunityId).first();
    return row?{fit:row.fit,intent:row.intent,value:row.value,queue:row.queue,engine:row.engine,basis:row.basis,capturedAt:row.captured_at}:null;
  }catch(error){if(/no such table/i.test(String(error?.message||'')))return null;throw error;}
}

export async function recordEffortEvidence(repo,opportunityId,input={},requestId=''){
  if(!validId(opportunityId))fail(404,'opportunity','This opportunity is unavailable.');
  await repo.own(opportunityId);
  const minutes=Number(input.minutes),category=clean(input.category,40),note=clean(input.note,600),occurredAt=iso(input.occurredAt)||stamp();
  if(!Number.isInteger(minutes)||minutes<1||minutes>480)fail(422,'effort_minutes','Record actual producer minutes from 1 to 480 for this update.');
  if(!EFFORT_SET.has(category))fail(422,'effort_category','Choose the kind of sales work completed.');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId||''))fail(422,'request_id','Reload the form before saving effort evidence.');
  const prior=await repo.sql('SELECT * FROM cf_opportunity_effort WHERE workspace_id=? AND request_id=?',repo.scope.workspace,requestId).first();
  if(prior){
    const same=prior.opportunity_id===opportunityId&&Number(prior.minutes)===minutes&&prior.category===category&&prior.note===note;
    if(!same)fail(409,'request_reused','That work-time save request was already used. Reload before saving different effort evidence.');
    return {id:prior.id,opportunityId,minutes,category,note,occurredAt:prior.occurred_at};
  }
  const id=`effort_${requestId}`,createdAt=stamp();
  await repo.sql('INSERT INTO cf_opportunity_effort(id,workspace_id,opportunity_id,actor_id,category,minutes,note,request_id,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,repo.scope.workspace,opportunityId,repo.scope.actor,category,minutes,note,requestId,occurredAt,createdAt).run();
  return {id,opportunityId,minutes,category,note,occurredAt};
}

export async function opportunityEffortSummary(repo,opportunityId){
  try{
    const row=await repo.sql('SELECT COALESCE(SUM(minutes),0) AS minutes,COUNT(*) AS entries,MAX(occurred_at) AS last_at FROM cf_opportunity_effort WHERE workspace_id=? AND opportunity_id=?',repo.scope.workspace,opportunityId).first();
    return {minutes:Number(row?.minutes||0),entries:Number(row?.entries||0),lastAt:row?.last_at||null,basis:Number(row?.entries||0)?'manual_governed':'not_captured'};
  }catch(error){if(/no such table/i.test(String(error?.message||'')))return {status:'setup_required',minutes:0,entries:0,lastAt:null,basis:'not_captured'};throw error;}
}

function blankQueue(queue){return {queue,label:QUEUE_LABELS[queue]||queue,opportunities:0,qualified:0,quotesPrepared:0,recommendationsDelivered:0,closeAsked:0,bound:0,boundPremiumCents:0,premiumEvidenceGaps:0,producerMinutes:0,effortMeasuredOpportunities:0};}
function finalizeQueue(g){
  return {...g,bindRatePct:ratio(g.bound,g.qualified),premiumPerQualifiedCents:g.qualified?Math.round(g.boundPremiumCents/g.qualified):null,producerMinutesPerBind:g.bound&&g.producerMinutes?Math.round((g.producerMinutes/g.bound)*10)/10:null,premiumPerProducerHourCents:g.producerMinutes?moneyRatio(g.boundPremiumCents,g.producerMinutes):null,effortCoveragePct:ratio(g.effortMeasuredOpportunities,g.opportunities),evidenceStatus:evidenceStatus(g.qualified)};
}
function signalKey(dimension,reason){return `${dimension}:${reason.code||'unknown'}`;}
function addSignal(map,dimension,reason,row){
  const key=signalKey(dimension,reason),g=map.get(key)||{key,dimension,code:reason.code||'unknown',label:clean(reason.label,180)||reason.code||'Unknown signal',opportunities:0,bound:0,boundPremiumCents:0,producerMinutes:0};
  g.opportunities++;if(row.bound_at)g.bound++;if(row.written_premium_cents!=null)g.boundPremiumCents+=Number(row.written_premium_cents);if(row.producer_minutes!=null)g.producerMinutes+=Number(row.producer_minutes);map.set(key,g);
}

export function fivCalibration(repo){
  const workspace=repo.scope.workspace;
  return {
    async ready(){await repo.sql('SELECT opportunity_id FROM cf_fiv_calibration_baselines WHERE workspace_id=? LIMIT 1',workspace).first();await repo.sql('SELECT opportunity_id FROM cf_opportunity_effort WHERE workspace_id=? LIMIT 1',workspace).first();},
    async summary(params=new URLSearchParams()){
      const days=Math.max(14,Math.min(365,Number(params.get?.('days')||90)||90)),to=new Date(),from=new Date(to.getTime()-days*86400000),fromIso=from.toISOString(),toIso=to.toISOString();
      const rows=await repo.rows(`SELECT b.*,m.qualified_possession_at,m.quote_prepared_at,m.recommendation_delivered_at,m.close_asked_at,m.bound_at,m.written_premium_cents,m.producer_minutes,m.producer_minutes_basis FROM cf_fiv_calibration_baselines b LEFT JOIN cf_acq_opportunity_measurements m ON m.workspace_id=b.workspace_id AND m.opportunity_id=b.opportunity_id WHERE b.workspace_id=? AND b.captured_at>=? AND b.captured_at<=? ORDER BY b.captured_at`,workspace,fromIso,toIso);
      const queues=new Map(QUEUE_ORDER.map(q=>[q,blankQueue(q)])),signals=new Map();
      for(const row of rows){
        const g=queues.get(row.queue)||blankQueue(row.queue);g.opportunities++;if(row.qualified_possession_at)g.qualified++;if(row.quote_prepared_at)g.quotesPrepared++;if(row.recommendation_delivered_at)g.recommendationsDelivered++;if(row.close_asked_at)g.closeAsked++;if(row.bound_at)g.bound++;if(row.written_premium_cents!=null)g.boundPremiumCents+=Number(row.written_premium_cents);else if(row.bound_at)g.premiumEvidenceGaps++;if(row.producer_minutes!=null){g.producerMinutes+=Number(row.producer_minutes);g.effortMeasuredOpportunities++;}queues.set(row.queue,g);
        const projection=parse(row.projection_json);for(const dimension of ['fit','intent','value'])for(const r of projection?.[dimension]?.reasons||[])addSignal(signals,dimension,r,row);
      }
      const queueRows=QUEUE_ORDER.map(q=>finalizeQueue(queues.get(q))).filter(g=>g.opportunities>0),signalRows=[...signals.values()].map(s=>({...s,bindRatePct:ratio(s.bound,s.opportunities),premiumPerOpportunityCents:s.opportunities?Math.round(s.boundPremiumCents/s.opportunities):null,premiumPerProducerHourCents:s.producerMinutes?moneyRatio(s.boundPremiumCents,s.producerMinutes):null})).sort((a,b)=>b.opportunities-a.opportunities||b.boundPremiumCents-a.boundPremiumCents).slice(0,30);
      const total=finalizeQueue(queueRows.reduce((acc,g)=>{for(const k of ['opportunities','qualified','quotesPrepared','recommendationsDelivered','closeAsked','bound','boundPremiumCents','premiumEvidenceGaps','producerMinutes','effortMeasuredOpportunities'])acc[k]+=Number(g[k]||0);return acc;},blankQueue('all')));
      const warnings=[];if(total.effortCoveragePct==null||total.effortCoveragePct<60)warnings.push('Producer-time evidence is still sparse. Treat premium-per-hour comparisons as directional until more actual minutes are recorded.');if(queueRows.every(q=>q.evidenceStatus==='early'))warnings.push('Queue samples are still early. Do not change FIV rules from small samples.');if(total.premiumEvidenceGaps)warnings.push('Some bound opportunities lack verified term-premium evidence and are excluded from premium comparisons.');
      return {build:FIV_CALIBRATION_BUILD,period:{days,from:fromIso,to:toIso},baseline:'first_ready_fiv',observationalOnly:true,autoRecalibration:false,numericCompositeScore:false,queues:queueRows,signals:signalRows,totals:total,warnings};
    }
  };
}
