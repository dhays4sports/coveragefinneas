const LEVELS=new Set(['unknown','low','medium','high']);
const QUEUES=new Set(['unclassified','shoot_now','quick_play','develop','nurture','low_priority']);
const clean=(value,max=160)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);
const lower=(value,max=160)=>clean(value,max).toLowerCase();
const reason=(code,label,evidence='')=>Object.freeze({code,label,evidence:clean(evidence,200)});
const dimension=(level,reasons=[])=>Object.freeze({level:LEVELS.has(level)?level:'unknown',reasons:reasons.slice(0,8)});
const queueLabel=Object.freeze({unclassified:'Unclassified',shoot_now:'🔥 Shoot now',quick_play:'⚡ Quick play',develop:'🏀 Develop',nurture:'🌱 Nurture',low_priority:'⬇ Low priority'});

function sourceContext(sources=[]){
  const lead=[...sources].reverse().find(source=>source.kind==='lead'&&(source.summary?.context?.reviewTrack==='condo'||source.summary?.attribution?.sourceKey==='web_408_condo'));
  return {lead,context:lead?.summary?.context||{}};
}
function appointment(sources=[]){return sources.map(s=>s.kind==='calendar'?s.summary:s.summary?.appointment).find(a=>a?.status==='scheduled'&&Number.isFinite(Date.parse(a.start||a.scheduledStart||'')))||null;}
function relatedSignals(profile={}){
  const related=profile?.relatedOpportunities||[];
  const textBlob=related.map(item=>`${item.products||''} ${item.reason||''} ${item.source||''}`).join(' ').toLowerCase();
  return {count:related.length,umbrella:/umbrella/.test(textBlob),landlord:/landlord|rental/.test(textBlob),commercial:/commercial|business/.test(textBlob),life:/\blife\b/.test(textBlob)};
}
function fitCondo(context={}){
  const property=lower(context.propertyType,40),housing=lower(context.housing,40),carrier=lower(context.currentCarrier,60),unitWater=lower(context.unitWaterShutoff,40),device=lower(context.automaticWaterShutoffDevice,40),willing=lower(context.waterShutoffWillingness,40),reasons=[];
  if(property!=='condo')return dimension('unknown',[reason('property_not_confirmed','Condo property type is not confirmed.')]);
  reasons.push(reason('condo_product_lane','Condo / HO-6 is the requested product lane.','property_type=condo'));
  if(carrier==='farmers')return dimension('medium',[...reasons,reason('existing_farmers_relationship','Current carrier is Farmers; treat this as service/cross-sell context rather than a conquest assumption.','current_carrier=farmers')]);
  if(housing==='landlord')return dimension('medium',[...reasons,reason('rental_use_review','The condo is rented to someone else, so producer verification of the correct product/use is needed.','housing=landlord')]);
  const personalUse=['owner_occupied','second_home'].includes(housing);
  if(unitWater==='building_controlled'){
    const waterReason=reason('unit_water_not_independently_shuttable','Customer reports water cannot be shut off to the unit independently. Under the current condo workflow, the unit-level automatic shutoff device requirement is not expected to apply on this fact; producer verification is still required.','unit_water_shutoff=building_controlled');
    if(personalUse)return dimension('high',[...reasons,reason('known_personal_use','Customer reported owner occupancy or second-home use.','housing='+housing),waterReason]);
    return dimension('medium',[...reasons,waterReason,reason('use_needs_confirmation','Condo use still needs producer confirmation.')]);
  }
  if(unitWater==='independent'){
    if(device==='installed'){
      const waterReason=reason('water_device_reported_installed','Customer reports an automatic water shutoff device is already installed for the individually shuttable unit. Producer verification is still required.','automatic_water_shutoff_device=installed');
      if(personalUse)return dimension('high',[...reasons,reason('known_personal_use','Customer reported owner occupancy or second-home use.','housing='+housing),waterReason]);
      return dimension('medium',[...reasons,waterReason]);
    }
    if(device==='not_installed'&&willing==='no')return dimension('low',[...reasons,reason('water_device_required_unwilling','Customer reports the unit can be shut off independently, does not have the device installed, and is not willing to install one if required. This is a sales-fit friction signal, not an eligibility decision.','unit_water_shutoff=independent;device=not_installed;willingness=no')]);
    if(device==='not_installed'&&['yes','maybe'].includes(willing))return dimension('medium',[...reasons,reason('water_device_install_path','Customer reports the unit can be shut off independently and the device is not installed, but there may be an installation path. Confirm the requirement, timing, and installation practicality before quoting deeply.',`unit_water_shutoff=independent;device=not_installed;willingness=${willing}`)]);
    return dimension('medium',[...reasons,reason('water_device_status_unresolved','Customer reports the unit can be shut off independently, so the automatic shutoff requirement needs to be verified before treating the condo as a clean fit.',`unit_water_shutoff=independent;device=${device||'unknown'}`)]);
  }
  if(unitWater==='unsure')return dimension('medium',[...reasons,reason('water_configuration_needs_verification','Customer is not sure whether water can be shut off to the unit independently. Verify this early because it determines whether the automatic shutoff requirement applies.','unit_water_shutoff=unsure')]);
  if(personalUse)return dimension('high',[...reasons,reason('known_personal_use','Customer reported owner occupancy or second-home use.','housing='+housing),reason('water_configuration_not_yet_collected','Water-shutoff configuration has not yet been collected; preserve current fit and verify after booking.')]);
  return dimension('medium',[...reasons,reason('use_needs_confirmation','Condo use still needs producer confirmation.')]);
}
function intentCondo(context={},sources=[]){
  const why=lower(context.reviewReason,60),timing=lower(context.renewalTiming,40),reasons=[],appt=appointment(sources);
  if(appt)return dimension('high',[reason('scheduled_conversation','A customer-selected conversation is scheduled.',appt.start||appt.scheduledStart||'')]);
  if(['now_urgent','within_30'].includes(timing))reasons.push(reason('near_term_timing','Customer needs the review now or within 30 days.','renewal_timing='+timing));
  if(['nonrenewal_notice','buying_condo'].includes(why))reasons.push(reason('active_trigger','Customer reported a nonrenewal or condo purchase.','review_reason='+why));
  if(why==='renewal_change')reasons.push(reason('renewal_change','Customer reported a meaningful renewal change.'));
  if(reasons.length)return dimension('high',reasons);
  if(timing==='days_31_60'||['shopping_price','renewal_change'].includes(why))return dimension('medium',[reason('active_but_not_immediate','Customer is shopping or has a 31–60 day timing window.',`reason=${why};timing=${timing}`)]);
  if(timing==='over_60')return dimension('low',[reason('future_timing','Customer reported a review need more than 60 days away.')]);
  if(why==='coverage_review')return dimension('medium',[reason('explicit_review_interest','Customer explicitly requested a condo coverage review.')]);
  return dimension('unknown',[reason('timing_unknown','Decision timing is not yet known.')]);
}
function valueCondo(context={},profile={}){
  const vehicles=lower(context.autoVehicleCount,20),housing=lower(context.housing,40),related=relatedSignals(profile),reasons=[];
  if(['2','3_plus'].includes(vehicles))reasons.push(reason('multi_vehicle_bundle','Two or more vehicles are available for a household review.','auto_vehicle_count='+vehicles));
  else if(vehicles==='1')reasons.push(reason('auto_bundle','One auto is available for a household review.'));
  else if(vehicles==='0')reasons.push(reason('condo_only_known','No auto was reported in this intake.'));
  if(['second_home','landlord'].includes(housing))reasons.push(reason('additional_property_complexity','Reported condo use suggests an additional-property relationship may exist.','housing='+housing));
  if(related.count>1)reasons.push(reason('existing_household_relationship','The UCP already contains multiple explicitly linked opportunities.',`related_opportunities=${related.count}`));
  if(related.umbrella)reasons.push(reason('umbrella_relationship','An explicitly linked opportunity references umbrella coverage.'));
  if(related.landlord)reasons.push(reason('landlord_relationship','An explicitly linked opportunity references landlord/rental coverage.'));
  if(related.commercial)reasons.push(reason('commercial_relationship','An explicitly linked opportunity references commercial/business insurance.'));
  if(related.life)reasons.push(reason('life_relationship','An explicitly linked opportunity references life insurance.'));
  const expansion=reasons.filter(r=>!['condo_only_known'].includes(r.code)).length;
  if(['2','3_plus'].includes(vehicles)||(expansion>=2))return dimension('high',reasons);
  if(vehicles==='1'||['second_home','landlord'].includes(housing)||related.count>1)return dimension('medium',reasons);
  if(vehicles==='0')return dimension('low',reasons);
  return dimension('unknown',[reason('relationship_scope_unknown','Household expansion potential has not been established yet.')]);
}
function chooseQueue(fit,intent,value){
  const f=fit.level,i=intent.level,v=value.level;
  if(f==='low'||(i==='low'&&v==='low'))return 'low_priority';
  if(f==='high'&&i==='high'&&v==='high')return 'shoot_now';
  if(i==='high'&&['high','medium'].includes(f))return 'quick_play';
  if(['high','medium'].includes(f)&&['high','medium'].includes(v)&&['medium','low'].includes(i))return 'develop';
  if(['high','medium'].includes(f)&&['low','unknown'].includes(i))return 'nurture';
  if([f,i,v].every(x=>x==='unknown'))return 'unclassified';
  return 'develop';
}
export function derivePossessionQuality({opportunity=null,sources=[],customerProfile=null}={}){
  const {lead,context}=sourceContext(sources);
  if(!lead)return Object.freeze({schemaVersion:'1.2',engine:'CF-FIV-1.2',scope:'condo_v1',status:'not_applicable',fit:dimension('unknown'),intent:dimension('unknown'),value:dimension('unknown'),queue:'unclassified',queueLabel:queueLabel.unclassified,reasons:['FIV 1.2 currently applies only to the dedicated condo acquisition lane.'],numericScore:null,buyingPrediction:null,eligibilityConclusion:null,underwritingDecision:false,identityAutoMerged:false,usesSensitiveDemographics:false,requiresProducerJudgment:true,calibrationMode:'observational',autoRecalibration:false});
  const fit=fitCondo(context),intent=intentCondo(context,sources),value=valueCondo(context,customerProfile||{}),queue=chooseQueue(fit,intent,value);
  return Object.freeze({schemaVersion:'1.2',engine:'CF-FIV-1.2',scope:'condo_v1',status:'ready',fit,intent,value,queue,queueLabel:queueLabel[queue],source:{kind:'lead',id:lead.source_id,sourceKey:lead.summary?.attribution?.sourceKey||'',signalVersion:context.fivSignalVersion||''},numericScore:null,buyingPrediction:null,eligibilityConclusion:null,underwritingDecision:false,identityAutoMerged:false,usesSensitiveDemographics:false,requiresProducerJudgment:true,prohibitedInputs:['age','race','ethnicity','religion','sex','sexual_orientation','health_information','credit','inferred_affluence','household_income','behavioral_propensity'],calibrationMode:'observational',autoRecalibration:false});
}
export const FIV_QUEUES=QUEUES;
export const FIV_LEVELS=LEVELS;
