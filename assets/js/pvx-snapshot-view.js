(function(root){
  'use strict';
  const D='coveragefit_pvx_discovery_v1',B='coveragefit_pvx_branch_answers_v1',S='coveragefit_pvx_snapshot_v1',W='coveragefit_pvx_web_bridge_v1';
  const read=key=>{for(const storage of[root.localStorage,root.sessionStorage]){try{const value=JSON.parse(storage?.getItem?.(key)||'null');if(value)return value;}catch(_){}}return null;};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function topicHtml(topic,index){const reason=topic.becauseYouToldUs||topic.whyWorthReviewing||'';return `<article class="pvx-progressive-snapshot__topic"><span class="pvx-progressive-snapshot__number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><div><h3>${esc(topic.label)}</h3><p><b>Why this appeared:</b> ${esc(reason)}</p></div></article>`;}
  function install(){
    if(!root.document?.body?.hasAttribute('data-pvx-snapshot'))return;
    const discovery=read(D)||{answers:{},exactCustomerWords:{}},branches=read(B)||{},webBridge=read(W)||{};
    const context={...(webBridge.context||{}),entry:webBridge.entry||{}},isSnapshotEntry=context.entry?.type==='snapshot';
    const topics=root.CoverageFitPVXReviewTopicEngine.derive(discovery,branches),model=root.CoverageFitPVXSnapshotModel.derive(discovery,topics,context),$=id=>document.getElementById(id);
    const count=model.whatDylanWouldLookAtFirst.length;
    try{root.localStorage.setItem(S,JSON.stringify(model));}catch(_){}
    $('pvxSnapshotCountTitle').textContent=count?`${count} ${count===1?'thing':'things'} worth reviewing`:'Your starting point is ready';
    const why=model.whyNowThread?.headline||model.whyReviewing?.label||'';
    if(why){$('pvxSnapshotWhy').textContent=why;$('pvxSnapshotContext').hidden=false;}
    $('pvxSnapshotTopics').innerHTML=model.whatDylanWouldLookAtFirst.map(topicHtml).join('');
    $('pvxSnapshotEmpty').hidden=count>0;
    if(isSnapshotEntry){
      $('pvxSnapshotTitle').setAttribute('aria-label','Your home coverage starting point');
      $('pvxSnapshotSummary').textContent='Built from your quick answers. Add a few current-policy details next to create an evidence-based Review Readiness result.';
      $('pvxContinueWithoutSave').textContent='Add my policy details';
      $('pvxSnapshotActionsTitle').textContent='Make this result more useful';
    }
    try{root.dispatchEvent(new CustomEvent('coveragefit:pvx-snapshot-result-viewed',{detail:{revision:'1',productTrack:model.productTrack,topicCount:count,entryClass:'pvx',renderState:'complete'}}));}catch(_){}
    try{root.dispatchEvent(new CustomEvent('coveragefit:pvx-snapshot-viewed',{detail:{revision:'1',productTrack:model.productTrack,topicCount:count,anonymous:true,contactRequired:false,scoreCreated:false}}));}catch(_){}
  }
  root.addEventListener('DOMContentLoaded',install,{once:true});
})(window);
