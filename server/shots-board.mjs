import {pacificDay,pacificInputToISO} from '../assets/js/solo-desk-model.mjs';
import {parse} from './solo-desk-repository.mjs';

export const SHOTS_BUILD='408-SHOTS-1.1-SOLO';
export const SHOTS_TIME_ZONE='America/Los_Angeles';
const DAY=86400000;
const FIV_LABELS=Object.freeze({shoot_now:'🔥 Shoot now',quick_play:'⚡ Quick play',develop:'🏀 Develop',nurture:'🌱 Nurture',low_priority:'⬇ Low priority',unclassified:'Unclassified'});
const CLOSE_FINAL=new Set(['bound','partial','declined_price','declined_coverage','unable_to_reach']);
const CLOSE_TASKS=Object.freeze({
  'Respond to client request to proceed':{action:'Respond to proceed request',why:'The client explicitly asked to move forward.',rank:120},
  'Complete bind preparation':{action:'Complete bind preparation',why:'The customer decided to proceed; carrier binding is still outstanding.',rank:115},
  'Confirm carrier bind outcome':{action:'Confirm carrier bind outcome',why:'Bind preparation is ready; record the carrier result only after confirmation.',rank:110},
  'Follow up on the insurance decision':{action:'Follow up on the decision',why:'The close was asked and the customer decision is still open.',rank:105},
  'Set the next decision follow-up':{action:'Set the decision follow-up',why:'The customer is not ready yet; preserve the possession with a concrete return time.',rank:95},
  'Return at the agreed follow-up':{action:'Return at the agreed follow-up',why:'The customer deferred the decision to an agreed time.',rank:90},
  'Record the actual sales outcome':{action:'Record the actual sales outcome',why:'A customer decision exists but the durable outcome is not yet recorded.',rank:85}
});

const cents=value=>Number.isFinite(Number(value))?Math.max(0,Math.round(Number(value))):0;
const text=(value,max=240)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);
const safeTime=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
function addDay(day,n){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function monthBounds(day){const [year,month]=day.split('-').map(Number),nextMonth=month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`;return {start:`${day.slice(0,7)}-01`,next:nextMonth};}
function businessDaysRemaining(day){const end=new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7)),0)),start=new Date(`${day}T12:00:00Z`);let count=0;for(let d=new Date(start);d<=end;d=new Date(d.getTime()+DAY)){const w=d.getUTCDay();if(w!==0&&w!==6)count++;}return count;}
function contact(row){const c=parse(row.contact_json);return {name:text(c.name||'Name not recorded',120),mobile:text(c.mobile,40),email:text(c.email,160)};}
function fiv(row){return {queue:text(row.fiv_queue||'unclassified',40),label:FIV_LABELS[row.fiv_queue]||FIV_LABELS.unclassified,fit:text(row.fiv_fit||'unknown',20),intent:text(row.fiv_intent||'unknown',20),value:text(row.fiv_value||'unknown',20)};}
function publicTask(task){return task?{id:text(task.id,180),title:text(task.title,240),dueAt:safeTime(task.due_at),state:text(task.state,30),workType:text(task.work_type,50),priority:Number(task.priority||0),blocker:text(task.blocker,300)}:null;}
function openInWorkspace(id){return `/agent/workspace/?opportunity_id=${encodeURIComponent(id)}`;}
function baseCard(row,task,extra={}){return {opportunityId:row.id,contact:contact(row),source:text(row.source,120),products:text(row.products,160),reason:text(row.reason,320),stage:text(row.stage,50),deadline:text(row.deadline,10),fiv:fiv(row),task:publicTask(task),workspaceUrl:openInWorkspace(row.id),...extra};}
function closingAction(row,task,summary){
  const outcome=text(summary?.outcome?.kind,60).toLowerCase();if(CLOSE_FINAL.has(outcome))return null;
  const known=CLOSE_TASKS[task?.title];if(known)return {...known,dueAt:safeTime(task.due_at),basis:'recorded_closing_task'};
  if(summary?.bindPrep?.state==='ready_for_bind_confirmation')return {action:'Confirm carrier bind outcome',why:'Bind preparation is ready; carrier confirmation remains separate.',rank:110,dueAt:safeTime(summary.bindPrep.at),basis:'closing_state'};
  if(summary?.decision==='proceed')return {action:'Complete bind preparation',why:'The customer decided to proceed; finish the carrier-side bind work.',rank:115,dueAt:safeTime(summary.decisionAt),basis:'closing_state'};
  if(summary?.closeAskedAt&&!summary?.decision)return {action:'Follow up on the decision',why:'The recommendation was delivered and the close was asked; the customer decision remains open.',rank:105,dueAt:safeTime(summary.closeAskedAt),basis:'closing_state'};
  if(summary?.deliveredAt&&!summary?.closeAskedAt)return {action:'Ask for the business',why:'The recommendation was delivered, but no explicit close ask is recorded yet.',rank:100,dueAt:safeTime(summary.deliveredAt),basis:'closing_state'};
  return null;
}
function appointmentPublic(row,opportunity){const s=parse(row.summary_json),start=safeTime(s.start||s.scheduledStart),end=safeTime(s.end||s.scheduledEnd);return start?{eventId:text(s.eventId||row.source_id,180),status:text(s.status||'scheduled',40),start,end,display:text(s.display,180),opportunityId:row.opportunity_id,contact:opportunity?contact(opportunity):{name:'Linked appointment'},products:text(opportunity?.products,160),workspaceUrl:openInWorkspace(row.opportunity_id)}:null;}
function laneSort(a,b){return Number(b.rank||0)-Number(a.rank||0)||(Date.parse(a.dueAt||'9999-12-31')-Date.parse(b.dueAt||'9999-12-31'))||a.contact.name.localeCompare(b.contact.name);}

export function shotsBoard(repo,env={}){
  const workspace=repo.scope.workspace;
  return {
    async view(now=new Date()){
      const today=pacificDay(now),tomorrow=addDay(today,1),dayAfterTomorrow=addDay(today,2),todayStart=pacificInputToISO(`${today}T00:00`),tomorrowStart=pacificInputToISO(`${tomorrow}T00:00`),dayAfterTomorrowStart=pacificInputToISO(`${dayAfterTomorrow}T00:00`),{start:monthStartDay,next:nextMonthDay}=monthBounds(today),monthStart=pacificInputToISO(`${monthStartDay}T00:00`),nextMonth=pacificInputToISO(`${nextMonthDay}T00:00`);
      const [opRows,taskRows,closeRows,calendarRows,premiumRow]=await Promise.all([
        repo.rows(`SELECT o.*,f.fit AS fiv_fit,f.intent AS fiv_intent,f.value AS fiv_value,f.queue AS fiv_queue FROM cf_solo_opportunities o LEFT JOIN cf_fiv_projections f ON f.workspace_id=o.workspace_id AND f.opportunity_id=o.id WHERE o.workspace_id=? AND o.status!='closed' ORDER BY o.updated_at DESC LIMIT 180`,workspace),
        repo.rows("SELECT * FROM cf_solo_tasks WHERE workspace_id=? AND state IN ('open','in_progress','waiting') ORDER BY priority DESC,due_at,id",workspace),
        repo.rows("SELECT opportunity_id,summary_json,updated_at FROM cf_solo_sources WHERE workspace_id=? AND kind='close' ORDER BY updated_at DESC",workspace),
        repo.rows("SELECT opportunity_id,source_id,summary_json,updated_at FROM cf_solo_sources WHERE workspace_id=? AND kind='calendar' ORDER BY updated_at DESC",workspace),
        repo.sql(`SELECT COALESCE(SUM(written_premium_cents),0) AS premium_cents,COUNT(*) AS bound_components FROM cf_acq_opportunity_measurements WHERE workspace_id=? AND written_premium_recorded_at>=? AND written_premium_recorded_at<? AND written_premium_cents IS NOT NULL`,workspace,monthStart,nextMonth).first().catch(()=>({premium_cents:0,bound_components:0}))
      ]);
      const opportunities=new Map(opRows.map(r=>[r.id,r])),topTask=new Map();for(const t of taskRows)if(!topTask.has(t.opportunity_id))topTask.set(t.opportunity_id,t);
      const closing=new Map();for(const r of closeRows)if(!closing.has(r.opportunity_id))closing.set(r.opportunity_id,parse(r.summary_json));
      const closeLane=[],shootLane=[],quickLane=[],used=new Set();
      for(const row of opRows){const task=topTask.get(row.id)||null,summary=closing.get(row.id)||null,close=closingAction(row,task,summary);if(!close)continue;closeLane.push(baseCard(row,task,{action:close.action,why:close.why,dueAt:close.dueAt,rank:close.rank,basis:close.basis,closeState:{deliveredAt:summary?.deliveredAt||null,closeAskedAt:summary?.closeAskedAt||null,decision:summary?.decision||'',bindPrep:summary?.bindPrep||null}}));used.add(row.id);}
      for(const row of opRows){if(used.has(row.id))continue;const task=topTask.get(row.id)||null;if(row.fiv_queue==='shoot_now'){shootLane.push(baseCard(row,task,{action:text(task?.title||'Advance the highest-value opportunity',240),why:text(row.reason||'Strong current fit, intent and relationship scope make this possession worth producer attention now.',320),dueAt:safeTime(task?.due_at),rank:80,basis:'fiv_queue'}));used.add(row.id);}}
      for(const row of opRows){if(used.has(row.id))continue;const task=topTask.get(row.id)||null;if(row.fiv_queue==='quick_play'){quickLane.push(baseCard(row,task,{action:text(task?.title||'Quick-screen and advance',240),why:text(row.reason||'This possession is worth a fast screen and next step before it becomes heavier work.',320),dueAt:safeTime(task?.due_at),rank:60,basis:'fiv_queue'}));used.add(row.id);}}
      const dueToday=[];for(const row of opRows){if(used.has(row.id))continue;const task=topTask.get(row.id);if(!task?.due_at)continue;const due=Date.parse(task.due_at);if(due>=Date.parse(todayStart)&&due<Date.parse(tomorrowStart))dueToday.push(baseCard(row,task,{action:text(task.title,240),why:task.blocker?`Waiting for: ${text(task.blocker,200)}`:'Recorded next action is due today.',dueAt:safeTime(task.due_at),rank:Number(task.priority||20),basis:'due_today'}));}
      const appointments=calendarRows.map(r=>appointmentPublic(r,opportunities.get(r.opportunity_id))).filter(a=>a&&a.status==='scheduled').filter((a,i,all)=>all.findIndex(x=>x.eventId===a.eventId)===i).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
      const appointmentsToday=appointments.filter(a=>Date.parse(a.start)>=Date.parse(todayStart)&&Date.parse(a.start)<Date.parse(tomorrowStart));
      const future=appointments.filter(a=>Date.parse(a.start)>=now.getTime());let nextUp=future.find(a=>Date.parse(a.start)<Date.parse(tomorrowStart))||future.find(a=>Date.parse(a.start)>=Date.parse(tomorrowStart)&&Date.parse(a.start)<Date.parse(dayAfterTomorrowStart))||future[0]||null;
      if(nextUp){const ts=Date.parse(nextUp.start);nextUp={...nextUp,day:ts<Date.parse(tomorrowStart)?'today':ts<Date.parse(dayAfterTomorrowStart)?'tomorrow':'future'};}
      const monthlyPremiumCents=cents(premiumRow?.premium_cents),targetCents=cents(env.COVERAGEFIT_MONTHLY_PREMIUM_TARGET_CENTS),remainingCents=targetCents?Math.max(0,targetCents-monthlyPremiumCents):null,remainingBusinessDays=businessDaysRemaining(today),requiredPerBusinessDayCents=remainingCents!=null&&remainingBusinessDays?Math.ceil(remainingCents/remainingBusinessDays):null;
      return {build:SHOTS_BUILD,generatedAt:now.toISOString(),timeZone:SHOTS_TIME_ZONE,readOnly:true,truthBoundary:{calendar:'CoverageFit-linked scheduled appointments only. Direct Google Calendar changes still require reconciliation.',premium:'Verified written premium only; quoted or proceed-request premium is excluded.',priority:'Closing evidence and FIV guide producer attention; quick call/text links do not record contact and this board is not underwriting or eligibility.'},premium:{month:today.slice(0,7),verifiedWrittenPremiumCents:monthlyPremiumCents,boundComponents:Number(premiumRow?.bound_components||0),targetCents:targetCents||null,remainingCents,remainingBusinessDays,targetRequiredPerBusinessDayCents:requiredPerBusinessDayCents,targetConfigured:Boolean(targetCents)},lanes:{closing:closeLane.sort(laneSort).slice(0,6),shootNow:shootLane.sort(laneSort).slice(0,6),quickPlay:quickLane.sort(laneSort).slice(0,6),dueToday:dueToday.sort(laneSort).slice(0,8)},appointments:{today:appointmentsToday,nextUp},counts:{closing:closeLane.length,shootNow:shootLane.length,quickPlay:quickLane.length,dueToday:dueToday.length,appointmentsToday:appointmentsToday.length}};
    }
  };
}
