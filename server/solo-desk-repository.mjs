import producer from '../producer.json' with {type:'json'};
import {fail,pacificDay,pacificInputToISO} from '../assets/js/solo-desk-model.mjs';
import {universalCustomerProfile} from './universal-customer-profile.mjs';
import {deriveNextBestAction} from './next-best-action-core.mjs';
import {derivePossessionQuality,FIV_QUEUES} from './fiv-core.mjs';
import {captureFivCalibrationBaseline,opportunityEffortSummary} from './fiv-calibration.mjs';
export const parse=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};
export const identity=env=>({workspace:String(env.COVERAGEFIT_SOLO_WORKSPACE_ID||'virginia-tam:dylan-haysbert'),actor:producer.id,name:producer.name||'Dylan Haysbert'});
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export const stamp=()=>new Date().toISOString();
const decodeCursor=value=>{if(!value)return null;try{const c=JSON.parse(atob(value));if(Array.isArray(c)&&c.length<=4&&c.every(x=>typeof x==='string'||typeof x==='number'))return c;}catch{}fail(422,'cursor','Refresh the list to continue.');};
const encodeCursor=value=>btoa(JSON.stringify(value));
const publicOpportunity=row=>row?{...row,contact:parse(row.contact_json),contact_json:undefined,last_mutation_id:undefined}:null;
export function soloRepository(db,scope){
  const {workspace,actor}=scope;
  const sql=(query,...values)=>db.prepare(query).bind(...values);
  const rows=async(query,...values)=>(await sql(query,...values).all()).results||[];
  const own=async id=>{const op=await sql('SELECT * FROM cf_solo_opportunities WHERE workspace_id=? AND id=?',workspace,id).first();if(!op)fail(404,'opportunity','This opportunity is unavailable.');return op;};
  const replay=async(requestId,fingerprint)=>{
    const event=await sql('SELECT * FROM cf_solo_activity WHERE workspace_id=? AND request_id=?',workspace,requestId).first();
    if(event&&event.fingerprint!==fingerprint)fail(409,'request_reused','That save request was already used. Reopen the account before making a different change.');
    return event;
  };
  let fivReady;
  const fivAvailable=async()=>{if(fivReady!==undefined)return fivReady;try{await sql('SELECT opportunity_id FROM cf_fiv_projections WHERE workspace_id=? LIMIT 1',workspace).first();fivReady=true;}catch{fivReady=false;}return fivReady;};
  const readFiv=async id=>{if(!await fivAvailable())return null;const row=await sql('SELECT projection_json FROM cf_fiv_projections WHERE workspace_id=? AND opportunity_id=?',workspace,id).first();return row?parse(row.projection_json):null;};
  const persistFiv=async(id,projection)=>{if(!projection||!await fivAvailable())return projection;const at=stamp();await sql(`INSERT INTO cf_fiv_projections(workspace_id,opportunity_id,fit,intent,value,queue,projection_json,engine,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,opportunity_id) DO UPDATE SET fit=excluded.fit,intent=excluded.intent,value=excluded.value,queue=excluded.queue,projection_json=excluded.projection_json,engine=excluded.engine,updated_at=excluded.updated_at`,workspace,id,projection.fit?.level||'unknown',projection.intent?.level||'unknown',projection.value?.level||'unknown',projection.queue||'unclassified',JSON.stringify(projection),projection.engine||'CF-FIV-1.1',at).run();await captureFivCalibrationBaseline({sql,scope:{workspace,actor}},id,projection);return projection;};
  function taskStatement(op,id,next,key,at,condition,conditionValues=[]){
    return sql(`INSERT INTO cf_solo_tasks(id,workspace_id,opportunity_id,assignee_id,work_type,title,due_at,state,blocker,source_key,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${condition}`,id,workspace,op,actor,next.workType,next.title,next.dueAt,next.state||'open',next.blocker||'',key,at,...conditionValues);
  }
  return {
    db,sql,rows,scope,own,
    async ready(){await sql('SELECT id FROM cf_solo_opportunities WHERE workspace_id=? LIMIT 1',workspace).first();},
    async activity(id,cursorValue){
      await own(id);const c=decodeCursor(cursorValue);if(c&&c.length!==2)fail(422,'cursor','Refresh the timeline.');
      const found=await rows(`SELECT id,actor_id,kind,payload_json,created_at FROM cf_solo_activity WHERE workspace_id=? AND opportunity_id=? ${c?'AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT 26`,workspace,id,...(c?[c[0],c[0],c[1]]:[]));
      const page=found.slice(0,25),last=page.at(-1);return {activity:page.map(r=>({...r,payload:parse(r.payload_json),payload_json:undefined})),nextCursor:found.length>25?encodeCursor([last.created_at,last.id]):null};
    },
    async detail(id){
      const op=await own(id);
      const [tasks,sources,timeline]=await Promise.all([
        rows("SELECT * FROM cf_solo_tasks WHERE workspace_id=? AND opportunity_id=? AND state NOT IN ('completed','cancelled') ORDER BY priority DESC,due_at,id",workspace,id),
        rows('SELECT kind,source_id,summary_json,updated_at FROM cf_solo_sources WHERE workspace_id=? AND opportunity_id=? ORDER BY kind,source_id',workspace,id),
        this.activity(id)
      ]);
      const projected=sources.map(s=>({...s,summary:parse(s.summary_json),summary_json:undefined}));
      // Outbox state changes independently of the event timestamp. Read its current
      // value, rather than treating an earlier failed notification as still failed.
      if(projected.some(s=>s.kind==='response')){
        const deliveries=await rows("SELECT s.source_id,n.state FROM cf_solo_sources s LEFT JOIN cf_recommendation_outbox n ON n.event_id=s.source_id WHERE s.workspace_id=? AND s.opportunity_id=? AND s.kind='response'",workspace,id);
        for(const source of projected){const delivery=deliveries.find(d=>d.source_id===source.source_id);if(source.kind==='response')source.summary.notificationState=delivery?.state||'unknown';}
      }
      const opportunity=publicOpportunity(op),profile=await universalCustomerProfile(this).detail(id);
      const possessionQuality=await persistFiv(id,derivePossessionQuality({opportunity,sources:projected,customerProfile:profile}));
      const nextBestAction=deriveNextBestAction({opportunity,tasks,sources:projected,possessionQuality});
      const effortSummary=await opportunityEffortSummary(this,id);
      return {opportunity,tasks,sources:projected,customerProfile:profile,possessionQuality,nextBestAction,effortSummary,...timeline};
    },
    async profile(id){return universalCustomerProfile(this).detail(id);},
    async ensureProfile(id){const ucp=universalCustomerProfile(this);return await ucp.available()?ucp.ensure(id):null;},
    async possessionQuality(id){return readFiv(id);},
    async refreshPossessionQuality(id){const op=await own(id),sources=(await rows('SELECT kind,source_id,summary_json,updated_at FROM cf_solo_sources WHERE workspace_id=? AND opportunity_id=? ORDER BY kind,source_id',workspace,id)).map(v=>({...v,summary:parse(v.summary_json),summary_json:undefined})),profile=await universalCustomerProfile(this).detail(id),projection=derivePossessionQuality({opportunity:publicOpportunity(op),sources,customerProfile:profile});return persistFiv(id,projection);},
    async linkProfile(sourceOpportunityId,targetOpportunityId,requestId){return universalCustomerProfile(this).linkOpportunity(sourceOpportunityId,targetOpportunityId,requestId);},
    async splitProfile(id,requestId){return universalCustomerProfile(this).splitOpportunity(id,requestId);},
    async list(params,now=new Date()){
      const mode=['today','all','waiting','closed'].includes(params.get('view'))?params.get('view'):'today';
      const q=(params.get('q')||'').trim().slice(0,120),work=['outreach','quoting_service','advice_closing'].includes(params.get('work'))?params.get('work'):'',fivQueue=FIV_QUEUES.has(params.get('queue'))?params.get('queue'):'';
      const cursor=decodeCursor(params.get('cursor')),limit=40,args=[workspace];
      const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
      const hasFiv=await fivAvailable();
      let where='o.workspace_id=?';
      if(fivQueue&&hasFiv){where+=' AND f.queue=?';args.push(fivQueue);}
      else if(fivQueue&&!hasFiv){return {records:[],nextCursor:null,view:mode,timeZone:'America/Los_Angeles',fivSetupRequired:true};}
      if(q){where+=" AND (o.contact_json LIKE ? ESCAPE '\\' OR o.source LIKE ? ESCAPE '\\' OR o.reason LIKE ? ESCAPE '\\' OR o.products LIKE ? ESCAPE '\\')";args.push(pattern,pattern,pattern,pattern);}
      let found,queue=mode==='today'||mode==='waiting';
      if(queue){
        where+=" AND t.state IN ('open','in_progress','waiting')";
        if(mode==='today'){where+=' AND t.due_at<?';args.push(new Date(Date.parse(pacificInputToISO(`${pacificDay(now)}T23:59`))+60000).toISOString());}
        if(mode==='waiting')where+=" AND t.state='waiting'";
        if(work){where+=' AND t.work_type=?';args.push(work);}
        if(cursor){if(cursor.length!==3)fail(422,'cursor','Refresh the queue.');where+=' AND (t.priority<? OR (t.priority=? AND (t.due_at>? OR (t.due_at=? AND t.id>?))))';args.push(cursor[0],cursor[0],cursor[1],cursor[1],cursor[2]);}
        found=await rows(`SELECT o.*,t.id AS task_id,t.title AS task_title,t.due_at,t.state AS task_state,t.blocker,t.work_type,t.priority${hasFiv?',f.fit AS fiv_fit,f.intent AS fiv_intent,f.value AS fiv_value,f.queue AS fiv_queue':''} FROM cf_solo_opportunities o JOIN cf_solo_tasks t ON t.opportunity_id=o.id AND t.workspace_id=o.workspace_id ${hasFiv?'LEFT JOIN cf_fiv_projections f ON f.workspace_id=o.workspace_id AND f.opportunity_id=o.id':''} WHERE ${where} ORDER BY t.priority DESC,t.due_at,t.id LIMIT ?`,...args,limit+1);
      }else{
        where+=mode==='closed'?" AND o.status='closed'":" AND o.status!='closed'";
        if(work){where+=" AND EXISTS(SELECT 1 FROM cf_solo_tasks t WHERE t.opportunity_id=o.id AND t.state IN ('open','waiting','in_progress') AND t.work_type=?)";args.push(work);}
        if(cursor){if(cursor.length!==2)fail(422,'cursor','Refresh the opportunities.');where+=' AND (o.updated_at<? OR (o.updated_at=? AND o.id<?))';args.push(cursor[0],cursor[0],cursor[1]);}
        found=await rows(`SELECT o.*,(SELECT MIN(due_at) FROM cf_solo_tasks t WHERE t.opportunity_id=o.id AND t.state IN ('open','waiting','in_progress')) AS due_at${hasFiv?',f.fit AS fiv_fit,f.intent AS fiv_intent,f.value AS fiv_value,f.queue AS fiv_queue':''} FROM cf_solo_opportunities o ${hasFiv?'LEFT JOIN cf_fiv_projections f ON f.workspace_id=o.workspace_id AND f.opportunity_id=o.id':''} WHERE ${where} ORDER BY o.updated_at DESC,o.id DESC LIMIT ?`,...args,limit+1);
      }
      const page=found.slice(0,limit),last=page.at(-1);
      return {records:page.map(publicOpportunity),nextCursor:found.length>limit?encodeCursor(queue?[last.priority,last.due_at,last.task_id]:[last.updated_at,last.id]):null,view:mode,timeZone:'America/Los_Angeles'};
    },
    async create(value,requestId){
      const fingerprint=await digest(JSON.stringify(value)),prior=await replay(requestId,fingerprint);if(prior)return this.detail(prior.opportunity_id);
      const id=`opp_${requestId}`,at=stamp(),gate='EXISTS(SELECT 1 FROM cf_solo_opportunities WHERE id=? AND workspace_id=? AND last_mutation_id=?)';
      await db.batch([
        sql('INSERT INTO cf_solo_opportunities(id,workspace_id,owner_id,contact_json,source,reason,products,deadline,last_mutation_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,workspace,actor,JSON.stringify(value.contact),value.source,value.reason,value.products,value.deadline,requestId,at,at),
        taskStatement(id,`task_${requestId}`,value.next,`manual:${requestId}`,at,gate,[id,workspace,requestId]),
        sql("INSERT INTO cf_solo_sources(workspace_id,kind,source_id,opportunity_id,summary_json,updated_at) VALUES(?,'manual',?,?,?,?)",workspace,requestId,id,JSON.stringify({source:value.source,acquisition:value.acquisition||{},contactBasis:value.contact.contactBasis||'Not recorded',crm:'Not requested',notification:'Not requested'}),at),
        sql("INSERT INTO cf_solo_activity(id,workspace_id,opportunity_id,actor_id,kind,request_id,fingerprint,payload_json,created_at) VALUES(?,?,?,?,'created',?,?,?,?)",`act_${requestId}`,workspace,id,actor,requestId,fingerprint,JSON.stringify({source:value.source,next:value.next}),at)
      ]).catch(async error=>{if(!await replay(requestId,fingerprint))throw error;});
      await this.ensureProfile(id);
      await this.refreshPossessionQuality(id);
      return this.detail(id);
    },
    async wrap(id,value,requestId){
      const fingerprint=await digest(JSON.stringify({id,...value})),prior=await replay(requestId,fingerprint);if(prior)return this.detail(id);
      const current=await own(id);
      if(value.version!==current.edit_version)fail(409,'conflict','This account changed in another tab. Your note is still here. Reload the account before saving.');
      if(value.taskId&&!await sql("SELECT id FROM cf_solo_tasks WHERE id=? AND opportunity_id=? AND workspace_id=? AND state IN ('open','waiting','in_progress')",value.taskId,id,workspace).first())fail(409,'task_changed','The selected task changed. Reload the account before saving.');
      const at=stamp(),gate='EXISTS(SELECT 1 FROM cf_solo_opportunities WHERE id=? AND workspace_id=? AND last_mutation_id=?)';
      const batch=[sql('UPDATE cf_solo_opportunities SET stage=?,status=?,close_reason=?,edit_version=edit_version+1,last_mutation_id=?,updated_at=? WHERE id=? AND workspace_id=? AND edit_version=?',value.stage,value.status,value.closeReason,requestId,at,id,workspace,value.version)];
      if(value.status==='closed')batch.push(sql(`UPDATE cf_solo_tasks SET state='cancelled',completed_at=? WHERE opportunity_id=? AND workspace_id=? AND state IN ('open','waiting','in_progress') AND ${gate}`,at,id,workspace,id,workspace,requestId));
      if(value.taskId)batch.push(sql(`UPDATE cf_solo_tasks SET state='completed',completed_at=? WHERE id=? AND opportunity_id=? AND workspace_id=? AND ${gate}`,at,value.taskId,id,workspace,id,workspace,requestId));
      if(value.next)batch.push(taskStatement(id,`task_${requestId}`,value.next,`next:${requestId}`,at,gate,[id,workspace,requestId]));
      batch.push(sql(`INSERT INTO cf_solo_activity(id,workspace_id,opportunity_id,actor_id,kind,request_id,fingerprint,payload_json,created_at) SELECT ?,?,?,?,'wrap',?,?,?,? WHERE ${gate}`,`act_${requestId}`,workspace,id,actor,requestId,fingerprint,JSON.stringify(value),at,id,workspace,requestId));
      const result=await db.batch(batch).catch(async error=>{if(await replay(requestId,fingerprint))return [{meta:{changes:0}}];throw error;});
      if(result[0].meta?.changes!==1&&!await replay(requestId,fingerprint))fail(409,'conflict','This account changed in another tab. Reload the account before saving.');
      return this.detail(id);
    }
  };
}
