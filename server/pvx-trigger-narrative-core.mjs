const keys=refs=>new Set((Array.isArray(refs)?refs:[]).map(ref=>ref?.key).filter(Boolean));
export function deriveTriggerNarrative(whyNowThread,firstTopic=null){
  if(!whyNowThread?.customerReported||whyNowThread.inferred!==false||!whyNowThread.evidenceRefs?.length)return null;
  const whyKeys=keys(whyNowThread.evidenceRefs),topicKeys=keys(firstTopic?.evidenceRefs),connected=[...whyKeys].some(key=>topicKeys.has(key));
  const topicConnection=connected&&firstTopic?`${firstTopic.label} appears first because it connects directly to what you said matters.`:'';
  return Object.freeze({schemaVersion:'1.0',narrativeType:'trigger_centered_snapshot',shortForm:whyNowThread.headline,longForm:whyNowThread.connection,topicConnection,connectedTopicKey:connected?firstTopic.topicKey:null,evidenceRefs:whyNowThread.evidenceRefs,currentPolicyEvaluated:false,policyFinding:false,recommendation:false,severity:false,affectsProtectionScore:false});
}
export function validTriggerNarrative(value){return value==null||Boolean(value.narrativeType==='trigger_centered_snapshot'&&value.evidenceRefs?.length&&value.currentPolicyEvaluated===false&&value.policyFinding===false&&value.recommendation===false&&value.severity===false&&value.affectsProtectionScore===false);}

