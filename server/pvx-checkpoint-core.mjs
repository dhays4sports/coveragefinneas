import {projectSoloDeskEventBestEffort} from './solo-desk-event-projection.mjs';
import { advancePvxSmsJourney, loadPvxSmsJourneyFromRequest } from './pvx-sms-journey-core.mjs';
import { advancePvxWebJourney, loadPvxWebJourneyFromRequest } from './pvx-web-journey-core.mjs';
import { extendReadinessRecord } from './pvx-readiness-core.mjs';
import { cleanDisplacementContext } from './pvx-displacement-core.mjs';

// Certified compatibility markers: checkpointType:'snapshot_saved' reportSaved:Boolean contact:Boolean sms:Boolean bindAuthorized:false TTL_DAYS=30 'Cache-Control':'no-store'

const TOKEN_PATTERN = /^pvx_[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_PATTERN = /^pvxc_[A-Za-z0-9_-]{16,80}$/;
const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
const MAX_BODY = 64000;
const text = (value, max = 240) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
const error = (status, code, message) => json({ ok: false, error: { code, message } }, status);

function sameOrigin(request) {
  try { const url = new URL(request.url), origin = request.headers.get('Origin'); return !origin || origin === url.origin; } catch (_) { return false; }
}

async function body(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return { response: error(413, 'payload_too_large', 'The Snapshot request is too large.') };
  try { return { value: JSON.parse(raw || '{}') }; } catch (_) { return { response: error(400, 'invalid_json', 'Valid JSON is required.') }; }
}

function randomToken(cryptoApi = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  let binary = '';
  bytes.forEach(value => { binary += String.fromCharCode(value); });
  const encoded = typeof btoa === 'function' ? btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : Buffer.from(bytes).toString('base64url');
  return `pvx_${encoded}`;
}

async function hashToken(token, cryptoApi = globalThis.crypto) {
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
}

function cleanSnapshot(snapshot) {
  const supportedContracts = new Set(['coveragefit-discovery-only-snapshot-v1', 'coveragefit-discovery-only-snapshot-v2']);
  if (!snapshot || !supportedContracts.has(snapshot.contractId) || snapshot.reportRevision !== '1' || snapshot.guardrails?.discoveryOnly !== true) return null;
  const forbidden = ['score', 'protectionScore', 'policyFindings', 'recommendations'];
  if (forbidden.some(key => key in snapshot && (key === 'policyFindings' || key === 'recommendations' ? snapshot[key]?.length : snapshot[key] != null))) return null;
  return {
    schemaVersion: text(snapshot.schemaVersion, 20) || '1.0', contractId: snapshot.contractId, reportRevision: '1', title: 'Your CoverageFit Snapshot',
    whyReviewing: snapshot.whyReviewing || null,
    whyNowThread: snapshot.whyNowThread || null,
    triggerNarrative: snapshot.triggerNarrative || null,
    wantsToImprove: Array.isArray(snapshot.wantsToImprove) ? snapshot.wantsToImprove.slice(0, 6) : [],
    homeContext: Array.isArray(snapshot.homeContext) ? snapshot.homeContext.slice(0, 3) : [],
    whatSeemsImportant: Array.isArray(snapshot.whatSeemsImportant) ? snapshot.whatSeemsImportant.slice(0, 3) : [],
    whatDylanWouldLookAtFirst: Array.isArray(snapshot.whatDylanWouldLookAtFirst) ? snapshot.whatDylanWouldLookAtFirst.slice(0, 3) : [],
    guardrails: { discoveryOnly: true, currentPolicyEvaluated: false, policyDeficiencyFound: false, protectionScoreCreated: false, eligibilityDetermined: false }
  };
}

function cleanReadinessHistory(value = {}) {
  try {
    return extendReadinessRecord({
      actionReadinessExpressions: Array.isArray(value.actionReadinessExpressions) ? value.actionReadinessExpressions.slice(0, 30) : [],
      changeScopeExpressions: Array.isArray(value.changeScopeExpressions) ? value.changeScopeExpressions.slice(0, 30) : [],
      desiredNextActions: Array.isArray(value.desiredNextActions) ? value.desiredNextActions.slice(0, 30) : []
    });
  } catch (_) { return null; }
}

function campaignDispositionFor(readiness = {}) {
  const action = [...(readiness.desiredNextActions || [])].at(-1)?.action;
  const pace = [...(readiness.actionReadinessExpressions || [])].at(-1)?.state;
  if (action === 'continue_later') return 'continue_later';
  if (pace === 'exploring') return 'exploring';
  return 'active';
}

function cleanContact(contact = {}) {
  return {
    name: text(contact.name, 160), mobile: text(contact.mobile, 40).replace(/[^0-9+().\-\s]/g, ''),
    email: text(contact.email, 254).toLowerCase(), preferredMethod: ['call', 'text', 'email'].includes(contact.preferredMethod) ? contact.preferredMethod : '',
    bestTime: text(contact.bestTime, 120), requestType: ['call', 'text', 'email', 'none'].includes(contact.requestType) ? contact.requestType : 'none',
    purpose: ['snapshot_explanation','selected_topics','comparison','quote_preparation','policy_review','other_question'].includes(contact.purpose) ? contact.purpose : '',
    question: text(contact.question, 600)
  };
}

function publicRecord(record) {
  return { snapshot: record.snapshot, displacementContext: record.displacementContext || null, checkpoint: { checkpointType: 'snapshot_saved', createdAt: record.createdAt }, access: { createdAt: record.createdAt, expiresAt: record.expiresAt, ttlDays: TTL_DAYS } };
}

async function checkpointAliasKey(value, cryptoApi = globalThis.crypto) {
  const candidate=text(value,90);if(!IDEMPOTENCY_PATTERN.test(candidate))return '';
  return `pvx/checkpoint-alias/${await hashToken(candidate,cryptoApi)}`;
}

function publicCreated(token,record,status=201){return json({ok:true,token,checkpoint:{checkpointType:'snapshot_saved',createdAt:record.createdAt,contactRequested:record.consent?.contact===true,smsPermitted:record.consent?.sms===true,callPermitted:record.consent?.call===true,emailPermitted:record.consent?.email===true},access:{createdAt:record.createdAt,expiresAt:record.expiresAt,ttlDays:TTL_DAYS,path:`/pvx/snapshot/?token=${encodeURIComponent(token)}`}},status)}

function comparablePhone(value) { return String(value || '').replace(/\D/g, '').slice(-10); }

async function authoritativeSmsPermission(smsJourney, operationsStore, mobile) {
  const conversationId = smsJourney?.record?.smsConversationId;
  if (!conversationId || !operationsStore?.get) return null;
  let conversation = null;
  for (const key of [`sms-live-conversations/${conversationId}`, `sms-conversations/${conversationId}`]) {
    conversation = await operationsStore.get(key).catch(() => null);
    if (conversation) break;
  }
  const status = text(conversation?.smsConsent?.status, 30).toLowerCase();
  const provider = text(conversation?.smsConsent?.providerStatus, 30).toLowerCase();
  const sameMobile = Boolean(comparablePhone(mobile) && comparablePhone(mobile) === comparablePhone(conversation?.contactPhone));
  return { allowed: status === 'active' && !['blocked', 'opted_out'].includes(provider) && sameMobile, status, providerStatus: provider, sameMobile };
}

function publicJourneyState(token, record, status = 201) {
  return json({
    ok: true,
    token,
    checkpoint: {
      checkpointType: record.checkpointType,
      reportSaved: record.consent?.reportSaved === true,
      contactRequested: record.consent?.contact === true,
      createdAt: record.createdAt
    },
    access: {
      continuationPath: `/pvx/continue/?token=${encodeURIComponent(token)}`,
      crossDeviceSaved: record.consent?.reportSaved === true
    }
  }, status);
}

export async function handlePVXCheckpoint(request, { store, journeyStore, operationsStore, now = new Date(), cryptoApi = globalThis.crypto, env = {}, waitUntil = null } = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'The Snapshot request must come from CoverageFit.');
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  const action = text(parsed.value?.action, 30) || 'create';
  if (!store?.get || !store?.setJSON) return error(503, 'storage_unavailable', 'Secure Snapshot storage is unavailable.');
  if (action === 'read') {
    const token = text(parsed.value?.token, 80);
    if (!TOKEN_PATTERN.test(token)) return error(404, 'snapshot_unavailable', 'This saved Snapshot is unavailable.');
    const key = `pvx/checkpoint/${await hashToken(token, cryptoApi)}`;
    const record = await store.get(key);
    if (!record) return error(404, 'snapshot_unavailable', 'This saved Snapshot is unavailable.');
    if (Date.parse(record.expiresAt) <= now.getTime()) {
      await store.delete?.(key).catch(() => {});
      return error(410, 'snapshot_expired', 'This saved Snapshot has expired.');
    }
    return json({ ok: true, ...publicRecord(record) });
  }
  if (action === 'continue' || action === 'contact_only') {
    const snapshot=cleanSnapshot(parsed.value?.snapshot);if(!snapshot)return error(422,'invalid_snapshot','A discovery-only CoverageFit Snapshot is required.');
    const readiness=cleanReadinessHistory(parsed.value);if(!readiness)return error(422,'invalid_readiness','The readiness history is invalid.');
    const contact=cleanContact(parsed.value?.contact),contactRequested=action==='contact_only'&&Boolean(parsed.value?.consent?.contact);
    if(action==='contact_only'&&(!contactRequested||!contact.name||(!contact.mobile&&!contact.email)))return error(422,'contact_incomplete','A name and mobile or email are required to ask Dylan to follow up.');
    const channel={reportSaved:false,contact:contactRequested,sms:Boolean(contactRequested&&parsed.value?.consent?.sms),call:Boolean(contactRequested&&parsed.value?.consent?.call),email:Boolean(contactRequested&&parsed.value?.consent?.email),smsSource:text(parsed.value?.consent?.smsSource,60)};
    if(channel.sms&&(!contact.mobile||contact.preferredMethod!=='text'))return error(422,'sms_consent_invalid','SMS permission requires a mobile number and text preference.');
    if(channel.call&&(!contact.mobile||contact.preferredMethod!=='call'))return error(422,'call_consent_invalid','Call permission requires a mobile number and call preference.');
    if(channel.email&&(!contact.email||contact.preferredMethod!=='email'))return error(422,'email_consent_invalid','Email permission requires an email address and email preference.');
    const idempotencyKey=text(parsed.value?.idempotencyKey||parsed.value?.idempotency_key,90),aliasKey=await checkpointAliasKey(idempotencyKey,cryptoApi);
    if(aliasKey){const alias=await store.get(aliasKey).catch(()=>null);if(alias?.token&&TOKEN_PATTERN.test(alias.token)){const existing=await store.get(`pvx/checkpoint/${await hashToken(alias.token,cryptoApi)}`).catch(()=>null);if(existing&&Date.parse(existing.expiresAt)>now.getTime())return publicJourneyState(alias.token,existing,200);}}
    const token=randomToken(cryptoApi),createdAt=now.toISOString(),expiresAt=new Date(now.getTime()+TTL_MS).toISOString(),smsJourney=await loadPvxSmsJourneyFromRequest(request,{store:journeyStore,now}),webJourney=await loadPvxWebJourneyFromRequest(request,{store:journeyStore,now}),displacementContext=cleanDisplacementContext(parsed.value?.displacementContext||{},now),record={schemaVersion:'1.0',recordType:'pvx_journey_state',checkpointType:contactRequested?'contact_requested':'journey_continued',checkpointId:idempotencyKey||`journey_${createdAt}`,createdAt,expiresAt,snapshot,contact:contactRequested?contact:{},consent:channel,campaignDisposition:campaignDispositionFor(readiness),displacementContext,attribution:{...(parsed.value?.attribution||{}),...(smsJourney?{smsJourneyId:smsJourney.record.journeyId,smsConversationId:smsJourney.record.smsConversationId}:{}),...(webJourney?{webJourneyId:webJourney.record.journeyId,leadCheckpointId:webJourney.record.seed?.contact?.leadCheckpointId||''}:{})},topicResponses:Array.isArray(parsed.value?.topicResponses)?parsed.value.topicResponses.slice(0,3):[],actionReadinessExpressions:readiness.actionReadinessExpressions,changeScopeExpressions:readiness.changeScopeExpressions,desiredNextActions:readiness.desiredNextActions,leadCheckpoints:contactRequested?[{checkpointType:'contact_requested',reportRevision:'',createdAt}]:[],reportRevisions:[],producerNotification:{status:contactRequested?'pending':'not_requested',dedupeKey:contactRequested?`snapshot-contact:${idempotencyKey||createdAt}`:''},resumeState:{status:'active',exactStage:'continuation',exactStep:'choice',updatedAt:createdAt},authorization:{bindAuthorized:false}};
    const recordKey=`pvx/checkpoint/${await hashToken(token,cryptoApi)}`;
    await store.setJSON(recordKey,record,{metadata:{createdAt,updatedAt:createdAt,expiresAt,checkpointType:record.checkpointType,contactRequested}});
    if(options.db)await projectSoloDeskEventBestEffort({db:options.db,env},{kind:'journey',record,recordKey});
    if(aliasKey)await store.setJSON(aliasKey,{schemaVersion:'1.0',recordType:'pvx_checkpoint_alias',token,checkpointId:record.checkpointId,createdAt,expiresAt},{metadata:{recordType:'pvx_checkpoint_alias',createdAt,updatedAt:createdAt,expiresAt},onlyIfNew:true});
    const details={reviewTopics:snapshot.whatDylanWouldLookAtFirst,topicResponses:record.topicResponses,requestedProducerAction:contactRequested?'contact_requested':'none'};
    if(smsJourney)await advancePvxSmsJourney(smsJourney,{store:journeyStore,operationsStore,now,stage:'snapshot_viewed',currentStage:'snapshot',currentStep:contactRequested?'contact_requested':'continuing',details});
    if(webJourney)await advancePvxWebJourney(webJourney,{store:journeyStore,db:options.db||null,now,env,waitUntil,stage:'snapshot_viewed',currentStep:contactRequested?'contact_requested':'continuing',details});
    return publicJourneyState(token,record,201);
  }
  if (action === 'contact') {
    const token=text(parsed.value?.token,80);if(!TOKEN_PATTERN.test(token))return error(404,'snapshot_unavailable','This saved Snapshot is unavailable.');
    const key=`pvx/checkpoint/${await hashToken(token,cryptoApi)}`,record=await store.get(key);if(!record||Date.parse(record.expiresAt)<=now.getTime())return error(404,'snapshot_unavailable','This saved Snapshot is unavailable.');
    const contact=cleanContact(parsed.value?.contact),smsJourney=await loadPvxSmsJourneyFromRequest(request,{store:journeyStore,now}),webJourney=await loadPvxWebJourneyFromRequest(request,{store:journeyStore,now});
    const consent={reportSaved:record.consent?.reportSaved===true,contact:Boolean(parsed.value?.consent?.contact),sms:Boolean(parsed.value?.consent?.sms),call:Boolean(parsed.value?.consent?.call),email:Boolean(parsed.value?.consent?.email),smsSource:text(parsed.value?.consent?.smsSource,60)};
    if(smsJourney){const authoritative=await authoritativeSmsPermission(smsJourney,operationsStore,contact.mobile);consent.sms=Boolean(consent.contact&&contact.preferredMethod==='text'&&authoritative?.allowed);consent.smsSource=authoritative?.allowed?'existing_global_sms_consent':'authoritative_sms_suppression';}
    if(!consent.contact||!contact.name||(!contact.mobile&&!contact.email))return error(422,'contact_incomplete','A name and mobile or email are required to ask Dylan to follow up.');
    if(consent.sms&&(!contact.mobile||contact.preferredMethod!=='text'))return error(422,'sms_consent_invalid','SMS permission requires a mobile number and text preference.');
    if(consent.call&&(!contact.mobile||contact.preferredMethod!=='call'))return error(422,'call_consent_invalid','Call permission requires a mobile number and call preference.');
    if(consent.email&&(!contact.email||contact.preferredMethod!=='email'))return error(422,'email_consent_invalid','Email permission requires an email address and email preference.');
    const updatedAt=now.toISOString();record.contact=contact;record.consent={...record.consent,...consent};record.contactRequestedAt=record.contactRequestedAt||updatedAt;record.producerNotification={status:record.producerNotification?.status==='sent'?'sent':'pending',dedupeKey:`snapshot-contact:${record.checkpointId||record.createdAt}`};
    await store.setJSON(key,record,{metadata:{createdAt:record.createdAt,updatedAt,expiresAt:record.expiresAt,checkpointType:'snapshot_saved',contactRequested:true}});
    if(options.db)await projectSoloDeskEventBestEffort({db:options.db,env},{kind:'journey',record,recordKey:key});
    const details={reviewTopics:record.snapshot.whatDylanWouldLookAtFirst,topicResponses:record.topicResponses,preferredContactChannel:contact.preferredMethod,requestedContactTime:contact.bestTime,contactPurpose:contact.purpose,contactQuestion:contact.question,requestedProducerAction:'contact_requested'};
    if(smsJourney)await advancePvxSmsJourney(smsJourney,{store:journeyStore,operationsStore,now,stage:'snapshot_saved',currentStage:'snapshot',currentStep:'contact_requested',details});
    if(webJourney)await advancePvxWebJourney(webJourney,{store:journeyStore,db:options.db||null,now,env,waitUntil,stage:'snapshot_saved',currentStep:'contact_requested',details});
    return consent.reportSaved?publicCreated(token,record,200):publicJourneyState(token,record,200);
  }
  const snapshot = cleanSnapshot(parsed.value?.snapshot);
  if (!snapshot) return error(422, 'invalid_snapshot', 'A discovery-only CoverageFit Snapshot is required.');
  const readiness = cleanReadinessHistory(parsed.value);
  if (!readiness) return error(422, 'invalid_readiness', 'The readiness history is invalid.');
  const contact = cleanContact(parsed.value?.contact);
  const smsJourney = await loadPvxSmsJourneyFromRequest(request, { store: journeyStore, now });
  const webJourney = await loadPvxWebJourneyFromRequest(request, { store: journeyStore, now });
  const consent = {
    reportSaved: Boolean(parsed.value?.consent?.reportSaved), contact: Boolean(parsed.value?.consent?.contact),
    sms: Boolean(parsed.value?.consent?.sms), call: Boolean(parsed.value?.consent?.call), email: Boolean(parsed.value?.consent?.email),
    smsSource: text(parsed.value?.consent?.smsSource, 60)
  };
  if (smsJourney) {
    const authoritative = await authoritativeSmsPermission(smsJourney, operationsStore, contact.mobile);
    consent.sms = Boolean(consent.contact && contact.preferredMethod === 'text' && authoritative?.allowed);
    consent.smsSource = authoritative?.allowed ? 'existing_global_sms_consent' : 'authoritative_sms_suppression';
  }
  if (!consent.reportSaved) return error(422, 'report_save_required', 'Choose to save the Snapshot first.');
  if (consent.contact && (!contact.name || (!contact.mobile && !contact.email))) return error(422, 'contact_incomplete', 'A name and mobile or email are required to ask Dylan to follow up.');
  if (consent.sms && (!consent.contact || !contact.mobile || contact.preferredMethod !== 'text')) return error(422, 'sms_consent_invalid', 'SMS permission requires contact permission, a mobile number, and text preference.');
  if (consent.call && (!consent.contact || !contact.mobile || contact.preferredMethod !== 'call')) return error(422, 'call_consent_invalid', 'Call permission requires contact permission, a mobile number, and call preference.');
  if (consent.email && (!consent.contact || !contact.email || contact.preferredMethod !== 'email')) return error(422, 'email_consent_invalid', 'Email permission requires contact permission, an email address, and email preference.');
  const idempotencyKey=text(parsed.value?.idempotencyKey||parsed.value?.idempotency_key,90),aliasKey=await checkpointAliasKey(idempotencyKey,cryptoApi);
  if(aliasKey){const alias=await store.get(aliasKey).catch(()=>null);if(alias?.token&&TOKEN_PATTERN.test(alias.token)){const existing=await store.get(`pvx/checkpoint/${await hashToken(alias.token,cryptoApi)}`).catch(()=>null);if(existing&&Date.parse(existing.expiresAt)>now.getTime())return publicCreated(alias.token,existing,200);}}
  const token = randomToken(cryptoApi), createdAt = now.toISOString(), expiresAt = new Date(now.getTime() + TTL_MS).toISOString();
  const attribution = { ...(parsed.value?.attribution || {}), ...(smsJourney ? { smsJourneyId: smsJourney.record.journeyId, smsConversationId: smsJourney.record.smsConversationId } : {}), ...(webJourney ? { webJourneyId:webJourney.record.journeyId, leadCheckpointId:webJourney.record.seed?.contact?.leadCheckpointId||'' } : {}) };
  const displacementContext = cleanDisplacementContext(parsed.value?.displacementContext || {}, now);
  const record = {
    schemaVersion: '1.0', recordType: 'pvx_checkpoint', checkpointType: 'snapshot_saved', checkpointId:idempotencyKey||`checkpoint_${createdAt}`, createdAt, expiresAt, snapshot,
    contact: consent.contact ? contact : {}, consent, attribution, displacementContext,
    topicResponses: Array.isArray(parsed.value?.topicResponses) ? parsed.value.topicResponses.slice(0, 3) : [],
    actionReadinessExpressions: readiness.actionReadinessExpressions,
    changeScopeExpressions: readiness.changeScopeExpressions,
    desiredNextActions: readiness.desiredNextActions,
    leadCheckpoints:[{checkpointType:'snapshot_saved',reportRevision:'1',createdAt}],reportRevisions:[],
    producerNotification: { status: consent.contact ? 'pending' : 'not_requested',dedupeKey:consent.contact?`snapshot-contact:${idempotencyKey||createdAt}`:'' }, campaignDisposition:campaignDispositionFor(readiness), authorization: { bindAuthorized: false }
  };
  const recordKey = `pvx/checkpoint/${await hashToken(token, cryptoApi)}`;
  await store.setJSON(recordKey, record, { metadata: { createdAt, updatedAt: createdAt, expiresAt, checkpointType: 'snapshot_saved', contactRequested: consent.contact }, onlyIfNew: true });
  if(options.db)await projectSoloDeskEventBestEffort({db:options.db,env},{kind:'journey',record,recordKey});
  if(aliasKey)await store.setJSON(aliasKey,{schemaVersion:'1.0',recordType:'pvx_checkpoint_alias',token,checkpointId:record.checkpointId,createdAt,expiresAt},{metadata:{recordType:'pvx_checkpoint_alias',createdAt,updatedAt:createdAt,expiresAt},onlyIfNew:true});
  if (smsJourney) await advancePvxSmsJourney(smsJourney, {
    store: journeyStore, operationsStore, now, stage: 'snapshot_saved', currentStage: 'snapshot', currentStep: 'saved', completedStage: 'snapshot_saved',
    details: { reviewTopics: snapshot.whatDylanWouldLookAtFirst, topicResponses: record.topicResponses, preferredContactChannel: contact.preferredMethod, requestedContactTime:contact.bestTime, contactPurpose:contact.purpose, contactQuestion:contact.question, requestedProducerAction: consent.contact ? 'contact_requested' : 'none' }
  });
  if(webJourney)await advancePvxWebJourney(webJourney,{store:journeyStore,db:options.db||null,now,env,waitUntil,stage:'snapshot_saved',currentStep:'saved',completedStage:'snapshot_saved',details:{reviewTopics:snapshot.whatDylanWouldLookAtFirst,topicResponses:record.topicResponses,preferredContactChannel:contact.preferredMethod,requestedContactTime:contact.bestTime,contactPurpose:contact.purpose,contactQuestion:contact.question,requestedProducerAction:consent.contact?'contact_requested':'none'}});
  return publicCreated(token,record,201);
}

export { TOKEN_PATTERN, IDEMPOTENCY_PATTERN, TTL_DAYS, cleanSnapshot, cleanContact, cleanReadinessHistory, campaignDispositionFor, randomToken, hashToken, checkpointAliasKey, authoritativeSmsPermission, publicJourneyState };
