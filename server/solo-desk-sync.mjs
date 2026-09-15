import {clean,fail,pacificInputToISO} from '../assets/js/solo-desk-model.mjs';
import {digest,parse,stamp} from './solo-desk-repository.mjs';
import {projectOpportunityAttribution,refreshOpportunityMeasurement} from './acquisition-measurement.mjs';

export const STREAMS=['leads','consultations','recommendations','responses','closings','bookings','journeys'];
const safeDate=(value,fallback=stamp())=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():fallback;
const contactName=c=>clean(c?.name||[c?.firstName,c?.lastName].filter(Boolean).join(' '),160)||'Name not recorded';
const contact=c=>({name:contactName(c),email:clean(c?.email,200),mobile:clean(c?.mobile||c?.phone,40)});
const task=(title,dueAt,workType='outreach')=>({title,dueAt:safeDate(dueAt),workType});
const safeAppointment=a=>a?.googleEventId?{eventId:clean(a.googleEventId,200),start:safeDate(a.scheduledStart||a.start||a.proposedStart,''),end:safeDate(a.scheduledEnd||a.end||a.proposedEnd,''),status:clean(a.status,50),display:clean(a.scheduledDisplay||a.display||a.proposedDisplay,200)}:null;
const SALES_STAGE_RANK=Object.freeze({inquiry:1,discovery:2,quote_preparation:3,recommendation:4,decision:5,issuance_onboarding:6});
const LEAD_STAGE_TO_SALES=Object.freeze({started:'inquiry',snapshot_completed:'discovery',contact_requested:'discovery',home_profile_ready:'quote_preparation',policy_review_ready:'quote_preparation'});

export function sourceSync(repo){
  const {sql,rows,scope,db}=repo,{workspace,actor}=scope;
  const linked=async(kind,id)=>sql('SELECT opportunity_id FROM cf_solo_sources WHERE workspace_id=? AND kind=? AND source_id=?',workspace,kind,id).first();
  const legacy=async(table,key)=>{const row=await sql(`SELECT data_json FROM ${table} WHERE record_key=?`,key).first();return row?parse(row.data_json):null;};
  const leadRecordKey=async checkpointId=>`lead-ops/lead/${await digest(clean(checkpointId,120))}`;
  async function advanceSalesStage(op,target,sourceKey='source-stage'){
    if(!SALES_STAGE_RANK[target])return;
    const current=await sql('SELECT stage,status FROM cf_solo_opportunities WHERE workspace_id=? AND id=?',workspace,op).first();
    if(!current||current.status!=='open'||SALES_STAGE_RANK[target]<=Number(SALES_STAGE_RANK[current.stage]||0))return;
    const at=stamp(),request=`${sourceKey}:${at}`;
    await sql('UPDATE cf_solo_opportunities SET stage=?,edit_version=edit_version+1,last_mutation_id=?,updated_at=? WHERE workspace_id=? AND id=? AND status=\'open\' AND stage=?',target,request,at,workspace,op,current.stage).run();
  }
  async function link(kind,id,op,summary,at=stamp()){
    if(!id)return;
    const existing=await linked(kind,id);
    if(existing&&existing.opportunity_id!==op)fail(409,'source_conflict','An exact source is linked to a different opportunity. Keep both records for reconciliation; no records were merged.');
    await sql(`INSERT INTO cf_solo_sources(workspace_id,kind,source_id,opportunity_id,summary_json,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(workspace_id,kind,source_id) DO UPDATE SET summary_json=excluded.summary_json,updated_at=excluded.updated_at WHERE cf_solo_sources.opportunity_id=excluded.opportunity_id AND cf_solo_sources.updated_at<=excluded.updated_at`,workspace,kind,id,op,JSON.stringify(summary),at).run();
    if((await linked(kind,id))?.opportunity_id!==op)fail(409,'source_conflict','This source was linked elsewhere while syncing. Keep both records for reconciliation.');
  }
  async function ensure(kind,id,info,target=null){
    if(!id)fail(422,'source_id','A source record is missing its original identifier.');
    const existing=await linked(kind,id);
    if(existing){await link(kind,id,existing.opportunity_id,info.summary,info.updatedAt);await repo.ensureProfile?.(existing.opportunity_id);return existing.opportunity_id;}
    if(target){await repo.own(target);await link(kind,id,target,info.summary,info.updatedAt);await repo.ensureProfile?.(target);return target;}
    const hash=await digest(`${workspace}|${kind}|${id}`),op=`opp_src_${hash.slice(0,32)}`,at=stamp(),request=`source:${hash}`,closed=info.closed===true;
    await db.batch([
      sql(`INSERT OR IGNORE INTO cf_solo_opportunities(id,workspace_id,owner_id,contact_json,source,reason,products,deadline,stage,status,close_reason,last_mutation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,op,workspace,actor,JSON.stringify(info.contact),info.source,info.reason||'',info.products||'',info.deadline||'',info.stage||'inquiry',closed?'closed':'open',closed?'Imported closed source':'',request,info.createdAt||at,at),
      sql(`INSERT OR IGNORE INTO cf_solo_tasks(id,workspace_id,opportunity_id,assignee_id,work_type,title,due_at,source_key,created_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE ?=0 AND NOT EXISTS(SELECT 1 FROM cf_solo_sources WHERE workspace_id=? AND kind=? AND source_id=?)`,
        `task_src_${hash.slice(0,32)}`,workspace,op,actor,info.next.workType,info.next.title,info.next.dueAt,request,at,closed?1:0,workspace,kind,id),
      sql('INSERT OR IGNORE INTO cf_solo_sources(workspace_id,kind,source_id,opportunity_id,summary_json,updated_at) VALUES(?,?,?,?,?,?)',workspace,kind,id,op,JSON.stringify(info.summary),info.updatedAt||at),
      sql("INSERT OR IGNORE INTO cf_solo_activity(id,workspace_id,opportunity_id,actor_id,kind,request_id,fingerprint,payload_json,created_at) VALUES(?,?,?,'source-sync','linked',?,?,?,?)",`act_src_${hash.slice(0,32)}`,workspace,op,request,hash,JSON.stringify({source:info.source,kind,sourceId:id,note:'Original source linked. Existing client links and carrier outcomes were preserved.'}),at)
    ]);
    await repo.ensureProfile?.(op);
    return op;
  }
  async function lead(value){
    const permission=value.consent?.agencyContact||{};
    // The source's own operational identity rule remains authoritative.
    if(!(permission.granted||permission.basis))return null;
    const createdAt=safeDate(value.createdAt),updatedAt=safeDate(value.updatedAt);
    const op=await ensure('lead',value.checkpointId,{contact:contact(value.identity),source:clean(value.attribution?.sourceLabel||value.attribution?.sourceKey||'408FARMERS inquiry',120),reason:clean(value.context?.reviewContext||value.context?.reviewReason,600),products:clean(value.context?.reviewTrack,200),deadline:clean(value.context?.closingDate,10),createdAt,updatedAt,
      next:task('Review inquiry and choose the next action',createdAt),summary:{stage:value.stage,contactRequested:value.consent?.contactRequested===true,attribution:value.attribution,context:{reviewTrack:clean(value.context?.reviewTrack,40),reviewReason:clean(value.context?.reviewReason,60),reviewContext:clean(value.context?.reviewContext,120),propertyType:clean(value.context?.propertyType,40),currentCarrier:clean(value.context?.currentCarrier,60),renewalTiming:clean(value.context?.renewalTiming,40),autoVehicleCount:clean(value.context?.autoVehicleCount,20),housing:clean(value.context?.housing,40),unitWaterShutoff:clean(value.context?.unitWaterShutoff,40),automaticWaterShutoffDevice:clean(value.context?.automaticWaterShutoffDevice,40),waterShutoffWillingness:clean(value.context?.waterShutoffWillingness,40),waterShutoffEvidenceStatus:clean(value.context?.waterShutoffEvidenceStatus,40),closingDate:clean(value.context?.closingDate,40),fivSignalVersion:clean(value.context?.fivSignalVersion,80)},permission:{basis:clean(permission.basis,200),callPermitted:permission.callPermitted===true,personalTextPermitted:permission.personalTextPermitted===true,emailPermitted:permission.emailPermitted===true},crm:{state:clean(value.crm?.state,40),reason:clean(value.crm?.reason,240)},notification:'See acquisition delivery status',appointment:safeAppointment(value.context?.appointment)}});
    const target=LEAD_STAGE_TO_SALES[clean(value.stage,40)]||'';
    if(op&&target)await advanceSalesStage(op,target,`lead-stage:${clean(value.checkpointId,120)}:${clean(value.stage,40)}`);
    if(op&&value.stage==='contact_requested')await signal(op,`lead-contact:${clean(value.checkpointId,120)}`,task('Respond to requested contact',updatedAt,'advice_closing'),{note:'Customer explicitly requested producer contact.',stage:value.stage,checkpointId:value.checkpointId},70);
    if(op&&value.stage==='home_profile_ready')await signal(op,`lead-home-ready:${clean(value.checkpointId,120)}`,task('Review Home Profile and prepare the recommendation',updatedAt,'advice_closing'),{note:'Home Profile is ready for producer review.',stage:value.stage,checkpointId:value.checkpointId},55);
    if(op&&value.stage==='policy_review_ready')await signal(op,`lead-policy-ready:${clean(value.checkpointId,120)}`,task('Review current policy and prepare the recommendation',updatedAt,'advice_closing'),{note:'Current policy review is ready for producer review.',stage:value.stage,checkpointId:value.checkpointId},60);
    if(op){try{await projectOpportunityAttribution(repo,op,{attribution:value.attribution||{},source:value.attribution?.sourceLabel||value.attribution?.sourceKey||'408FARMERS inquiry',updatedAt,basis:'lead_source'});await refreshOpportunityMeasurement(repo,op);}catch(error){if(!/no such table/i.test(String(error?.message||'')))throw error;}}
    return op;
  }
  async function consultation(value){
    const follow=value.followUp||{},createdAt=safeDate(value.createdAt),updatedAt=safeDate(value.updatedAt);
    let due=createdAt;if(follow.state==='scheduled'&&/^\d{4}-\d{2}-\d{2}$/.test(follow.dueDate||''))due=pacificInputToISO(`${follow.dueDate}T09:00`);
    return ensure('consultation',value.id,{contact:contact(value.customer),source:clean(value.integration?.source||'CoverageFit consultation',120),reason:clean(value.customer?.reviewContext||value.report?.prospectProfile?.reviewContext||value.assessment?.topPriority,600),products:clean(value.product,200),createdAt,updatedAt,closed:value.disposition?.stage==='closed',stage:({review_received:'inquiry',contact_attempted:'discovery',consultation_scheduled:'discovery',consultation_completed:'quote_preparation',proposal_prepared:'recommendation',decision_pending:'decision'})[value.disposition?.stage]||'inquiry',next:task(follow.state==='scheduled'?clean(follow.note,240)||'Follow up on consultation':'Review consultation and set next action',due,'advice_closing'),summary:{stage:value.disposition?.stage,outcome:value.disposition?.outcome,followUp:follow,notification:{state:clean(value.notification?.state,40)},attribution:value.integration}});
  }
  async function anchor(kind,id){
    if(!id)return null;
    if(kind==='opportunity'){await repo.own(id);return id;}
    const existing=await linked(kind,id);if(existing)return existing.opportunity_id;
    if(kind==='lead'){const key=await leadRecordKey(id),value=key?await legacy('pvx_records',key):null;return value?lead(value):null;}
    if(kind==='consultation'){const value=await legacy('consultation_records',`records/${id}`);return value?consultation(value):null;}
    if(kind==='recommendation'){const value=await sql('SELECT * FROM cf_recommendations WHERE id=? AND owner_id=?',id,actor).first();return value?recommendation(value):null;}
    return null;
  }
  async function recommendation(value){
    const draft=parse(value.draft_json),appointment=safeAppointment(parse(value.appointment_json)),outcome=parse(value.outcome_json);
    const target=await anchor(draft.context?.kind,draft.context?.id)||(appointment?(await linked('calendar',appointment.eventId))?.opportunity_id:null);
    const op=await ensure('recommendation',value.id,{contact:contact(draft.contact),source:'CoverageFit recommendation',reason:clean(draft.priority,600),products:(draft.options||[]).flatMap(o=>o.policies||[]).map(p=>clean(p.product,60)).filter(Boolean).slice(0,8).join(', '),stage:'recommendation',createdAt:value.created_at,updatedAt:value.updated_at,next:task('Review recommendation and choose the next action',value.created_at,'advice_closing'),summary:{revision:value.current_revision,sentAt:value.sent_at,outcome,appointment,context:draft.context}},target);
    if(appointment)await appointmentTask(op,appointment,`recommendation:${value.id}`);
    return op;
  }
  async function signal(op,key,next,summary,priority=0){
    const hash=await digest(`${workspace}|${key}`),id=`task_signal_${hash.slice(0,32)}`,at=stamp(),request=`signal:${hash}`;
    // D1 batch is atomic. The marker makes source replay a no-op, including after wrap completion.
    await db.batch([
      sql(`UPDATE cf_solo_opportunities SET edit_version=edit_version+1,last_mutation_id=?,updated_at=? WHERE id=? AND workspace_id=? AND NOT EXISTS(SELECT 1 FROM cf_solo_tasks WHERE workspace_id=? AND source_key=?)`,request,at,op,workspace,workspace,key),
      sql(`INSERT OR IGNORE INTO cf_solo_tasks(id,workspace_id,opportunity_id,assignee_id,work_type,title,due_at,priority,source_key,created_at) SELECT ?,?,?,?,?,?,?,?,?,? FROM cf_solo_opportunities WHERE id=? AND workspace_id=?`,id,workspace,op,actor,next.workType,next.title,next.dueAt,priority,key,at,op,workspace),
      sql("INSERT OR IGNORE INTO cf_solo_activity(id,workspace_id,opportunity_id,actor_id,kind,request_id,fingerprint,payload_json,created_at) VALUES(?,?,?,'source-sync','signal',?,?,?,?)",`act_signal_${hash.slice(0,32)}`,workspace,op,request,hash,JSON.stringify(summary),at)
    ]);
  }
  async function appointmentTask(op,a,source){
    await link('calendar',a.eventId,op,{...a,source});
    const key=`appointment:${a.eventId}`;
    if(a.status==='scheduled'&&a.start){
      await signal(op,key,task('Prepare for scheduled conversation',a.start,'advice_closing'),{note:'Saved booking linked; confirm changes in the existing booking view.',appointment:a},20);
      await updateAppointment(op,key,a);
    }else if(['cancelled','canceled'].includes(a.status)){
      await updateAppointment(op,key,a);
    }
  }
  async function updateAppointment(op,key,a){
    const current=await sql("SELECT * FROM cf_solo_tasks WHERE workspace_id=? AND opportunity_id=? AND source_key=? AND state IN ('open','waiting','in_progress')",workspace,op,key).first();
    const cancelled=['cancelled','canceled'].includes(a.status);if(!current||(!cancelled&&current.due_at===a.start))return;
    const request=`booking-update:${crypto.randomUUID()}`,at=stamp();
    const gate='EXISTS(SELECT 1 FROM cf_solo_opportunities WHERE id=? AND workspace_id=? AND last_mutation_id=?)';
    await db.batch([
      sql("UPDATE cf_solo_opportunities SET edit_version=edit_version+1,last_mutation_id=?,updated_at=? WHERE id=? AND workspace_id=? AND EXISTS(SELECT 1 FROM cf_solo_tasks WHERE id=? AND state IN ('open','waiting','in_progress') AND due_at=?)",request,at,op,workspace,current.id,current.due_at),
      sql(`UPDATE cf_solo_tasks SET due_at=?,state=?,completed_at=? WHERE id=? AND workspace_id=? AND state IN ('open','waiting','in_progress') AND ${gate}`,cancelled?current.due_at:a.start,cancelled?'cancelled':current.state,cancelled?at:null,current.id,workspace,op,workspace,request),
      sql(`INSERT INTO cf_solo_activity(id,workspace_id,opportunity_id,actor_id,kind,request_id,fingerprint,payload_json,created_at) SELECT ?,?,?,'source-sync','appointment',?,?,?,? WHERE ${gate}`,request,workspace,op,request,request,JSON.stringify({note:cancelled?'Saved appointment cancelled.':'Saved appointment time changed.',appointment:a}),at,op,workspace,request)
    ]);
  }
  async function response(value){
    const op=await anchor('recommendation',value.recommendation_id);if(!op)return;
    const payload=parse(value.payload_json);
    const device=value.kind==='device_update';
    const title=value.kind==='proceed'?'Respond to client request to proceed':value.kind==='question'?'Answer client question':device?'Review protection update':'Review client response';
    const priority=value.kind==='proceed'?100:value.kind==='question'?90:device?75:70;
    await signal(op,`response:${value.id}`,task(title,value.created_at,device?'quoting_service':'advice_closing'),{note:title,kind:value.kind,message:clean(payload.message,1600),recommendationId:value.recommendation_id,revision:value.revision,optionId:clean(payload.optionId,120),policyId:clean(payload.policyId,120),taskId:clean(payload.taskId,120),notificationState:value.notification_state||'unknown'},priority);
    await link('response',value.id,op,{kind:value.kind,message:clean(payload.message,1600),revision:value.revision,recommendationId:value.recommendation_id,optionId:clean(payload.optionId,120),policyId:clean(payload.policyId,120),taskId:clean(payload.taskId,120),notificationState:value.notification_state||'unknown'},stamp());
    return op;
  }
  async function closing(value){
    const op=await anchor('recommendation',value.id);if(!op)return false;
    let rows=[];try{rows=await repo.rows('SELECT kind,payload_json,created_at FROM cf_close_events WHERE recommendation_id=? ORDER BY created_at,id',value.id);}catch(error){if(/no such table/i.test(String(error?.message||'')))return op;throw error;}
    const events=rows.map(r=>({kind:r.kind,payload:parse(r.payload_json),createdAt:r.created_at})),latest=kind=>[...events].reverse().find(e=>e.kind===kind),delivery=events.find(e=>e.kind==='recommendation_delivered'),ask=events.find(e=>e.kind==='close_ask'),decision=latest('customer_decision'),prep=latest('bind_prep');
    const summary={recommendationId:value.id,revision:value.current_revision,deliveredAt:value.sent_at||delivery?.createdAt||null,closeAskedAt:ask?.createdAt||null,decision:decision?.payload?.decision||'',decisionAt:decision?.createdAt||null,decisionDetail:decision?.payload||{},bindPrep:prep?{state:prep.payload.state,at:prep.createdAt}:null,outcome:parse(value.outcome_json)};
    await link('close',value.id,op,summary,stamp());
    if(decision?.payload?.decision==='proceed'){
      await repo.sql("UPDATE cf_solo_tasks SET state='completed',completed_at=? WHERE workspace_id=? AND opportunity_id=? AND state IN ('open','waiting','in_progress') AND title='Respond to client request to proceed'",stamp(),workspace,op).run();
      if(prep?.payload?.state==='ready_for_bind_confirmation'){
        await repo.sql("UPDATE cf_solo_tasks SET state='completed',completed_at=? WHERE workspace_id=? AND opportunity_id=? AND state IN ('open','waiting','in_progress') AND title='Complete bind preparation'",stamp(),workspace,op).run();
        await signal(op,`closing:${value.id}:bind-ready:${prep.createdAt}`,task('Confirm carrier bind outcome',prep.createdAt,'advice_closing'),{note:'Bind preparation is ready. Record bound only after the carrier actually confirms coverage.',...summary},96);
      }else await signal(op,`closing:${value.id}:decision:${decision.createdAt}`,task('Complete bind preparation',decision.createdAt,'advice_closing'),{note:'Producer recorded customer decision to proceed. Carrier binding remains separate.',...summary},98);
    }else if(decision?.payload?.decision==='deferred'){
      await signal(op,`closing:${value.id}:deferred:${decision.createdAt}`,task('Return at the agreed follow-up',decision.payload.followUpAt||decision.createdAt,'advice_closing'),{note:'Customer decision was deferred. Preserve the context and return at the agreed time.',...summary},60);
    }else if(decision?.payload?.decision==='not_ready'){
      await signal(op,`closing:${value.id}:not-ready:${decision.createdAt}`,task('Set the next decision follow-up',decision.createdAt,'advice_closing'),{note:'Customer is not ready yet. Record a concrete follow-up rather than restarting discovery.',...summary},65);
    }else if(['declined_price','declined_coverage','other'].includes(decision?.payload?.decision)){
      await signal(op,`closing:${value.id}:decision:${decision.createdAt}`,task('Record the actual sales outcome',decision.createdAt,'advice_closing'),{note:'A customer decision was recorded. Confirm the durable outcome or next action.',...summary},80);
    }else if(ask&&!decision)await signal(op,`closing:${value.id}:ask:${ask.createdAt}`,task('Follow up on the insurance decision',ask.createdAt,'advice_closing'),{note:'Explicit close ask recorded; customer decision remains open.',...summary},85);
    return op;
  }
  async function booking(value){
    const id=value.correlationId;let op=await anchor('recommendation',id)||await anchor('lead',id);
    if(!op)return false;const a=safeAppointment(value);if(a)await appointmentTask(op,a,`booking:${value.requestId||id}`);return op;
  }
  async function journey(value,recordKey){
    const a=value.attribution||{};
    // Web journeys are stored under a token hash, not under their public journey ID.
    const webRow=a.webJourneyId?await sql("SELECT data_json FROM pvx_records WHERE record_key LIKE 'pvx/web-journey/%' AND json_extract(data_json,'$.journeyId')=? LIMIT 1",a.webJourneyId).first():null;
    const web=webRow?parse(webRow.data_json):null;
    const id=a.leadCheckpointId||web?.seed?.contact?.leadCheckpointId;const op=id?await anchor('lead',id):null;
    // Unlinked SMS journeys remain in the original inbox; never merge by phone.
    if(!op)return false;
    await link('pvx',value.checkpointId||value.id||recordKey,op,{stage:clean(value.currentStage,80),recordKey});
    if(a.webJourneyId)await link('web',a.webJourneyId,op,{stage:clean(web?.currentStage,80)});
    if(a.smsConversationId)await link('sms',a.smsConversationId,op,{journeyId:clean(a.smsJourneyId,160)});
    return op;
  }
  const configs={
    leads:{table:'pvx_records',key:'record_key',where:"record_key LIKE 'lead-ops/lead/%'",apply:r=>lead(parse(r.data_json))},
    consultations:{table:'consultation_records',key:'record_key',where:"record_key LIKE 'records/%'",apply:r=>consultation(parse(r.data_json))},
    recommendations:{table:'cf_recommendations',key:'id',where:'owner_id=?',args:[actor],apply:recommendation},
    responses:{table:'cf_recommendation_events e JOIN cf_recommendations r ON r.id=e.recommendation_id LEFT JOIN cf_recommendation_outbox n ON n.event_id=e.id',key:'e.id',time:'e.created_at',select:'e.*,n.state AS notification_state',where:"r.owner_id=? AND e.kind IN ('proceed','question','item','device_update')",args:[actor],apply:response},
    closings:{table:'cf_recommendations',key:'id',where:'owner_id=?',args:[actor],apply:closing},
    bookings:{table:'sms_conversations',key:'record_key',where:"record_key LIKE 'callback-web-bookings/%'",apply:r=>booking(parse(r.data_json))},
    journeys:{table:'pvx_records',key:'record_key',where:"record_key LIKE 'pvx/checkpoint/%'",apply:r=>journey(parse(r.data_json),r.record_key)}
  };
  return {anchor,link,projectLead:lead,projectRecommendation:recommendation,projectResponse:response,projectClosing:closing,projectBooking:booking,projectJourney:journey,async sync(stream){
    if(workspace!=='virginia-tam:dylan-haysbert')fail(409,'workspace_transition','Importing legacy records into a different agency workspace requires a reviewed transition mapping.');
    const c=configs[stream];if(!c)fail(422,'stream','Choose a supported source.');
    const saved=await sql('SELECT cursor_json FROM cf_solo_sync WHERE workspace_id=? AND stream=?',workspace,stream).first(),prior=saved?.cursor_json;
    const cursor=parse(prior),until=cursor.until||stamp(),after=cursor.after||'',key=cursor.key||'',time=c.time||'updated_at';
    const found=await rows(`SELECT ${c.select||'*'} FROM ${c.table} WHERE ${c.where} AND (${time}>? OR (${time}=? AND ${c.key}>?)) AND ${time}<=? ORDER BY ${time},${c.key} LIMIT 11`,...(c.args||[]),after,after,key,until);
    let skipped=0;for(const row of found.slice(0,10)){const result=await c.apply(row);if(result===false||result===null)skipped++;else if(typeof result==='string')await repo.refreshPossessionQuality?.(result);}
    const more=found.length>10,last=found[Math.min(found.length,10)-1];
    // A short overlap catches source writes that finish near the sync boundary.
    const next=more?{after:last[time.split('.').at(-1)],key:last[c.key.split('.').at(-1)],until}:{after:new Date(Date.parse(until)-120000).toISOString(),key:'',lastCompletedAt:until};
    await sql(`INSERT INTO cf_solo_sync(workspace_id,stream,cursor_json) VALUES(?,?,?) ON CONFLICT(workspace_id,stream) DO UPDATE SET cursor_json=excluded.cursor_json WHERE cf_solo_sync.cursor_json=?`,workspace,stream,JSON.stringify(next),prior||'').run();
    return {stream,processed:Math.min(found.length,10),skipped,hasMore:more,lastCompletedAt:next.lastCompletedAt||null};
  }};
}
