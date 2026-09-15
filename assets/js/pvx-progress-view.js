(function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  async function install(){
    const main=document.getElementById('pvxProgress');if(!main)return;
    const token=new URLSearchParams(root.location.search).get('token')||'',status=document.getElementById('pvxProgressStatus'),updateLink=document.getElementById('pvxUpdateLink');
    if(updateLink&&token)updateLink.href=`/pvx/update/?token=${encodeURIComponent(token)}`;
    try{
      const p=await root.CoverageFitProgressCenter.load(token);
      document.getElementById('pvxBrandLine').textContent=p.brandLine;
      document.getElementById('pvxTopicCount').textContent=p.latestResult.topicCountLabel;
      document.getElementById('pvxLatestTitle').textContent=p.latestResult.reportTitle;
      document.getElementById('pvxLatest').textContent=`Current report revision: ${p.latestResult.reportRevision}`;
      if(p.mostRecentDelta){document.getElementById('pvxDeltaCard').hidden=false;document.getElementById('pvxDelta').textContent=p.mostRecentDelta.explanation||'Your CoverageFit changed because new evidence was added.';}
      document.getElementById('pvxComplete').innerHTML=p.complete.map(item=>`<li>${escape(item.label)}</li>`).join('')||'<li>Your Snapshot is available.</li>';
      document.getElementById('pvxHomeStatus').textContent=p.homeProfileStatus;
      document.getElementById('pvxPolicyStatus').textContent=p.currentPolicyStatus;
      document.getElementById('pvxReceived').textContent=p.whatDylanReceived.length?p.whatDylanReceived.join(', '):'You have not chosen to share anything with Dylan yet.';
      document.getElementById('pvxReports').innerHTML=p.reportRevisions.map(item=>`<li><a href="${escape(item.path)}">${escape(item.title||item.label)}</a></li>`).join('')||'<li>No saved report revision is available.</li>';
      document.getElementById('pvxDocuments').innerHTML=(p.documents||[]).map(item=>`<li><strong>${escape(item.name)}</strong> — ${escape(item.state.replace(/_/g,' '))}</li>`).join('')||'<li>No customer-authorized documents are available.</li>';
      document.getElementById('pvxNextAction').textContent=p.nextValue.primary.label;
      document.getElementById('pvxNext').textContent=p.nextValue.primary.value;
      document.getElementById('pvxContinueButtons').innerHTML=p.continueButtons.map(item=>`<a class="pvx-button pvx-button--primary" href="${escape(item.path)}">${escape(item.label)}</a>`).join('');
      document.getElementById('pvxReturnGuidance').textContent=`${p.returnGuidance.sameDevice} ${p.returnGuidance.crossDevice}`;
      status.textContent='Your secure CoverageFit is up to date.';
      root.dispatchEvent(new CustomEvent('coveragefit:progress-loaded',{detail:{progress:p,token}}));
    }catch(error){main.dataset.state='unavailable';status.textContent=error.message;}
  }
  root.addEventListener('DOMContentLoaded',install,{once:true});
})(window);
