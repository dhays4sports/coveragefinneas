import {clean} from './recommendation-model.mjs';
export const TEMPLATE_BUILD='CF-QUOTE-TEMPLATES-1.0';
export function templateConfig(value={}) {
  const config={name:clean(value.name,100),matchDescription:clean(value.matchDescription,1500),instructions:clean(value.instructions,12000)};
  if(!config.name || !config.matchDescription || !config.instructions)throw new Error('Add a template name, recognition description and extraction instructions.');
  return config;
}
export const starterTemplates=[
 {name:'Farmers proposals',matchDescription:'Farmers Value Insurance Package Preliminary Estimate; automobile, residential property or CEA estimate sections.',instructions:'Identify actual policy sections, even if filenames differ. Auto/Home and Auto/Renter are applied discounts, never evidence of an auto quote. Separate Farmers Smart Plan Condominium, Renters, Home, Auto and CEA policies. Read Limits/Ded, not the Premium column, for coverage values. Preserve unit-owner building property, association loss assessment, roof actual cash value, percentage and dollar deductibles, Fair Plan Companion Endorsement and loss-specific exceptions. Ignore generic Coverage Choices, optional coverage notices and RCE estimates as selected coverage. Preserve all billing plans and their distinct initial premium, fees, supplemental installments, amount due today and later installments. Carry service-charge footnotes. Do not infer payment count when not printed. Never confuse the FAIR Plan loss-assessment supplemental fee with a FAIR Plan policy.'},
 {name:'Foremost insurance estimates',matchDescription:'Foremost Insurance Estimate with Coverages/Endorsements, Discounts/Surcharges and Payment Options Available.',instructions:'Extract the stated policy period and program. FAIR Plan Companion Discount indicates a condition on this quote, not a second policy in this document. Separate base premium, taxes/fees and Total Premium. Payment columns are 1, 2, 4, 10 and 12 payments when present: preserve Premium Due, Surcharge, Service Fee, Amount Due Now, Amount of Each Remaining Payment, Next Payment Due and EFT requirements. Do not turn the first premium installment into the total due or divide annual premium to invent equal payments.'},
 {name:'California FAIR Plan screenshots',matchDescription:'California FAIR Plan portal screenshots showing Policy/Quote Number, Dwelling Coverage and Pricing.',instructions:'Combine screenshots with the same quote number as one policy; overlapping values are not additional policies. Preserve exact field labels including Improvements, Alterations and Additions when shown. Distinguish Dwelling Limit from Total Coverage Limit and reconstruction estimate. Read checked and unchecked boxes separately for dwelling replacement cost, personal property replacement cost, extended dwelling coverage and inflation guard. Preserve unchecked selections in warnings or coverage conditions. Blank values are unknown, not zero. New-Pending and New-Approved do not mean bound. Read pricing only from the actual Pricing field, not notification thumbnails. Leave absent dates and term null/empty: the separate producer workflow supplies the paired annual term.'},
 {name:'Issued policy evidence',matchDescription:'Evidence of Insurance for Mortgagee/Other Interests; policy status In Force or issued declarations, without an actual new quote section.',instructions:'Classify this as policy_evidence and return no proposed policies. Do not treat evidence of insurance, a renewal date, lender clauses or a balance due as a proposed quote. Explain the document classification in warnings.'}
];
// Stable, editable expected answers. Source coordinates and free-form commentary remain for visual review.
export function answerFields(result) {
 const fields={documentType:result.documentType||'unknown'};
 const walk=(v,path)=>{if(Array.isArray(v)){fields[path+'.count']=v.length;v.forEach((x,i)=>walk(x,path+'.'+i));}else if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v)){if(['id','documentIds','documentId','page','source','evidence','verified','template','extractedAt','model','warnings','selection','paymentNotes','termSource'].includes(k))continue;walk(x,path?path+'.'+k:k);}}else fields[path]=v??null;};
 walk(result.policies||[],'policies');return fields;
}
export function differences(expected,actual){return [...new Set([...Object.keys(expected||{}),...Object.keys(actual||{})])].filter(k=>JSON.stringify(expected?.[k])!==JSON.stringify(actual?.[k])).map(path=>({path,expected:expected?.[path]??null,actual:actual?.[path]??null}));}
export function workflowSettings(value={}){return {fairPlanCompanionTerm:value.fairPlanCompanionTerm!==false};}
export function applyQuoteWorkflow(draft,settings) {
 if(!settings.fairPlanCompanionTerm)return draft;
 for(const option of draft.options){const companions=option.policies.filter(p=>p.policyKind==='companion');if(companions.length!==1)continue;const c=companions[0];if(c.termMonths!==12)continue;
  for(const p of option.policies.filter(p=>p.policyKind==='fair_plan')) {
   if(((p.termMonths==null||p.termMonths===12)&&!p.effectiveDate)||p.termSource===`companion:${c.id}`){const changed=p.termMonths!==12||p.effectiveDate!==c.effectiveDate||p.expirationDate!==c.expirationDate;p.termMonths=12;p.effectiveDate=c.effectiveDate;p.expirationDate=c.expirationDate;p.termSource=`companion:${c.id}`;if(changed)p.verified=false;}
  }
 }
 return draft;
}
