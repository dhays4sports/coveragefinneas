import {appendReadinessExpression,appendChangeScopeExpression,appendProducerObservation,extendReadinessRecord} from './pvx-readiness-core.mjs';
const STATUSES=new Set(['review_pending','contact_attempted','spoke_with_customer','information_requested','quote_started','quote_prepared','follow_up_scheduled','not_proceeding','bound']);
const clean=(value,max=800)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);
export function reconcileProducerOutcome(record={},input={},now=new Date()){
  if(input.status&&!STATUSES.has(input.status))throw new TypeError('Unsupported producer outcome.');
  let next=extendReadinessRecord(record);const at=now.toISOString(),ownerId=clean(input.ownerId,120);
  if(input.readinessExpression)next=appendReadinessExpression(next,{...input.readinessExpression,sourceCheckpoint:'producer_conversation',source:'producer_recorded_customer_statement',expressedAt:input.readinessExpression.expressedAt||at});
  if(input.changeScopeExpression)next=appendChangeScopeExpression(next,{...input.changeScopeExpression,sourceCheckpoint:'producer_conversation',source:'producer_recorded_customer_statement',expressedAt:input.changeScopeExpression.expressedAt||at});
  if(input.producerObservation)next=appendProducerObservation(next,{...input.producerObservation,producerId:ownerId,observedAt:input.producerObservation.observedAt||at});
  if(input.customerConstraint){const words=clean(input.customerConstraint.exactCustomerWords,800);if(!words)throw new TypeError('Customer constraints require preserved exact wording.');const item={constraintId:clean(input.customerConstraint.constraintId,120),exactCustomerWords:words,source:'producer_recorded_customer_statement',sourceCheckpoint:'producer_conversation',recordedAt:at};if(!(next.customerConstraints||[]).some(value=>value.constraintId===item.constraintId))next.customerConstraints=[...(next.customerConstraints||[]),item];}
  if(input.status){const event={outcomeId:clean(input.outcomeId,120)||`outcome_${at}`,status:input.status,ownerId,createdAt:at,customerReadinessChanged:Boolean(input.readinessExpression),customerChangeScopeChanged:Boolean(input.changeScopeExpression)};if(!(next.producerOutcomeHistory||[]).some(value=>value.outcomeId===event.outcomeId))next.producerOutcomeHistory=[...(next.producerOutcomeHistory||[]),event];}
  return{record:next,preserved:{originalReadiness:true,recommendationResponses:true,decisions:true,authorization:true},customerSafeStatus:input.customerSafeStatus||record.customerProducerStatus||''};
}
export {STATUSES};

