(function(){
  'use strict';

  function ready(fn){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true});
    else fn();
  }

  function readReport(){
    try{return JSON.parse(localStorage.getItem('coveragefit_home_report')||'{}')}catch(e){return {}}
  }

  function normalizeTrigger(value){
    const raw=String(value||'').trim().toLowerCase();
    if(!raw) return 'default';
    if(/non[- ]?renew|cancel|dropped|declin/.test(raw)) return 'non-renewal';
    if(/premium|rate|price.*increase|increase.*price/.test(raw)) return 'premium-increase';
    if(/renew/.test(raw)) return 'renewal';
    if(/homebuyer|home purchase|buying|purchase|new home/.test(raw)) return 'homebuyer';
    return 'default';
  }

  function getTrigger(report){
    return normalizeTrigger(
      report?.reviewContext ||
      report?.reviewReason ||
      report?.consumer?.reviewContext ||
      report?.consumer?.reviewReason ||
      sessionStorage.getItem('coveragefit_trigger')
    );
  }

  const copy={
    homebuyer:{
      eyebrow:'Home Purchase Review',
      title:'Your new-home Protection Snapshot is ready.',
      intro:'Because you are buying a home, this Snapshot emphasizes the protection questions most worth confirming before your policy is finalized.'
    },
    renewal:{
      eyebrow:'Annual Protection Review',
      title:'Your annual Protection Snapshot is ready.',
      intro:'This Snapshot highlights the questions most worth confirming before your next policy term begins.'
    },
    'non-renewal':{
      eyebrow:'Non-Renewal Review',
      title:'Your Protection Snapshot is ready.',
      intro:'This Snapshot organizes the protection details worth confirming while you prepare for a new policy conversation.'
    },
    'premium-increase':{
      eyebrow:'Premium Increase Review',
      title:'Review your protection before making changes based on price alone.',
      intro:'This Snapshot focuses the conversation on the coverage details worth understanding before you compare options.'
    },
    default:{
      eyebrow:'Protection Review',
      title:'Your Home Protection Snapshot is ready.',
      intro:'Your answers identified the strengths and discussion priorities most worth reviewing with a licensed professional.'
    }
  };

  function setText(selector,value){
    document.querySelectorAll(selector).forEach(el=>{el.textContent=value;});
  }

  function timeline(){
    if(window.JourneyTimeline&&typeof window.JourneyTimeline.setStep==='function') window.JourneyTimeline.setStep(2);
  }

  function personalize(report){
    const trigger=getTrigger(report);
    const content=copy[trigger]||copy.default;
    setText('[data-prospect-eyebrow]',content.eyebrow);
    setText('[data-prospect-title]',content.title);
    setText('[data-prospect-intro]',content.intro);
    document.documentElement.dataset.reportContext=trigger;
    document.title=`${content.eyebrow} | CoverageFit`;

    const hero=document.getElementById('homeReportHero');
    if(hero&&window.CoverageFitTriggerVisuals?.data){
      const visual=window.CoverageFitTriggerVisuals.data;
      if(visual.src) hero.src=visual.src;
      hero.alt=visual.alt||'';
    }
  }

  function reveal(){
    const pages=[...document.querySelectorAll('.prospect-report-page')];
    pages.forEach((page,index)=>{
      page.classList.add('cf-reveal-section');
      page.style.setProperty('--cf-reveal-delay',`${Math.min(index*120,240)}ms`);
    });
    requestAnimationFrame(()=>document.documentElement.classList.add('cf-snapshot-reveal-active'));
  }

  ready(async()=>{
    const access=await(window.COVERAGEFIT_PROSPECT_REPORT_READY||Promise.resolve({ok:true,report:readReport()}));
    if(access&&!access.ok)return;
    timeline();
    personalize(access?.report||readReport());
    reveal();
  });
})();
