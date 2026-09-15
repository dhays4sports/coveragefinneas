const valueOf=value=>value&&typeof value==='object'&&'value'in value?value.value:value;
export function deriveRespectfulPathway({discovery={},readiness=null,currentRelationship={}}={}){
  const answers=discovery.answers||{},priorities=Array.isArray(answers.improvementPriorities)?answers.improvementPriorities:[];
  const tenure=valueOf(currentRelationship.tenure),mustKeep=Array.isArray(currentRelationship.mustKeep)?currentRelationship.mustKeep.map(valueOf):[];
  const priceOnly=priorities.length===1&&priorities[0]==='price_only',continuity=Boolean(tenure||mustKeep.includes('carrier_relationship')||mustKeep.includes('agent_relationship'));
  let kind='standard',customerNarrative='',producerPrompt='Start with the customer’s stated reason for looking.';
  if(readiness?.state==='exploring'){kind='exploring';customerNarrative='You can keep exploring at your own pace. Nothing here requires a contact request.';producerPrompt='Acknowledge that the customer is exploring before asking what would be useful to understand.';}
  else if(readiness?.state==='not_sure'){kind='not_sure';customerNarrative='Not sure is a complete answer. Every option remains open.';producerPrompt='Acknowledge uncertainty and ask which part would be most useful to make clearer.';}
  else if(continuity){kind='continuity';customerNarrative='Your existing relationship matters. Dylan would want to preserve what is working while understanding whether anything needs attention.';producerPrompt='Acknowledge the valued relationship before asking what prompted this review.';}
  else if(priceOnly||readiness?.state==='price_dependent'){kind='cost_focused';customerNarrative='Price is the priority you named. A useful comparison should keep cost central and make any tradeoffs clear.';producerPrompt='Acknowledge that price is central before asking what would make a comparison worthwhile.';}
  return Object.freeze({schemaVersion:'1.0',kind,customerNarrative,producerPrompt,evidenceRefs:[...(priceOnly?[{source:'pvx_discovery',key:'improvementPriorities',status:'customer-reported'}]:[]),...(readiness?[{source:'action_readiness',key:'state',status:'customer-reported'}]:[]),...(continuity?[{source:'current_relationship',key:'tenure_or_must_keep',status:'customer-reported'}]:[])],createsTopic:false,createsRecommendation:false,affectsProtectionScore:false,negativeLabel:false});
}
