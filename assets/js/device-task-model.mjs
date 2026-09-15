export const DEVICE_TASK_KINDS = {
  confirmation: 'Requirement or timing needs confirmation',
  'before-binding': 'Producer-stated condition before binding',
  'after-binding': 'Producer-stated condition after binding',
  discount: 'Possible discount — eligibility unconfirmed',
  recommended: 'Optional protection recommendation'
};
export const DEVICE_STATES = {
  considering: 'Considering a device',
  'existing-system': 'Existing system reported — review needed',
  'installation-help': 'Installation help requested',
  'agent-help': 'Agent confirmation requested',
  'installed-self-reported': 'Installed — customer-reported'
};
const clean=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f<>]/g,' ').trim().slice(0,max);
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function normalizeDeviceTask(value) {
  if(!value || value.enabled!==true)return null;
  return {enabled:true,capability:'automatic-water-shutoff',jurisdiction:'CA',kind:Object.hasOwn(DEVICE_TASK_KINDS,value.kind)?value.kind:'confirmation',sourceNote:clean(value.sourceNote,700),instruction:clean(value.instruction,400),dueDate:validDate(value.dueDate)?value.dueDate:'',confirmed:value.confirmed===true};
}
export function deviceTaskIssues(task) {
  if(!task)return [];
  const issues=[];
  if(!task.confirmed)issues.push('Confirm the device task, its classification and timing before preparing the review.');
  if(!task.instruction)issues.push('Explain the customer’s device-related next step.');
  if(['before-binding','after-binding'].includes(task.kind)&&!task.sourceNote)issues.push('Record the case-specific source for the producer-stated device condition.');
  if(task.kind==='after-binding'&&!task.dueDate)issues.push('Confirm the documented post-binding due date, or use “timing needs confirmation.”');
  if(['discount','recommended','confirmation'].includes(task.kind)&&task.dueDate)issues.push('Do not attach a binding deadline to optional or unconfirmed device guidance.');
  return issues;
}
export function publicDeviceTask(task) {
  const normalized=normalizeDeviceTask(task);
  if(!normalized)return null;
  const {sourceNote,confirmed,...safe}=normalized;
  return {...safe,assertionSource:'professional-stated-unverified'};
}
