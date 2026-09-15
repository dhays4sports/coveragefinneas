const parse = value => {try{return JSON.parse(value || '{}')}catch{return {}}};
export const iso = () => new Date().toISOString();
export function repository(db) {
  const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
  const row = value => value ? {...value,draft:parse(value.draft_json),appointment:parse(value.appointment_json),outcome:parse(value.outcome_json)} : null;
  return {
    db,
    async create(id,owner,draft) {const at=iso(); await stmt('INSERT OR IGNORE INTO cf_recommendations(id,owner_id,draft_json,created_at,updated_at) VALUES(?1,?2,?3,?4,?4)',id,owner,JSON.stringify(draft),at).run(); return await this.get(id) || this.findContext(owner,draft.context);},
    async findContext(owner,context) {if(!context?.id || context.kind==='direct')return null;return row(await stmt("SELECT * FROM cf_recommendations WHERE owner_id=?1 AND json_extract(draft_json,'$.context.kind')=?2 AND json_extract(draft_json,'$.context.id')=?3 LIMIT 1",owner,context.kind,context.id).first());},
    async get(id) {return row(await stmt('SELECT * FROM cf_recommendations WHERE id=?1',id).first());},
    async list(owner) {const data=await stmt('SELECT * FROM cf_recommendations WHERE owner_id=?1 ORDER BY updated_at DESC LIMIT 150',owner).all(); return (data.results || []).map(row);},
    async save(id,version,draft) {const result=await stmt('UPDATE cf_recommendations SET draft_json=?1,edit_version=edit_version+1,updated_at=?2 WHERE id=?3 AND edit_version=?4',JSON.stringify(draft),iso(),id,version).run(); return result.meta?.changes === 1 ? this.get(id) : null;},
    async documents(id) {const data=await stmt('SELECT id,metadata_json FROM cf_recommendation_documents WHERE recommendation_id=?1 ORDER BY created_at',id).all(); return (data.results || []).map(r=>({...parse(r.metadata_json),id:r.id}));},
    async putDocument(id,rec,metadata) {await stmt('INSERT INTO cf_recommendation_documents(id,recommendation_id,metadata_json,created_at) VALUES(?1,?2,?3,?4)',id,rec,JSON.stringify(metadata),iso()).run();},
    async updateDocument(id,rec,metadata) {await stmt('UPDATE cf_recommendation_documents SET metadata_json=?1 WHERE id=?2 AND recommendation_id=?3',JSON.stringify(metadata),id,rec).run();},
    async approve(record,payload,hash,expiresAt) {
      const revision=record.current_revision+1, at=iso();
      const results=await db.batch([
        stmt('INSERT INTO cf_recommendation_revisions(recommendation_id,revision,token_hash,payload_json,expires_at,created_at) SELECT id,?1,?2,?3,?4,?5 FROM cf_recommendations WHERE id=?6 AND edit_version=?7 AND current_revision=?8',revision,hash,JSON.stringify(payload),expiresAt,at,record.id,record.edit_version,record.current_revision),
        stmt('UPDATE cf_recommendations SET current_revision=?1,edit_version=edit_version+1,updated_at=?2 WHERE id=?3 AND edit_version=?4 AND current_revision=?5',revision,at,record.id,record.edit_version,record.current_revision)
      ]);
      return results[0].meta?.changes===1 && results[1].meta?.changes===1 ? this.revision(record.id,revision) : null;
    },
    async revision(id,revision) {const r=await stmt('SELECT * FROM cf_recommendation_revisions WHERE recommendation_id=?1 AND revision=?2',id,revision).first(); return r?{...r,payload:parse(r.payload_json)}:null;},
    async fromToken(hash) {const r=await stmt('SELECT * FROM cf_recommendation_revisions WHERE token_hash=?1',hash).first(); return r?{...r,payload:parse(r.payload_json)}:null;},
    async revoke(id,revision) {await stmt('UPDATE cf_recommendation_revisions SET revoked_at=?1 WHERE recommendation_id=?2 AND revision=?3',iso(),id,revision).run();},
    async event(rec,revision,kind,dedupe,payload) {
      const id=crypto.randomUUID(),at=iso();
      await db.batch([
        stmt('INSERT INTO cf_recommendation_events(id,recommendation_id,revision,kind,dedupe_key,payload_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(dedupe_key) DO NOTHING',id,rec,revision,kind,dedupe,JSON.stringify(payload),at),
        stmt("INSERT OR IGNORE INTO cf_recommendation_outbox(event_id) SELECT id FROM cf_recommendation_events WHERE dedupe_key=?1",dedupe)
      ]);
      const found=await stmt('SELECT * FROM cf_recommendation_events WHERE dedupe_key=?1',dedupe).first();
      return {...found,payload:parse(found.payload_json),duplicate:found.id!==id};
    },
    async events(id) {const data=await stmt('SELECT e.*,o.state AS notification_state,o.last_error FROM cf_recommendation_events e LEFT JOIN cf_recommendation_outbox o ON o.event_id=e.id WHERE e.recommendation_id=?1 ORDER BY e.created_at DESC LIMIT 100',id).all();return (data.results || []).map(e=>({...e,payload:parse(e.payload_json)}));},
    async claimNotification(eventId) {const until=new Date(Date.now()+120000).toISOString(); const result=await stmt("UPDATE cf_recommendation_outbox SET state='sending',attempts=attempts+1,lease_until=?1 WHERE event_id=?2 AND (state IN ('pending','failed') OR (state='sending' AND lease_until<?3))",until,eventId,iso()).run();return result.meta?.changes===1;},
    async finishNotification(id,sent,error='') {await stmt('UPDATE cf_recommendation_outbox SET state=?1,last_error=?2,sent_at=?3,lease_until=NULL WHERE event_id=?4',sent?'sent':'failed',error,sent?iso():null,id).run();},
    async pendingNotifications(id=null) {const data=await stmt("SELECT e.* FROM cf_recommendation_events e JOIN cf_recommendation_outbox o ON o.event_id=e.id WHERE (?1 IS NULL OR e.recommendation_id=?1) AND (o.state IN ('pending','failed') OR (o.state='sending' AND o.lease_until<?2)) ORDER BY o.attempts ASC,e.created_at LIMIT 30",id,iso()).all();return (data.results || []).map(e=>({...e,payload:parse(e.payload_json)}));},
    async setSent(id,at,revision) {await db.batch([stmt('UPDATE cf_recommendations SET sent_at=COALESCE(sent_at,?1),updated_at=?2 WHERE id=?3',at,iso(),id),stmt('UPDATE cf_recommendation_revisions SET sent_at=?1 WHERE recommendation_id=?2 AND revision=?3',at,id,revision)]);},
    async setOutcome(id,outcome) {await stmt('UPDATE cf_recommendations SET outcome_json=?1,updated_at=?2 WHERE id=?3',JSON.stringify(outcome),iso(),id).run();},
    async setAppointment(id,appointment) {await stmt('UPDATE cf_recommendations SET appointment_json=?1,updated_at=?2 WHERE id=?3',JSON.stringify(appointment),iso(),id).run();},
    async operation(id,key) {const r=await stmt('SELECT * FROM cf_recommendation_operations WHERE recommendation_id=?1 AND operation_key=?2',id,key).first();return r?{...r,payload:parse(r.payload_json)}:null;},
    async beginOperation(id,key,payload) {const at=iso();const result=await stmt('INSERT OR IGNORE INTO cf_recommendation_operations(recommendation_id,operation_key,payload_json,updated_at) VALUES(?1,?2,?3,?4)',id,key,JSON.stringify(payload),at).run();return result.meta?.changes===1;},
    async updateOperation(id,key,payload) {await stmt('UPDATE cf_recommendation_operations SET payload_json=?1,updated_at=?2 WHERE recommendation_id=?3 AND operation_key=?4',JSON.stringify(payload),iso(),id,key).run();},
    async releaseOperation(id,key,requestId) {await stmt("DELETE FROM cf_recommendation_operations WHERE recommendation_id=?1 AND operation_key=?2 AND json_extract(payload_json,'$.requestId')=?3",id,key,requestId).run();}
  };
}
