import {profileFacts} from './pvx-insight-delta-core.mjs';

const clone=value=>JSON.parse(JSON.stringify(value??null));
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`:JSON.stringify(value);
const SOURCE_TRUST={unknown:0,property_source_reported:1,customer_reported:2,document_identified:3,customer_confirmed:4,producer_verified:5,conflict:-1};

function appendImmutableRevision(revisions=[],revision){
  const next=[...revisions.map(clone)];
  const exact=next.find(item=>item.revisionId===revision.revisionId);
  if(exact){if(stable(exact.contents)===stable(revision.contents))return next;throw new Error('Immutable report revision cannot be overwritten.');}
  const equivalent=next.find(item=>(item.revision||item.reportRevision)===(revision.revision||revision.reportRevision)&&stable(item.contents)===stable(revision.contents));
  if(equivalent)return next;
  next.push(clone({...revision,immutable:true}));
  return next;
}

function factIndex(profile={}){
  const index=new Map();
  for(const row of profileFacts(profile)){
    const key=row.field.split('.').at(-1);
    const existing=index.get(key)||[];
    existing.push(row);
    index.set(key,existing);
  }
  return index;
}

function reconcileFacts(homeProfile={},policyProfile={}){
  const home=factIndex(homeProfile),policy=factIndex(policyProfile),keys=new Set([...home.keys(),...policy.keys()]),result=[];
  for(const key of keys){
    const left=home.get(key)?.at(-1)||null,right=policy.get(key)?.at(-1)||null;
    if(!left||!right){result.push({key,status:'single_source',value:clone((left||right)?.value),source:(left||right)?.source,evidenceRefs:clone((left||right)?.evidenceRefs||[])});continue;}
    if(stable(left.value)===stable(right.value)){const trusted=SOURCE_TRUST[left.source]>=SOURCE_TRUST[right.source]?left:right;result.push({key,status:'agreement_reused',value:clone(trusted.value),source:trusted.source,evidenceRefs:[...new Set([...(left.evidenceRefs||[]),...(right.evidenceRefs||[])])]});continue;}
    const leftTrust=SOURCE_TRUST[left.source]??0,rightTrust=SOURCE_TRUST[right.source]??0;
    if(leftTrust>=4&&leftTrust>rightTrust){result.push({key,status:'trusted_confirmation',value:clone(left.value),source:left.source,evidenceRefs:clone(left.evidenceRefs||[]),history:[clone(right)]});continue;}
    if(rightTrust>=4&&rightTrust>leftTrust){result.push({key,status:'trusted_confirmation',value:clone(right.value),source:right.source,evidenceRefs:clone(right.evidenceRefs||[]),history:[clone(left)]});continue;}
    result.push({key,status:'conflict_ask_once',value:null,source:'conflict',candidates:[clone(left),clone(right)],evidenceRefs:[...new Set([...(left.evidenceRefs||[]),...(right.evidenceRefs||[])])]});
  }
  return result;
}

function latestByLabel(revisions,label){return[...revisions].reverse().find(item=>(item.revision||item.reportRevision)===label)||null;}

function buildCombinedReview(record={},at=new Date().toISOString()){
  const revisions=record.reportRevisions||[],home=latestByLabel(revisions,'2H'),policy=latestByLabel(revisions,'2P');
  if(!home||!policy)return null;
  const reconciliation=reconcileFacts(record.homeProfile||{},record.currentPolicyProfile||{}),open=reconciliation.filter(item=>item.status==='conflict_ask_once');
  const contents={
    revisionStory:{from:[home.revisionId,policy.revisionId],to:'3'},
    discoveryTopics:clone(record.snapshot?.whatDylanWouldLookAtFirst||record.snapshot?.advisoryReviewTopics||[]),
    topicResponses:clone(record.topicResponses||[]),
    reconciledFacts:reconciliation,
    evidenceBackedFindings:clone(record.coverageReview?.findings||[]),
    recommendations:clone((record.recommendations||[]).filter(item=>item.status==='actual_recommendation')),
    recommendationResponses:clone(record.recommendationResponses||[]),
    finalDecisions:clone(record.finalDecisions||[]),
    insightDelta:{contractId:'coveragefit-insight-delta-v1',fromRevision:[home.revisionId,policy.revisionId],toRevision:'3',hasChanges:true,added:[],confirmed:reconciliation.filter(item=>['agreement_reused','trusted_confirmation'].includes(item.status)),changed:[],resolved:[],stillNeeded:open.map(item=>item.key),newTopics:[],explanation:'Your Home Profile and current-policy evidence are now shown together.'}
  };
  return{revisionId:`3_${at.replace(/\D/g,'')}`,revision:'3',reportRevision:'3',title:'Your Combined CoverageFit Review',createdAt:at,immutable:true,contents,printIdentification:`CoverageFit report revision 3 · ${at}`,accessibleChangeSummary:`Combined review added. ${open.length} item${open.length===1?'':'s'} still need confirmation.`,guardrails:{topicIsRecommendation:false,buyInIsAuthorization:false,quoteReadinessIsEligibility:false,personalDiscoveryAffectsScore:false}};
}

function revisionStory(record={}){
  const revisions=[];
  if(record.snapshot)revisions.push({revisionId:'1_snapshot',revision:'1',reportRevision:'1',title:'Your CoverageFit Snapshot',createdAt:record.createdAt||'',immutable:true,contents:clone(record.snapshot)});
  for(const item of record.reportRevisions||[])revisions.push(clone(item));
  return revisions.map((item,index)=>({revisionId:item.revisionId,revision:item.revision||item.reportRevision,title:item.title,createdAt:item.createdAt,immutable:true,whatChanged:item.contents?.insightDelta||null,previousRevisionId:index?revisions[index-1].revisionId:null,printIdentification:item.printIdentification||`CoverageFit report revision ${item.revision||item.reportRevision}`,accessibleChangeSummary:item.accessibleChangeSummary||item.contents?.insightDelta?.explanation||'Report revision preserved.'}));
}

function whatChangedSinceLastVisit(record={}){const story=revisionStory(record),latest=story.at(-1);return latest?.whatChanged?{revisionId:latest.revisionId,...clone(latest.whatChanged)}:null;}

export{appendImmutableRevision,reconcileFacts,buildCombinedReview,revisionStory,whatChangedSinceLastVisit};
