(function(){
  const defaults={
    business:{storageKey:'coveragefit_business_report',title:'Business Protection Snapshot',subtitle:'A concise, executive-ready view of preparedness, current protection, and the topics most worth discussing.',preparedLabel:'Prepared for',detailLabel:'Industry'},
    home:{storageKey:'coveragefit_home_report',title:'Home Protection Snapshot',subtitle:'A concise, executive-ready view of your protection priorities and the questions worth confirming.',preparedLabel:'Prepared for',detailLabel:'Property'},
    landlord:{storageKey:'coveragefit_landlord_report',title:'Rental Portfolio Protection Snapshot',subtitle:'A concise, executive-ready view of property, liability, income, and portfolio-level protection topics.',preparedLabel:'Prepared for',detailLabel:'Portfolio'}
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const read=(key)=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch(e){return {}}};
  const derive=(type,data)=>{
    const answers=Array.isArray(data.answers)?data.answers:[];
    const priorities=Array.isArray(data.priorities)&&data.priorities.length?data.priorities:answers.filter(x=>Number(x.points||0)<0).sort((a,b)=>Number(a.points)-Number(b.points));
    const strengths=Array.isArray(data.strengths)&&data.strengths.length?data.strengths:answers.filter(x=>Number(x.points||0)>=0&&!['current_carrier','renewal_date'].includes(x.key));
    const base=100+answers.reduce((n,x)=>n+Math.min(0,Number(x.points||0)),0); const missingReview=type==='business'?(['current_carrier','renewal_date'].filter(k=>!answers.find(x=>x.key===k&&x.value)).length*2):0; const score=Number(data.score??Math.max(0,Math.min(100,base-missingReview)));
    const rating=data.rating||data.status||window.CoverageFitProtectionScore?.bandFor?.(score)?.label||'Review Recommended';
    const consumer=data.consumer||{}; const profile=data.profile||{};
    const name=consumer.businessName||consumer.name||'Customer';
    const detail=type==='business'?(data.industryLabel||profile.industryLabel||profile.industry):type==='home'?(consumer.detail||consumer.property||'Property details not provided'):(consumer.detail||'Portfolio details not provided');
    return {name,detail,score,rating,priority:priorities[0],strength:strengths[0],createdAt:data.createdAt||Date.now()};
  };
  function render(opts={}){
    const type=opts.type||document.body.dataset.reportType||'business';
    const cfg={...(defaults[type]||defaults.business),...(window.COVERAGEFIT_EXECUTIVE_REPORT_CONFIG||{}),...opts};
    const data=opts.data||read(cfg.storageKey); const d=derive(type,data);
    document.querySelectorAll('[data-exec-title]').forEach(el=>el.textContent=cfg.title);
    document.querySelectorAll('[data-exec-subtitle]').forEach(el=>el.textContent=cfg.subtitle);
    document.querySelectorAll('[data-exec-name]').forEach(el=>el.textContent=d.name);
    document.querySelectorAll('[data-exec-detail]').forEach(el=>{const raw=(d.detail||'').toString();const missing=!raw||/not provided|details not provided/i.test(raw);el.textContent=missing?'Property details to be confirmed':raw.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());el.closest('.optional-detail')?.classList.toggle('is-missing',missing);});
    document.querySelectorAll('[data-exec-date]').forEach(el=>el.textContent=new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:'numeric'}).format(new Date(d.createdAt)));
    document.querySelectorAll('[data-exec-score]').forEach(el=>el.textContent=Number.isFinite(d.score)?d.score:'—');
    document.querySelectorAll('[data-exec-rating]').forEach(el=>el.textContent=d.rating);
    const p=d.priority||{}; const s=d.strength||{};
    document.querySelectorAll('[data-exec-priority]').forEach(el=>el.textContent=p.tag||p.title||p.category||'No major priority identified');
    document.querySelectorAll('[data-exec-priority-detail]').forEach(el=>el.textContent=p.insight||p.label||'Use the detailed report to confirm the strongest review topics.');
    document.querySelectorAll('[data-exec-strength]').forEach(el=>el.textContent=s.tag||s.title||'Structured review completed');
    document.querySelectorAll('[data-exec-strength-detail]').forEach(el=>el.textContent=s.insight||s.label||'Your completed assessment provides a clearer starting point for a licensed review.');
    document.title=`${cfg.title} | CoverageFit`;
    const description=`${cfg.title} prepared for ${d.name}. Educational planning report from CoverageFit.`;
    let meta=document.querySelector('meta[name="description"]'); if(meta)meta.setAttribute('content',description);
    window.CoverageFitExecutiveReport={type,cfg,data,derived:d};
  }
  window.CoverageFitExecutiveReportEngine={render,defaults};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>render());else render();
})();
