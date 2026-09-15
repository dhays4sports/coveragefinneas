(function(root){
  'use strict';
  const token=()=>new URLSearchParams(root.location.search).get('token')||'';
  const request=async(endpoint,payload)=>{const response=await root.fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error?.message||'This secure update is unavailable.');return body;};

  function installReentry(){
    const form=document.getElementById('pvxReentryForm');if(!form)return;
    form.addEventListener('submit',async event=>{
      event.preventDefault();const data=new FormData(form),reasonKey=String(data.get('reasonKey')||''),exactWords=String(data.get('exactWords')||''),status=document.getElementById('pvxReentryStatus');
      if(!reasonKey){status.textContent='Choose why you are returning.';return;}
      status.textContent='Saving your update…';
      try{
        const body=await request('/api/pvx/reentry',{token:token(),reasonKey,exactWords}),result=document.getElementById('pvxReentryResult');
        document.getElementById('pvxReentryDelta').textContent=body.delta?.explanation||'Your saved CoverageFit result has not changed. Your reason for returning is recorded separately.';
        document.getElementById('pvxReentryRefresh').hidden=!body.plan.readinessRefreshAvailable;
        document.getElementById('pvxReentryScope').hidden=!body.plan.changeScopeRelevant;
        document.getElementById('pvxReentryContinue').href=body.plan.route;
        document.getElementById('pvxReentryProgress').href=`/pvx/progress/?token=${encodeURIComponent(token())}`;
        result.hidden=false;status.textContent=body.created?'Your return reason is saved.':'That update was already recorded, so no duplicate was created.';
      }catch(error){status.textContent=error.message;}
    });
  }

  function installLifeEvent(){
    const form=document.getElementById('pvxLifeEventForm');if(!form)return;
    form.addEventListener('submit',async event=>{
      event.preventDefault();const data=new FormData(form),eventKey=String(data.get('eventKey')||''),exactWords=String(data.get('exactWords')||''),status=document.getElementById('pvxLifeEventStatus');
      if(!eventKey){status.textContent='Choose what changed.';return;}
      status.textContent='Saving your update…';
      try{const body=await request('/api/pvx/life-event',{token:token(),eventKey,exactWords});root.location.assign(body.plan.route);}catch(error){status.textContent=error.message;}
    });
  }

  root.addEventListener('DOMContentLoaded',()=>{installReentry();installLifeEvent();},{once:true});
})(window);
