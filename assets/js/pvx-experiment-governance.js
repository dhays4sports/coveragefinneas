(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.CoverageFitPVXExperimentGovernance=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const BUILD='CF-PVX-READY-LEARN-2.2',CONTRACT_ID='coveragefit-ethical-experiment-registry-v1',MINIMUM_REPORTABLE_COHORT=5;
  const AREAS=new Set(['hooks','route_hooks','question_placement','explanation_copy','snapshot_hierarchy','action_labels','optional_path_explanation']),STATUSES=new Set(['draft','approved','active','paused','completed']);
  const EVENTS=new Set(['hook_viewed','entry_selected','first_answered','snapshot_viewed','topic_count_rendered','topic_expanded','topic_responded','snapshot_saved','snapshot_shared','deeper_path_selected','delta_viewed','report_returned','life_event_updated','contact_requested','producer_ready','path_completed','readiness_prompt_viewed','readiness_expressed','readiness_updated','change_scope_expressed','change_scope_updated','desired_action_selected','contact_plan_confirmed','producer_conversation_completed']);
  const REQUIRED_PROTECTIONS=['recommendation_rules','protection_score_math','evidence_meaning','consent','identity','suppression','producer_ownership','value_order'];
  const REQUIRED_CHOICES=['exploring','not_sure','continue_later'];
  const PROHIBITED=/fake activity|social proof|scarcity|countdown|urgency|fear|hidden exit|default consent|contact gate|readiness manipulation|remove exploring|remove not sure|underinsured|policy deficiency|guaranteed/i;
  const text=(value,max=500)=>String(value??'').trim().slice(0,max);
  function validateExperiment(value={}){
    const errors=[];
    if(!/^pvx_[a-z0-9_]{6,80}$/.test(text(value.experimentId,90)))errors.push('experiment_id');
    if(!AREAS.has(value.area))errors.push('area');if(!STATUSES.has(value.status))errors.push('status');
    if(!text(value.hypothesis,300)||PROHIBITED.test(value.hypothesis))errors.push('hypothesis');
    if(!EVENTS.has(value.targetEvent)||value.primaryMetric!==value.targetEvent)errors.push('primary_metric');
    if(!Array.isArray(value.protectedMetrics)||!value.protectedMetrics.length||value.protectedMetrics.some(item=>item!=='continue_later_visible'&&!EVENTS.has(item)))errors.push('protected_metrics');
    if(!Array.isArray(value.guardrails)||!value.guardrails.includes('comprehension')||!value.guardrails.includes('producer_quality')||PROHIBITED.test(JSON.stringify(value.guardrails)))errors.push('guardrails');
    const plan=value.samplePlan||{};if(!Number.isInteger(plan.minimumSampleSize)||plan.minimumSampleSize<10||!Number.isInteger(plan.minimumReportableCohort)||plan.minimumReportableCohort<MINIMUM_REPORTABLE_COHORT||!text(plan.observationWindow,120))errors.push('sample_plan');
    const stop=value.stoppingRule||{};if(!Number.isInteger(stop.minimumSampleSize)||stop.minimumSampleSize<plan.minimumSampleSize||stop.completeObservationWindow!==true||stop.noEarlySignificance===false)errors.push('stopping_rule');
    if(!EVENTS.has(value.comprehensionMetric)||!['producer_conversation_completed','producer_ready'].includes(value.producerQualityMetric))errors.push('quality_metrics');
    if(!Array.isArray(value.choiceProtections)||REQUIRED_CHOICES.some(choice=>!value.choiceProtections.includes(choice)))errors.push('choice_protections');
    if(!Array.isArray(value.variants)||value.variants.length<2||!value.variants.some(item=>item.key==='control')||value.variants.some(item=>!/^[-a-z0-9_]{2,40}$/.test(text(item.key,50))||!Number.isInteger(item.weight)||item.weight<1||PROHIBITED.test(JSON.stringify(item))))errors.push('variants');
    if(value.status==='active'&&['semantic','accessibility','privacy'].some(key=>value.reviews?.[key]!=='approved'))errors.push('reviews');
    if(value.rollback?.method!=='set_status_paused'||value.rollback?.controlVariant!=='control'||value.rollback?.immediate!==true)errors.push('rollback');
    if(REQUIRED_PROTECTIONS.some(item=>!value.protectedContracts?.includes(item)))errors.push('protected_contracts');if(PROHIBITED.test(JSON.stringify(value)))errors.push('prohibited_pattern');
    return{valid:errors.length===0,errors};
  }
  function hash(value){let result=2166136261;for(const character of text(value,180)){result^=character.charCodeAt(0);result=Math.imul(result,16777619);}return result>>>0;}
  function assignVariant(experiment={},anonymousJourneyId=''){const validation=validateExperiment(experiment);if(!validation.valid)throw new TypeError(`Invalid experiment: ${validation.errors.join(',')}`);if(experiment.status!=='active')return{experimentId:experiment.experimentId,variant:'control',active:false,containsPii:false};if(!/^pvxa_[A-Za-z0-9]{16,40}$/.test(text(anonymousJourneyId,60)))throw new TypeError('A non-identifying anonymous journey id is required.');const total=experiment.variants.reduce((sum,item)=>sum+item.weight,0),slot=hash(`${experiment.experimentId}:${anonymousJourneyId}`)%total;let cursor=0,variant='control';for(const item of experiment.variants){cursor+=item.weight;if(slot<cursor){variant=item.key;break;}}return{experimentId:experiment.experimentId,variant,active:true,containsPii:false};}
  function canActivate(experiment){return validateExperiment({...experiment,status:'active'}).valid;}
  function pauseExperiment(experiment={},reason='manual_pause',at=new Date().toISOString()){if(!['approved','active'].includes(experiment.status))return{...experiment};return{...experiment,status:'paused',pause:{reason:text(reason,120),pausedAt:at,immediate:true},activeTrafficPercent:0};}
  return Object.freeze({BUILD,CONTRACT_ID,MINIMUM_REPORTABLE_COHORT,AREAS:[...AREAS],REQUIRED_PROTECTIONS,REQUIRED_CHOICES,validateExperiment,assignVariant,canActivate,pauseExperiment});
});
