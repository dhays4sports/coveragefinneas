import {authorizeProducer} from './consultation-inbox-core.mjs';
import {resolveProducerEnvironment} from './cloudflare-pages-handlers.mjs';
import {BUILD,fail,manualInput,wrapInput,validId} from '../assets/js/solo-desk-model.mjs';
import {identity,soloRepository} from './solo-desk-repository.mjs';
import {sourceSync,STREAMS} from './solo-desk-sync.mjs';
import {acquisitionMeasurement,refreshAcquisitionState} from './acquisition-measurement.mjs';
import {fivCalibration,recordEffortEvidence} from './fiv-calibration.mjs';
import {policyboxService} from './policybox-current-policy.mjs';
import {shotsBoard} from './shots-board.mjs';
import {economicsService} from './economics-core.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
async function body(request){
  if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'content_type','A JSON request is required.');
  if(Number(request.headers.get('content-length')||0)>16000)fail(413,'size','Keep this update under 16 KB.');
  const reader=request.body?.getReader();let text='',size=0;const decoder=new TextDecoder();
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();fail(413,'size','Keep this update under 16 KB.');}text+=decoder.decode(value,{stream:true});}
  let value;try{value=JSON.parse(text+decoder.decode());}catch{fail(400,'json','The update could not be read.');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'json','The update must be an object.');return value;
}
export async function handleSoloDesk(context){
  try{
    const request=context.request,env=await resolveProducerEnvironment(context.env||{}),auth=authorizeProducer(request,env);
    if(!auth.ok)return auth.response;
    if(!env.COVERAGEFIT_DB)fail(503,'storage_unavailable','The shared desk is unavailable. The existing inbox is still available.');
    const repo=soloRepository(env.COVERAGEFIT_DB,identity(env));
    const policybox=policyboxService(repo,env,env.POLICY_FILES||null,context.fetch||fetch);
    try{await repo.ready();}catch{fail(503,'setup_required','Solo Desk needs its database update before it can save shared work. Continue in the existing Inbox until setup is complete.');}
    const url=new URL(request.url),route=url.pathname.replace(/^\/api\/solo-desk\/?/,'').replace(/\/$/,'');
    if(request.method==='GET'){
      if(!route)return json({ok:true,build:BUILD,operator:repo.scope.name,mode:'solo',...await repo.list(url.searchParams,context.now||new Date())});
      if(route==='record'){const id=url.searchParams.get('id');return json({ok:true,...await repo.detail(id),policybox:await policybox.view(id)});}
      if(route==='policybox-document'){const result=await policybox.document(url.searchParams.get('id'),url.searchParams.get('ref'));const name=String(result.doc.name||'policy-document').replace(/[^A-Za-z0-9._ -]/g,'_').slice(0,120);return new Response(result.object.body||await result.object.arrayBuffer(),{status:200,headers:{'Content-Type':result.doc.type||'application/octet-stream','Content-Disposition':`inline; filename="${name}"`,'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'}});}
      if(route==='profile')return json({ok:true,customerProfile:await repo.profile(url.searchParams.get('id'))});
      if(route==='next-best-action'){const record=await repo.detail(url.searchParams.get('id'));return json({ok:true,nextBestAction:record.nextBestAction});}
      if(route==='shots-board')return json({ok:true,...await shotsBoard(repo,env).view(context.now||new Date())});
      if(route==='economics-summary'){try{return json({ok:true,...await economicsService(repo,env).summary(url.searchParams)});}catch(error){if(/no such table|no such column/i.test(String(error?.message||'')))fail(503,'economics_setup_required','Economics needs the acquisition and effort migrations before it can report.');throw error;}}
      if(route==='acquisition-summary'){const acq=acquisitionMeasurement(repo,env);try{await acq.ready();}catch{fail(503,'acquisition_setup_required','Acquisition measurement needs its database update before it can report economics.');}return json({ok:true,...await acq.summary(url.searchParams)});}
      if(route==='acquisition-campaigns'){const acq=acquisitionMeasurement(repo,env);try{await acq.ready();}catch{fail(503,'acquisition_setup_required','Acquisition measurement needs its database update before it can manage campaigns.');}return json({ok:true,build:'CF-ACQ-MEASURE-1.0',campaigns:await acq.campaigns()});}
      if(route==='fiv-calibration'){const acq=acquisitionMeasurement(repo,env),cal=fivCalibration(repo);try{await acq.ready();await cal.ready();}catch{fail(503,'fiv_calibration_setup_required','FIV calibration needs migration 0015 before it can compare queue performance.');}await acq.reconcile(300);return json({ok:true,...await cal.summary(url.searchParams)});}
      if(route==='activity')return json({ok:true,...await repo.activity(url.searchParams.get('id'),url.searchParams.get('cursor'))});
      if(route==='sync-status')return json({ok:true,streams:STREAMS,states:await repo.rows('SELECT stream,cursor_json FROM cf_solo_sync WHERE workspace_id=?',repo.scope.workspace)});
      fail(404,'route','This desk page is unavailable.');
    }
    if(request.method!=='POST')fail(405,'method','Use GET or POST for this desk.');
    if(request.headers.get('origin')!==url.origin)fail(403,'origin','Use the CoverageFit workspace to save this update.');
    const value=await body(request);
    if(route==='sync')return json({ok:true,...await sourceSync(repo).sync(value.stream)});
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.requestId||''))fail(422,'request_id','Reload the form before saving.');
    if(route==='acquisition-campaign'){const acq=acquisitionMeasurement(repo,env);try{await acq.ready();}catch{fail(503,'acquisition_setup_required','Acquisition measurement needs its database update before it can save campaigns.');}return json({ok:true,campaign:await acq.campaign(value,value.requestId)},201);}
    if(route==='acquisition-spend'){const acq=acquisitionMeasurement(repo,env);try{await acq.ready();}catch{fail(503,'acquisition_setup_required','Acquisition measurement needs its database update before it can save acquisition spend.');}return json({ok:true,spend:await acq.spend(value,value.requestId)},201);}
    if(route==='policybox-analyze'){if(!validId(value.id))fail(404,'opportunity','This opportunity is unavailable.');return json({ok:true,policybox:await policybox.analyze(value.id,value.documentRefs,value.requestId)},201);}
    if(route==='policybox-review'){if(!validId(value.id))fail(404,'opportunity','This opportunity is unavailable.');return json({ok:true,policybox:await policybox.review(value.id,String(value.analysisId||''),value.reviewNote,value.requestId)});}
    if(route==='create'){const created=await repo.create(manualInput(value),value.requestId);await refreshAcquisitionState(repo,created.opportunity.id).catch(error=>{if(!/no such table/i.test(String(error?.message||'')))throw error;});return json({ok:true,...await repo.detail(created.opportunity.id)},201);}
    if(route==='profile-link'){
      if(!validId(value.sourceOpportunityId)||!validId(value.targetOpportunityId))fail(404,'opportunity','Both opportunities must be valid shared-desk records.');
      return json({ok:true,customerProfile:await repo.linkProfile(value.sourceOpportunityId,value.targetOpportunityId,value.requestId)});
    }
    if(route==='profile-split'){
      if(!validId(value.id))fail(404,'opportunity','This opportunity is unavailable.');
      return json({ok:true,customerProfile:await repo.splitProfile(value.id,value.requestId)});
    }
    if(route==='wrap'){
      if(!validId(value.id))fail(404,'opportunity','This opportunity is unavailable.');
      const wrapped=wrapInput(value);await repo.wrap(value.id,wrapped,value.requestId);
      if(wrapped.effort)await recordEffortEvidence(repo,value.id,{...wrapped.effort,note:wrapped.note},value.requestId);
      await refreshAcquisitionState(repo,value.id).catch(error=>{if(!/no such table|no such column/i.test(String(error?.message||'')))throw error;});return json({ok:true,...await repo.detail(value.id)});
    }
    fail(404,'route','This desk action is unavailable.');
  }catch(error){return json({ok:false,error:{code:error.code||'storage_unavailable',message:error.status?error.message:'The shared desk could not finish this request. Your form is still here; retry after the connection returns.'}},error.status||503);}
}
