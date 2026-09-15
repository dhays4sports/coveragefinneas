(()=>{
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait=ms=>new Promise(r=>setTimeout(r,reduceMotion?0:ms));
  const $=id=>document.getElementById(id);

  function ensureLiveRegion(){
    if(document.getElementById('cfLiveRegion')) return;
    const live=document.createElement('div');
    live.id='cfLiveRegion';live.className='sr-only';live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
    document.body.appendChild(live);
  }
  const announce=msg=>{ensureLiveRegion();const live=$('cfLiveRegion');live.textContent='';requestAnimationFrame(()=>live.textContent=msg)};

  function buildOverlay(){
    if($('snapshotLoading')) return $('snapshotLoading');
    const overlay=document.createElement('div');
    overlay.id='snapshotLoading';overlay.className='snapshot-loading';overlay.hidden=true;
    overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.setAttribute('aria-modal','true');
    overlay.innerHTML=`<div class="snapshot-loading-card"><img src="/assets/images/coveragefit-mark.svg" alt="" width="54" height="54"><span class="loading-eyebrow">CoverageFit Business</span><h2 id="loadingTitle">Building your Business Protection Snapshot</h2><p id="loadingMessage">Analyzing your business profile…</p><div class="loading-track" aria-hidden="true"><span id="loadingBar"></span></div><div class="loading-steps" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>`;
    document.body.appendChild(overlay);return overlay;
  }

  async function runLoading(messages,finalMode=false){
    const overlay=buildOverlay(),message=$('loadingMessage'),bar=$('loadingBar'),title=$('loadingTitle');
    overlay.hidden=false;document.body.classList.add('is-loading-snapshot');
    title.textContent=finalMode?'Finalizing your Business Protection Snapshot':'Building your Business Protection Snapshot';
    overlay.querySelectorAll('.loading-steps i').forEach(x=>x.classList.remove('is-complete'));
    for(let i=0;i<messages.length;i++){
      message.textContent=messages[i];announce(messages[i]);bar.style.width=`${Math.round(((i+1)/messages.length)*100)}%`;
      overlay.querySelectorAll('.loading-steps i')[i]?.classList.add('is-complete');
      await wait(finalMode?380:430);
    }
    return overlay;
  }

  function enhanceAssessment(){
    const result=$('result'),form=$('captureForm');if(!result||!form)return;
    result.setAttribute('aria-labelledby','resultTitle');
    const submit=form.querySelector('button[type="submit"]');
    if(submit){submit.id='captureSubmit';submit.setAttribute('aria-describedby','contactConsent');}
    const consent=form.querySelector('p:last-child');if(consent)consent.id='contactConsent';
    form.querySelectorAll('input,select,button').forEach(el=>el.classList.add('focusable-control'));

    let firstReveal=true;
    const observer=new MutationObserver(async()=>{
      if(result.style.display==='block'&&firstReveal){
        firstReveal=false;result.style.visibility='hidden';result.setAttribute('aria-busy','true');
        const overlay=await runLoading(['Analyzing your business profile…','Reviewing operations and current coverage…','Building personalized recommendations…','Finalizing your Protection Snapshot…']);
        overlay.classList.add('is-leaving');await wait(220);overlay.hidden=true;overlay.classList.remove('is-leaving');document.body.classList.remove('is-loading-snapshot');
        result.style.visibility='visible';result.removeAttribute('aria-busy');result.classList.add('production-reveal');$('resultTitle')?.focus?.();announce('Your Business Protection Snapshot is ready for contact review.');
      }
      if(result.style.display==='none')firstReveal=true;
    });
    observer.observe(result,{attributes:true,attributeFilter:['style']});

    form.addEventListener('submit',async()=>{
      submit?.setAttribute('aria-busy','true');if(submit){submit.disabled=true;submit.textContent='Generating Your Snapshot…'}
      await runLoading(['Saving your review details…','Preparing your personalized report…','Securing your Business Protection Snapshot…','Opening your completed report…'],true);
    },true);
  }

  function enhanceReport(){
    if(!document.body.classList.contains('business-report-v28'))return;
    document.body.classList.add('business-report-v29');
    const main=document.querySelector('.business-report');if(main){main.setAttribute('tabindex','-1');}
    const sections=[...document.querySelectorAll('.business-report-section,.score-panel-premium')];
    sections.forEach((section,i)=>{section.classList.add('report-motion-card');section.style.setProperty('--motion-order',i)});
    const score=$('score');if(score){
      const target=Number(score.textContent)||0;score.textContent='0';
      if(reduceMotion)score.textContent=target;else{
        const start=performance.now(),duration=850;
        const tick=now=>{const pct=Math.min(1,(now-start)/duration);score.textContent=Math.round(target*(1-Math.pow(1-pct,3)));if(pct<1)requestAnimationFrame(tick)};requestAnimationFrame(tick);
      }
    }
    document.querySelectorAll('.recommendation-card').forEach((card,i)=>{card.style.setProperty('--card-order',i);card.classList.add('recommendation-motion')});
    document.querySelectorAll('.report-empty').forEach(empty=>{
      empty.setAttribute('role','note');
      empty.innerHTML=`<span class="empty-state-icon" aria-hidden="true">i</span><div><strong>More detail may be needed</strong><p>${empty.textContent.trim()}</p></div>`;
    });
    const details=document.querySelector('.methodology details');
    if(details){details.addEventListener('toggle',()=>announce(details.open?'Scoring details expanded.':'Scoring details collapsed.'));}
    const print=$('printReport');if(print)print.setAttribute('aria-label','Open the print dialog to save or print this Business Protection Snapshot');
  }

  document.addEventListener('DOMContentLoaded',()=>{ensureLiveRegion();enhanceAssessment();setTimeout(enhanceReport,120);});
})();
