import { authorizeProducer } from './consultation-inbox-core.mjs';
import { buildProducerOpportunityProjection } from './pvx-producer-opportunity-core.mjs';
import { buildConversationReadyBrief } from './pvx-producer-brief-core.mjs';
import { sortProducerActionQueue } from './pvx-producer-action-queue-core.mjs';
import { LEAD_RECORD_PREFIX } from './lead-operations-core.mjs';

export const PVX_UNIFIED_PRODUCER_BUILD = '408-CF-PVX-WEB-2.6';
const text = (value, max = 240) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control':'private, no-store, max-age=0', 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options':'nosniff' } });
const error = (status, code, message) => json({ ok:false, error:{ code, message } }, status);
const listRecords = async (store, prefix, limit = 500) => {
  if (!store?.list || !store?.get) return [];
  const listed = await store.list({ prefix, limit });
  return (await Promise.all((listed.blobs || []).map(item => store.get(item.key).catch(() => null)))).filter(Boolean);
};

function exactWords(checkpoint, web, sms) {
  const rows = [];
  const webWords = web?.seed?.discovery?.exactCustomerWords || {};
  for (const [field, words] of Object.entries(webWords)) if (text(words, 800)) rows.push({ field, words:text(words,800), source:'408farmers_web', evidenceStatus:'customer-reported' });
  if (text(web?.seed?.evidence?.exactCustomerWords, 800)) rows.push({ field:'entry', words:text(web.seed.evidence.exactCustomerWords,800), source:'408farmers_web', evidenceStatus:'customer-reported' });
  for (const item of sms?.pvxJourney?.exactCustomerWords || []) if (text(item?.words, 800)) rows.push({ field:text(item.field,80), words:text(item.words,800), source:'ringcentral_sms', evidenceStatus:'customer-reported' });
  return rows.slice(0, 20);
}

export function projectUnifiedProducerRecord(checkpoint = {}, web = null, sms = null, leadJourney = null) {
  const attribution = checkpoint.attribution || {};
  const latestCheckpoint = (checkpoint.leadCheckpoints || []).at(-1) || {};
  const owner = text(sms?.orchestration?.ownership?.owner) || text(web?.seed?.ownership?.producerId) || 'dylan';
  const currentStage = text(web?.currentStage) || text(sms?.pvxJourney?.currentStage) || text(latestCheckpoint.checkpointType) || text(leadJourney?.stage) || 'snapshot_saved';
  const discovery = checkpoint.snapshot?.discovery || web?.seed?.discovery || sms?.pvxJourney?.discovery || {};
  const order = Array.isArray(discovery.questionOrder) ? discovery.questionOrder : [];
  const answers = discovery.answers || {};
  const earlyPermission = leadJourney?.consent?.agencyContact || {};
  const marketingPermission = leadJourney?.consent?.automatedMarketingSms || {};
  const operationalIdentityAvailable = earlyPermission.granted || earlyPermission.basis;
  const earlyIdentity = operationalIdentityAvailable ? {
    firstName:text(leadJourney?.identity?.firstName,80),
    lastName:text(leadJourney?.identity?.lastName,100),
    mobile:text(leadJourney?.identity?.mobile,40),
    email:text(leadJourney?.identity?.email,160)
  } : {};
  const checkpointId = text(leadJourney?.checkpointId || attribution.leadCheckpointId || checkpoint.checkpointId, 120);
  const earlyLead = checkpointId && operationalIdentityAvailable ? {
    checkpointId,
    firstName:text(leadJourney?.identity?.firstName,80),
    lastName:text(leadJourney?.identity?.lastName,100),
    mobile:text(leadJourney?.identity?.mobile,40),
    email:text(leadJourney?.identity?.email,160),
    sourceKey:text(leadJourney?.attribution?.sourceKey,80),
    sourceLabel:text(leadJourney?.attribution?.sourceLabel,120),
    professionalProgram:text(leadJourney?.context?.professionalProgram,40),
    professionalRole:text(leadJourney?.context?.professionalRole,80),
    professionalRoleLabel:text(leadJourney?.context?.professionalRoleLabel,120),
    housing:text(leadJourney?.context?.housing,40),
    reviewTrack:text(leadJourney?.context?.reviewTrack,40),
    reviewReason:text(leadJourney?.context?.reviewReason,60),
    reviewContext:text(leadJourney?.context?.reviewContext,120),
    propertyZip:text(leadJourney?.context?.propertyZip,10),
    closingDate:text(leadJourney?.context?.closingDate,40),
    autoNeed:text(leadJourney?.context?.autoNeed,60),
    lifeGoal:text(leadJourney?.context?.lifeGoal,60),
    businessType:text(leadJourney?.context?.businessType,120),
    businessNeed:text(leadJourney?.context?.businessNeed,60),
    sourceType:text(leadJourney?.context?.sourceType,40),
    appointment:leadJourney?.context?.appointment || null,
    stage:text(leadJourney?.stage,40) || 'started',
    receivedAt:text(leadJourney?.createdAt || leadJourney?.updatedAt,40),
    updatedAt:text(leadJourney?.updatedAt || leadJourney?.createdAt,40),
    callPermitted:earlyPermission.callPermitted === true,
    personalTextPermitted:earlyPermission.personalTextPermitted === true,
    emailPermitted:earlyPermission.emailPermitted === true
  } : null;
  const record = {
    schemaVersion:'2.1', recordType:'pvx_unified_producer_record', checkpointId,
    webJourneyId:text(attribution.webJourneyId || web?.journeyId,120),
    smsConversationId:text(attribution.smsConversationId || sms?.id,120),
    smsJourneyId:text(attribution.smsJourneyId || sms?.pvxJourney?.journeyId,120),
    entryType:text(web?.seed?.entry?.type,40), smsIntent:text(sms?.intent,40),
    productTrack:text(discovery.productTrack || web?.seed?.entry?.productTrack || sms?.pvxJourney?.productTrack || leadJourney?.context?.reviewTrack,30) || 'home',
    discovery:{ answers, exactCustomerWords:discovery.exactCustomerWords || {}, missingQuestionIds:order.filter(id => answers[id] == null), completedAt:text(discovery.completedAt,40) },
    currentStage, lifecycleStages:Array.isArray(leadJourney?.stages) ? leadJourney.stages : [],
    snapshotStatus:checkpoint.snapshot ? 'saved' : text(web?.projection?.snapshotStatus, leadJourney?.stage === 'snapshot_completed' ? 'viewed' : 'not_started'),
    homeProfileStatus:checkpoint.homeProfile ? 'ready' : text(web?.projection?.homeProfileStatus, leadJourney?.stage === 'home_profile_ready' ? 'ready' : 'not_started'),
    policyReviewStatus:checkpoint.coverageReview ? 'ready' : text(web?.projection?.policyReviewStatus, leadJourney?.stage === 'policy_review_ready' ? 'ready' : 'not_started'),
    latestReportRevision:text((checkpoint.reportRevisions || []).at(-1)?.revision || (checkpoint.policyReviewPath?.status === 'complete' ? '2P' : checkpoint.homeProfile ? '2H' : checkpoint.snapshot ? '1' : '')),
    shoppingMotivation:checkpoint.snapshot?.whyReviewing || answers.shoppingReason || null,
    reviewTopics:(checkpoint.snapshot?.whatDylanWouldLookAtFirst || []).slice(0,3), topicResponses:(checkpoint.topicResponses || []).slice(0,3),
    displacementContext:checkpoint.displacementContext || null,
    exactCustomerWords:exactWords(checkpoint,web,sms), opportunity:buildProducerOpportunityProjection({ checkpoint, web, sms }),
    attribution:{
      sourceKey:text(leadJourney?.attribution?.sourceKey,80),
      sourceLabel:text(leadJourney?.attribution?.sourceLabel,120),
      source:text(attribution.source || web?.seed?.attribution?.source || leadJourney?.attribution?.source),
      campaign:text(attribution.campaign || web?.seed?.attribution?.campaign || leadJourney?.attribution?.campaign),
      campaignId:text(attribution.campaignId || web?.seed?.attribution?.campaignId || leadJourney?.attribution?.campaignId),
      gclid:text(attribution.clickIds?.gclid || attribution.gclid || attribution.lastTouch?.gclid,180),
      gbraid:text(attribution.clickIds?.gbraid || attribution.gbraid || attribution.lastTouch?.gbraid,180),
      wbraid:text(attribution.clickIds?.wbraid || attribution.wbraid || attribution.lastTouch?.wbraid,180),
      gclsrc:text(attribution.clickIds?.gclsrc || attribution.gclsrc || attribution.lastTouch?.gclsrc,80),
      partnerId:text(attribution.partnerId || web?.seed?.attribution?.partnerId), realtorId:text(attribution.realtorId || web?.seed?.attribution?.realtorId), referralId:text(attribution.referralId || web?.seed?.attribution?.referralId)
    },
    fallbackIdentity:earlyIdentity, earlyLead,
    contact:checkpoint.consent?.contact ? checkpoint.contact : {},
    consent:{
      reportSaved:checkpoint.consent?.reportSaved === true, contact:checkpoint.consent?.contact === true,
      sms:checkpoint.consent?.sms === true, call:checkpoint.consent?.call === true, email:checkpoint.consent?.email === true,
      agencyContact:{
        granted:earlyPermission.granted === true, callPermitted:earlyPermission.callPermitted === true,
        personalTextPermitted:earlyPermission.personalTextPermitted === true,
        emailPermitted:earlyPermission.emailPermitted === true,
        automatedSmsAuthorized:false, automatedSmsSuppressed:true,
        basis:text(earlyPermission.basis,80), scope:text(earlyPermission.scope,100),
        version:text(earlyPermission.version,100), capturedAt:text(earlyPermission.capturedAt,40)
      },
      automatedMarketingSms:{
        granted:marketingPermission.granted === true,
        authorized:marketingPermission.granted === true,
        suppressionAuthoritative:true,
        version:text(marketingPermission.version,100), capturedAt:text(marketingPermission.capturedAt,40),
        seller:text(marketingPermission.seller,120), scope:text(marketingPermission.scope,100)
      }
    },
    crm:leadJourney?.crm || null, ownership:{ owner, silentlyReassigned:false },
    humanTakeover:sms?.state === 'human_takeover' || sms?.orchestration?.automation?.mode === 'paused',
    requestedProducerAction:text(web?.projection?.requestedProducerAction || sms?.pvxJourney?.requestedProducerAction || (leadJourney?.stage === 'contact_requested' ? 'contact_requested' : '')),
    latestReport:latestCheckpoint, notificationDedupeKey:text(checkpoint.producerNotification?.dedupeKey,160),
    updatedAt:text(checkpoint.updatedAt || checkpoint.contactRequestedAt || checkpoint.createdAt || leadJourney?.updatedAt,40)
  };
  return { ...record, producerBrief:buildConversationReadyBrief(record) };
}

export async function loadUnifiedProducerRecords({ pvxStore, smsStore, now = new Date() } = {}) {
  const [checkpoints, webJourneys, smsConversations, leadJourneys] = await Promise.all([
    listRecords(pvxStore,'pvx/checkpoint/'), listRecords(pvxStore,'pvx/web-journey/'),
    listRecords(smsStore,'sms-live-conversations/'), listRecords(pvxStore,LEAD_RECORD_PREFIX)
  ]);
  const webs = new Map(webJourneys.map(record => [record.journeyId,record]));
  const sms = new Map(smsConversations.map(record => [record.id,record]));
  const leads = new Map(leadJourneys.map(record => [record.checkpointId,record]));
  const used = new Set();
  const projected = checkpoints.filter(record => ['pvx_checkpoint','pvx_journey_state'].includes(record.recordType)).map(checkpoint => {
    const web = webs.get(checkpoint.attribution?.webJourneyId) || null;
    const leadId = checkpoint.attribution?.leadCheckpointId || web?.seed?.contact?.leadCheckpointId || '';
    const lead = leads.get(leadId) || null;
    if (lead) used.add(lead.checkpointId);
    return projectUnifiedProducerRecord(checkpoint, web, sms.get(checkpoint.attribution?.smsConversationId) || null, lead);
  });
  for (const lead of leadJourneys) if (!used.has(lead.checkpointId)) projected.push(projectUnifiedProducerRecord({},null,null,lead));
  return sortProducerActionQueue(projected,now);
}

export async function handleUnifiedProducerRecords(request,options={}) {
  const auth = authorizeProducer(request,options.env || {});
  if (!auth.ok) return auth.response;
  if (request.method !== 'GET') return error(405,'method_not_allowed','GET is required.');
  if (!options.pvxStore?.list || !options.smsStore?.list) return error(503,'storage_unavailable','Unified producer storage is unavailable.');
  const records = await loadUnifiedProducerRecords(options);
  return json({ ok:true, build:PVX_UNIFIED_PRODUCER_BUILD, count:records.length, records });
}
