import {TOKEN_PATTERN,hashToken} from './pvx-checkpoint-core.mjs';
import {revisionStory,whatChangedSinceLastVisit} from './pvx-revision-story-core.mjs';
import {nextUsefulUnlock} from './pvx-next-unlock-core.mjs';
import {projectCustomerProducerStatus} from './pvx-customer-producer-status-core.mjs';
import {customerDocumentLibrary} from './pvx-customer-document-library-core.mjs';
import {readinessState} from './pvx-readiness-core.mjs';
import {latestReentryUpdate} from './pvx-readiness-reentry-core.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const error=(status,code,message)=>json({ok:false,error:{code,message}},status);
const LABELS={snapshot_saved:'CoverageFit Snapshot',home_profile_ready:'Home Profile',coverage_review_ready:'Current Coverage Review',combined_review_ready:'Combined Review',producer_reviewed:'Producer Review'};
const READINESS_LABELS={open_if_fit:'Open if the overall fit makes sense',wants_explanation_first:'Want Dylan to explain it first',price_dependent:'Would consider it only if price improves',exploring:'Exploring for now',not_sure:'Not sure yet'};
const SCOPE_LABELS={coverage_structure:'Adjust how I’m protected',carrier:'Consider a different insurance company',either:'Either, if the overall fit makes sense',not_sure:'Not sure yet'};
const ACTION_LABELS={understand_snapshot:'Understand my Snapshot',ask_about_topics:'Ask Dylan about these topics',see_if_comparison_is_worthwhile:'See if a comparison is worthwhile',become_quote_ready:'Prepare my home for a quote',review_current_policy:'Review my current policy',continue_independently:'Keep exploring on my own',continue_later:'Continue later'};

function accessState(record){if(record.customerAccess?.deleted===true)return'deleted';if(record.customerAccess?.revoked===true)return'no_longer_authorized';if(record.producerAssisted===true)return'producer_assisted';return'active';}
function reportLinks(story=[]){return story.filter(item=>item.revisionId).map(item=>({revisionId:item.revisionId,revision:item.revision,title:item.title,createdAt:item.createdAt,label:`Open revision ${item.revision}`,path:`/pvx/report/?revision=${encodeURIComponent(item.revisionId)}`,authorized:true}));}

function projection(record,token){
  const state=accessState(record),checkpoints=(record.leadCheckpoints||[]).filter(item=>LABELS[item.checkpointType]),story=revisionStory(record),latest=story.at(-1)||null;
  const homeDone=checkpoints.some(item=>item.checkpointType==='home_profile_ready'),policyDone=checkpoints.some(item=>item.checkpointType==='coverage_review_ready');
  const shared=record.consent?.contact===true||record.customerSharing?.producer===true,topics=record.snapshot?.signalSurface?.topicCount??(record.snapshot?.whatDylanWouldLookAtFirst||record.snapshot?.advisoryReviewTopics||[]).length,next=nextUsefulUnlock(record);
  const latestReport={revision:latest?.revision||'1',title:latest?.title||'Your CoverageFit Snapshot',createdAt:latest?.createdAt||record.createdAt||''},producer=projectCustomerProducerStatus(record),ready=readinessState(record),returnUpdate=latestReentryUpdate(record);
  const readiness={current:ready.currentActionReadiness?{state:ready.currentActionReadiness.state,label:READINESS_LABELS[ready.currentActionReadiness.state],expressedAt:ready.currentActionReadiness.expressedAt}:null,changeScope:ready.currentChangeScope?{scope:ready.currentChangeScope.scope,label:SCOPE_LABELS[ready.currentChangeScope.scope],expressedAt:ready.currentChangeScope.expressedAt}:null,desiredNextAction:ready.currentDesiredNextAction?{action:ready.currentDesiredNextAction.action,label:ACTION_LABELS[ready.currentDesiredNextAction.action],selectedAt:ready.currentDesiredNextAction.selectedAt}:null,contactPlan:record.consent?.contact===true?{preferredMethod:record.contact?.preferredMethod||'',bestTime:record.contact?.bestTime||'',purpose:record.contact?.purpose||''}:null,customerSafeProducerStatus:producer.label,inferred:false,conversionJudgment:null};
  return{schemaVersion:'2.2',view:'living_coveragefit_home',state,brandLine:producer.relationship,latestResult:{topicCount:topics,topicCountLabel:`${topics} ${topics===1?'area':'areas'} worth reviewing`,reportRevision:latestReport.revision,reportTitle:latestReport.title},latestReport,mostRecentDelta:whatChangedSinceLastVisit(record)||returnUpdate?.projectionDelta||null,latestReturnUpdate:returnUpdate,complete:checkpoints.map(item=>({checkpointType:item.checkpointType,label:LABELS[item.checkpointType],createdAt:item.createdAt||''})),whatDylanReceived:shared?checkpoints.map(item=>LABELS[item.checkpointType]):[],contactRequested:record.consent?.contact===true,readiness,optionalRemaining:[...(!homeDone?['home_profile']:[]),...(!policyDone?['current_policy']:[])],reportRevisions:state==='active'?reportLinks(story):[],homeProfileStatus:homeDone?'complete':record.homeProfilePath?.status||'optional',currentPolicyStatus:policyDone?'complete':record.currentPolicyPath?.status||'optional',producerStatus:producer,producerNextStep:producer.label,nextValue:next,continueButtons:state==='active'?[{path:next.primary.path==='current_policy'?'/pvx/policy/':next.primary.path==='home_profile'?'/pvx/home-profile/':'/pvx/continue/',label:next.primary.label,value:next.primary.value}]:[],resumeState:record.resumeState||null,returnGuidance:{sameDevice:'You can continue on this device without creating an account.',crossDevice:'Save your CoverageFit to receive a secure return link for another device.'},accountRequired:false,privacy:{internalNotesExposed:false,underwritingNotesExposed:false,unauthorizedDocumentsExposed:false,conversionJudgmentExposed:false},legacyTokenAccepted:Boolean(token)};
}

export async function handlePVXProgressCenter(request,{store,now=new Date()}={}){
  if(request.method!=='POST')return error(405,'method_not_allowed','POST is required.');
  let body;try{body=await request.json();}catch{return error(400,'invalid_json','Valid JSON is required.');}
  const token=String(body.token||'').slice(0,80);if(!TOKEN_PATTERN.test(token)||!store?.get)return error(404,'progress_unavailable','This secure CoverageFit is unavailable.');
  const record=await store.get(`pvx/checkpoint/${await hashToken(token)}`);if(!record)return error(404,'progress_unavailable','This secure CoverageFit is unavailable.');
  if(Date.parse(record.expiresAt)<=now.getTime())return error(410,'progress_expired','This secure return has expired. Ask Dylan for a new link.');
  const progress=projection(record,token);if(progress.state==='deleted')return error(410,'progress_deleted','This CoverageFit record is no longer available.');if(progress.state==='no_longer_authorized')return error(410,'progress_revoked','This secure CoverageFit access is no longer authorized.');
  progress.documents=progress.state==='active'?customerDocumentLibrary(record,now):[];return json({ok:true,progress});
}

export{accessState,reportLinks,projection};
