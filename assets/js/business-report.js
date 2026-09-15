(async()=>{
 await(window.COVERAGEFIT_PRODUCER_READY||Promise.resolve());
 const $=id=>document.getElementById(id); let r={};
 try{r=JSON.parse(localStorage.getItem('coveragefit_business_report')||'{}')}catch(e){}
 const a=Array.isArray(r.answers)?r.answers:[], profile=r.profile||{}, consumer=r.consumer||{};
 const byKey=Object.fromEntries(a.map(x=>[x.key,x]));
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const label=(v,f='Not provided')=>v?String(v).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()):f;
 const points=a.reduce((n,x)=>n+Math.min(0,Number(x.points||0)),0);
 const missing=[];
 if(!byKey.current_carrier?.value)missing.push('Current carrier');
 if(!byKey.renewal_date?.value)missing.push('Renewal date');
 const score=Number.isFinite(Number(r.score))?Number(r.score):Math.max(0,Math.min(100,100+points-(missing.length*2)));
 const rating=r.status||r.rating||window.CoverageFitProtectionScore?.bandFor?.(score)?.label||'Review Recommended';
 const risks=a.filter(x=>Number(x.scoreImpact||0)>0||Number(x.points||0)<0).sort((x,y)=>Number(y.weightedPenalty||Math.abs(Number(y.points||0)))-Number(x.weightedPenalty||Math.abs(Number(x.points||0))));
 const strengths=a.filter(x=>(x.findingType==='strength'||Number(x.scoreImpact||0)===0)&&!['current_carrier','renewal_date'].includes(x.key)).sort((x,y)=>Number(y.weight||0)-Number(x.weight||0));
 const industryKey=profile.industry||r.industry||'other';
 if(window.CoverageFitIllustrations)window.CoverageFitIllustrations.hero('business',industryKey).then(data=>window.CoverageFitIllustrations.applyImage($('businessReportHero'),data));
 const industry=a.filter(x=>!['Current Coverage'].includes(x.category) && x.key && !['current_carrier','renewal_date','claims_history','location_count','shared_vehicles','general_liability_status','property_status','business_income_status','workers_comp_status','cyber_status','umbrella_status','professional_liability_status','certificate_contracts'].includes(x.key));
 const policies=['general_liability_status','property_status','business_income_status','workers_comp_status','cyber_status','umbrella_status','professional_liability_status'].map(k=>byKey[k]).filter(Boolean);
 document.querySelectorAll('[data-exec-score]').forEach(el=>el.textContent=score);
 document.querySelectorAll('[data-exec-rating]').forEach(el=>el.textContent=rating);
 try{localStorage.setItem('coveragefit_last_product','business')}catch(e){}
 const profileRows=[['Industry',r.industryLabel||profile.industryLabel],['Size',profile.businessSize],['Revenue range',profile.revenueRange],['Locations',byKey.location_count?.label||profile.locationType],['Employees',profile.employees]];
 $('profileGrid').innerHTML=profileRows.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(label(v))}</strong></div>`).join('');
 $('operations').innerHTML=(industry.length?industry.slice(0,6):[{title:'Business operations',label:'General business review'}]).map(x=>`<div class="snapshot-row"><span>${esc(x.title||x.tag)}</span><strong>${esc(x.label||x.value||'Not provided')}</strong></div>`).join('');
 const contracts=byKey.certificate_contracts;
 if(contracts)$('operations').insertAdjacentHTML('beforeend',`<div class="snapshot-row"><span>Contract requirements</span><strong>${esc(contracts.label)}</strong></div>`);
 $('coverageGrid').innerHTML=`<div><span>Carrier</span><strong>${esc(byKey.current_carrier?.value||'Not confirmed')}</strong></div><div><span>Renewal date</span><strong>${esc(byKey.renewal_date?.value||'Not confirmed')}</strong></div><div><span>Claims</span><strong>${esc(byKey.claims_history?.label||'Not confirmed')}</strong></div>`+policies.map(x=>`<div><span>${esc(x.tag)}</span><strong>${esc(x.label)}</strong></div>`).join('');
 const renderList=(id,items,empty,kind)=>{$(id).innerHTML=items.length?items.map(x=>`<article class="risk-card ${kind}"><div><span>${esc(x.tag||x.category||'Review topic')}</span><h3>${esc(x.insight||x.label)}</h3>${x.question?`<p>${esc(x.question)}</p>`:''}</div></article>`).join(''):`<div class="report-empty">${esc(empty)}</div>`};
 renderList('priorityList',risks.slice(0,5),'No major answer-based concern was flagged.','priority');
 renderList('strengthList',strengths.slice(0,5),'No confirmed strengths were available from the saved responses.','strength');
 const uncertain=a.filter(x=>/not sure|unknown|unclear|need to confirm/i.test(`${x.label} ${x.insight}`));
 const topRisk=risks[0], topStrength=strengths[0], topMissing=missing[0]||uncertain[0]?.tag||uncertain[0]?.title;
 if($('executivePriority')){$('executivePriority').textContent=topRisk?.tag||topRisk?.title||'No major priority identified';$('executivePriorityDetail').textContent=topRisk?.insight||topRisk?.label||'No major answer-based concern was flagged.';}
 if($('executiveStrength')){$('executiveStrength').textContent=topStrength?.tag||topStrength?.title||'Review completed';$('executiveStrengthDetail').textContent=topStrength?.insight||topStrength?.label||'Positive confirmations still require policy verification.';}
 if($('executiveMissing')){$('executiveMissing').textContent=topMissing||'No major missing item';$('executiveMissingDetail').textContent=topMissing?`${topMissing} should be confirmed during your review.`:'No major missing or uncertain item was identified.';}
 $('missingList').innerHTML=[...missing.map(x=>({tag:x,insight:`${x} was not confirmed.`})),...uncertain].slice(0,6).map(x=>`<div class="uncertain-row"><strong>${esc(x.tag||x.title)}</strong><span>${esc(x.insight||x.label)}</span></div>`).join('')||'<div class="report-empty">No major missing or uncertain items were identified.</div>';
 $('deductions').innerHTML=risks.map(x=>`<div><span>${esc(x.tag||x.title)}</span><strong>${Math.abs(Number(x.points||0))} point deduction</strong></div>`).join('')+(missing.map(x=>`<div><span>${esc(x)}</span><strong>2 point deduction</strong></div>`).join(''))||'<div><span>No deductions</span><strong>0 points</strong></div>';
 const recommendations=window.CoverageFitBusinessRecommendations?.generate(r)||[];
 const priorityOrder=['high','recommended','additional'];
 const recGroups=priorityOrder.map(priority=>{
   const items=recommendations.filter(item=>item.priority===priority);
   if(!items.length)return '';
   return `<section class="recommendation-group"><header><span class="priority-dot ${priority}"></span><h3>${esc(items[0].priorityLabel)}</h3><strong>${items.length}</strong></header><div class="recommendation-cards">${items.map(item=>`<article class="recommendation-card ${priority}" data-recommendation-name="${esc(item.name)}"><img class="recommendation-card-visual" src="/assets/illustrations/default.svg" alt=""><div class="recommendation-card-top"><span>${esc(item.priorityLabel)}</span><small>${esc(item.trigger)}</small></div><h3>${esc(item.name)}</h3><p><strong>Why it appears:</strong> ${esc(item.why)}</p><div class="trigger-detail-grid"><div class="trigger-detail"><span>Why this matters</span><p>${esc(item.whyMatters||'Confirm how this topic affects the business.')}</p></div><div class="trigger-detail"><span>Practical example</span><p>${esc(item.example||'The impact depends on operations and policy wording.')}</p></div><div class="trigger-detail trigger-question"><span>Question to discuss</span><p>${esc(item.discussionQuestion||`How is ${item.name} addressed?`)}</p></div></div></article>`).join('')}</div></section>`;
 }).join('');
 $('recommendationGroups').innerHTML=recGroups||'<div class="report-empty">No personalized recommendation topics were generated from the saved responses.</div>';
 if(window.CoverageFitIllustrations){document.querySelectorAll('[data-recommendation-name]').forEach(card=>window.CoverageFitIllustrations.recommendation(card.dataset.recommendationName).then(data=>window.CoverageFitIllustrations.applyImage(card.querySelector('img'),data)));}
 $('printReport').onclick=()=>window.print();
 window.CoverageFitAnalytics?.track('report_viewed',{assessment:'business',score,rating});
})();
