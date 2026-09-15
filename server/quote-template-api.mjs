import producer from '../producer.json' with {type:'json'};
import {authorizeProducer} from './consultation-inbox-core.mjs';
import {resolveProducerEnvironment} from './cloudflare-pages-handlers.mjs';
import {withD1RateLimit} from './cloudflare-rate-limit.mjs';
import {templateRepository} from './quote-template-repository.mjs';
import {templateConfig,answerFields,differences} from '../assets/js/quote-template-model.mjs';
import {clean} from '../assets/js/recommendation-model.mjs';
import {extractQuote,proposeTemplate} from './recommendation-extraction.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
async function bytes(request,max){const reader=request.body?.getReader();if(!reader)return new Uint8Array();let size=0;const chunks=[];while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();fail(413,'The upload or request is too large.');}chunks.push(r.value);}const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;}
async function route(context,env){
 const {request}=context;const auth=authorizeProducer(request,env);if(!auth.ok)return auth.response;
 if(env.COVERAGEFIT_RECOMMENDATIONS_ENABLED!=='true')fail(503,'Enable quote recommendations before using templates.');
 if(!env.COVERAGEFIT_DB)fail(503,'Recommendation database is unavailable.');
 const repo=templateRepository(env.COVERAGEFIT_DB,producer.id),url=new URL(request.url),path=url.pathname.replace(/^\/api\/quote-templates\/?/,'').replace(/\/$/,'');
 if(!['GET','POST'].includes(request.method))fail(405,'Use a supported request method.');
 if(request.method==='POST'&&request.headers.get('origin')!==url.origin)fail(403,'Use the CoverageFit template screen.');
 const view=async id=>{const template=await repo.get(id);if(!template)fail(404,'Template not found.');const version=await repo.version(id),samples=await repo.samples(id);return {template,config:version.config,versions:await repo.versions(id),samples:await Promise.all(samples.map(async s=>({id:s.id,expected:s.expected,expected_version:s.expected_version,files:s.files.map(({objectKey,...f})=>f),runs:(await repo.runs(s.id)).map(({result_json,differences_json,...r})=>r)})))};};
 if(request.method==='GET'){
  if(!path){const rows=await repo.list();return json({templates:await Promise.all(rows.map(async t=>({...t,config:(await repo.version(t.id)).config}))),workflow:await repo.settings(),configured:Boolean(env.OPENAI_API_KEY&&env.COVERAGEFIT_QUOTE_AI_MODEL)});}
  if(path==='record')return json(await view(url.searchParams.get('id')));
  if(path==='version'){const v=await repo.version(url.searchParams.get('id'),Number(url.searchParams.get('version')));if(!v)fail(404,'Version not found.');return json({config:v.config});}
  if(path==='sample-file'){const sample=await repo.sample(url.searchParams.get('id'),url.searchParams.get('sampleId'));const file=sample?.files.find(f=>f.id===url.searchParams.get('fileId'));if(!file)fail(404,'Sample file not found.');const object=await env.POLICY_FILES?.get(file.objectKey);if(!object)fail(404,'Sample file unavailable.');return new Response(object.body,{headers:{'Content-Type':file.type,'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});}
  fail(404,'Unknown template action.');
 }
 if(path==='upload'){
  if(!env.POLICY_FILES)fail(503,'Private sample storage is unavailable.');
  const form=await new Response(await bytes(request,25*1024*1024),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();const id=String(form.get('id')||'');if(!await repo.get(id))fail(404,'Template not found.');
  if((await repo.samples(id)).length>=12)fail(422,'A template supports up to 12 sample sets. Create another template for a distinct format.');
  const uploads=form.getAll('files');if(!uploads.length||uploads.length>6)fail(422,'Choose one PDF or up to six related screenshots/files.');
  const files=[];let total=0;
  for(const file of uploads){if(typeof file.arrayBuffer!=='function'||!file.size||file.size>8*1024*1024)fail(422,'Each sample must be a PDF, PNG or JPEG up to 8 MB.');total+=file.size;if(total>24*1024*1024)fail(413,'A sample set supports up to 24 MB.');const content=new Uint8Array(await file.arrayBuffer());const type=new TextDecoder().decode(content.subarray(0,8)).startsWith('%PDF-')?'application/pdf':content[0]===137&&content[1]===80&&content[2]===78&&content[3]===71?'image/png':content[0]===255&&content[1]===216&&content[2]===255?'image/jpeg':'';if(!type)fail(415,'Unsupported sample content.');const fileId=crypto.randomUUID();files.push({id:fileId,name:clean(file.name,160),type,size:file.size,objectKey:`private/quote-templates/${producer.id}/${id}/${fileId}`,bytes:content});}
  try{for(const f of files)await env.POLICY_FILES.put(f.objectKey,f.bytes,{httpMetadata:{contentType:f.type}});await repo.addSample(id,files.map(({bytes,...f})=>f));}catch(e){for(const f of files)await env.POLICY_FILES.delete(f.objectKey).catch(()=>{});throw e;}
  return json(await view(id),201);
 }
 let value;try{value=JSON.parse(new TextDecoder().decode(await bytes(request,300000)))}catch(e){if(e.status)throw e;fail(400,'The request could not be read.');}
 if(path==='seed'){await repo.seed();return json({ok:true});}
 if(path==='create'){const t=await repo.create(templateConfig(value.config));return json(await view(t.id),201);}
 if(path==='settings'){if(!await repo.saveSettings(Number(value.version),value.settings))fail(409,'Settings changed. Reload before saving.');return json(await repo.settings());}
 const t=await repo.get(value.id);if(!t)fail(404,'Template not found.');
 if(path==='save'){if(!await repo.save(t.id,Number(value.head),templateConfig(value.config)))fail(409,'This template changed in another tab. Reload the saved version.');return json(await view(t.id));}
 if(path==='activate'||path==='rollback'){const v=Number(value.version);if(!await repo.version(t.id,v))fail(404,'Version not found.');if(!await repo.activate(t.id,v,Number(value.head),value.active_version??null,path==='rollback'))fail(409,path==='rollback'?'Only a previously activated version can be restored. Reload if the active version changed.':'Every sample needs reviewed expected answers and a passing test for this version. Reload if the template changed.');return json(await view(t.id));}
 if(path==='deactivate'){if(!await repo.deactivate(t.id,Number(value.head),value.active_version??null))fail(409,'Template changed. Reload first.');return json(await view(t.id));}
 const sample=await repo.sample(t.id,value.sampleId);if(!sample)fail(404,'Sample set not found.');
 if(path==='archive-sample'){await repo.archive(t.id,sample.id);return json(await view(t.id));}
 const load=async()=>{const docs=[];for(const f of sample.files){const object=await env.POLICY_FILES?.get(f.objectKey);if(!object)fail(404,'Sample file unavailable.');docs.push({...f,bytes:new Uint8Array(await object.arrayBuffer())});}return docs;};
 if(path==='propose'){const config=templateConfig(await proposeTemplate(await load(),env,context.fetch||fetch));return json({config});}
 if(path==='expected'){
  if(!value.reviewed)fail(422,'Review the source and expected answers first.');
  const run=(await repo.runs(sample.id)).find(r=>r.id===value.runId);if(!run)fail(422,'Run this sample first.');const expected=value.expected;
  if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).length>3000||Object.values(expected).some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)))fail(422,'Expected answers must contain simple field values.');
  const source=answerFields(run.result);if(!Object.keys(source).every(k=>Object.hasOwn(expected,k)))fail(422,'Keep every extracted field in the expected answers.');
  if(!await repo.expected(t.id,sample.id,Number(value.expected_version),expected))fail(409,'Expected answers changed. Reload first.');return json(await view(t.id));
 }
 if(path==='test'){
  const version=await repo.version(t.id,Number(value.version));if(!version)fail(404,'Version not found.');const documents=await load();
  const result=await extractQuote(documents[0],documents[0].bytes,env,context.fetch||fetch,{documents,forceTemplate:{id:t.id,version:version.version,...version.config}});
  if(result.state!=='extracted')fail(503,result.message||'Extraction is unavailable.');
  const diff=sample.expected?differences(sample.expected,answerFields(result)):[];await repo.run(sample,version.version,result,diff);return json(await view(t.id));
 }
 fail(404,'Unknown template action.');
}
export async function quoteTemplateRequest(context){try{const env=await resolveProducerEnvironment(context.env||{});const costly=/\/(test|propose)$/.test(new URL(context.request.url).pathname);return await withD1RateLimit({...context,env},{route:'quote-templates'+(costly?':model':''),limit:costly?6:90,windowSeconds:60},()=>route(context,env));}catch(e){return json({error:{message:e.status?e.message:e.message?.startsWith('Configure quote extraction')?e.message:'Could not complete the template operation. Saved versions are preserved; check configuration or try again.'}},e.status||503);}}
