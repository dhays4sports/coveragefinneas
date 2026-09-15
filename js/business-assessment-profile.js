(() => {
  const key='coveragefit_business_profile';
  let profile=null;
  try{profile=JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||'null')}catch(e){}
  if(!profile){location.replace('/business/profile/');return;}
  const modules=window.COVERAGEFIT_BUSINESS_MODULES||{};
  const selected=modules[profile.module||profile.industry];
  const config=window.COVERAGEFIT_CONFIG;
  const shared=window.COVERAGEFIT_BUSINESS_SHARED_QUESTIONS||[];
  if(selected&&config){
    config.questions=[...selected.questions.map(q=>({...q,section:'industry'})),...shared];
    config.subjectLabel=`${selected.label} Business`;
    config.industryModule=profile.module||profile.industry;
    config.industryLabel=selected.label;
    config.resultCopy=`Your ${selected.label.toLowerCase()} responses revealed useful strengths and several industry-specific topics worth confirming with a licensed insurance professional.`;
    config.strongResultCopy=`Your ${selected.label.toLowerCase()} responses suggest a strong starting point. A focused review can confirm that the insurance still fits the operation.`;
  } else if(config){
    config.questions=[...config.questions.map(q=>({...q,section:'industry'})),...shared];
    config.industryModule=profile.module||profile.industry||'general';
    config.industryLabel=profile.industryLabel||'Business';
  }
  const intro=document.querySelector('.assessment-intro');
  if(intro){
    const card=document.createElement('div');
    card.className='assessment-profile-context';
    card.innerHTML=`<div><span>Industry path</span><strong>${esc(profile.industryLabel||'Business')}</strong></div><div><span>Business size</span><strong>${format(profile.businessSize)}</strong></div><div><span>Employees</span><strong>${format(profile.employees)}</strong></div><div><span>Location</span><strong>${format(profile.locationType)}</strong></div><div><span>Revenue</span><strong>${formatRevenue(profile.revenueRange)}</strong></div><a href="/business/profile/">Edit profile</a>`;
    intro.insertAdjacentElement('afterend',card);
  }
  const title=document.querySelector('[data-trigger-assessment-title]');
  if(title)title.textContent=`Let's build your ${profile.industryLabel||'Business'} Protection Snapshot.`;
  const type=document.getElementById('businessType');
  if(type){
    let option=[...type.options].find(o=>o.textContent.trim()===profile.industryLabel);
    if(!option){option=document.createElement('option');option.value=profile.industryLabel;option.textContent=profile.industryLabel;type.appendChild(option)}
    type.value=profile.industryLabel;
  }
  const form=document.getElementById('captureForm');
  if(form){Object.entries(profile).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=`business_profile_${name}`;input.value=value;form.appendChild(input)})}
  function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function format(v){return String(v||'Not provided').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()).replace('51 Plus','51+').replace('1 5','1–5').replace('2 5','2–5').replace('6 20','6–20').replace('21 50','21–50')}
  function formatRevenue(v){return ({'pre-revenue':'Pre-revenue / startup','under-100k':'Under $100,000','100k-250k':'$100,000–$250,000','250k-500k':'$250,000–$500,000','500k-1m':'$500,000–$1 million','1m-5m':'$1 million–$5 million','5m-plus':'More than $5 million'})[v]||format(v)}
})();
