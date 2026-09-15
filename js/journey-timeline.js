(function(){
  'use strict';

  const journeys={
    home:{
      labels:['Understand Your Home','Protection Snapshot','Review Together'],
      reportSteps:[
        {title:'Assessment completed',copy:'Your answers have been organized into a Protection Snapshot.'},
        {title:'Review the Snapshot',copy:'Use the priorities and questions in this report as your discussion agenda.'},
        {title:'Confirm policy details',copy:'Compare the Snapshot with the issued policy, limits, deductibles, endorsements, and exclusions.'},
        {title:'Decide what deserves action',copy:'Determine whether anything should change now or at the next renewal.'},
        {title:'Review again annually',copy:'Revisit protection after major household, property, or financial changes.'}
      ]
    },
    business:{
      labels:['Business Profile','Industry Review','Current Coverage','Snapshot','Contact Review'],
      reportSteps:[
        {title:'Business profile completed',copy:'Your industry, size, employees, revenue, and location details established the review path.'},
        {title:'Operations reviewed',copy:'Industry-specific activities and special exposures were organized for discussion.'},
        {title:'Current coverage organized',copy:'Known policies, carrier details, claims, vehicles, contracts, and renewal timing were summarized.'},
        {title:'Complete a licensed review',copy:'Confirm the report against actual policies, endorsements, exclusions, and current operations.'},
        {title:'Create a renewal plan',copy:'Prioritize changes, gather missing information, and schedule the next review before renewal.'}
      ]
    }
  };

  const triggerLabels={
    homebuyer:'Home Purchase Review',
    renewal:'Annual Protection Review',
    'premium-increase':'Premium Increase Review'
  };

  function product(){
    const bodyProduct=document.body?.dataset.journeyProduct || document.body?.dataset.reportType;
    if(bodyProduct && journeys[bodyProduct]) return bodyProduct;
    const params=new URLSearchParams(location.search);
    const queryProduct=params.get('product');
    if(queryProduct && journeys[queryProduct]) return queryProduct;
    const path=location.pathname;
    if(path.includes('/business/')) return 'business';
    try{
      const last=localStorage.getItem('coveragefit_last_product');
      if(last && journeys[last]) return last;
    }catch(e){}
    return 'home';
  }

  function getTrigger(){
    let stored='';
    try{ stored=localStorage.getItem('trigger')||''; }catch(e){}
    const value=new URLSearchParams(location.search).get('trigger') || stored;
    return Object.prototype.hasOwnProperty.call(triggerLabels,value) ? value : '';
  }

  function inferStep(type){
    const explicit=document.body?.dataset.journeyStep;
    if(explicit){
      const parsed=Number(explicit);
      if(parsed>=1 && parsed<=journeys[type].labels.length) return parsed;
    }
    const path=location.pathname.replace(/\/+$/,'') || '/';
    if(type==='business'){
      if(path.includes('/business/profile')) return 1;
      if(path.includes('/business/assessment')) return 2;
      if(path.includes('/business/report')) return 4;
      if(path.includes('/book')) return 5;
      return 1;
    }
    if(path.includes('/book')) return 3;
    if(path.includes('/report')) return 2;
    return 1;
  }

  function stateFor(index,current){
    if(index<current) return 'complete';
    if(index===current) return 'current';
    return 'upcoming';
  }

  function createStep(label,index,current){
    const state=stateFor(index,current);
    const item=document.createElement('div');
    item.className='cf-journey-step is-'+state;
    item.setAttribute('role','listitem');
    if(state==='current') item.setAttribute('aria-current','step');
    item.setAttribute('aria-label',`${label}: ${state}`);
    const dot=document.createElement('span');
    dot.className='cf-journey-dot';
    dot.setAttribute('aria-hidden','true');
    dot.textContent=state==='complete'?'✓':String(index);
    const text=document.createElement('span');
    text.className='cf-journey-label';
    text.textContent=label;
    const sub=document.createElement('span');
    sub.className='cf-journey-state';
    sub.textContent=state==='complete'?'Complete':state==='current'?'Current':'Next';
    item.append(dot,text,sub);
    return item;
  }

  function renderTopJourney(){
    // Business profile and assessment already include a live five-stage component.
    if(document.querySelector('.business-journey') || document.querySelector('.cf-journey-wrap')) return;
    const type=product();
    const labels=journeys[type].labels;
    const current=inferStep(type);
    const trigger=getTrigger();
    const wrap=document.createElement('div');
    wrap.className=`cf-journey-wrap cf-journey-${type}`;
    const nav=document.createElement('nav');
    nav.className='cf-journey';
    nav.setAttribute('aria-label',`${type==='business'?'Business':'Home'} CoverageFit journey`);
    if(trigger && type==='home'){
      const context=document.createElement('div');
      context.className='cf-journey-context';
      context.textContent=triggerLabels[trigger];
      nav.appendChild(context);
    }else nav.classList.add('cf-journey-compact');
    const track=document.createElement('div');
    track.className='cf-journey-track';
    track.style.setProperty('--journey-count',String(labels.length));
    track.setAttribute('role','list');
    labels.forEach((label,i)=>{
      const index=i+1;
      track.appendChild(createStep(label,index,current));
      if(index<labels.length){
        const line=document.createElement('div');
        line.className='cf-journey-line'+(index<current?' is-complete':'');
        line.setAttribute('aria-hidden','true');
        track.appendChild(line);
      }
    });
    nav.appendChild(track); wrap.appendChild(nav);
    const header=document.querySelector('header');
    if(header?.parentNode) header.insertAdjacentElement('afterend',wrap);
    else document.body.insertAdjacentElement('afterbegin',wrap);
  }

  function renderActionPlan(){
    const type=product();
    document.querySelectorAll('[data-cf-action-timeline]').forEach(container=>{
      if(container.dataset.timelineReady==='true') return;
      container.dataset.timelineReady='true';
      const list=document.createElement('ol');
      list.className='cf-action-timeline';
      list.setAttribute('aria-label','What happens next');
      journeys[type].reportSteps.forEach((step,index)=>{
        const item=document.createElement('li');
        const state=index<3?'complete':index===3?'current':'upcoming';
        item.className=`cf-action-step is-${state}`;
        if(state==='current') item.setAttribute('aria-current','step');
        item.innerHTML=`<span class="cf-action-marker" aria-hidden="true">${state==='complete'?'✓':index+1}</span><div><span class="cf-action-state">${state==='complete'?'Completed':state==='current'?'Next':'Later'}</span><h3>${step.title}</h3><p>${step.copy}</p></div>`;
        list.appendChild(item);
      });
      container.appendChild(list);
    });
  }

  function render(){ renderTopJourney(); renderActionPlan(); }
  window.CoverageFitJourney={render,renderTopJourney,renderActionPlan,journeys,product};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',render);
  else render();
})();
