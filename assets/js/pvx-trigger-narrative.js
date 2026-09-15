(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CoverageFitPVXTriggerNarrative=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';const keys=refs=>new Set((Array.isArray(refs)?refs:[]).map(ref=>ref?.key).filter(Boolean));
  function derive(why,topic){if(!why?.customerReported||why.inferred!==false||!why.evidenceRefs?.length)return null;const a=keys(why.evidenceRefs),b=keys(topic?.evidenceRefs),connected=[...a].some(key=>b.has(key));return Object.freeze({schemaVersion:'1.0',narrativeType:'trigger_centered_snapshot',shortForm:why.headline,longForm:why.connection,topicConnection:connected&&topic?`${topic.label} appears first because it connects directly to what you said matters.`:'',connectedTopicKey:connected?topic.topicKey:null,evidenceRefs:why.evidenceRefs,currentPolicyEvaluated:false,policyFinding:false,recommendation:false,severity:false,affectsProtectionScore:false});}
  return Object.freeze({VERSION:'1.0.0',BUILD:'CF-PVX-READY-1.4',derive});
});

