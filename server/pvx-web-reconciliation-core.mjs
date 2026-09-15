export const PVX_WEB_RECONCILIATION_BUILD = '408-CF-PVX-WEB-1.9';
export const PVX_WEB_RECONCILIATION_CONTRACT = 'coveragefit-cross-entry-reconciliation-v2';
export const PVX_WEB_SOURCES = Object.freeze(['408farmers_web','ringcentral_sms','ai_caller','campaign','neighbor_referral','property_intelligence','discovery','home_profile','policy_document','producer_verification','existing_consultation']);
export const PVX_EVIDENCE_TRUST = Object.freeze({ unknown:0, public_reported:1, customer_reported:2, document_identified:3, customer_confirmed:4, producer_verified:5 });
const text=(v,m=160)=>String(v??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,m);
const stable=v=>JSON.stringify(v, Object.keys(v&&typeof v==='object'&&!Array.isArray(v)?v:{}).sort());
function normalize(observation={}) { const source=text(observation.source,60); return { source:PVX_WEB_SOURCES.includes(source)?source:'408farmers_web', value:observation.value??null, evidenceStatus:Object.hasOwn(PVX_EVIDENCE_TRUST,observation.evidenceStatus)?observation.evidenceStatus:'unknown', capturedAt:text(observation.capturedAt,40), exactCustomerWords:text(observation.exactCustomerWords,800) }; }
export function reconcilePvxField(field, observations=[], askedConflicts=[]) {
  const history=(Array.isArray(observations)?observations:[]).map(normalize), known=history.filter(item=>item.value!==null&&item.value!==''&&item.evidenceStatus!=='unknown');
  if(!known.length)return{field,status:'unknown',value:null,history,askCustomer:false,conflictAsked:false,silentWinner:false};
  const groups=new Map();for(const item of known){const key=stable(item.value);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  if(groups.size===1)return{field,status:'agreement_reused',value:known[0].value,sources:known.map(item=>item.source),history,askCustomer:false,conflictAsked:false,silentWinner:false};
  const ranked=[...known].sort((a,b)=>PVX_EVIDENCE_TRUST[b.evidenceStatus]-PVX_EVIDENCE_TRUST[a.evidenceStatus]);
  if(PVX_EVIDENCE_TRUST[ranked[0].evidenceStatus]>PVX_EVIDENCE_TRUST[ranked[1].evidenceStatus]&&PVX_EVIDENCE_TRUST[ranked[0].evidenceStatus]>=PVX_EVIDENCE_TRUST.customer_confirmed)return{field,status:'trusted_confirmation_updated',value:ranked[0].value,source:ranked[0].source,evidenceStatus:ranked[0].evidenceStatus,history,askCustomer:false,conflictAsked:false,silentWinner:false};
  const asked=(Array.isArray(askedConflicts)?askedConflicts:[]).includes(field);
  return{field,status:'conflict_needs_confirmation',value:null,candidates:[...groups.values()].map(group=>({value:group[0].value,sources:group.map(item=>item.source)})),history,askCustomer:!asked,conflictAsked:asked,silentWinner:false};
}
export function reconcilePvxContexts(contexts=[], options={}) { const fields={};for(const context of Array.isArray(contexts)?contexts:[]){for(const [field,fact] of Object.entries(context?.facts||{})){(fields[field]||=[]).push({source:context.source,value:fact?.value??fact,evidenceStatus:fact?.evidenceStatus||context.evidenceStatus,capturedAt:fact?.capturedAt||context.capturedAt,exactCustomerWords:fact?.exactCustomerWords});}}return Object.fromEntries(Object.entries(fields).map(([field,observations])=>[field,reconcilePvxField(field,observations,options.askedConflicts)])); }
export function authorizeIdentityReconciliation(input={}) { const deterministic=Boolean(input.webJourneyId&&input.smsJourneyId&&(input.bootstrapLinkVerified||input.producerVerified));return{authorized:deterministic,merge:deterministic,contactMatchOnly:Boolean(input.phoneMatch||input.emailMatch)&&!deterministic,reason:deterministic?'deterministic_link':(input.phoneMatch||input.emailMatch)?'contact_match_requires_confirmation':'no_link',silentMerge:false}; }
