(() => {
  const form = document.getElementById('businessProfileForm');
  const key = 'coveragefit_business_profile';
  const labels = {
    contractor:'Contractor', restaurant:'Restaurant', 'professional-office':'Professional Office', retail:'Retail', nonprofit:'Nonprofit', healthcare:'Healthcare', technology:'Technology', 'property-management':'Property Management', manufacturing:'Manufacturing', other:'Other'
  };
  const routeMap = {
    contractor:'contractor', restaurant:'restaurant', 'professional-office':'professional-office', retail:'retail', nonprofit:'nonprofit', healthcare:'healthcare', technology:'technology', 'property-management':'property-management', manufacturing:'manufacturing', other:'other'
  };
  function load(){
    let saved={}; try{saved=JSON.parse(localStorage.getItem(key)||sessionStorage.getItem(key)||'{}')}catch(e){}
    Object.entries(saved).forEach(([name,value])=>{
      const field=form.elements[name]; if(!field)return;
      if(field instanceof RadioNodeList){[...form.querySelectorAll(`[name="${name}"]`)].forEach(el=>el.checked=el.value===value)} else field.value=value;
    });
  }
  form.addEventListener('change',e=>{if(e.target.name==='industry')document.querySelectorAll('.industry-option').forEach(x=>x.classList.toggle('selected',x.querySelector('input').checked))});
  form.addEventListener('submit',e=>{
    e.preventDefault();
    if(!form.reportValidity())return;
    const data=Object.fromEntries(new FormData(form).entries());
    data.industryLabel=labels[data.industry]||'Business';
    data.module=routeMap[data.industry]||'other';
    data.createdAt=new Date().toISOString();
    const serialized=JSON.stringify(data);
    localStorage.setItem(key,serialized); sessionStorage.setItem(key,serialized);
    sessionStorage.setItem('coveragefit_business_industry',data.industry);
    location.href=`/business/assessment/?industry=${encodeURIComponent(data.industry)}&module=${encodeURIComponent(data.module)}`;
  });
  load();
  form.dispatchEvent(new Event('change',{bubbles:true}));
})();
