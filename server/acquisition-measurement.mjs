import {clean,fail,validId} from '../assets/js/solo-desk-model.mjs';
import {parse,stamp} from './solo-desk-repository.mjs';

export const ACQ_BUILD='CF-CLOSE-1.0';
export const SOURCE_FAMILIES=Object.freeze([
  'district_lead','purchased_lead','paid_search','paid_social','direct_mail',
  'referral_partner','local_partner','organic_web','outbound','existing_relationship',
  'event_or_affinity','other'
]);
const SOURCE_FAMILY_SET=new Set(SOURCE_FAMILIES);
const STAGE_RANK=Object.freeze({inquiry:1,discovery:2,quote_preparation:3,recommendation:4,decision:5,onboarding:6,issuance_onboarding:6});
const cents=value=>Number.isFinite(Number(value))&&Number(value)>=0?Math.round(Number(value)*100):null;
const moneyRate=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=1?n:null;};
const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(Date.parse(`${value}T12:00:00Z`))?String(value):null;
const sourceText=value=>clean(value,160).toLowerCase();
const nonempty=value=>clean(value,180);

function manualFamily(source=''){
  const value=sourceText(source);
  if(value.includes('district'))return 'district_lead';
  if(value.includes('filtered lead')||value.includes('apex')||value.includes('internet lead')||value.includes('purchased'))return 'purchased_lead';
  if(value.includes('google'))return 'paid_search';
  if(value.includes('door-drop')||value.includes('postcard')||value.includes('mail'))return 'direct_mail';
  if(value.includes('realtor')||value.includes('lender')||value.includes('referral'))return 'referral_partner';
  if(value.includes('408 local')||value.includes('local partner'))return 'local_partner';
  if(value.includes('existing client'))return 'existing_relationship';
  if(value.includes('teacher')||value.includes('healthcare')||value.includes('event')||value.includes('appreciation'))return 'event_or_affinity';
  if(value.includes('social'))return 'other';
  return 'other';
}

export function deriveSourceFamily(input={}){
  const explicit=sourceText(input.sourceFamily||input.source_family);
  if(SOURCE_FAMILY_SET.has(explicit))return explicit;
  const sourceKey=sourceText(input.sourceKey||input.source_key),utmSource=sourceText(input.utmSource||input.utm_source),utmMedium=sourceText(input.utmMedium||input.utm_medium),source=sourceText(input.source||input.sourceLabel);
  if(/district/.test(sourceKey)||/district/.test(source))return 'district_lead';
  if(['lead','leads','purchased_lead','internet_lead','aggregator'].includes(utmMedium)||/lead|hometown|quotewizard|everquote|apex/.test(utmSource))return 'purchased_lead';
  if(/cpc|ppc|paid_search|search_paid/.test(utmMedium)||((/google|bing|microsoft/.test(utmSource))&&utmMedium))return 'paid_search';
  if(/paid_social|social_paid/.test(utmMedium)||((/facebook|instagram|meta/.test(utmSource))&&/cpc|paid|social/.test(utmMedium)))return 'paid_social';
  if(/direct_mail|postcard|mail/.test(utmMedium)||/postcard|direct_mail/.test(utmSource))return 'direct_mail';
  if(sourceKey==='referral_408_local'||/408[_ -]?local/.test(source))return 'local_partner';
  if(sourceKey.startsWith('referral_'))return 'referral_partner';
  if(sourceKey.startsWith('web_408_')||sourceKey.startsWith('web_coveragefit_'))return 'organic_web';
  if(sourceKey.startsWith('sms_'))return 'existing_relationship';
  return manualFamily(source||sourceKey);
}

export function normalizeAcquisitionTouch(input={}){
  const attribution=input.attribution&&typeof input.attribution==='object'?input.attribution:{};
  const utm=attribution.utm&&typeof attribution.utm==='object'?attribution.utm:{};
  const sourceKey=nonempty(input.sourceKey||attribution.sourceKey),campaignId=nonempty(input.campaignId||attribution.campaignId||utm.campaign||attribution.campaign),campaignVariant=nonempty(input.campaignVariant||attribution.campaignVariant||utm.content),partnerId=nonempty(input.partnerId||attribution.partnerId),batchId=nonempty(input.batchId||attribution.batchId);
  const touch={
    sourceFamily:deriveSourceFamily({sourceFamily:input.sourceFamily,sourceKey,utmSource:utm.source,utmMedium:utm.medium,source:input.source||attribution.source||attribution.sourceLabel}),
    sourceKey,
    campaignId,
    campaignVariant,
    partnerId,
    batchId,
    utm:{source:nonempty(utm.source),medium:nonempty(utm.medium),campaign:nonempty(utm.campaign),content:nonempty(utm.content),term:nonempty(utm.term)},
    source:nonempty(input.source||attribution.source||attribution.sourceLabel),
    landingPage:nonempty(attribution.landingPage),
    occurredAt:date(input.occurredAt||input.updatedAt)||stamp(),
    basis:nonempty(input.basis)||'derived'
  };
  return Object.freeze(touch);
}

async function campaignOverride(repo,touch){
  if(!touch.campaignId)return touch;
  const row=await repo.sql('SELECT * FROM cf_acq_campaigns WHERE workspace_id=? AND id=?',repo.scope.workspace,touch.campaignId).first();
  if(!row)return touch;
  return {...touch,sourceFamily:row.source_family,sourceKey:row.source_key||touch.sourceKey,campaignVariant:row.campaign_variant||touch.campaignVariant,partnerId:row.partner_id||touch.partnerId,batchId:row.batch_id||touch.batchId,basis:'campaign_registry'};
}

export async function projectOpportunityAttribution(repo,opportunityId,touchInput={}){
  await repo.own(opportunityId);
  let touch=normalizeAcquisitionTouch(touchInput);touch=await campaignOverride(repo,touch);
  const prior=await repo.sql('SELECT * FROM cf_acq_opportunity_attribution WHERE workspace_id=? AND opportunity_id=?',repo.scope.workspace,opportunityId).first(),at=stamp();
  const first=prior?parse(prior.first_touch_json):touch;
  const primary={sourceFamily:touch.sourceFamily,sourceKey:touch.sourceKey,campaignId:touch.campaignId,campaignVariant:touch.campaignVariant,partnerId:touch.partnerId,batchId:touch.batchId};
  await repo.sql(`INSERT INTO cf_acq_opportunity_attribution(workspace_id,opportunity_id,source_family,source_key,campaign_id,campaign_variant,partner_id,batch_id,first_touch_json,latest_touch_json,attribution_basis,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(workspace_id,opportunity_id) DO UPDATE SET source_family=excluded.source_family,source_key=excluded.source_key,campaign_id=excluded.campaign_id,campaign_variant=excluded.campaign_variant,partner_id=excluded.partner_id,batch_id=excluded.batch_id,latest_touch_json=excluded.latest_touch_json,attribution_basis=excluded.attribution_basis,updated_at=excluded.updated_at`,
    repo.scope.workspace,opportunityId,primary.sourceFamily,primary.sourceKey,primary.campaignId,primary.campaignVariant,primary.partnerId,primary.batchId,JSON.stringify(first),JSON.stringify(touch),touch.basis,at).run();
  return {firstTouch:first,latestTouch:touch,...primary};
}

async function deriveFallbackAttribution(repo,opportunityId){
  const [op,sources]=await Promise.all([
    repo.own(opportunityId),
    repo.rows('SELECT kind,source_id,summary_json,updated_at FROM cf_solo_sources WHERE workspace_id=? AND opportunity_id=? ORDER BY updated_at,kind,source_id',repo.scope.workspace,opportunityId)
  ]);
  const lead=sources.map(s=>({...s,summary:parse(s.summary_json)})).find(s=>s.kind==='lead');
  if(lead)return projectOpportunityAttribution(repo,opportunityId,{attribution:lead.summary.attribution||{},source:lead.summary.attribution?.sourceLabel||op.source,updatedAt:lead.updated_at,basis:'lead_source'});
  const consultation=sources.map(s=>({...s,summary:parse(s.summary_json)})).find(s=>s.kind==='consultation');
  if(consultation)return projectOpportunityAttribution(repo,opportunityId,{attribution:consultation.summary.attribution||{},source:op.source,updatedAt:consultation.updated_at,basis:'consultation_source'});
  const manual=sources.map(s=>({...s,summary:parse(s.summary_json)})).find(s=>s.kind==='manual'),acq=manual?.summary?.acquisition||{};
  return projectOpportunityAttribution(repo,opportunityId,{...acq,source:op.source,updatedAt:manual?.updated_at||op.created_at,basis:Object.keys(acq).some(k=>acq[k])?'manual_acquisition':'manual_source'});
}

function earliest(values){return values.map(date).filter(Boolean).sort()[0]||null;}
function minEvent(activity,predicate){return earliest(activity.filter(predicate).map(a=>a.created_at));}

async function boundPremiumEvidence(repo,opportunityId){
  const sourceIds=(await repo.rows("SELECT source_id FROM cf_solo_sources WHERE workspace_id=? AND opportunity_id=? AND kind='recommendation'",repo.scope.workspace,opportunityId)).map(r=>r.source_id);
  let total=0,boundAt=null,evidence=[];
  for(const id of sourceIds){
    const rec=await repo.sql('SELECT id,current_revision,outcome_json FROM cf_recommendations WHERE id=? AND owner_id=?',id,repo.scope.actor).first();if(!rec)continue;
    const outcome=parse(rec.outcome_json);if(!['bound','partial'].includes(outcome.kind)||!Array.isArray(outcome.policyIds)||!outcome.policyIds.length)continue;
    const revision=await repo.sql('SELECT payload_json,created_at FROM cf_recommendation_revisions WHERE recommendation_id=? AND revision=?',id,rec.current_revision).first();if(!revision)continue;
    const payload=parse(revision.payload_json),policies=(payload.options||[]).flatMap(o=>(o.policies||[]).map(p=>({...p,optionId:o.id}))),ids=new Set(outcome.policyIds.map(String));
    for(const policy of policies){if(!ids.has(String(policy.id)))continue;const premium=Number(policy.termPremium);if(!Number.isFinite(premium)||premium<0)continue;const pc=Math.round(premium*100);total+=pc;evidence.push({recommendationId:id,revision:rec.current_revision,policyId:String(policy.id),product:clean(policy.product,100),termMonths:Number(policy.termMonths)||null,termPremiumCents:pc,evidence:'producer-confirmed bound policy + approved recommendation revision'});}
    boundAt=earliest([boundAt,outcome.updatedAt,revision.created_at]);
  }
  return {boundAt,totalCents:evidence.length?total:null,evidence};
}


async function producerEffortEvidence(repo,opportunityId){
  try{
    const row=await repo.sql('SELECT COALESCE(SUM(minutes),0) AS minutes,COUNT(*) AS entries FROM cf_opportunity_effort WHERE workspace_id=? AND opportunity_id=?',repo.scope.workspace,opportunityId).first();
    const entries=Number(row?.entries||0),minutes=Number(row?.minutes||0);
    return {minutes:entries?minutes:null,basis:entries?'manual_governed':'not_captured',entries};
  }catch(error){if(/no such table/i.test(String(error?.message||'')))return {minutes:null,basis:'setup_required',entries:0};throw error;}
}

export async function refreshOpportunityMeasurement(repo,opportunityId){
  const detail=await repo.detail(opportunityId),op=detail.opportunity,activity=await repo.rows('SELECT kind,payload_json,created_at FROM cf_solo_activity WHERE workspace_id=? AND opportunity_id=? ORDER BY created_at,id',repo.scope.workspace,opportunityId);
  const events=activity.map(a=>({...a,payload:parse(a.payload_json)}));
  const fiv=detail.possessionQuality,fivRow=await repo.sql('SELECT updated_at FROM cf_fiv_projections WHERE workspace_id=? AND opportunity_id=?',repo.scope.workspace,opportunityId).first();
  const qualified=Boolean((fiv?.status==='ready'&&fiv?.queue&&fiv.queue!=='unclassified')||(STAGE_RANK[op.stage]||1)>1||events.some(a=>a.kind==='wrap'&&['conversation','incoming_reply','work_completed'].includes(a.payload?.outcome)));
  const contactAt=earliest([
    minEvent(events,a=>a.kind==='wrap'&&['conversation','incoming_reply'].includes(a.payload?.outcome)),
    ...detail.sources.filter(s=>s.kind==='response').map(s=>s.updated_at)
  ]);
  const conversationAt=minEvent(events,a=>a.kind==='wrap'&&a.payload?.outcome==='conversation');
  const quoteableAt=(STAGE_RANK[op.stage]||1)>=3?earliest([minEvent(events,a=>a.kind==='wrap'&&(STAGE_RANK[a.payload?.stage]||0)>=3),op.updated_at]):null;
  const recIds=detail.sources.filter(s=>s.kind==='recommendation').map(s=>s.source_id);
  let quotePreparedAt=null,recommendationDeliveredAt=null,closeAskedAt=null;
  for(const id of recIds){
    const rec=await repo.sql('SELECT current_revision,sent_at,created_at FROM cf_recommendations WHERE id=? AND owner_id=?',id,repo.scope.actor).first();if(!rec)continue;
    if(Number(rec.current_revision)>0){const rev=await repo.sql('SELECT created_at FROM cf_recommendation_revisions WHERE recommendation_id=? AND revision=?',id,rec.current_revision).first();quotePreparedAt=earliest([quotePreparedAt,rev?.created_at,rec.created_at]);}
    let closeDelivery=null,explicitAsk=null;
    try{closeDelivery=await repo.sql("SELECT MIN(created_at) AS at FROM cf_close_events WHERE recommendation_id=? AND kind='recommendation_delivered'",id).first();explicitAsk=await repo.sql("SELECT MIN(created_at) AS at FROM cf_close_events WHERE recommendation_id=? AND kind='close_ask'",id).first();}catch(error){if(!/no such table/i.test(String(error?.message||'')))throw error;}
    recommendationDeliveredAt=earliest([recommendationDeliveredAt,rec.sent_at,closeDelivery?.at]);
    const proceed=await repo.sql("SELECT MIN(created_at) AS at FROM cf_recommendation_events WHERE recommendation_id=? AND kind='proceed'",id).first();closeAskedAt=earliest([closeAskedAt,explicitAsk?.at,proceed?.at]);
  }
  const premium=await boundPremiumEvidence(repo,opportunityId),writtenAt=premium.totalCents!=null?premium.boundAt:null,effort=await producerEffortEvidence(repo,opportunityId);
  const measurement={
    opportunityId,opportunityCreatedAt:op.created_at,qualifiedPossessionAt:qualified?earliest([fiv?.status==='ready'?fivRow?.updated_at:null,conversationAt,quoteableAt,(STAGE_RANK[op.stage]||1)>1?op.updated_at:null]):null,contactMadeAt:contactAt,meaningfulConversationAt:conversationAt,quoteableAt,quotePreparedAt,recommendationDeliveredAt,closeAskedAt,boundAt:premium.boundAt,writtenPremiumRecordedAt:writtenAt,writtenPremiumCents:premium.totalCents,premiumEvidence:premium.evidence,producerMinutes:effort.minutes,producerMinutesBasis:effort.basis,producerEffortEntries:effort.entries,engine:ACQ_BUILD
  };
  const at=stamp();
  await repo.sql(`INSERT INTO cf_acq_opportunity_measurements(workspace_id,opportunity_id,opportunity_created_at,qualified_possession_at,contact_made_at,meaningful_conversation_at,quoteable_at,quote_prepared_at,recommendation_delivered_at,close_asked_at,bound_at,written_premium_recorded_at,written_premium_cents,premium_evidence_json,producer_minutes,producer_minutes_basis,measurement_json,engine,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(workspace_id,opportunity_id) DO UPDATE SET opportunity_created_at=excluded.opportunity_created_at,qualified_possession_at=excluded.qualified_possession_at,contact_made_at=excluded.contact_made_at,meaningful_conversation_at=excluded.meaningful_conversation_at,quoteable_at=excluded.quoteable_at,quote_prepared_at=excluded.quote_prepared_at,recommendation_delivered_at=excluded.recommendation_delivered_at,close_asked_at=excluded.close_asked_at,bound_at=excluded.bound_at,written_premium_recorded_at=excluded.written_premium_recorded_at,written_premium_cents=excluded.written_premium_cents,premium_evidence_json=excluded.premium_evidence_json,producer_minutes=excluded.producer_minutes,producer_minutes_basis=excluded.producer_minutes_basis,measurement_json=excluded.measurement_json,engine=excluded.engine,updated_at=excluded.updated_at`,
    repo.scope.workspace,opportunityId,measurement.opportunityCreatedAt,measurement.qualifiedPossessionAt,measurement.contactMadeAt,measurement.meaningfulConversationAt,measurement.quoteableAt,measurement.quotePreparedAt,measurement.recommendationDeliveredAt,measurement.closeAskedAt,measurement.boundAt,measurement.writtenPremiumRecordedAt,measurement.writtenPremiumCents,JSON.stringify(measurement.premiumEvidence),measurement.producerMinutes,measurement.producerMinutesBasis,JSON.stringify(measurement),measurement.engine,at).run();
  return measurement;
}

export async function refreshAcquisitionState(repo,opportunityId,touchInput=null){
  try{if(touchInput)await projectOpportunityAttribution(repo,opportunityId,touchInput);else if(!await repo.sql('SELECT opportunity_id FROM cf_acq_opportunity_attribution WHERE workspace_id=? AND opportunity_id=?',repo.scope.workspace,opportunityId).first())await deriveFallbackAttribution(repo,opportunityId);await refreshOpportunityMeasurement(repo,opportunityId);return {ok:true};}
  catch(error){if(/no such table|no such column/i.test(String(error?.message||'')))return {ok:false,state:'setup_required'};throw error;}
}

function campaignInput(value={}){
  const id=clean(value.id,160).toLowerCase().replace(/[^a-z0-9._:-]+/g,'_').replace(/^_+|_+$/g,''),name=clean(value.name,180),sourceFamily=sourceText(value.sourceFamily);
  if(!id||!validId(id))fail(422,'campaign_id','Use a short campaign identifier.');if(!name)fail(422,'campaign_name','Name the campaign.');if(!SOURCE_FAMILY_SET.has(sourceFamily))fail(422,'source_family','Choose a source family.');
  return {id,name,sourceFamily,sourceKey:clean(value.sourceKey,120),campaignVariant:clean(value.campaignVariant,120),partnerId:clean(value.partnerId,120),batchId:clean(value.batchId,120),status:['active','paused','completed'].includes(value.status)?value.status:'active'};
}
function spendInput(value={}){
  const amount=cents(value.amount),incurredOn=day(value.incurredOn),sourceFamily=sourceText(value.sourceFamily),campaignId=clean(value.campaignId,160);
  if(amount==null||amount<=0)fail(422,'amount','Enter an acquisition expense greater than zero.');if(!incurredOn)fail(422,'incurred_on','Choose the expense date.');if(!SOURCE_FAMILY_SET.has(sourceFamily))fail(422,'source_family','Choose a source family.');
  return {campaignId,sourceFamily,sourceKey:clean(value.sourceKey,120),partnerId:clean(value.partnerId,120),batchId:clean(value.batchId,120),category:['media','data','mail','event','partner','other'].includes(value.category)?value.category:'media',amountCents:amount,incurredOn,note:clean(value.note,600),evidenceRef:clean(value.evidenceRef,240)};
}

function blankGroup(key,attribution={}){return {key,sourceFamily:attribution.source_family||attribution.sourceFamily||'other',sourceKey:attribution.source_key||attribution.sourceKey||'',campaignId:attribution.campaign_id||attribution.campaignId||'',campaignVariant:attribution.campaign_variant||attribution.campaignVariant||'',partnerId:attribution.partner_id||attribution.partnerId||'',batchId:attribution.batch_id||attribution.batchId||'',spendCents:0,opportunities:0,qualified:0,contacts:0,conversations:0,quoteable:0,quotesPrepared:0,recommendationsDelivered:0,closeAsked:0,bound:0,boundPremiumCents:0,premiumEvidenceGaps:0,producerMinutes:0,effortMeasuredOpportunities:0};}
function groupKey(a){return a.campaign_id?`campaign:${a.campaign_id}`:`source:${a.source_family}:${a.source_key||'unclassified'}:${a.partner_id||''}:${a.batch_id||''}`;}
function finalize(group,rate){
  const ratio=(a,b)=>b?Math.round((a/b)*1000)/10:null;
  return {...group,quoteRatePct:ratio(group.quotesPrepared,group.qualified),recommendationRatePct:ratio(group.recommendationsDelivered,group.quotesPrepared),closeAskRatePct:ratio(group.closeAsked,group.recommendationsDelivered),bindRatePct:ratio(group.bound,group.qualified),costPerBoundRelationshipCents:group.bound&&group.spendCents?Math.round(group.spendCents/group.bound):null,premiumPerAcquisitionDollar:group.spendCents?Math.round((group.boundPremiumCents/group.spendCents)*100)/100:null,firstYearCommissionPerAcquisitionDollar:group.spendCents&&rate!=null?Math.round(((group.boundPremiumCents*rate)/group.spendCents)*100)/100:null,producerMinutesPerBind:group.bound&&group.producerMinutes?Math.round((group.producerMinutes/group.bound)*10)/10:null,premiumPerProducerHourCents:group.producerMinutes?Math.round((group.boundPremiumCents*60)/group.producerMinutes):null,effortCoveragePct:ratio(group.effortMeasuredOpportunities,group.opportunities)};
}

export function acquisitionMeasurement(repo,env={}){
  const {workspace}=repo.scope;
  return {
    async ready(){await repo.sql('SELECT opportunity_id FROM cf_acq_opportunity_measurements WHERE workspace_id=? LIMIT 1',workspace).first();},
    async campaign(value,requestId){const input=campaignInput(value),at=stamp();await repo.sql(`INSERT INTO cf_acq_campaigns(workspace_id,id,name,source_family,source_key,campaign_variant,partner_id,batch_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET name=excluded.name,source_family=excluded.source_family,source_key=excluded.source_key,campaign_variant=excluded.campaign_variant,partner_id=excluded.partner_id,batch_id=excluded.batch_id,status=excluded.status,updated_at=excluded.updated_at`,workspace,input.id,input.name,input.sourceFamily,input.sourceKey,input.campaignVariant,input.partnerId,input.batchId,input.status,at,at).run();return input;},
    async spend(value,requestId){const input=spendInput(value),prior=await repo.sql('SELECT * FROM cf_acq_spend WHERE workspace_id=? AND request_id=?',workspace,requestId).first();if(prior){const same=prior.campaign_id===input.campaignId&&prior.source_family===input.sourceFamily&&prior.source_key===input.sourceKey&&prior.partner_id===input.partnerId&&prior.batch_id===input.batchId&&prior.category===input.category&&Number(prior.amount_cents)===input.amountCents&&prior.incurred_on===input.incurredOn&&prior.note===input.note&&prior.evidence_ref===input.evidenceRef;if(!same)fail(409,'request_reused','That acquisition expense save request was already used. Reload before saving a different expense.');return input;}const id=`spend_${requestId}`,at=stamp();await repo.sql(`INSERT INTO cf_acq_spend(id,workspace_id,campaign_id,source_family,source_key,partner_id,batch_id,category,amount_cents,incurred_on,note,evidence_ref,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,workspace,input.campaignId,input.sourceFamily,input.sourceKey,input.partnerId,input.batchId,input.category,input.amountCents,input.incurredOn,input.note,input.evidenceRef,requestId,at).run();return input;},
    async campaigns(){return repo.rows('SELECT id,name,source_family,source_key,campaign_variant,partner_id,batch_id,status,created_at,updated_at FROM cf_acq_campaigns WHERE workspace_id=? ORDER BY status,name,id',workspace);},
    async reconcile(limit=250){const ids=await repo.rows(`SELECT o.id FROM cf_solo_opportunities o LEFT JOIN cf_acq_opportunity_attribution a ON a.workspace_id=o.workspace_id AND a.opportunity_id=o.id LEFT JOIN cf_acq_opportunity_measurements m ON m.workspace_id=o.workspace_id AND m.opportunity_id=o.id WHERE o.workspace_id=? AND (a.opportunity_id IS NULL OR m.opportunity_id IS NULL OR m.updated_at<o.updated_at OR EXISTS(SELECT 1 FROM cf_solo_sources s WHERE s.workspace_id=o.workspace_id AND s.opportunity_id=o.id AND s.updated_at>m.updated_at)) ORDER BY o.updated_at DESC LIMIT ?`,workspace,Math.max(1,Math.min(500,Number(limit)||250)));for(const row of ids)await refreshAcquisitionState(repo,row.id);return ids.length;},
    async summary(params=new URLSearchParams()){
      await this.reconcile(300);
      const days=Math.max(7,Math.min(365,Number(params.get?.('days')||30)||30)),until=new Date(),from=new Date(until.getTime()-days*86400000),fromIso=from.toISOString(),toIso=until.toISOString(),fromDay=fromIso.slice(0,10),toDay=toIso.slice(0,10),rate=moneyRate(env.COVERAGEFIT_FIRST_YEAR_COMMISSION_RATE);
      const rows=await repo.rows(`SELECT a.*,m.* FROM cf_acq_opportunity_attribution a JOIN cf_acq_opportunity_measurements m ON m.workspace_id=a.workspace_id AND m.opportunity_id=a.opportunity_id WHERE a.workspace_id=? AND m.opportunity_created_at>=? AND m.opportunity_created_at<=?`,workspace,fromIso,toIso),spend=await repo.rows('SELECT * FROM cf_acq_spend WHERE workspace_id=? AND incurred_on>=? AND incurred_on<=?',workspace,fromDay,toDay),groups=new Map(),familyGroups=new Map();
      for(const row of rows){const key=groupKey(row),g=groups.get(key)||blankGroup(key,row),fkey=`family:${row.source_family}`,fg=familyGroups.get(fkey)||blankGroup(fkey,{source_family:row.source_family});for(const x of [g,fg]){x.opportunities++;if(row.qualified_possession_at)x.qualified++;if(row.contact_made_at)x.contacts++;if(row.meaningful_conversation_at)x.conversations++;if(row.quoteable_at)x.quoteable++;if(row.quote_prepared_at)x.quotesPrepared++;if(row.recommendation_delivered_at)x.recommendationsDelivered++;if(row.close_asked_at)x.closeAsked++;if(row.bound_at)x.bound++;if(row.written_premium_cents!=null)x.boundPremiumCents+=Number(row.written_premium_cents);else if(row.bound_at)x.premiumEvidenceGaps++;if(row.producer_minutes!=null){x.producerMinutes+=Number(row.producer_minutes);x.effortMeasuredOpportunities++;}}groups.set(key,g);familyGroups.set(fkey,fg);}
      for(const s of spend){const campaignKey=s.campaign_id?`campaign:${s.campaign_id}`:`source:${s.source_family}:${s.source_key||'unclassified'}:${s.partner_id||''}:${s.batch_id||''}`,g=groups.get(campaignKey)||blankGroup(campaignKey,s),fkey=`family:${s.source_family}`,fg=familyGroups.get(fkey)||blankGroup(fkey,{source_family:s.source_family});g.spendCents+=Number(s.amount_cents);fg.spendCents+=Number(s.amount_cents);groups.set(campaignKey,g);familyGroups.set(fkey,fg);}
      const sorted=[...groups.values()].map(g=>finalize(g,rate)).sort((a,b)=>b.boundPremiumCents-a.boundPremiumCents||b.qualified-a.qualified||b.spendCents-a.spendCents),families=[...familyGroups.values()].map(g=>finalize(g,rate)).sort((a,b)=>b.boundPremiumCents-a.boundPremiumCents||b.qualified-a.qualified),total=finalize(sorted.reduce((acc,g)=>{for(const k of ['spendCents','opportunities','qualified','contacts','conversations','quoteable','quotesPrepared','recommendationsDelivered','closeAsked','bound','boundPremiumCents','premiumEvidenceGaps','producerMinutes','effortMeasuredOpportunities'])acc[k]+=g[k];return acc;},blankGroup('total',{sourceFamily:'all'})),rate);
      return {build:ACQ_BUILD,period:{days,from:fromIso,to:toIso},commissionRateConfigured:rate,totals:total,groups:sorted,families,warnings:[...(total.effortCoveragePct==null||total.effortCoveragePct<60?['Producer-time evidence is still sparse. Time-efficiency metrics are directional until more actual minutes are recorded.']:[]),...(total.bound&&total.premiumEvidenceGaps?['Some bound opportunities lack verified term-premium evidence and are excluded from bound premium.']:[])]};
    }
  };
}
