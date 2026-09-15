(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));
  function read(){try{return JSON.parse(localStorage.getItem('coveragefit_home_report')||'{}')}catch(e){return {}}}
  function band(score){return window.CoverageFitProtectionScore?.bandFor?.(score)?.label||'Review Recommended'}

  async function render(){
    const access=await(window.COVERAGEFIT_PROSPECT_REPORT_READY||Promise.resolve({ok:true}));
    if(access&&!access.ok)return;
    const root=document.querySelector('[data-cf-interactive-snapshot]');
    if(!root)return;
    const data=access?.report||read();
    const score=clamp(data.score);
    const categories=Array.isArray(data.categories)&&data.categories.length
      ? data.categories.slice(0,6)
      : [{name:'Overall review',score}];

    root.innerHTML=`
      <div class="prospect-overview__heading">
        <span>Review readiness</span>
        <h2>A supporting diagnostic—not the headline.</h2>
        <p>This score summarizes how clearly the review answered key protection questions. Your priorities and situation above remain the context for the conversation.</p>
      </div>
      <div class="prospect-overview__grid">
        <section class="prospect-score" aria-label="Protection Review Readiness Score ${score} out of 100">
          <div class="prospect-score__ring" style="--cf-score:${score}"><div><strong>${score}</strong><span>/ 100</span></div></div>
          <div class="prospect-score__copy">
            <span>Review Readiness Score</span>
            <h3>${esc(data.status||data.rating||band(score))}</h3>
            <p>This response-based score measures review readiness and clarity. It does not determine whether a policy is adequate.</p>
          </div>
        </section>
        <section class="prospect-categories" aria-labelledby="prospect-category-title">
          <h3 id="prospect-category-title">Category breakdown</h3>
          <div class="prospect-category-list">${categories.map(category=>{
            const categoryScore=clamp(category.score);
            return `<div class="prospect-category"><span><b>${esc(category.name||category.label||'Review category')}</b><em>${categoryScore}%</em></span><i aria-hidden="true"><u style="width:${categoryScore}%"></u></i></div>`;
          }).join('')}</div>
        </section>
      </div>`;

    requestAnimationFrame(()=>root.classList.add('is-ready'));
    window.CoverageFitAnalytics?.track('interactive_snapshot_viewed',{assessment:'home',score,categoryCount:categories.length});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
  else render();
})();
