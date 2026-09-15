import {acquisitionMeasurement} from './acquisition-measurement.mjs';

export const ECON_BUILD='CF-ECON-1.0';

const numeric=value=>value===null||value===undefined||String(value).trim()===''?null:(Number.isFinite(Number(value))?Number(value):null);
const centsPerHour=value=>{const n=numeric(value);return n!=null&&n>=0?Math.round(n):null;};
const pct=(a,b)=>b?Math.round((a/b)*1000)/10:null;
const ratio=(a,b)=>b?Math.round((a/b)*100)/100:null;
const rounded=value=>value==null?null:Math.round(value);

function sampleStatus(qualified){
  const n=Number(qualified||0);
  if(n>=30)return 'usable';
  if(n>=10)return 'directional';
  return 'early';
}
function attentionStatus(group={}){
  if(!Number(group.effortMeasuredOpportunities||0))return 'not_measured';
  const coverage=Number(group.effortCoveragePct||0);
  if(coverage>=100)return 'complete';
  if(coverage>=60)return 'directional';
  return 'sparse';
}
function economicsRow(group={},settings={}){
  const attentionRate=settings.attentionRateCentsPerHour;
  const commissionRate=settings.commissionRate;
  const minutes=Number(group.producerMinutes||0);
  const spend=Number(group.spendCents||0);
  const premium=Number(group.boundPremiumCents||0);
  const bound=Number(group.bound||0);
  const labor=attentionRate==null?null:rounded((minutes/60)*attentionRate);
  const observedCost=labor==null?null:spend+labor;
  const attention=attentionStatus(group);
  const complete=attentionRate!=null&&attention==='complete';
  const trueCost=complete?observedCost:null;
  const firstYearCommission=commissionRate==null?null:rounded(premium*commissionRate);
  return {
    ...group,
    sampleStatus:sampleStatus(group.qualified),
    attentionStatus:attention,
    producerHours:Math.round((minutes/60)*100)/100,
    attentionRateCentsPerHour:attentionRate,
    recordedAttentionCostCents:labor,
    observedAcquisitionCostCents:observedCost,
    trueAcquisitionCostCents:trueCost,
    trueCostComplete:complete,
    observedCostPerBoundRelationshipCents:bound&&observedCost!=null?rounded(observedCost/bound):null,
    trueCostPerBoundRelationshipCents:bound&&trueCost!=null?rounded(trueCost/bound):null,
    premiumPerObservedAcquisitionDollar:observedCost?ratio(premium,observedCost):null,
    premiumPerTrueAcquisitionDollar:trueCost?ratio(premium,trueCost):null,
    firstYearCommissionCents:firstYearCommission,
    firstYearCommissionPerObservedAcquisitionDollar:firstYearCommission!=null&&observedCost?ratio(firstYearCommission,observedCost):null,
    firstYearCommissionPerTrueAcquisitionDollar:firstYearCommission!=null&&trueCost?ratio(firstYearCommission,trueCost):null,
    firstYearCommissionLessObservedAcquisitionCostCents:firstYearCommission!=null&&observedCost!=null?firstYearCommission-observedCost:null,
    firstYearCommissionLessTrueAcquisitionCostCents:firstYearCommission!=null&&trueCost!=null?firstYearCommission-trueCost:null
  };
}

export function buildEconomicsSummary(acqSummary={},env={}){
  const attentionRate=centsPerHour(env.COVERAGEFIT_PRODUCER_ATTENTION_COST_PER_HOUR_CENTS);
  const commissionRate=numeric(acqSummary.commissionRateConfigured);
  const settings={attentionRateCentsPerHour:attentionRate,commissionRate:commissionRate!=null&&commissionRate>=0&&commissionRate<=1?commissionRate:null};
  const groups=(acqSummary.groups||[]).map(group=>economicsRow(group,settings)).sort((a,b)=>{
    const aComplete=a.trueCostComplete?1:0,bComplete=b.trueCostComplete?1:0;
    return bComplete-aComplete||(b.boundPremiumCents||0)-(a.boundPremiumCents||0)||(b.qualified||0)-(a.qualified||0);
  });
  const families=(acqSummary.families||[]).map(group=>economicsRow(group,settings));
  const totals=economicsRow(acqSummary.totals||{},settings);
  const warnings=[...(acqSummary.warnings||[])];
  if(attentionRate==null)warnings.push('Producer attention has no configured dollar value, so CoverageFit will not calculate observed or true acquisition cost.');
  else if(totals.attentionStatus!=='complete')warnings.push('Recorded producer attention is incomplete. Observed acquisition cost is a lower bound; true acquisition cost stays hidden until effort coverage reaches 100%.');
  if(settings.commissionRate==null)warnings.push('First-year commission economics remain hidden until an explicit commission rate is configured.');
  warnings.push('This is an acquisition-efficiency view, not an agency profit statement. Fixed overhead, renewals, bonuses, taxes, servicing cost and unrecorded labor are excluded.');
  return {
    build:ECON_BUILD,
    period:acqSummary.period||null,
    settings:{attentionRateCentsPerHour:attentionRate,commissionRateConfigured:settings.commissionRate},
    totals,
    groups,
    families,
    warnings
  };
}

export function economicsService(repo,env={}){
  return {
    async summary(params=new URLSearchParams()){
      const acq=acquisitionMeasurement(repo,env);
      await acq.ready();
      return buildEconomicsSummary(await acq.summary(params),env);
    }
  };
}
