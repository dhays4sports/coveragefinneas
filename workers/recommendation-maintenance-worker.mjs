export default {
  async scheduled(_event,env,context){
    const origin=new URL(env.COVERAGEFIT_ORIGIN||'');
    if(origin.protocol!=='https:'||origin.origin!==env.COVERAGEFIT_ORIGIN||String(env.COVERAGEFIT_RECOMMENDATION_MAINTENANCE_SECRET||'').length<32)throw new Error('Recommendation maintenance is not configured.');
    context.waitUntil(fetch(`${origin.origin}/api/internal/recommendation-maintenance`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${env.COVERAGEFIT_RECOMMENDATION_MAINTENANCE_SECRET}`},signal:AbortSignal.timeout(45000)}).then(async response=>{if(!response.ok)throw new Error(`Recommendation maintenance failed (${response.status}).`);const result=await response.json();if(!result.ok)throw new Error('Recommendation maintenance was incomplete.');}));
  }
};
