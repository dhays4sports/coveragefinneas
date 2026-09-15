import {clean,fail} from '../assets/js/solo-desk-model.mjs';
const parse=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};
const stamp=()=>new Date().toISOString();
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}

const publicCustomer=row=>row?{id:row.id,displayName:row.display_name,primaryEmail:row.primary_email,primaryMobile:row.primary_mobile,status:row.status,mergedIntoCustomerId:row.merged_into_customer_id||null,editVersion:row.edit_version,createdAt:row.created_at,updatedAt:row.updated_at}:null;
const publicHousehold=row=>row?{id:row.id,label:row.label,status:row.status,editVersion:row.edit_version,createdAt:row.created_at,updatedAt:row.updated_at}:null;

export function universalCustomerProfile(repo){
  const {sql,rows,scope,db}=repo,{workspace,actor}=scope;
  async function available(){
    const row=await sql("SELECT name FROM sqlite_master WHERE type='table' AND name='cf_ucp_opportunity_links'").first();
    return Boolean(row);
  }
  async function ensure(opportunityId){
    const op=await repo.own(opportunityId);
    const existing=await sql('SELECT * FROM cf_ucp_opportunity_links WHERE workspace_id=? AND opportunity_id=?',workspace,opportunityId).first();
    if(existing)return existing;
    const contact=parse(op.contact_json),at=stamp(),customerId=`cust_${opportunityId}`,householdId=`hh_${opportunityId}`,requestId=`seed:${opportunityId}`;
    await db.batch([
      sql('INSERT OR IGNORE INTO cf_ucp_customers(id,workspace_id,display_name,primary_email,primary_mobile,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',customerId,workspace,clean(contact.name,160)||'Name not recorded',clean(contact.email,200),clean(contact.mobile,40),op.created_at||at,at),
      sql('INSERT OR IGNORE INTO cf_ucp_households(id,workspace_id,label,created_at,updated_at) VALUES(?,?,?,?,?)',householdId,workspace,`${clean(contact.name,160)||'Household'} household`,op.created_at||at,at),
      sql("INSERT OR IGNORE INTO cf_ucp_household_members(workspace_id,household_id,customer_id,relationship,is_primary,created_at) VALUES(?,?,?,'primary',1,?)",workspace,householdId,customerId,op.created_at||at),
      sql("INSERT OR IGNORE INTO cf_ucp_opportunity_links(workspace_id,opportunity_id,customer_id,household_id,link_basis,linked_by,request_id,created_at,updated_at) VALUES(?,?,?,?, 'seeded_from_opportunity',?,?,?,?)",workspace,opportunityId,customerId,householdId,actor,requestId,op.created_at||at,at)
    ]);
    return sql('SELECT * FROM cf_ucp_opportunity_links WHERE workspace_id=? AND opportunity_id=?',workspace,opportunityId).first();
  }
  async function candidates(opportunityId,link){
    const op=await repo.own(opportunityId),contact=parse(op.contact_json),email=clean(contact.email,200).toLowerCase(),mobile=clean(contact.mobile,40);
    if(!email&&!mobile)return [];
    const found=await rows(`SELECT o.id,o.contact_json,o.source,o.reason,o.products,o.updated_at,l.customer_id,l.household_id
      FROM cf_solo_opportunities o LEFT JOIN cf_ucp_opportunity_links l ON l.workspace_id=o.workspace_id AND l.opportunity_id=o.id
      WHERE o.workspace_id=? AND o.id<>? AND COALESCE(l.customer_id,'')<>? AND ((?<>'' AND lower(COALESCE(json_extract(o.contact_json,'$.email'),''))=?) OR (?<>'' AND COALESCE(json_extract(o.contact_json,'$.mobile'),'')=?))
      ORDER BY o.updated_at DESC,o.id DESC LIMIT 8`,workspace,opportunityId,link.customer_id,email,email,mobile,mobile);
    return found.map(r=>{const c=parse(r.contact_json),sameEmail=Boolean(email&&clean(c.email,200).toLowerCase()===email),sameMobile=Boolean(mobile&&clean(c.mobile,40)===mobile);return {opportunityId:r.id,name:clean(c.name,160)||'Name not recorded',email:clean(c.email,200),mobile:clean(c.mobile,40),source:r.source,reason:r.reason,products:r.products,updatedAt:r.updated_at,matchReasons:[sameEmail?'same_email':null,sameMobile?'same_mobile':null].filter(Boolean),autoLinked:false};});
  }
  async function detail(opportunityId){
    if(!await available())return {status:'setup_required',schemaVersion:'1.0',customer:null,household:null,relatedOpportunities:[],candidates:[],identityAutoMerged:false};
    const link=await ensure(opportunityId);
    const [customer,household,related,members]=await Promise.all([
      sql('SELECT * FROM cf_ucp_customers WHERE workspace_id=? AND id=?',workspace,link.customer_id).first(),
      sql('SELECT * FROM cf_ucp_households WHERE workspace_id=? AND id=?',workspace,link.household_id).first(),
      rows(`SELECT o.id,o.stage,o.status,o.source,o.reason,o.products,o.deadline,o.created_at,o.updated_at,o.contact_json,l.link_basis
            FROM cf_ucp_opportunity_links l JOIN cf_solo_opportunities o ON o.id=l.opportunity_id AND o.workspace_id=l.workspace_id
            WHERE l.workspace_id=? AND l.customer_id=? ORDER BY o.updated_at DESC,o.id DESC`,workspace,link.customer_id),
      rows(`SELECT m.customer_id,m.relationship,m.is_primary,c.display_name,c.status FROM cf_ucp_household_members m JOIN cf_ucp_customers c ON c.id=m.customer_id AND c.workspace_id=m.workspace_id WHERE m.workspace_id=? AND m.household_id=? ORDER BY m.is_primary DESC,c.display_name,c.id`,workspace,link.household_id)
    ]);
    return {status:'ready',schemaVersion:'1.0',customer:publicCustomer(customer),household:publicHousehold(household),link:{basis:link.link_basis,linkedBy:link.linked_by,updatedAt:link.updated_at},members:members.map(m=>({customerId:m.customer_id,displayName:m.display_name,relationship:m.relationship,isPrimary:m.is_primary===1,status:m.status})),relatedOpportunities:related.map(r=>({id:r.id,stage:r.stage,status:r.status,source:r.source,reason:r.reason,products:r.products,deadline:r.deadline,contact:parse(r.contact_json),linkBasis:r.link_basis,createdAt:r.created_at,updatedAt:r.updated_at})),candidates:await candidates(opportunityId,link),identityAutoMerged:false};
  }
  async function priorRequest(requestId,fingerprint){
    const event=await sql('SELECT fingerprint,opportunity_id FROM cf_solo_activity WHERE workspace_id=? AND request_id=?',workspace,requestId).first();
    if(event&&event.fingerprint!==fingerprint)fail(409,'request_reused','That profile-link request was already used for a different change.');
    return event;
  }
  async function linkOpportunity(sourceOpportunityId,targetOpportunityId,requestId){
    if(sourceOpportunityId===targetOpportunityId)fail(422,'profile_link','Choose a different opportunity to link.');
    await Promise.all([repo.own(sourceOpportunityId),repo.own(targetOpportunityId)]);
    if(!await available())fail(503,'ucp_setup_required','Universal Customer Profile needs migration 0012 before profiles can be linked.');
    const fingerprint=await digest(JSON.stringify({kind:'ucp-link',sourceOpportunityId,targetOpportunityId})),prior=await priorRequest(requestId,fingerprint);if(prior)return detail(sourceOpportunityId);
    const [source,target]=await Promise.all([ensure(sourceOpportunityId),ensure(targetOpportunityId)]);
    if(source.customer_id===target.customer_id)return detail(sourceOpportunityId);
    const at=stamp(),sourceCount=Number((await sql('SELECT count(*) AS n FROM cf_ucp_opportunity_links WHERE workspace_id=? AND customer_id=?',workspace,source.customer_id).first())?.n||0);
    const activityId=`act_ucp_${requestId}`;
    await db.batch([
      sql('UPDATE cf_solo_opportunities SET edit_version=edit_version+1,last_mutation_id=?,updated_at=? WHERE workspace_id=? AND id=?',requestId,at,workspace,sourceOpportunityId),
      sql("UPDATE cf_ucp_opportunity_links SET customer_id=?,household_id=?,link_basis='explicit_profile_link',linked_by=?,request_id=?,updated_at=? WHERE workspace_id=? AND opportunity_id=? AND customer_id=?",target.customer_id,target.household_id,actor,requestId,at,workspace,sourceOpportunityId,source.customer_id),
      ...(sourceCount===1?[sql("UPDATE cf_ucp_customers SET status='merged',merged_into_customer_id=?,edit_version=edit_version+1,updated_at=? WHERE workspace_id=? AND id=? AND status='active'",target.customer_id,at,workspace,source.customer_id)]:[]),
      sql('UPDATE cf_ucp_customers SET edit_version=edit_version+1,updated_at=? WHERE workspace_id=? AND id=?',at,workspace,target.customer_id),
      sql('UPDATE cf_ucp_households SET edit_version=edit_version+1,updated_at=? WHERE workspace_id=? AND id=?',at,workspace,target.household_id),
      sql("INSERT INTO cf_solo_activity(id,workspace_id,opportunity_id,actor_id,kind,request_id,fingerprint,payload_json,created_at) VALUES(?,?,?,?, 'profile_link',?,?,?,?)",activityId,workspace,sourceOpportunityId,actor,requestId,fingerprint,JSON.stringify({note:'Opportunity explicitly linked to an existing customer profile.',targetOpportunityId,targetCustomerId:target.customer_id,targetHouseholdId:target.household_id,identityAutoMerged:false}),at)
    ]);
    return detail(sourceOpportunityId);
  }
  async function splitOpportunity(opportunityId,requestId){
    const op=await repo.own(opportunityId);if(!await available())fail(503,'ucp_setup_required','Universal Customer Profile needs migration 0012 before profiles can be split.');
    const fingerprint=await digest(JSON.stringify({kind:'ucp-split',opportunityId})),prior=await priorRequest(requestId,fingerprint);if(prior)return detail(opportunityId);
    const current=await ensure(opportunityId),at=stamp(),suffix=(await digest(`${workspace}|${opportunityId}|${requestId}`)).slice(0,24),customerId=`cust_split_${suffix}`,householdId=`hh_split_${suffix}`,contact=parse(op.contact_json);
    await db.batch([
      sql('UPDATE cf_solo_opportunities SET edit_version=edit_version+1,last_mutation_id=?,updated_at=? WHERE workspace_id=? AND id=?',requestId,at,workspace,opportunityId),
      sql('INSERT INTO cf_ucp_customers(id,workspace_id,display_name,primary_email,primary_mobile,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',customerId,workspace,clean(contact.name,160)||'Name not recorded',clean(contact.email,200),clean(contact.mobile,40),at,at),
      sql('INSERT INTO cf_ucp_households(id,workspace_id,label,created_at,updated_at) VALUES(?,?,?,?,?)',householdId,workspace,`${clean(contact.name,160)||'Household'} household`,at,at),
      sql("INSERT INTO cf_ucp_household_members(workspace_id,household_id,customer_id,relationship,is_primary,created_at) VALUES(?,?,?,'primary',1,?)",workspace,householdId,customerId,at),
      sql("UPDATE cf_ucp_opportunity_links SET customer_id=?,household_id=?,link_basis='explicit_profile_split',linked_by=?,request_id=?,updated_at=? WHERE workspace_id=? AND opportunity_id=? AND customer_id=?",customerId,householdId,actor,requestId,at,workspace,opportunityId,current.customer_id),
      sql("INSERT INTO cf_solo_activity(id,workspace_id,opportunity_id,actor_id,kind,request_id,fingerprint,payload_json,created_at) VALUES(?,?,?,?, 'profile_split',?,?,?,?)",`act_ucp_${requestId}`,workspace,opportunityId,actor,requestId,fingerprint,JSON.stringify({note:'Opportunity explicitly separated into its own customer profile.',previousCustomerId:current.customer_id,identityAutoMerged:false}),at)
    ]);
    return detail(opportunityId);
  }
  return {available,ensure,detail,candidates,linkOpportunity,splitOpportunity};
}
