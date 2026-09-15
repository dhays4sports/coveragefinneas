(function(){
  const FALLBACK={src:'/assets/illustrations/default.svg',alt:'CoverageFit protection illustration'};
  const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
  const state={registry:null,ready:null};
  function load(){
    if(state.ready)return state.ready;
    state.ready=fetch('/shared/illustration-registry.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('registry');return r.json()}).then(x=>(state.registry=x,x)).catch(()=>({fallback:FALLBACK,heroes:{},recommendations:{}}));
    return state.ready;
  }
  function asset(file,alt){return file?{src:file.startsWith('/')?file:`/assets/illustrations/${file}`,alt:alt||FALLBACK.alt}:FALLBACK}
  async function hero(type,key){const r=await load();const file=r.heroes?.[type]?.[key]||r.heroes?.[type]?.default;return asset(file,`${key||type} CoverageFit illustration`)}
  async function recommendation(name){const r=await load();const file=r.recommendations?.[norm(name)];return asset(file,`${name||'Coverage topic'} illustration`)}
  function applyImage(img,data){if(!img||!data)return;img.src=data.src;img.alt=data.alt;img.loading='lazy';img.decoding='async';img.onerror=()=>{img.onerror=null;img.src=FALLBACK.src;img.alt=FALLBACK.alt}}
  window.CoverageFitIllustrations={load,hero,recommendation,applyImage,norm};
})();
