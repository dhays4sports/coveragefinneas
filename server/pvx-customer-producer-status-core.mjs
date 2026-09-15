const PROJECTIONS={
  review_pending:{state:'review_pending',label:'Your review is waiting for Dylan.'},
  contact_attempted:{state:'contact_requested',label:'Dylan has tried to reach you.'},
  spoke_with_customer:{state:'conversation_scheduled',label:'You and Dylan have connected.'},
  information_requested:{state:'information_needed',label:'Dylan needs information you agreed to provide.'},
  quote_started:{state:'options_being_prepared',label:'Dylan is preparing options to discuss with you.'},
  quote_prepared:{state:'dylan_reviewing',label:'Dylan is reviewing the options before discussing them with you.'},
  follow_up_scheduled:{state:'follow_up_scheduled',label:'Your follow-up is scheduled.'},
  not_proceeding:{state:'not_proceeding',label:'This review is not moving forward right now.'},
  bound:{state:'completed',label:'This CoverageFit review is complete.'}
};
function projectCustomerProducerStatus(record={}){const internal=record.producerStatus||'review_pending',base=PROJECTIONS[internal]||PROJECTIONS.review_pending,action=record.customerRequestedAction&&record.customerRequestedAction.visible===true?{label:String(record.customerRequestedAction.label||''),dueContext:String(record.customerRequestedAction.dueContext||'')}:null;return{contractId:'coveragefit-customer-producer-status-v1',state:base.state,label:base.label,relationship:'Personally reviewed by Dylan at 408FARMERS.',requestedAction:action,updatedAt:String(record.producerStatusHistory?.at(-1)?.createdAt||record.updatedAt||''),privacy:{rawInternalStatusExposed:false,internalNotesExposed:false,carrierDiscussionExposed:false,suppressionStateExposed:false},promises:{responseTime:false,approval:false,availability:false,rate:false,coverage:false}}}
export{PROJECTIONS,projectCustomerProducerStatus};
