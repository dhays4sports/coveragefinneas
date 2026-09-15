import {identity,soloRepository,digest,parse} from './solo-desk-repository.mjs';
import {sourceSync} from './solo-desk-sync.mjs';
import {refreshAcquisitionState} from './acquisition-measurement.mjs';

export const SOLO_DESK_EVENT_PROJECTION_BUILD='CF-CLOSE-1.0';

const clean=(value,max=160)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);

async function ready(options={}){
  const db=options.db||options.env?.COVERAGEFIT_DB;
  if(!db?.prepare)return {ok:false,state:'storage_unavailable'};
  const repo=soloRepository(db,identity(options.env||{}));
  try{await repo.ready();}catch{return {ok:false,state:'solo_desk_setup_required'};}
  return {ok:true,repo,sync:sourceSync(repo)};
}

async function leadRecord(repo,checkpointId){
  const id=clean(checkpointId,120);if(!id)return null;
  const key=`lead-ops/lead/${await digest(id)}`;
  const row=await repo.sql('SELECT data_json FROM pvx_records WHERE record_key=?',key).first();
  return row?parse(row.data_json):null;
}

async function bookingRecord(repo,requestId){
  const id=clean(requestId,64).toLowerCase();if(!id)return null;
  const row=await repo.sql('SELECT data_json FROM sms_conversations WHERE record_key=?',`callback-web-bookings/${id}`).first();
  return row?parse(row.data_json):null;
}

async function journeyRecord(repo,recordKey){
  const key=clean(recordKey,200);if(!key)return null;
  const row=await repo.sql('SELECT data_json FROM pvx_records WHERE record_key=?',key).first();
  return row?parse(row.data_json):null;
}

async function recommendationRecord(repo,id){
  const recommendationId=clean(id,120);if(!recommendationId)return null;
  return repo.sql('SELECT * FROM cf_recommendations WHERE id=? AND owner_id=?',recommendationId,repo.scope.actor).first();
}

async function responseRecord(repo,id){
  const eventId=clean(id,160);if(!eventId)return null;
  return repo.sql(`SELECT e.*,n.state AS notification_state
    FROM cf_recommendation_events e JOIN cf_recommendations r ON r.id=e.recommendation_id
    LEFT JOIN cf_recommendation_outbox n ON n.event_id=e.id
    WHERE e.id=? AND r.owner_id=? AND e.kind IN ('proceed','question','item','device_update')`,eventId,repo.scope.actor).first();
}

export async function projectSoloDeskEvent(options={},event={}){
  const setup=await ready(options);if(!setup.ok)return setup;
  const {repo,sync}=setup,kind=clean(event.kind,40);let op=null;
  if(kind==='lead'){
    const value=event.record||await leadRecord(repo,event.checkpointId);if(!value)return {ok:false,state:'source_not_found',kind};
    op=await sync.projectLead(value);
  }else if(kind==='booking'){
    const value=event.record||await bookingRecord(repo,event.requestId);if(!value)return {ok:false,state:'source_not_found',kind};
    op=await sync.projectBooking(value);
  }else if(kind==='journey'){
    const value=event.record||await journeyRecord(repo,event.recordKey);if(!value)return {ok:false,state:'source_not_found',kind};
    op=await sync.projectJourney(value,event.recordKey||'event-driven');
  }else if(kind==='recommendation'){
    const value=event.record||await recommendationRecord(repo,event.recommendationId);if(!value)return {ok:false,state:'source_not_found',kind};
    op=await sync.projectRecommendation(value);
  }else if(kind==='response'){
    const value=event.record||await responseRecord(repo,event.eventId);if(!value)return {ok:false,state:'source_not_found',kind};
    op=await sync.projectResponse(value);
  }else if(kind==='closing'){
    const value=event.record||await recommendationRecord(repo,event.recommendationId);if(!value)return {ok:false,state:'source_not_found',kind};
    op=await sync.projectClosing(value);
  }else return {ok:false,state:'unsupported_event',kind};
  if(!op)return {ok:false,state:'not_linkable',kind};
  await refreshAcquisitionState(repo,op).catch(error=>{if(!/no such table/i.test(String(error?.message||'')))throw error;});
  const detail=await repo.detail(op);
  return {ok:true,state:'projected',kind,opportunityId:op,customerId:detail.customerProfile?.customer?.id||null,possessionQuality:detail.possessionQuality||null,nextBestAction:detail.nextBestAction||null,build:SOLO_DESK_EVENT_PROJECTION_BUILD};
}

export async function projectSoloDeskEventBestEffort(options={},event={}){
  try{return await projectSoloDeskEvent(options,event);}catch(error){
    console.error('CoverageFit Solo Desk event projection failed',error?.code||error?.name||'projection_error');
    return {ok:false,state:'projection_failed',kind:clean(event.kind,40),build:SOLO_DESK_EVENT_PROJECTION_BUILD};
  }
}
