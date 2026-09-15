(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CoverageFitPVXReadinessContract=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const BUILD='CF-PVX-READY-1.0',CONTRACT_ID='coveragefit-action-readiness-v1';
  const ACTION_READINESS_STATES=Object.freeze(['open_if_fit','wants_explanation_first','price_dependent','exploring','not_sure']);
  const CHANGE_SCOPES=Object.freeze(['coverage_structure','carrier','either','not_sure']);
  const DESIRED_NEXT_ACTIONS=Object.freeze(['understand_snapshot','ask_about_topics','see_if_comparison_is_worthwhile','become_quote_ready','review_current_policy','continue_independently','continue_later']);
  const CHANGE_SCOPE_TRIGGERS=Object.freeze(['see_if_comparison_is_worthwhile','become_quote_ready','review_current_policy','ask_dylan']);
  function validReadiness(value){return ACTION_READINESS_STATES.includes(value);}
  function validChangeScope(value){return CHANGE_SCOPES.includes(value);}
  function validDesiredAction(value){return DESIRED_NEXT_ACTIONS.includes(value);}
  function changeScopeRelevant(action,checkpoint='snapshot'){return CHANGE_SCOPE_TRIGGERS.includes(action)||['home_profile','policy_review','combined_review','producer_conversation'].includes(checkpoint);}
  return Object.freeze({BUILD,CONTRACT_ID,ACTION_READINESS_STATES,CHANGE_SCOPES,DESIRED_NEXT_ACTIONS,CHANGE_SCOPE_TRIGGERS,validReadiness,validChangeScope,validDesiredAction,changeScopeRelevant});
});

