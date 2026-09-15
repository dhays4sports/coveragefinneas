(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CoverageFitDisplacementCarriers=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const VERSION='1.0.0',BUILD='CF-DISP-5.0';
  const REGISTRY=Object.freeze({
    safeco:Object.freeze({key:'safeco',publicName:'Safeco',aliases:['safeco','safeco insurance','safeco insurance company of america','safeco insurance company of illinois'],group:'Liberty Mutual Group',activeCampaign:true,seoStatus:'active',paidSearchStatus:'active',intakeDefault:'safeco'}),
    liberty_mutual:Object.freeze({key:'liberty_mutual',publicName:'Liberty Mutual',aliases:['liberty mutual','liberty mutual insurance'],group:'Liberty Mutual Group',activeCampaign:true,seoStatus:'active',paidSearchStatus:'active',intakeDefault:'liberty_mutual'}),
    aaa_csaa:Object.freeze({key:'aaa_csaa',publicName:'AAA / CSAA',aliases:['aaa','csaa','aaa csaa'],activeCampaign:false,seoStatus:'inactive',paidSearchStatus:'inactive'}),
    state_farm:Object.freeze({key:'state_farm',publicName:'State Farm',aliases:['state farm'],activeCampaign:false,seoStatus:'inactive',paidSearchStatus:'inactive'}),
    travelers:Object.freeze({key:'travelers',publicName:'Travelers',aliases:['travelers'],activeCampaign:false,seoStatus:'inactive',paidSearchStatus:'inactive'}),
    mercury:Object.freeze({key:'mercury',publicName:'Mercury',aliases:['mercury'],activeCampaign:false,seoStatus:'inactive',paidSearchStatus:'inactive'}),
    other:Object.freeze({key:'other',publicName:'Another company',aliases:[],activeCampaign:false,seoStatus:'inactive',paidSearchStatus:'inactive'}),
    unsure:Object.freeze({key:'unsure',publicName:"I'm not sure",aliases:[],activeCampaign:false,seoStatus:'inactive',paidSearchStatus:'inactive'})
  });
  const clean=v=>String(v||'').trim().toLowerCase();
  function resolve(value){const candidate=clean(value);if(REGISTRY[candidate])return REGISTRY[candidate];for(const item of Object.values(REGISTRY))if(item.aliases?.includes(candidate))return item;return REGISTRY.other;}
  return Object.freeze({VERSION,BUILD,REGISTRY,resolve,list:()=>Object.values(REGISTRY)});
});
