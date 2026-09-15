export const BUILD='CF-SOLO-OPS-1.0';
export const WORK_TYPES={outreach:'Outreach',quoting_service:'Quoting / Service',advice_closing:'Advice / Closing'};
export const STAGES={inquiry:'Inquiry',discovery:'Discovery',quote_preparation:'Quote preparation',recommendation:'Recommendation',decision:'Decision',onboarding:'Issuance / Onboarding'};
export const SOURCES=['Phone inquiry','Realtor / lender referral','Apex transfer','Door-drop flyer','Parking-lot flyer','Filtered lead','Social media','Google search','Teacher appreciation','Healthcare appreciation','Existing client / referral','Other'];
export const CALL_OUTCOMES={conversation:'Conversation completed',no_answer:'No answer',voicemail:'Voicemail left',incoming_reply:'Client replied',work_completed:'Work completed',other:'Other update'};
export const EFFORT_CATEGORIES={outreach:'Outreach / contact',discovery:'Discovery',quote_preparation:'Quote preparation',recommendation:'Recommendation preparation / delivery',closing:'Closing / decision',other_sales:'Other sales work'};
export const CLOSE_REASONS={completed:'Work finished',declined:'Client declined',elsewhere:'Client chose another agency',unsuitable:'Unable to help',duplicate:'Duplicate record'};
export const clean=(value,max=240)=>typeof value==='string'?value.trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
export function fail(status,code,message){throw Object.assign(new Error(message),{status,code});}
export function validId(value){return typeof value==='string'&&/^[A-Za-z0-9_.:@/-]{1,200}$/.test(value);}
export function dueTime(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail(422,'due_at','Choose a valid next-action date and time.');
  if(new Date(value.slice(0,10)).toISOString().slice(0,10)!==value.slice(0,10)||Number(value.slice(11,13))>23)fail(422,'due_at','Choose a valid next-action date and time.');
  return new Date(value).toISOString();
}
export function nextAction(value){
  const title=clean(value?.title,240),workType=value?.workType,state=value?.state||'open',blocker=clean(value?.blocker,500);
  if(!title)fail(422,'next_action','Add the next action.');
  if(!Object.hasOwn(WORK_TYPES,workType))fail(422,'work_type','Choose a work type.');
  if(!['open','in_progress','waiting'].includes(state))fail(422,'task_state','Choose an active task state.');
  if(state==='waiting'&&!blocker)fail(422,'blocker','Record what you are waiting for.');
  return {title,workType,state,blocker:state==='waiting'?blocker:'',dueAt:dueTime(value.dueAt)};
}
export function manualInput(value){
  const contact={name:clean(value.contact?.name,160),email:clean(value.contact?.email,200),mobile:clean(value.contact?.mobile,40),contactBasis:clean(value.contact?.contactBasis,500)};
  if(!contact.name)fail(422,'name','Add a person or household name.');
  if(contact.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))fail(422,'email','Check the email address.');
  const source=clean(value.source,120);if(!source)fail(422,'source','Choose or describe the source.');
  const deadline=clean(value.deadline,10);if(deadline&&(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||new Date(deadline).toISOString().slice(0,10)!==deadline))fail(422,'deadline','Choose a valid deadline.');
  const acquisition=value.acquisition&&typeof value.acquisition==='object'?{sourceFamily:clean(value.acquisition.sourceFamily,60),sourceKey:clean(value.acquisition.sourceKey,120),campaignId:clean(value.acquisition.campaignId,160),campaignVariant:clean(value.acquisition.campaignVariant,120),partnerId:clean(value.acquisition.partnerId,120),batchId:clean(value.acquisition.batchId,120)}:{};
  return {contact,source,reason:clean(value.reason,600),products:clean(value.products,200),deadline,stage:'inquiry',acquisition,next:nextAction(value.next)};
}
export function wrapInput(value){
  const note=clean(value.note,2000),outcome=value.outcome,stage=value.stage,status=value.status||'open',closeReason=value.closeReason||'';
  if(!note)fail(422,'note','Add a short note about what happened.');
  if(!Object.hasOwn(CALL_OUTCOMES,outcome)||!Object.hasOwn(STAGES,stage)||!['open','deferred','closed'].includes(status))fail(422,'wrap','Choose an outcome, stage, and opportunity status.');
  if(status==='closed'&&!Object.hasOwn(CLOSE_REASONS,closeReason))fail(422,'close_reason','Record why the opportunity is closing.');
  if(!Number.isInteger(value.version)||value.version<1)fail(422,'version','Reload the account before saving.');
  const rawMinutes=value.effortMinutes==null||value.effortMinutes===''?null:Number(value.effortMinutes),effortCategory=clean(value.effortCategory,40);
  if(rawMinutes!=null&&(!Number.isInteger(rawMinutes)||rawMinutes<1||rawMinutes>480))fail(422,'effort_minutes','Record actual producer minutes from 1 to 480, or leave the field blank.');
  if(rawMinutes!=null&&!Object.hasOwn(EFFORT_CATEGORIES,effortCategory))fail(422,'effort_category','Choose the kind of sales work completed.');
  return {note,outcome,stage,status,closeReason:status==='closed'?closeReason:'',version:value.version,taskId:clean(value.taskId,200),effort:rawMinutes==null?null:{minutes:rawMinutes,category:effortCategory},next:status==='closed'?null:nextAction(value.next)};
}
export function pacificDay(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;
}
// Native datetime-local inputs are explicitly Pacific, regardless of device timezone.
// Round-tripping rejects nonexistent DST times and requires an explicit choice for ambiguous times.
export function pacificInputToISO(value){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))fail(422,'due_at','Choose a date and time.');
  const matches=['-07:00','-08:00'].map(offset=>new Date(value+offset)).filter(d=>{
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`===value;
  });
  if(matches.length!==1)fail(422,'due_at','This time changes with daylight saving. Choose a time outside 1–3 a.m.');
  return matches[0].toISOString();
}
export function pacificInput(date=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
