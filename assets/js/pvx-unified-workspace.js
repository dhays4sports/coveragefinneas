(function(root){
  'use strict';
  const BUILD='CF-APPOINTMENT-FIRST-INBOX-1.0';
  const TOKEN_KEY='coveragefit.producerInbox.token';
  const ENDPOINT='/api/pvx/producer-records';
  const PACIFIC='America/Los_Angeles';
  let activeFilter='all';
  let cachedRecords=[];

  const text=(value,fallback='')=>String(value??'').trim()||fallback;
  const digits=value=>text(value).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'').slice(-10);
  const titleCase=value=>text(value).replace(/[_-]+/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
  const displayPhone=value=>{const phone=digits(value);return phone.length===10?`(${phone.slice(0,3)}) ${phone.slice(3,6)}-${phone.slice(6)}`:text(value,'Not provided');};
  const displayTime=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'Time unavailable':new Intl.DateTimeFormat('en-US',{timeZone:PACIFIC,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);};
  const dayKey=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('en-CA',{timeZone:PACIFIC,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);};
  const reviewLabel=value=>({home:'Home',auto:'Auto',bundle:'Home + auto',buyer:'Homebuyer',renter:'Renters',life:'Life',business:'Business',general:'General insurance review',technology:'Technology professional'})[text(value).toLowerCase()]||titleCase(value);
  const housingLabel=value=>({homeowner:'Homeowner',renter:'Renter',buyer:'Homebuyer',not_applicable:''})[text(value).toLowerCase()]||titleCase(value);
  const stageLabel=(value,lead={})=>lead.appointment?.status==='scheduled'?'Appointment booked':({started:'Needs scheduling',appointment_requested:'Needs scheduling',appointment_booked:'Appointment booked',snapshot_completed:'Snapshot completed',contact_requested:'Contact requested',home_profile_ready:'Home Profile ready',policy_review_ready:'Policy review ready'})[text(value).toLowerCase()]||titleCase(value||'New inquiry');

  function earlyLead(record={}){
    if(record.earlyLead?.checkpointId)return record.earlyLead;
    const identity=record.fallbackIdentity||{};
    if(!record.checkpointId||(!identity.firstName&&!identity.mobile))return null;
    return{
      checkpointId:record.checkpointId,firstName:identity.firstName,lastName:identity.lastName,mobile:identity.mobile,email:identity.email,
      sourceLabel:record.attribution?.sourceLabel,professionalRoleLabel:'',housing:'',reviewTrack:record.productTrack,reviewReason:record.shoppingMotivation,
      reviewContext:'',propertyZip:'',closingDate:'',autoNeed:'',lifeGoal:'',businessType:'',businessNeed:'',sourceType:'',
      appointment:null,stage:record.currentStage,receivedAt:record.updatedAt,
      callPermitted:record.consent?.agencyContact?.callPermitted===true,personalTextPermitted:record.consent?.agencyContact?.personalTextPermitted===true,emailPermitted:record.consent?.agencyContact?.emailPermitted===true
    };
  }

  function appointmentState(lead={},now=new Date()){
    if(lead.appointment?.status!=='scheduled')return'needs_scheduling';
    if(dayKey(lead.appointment.start)===dayKey(now))return'today';
    return'scheduled';
  }

  function sortLeads(leads=[],now=new Date()){
    const timestamp=lead=>Date.parse(lead.appointment?.start||'');
    const rank=lead=>{const state=appointmentState(lead,now),start=timestamp(lead);if(state==='today')return 0;if(state==='scheduled'&&Number.isFinite(start)&&start>=now.getTime())return 1;if(state==='needs_scheduling')return 2;return 3;};
    return [...leads].sort((a,b)=>rank(a)-rank(b)||(rank(a)<=1?(timestamp(a)||Infinity)-(timestamp(b)||Infinity):Date.parse(b.updatedAt||b.receivedAt||'')-Date.parse(a.updatedAt||a.receivedAt||'')));
  }

  function element(name,className,textContent){const node=document.createElement(name);if(className)node.className=className;if(textContent!=null)node.textContent=textContent;return node;}
  function actionLink(label,href,primary=false){const link=element('a',`button button--compact cf-button ${primary?'button--primary cf-button--primary':'button--secondary cf-button--secondary'}`,label);link.href=href;return link;}
  function detailRow(label,value){if(!text(value))return null;const row=element('div','early-lead-detail');row.append(element('dt','',label),element('dd','',value));return row;}
  function detailRows(lead){return[
    detailRow('Source',lead.sourceLabel),detailRow('Review',reviewLabel(lead.reviewTrack)),detailRow('Housing',housingLabel(lead.housing)),
    detailRow('Professional role',lead.professionalRoleLabel),detailRow('Reason',titleCase(lead.reviewReason)),detailRow('Additional context',titleCase(lead.reviewContext)),
    detailRow('Property ZIP',lead.propertyZip),detailRow('Closing timeframe',titleCase(lead.closingDate)),detailRow('Auto request',titleCase(lead.autoNeed)),
    detailRow('Life goal',titleCase(lead.lifeGoal)),detailRow('Business type',lead.businessType),detailRow('Business request',titleCase(lead.businessNeed)),
    detailRow('Received',displayTime(lead.receivedAt||lead.updatedAt))
  ].filter(Boolean);}

  function leadCard(record){
    const lead=earlyLead(record)||{},phone=digits(lead.mobile),state=appointmentState(lead);
    const name=[lead.firstName,lead.lastName].map(value=>text(value)).filter(Boolean).join(' ')||`SMS lead · ${displayPhone(lead.mobile)}`;
    const article=element('article',`early-lead-card early-lead-card--${state}`);article.dataset.checkpointId=text(lead.checkpointId);article.dataset.appointmentState=state;
    const copy=element('div','early-lead-card__copy'),top=element('div','early-lead-card__top');top.append(element('h3','',name),element('span','early-lead-card__stage',stageLabel(lead.stage,lead)));copy.append(top);
    if(lead.firstName)copy.append(element('p','early-lead-card__phone',displayPhone(lead.mobile)));
    const facts=[];if(lead.professionalRoleLabel)facts.push(text(lead.professionalRoleLabel));if(lead.housing&&housingLabel(lead.housing))facts.push(housingLabel(lead.housing));if(lead.reviewTrack)facts.push(reviewLabel(lead.reviewTrack));if(lead.propertyZip)facts.push(`ZIP ${text(lead.propertyZip)}`);
    copy.append(element('p','early-lead-card__source',text(lead.sourceLabel,'408FARMERS inquiry')),element('p','early-lead-card__facts',facts.join(' · ')||'Insurance review'));
    if(lead.reviewReason)copy.append(element('p','early-lead-card__facts',`Reason: ${titleCase(lead.reviewReason)}`));
    if(lead.appointment?.status==='scheduled')copy.append(element('p','early-lead-card__appointment',`Appointment: ${text(lead.appointment.display,'Scheduled')}`));else copy.append(element('p','early-lead-card__unscheduled','Callback time not selected yet'));
    const details=element('details','early-lead-card__details'),summary=element('summary','','Open lead details'),list=element('dl','early-lead-card__detail-list');detailRows(lead).forEach(row=>list.append(row));details.append(summary,list);copy.append(details);
    const actions=element('div','early-lead-card__actions');
    if(lead.checkpointId)actions.append(actionLink('Prepare recommendation',`/agent/recommendations/?context=lead&context_id=${encodeURIComponent(lead.checkpointId)}`));
    if(phone&&(lead.callPermitted!==false||lead.appointment?.status==='scheduled'))actions.append(actionLink('Call',`tel:+1${phone}`,true));
    if(phone&&lead.personalTextPermitted!==false){const message=`Hi ${text(lead.firstName,'there')}, this is Dylan with the Virginia Tam Insurance Agency following up on your 408FARMERS request.`;actions.append(actionLink('Text',`sms:+1${phone}?body=${encodeURIComponent(message)}`));}
    if(lead.email&&lead.emailPermitted)actions.append(actionLink('Email',`mailto:${encodeURIComponent(lead.email)}`));article.append(copy,actions);return article;
  }

  function filterLeads(leads,filter,now=new Date()){if(filter==='all')return leads;return leads.filter(lead=>appointmentState(lead,now)===filter||(filter==='scheduled'&&appointmentState(lead,now)==='today'));}
  function updateFilterControls(leads,now=new Date()){
    const counts={all:leads.length,needs_scheduling:0,scheduled:0,today:0};leads.forEach(lead=>{const state=appointmentState(lead,now);counts[state]+=1;if(state==='today')counts.scheduled+=1;});
    document.querySelectorAll?.('[data-early-lead-filter]').forEach(button=>{const key=button.dataset.earlyLeadFilter;button.setAttribute('aria-pressed',String(key===activeFilter));const count=button.querySelector('[data-filter-count]');if(count)count.textContent=String(counts[key]||0);});
  }
  function render(records=[]){
    const region=document.getElementById('pvxEarlyLeadInbox'),status=document.getElementById('pvxEarlyLeadStatus'),cards=document.getElementById('pvxEarlyLeadCards'),count=document.getElementById('pvxEarlyLeadCount');if(!region||!status||!cards||!count)return 0;
    cachedRecords=Array.isArray(records)?records:[];const all=sortLeads(cachedRecords.map(earlyLead).filter(lead=>lead&&digits(lead.mobile).length===10));const visible=filterLeads(all,activeFilter).slice(0,50);cards.replaceChildren(...visible.map(lead=>leadCard({earlyLead:lead})));
    count.textContent=String(all.length);updateFilterControls(all);status.textContent=all.length?`${visible.length} of ${all.length} appointment-first inquir${all.length===1?'y':'ies'} shown.`:'No appointment-first inquiries are currently stored.';region.dataset.state=all.length?'ready':'empty';return visible.length;
  }
  function setFilter(value){if(!['all','needs_scheduling','scheduled','today'].includes(value))return false;activeFilter=value;render(cachedRecords);return true;}
  async function load(){
    const region=document.getElementById('pvxEarlyLeadInbox'),status=document.getElementById('pvxEarlyLeadStatus');if(!region||!status)return null;const token=root.sessionStorage?.getItem?.(TOKEN_KEY)||'';
    if(token.length<24){status.textContent='Connect the secure producer inbox to load appointment-first inquiries.';region.dataset.state='idle';return null;}
    status.textContent='Loading appointment-first inquiries…';region.dataset.state='loading';
    try{const response=await root.fetch(ENDPOINT,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store',credentials:'same-origin'});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error?.message||'Appointment-first inquiries are unavailable.');render(body?.records||[]);return body;}catch(error){status.textContent=error.message;region.dataset.state='error';return null;}
  }
  root.addEventListener('DOMContentLoaded',load,{once:true});root.addEventListener('coveragefit:producer-inbox-synced',load);root.addEventListener('coveragefit:remote-inbox-connected',load);
  root.addEventListener('click',event=>{const button=event.target.closest?.('[data-early-lead-filter]');if(button)setFilter(button.dataset.earlyLeadFilter);});
  root.CoverageFitEarlyLeadInbox=Object.freeze({BUILD,ENDPOINT,earlyLead,render,load,displayPhone,stageLabel,appointmentState,sortLeads,filterLeads,setFilter});
})(window);
