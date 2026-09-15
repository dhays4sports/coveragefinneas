import { PVX_DISCOVERY_ORDERS, buildDiscoverySeed, normalizeProductTrack } from './pvx-discovery-plan-core.mjs';

export const SMS_PVX_MAPPING_BUILD = 'CF-APPOINTMENT-FIRST-1.0';
export const SMS_PVX_MAPPING_SCHEMA = '1.0';
export const SMS_PVX_MAPPING_CONTRACT = 'coveragefit-sms-pvx-mapping-v1';
export const SMS_PVX_ALLOWED_INTENTS = Object.freeze(['buyer', 'home_review', 'bundle', 'auto', 'life', 'business', 'tech']);
export const SMS_PVX_PRODUCER_SAFE_INTENTS = Object.freeze(['other', '']);

const DISCOVERY_ORDER = PVX_DISCOVERY_ORDERS.home;

const text = (value, max = 240) => String(value ?? '')
  .trim()
  .replace(/[<>\u0000-\u001f\u007f]/g, '')
  .slice(0, max);
const boolOrNull = value => value === true ? true : value === false ? false : null;
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function reviewReasonDiscovery(reason) {
  const normalized = text(reason, 40).toLowerCase();
  if (normalized === 'renewal') return { value: 'renewal_increase', words: 'Reviewing an upcoming renewal' };
  if (normalized === 'price') return { value: 'comparison', words: 'Reviewing price or premium' };
  if (normalized === 'coverage') return { value: 'something_else', words: 'Questions about current coverage' };
  if (normalized === 'nonrenewal') return { value: 'something_else', words: 'A nonrenewal or cancellation concern' };
  if (normalized === 'other') return { value: 'something_else', words: 'Another reason for reviewing' };
  return null;
}

function shoppingReason(intent, reason) {
  if (intent === 'buyer') return { value: 'buying_home', words: 'Buying a home' };
  if (intent === 'bundle') return { value: 'something_else', words: 'Reviewing home and auto together' };
  if (intent === 'home_review') return reviewReasonDiscovery(reason);
  if (intent === 'auto') {
    const value = text(reason, 40).toLowerCase();
    if (value === 'vehicle_change') return { value: 'life_change', words: 'Adding or changing a vehicle' };
    if (value === 'current_review') return { value: 'something_else', words: 'Reviewing current auto coverage' };
    if (value === 'new_options') return { value: 'comparison', words: 'Comparing new auto options' };
    return { value: 'something_else', words: 'Another auto insurance question' };
  }
  return null;
}

function inboundWords(transcript = []) {
  return (Array.isArray(transcript) ? transcript : [])
    .filter(item => item?.direction === 'inbound' && text(item.body))
    .slice(-12)
    .map(item => ({
      words: text(item.body, 800),
      occurredAt: text(item.occurredAt, 40),
      stateBefore: text(item.stateBefore, 60),
      stateAfter: text(item.stateAfter, 60),
      evidenceStatus: 'customer-reported'
    }));
}

function addressSeed(source = {}) {
  const formattedAddress = text(source.propertyAddress, 240);
  return {
    formattedAddress,
    line1: formattedAddress ? text(formattedAddress.split(',')[0], 120) : '',
    city: '',
    state: 'CA',
    postalCode: '',
    source: formattedAddress ? 'customer-reported' : 'unknown',
    confirmed: false,
    confirmationRequired: Boolean(formattedAddress)
  };
}

export function mapSmsToPvx(source = {}, options = {}) {
  const reviewContext = text(source.reviewContext, 120).toLowerCase();
  const inferredIntent = reviewContext.includes('buying')
    ? 'buyer'
    : reviewContext.includes('home and auto')
      ? 'bundle'
      : reviewContext.includes('current home')
        ? 'home_review'
        : '';
  const intent = text(source.intent || options.conversation?.intent || inferredIntent, 40).toLowerCase();
  const conversation = options.conversation && typeof options.conversation === 'object' ? options.conversation : {};
  const answers = source.answers && typeof source.answers === 'object' ? source.answers : source;
  const canEnterPvx = SMS_PVX_ALLOWED_INTENTS.includes(intent);
  const productTrack = normalizeProductTrack(source.productTrack, intent === 'auto' ? 'auto' : intent === 'bundle' ? 'bundle' : intent === 'buyer' ? 'buyer' : 'home');
  const reviewTrack = intent === 'home_review' ? 'home' : intent === 'buyer' ? (answers.autoReview === true ? 'bundle' : 'home') : intent === 'tech' ? text(answers.reviewTrack, 30) || 'general' : intent;
  const appointmentReason = text(answers.reviewReason || answers.autoNeed || answers.lifeGoal || answers.businessNeed || (intent === 'buyer' ? 'new_home_or_vehicle' : intent === 'tech' ? 'comparison' : 'coverage_concern'), 60).toLowerCase();
  const reason = shoppingReason(intent, intent === 'auto' ? answers.autoNeed : answers.reviewReason);
  const discoveryAnswers = {};
  const exactCustomerWords = {};
  if (reason) {
    discoveryAnswers.shoppingReason = reason.value;
    exactCustomerWords.shoppingReason = reason.words;
  }
  if (intent === 'buyer') discoveryAnswers.ownershipDuration = 'buying_now';

  const smsConsent = source.smsConsent && typeof source.smsConsent === 'object'
    ? source.smsConsent
    : conversation.smsConsent && typeof conversation.smsConsent === 'object'
      ? conversation.smsConsent
      : { status: 'active', providerStatus: 'unknown', source: 'legacy' };
  const mobile = text(source.mobile || conversation.contactPhone, 40);
  const customerWords = inboundWords(source.customerWords || conversation.transcript);
  const currentStage = canEnterPvx ? 'discovery_started' : 'producer-review';
  const discovery = buildDiscoverySeed({ productTrack, answers: discoveryAnswers, exactCustomerWords, answerSources: Object.fromEntries(Object.keys(discoveryAnswers).map(key => [key, 'ringcentral_sms'])), startedAt: text(source.createdAt || conversation.createdAt, 40) });

  return {
    schemaVersion: SMS_PVX_MAPPING_SCHEMA,
    contractId: SMS_PVX_MAPPING_CONTRACT,
    build: SMS_PVX_MAPPING_BUILD,
    canEnterPvx,
    producerSafeFallback: !canEnterPvx,
    fallbackReason: canEnterPvx ? '' : intent === 'other' ? 'producer_owned_request' : 'ambiguous_or_missing_intent',
    destination: canEnterPvx ? '/pvx/appointment/' : '',
    journey: {
      journeyId: text(source.journeyId, 120),
      currentStage: canEnterPvx ? 'appointment_requested' : currentStage,
      experience: canEnterPvx ? 'appointment_only' : 'producer_review',
      completedStages: [],
      resumeState: { status: 'active', exactStage: canEnterPvx ? 'appointment_requested' : currentStage, exactStep: canEnterPvx ? 'choose_time' : 'producer_handling' },
      smsConversationId: text(source.conversationId || conversation.id, 120),
      source: 'ringcentral_sms'
    },
    entry: {
      address: addressSeed(answers),
      source: 'ringcentral_sms',
      campaign: text(source.campaign, 160),
      campaignId: text(source.campaignId, 180),
      prefilled: true
    },
    discovery,
    homeProfilePrefill: {
      occupancy: text(answers.occupancy, 40),
      propertyAddress: text(answers.propertyAddress, 240),
      sourceEvidence: {
        occupancy: answers.occupancy ? 'customer-reported' : 'unknown',
        propertyAddress: answers.propertyAddress ? 'customer-reported' : 'unknown'
      }
    },
    contact: {
      mobile,
      identity: { firstName:text(answers.firstName, 60), mobile },
      leadCheckpointId: text(source.conversationId || conversation.id, 120),
      leadCaptureStatus: mobile ? 'confirmed' : 'not_confirmed',
      preferredMethod: mobile ? 'text' : '',
      contactConsent: false,
      callConsent: false,
      emailConsent: false,
      smsConsent: {
        status: text(smsConsent.status, 30) === 'opted_out' ? 'opted_out' : 'active',
        providerStatus: text(smsConsent.providerStatus, 30) || 'unknown',
        source: text(smsConsent.source, 40) || 'existing_sms_relationship',
        authoritative: true
      }
    },
    context: {
      appointment: {
        active: canEnterPvx,
        reviewTrack: canEnterPvx ? reviewTrack : '',
        reason: canEnterPvx ? appointmentReason : '',
        housing: canEnterPvx ? text(answers.housing, 40) : '',
        sourceType: canEnterPvx ? `sms_${intent}` : '',
        routePath: '/sms/continue/',
        propertyZip: canEnterPvx ? text(answers.propertyZip, 10) : '',
        closingDate: canEnterPvx ? text(answers.closingDateDisplay || answers.closingDate, 40) : '',
        autoNeed: canEnterPvx ? text(answers.autoNeed, 60) : '',
        lifeGoal: canEnterPvx ? text(answers.lifeGoal, 60) : '',
        businessType: canEnterPvx ? text(answers.businessType, 120) : '',
        businessNeed: canEnterPvx ? text(answers.businessNeed, 60) : '',
        quoteDetailsDeferred: canEnterPvx
      },
      professional: {
        active: intent === 'tech',
        program: intent === 'tech' ? 'technology' : '',
        role: intent === 'tech' ? text(answers.professionalRole, 80) : '',
        roleLabel: intent === 'tech' ? text(answers.professionalRole, 80).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase()) : '',
        eligibilityDetermined: false,
        discountDetermined: false
      }
    },
    homebuyerContext: {
      closingDate: text(answers.closingDate, 40),
      closingDateDisplay: text(answers.closingDateDisplay, 120),
      closingTiming: text(answers.closingTiming, 80),
      occupancy: text(answers.occupancy, 40),
      autoReview: boolOrNull(answers.autoReview)
    },
    bundleContext: {
      requested: intent === 'bundle' || answers.autoReview === true,
      bundleStatus: text(answers.bundleStatus, 60),
      autoReview: boolOrNull(answers.autoReview)
    },
    operational: {
      priority: answers.priority === 'rush' || source.rushRequested === true ? 'rush' : 'standard',
      rushRequested: answers.rushRequested === true || source.rushRequested === true,
      owner: text(source.owner || conversation.orchestration?.ownership?.owner, 40) || 'producer',
      automationMode: text(source.automationMode || conversation.orchestration?.automationMode, 40) || 'human_only',
      humanTakeover: text(conversation.state, 40) === 'human_takeover'
    },
    attribution: {
      source: text(source.source, 80) || '408farmers_sms',
      campaign: text(source.campaign, 160),
      campaignId: text(source.campaignId, 180),
      partnerId: text(source.partnerId || conversation.attribution?.partnerId, 64),
      partnerName: text(source.partnerName || conversation.attribution?.partnerName, 100),
      referralSource: text(source.referralSource || conversation.attribution?.referralSource, 60),
      entryMethod: text(source.entryMethod || conversation.attribution?.entryMethod, 30) || 'sms'
    },
    evidence: {
      status: 'customer-reported',
      customerWords,
      sourceRefs: customerWords.map((_, index) => `sms:${text(source.conversationId || conversation.id, 120)}:inbound:${index + 1}`)
    },
    semantics: Object.freeze({
      smsIntakeIsSnapshotSaved: false,
      smsPermissionIsCallOrEmailPermission: false,
      customerReportedIsVerified: false,
      quoteReadinessIsEligibility: false,
      topicIsRecommendation: false,
      topicResponseIsRecommendationResponse: false,
      discoveryAffectsProtectionScore: false,
      rushIsCoveragePromise: false
    })
  };
}

export function validateSmsPvxMapping(mapping = {}) {
  const errors = [];
  if (mapping.contractId !== SMS_PVX_MAPPING_CONTRACT) errors.push('contract');
  if (mapping.canEnterPvx && mapping.destination !== '/pvx/appointment/') errors.push('destination');
  if (mapping.canEnterPvx && !mapping.journey?.smsConversationId) errors.push('conversation_link');
  if (mapping.contact?.contactConsent || mapping.contact?.callConsent || mapping.contact?.emailConsent) errors.push('consent_escalation');
  if (mapping.semantics?.discoveryAffectsProtectionScore !== false) errors.push('score_boundary');
  if (!mapping.canEnterPvx && !mapping.producerSafeFallback) errors.push('producer_fallback');
  return { valid: errors.length === 0, errors };
}

export function cloneSmsPvxMapping(value) { return clone(value); }

export { DISCOVERY_ORDER };
