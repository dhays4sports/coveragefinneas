import {validReviewTopic} from './pvx-meaningful-signal-core.mjs';

const clone=value=>JSON.parse(JSON.stringify(value??null));
const FACT_SOURCES=new Set([
  'property_source_reported',
  'customer_reported',
  'customer_confirmed',
  'producer_verified',
  'document_identified',
  'unknown',
  'conflict'
]);

function profileFacts(profile){
  const rows=[];
  for(const [section,values] of Object.entries(profile||{})){
    if(!values||typeof values!=='object'||Array.isArray(values))continue;
    for(const [field,fact] of Object.entries(values)){
      if(!fact||typeof fact!=='object'||Array.isArray(fact)||!FACT_SOURCES.has(fact.source))continue;
      rows.push({field:`${section}.${field}`,value:clone(fact.value),source:fact.source,evidenceRefs:clone(fact.evidenceRefs||[])});
    }
  }
  return rows;
}

function topicDelta(before=[],after=[]){
  const prior=new Set(before.filter(validReviewTopic).map(topic=>topic.topicKey));
  return after.filter(validReviewTopic).filter(topic=>!prior.has(topic.topicKey)).map(topic=>({
    topicKey:topic.topicKey,
    label:topic.label,
    becauseYouToldUs:topic.becauseYouToldUs,
    evidenceRefs:clone(topic.evidenceRefs||[]),
    status:'worth_reviewing'
  }));
}

function homeProfileDelta(snapshot={},profile={},readiness={},nextTopics=[]){
  const rows=profileFacts(profile);
  const confirmed=rows.filter(row=>['customer_confirmed','producer_verified'].includes(row.source));
  const added=rows.filter(row=>['customer_reported','property_source_reported'].includes(row.source));
  const conflicts=rows.filter(row=>row.source==='conflict');
  const unresolved=new Set([
    ...rows.filter(row=>row.source==='unknown').map(row=>row.field),
    ...(readiness.stillNeeded||[]).map(item=>typeof item==='string'?item:item?.field).filter(Boolean)
  ]);
  const newTopics=topicDelta(snapshot.advisoryReviewTopics||snapshot.reviewTopics||[],nextTopics);
  return{
    contractId:'coveragefit-insight-delta-v1',
    schemaVersion:'1.0',
    fromRevision:'1',
    toRevision:'2H',
    hasChanges:newTopics.length>0||confirmed.length>0||added.length>0||conflicts.length>0,
    summary:{added:added.length,confirmed:confirmed.length,changed:0,resolved:0,stillNeeded:unresolved.size,newTopics:newTopics.length},
    added,
    confirmed,
    changed:[],
    resolved:[],
    stillNeeded:[...unresolved],
    newTopics,
    explanation:newTopics.length?'Your Home Profile added evidence that changed the areas worth reviewing.':(confirmed.length||added.length||conflicts.length)?'Your Home Profile made the property picture more precise.':'No customer-safe result changed because no new property evidence was received.',
    guardrails:{quoteReadinessIsEligibility:false,policyDeficiencyFound:false,recommendationCreated:false,protectionScoreChanged:false}
  };
}

function policyEvidenceDelta(snapshot={},policyProfile={},review={},recommendations=[]){
  const rows=profileFacts(policyProfile);
  const confirmed=rows.filter(row=>['customer_confirmed','producer_verified'].includes(row.source));
  const identified=rows.filter(row=>row.source==='document_identified');
  const unresolved=rows.filter(row=>['unknown','conflict'].includes(row.source));
  const meaningful=review.meaningfulPolicyEvidence===true;
  const safeRecommendations=meaningful?recommendations:[];
  return{
    contractId:'coveragefit-insight-delta-v1',
    schemaVersion:'1.0',
    fromRevision:'1',
    toRevision:'2P',
    hasChanges:Boolean(meaningful&&(confirmed.length>0||identified.length>0||safeRecommendations.length>0)),
    summary:{added:meaningful?identified.length:0,confirmed:meaningful?confirmed.length:0,changed:safeRecommendations.length,resolved:0,stillNeeded:unresolved.length,newTopics:0},
    added:identified,
    confirmed,
    changed:safeRecommendations.map(item=>({recommendationKey:item.recommendationKey,label:item.label||item.title||item.recommendationKey,status:'actual_recommendation',evidenceRefs:clone(item.evidenceRefs||item.anchor?.evidenceRefs||[])})),
    resolved:[],
    stillNeeded:unresolved.map(row=>row.field),
    newTopics:[],
    explanation:meaningful?'Current-policy evidence made an evidence-backed coverage review possible.':'No policy result changed because meaningful current-policy evidence is still needed.',
    guardrails:{meaningfulPolicyEvidence:meaningful,topicIsRecommendation:false,personalDiscoveryAffectsScore:false,bindAuthorized:false}
  };
}

export{profileFacts,topicDelta,homeProfileDelta,policyEvidenceDelta};
