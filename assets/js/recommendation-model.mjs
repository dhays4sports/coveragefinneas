import {normalizeDeviceTask,deviceTaskIssues,publicDeviceTask,DEVICE_TASK_KINDS} from './device-task-model.mjs?v=bridge-1';
import {normalizeProtectionTask,publicProtectionTask,PROTECTIONS,CONTRACTOR_LINKS} from './protection-model.mjs?v=1';
export const BUILD = 'CF-RECOMMEND-1.0';
export function newId() {if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
export const clean = (value, max = 500) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, '').trim().slice(0, max);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const amount = value => value === '' || value == null ? null : Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100000000 ? Math.round(Number(value) * 100) / 100 : null;
export const money = value => amount(value) == null ? 'To confirm' : new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:2}).format(Number(value));
const list = (value, max = 12) => Array.isArray(value) ? value.slice(0, max) : [];
const oneOf = (value, values, fallback) => values.includes(value) ? value : fallback;
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(value)) ? value : '';
export function newPolicy(id = 'policy-1') {
  return {id, carrier:'', product:'Home', termMonths:12, termPremium:null, initialPayment:null, installmentAmount:null, installmentCount:null, paymentNotes:'', effectiveDate:'', quoteExpiresOn:'', coverages:[], deductibles:[], documentIds:[], verified:false};
}
export function newDraft() {
  return {contact:{name:'',email:'',mobile:''}, context:{kind:'direct',id:''}, priority:'', reasons:'', tradeoff:'', nextAction:'ready', missingItem:'', nextSteps:'Confirm final details and your requested start date. Complete any required signatures and payment with Dylan.', checklist:[], bookingEnabled:true, visual:'none', recommendedOptionId:'option-1', options:[{id:'option-1',label:'My recommendation',policies:[newPolicy()]}], sharedDocumentIds:[]};
}
function normalizeFacts(value) {
  return list(value, 24).map((row, index) => ({label:clean(row?.label,100), value:clean(row?.value,240), documentId:clean(row?.documentId,80), page:Number.isInteger(Number(row?.page)) && Number(row.page) > 0 ? Number(row.page) : null, source:oneOf(row?.source,['quote','producer'],'producer')})).filter(row => row.label || row.value);
}
export function normalizeDraft(value = {}) {
  const defaults = newDraft();
  return {
    contact:{name:clean(value.contact?.name,160),email:clean(value.contact?.email,200),mobile:clean(value.contact?.mobile,40)},
    context:{kind:oneOf(value.context?.kind,['direct','consultation','lead','opportunity'],'direct'),id:clean(value.context?.id,140)},
    priority:clean(value.priority,600), reasons:clean(value.reasons,1400), tradeoff:clean(value.tradeoff,800),
    nextAction:oneOf(value.nextAction,['ready','item','appointment'],'ready'), missingItem:clean(value.missingItem,300),
    nextSteps:clean(value.nextSteps || defaults.nextSteps,1000),
    checklist:list(value.checklist,8).map(item => clean(typeof item === 'string' ? item : item?.label,200)).filter(Boolean),
    bookingEnabled:value.bookingEnabled !== false, visual:oneOf(value.visual,['none','house','deductible'],'none'),
    recommendedOptionId:clean(value.recommendedOptionId,80), sharedDocumentIds:list(value.sharedDocumentIds).map(id=>clean(id,80)),
    options:list(value.options,4).map((option,index) => ({id:clean(option.id || `option-${index+1}`,80),label:clean(option.label || `Option ${index+1}`,100),policies:list(option.policies,6).map((policy,i)=>({
      id:clean(policy.id || `policy-${index+1}-${i+1}`,80),carrier:clean(policy.carrier,100),product:clean(policy.product,100),
      termMonths:[1,3,6,12].includes(Number(policy.termMonths)) ? Number(policy.termMonths) : null,
      policyKind:oneOf(policy.policyKind,['ordinary','companion','fair_plan'],'ordinary'), termSource:clean(policy.termSource,100), expirationDate:date(policy.expirationDate),
      policyFees:amount(policy.policyFees), quoteTotal:amount(policy.quoteTotal), discountConditions:clean(policy.discountConditions,1200),
      selectedPaymentPlanId:clean(policy.selectedPaymentPlanId,80), paymentPlans:list(policy.paymentPlans,8).map((plan,j)=>({id:clean(plan.id||`plan-${j+1}`,80),name:clean(plan.name,100),initialPayment:amount(plan.initialPayment),installmentAmount:amount(plan.installmentAmount),installmentCount:Number.isInteger(plan.installmentCount)&&plan.installmentCount>0&&plan.installmentCount<=36?plan.installmentCount:null,nextDue:date(plan.nextDue),notes:clean(plan.notes,1400)})),
      termPremium:amount(policy.termPremium), initialPayment:amount(policy.initialPayment), installmentAmount:amount(policy.installmentAmount),
      installmentCount:Number.isInteger(Number(policy.installmentCount)) && Number(policy.installmentCount)>0 && Number(policy.installmentCount)<=36 ? Number(policy.installmentCount) : null,
      paymentNotes:clean(policy.paymentNotes,800),effectiveDate:date(policy.effectiveDate),quoteExpiresOn:date(policy.quoteExpiresOn),
      coverages:normalizeFacts(policy.coverages),deductibles:normalizeFacts(policy.deductibles), documentIds:list(policy.documentIds).map(id=>clean(id,80)),
      verified:policy.verified === true, evidence:clean(policy.evidence,1800),deviceTask:Array.isArray(policy.protectionTasks)?null:normalizeDeviceTask(policy.deviceTask),
      ...(Array.isArray(policy.protectionTasks)?{protectionTasks:list(policy.protectionTasks,5).map(t=>normalizeProtectionTask(t)||{id:'invalid',confirmed:false})}:{})
    }))}))
  };
}
export function approvalIssues(draft, documents = []) {
  const errors=[];
  if(!draft.contact.name) errors.push('Add the client’s name.');
  if(!draft.reasons) errors.push('Explain why you recommend this option.');
  if(!draft.tradeoff) errors.push('Note the material tradeoff or confirm that none was identified.');
  if(!draft.options.length || !draft.options.some(o=>o.id===draft.recommendedOptionId)) errors.push('Choose your recommended option.');
  const ids=new Set();
  for(const option of draft.options) {
    if(ids.has(option.id)) errors.push('Each option needs its own identifier.'); ids.add(option.id);
    if(!option.policies.length) errors.push(`${option.label}: add at least one policy.`);
    const policyIds=new Set();
    for(const policy of option.policies) {
      if(policyIds.has(policy.id)) errors.push('Each policy needs its own identifier.'); policyIds.add(policy.id);
      if(!policy.carrier || !policy.product || !policy.termMonths || policy.termPremium == null) errors.push(`${option.label}: confirm carrier, product, policy term and quoted premium.`);
      if(!policy.coverages.length || !policy.deductibles.length) errors.push(`${policy.product || option.label}: add key coverages and deductibles (or a confirmed “Not applicable”).`);
      if([...policy.coverages,...policy.deductibles].some(f=>!f.label || !f.value)) errors.push(`${policy.product || option.label}: complete or remove empty coverage details.`);
      if(policy.paymentPlans?.length && policy.selectedPaymentPlanId && !policy.paymentPlans.some(p=>p.id===policy.selectedPaymentPlanId))errors.push('Choose an available payment plan.');
      if(policy.policyFees!=null && policy.quoteTotal!=null && Math.abs(policy.termPremium+policy.policyFees-policy.quoteTotal)>.02)errors.push(`${policy.product}: premium plus fees does not match the quoted total.`);
      if(!policy.verified) errors.push(`${policy.product || option.label}: confirm the material quote details.`);
      errors.push(...deviceTaskIssues(policy.deviceTask).map(message=>`${policy.product}: ${message}`));
      if(Array.isArray(policy.protectionTasks)){
        if(policy.protectionTasks.length>4||new Set(policy.protectionTasks.map(t=>t.id)).size!==policy.protectionTasks.length)errors.push('Choose each protection category at most once per policy.');
        for(const task of policy.protectionTasks){errors.push(...deviceTaskIssues(task).map(message=>`${policy.product} · ${PROTECTIONS[task.id]||'Protection'}: ${message}`));if(!PROTECTIONS[task.id]||!task.presetId||!task.presetVersion)errors.push('Choose a current provider recommendation for each protection step.');}
        if(policy.protectionTasks.length&&/auto|motor|life|umbrella|commercial|business/i.test(policy.product))errors.push('These California residential protection recommendations cannot be attached to that policy type.');
      }
      if(policy.deviceTask&&/auto|motor|life|umbrella/i.test(policy.product))errors.push('The California Home water-shutoff pilot cannot be attached to this non-Home policy.');
      if(policy.installmentCount && policy.installmentAmount == null) errors.push(`${policy.product}: confirm the installment amount or remove the count.`);
      for(const id of policy.documentIds) if(!documents.some(d=>d.id===id)) errors.push('A policy references an unavailable document.');
      for(const fact of [...policy.coverages,...policy.deductibles]) if(fact.documentId && !documents.some(d=>d.id===fact.documentId)) errors.push('A coverage source references an unavailable document.');
    }
  }
  if(draft.nextAction==='item' && !draft.missingItem) errors.push('Name the specific item still needed.');
  if(!draft.nextSteps) errors.push('Explain the remaining steps.');
  for(const id of draft.sharedDocumentIds) if(!documents.some(d=>d.id===id && d.role!=='current_policy')) errors.push('Only available quote/supporting documents can be shared here.');
  return [...new Set(errors)];
}
export const policyCost = p => p.quoteTotal ?? (p.policyFees!=null && p.termPremium!=null ? Math.round((p.termPremium+p.policyFees)*100)/100 : p.termPremium);
export function optionPrice(option) {
  const policies=option?.policies || [];
  if(!policies.length) return {headline:'Price to confirm',detail:''};
  if(policies.length===1) return {headline:money(policyCost(policies[0])),detail:`Quoted cost · ${policies[0].termMonths} months`};
  if(new Set(policies.map(p=>p.termMonths)).size===1 && policies.every(p=>p.termPremium!=null)) return {headline:money(policies.reduce((sum,p)=>sum+policyCost(p),0)),detail:`Combined quoted cost · ${policies[0].termMonths} months · separate policies`};
  return {headline:'Your policies, together',detail:'Different policy terms — individual premiums below'};
}
export function paymentLines(policy) {
  const plan=policy.paymentPlans?.find(p=>p.id===policy.selectedPaymentPlanId);
  const rows=[];
  if(policy.policyFees!=null)rows.push(`Term premium ${money(policy.termPremium)} + listed fees ${money(policy.policyFees)}.`);
  if(policy.discountConditions)rows.push(`Price conditions: ${policy.discountConditions}`);
  if(policy.paymentPlans?.length && !plan)return [...rows,'Payment plan to be selected with Dylan.',...(policy.paymentNotes?[policy.paymentNotes]:[])];
  if(plan){rows.push(`Payment plan: ${plan.name}`);if(plan.nextDue)rows.push(`Next payment due: ${plan.nextDue}`);policy={...policy,...plan,paymentNotes:[plan.notes,policy.paymentNotes].filter(Boolean).join(' ')};}
  if(policy.initialPayment!=null) rows.push(`Initial payment: ${money(policy.initialPayment)}`);
  if(policy.installmentAmount!=null) rows.push(`${policy.installmentCount ? `${policy.installmentCount} subsequent installments` : 'Subsequent installment amount'}: ${money(policy.installmentAmount)} each`);
  if(policy.paymentNotes) rows.push(policy.paymentNotes);
  if(!rows.length) rows.push('Payment options will be confirmed with Dylan.');
  return rows;
}
export function clientProjection(draft, documents, producer) {
  const value=normalizeDraft(draft);
  return {
    clientName:value.contact.name, priority:value.priority,reasons:value.reasons,tradeoff:value.tradeoff,
    options:value.options.map(o=>({...o,policies:o.policies.map(p=>{const {verified,evidence,documentIds,termSource,paymentPlans,...safe}=p;const selected=paymentPlans.find(plan=>plan.id===p.selectedPaymentPlanId);if(selected){safe.initialPayment=selected.initialPayment;safe.installmentAmount=selected.installmentAmount;safe.installmentCount=selected.installmentCount;safe.paymentNotes=[`Payment plan: ${selected.name}`,selected.nextDue?`Next payment due: ${selected.nextDue}`:'',selected.notes,p.paymentNotes].filter(Boolean).join(' ');}else if(paymentPlans.length){safe.initialPayment=null;safe.installmentAmount=null;safe.installmentCount=null;safe.paymentNotes=['Payment plan to be selected with Dylan.',p.paymentNotes].filter(Boolean).join(' ');} return {...safe,deviceTask:publicDeviceTask(p.deviceTask),...(p.protectionTasks?{protectionTasks:p.protectionTasks.map(publicProtectionTask)}:{}),coverages:safe.coverages.map(({label,value})=>({label,value})),deductibles:safe.deductibles.map(({label,value})=>({label,value}))};})})),
    recommendedOptionId:value.recommendedOptionId,nextAction:value.nextAction,missingItem:value.missingItem,nextSteps:value.nextSteps,
    checklist:value.checklist,bookingEnabled:value.bookingEnabled,visual:value.visual,
    documents:documents.filter(d=>value.sharedDocumentIds.includes(d.id) && d.role!=='current_policy').map(d=>({id:d.id,name:d.name,type:d.type})),
    producer:{name:clean(producer.name,120),firstName:clean(producer.firstName || 'Dylan',40),agency:clean(producer.agency,160),license:clean(producer.license,100),phone:clean(producer.phone,40),email:clean(producer.email,200)}
  };
}
export function recommendationEmail(view, url='') {
  const option=view.options.find(o=>o.id===view.recommendedOptionId);
  const producer=view.producer;
  const lines=[`Hi ${view.clientName.split(' ')[0]},`,'',view.priority?`Your priority: ${view.priority}\nHere is my recommendation.`:'Here is my recommendation for your insurance.',''];
  for(const policy of option.policies) lines.push(`${policy.carrier} · ${policy.product}: ${money(policyCost(policy))} quoted cost for ${policy.termMonths} months.`,...paymentLines(policy),'');
  lines.push('Why I recommend it:',view.reasons,'','Important to understand:',view.tradeoff,'');
  for(const policy of option.policies)if(policy.deviceTask)lines.push(`Device next step — ${policy.carrier} ${policy.product}: ${DEVICE_TASK_KINDS[policy.deviceTask.kind]}.`,policy.deviceTask.instruction,policy.deviceTask.dueDate?`Documented due date: ${policy.deviceTask.dueDate}.`:'','Equipment and installation costs are separate from insurance premium. Selecting a device does not confirm insurer acceptance.','');
  for(const policy of option.policies)for(const task of policy.protectionTasks||[])lines.push(`${PROTECTIONS[task.id]} — ${policy.carrier} ${policy.product}: ${DEVICE_TASK_KINDS[task.kind]}.`,task.instruction,task.dueDate?`Documented due date: ${task.dueDate}.`:'',task.recommendation?`My recommendation: ${task.recommendation.title}\nOfficial provider link: ${task.recommendation.url}`:'',task.recommendation?.monitoringUrl?`Professional monitoring: ${task.recommendation.monitoringUrl}`:'',task.id==='gas'?CONTRACTOR_LINKS.map(l=>`${l.label}: ${l.url}`).join('\n'):'','Equipment, installation and monitoring costs are separate from your insurance premium. Insurer acceptance remains to be confirmed.','');
  if(view.nextAction==='item') lines.push(`To continue, please provide: ${view.missingItem}. Reply or call me so we can arrange the appropriate way to provide it.`);
  else if(view.nextAction==='appointment') lines.push('We can go through the remaining details at our scheduled call. You can also reply or call me if you are ready sooner.');
  else lines.push('Ready to move forward? Reply to this email or call me.');
  lines.push('',`What happens next: ${view.nextSteps}`);
  if(view.checklist.length) lines.push('',`Please have ready: ${view.checklist.join('; ')}.`);
  if(url) lines.push('',`Your optional CoverageFit review: ${url}`);
  if(view.documents.length) lines.push('','The official quote documents are attached.');
  lines.push('','Coverage begins when I confirm it has been bound.','',producer.name,producer.agency,producer.phone,producer.email,producer.license);
  const body=lines.join('\n');
  return {subject:`Your insurance recommendation | ${producer.firstName}`,text:body,html:`<div style="font:16px/1.55 Arial,sans-serif;color:#19344b">${lines.map(line=>line?`<div>${escapeHtml(line)}</div>`:'<br>').join('')}</div>`};
}
