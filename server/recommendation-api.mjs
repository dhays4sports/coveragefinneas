import {templateRepository} from './quote-template-repository.mjs';
import {soloRepository,identity as soloIdentity} from './solo-desk-repository.mjs';
import {projectSoloDeskEventBestEffort} from './solo-desk-event-projection.mjs';
import {checkProtectionLinks} from './protection-link-checks.mjs';
import {listProtectionPresets,saveProtectionPreset,attachProtectionPresets} from './protection-presets.mjs';
import {launchProtection,protectionBridge,protectionClientContext,protectionQueue,reviewProtection} from './protection-bridge.mjs';
import {launchDeviceTask,deviceBridge,deviceClientContext,deviceWorkQueue,recordDeviceReview} from './device-task-bridge.mjs';
import {applyQuoteWorkflow} from '../assets/js/quote-template-model.mjs';
import producer from '../producer.json' with {type:'json'};
import { authorizeProducer } from './consultation-inbox-core.mjs';
import { resolveProducerEnvironment } from './cloudflare-pages-handlers.mjs';
import { createConsultationStore,createPVXRecordStore,createSmsConversationStore } from './d1-json-store.mjs';
import { leadRecordKey } from './lead-operations-core.mjs';
import { withD1RateLimit } from './cloudflare-rate-limit.mjs';
import { repository,iso } from './recommendation-repository.mjs';
import { BUILD,clean,newDraft,normalizeDraft,approvalIssues,clientProjection,recommendationEmail } from '../assets/js/recommendation-model.mjs';
import { extractQuote } from './recommendation-extraction.mjs';
import { deliverRecommendationNotification,retryRecommendationNotifications } from './recommendation-notifications.mjs';
import { recommendationSlots,bookRecommendation,linkExistingAppointment,publicAppointment } from './recommendation-booking.mjs';
import { closingFlow } from './closing-flow.mjs';

const REC=/^rec_[a-f0-9-]{36}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const encoder=new TextEncoder();
export const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value)),v=>v.toString(16).padStart(2,'0')).join('');
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
function fail(status,code,message) {throw Object.assign(new Error(message),{status,code});}
function requireMethod(request,method) {if(request.method!==method) fail(405,'method','This request method is not supported.');}
function sameOrigin(request) {if(request.headers.get('origin')!==new URL(request.url).origin) fail(403,'origin','Please use the CoverageFit page to continue.');}
export async function shareToken(id,revision,env) {
  const secret=String(env.COVERAGEFIT_RECOMMENDATION_LINK_SECRET || '');
  if(secret.length<32) fail(503,'link_configuration','Private review links need their signing key configured. Your draft is saved.');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${BUILD}|${id}|${revision}`)));
  return btoa(String.fromCharCode(...signed)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function boundedBytes(request,max) {
  if(Number(request.headers.get('content-length') || 0)>max) fail(413,'size','This file or request is too large.');
  const reader=request.body?.getReader(); if(!reader) return new Uint8Array();
  const chunks=[];let total=0;
  while(true) {const {done,value}=await reader.read();if(done) break;total+=value.byteLength;if(total>max){await reader.cancel();fail(413,'size','This file or request is too large.');} chunks.push(value);}
  const result=new Uint8Array(total);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
async function body(request) {
  if(!String(request.headers.get('content-type')).includes('application/json')) fail(415,'content_type','A JSON request is required.');
  try{return JSON.parse(new TextDecoder().decode(await boundedBytes(request,160000)));}catch(e){if(e.status)throw e;fail(400,'json','The request could not be read.');}
}
function safeRecord(record) {const {draft_json,appointment_json,outcome_json,...safe}=record;return safe;}
function expiredQuote(option,env) {const today=new Intl.DateTimeFormat('en-CA',{timeZone:env.CALLBACK_TIME_ZONE || 'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return (option?.policies || []).some(p=>p.quoteExpiresOn && p.quoteExpiresOn<today);}
async function owned(repo,id) {if(!REC.test(id || ''))fail(404,'record','This recommendation is unavailable.');const rec=await repo.get(id);if(!rec || rec.owner_id!==producer.id)fail(404,'record','This recommendation is unavailable.');return rec;}
async function client(request,repo) {
  const token=request.headers.get('x-coveragefit-review') || '';
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)) fail(404,'review','This review link is unavailable. Contact Dylan for a current review.');
  const revision=await repo.fromToken(await hash(token));
  if(!revision || revision.revoked_at || Date.parse(revision.expires_at)<=Date.now()) fail(410,'review_expired','This review link is unavailable or has expired. Contact Dylan for a current review.');
  const record=await repo.get(revision.recommendation_id);
  if(!record)fail(404,'review','This review is unavailable.');
  return {revision,record,token};
}
function options(context,env) {return {env,repo:repository(env.COVERAGEFIT_DB),db:env.COVERAGEFIT_DB,fileStore:env.POLICY_FILES,store:createSmsConversationStore(env.COVERAGEFIT_DB),leadStore:createPVXRecordStore(env.COVERAGEFIT_DB),origin:new URL(context.request.url).origin,fetch:context.fetch || fetch,waitUntil:context.waitUntil?.bind(context)};}
function background(job,opts) {if(opts.waitUntil){opts.waitUntil(job);return Promise.resolve();}return job;}
async function recordView(record,opts) {
  const documents=await opts.repo.documents(record.id),events=await opts.repo.events(record.id);
  const revision=record.current_revision ? await opts.repo.revision(record.id,record.current_revision) : null;
  let share=null;
  if(revision) {
    const token=await shareToken(record.id,record.current_revision,opts.env);
    const url=`${opts.origin}/review/#t=${token}`;
    share={revision:revision.revision,createdAt:revision.created_at,sentAt:revision.sent_at,expiresAt:revision.expires_at,revoked:Boolean(revision.revoked_at),url,payload:revision.payload,email:recommendationEmail(revision.payload,url)};
  }
  return {record:safeRecord(record),documents:documents.map(({objectKey,...doc})=>doc),events:events.map(({payload_json,...event})=>event),share,closing:await closingFlow(opts.repo).view(record),producer,capabilities:{workflowRules:(await templateRepository(opts.db,producer.id).settings()).settings,extraction:Boolean(opts.env.OPENAI_API_KEY && opts.env.COVERAGEFIT_QUOTE_AI_MODEL),uploads:Boolean(opts.fileStore),links:Boolean(String(opts.env.COVERAGEFIT_RECOMMENDATION_LINK_SECRET || '').length>=32)}};
}
async function contextDraft(kind,id,opts) {
  const draft=newDraft();
  if(kind==='opportunity') {
    const {opportunity:r}=await soloRepository(opts.db,soloIdentity(opts.env)).detail(id);
    draft.context={kind,id};draft.contact={name:clean(r.contact?.name,160),email:clean(r.contact?.email,200),mobile:clean(r.contact?.mobile,40)};
    draft.priority=clean(r.reason,600);
  } else if(kind==='consultation') {
    const r=await createConsultationStore(opts.db).get(`records/${id}`);
    if(!r)fail(404,'context','This consultation was not found.');
    draft.context={kind,id};draft.contact={name:clean(r.customer?.name,160),email:clean(r.customer?.email,200),mobile:clean(r.customer?.phone || r.customer?.mobile,40)};
    draft.priority=clean(r.report?.prospectProfile?.reviewContext || r.report?.personalizationContext?.shoppingReason || '',600);
    draft.reasons=(r.recommendationPlan?.items || []).filter(item=>item.verified && item.decision==='recommend').map(item=>item.producerReason).filter(Boolean).join('\n');
  } else if(kind==='lead') {
    const key=await leadRecordKey(id);const r=key?await opts.leadStore.get(key):null;
    if(!r)fail(404,'context','This lead was not found.');
    draft.context={kind,id};draft.contact={name:[r.identity?.firstName,r.identity?.lastName].filter(Boolean).join(' '),email:clean(r.identity?.email,200),mobile:clean(r.identity?.mobile,40)};
    draft.priority=clean(r.context?.reviewContext || r.context?.reviewReason,600);
    if(r.context?.appointment?.calendarUrl) draft.existingAppointmentUrl=clean(r.context.appointment.calendarUrl,400);
  }
  return draft;
}
async function upload(request,opts) {
  if(!opts.fileStore)fail(503,'uploads_unavailable','Document storage is unavailable. You can still enter quote details manually.');
  const bytes=await boundedBytes(request,9*1024*1024);
  const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type') || ''}}).formData();
  const record=await owned(opts.repo,String(form.get('id') || ''));const file=form.get('file');
  if(!file || typeof file.arrayBuffer!=='function' || file.size===0 || file.size>8*1024*1024)fail(422,'file','Choose a PDF, JPEG or PNG up to 8 MB.');
  const content=new Uint8Array(await file.arrayBuffer());
  const pdf=new TextDecoder().decode(content.subarray(0,8)).startsWith('%PDF-'),png=content[0]===137 && content[1]===80 && content[2]===78 && content[3]===71,jpg=content[0]===255 && content[1]===216 && content[2]===255;
  const type=pdf?'application/pdf':png?'image/png':jpg?'image/jpeg':'';
  if(!type)fail(415,'file_type','Choose a valid PDF, JPEG or PNG document.');
  const documents=await opts.repo.documents(record.id),checksum=await hash(content);
  const existing=documents.find(d=>d.checksum===checksum);if(existing)return json({ok:true,document:existing,duplicate:true});
  if(documents.length>=12 || documents.reduce((n,d)=>n+d.size,0)+file.size>32*1024*1024)fail(413,'document_limit','This recommendation supports up to 12 files and 32 MB in total.');
  const id=`doc_${crypto.randomUUID()}`,objectKey=`private/recommendations/${record.id}/${id}`;
  const role=['proposed_quote','alternative_quote','current_policy','supporting'].includes(form.get('role'))?form.get('role'):'proposed_quote';
  const metadata={id,name:clean(file.name,180),type,size:file.size,checksum,objectKey,role,uploadedBy:'producer',ownerId:producer.id,createdAt:iso(),extraction:{state:'uploaded'}};
  await opts.fileStore.put(objectKey,content,{httpMetadata:{contentType:type}});
  try {await opts.repo.putDocument(id,record.id,metadata);}catch(error){await opts.fileStore.delete(objectKey).catch(()=>{});throw error;}
  const {objectKey:privateKey,...visible}=metadata;return json({ok:true,document:visible},201);
}
async function download(request,url,opts,isProducer) {
  let record,revision;
  if(isProducer)record=await owned(opts.repo,url.searchParams.get('id'));
  else ({record,revision}=await client(request,opts.repo));
  const id=url.searchParams.get('documentId');
  if(revision && !revision.payload.documents.some(d=>d.id===id))fail(404,'document','This document is unavailable.');
  const document=(await opts.repo.documents(record.id)).find(d=>d.id===id);
  if(!document || !opts.fileStore)fail(404,'document','This document is unavailable.');
  const object=await opts.fileStore.get(document.objectKey);if(!object)fail(404,'document','This document is unavailable.');
  return new Response(object.body || await object.arrayBuffer(),{headers:{'Content-Type':document.type,'Content-Disposition':`attachment; filename="${document.name.replace(/[^A-Za-z0-9._ -]/g,'_')}"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
async function route(context,env) {
  const request=context.request,url=new URL(request.url),path=url.pathname.replace(/^\/api\/recommendations\/?/,'').replace(/\/$/,'');
  if(String(env.COVERAGEFIT_RECOMMENDATIONS_ENABLED).toLowerCase()!=='true')fail(503,'feature_disabled','Quote recommendations are not enabled yet.');
  if(!env.COVERAGEFIT_DB)fail(503,'storage','Recommendation storage is not configured.');
  const opts=options(context,env),repo=opts.repo;
  if(path==='device-bridge') {
    requireMethod(request,'POST');const raw=new TextDecoder().decode(await boundedBytes(request,8192));
    let input;try{input=JSON.parse(raw);}catch{fail(400,'json','Invalid connection request.');}if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'json','Invalid connection request.');
    const result=await (input.bridgeVersion===2?protectionBridge:deviceBridge)(request,raw,opts);
    if(result.event){
      await projectSoloDeskEventBestEffort(opts,{kind:'response',eventId:result.event.id});
      await background(deliverRecommendationNotification(result.event,opts),opts);
    }
    const {event,...publicResult}=result;return json(publicResult);
  }
  const publicRoutes=['client','action','slots','book','document','device-launch'];
  let isProducer=!publicRoutes.includes(path) || (path==='document' && Boolean(request.headers.get('authorization')));
  if(isProducer){const auth=authorizeProducer(request,env);if(!auth.ok)return auth.response;}
  if(request.method!=='GET')sameOrigin(request);
  if(path==='document'){requireMethod(request,'GET');return download(request,url,opts,isProducer);}
  if(path==='upload'){requireMethod(request,'POST');return upload(request,opts);}
  if(path==='device-presets-check'){requireMethod(request,'POST');return json({ok:true,check:await checkProtectionLinks(opts,producer.id,await body(request))});}
  if(path==='device-presets'){if(request.method==='GET')return json({ok:true,presets:await listProtectionPresets(opts.db,producer.id)});requireMethod(request,'POST');return json({ok:true,preset:await saveProtectionPreset(opts.db,producer.id,await body(request))});}
  if(path==='device-queue'){requireMethod(request,'GET');const legacy=await deviceWorkQueue(opts,producer.id);let current=[];try{current=await protectionQueue(opts,producer.id);}catch{return json({ok:true,tasks:legacy,protectionUnavailable:true});}return json({ok:true,tasks:[...current,...legacy].sort((a,b)=>Number(b.requestedProceed)-Number(a.requestedProceed)||b.updatedAt.localeCompare(a.updatedAt))});}
  if(path==='device-review'){requireMethod(request,'POST');const value=await body(request);return json(await (value.bridgeVersion===2?reviewProtection:recordDeviceReview)(opts,await owned(repo,value.id),value.updateRequestId,producer.id));}
  if(path==='device-launch'){requireMethod(request,'POST');const value=await body(request);return json(await (value.taskId?launchProtection:launchDeviceTask)(await client(request,repo),value,opts));}
  if(path==='client') {
    requireMethod(request,'GET');const {record,revision}=await client(request,repo);
    const events=await repo.events(record.id);
    const operation=await repo.operation(record.id,'booking');
    return json({ok:true,review:revision.payload,producerRecordedBoundPolicyIds:['bound','partial'].includes(record.outcome?.kind)?record.outcome.policyIds:[],...await deviceClientContext(opts,record.id,revision.revision),...await protectionClientContext(opts,record,revision),revision:revision.revision,createdAt:revision.created_at,expiresAt:revision.expires_at,superseded:record.current_revision!==revision.revision,quoteExpired:expiredQuote(revision.payload.options.find(o=>o.id===revision.payload.recommendedOptionId),env),appointment:publicAppointment(record.appointment),hasPhone:Boolean(record.appointment.callbackPhone || record.draft.contact.mobile),proceedOptionIds:events.filter(e=>e.kind==='proceed'&&e.revision===revision.revision).map(e=>e.payload.optionId),pendingBooking:operation?{requestId:operation.payload.requestId,date:operation.payload.date,time:operation.payload.time,mode:operation.payload.prior?'reschedule':'book'}:null});
  }
  if(path==='slots'){requireMethod(request,'GET');const c=await client(request,repo);if(!c.revision.payload.bookingEnabled)fail(409,'booking_disabled','Contact Dylan to arrange a time.');return json({ok:true,...await recommendationSlots(url.searchParams.get('date'),opts)});}
  if(path==='action' || path==='book') {
    requireMethod(request,'POST');const {record,revision,token}=await client(request,repo),value=await body(request);
    if(record.current_revision!==revision.revision)fail(409,'superseded','Dylan has prepared an updated recommendation. Contact him for the current review.');
    if(!UUID.test(value.requestId || ''))fail(422,'request_id','Please reload the review and try again.');
    if(path==='book'){const booked=await bookRecommendation(record,revision,value,{...opts,reviewUrl:`${opts.origin}/review/#t=${token}`});await projectSoloDeskEventBestEffort(opts,{kind:'recommendation',recommendationId:record.id});return json({ok:true,...booked});}
    const kind=['proceed','question','item'].includes(value.kind)?value.kind:'';
    if(!kind)fail(422,'action','Choose a supported next action.');
    const option=revision.payload.options.find(o=>o.id===value.optionId);
    if(!option)fail(422,'option','Choose one of the quoted options.');
    if(kind==='proceed' && expiredQuote(option,env))fail(409,'quote_expired','The quote needs a refresh. Please contact Dylan to confirm the current terms.');
    const message=clean(value.message,1600);if(kind!=='proceed' && !message)fail(422,'message','Please add your question or response.');
    const event=await repo.event(record.id,revision.revision,kind,`${record.id}:${revision.revision}:${kind}:${kind==='proceed'?option.id:value.requestId}`,{optionId:option.id,optionLabel:option.label,message});
    await projectSoloDeskEventBestEffort(opts,{kind:'response',eventId:event.id});
    await background(deliverRecommendationNotification(event,opts),opts);
    return json({ok:true,saved:true,eventId:event.id,duplicate:event.duplicate});
  }
  if(!path){requireMethod(request,'GET');const records=await repo.list(producer.id);return json({ok:true,records:records.map(safeRecord),producer});}
  if(path==='context'){requireMethod(request,'GET');return json({ok:true,draft:await contextDraft(url.searchParams.get('kind'),url.searchParams.get('id'),opts)});}
  if(path==='record'){requireMethod(request,'GET');const record=await owned(repo,url.searchParams.get('id'));await background(retryRecommendationNotifications(opts,record.id),opts);return json({ok:true,...await recordView(record,opts)});}
  requireMethod(request,'POST');const value=await body(request);
  if(path==='create') {
    if(!UUID.test(value.requestId || ''))fail(422,'request_id','Reload the editor and try again.');
    const settings=await templateRepository(opts.db,producer.id).settings();const draft=applyQuoteWorkflow(normalizeDraft(value.draft || newDraft()),settings.settings);
    if(draft.context.kind==='opportunity')await soloRepository(opts.db,soloIdentity(opts.env)).own(draft.context.id);
    const record=await repo.create(`rec_${value.requestId}`,producer.id,draft);
    if(draft.context.kind!=='direct' && draft.context.id && !record.appointment.googleEventId) {
      const listed=await opts.store.list({prefix:'callback-web-bookings/',limit:1000});const matches=[];
      for(const entry of listed.blobs || []) {const booking=await opts.store.get(entry.key);if(booking?.correlationId===draft.context.id && booking.status==='scheduled' && Date.parse(booking.scheduledStart)>Date.now())matches.push(booking);}
      if(matches.length===1)await linkExistingAppointment(record,matches[0].calendarUrl,opts);
    }
    await projectSoloDeskEventBestEffort(opts,{kind:'recommendation',recommendationId:record.id});
    return json({ok:true,...await recordView(await repo.get(record.id),opts)},201);
  }
  const record=await owned(repo,value.id);
  if(path==='save') {
    const settings=await templateRepository(opts.db,producer.id).settings();const draft=applyQuoteWorkflow(normalizeDraft(value.draft),settings.settings);
    const saved=await repo.save(record.id,Number(value.version),draft);
    if(!saved)fail(409,'edit_conflict','This recommendation changed in another tab. Reload the saved version before making further changes.');
    await projectSoloDeskEventBestEffort(opts,{kind:'recommendation',recommendationId:record.id});
    return json({ok:true,...await recordView(saved,opts)});
  }
  if(path==='approve') {
    if(Number(value.version)!==record.edit_version)fail(409,'edit_conflict','Save or reload the latest draft before approving.');
    const documents=await repo.documents(record.id),issues=approvalIssues(record.draft,documents);
    if(record.draft.nextAction==='appointment' && (!record.appointment.googleEventId || record.appointment.status!=='scheduled' || Date.parse(record.appointment.end || record.appointment.start)<=Date.now()))issues.push('Link the existing appointment, or select a different next step.');
    if(issues.length)return json({ok:false,error:{code:'approval',message:issues.join(' ')},issues},422);
    const payload=await attachProtectionPresets(clientProjection(record.draft,documents,producer),opts.db,producer.id),revision=record.current_revision+1;
    const token=await shareToken(record.id,revision,env),expiresAt=new Date(Date.now()+30*86400000).toISOString();
    const saved=await repo.approve(record,payload,await hash(token),expiresAt);
    if(!saved)fail(409,'edit_conflict','The draft changed. Reload before approving.');
    await projectSoloDeskEventBestEffort(opts,{kind:'recommendation',recommendationId:record.id});
    return json({ok:true,...await recordView(await repo.get(record.id),opts)});
  }
  if(path==='revoke'){await repo.revoke(record.id,Number(value.revision));return json({ok:true});}
  if(path==='sent') {
    if(!record.current_revision)fail(422,'not_prepared','Approve a recommendation before recording it as sent.');
    const at=value.sentAt || iso();if(!Number.isFinite(Date.parse(at)) || Date.parse(at)>Date.now()+60000)fail(422,'date','Choose a valid sent date.');
    if(Number(value.revision)!==record.current_revision)fail(409,'revision','Record the sent date for the current approved version.');
    await repo.setSent(record.id,new Date(at).toISOString(),record.current_revision);await projectSoloDeskEventBestEffort(opts,{kind:'closing',recommendationId:record.id});return json({ok:true,closing:await closingFlow(repo).view(await repo.get(record.id))});
  }
  if(path==='close-event') {
    if(!UUID.test(value.requestId || ''))fail(422,'request_id','Reload the recommendation before recording this closing step.');
    const closing=await closingFlow(repo).record(record,value);
    await projectSoloDeskEventBestEffort(opts,{kind:'closing',recommendationId:record.id});
    return json({ok:true,closing});
  }
  if(path==='outcome') {
    const kind=['open','bound','partial','declined_price','declined_coverage','deferred','unable_to_reach'].includes(value.kind)?value.kind:'';
    if(!kind)fail(422,'outcome','Choose a valid outcome.');
    const actualRevision=record.current_revision?await repo.revision(record.id,record.current_revision):null;
    const knownPolicies=(actualRevision?.payload.options || record.draft.options).flatMap(o=>o.policies.map(p=>p.id));
    const policyIds=Array.isArray(value.policyIds)?[...new Set(value.policyIds.map(id=>clean(id,80)))].slice(0,24):[];
    if(policyIds.some(id=>!knownPolicies.includes(id)))fail(422,'bound_policies','Select policies from the approved recommendation.');
    if(['bound','partial'].includes(kind) && !policyIds.length)fail(422,'bound_policies','Select the policies you actually bound.');
    await repo.setOutcome(record.id,{kind,policyIds,notes:clean(value.notes,1200),confirmedBy:producer.id,updatedAt:iso()});await projectSoloDeskEventBestEffort(opts,{kind:'closing',recommendationId:record.id});const updated=await repo.get(record.id);return json({ok:true,closing:await closingFlow(repo).view(updated),outcome:updated.outcome});
  }
  if(path==='retry-alerts')return json({ok:true,attempted:await retryRecommendationNotifications(opts,record.id)});
  if(path==='link-appointment'){const appointment=await linkExistingAppointment(record,value.url,opts);await projectSoloDeskEventBestEffort(opts,{kind:'recommendation',recommendationId:record.id});return json({ok:true,appointment});}
  if(path==='extract') {
    const all=await repo.documents(record.id),ids=Array.isArray(value.documentIds)?[...new Set(value.documentIds)]:[value.documentId];
    if(!ids.length||ids.length>6)fail(422,'documents','Choose one document or up to six related files.');
    const selected=ids.map(id=>all.find(d=>d.id===id));if(selected.some(d=>!d))fail(404,'document','A quote document is unavailable.');
    if(selected.some(d=>d.role==='current_policy'))fail(422,'evidence','Current-policy evidence cannot be extracted as a proposal.');
    if(selected.reduce((n,d)=>n+d.size,0)>24*1024*1024)fail(413,'size','Read at most 24 MB at once.');
    if(!opts.fileStore)fail(503,'storage','Document storage is unavailable.');
    const document=selected[0];let extraction;
    try{const documents=[];for(const d of selected){const object=await opts.fileStore.get(d.objectKey);if(!object)fail(404,'document','A quote document is unavailable.');documents.push({...d,bytes:new Uint8Array(await object.arrayBuffer())});}
      const templates=await templateRepository(opts.db,producer.id).active();extraction=await extractQuote(document,documents[0].bytes,env,opts.fetch,{documents,templates});}
    catch(error){extraction={state:'failed',message:clean(error.message,300),extractedAt:iso()};}
    await repo.updateDocument(document.id,record.id,{...document,extraction});return json({ok:true,extraction,documentId:document.id});
  }
  fail(404,'route','This action is unavailable.');
}
export async function recommendationRequest(context) {
  try {
    const env=await resolveProducerEnvironment(context.env || {});
    return await withD1RateLimit({...context,env},{route:`recommendations:${new URL(context.request.url).pathname.split('/').at(-1)}`,failClosed:new URL(context.request.url).pathname.includes('/device-'),limit:new URL(context.request.url).pathname.endsWith('/extract')||new URL(context.request.url).pathname.endsWith('/device-presets-check')?6:90,windowSeconds:60},()=>route(context,env));
  } catch(error) {
    if(!error.status) console.error('CoverageFit recommendation operation failed',error.name);
    return json({ok:false,error:{code:error.code || 'unavailable',message:error.status?error.message:'CoverageFit could not complete that request. Your last saved work is preserved. Please try again.'}},error.status || 503);
  }
}
