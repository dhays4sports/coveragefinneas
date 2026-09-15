import {authorizeProducer} from './consultation-inbox-core.mjs';
import {randomUUID} from './runtime-crypto.mjs';
import {normalizeOutreachRecord,fallbackOutreachAnalysis,OUTREACH_PREFIX} from './displacement-outreach-core.mjs';

export const DISCOVERY_BUILD='CF-DISP-DISCOVERY-1.0';
export const DISCOVERY_PREFIX='outreach/discovery/';
export const DISCOVERY_PROVIDER='brave_search';
export const DEFAULT_MONTHLY_REQUEST_LIMIT=900;
export const DEFAULT_RESULTS_PER_QUERY=8;
export const DEFAULT_SWEEPS_PER_DAY=3;

export const DISCOVERY_QUERY_PACK=Object.freeze([
  {id:'reddit-safeco-liberty',label:'Reddit · Safeco / Liberty nonrenewal',kind:'discussion',channel:'reddit',freshness:'pw',location:'California',query:'site:reddit.com ("Safeco" OR "Liberty Mutual") (nonrenewal OR "not renewing" OR dropped) California insurance'},
  {id:'reddit-home-nonrenewal',label:'Reddit · California home nonrenewal',kind:'discussion',channel:'reddit',freshness:'pw',location:'California',query:'site:reddit.com "home insurance" (nonrenewal OR "not renewing" OR "dropped") California'},
  {id:'reddit-condo-nonrenewal',label:'Reddit · California condo nonrenewal',kind:'discussion',channel:'reddit',freshness:'pm',location:'California',query:'site:reddit.com condo insurance (nonrenewal OR "not renewing" OR dropped) California'},
  {id:'nextdoor-indexed',label:'Nextdoor · publicly indexed displacement',kind:'discussion',channel:'nextdoor',freshness:'pm',location:'California',query:'site:nextdoor.com ("Safeco" OR "Liberty Mutual" OR "home insurance") (nonrenewal OR dropped OR "not renewing") California'},
  {id:'facebook-indexed',label:'Facebook groups · publicly indexed displacement',kind:'discussion',channel:'facebook',freshness:'pm',location:'California',query:'site:facebook.com/groups ("Safeco" OR "Liberty Mutual" OR "home insurance") (nonrenewal OR dropped OR "not renewing") California'},
  {id:'public-web-displacement',label:'Public web · Safeco / Liberty displacement',kind:'discussion',channel:'public_web',freshness:'pw',location:'California',query:'("Safeco" OR "Liberty Mutual") (nonrenewal OR "not renewing") California homeowners insurance'},
  {id:'south-bay-hoa-management',label:'South Bay · HOA / property management prospects',kind:'relationship',channel:'property_manager',freshness:'',location:'South Bay, CA',maxAdds:3,query:'("HOA management" OR "community association management" OR "condo property management") ("San Jose" OR "Santa Clara County") California'},
  {id:'south-bay-condo-realtors',label:'South Bay · condo Realtor prospects',kind:'relationship',channel:'realtor',freshness:'',location:'South Bay, CA',maxAdds:3,query:'("condo realtor" OR "condominium realtor") ("San Jose" OR "Santa Clara") California'}
]);

const text=(v,m=7000)=>String(v??'').trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,m);
const cleanLine=(v,m=240)=>text(v,m).replace(/[<>]/g,'');
const integer=(v,min,max,fallback)=>{const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback};
function json(body,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store, max-age=0','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}})}
function error(status,code,message){return json({ok:false,error:{code,message}},status)}
function sameOrigin(request){const origin=text(request.headers.get('origin'),400);if(!origin)return false;try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}}
function monthKey(date=new Date()){return date.toISOString().slice(0,7)}
function safeUrl(value){const raw=text(value,1800);if(!raw)return'';try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return'';u.username='';u.password='';u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid','gbraid','wbraid','ref','ref_','source'].includes(key.toLowerCase()))u.searchParams.delete(key);u.hostname=u.hostname.toLowerCase().replace(/^www\./,'');if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,'');return u.toString().slice(0,1800)}catch{return''}}
async function hashText(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')}
function parseDate(value){const raw=text(value,100);if(!raw)return'';const d=new Date(raw);return Number.isNaN(d.getTime())?'':d.toISOString()}
function flattenSnippet(item={}){const parts=[item.description,item.snippet,item.text];if(Array.isArray(item.extra_snippets))parts.push(...item.extra_snippets);return text(parts.filter(Boolean).join('\n'),3500)}
function extractSearchResults(body={}){
  const rows=[];const add=(items,group)=>{if(!Array.isArray(items))return;items.forEach((item,index)=>{const url=safeUrl(item?.url||item?.profile?.url||item?.source?.url);if(!url)return;rows.push({group,rank:index+1,url,title:cleanLine(item?.title||item?.name||item?.profile?.name||'Untitled result',300),description:flattenSnippet(item),publishedAt:parseDate(item?.page_age||item?.age||item?.published_date||item?.date)})})};
  add(body?.web?.results,'web');add(body?.discussions?.results,'discussions');add(body?.news?.results,'news');
  const seen=new Set();return rows.filter(r=>{if(seen.has(r.url))return false;seen.add(r.url);return true})
}
function maxAddsFor(query){return integer(query?.maxAdds,1,10,query?.kind==='relationship'?3:5)}
function resultLimit(env){return integer(env?.COVERAGEFIT_DISCOVERY_RESULT_LIMIT,4,20,DEFAULT_RESULTS_PER_QUERY)}
function monthlyLimit(env){return integer(env?.COVERAGEFIT_DISCOVERY_MONTHLY_REQUEST_LIMIT,50,1000,DEFAULT_MONTHLY_REQUEST_LIMIT)}
function activeQueries(env){const max=integer(env?.COVERAGEFIT_DISCOVERY_QUERIES_PER_SWEEP,1,DISCOVERY_QUERY_PACK.length,DISCOVERY_QUERY_PACK.length);return DISCOVERY_QUERY_PACK.slice(0,max)}
function relationshipLooksUseful(result,query){const hay=`${result.title} ${result.description}`.toLowerCase();if(query.channel==='realtor')return /realtor|real estate|condo|condominium/.test(hay);return /hoa|homeowners association|community association|property management|property manager|condo|condominium/.test(hay)}
function discoveryRecord(result,query,now){return normalizeOutreachRecord({id:'opp_auto-placeholder',kind:query.kind,channel:query.channel,sourceUrl:result.url,sourceTitle:result.title,sourceContext:result.description||`${query.label} search result`,location:query.location,postedAt:result.publishedAt,discovery:{mode:'automatic',provider:DISCOVERY_PROVIDER,queryId:query.id,queryLabel:query.label,query:query.query,discoveredAt:now.toISOString(),resultRank:result.rank,publicIndexedOnly:true},privacy:{publicContextOnly:true}} ,now)}
async function braveSearch(query,{env,fetchFn=fetch}={}){
  const key=text(env?.BRAVE_SEARCH_API_KEY,300);if(!key)throw new Error('BRAVE_SEARCH_API_KEY is not configured.');
  const u=new URL('https://api.search.brave.com/res/v1/web/search');u.searchParams.set('q',query.query);u.searchParams.set('country','US');u.searchParams.set('search_lang','en');u.searchParams.set('ui_lang','en-US');u.searchParams.set('count',String(resultLimit(env)));if(query.freshness)u.searchParams.set('freshness',query.freshness);u.searchParams.set('safesearch','moderate');u.searchParams.set('spellcheck','true');
  const response=await fetchFn(u.toString(),{headers:{Accept:'application/json','Accept-Encoding':'gzip','X-Subscription-Token':key}});const body=await response.json().catch(()=>null);if(!response.ok){const err=new Error(body?.message||body?.error?.message||`Brave Search request failed (${response.status})`);err.status=response.status;throw err}return{body,results:extractSearchResults(body)}
}
async function usageState(store,env,now){const key=`${DISCOVERY_PREFIX}usage/${monthKey(now)}`;const existing=await store.get(key);const limit=monthlyLimit(env);return{key,month:monthKey(now),requests:integer(existing?.requests,0,100000,0),limit,updatedAt:existing?.updatedAt||'',provider:DISCOVERY_PROVIDER}}
async function saveUsage(store,usage,now){const value={...usage,remaining:Math.max(0,usage.limit-usage.requests),updatedAt:now.toISOString()};await store.setJSON(usage.key,value,{metadata:{updatedAt:value.updatedAt,month:value.month,requests:value.requests}});return value}
async function saveRun(store,run){const key=`${DISCOVERY_PREFIX}runs/${run.startedAt.replace(/[:.]/g,'-')}-${run.id}`;await store.setJSON(key,run,{metadata:{createdAt:run.startedAt,updatedAt:run.completedAt,status:run.status,added:run.added,requests:run.apiRequests}})}
export async function getDiscoveryStatus({env={},store,now=new Date()}={}){if(!store?.get||!store?.list)throw new TypeError('Discovery storage is unavailable.');const usage=await usageState(store,env,now);const listed=await store.list({prefix:`${DISCOVERY_PREFIX}runs/`,limit:10});const runs=(await Promise.all((listed.blobs||[]).map(item=>store.get(item.key)))).filter(Boolean).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).slice(0,10);return{build:DISCOVERY_BUILD,provider:DISCOVERY_PROVIDER,configured:Boolean(text(env?.BRAVE_SEARCH_API_KEY,300)),schedule:{recommendedSweepsPerDay:DEFAULT_SWEEPS_PER_DAY,cronUtc:['15 15 * * *','15 20 * * *','15 1 * * *'],publicIndexedOnly:true,humanApprovalRequired:true},usage:{month:usage.month,requests:usage.requests,limit:usage.limit,remaining:Math.max(0,usage.limit-usage.requests)},queries:activeQueries(env).map(q=>({id:q.id,label:q.label,kind:q.kind,channel:q.channel,freshness:q.freshness})),lastRun:runs[0]||null,runs}}
export async function runDiscoveryCycle({env={},store,fetchFn=fetch,mode='scheduled',now=new Date()}={}){
  if(!store?.get||!store?.setJSON||!store?.list)throw new TypeError('Discovery storage is unavailable.');if(!text(env?.BRAVE_SEARCH_API_KEY,300))return{ok:false,build:DISCOVERY_BUILD,error:{code:'brave_not_configured',message:'BRAVE_SEARCH_API_KEY is not configured.'}};
  let usage=await usageState(store,env,now);const run={id:randomUUID(),build:DISCOVERY_BUILD,provider:DISCOVERY_PROVIDER,mode,startedAt:now.toISOString(),completedAt:'',status:'running',apiRequests:0,queriesAttempted:0,resultsSeen:0,added:0,duplicates:0,filtered:0,errors:0,budgetStopped:false,queryResults:[]};
  for(const query of activeQueries(env)){
    if(usage.requests>=usage.limit){run.budgetStopped=true;break}
    const qr={id:query.id,label:query.label,kind:query.kind,channel:query.channel,requestMade:false,resultsSeen:0,added:0,duplicates:0,filtered:0,error:''};run.queriesAttempted++;
    try{
      usage.requests++;run.apiRequests++;qr.requestMade=true;const found=await braveSearch(query,{env,fetchFn});const results=found.results.slice(0,resultLimit(env));qr.resultsSeen=results.length;run.resultsSeen+=results.length;let addedForQuery=0;
      for(const result of results){
        if(addedForQuery>=maxAddsFor(query))break;const canonical=safeUrl(result.url);if(!canonical){qr.filtered++;run.filtered++;continue}const hash=await hashText(canonical);const id=`opp_auto-${hash.slice(0,32)}`;const existing=await store.get(`${OUTREACH_PREFIX}${id}`);if(existing){qr.duplicates++;run.duplicates++;continue}
        let base=discoveryRecord(result,query,now);base={...base,id,sourceUrl:canonical,coverageFitUrl:''};const analysis=fallbackOutreachAnalysis(base);
        if(query.kind==='relationship'&&!relationshipLooksUseful(result,query)){qr.filtered++;run.filtered++;continue}
        if(query.kind==='discussion'&&analysis.relevanceScore<38){qr.filtered++;run.filtered++;continue}
        const record=normalizeOutreachRecord({...base,relevanceScore:analysis.relevanceScore,recommendation:analysis.recommendation,analysisSummary:analysis.analysisSummary,reasoning:analysis.reasoning,carrier:analysis.carrier||base.carrier,propertyType:analysis.propertyType||base.propertyType,tags:analysis.tags,drafts:{...base.drafts,...analysis.drafts},status:'drafted'},now);
        await store.setJSON(`${OUTREACH_PREFIX}${id}`,record,{metadata:{createdAt:record.createdAt,updatedAt:record.updatedAt,channel:record.channel,status:record.status,discovery:'automatic',queryId:query.id}});qr.added++;run.added++;addedForQuery++
      }
    }catch(cause){qr.error=cleanLine(cause?.message||cause,500);run.errors++}
    run.queryResults.push(qr);usage=await saveUsage(store,usage,new Date())
  }
  run.completedAt=new Date().toISOString();run.status=run.errors&&run.added===0?'completed_with_errors':'completed';run.monthlyUsage={month:usage.month,requests:usage.requests,limit:usage.limit,remaining:Math.max(0,usage.limit-usage.requests)};await saveUsage(store,usage,new Date());await saveRun(store,run);return{ok:true,...run}
}
export async function handleOutreachDiscovery(request,{env={},store,fetchFn=fetch}={}){const auth=authorizeProducer(request,env);if(!auth.ok)return auth.response;if(!store?.get||!store?.setJSON||!store?.list)return error(503,'storage_unavailable','Discovery storage is unavailable.');if(request.method==='GET'){const status=await getDiscoveryStatus({env,store});return json({ok:true,...status})}if(request.method!=='POST')return error(405,'method_not_allowed','GET or POST is required.');if(!sameOrigin(request))return error(403,'origin_rejected','Discovery runs can only be started from this CoverageFit site.');const result=await runDiscoveryCycle({env,store,fetchFn,mode:'manual'});return result.ok?json(result):error(503,result.error?.code||'discovery_failed',result.error?.message||'Discovery could not run.')}
