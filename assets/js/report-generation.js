(function(){
  'use strict';
  const triggerLabels={
    'homebuyer':'Home Purchase Review',
    'renewal':'Annual Protection Review',
    'premium-increase':'Premium Increase Review'
  };
  const messages=[
    '✓ Reviewing your responses…',
    '✓ Looking for meaningful patterns…',
    '✓ Preparing your Protection Snapshot…'
  ];

  function validTrigger(value){return Object.prototype.hasOwnProperty.call(triggerLabels,value)?value:''}
  function currentTrigger(explicit){
    return validTrigger(explicit||new URLSearchParams(location.search).get('trigger')||sessionStorage.getItem('coveragefit_trigger')||'');
  }
  function createOverlay(trigger){
    const overlay=document.createElement('div');
    overlay.className='cf-generation-overlay';
    overlay.setAttribute('role','status');
    overlay.setAttribute('aria-live','polite');
    overlay.setAttribute('aria-label','Building your Protection Snapshot');
    overlay.innerHTML=`
      <div class="cf-generation-card">
        <div class="cf-generation-mark" aria-hidden="true">
          <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 44.5 48 19l31 25.5V76a5 5 0 0 1-5 5H22a5 5 0 0 1-5-5V44.5Z" fill="#fff" stroke="#1474B8" stroke-width="4" stroke-linejoin="round"/>
            <path d="M35 81V58h26v23" stroke="#1474B8" stroke-width="4" stroke-linejoin="round"/>
            <path d="M48 35c9 0 17 6 17 15 0 12-17 20-17 20S31 62 31 50c0-9 8-15 17-15Z" fill="#E9F8F0" stroke="#29A963" stroke-width="3"/>
            <path d="m41.5 50 4.5 4.5 9-10" stroke="#1C7C4B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="cf-generation-eyebrow">CoverageFit Home</span>
        <h1 class="cf-generation-title">Building Your Protection Snapshot</h1>
        <p class="cf-generation-message">${messages[0]}</p>
        <div class="cf-generation-progress" aria-hidden="true"><div class="cf-generation-progress-bar"></div></div>
        <p class="cf-generation-note">This usually takes a few seconds.</p>
        ${trigger?`<div class="cf-generation-context">${triggerLabels[trigger]}</div>`:''}
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(()=>overlay.classList.add('is-visible'));
    return overlay;
  }

  function start(options){
    options=options||{};
    const trigger=currentTrigger(options.trigger);
    const minDuration=Math.max(2400,Number(options.minDuration)||2900);
    const started=Date.now();
    const overlay=createOverlay(trigger);
    const message=overlay.querySelector('.cf-generation-message');
    const bar=overlay.querySelector('.cf-generation-progress-bar');
    let index=0;
    requestAnimationFrame(()=>{bar.style.width='22%'});
    const timer=setInterval(()=>{
      index=Math.min(index+1,messages.length-1);
      message.classList.add('is-changing');
      setTimeout(()=>{
        message.textContent=messages[index];
        message.classList.remove('is-changing');
      },170);
      bar.style.width=index===1?'61%':'88%';
      if(index===messages.length-1)clearInterval(timer);
    },850);

    return {
      async complete(){
        const remaining=Math.max(0,minDuration-(Date.now()-started));
        if(remaining)await new Promise(resolve=>setTimeout(resolve,remaining));
        clearInterval(timer);
        message.classList.add('is-changing');
        await new Promise(resolve=>setTimeout(resolve,150));
        message.textContent='✓ Your Protection Snapshot is ready.';
        message.classList.remove('is-changing');
        bar.style.width='100%';
        await new Promise(resolve=>setTimeout(resolve,420));
      },
      remove(){overlay.remove()}
    };
  }

  window.CoverageFitReportGeneration={start};
})();
