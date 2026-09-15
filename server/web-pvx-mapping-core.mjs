import { normalizeAiCallerSeed, validateConversationalSeed } from './pvx-conversational-return-core.mjs';
import { PVX_DISCOVERY_ORDERS, buildDiscoverySeed, normalizeProductTrack } from './pvx-discovery-plan-core.mjs';

export const WEB_PVX_MAPPING_BUILD = '408-CF-PVX-WEB-1.1';
export const WEB_PVX_RELEVANCE_BUILD = '408-CF-PVX-RELEVANCE-1.2';
export const WEB_PVX_MAPPING_SCHEMA = '1.0';
export const WEB_PVX_MAPPING_CONTRACT = '408farmers-coveragefit-native-web-mapping-v1';

export const WEB_PVX_DISCOVERY_ORDER = PVX_DISCOVERY_ORDERS.home;

export const WEB_PVX_ENTRY_TYPES = Object.freeze([
  'homepage', 'home', 'condo', 'auto', 'buyer', 'home_auto', 'renter', 'professional', 'flyer', 'qr',
  'neighbor', 'snapshot', 'life', 'business', 'ai_caller', 'direct', 'legacy_recovery'
]);

const PROFESSIONAL_PROGRAMS = new Set(['healthcare', 'teachers', 'technology', 'engineers']);
const APPOINTMENT_REVIEW_TRACKS = new Set(['home', 'condo', 'auto', 'bundle', 'buyer', 'renter', 'life', 'business', 'general']);
const APPOINTMENT_REASONS = new Set([
  'price', 'upcoming_renewal', 'new_home_or_vehicle', 'coverage_concern', 'comparison',
  'nonrenewal_notice', 'renewal_change', 'shopping_price', 'buying_condo', 'coverage_review',
  'family_income', 'mortgage_home', 'final_expenses', 'children_future', 'business_legacy', 'not_sure',
  'new_family_change', 'new_home_debt', 'work_benefits_change', 'review_existing', 'just_starting'
]);
const APPOINTMENT_ENTRY_ROUTES = Object.freeze({
  home:['/home'], condo:['/condo'], auto:['/auto'], home_auto:['/auto-bundle'], buyer:['/buyer'], life:['/life'], business:['/business'],
  professional:['/tech','/teachers','/healthcare','/engineers']
});
const CUSTOMER_SELECTIONS = new Set([
  'start_snapshot', 'review_owned_home', 'buying_home', 'review_home_auto',
  'renter', 'contact_dylan', 'review_professional_home', 'secure_continue',
  'renewal_approaching', 'premium_increase', 'nonrenewal_concern',
  'coverage_concern', 'service_concern', 'bundle_review', 'long_relationship',
  'general_exploration'
]);
const RELEVANCE_REASONS = Object.freeze({
  renewal_approaching:{shoppingReason:'renewal_increase',words:'My renewal is approaching.'},
  premium_increase:{shoppingReason:'renewal_increase',words:'My price recently changed.'},
  buying_home:{shoppingReason:'buying_home',ownershipDuration:'buying_now',words:'I’m buying a home.'},
  nonrenewal_concern:{shoppingReason:'nonrenewal_concern',words:'I have a nonrenewal concern.'},
  coverage_concern:{shoppingReason:'something_else',words:'I have a coverage question.'},
  service_concern:{shoppingReason:'service_change',words:'I want a different service experience.'},
  bundle_review:{shoppingReason:'something_else',words:'I want to review home and auto together.'},
  long_relationship:{shoppingReason:'comparison',words:'I want to keep what works and check the fit.'},
  general_exploration:{shoppingReason:'comparison',words:'I’m simply exploring.'}
});
const SHOPPING_REASONS = new Set(['renewal_increase', 'buying_home', 'service_change', 'life_change', 'comparison', 'something_else']);
const IMPROVEMENT_PRIORITIES = new Set(['understanding', 'claim_support', 'agent_access', 'coordination', 'price_only', 'not_sure']);
const text = (value, max = 240) => String(value ?? '')
  .trim()
  .replace(/[<>\u0000-\u001f\u007f]/g, '')
  .slice(0, max);
const boolOrNull = value => value === true || value === 'true' || value === '1'
  ? true
  : value === false || value === 'false' || value === '0'
    ? false
    : null;

function firstValue(...values) {
  for (const value of values) {
    const cleaned = text(value);
    if (cleaned) return cleaned;
  }
  return '';
}

function address(source = {}) {
  const formattedAddress = firstValue(source.propertyAddress, source.property_address, source.address);
  const line1 = firstValue(source.propertyStreet, source.property_street, formattedAddress.split(',')[0]);
  const city = firstValue(source.propertyCity, source.property_city);
  const state = firstValue(source.propertyState, source.property_state, 'CA').toUpperCase().slice(0, 2);
  const postalCode = firstValue(source.propertyZip, source.property_zip).slice(0, 10);
  const known = Boolean(formattedAddress || line1);
  return {
    formattedAddress: text(formattedAddress, 240),
    line1: text(line1, 120),
    city: text(city, 80),
    state,
    postalCode,
    source: known ? 'customer-reported' : 'unknown',
    confirmed: false,
    confirmationRequired: known
  };
}

function priorityValues(value) {
  let values = value;
  if (typeof values === 'string' && values.trim().startsWith('[')) { try { values = JSON.parse(values); } catch (_) {} }
  if (typeof values === 'string') values = values.split(',');
  return Array.from(new Set((Array.isArray(values) ? values : []).map(item => text(item, 40).toLowerCase()).filter(item => IMPROVEMENT_PRIORITIES.has(item))));
}

function explicitDiscovery(selection, exactWords, source = {}) {
  const answers = {};
  const words = {};
  const relevance=RELEVANCE_REASONS[selection];
  if(relevance){answers.shoppingReason=relevance.shoppingReason;if(relevance.ownershipDuration)answers.ownershipDuration=relevance.ownershipDuration;words.shoppingReason=text(exactWords,240)||relevance.words;}
  if (selection === 'review_home_auto') {
    answers.shoppingReason = 'something_else';
    words.shoppingReason = text(exactWords, 240) || 'I want to review my home and auto together';
  }
  const suppliedReason = text(source.discoveryShoppingReason || source.discovery_shopping_reason || source.shoppingReason || source.shopping_reason, 40).toLowerCase();
  if (SHOPPING_REASONS.has(suppliedReason)) answers.shoppingReason = suppliedReason;
  const suppliedPriorities = priorityValues(source.discoveryImprovementPriorities || source.discovery_improvement_priorities || source.improvementPriorities || source.improvement_priorities);
  if (suppliedPriorities.length) answers.improvementPriorities = suppliedPriorities;
  const suppliedWords = text(source.discoveryShoppingWords || source.discovery_shopping_words, 240);
  if (suppliedWords) words.shoppingReason = suppliedWords;
  return { answers, exactCustomerWords: words, answerSources: Object.fromEntries(Object.keys(answers).map(key => [key, '408farmers_web'])) };
}

function normalizedEntryType(value) {
  const candidate = text(value, 40).toLowerCase();
  return WEB_PVX_ENTRY_TYPES.includes(candidate) ? candidate : 'direct';
}

export function mapWebToPvx(source = {}, options = {}) {
  const entryType = normalizedEntryType(source.entryType || source.entry_type);
  const customerSelection = text(source.customerSelection || source.customer_selection, 60).toLowerCase();
  const selection = CUSTOMER_SELECTIONS.has(customerSelection) ? customerSelection : 'start_snapshot';
  const professionalProgram = text(source.professionalProgram || source.professional_program, 40).toLowerCase();
  const inferredTrack = entryType === 'auto' ? 'auto' : entryType === 'home_auto' || selection === 'review_home_auto' || selection === 'bundle_review' ? 'bundle' : entryType === 'buyer' || selection === 'buying_home' ? 'buyer' : entryType === 'renter' || selection === 'renter' ? 'renter' : 'home';
  const productTrack = normalizeProductTrack(source.productTrack || source.product_track, inferredTrack);
  const explicit = explicitDiscovery(selection, source.customerWords || source.customer_words, source);
  const conversational = entryType === 'ai_caller' ? normalizeAiCallerSeed(source) : null;
  if (conversational) {
    Object.assign(explicit.answers, conversational.answers);
    Object.assign(explicit.exactCustomerWords, conversational.exactCustomerWords);
  }
  const propertyAddress = address(source);
  const routePath = text(source.routePath || source.route_path, 160) || '/';
  const campaignId = firstValue(source.campaignId, source.campaign_id);
  const campaignVariant = firstValue(source.campaignVariant, source.campaign_variant);
  const campaignZip = firstValue(source.campaignZip, source.campaign_zip);
  const sourceName = firstValue(source.source, '408farmers_web');
  const isHumanRoute = selection === 'contact_dylan' || Boolean(conversational?.producerSafeFallback);
  const discovery = buildDiscoverySeed({ productTrack, answers: explicit.answers, exactCustomerWords: explicit.exactCustomerWords, answerSources: explicit.answerSources });
  const leadCaptureStatus = text(source.leadCaptureStatus || source.lead_capture_status, 30).toLowerCase();
  const contactGranted = boolOrNull(source.contactConsent || source.contact_consent) === true && leadCaptureStatus === 'confirmed';
  const firstName = contactGranted ? text(source.firstName || source.first_name, 80) : '';
  const mobile = contactGranted ? text(source.mobile || source.phone, 40).replace(/[^0-9+]/g, '') : '';
  const consentAt = contactGranted ? text(source.consentAt || source.consent_at, 40) : '';
  const consentVersion = contactGranted ? text(source.consentVersion || source.consent_version, 80) : '';
  const marketingSmsRequested = boolOrNull(source.automatedMarketingSmsConsent || source.automated_marketing_sms_consent) === true;
  const marketingSmsVersion = contactGranted && marketingSmsRequested ? text(source.automatedMarketingSmsConsentVersion || source.automated_marketing_sms_consent_version, 100) : '';
  const marketingSmsCapturedAt = contactGranted && marketingSmsRequested ? text(source.automatedMarketingSmsConsentTimestamp || source.automated_marketing_sms_consent_timestamp, 40) : '';
  const marketingSmsGranted = contactGranted && marketingSmsRequested && Boolean(mobile && marketingSmsVersion && marketingSmsCapturedAt);
  const originalWords = text(conversational?.originalWords || source.customerWords || source.customer_words, 800);
  const conflictFields = Array.isArray(options.conflictFields)
    ? options.conflictFields.map(value => text(value, 80)).filter(Boolean)
    : [];
  const journeyGoal = text(source.journeyGoal || source.journey_goal, 40).toLowerCase();
  const appointmentReviewTrack = text(source.reviewTrack || source.review_track || productTrack, 40).toLowerCase();
  const appointmentReason = text(source.reviewReason || source.review_reason, 60).toLowerCase();
  const appointmentRouteAllowed = (APPOINTMENT_ENTRY_ROUTES[entryType] || []).some(prefix => routePath.startsWith(prefix));
  const appointmentOnly = journeyGoal === 'appointment'
    && appointmentRouteAllowed
    && contactGranted
    && APPOINTMENT_REVIEW_TRACKS.has(appointmentReviewTrack)
    && APPOINTMENT_REASONS.has(appointmentReason)
    && (entryType !== 'professional' || PROFESSIONAL_PROGRAMS.has(professionalProgram));

  return {
    schemaVersion: WEB_PVX_MAPPING_SCHEMA,
    contractId: WEB_PVX_MAPPING_CONTRACT,
    build: WEB_PVX_MAPPING_BUILD,
    canEnterPvx: !isHumanRoute,
    producerSafeFallback: isHumanRoute,
    fallbackDestination: selection === 'renter' ? '/contact/?intent=renters' : '/contact/',
    entry: {
      type: entryType,
      routePath,
      hostMode: text(source.hostMode || source.host_mode, 40) || '408farmers',
      source: sourceName,
      address: propertyAddress,
      customerSelection: selection,
      explicitlySelected: CUSTOMER_SELECTIONS.has(customerSelection),
      productTrack
    },
    journey: {
      journeyId: text(source.journeyId, 120),
      requestedGoal: journeyGoal,
      experience: appointmentOnly ? 'appointment_only' : 'coverage_review',
      currentStage: 'entry',
      completedStages: [],
      resumeState: {
        status: 'active',
        exactStage: 'entry',
        exactStep: discovery.currentQuestionId
      },
      source: sourceName
    },
    discovery,
    contact: {
      identity: { firstName, mobile },
      leadCheckpointId: contactGranted ? text(source.leadCheckpointId || source.lead_checkpoint_id, 120) : '',
      leadCaptureStatus: contactGranted ? 'confirmed' : leadCaptureStatus === 'skipped' ? 'skipped' : 'not_confirmed',
      agencyContactConsent: { granted: contactGranted, version: consentVersion, capturedAt: consentAt, scope: contactGranted ? 'agency_request_followup' : '', automatedSmsAuthorized: false },
      automatedMarketingSmsConsent: {
        requested: marketingSmsRequested,
        granted: marketingSmsGranted,
        state: marketingSmsGranted ? 'granted' : marketingSmsRequested ? 'invalid_evidence' : 'not_granted',
        version: marketingSmsGranted ? marketingSmsVersion : '',
        capturedAt: marketingSmsGranted ? marketingSmsCapturedAt : '',
        seller: marketingSmsGranted ? 'Virginia Tam Insurance Agency, Inc.' : '',
        scope: marketingSmsGranted ? 'recurring_automated_insurance_marketing_texts' : '',
        consentRequiredForPurchase: false,
        suppressionAuthoritative: true
      }
    },
    context: {
      buyer: {
        active: entryType === 'buyer' || selection === 'buying_home',
        closingDate: text(source.closingDate || source.closing_date, 40),
        occupancy: text(source.occupancy, 40),
        rush: boolOrNull(source.rush),
        evidenceStatus: 'customer-reported'
      },
      bundle: {
        active: entryType === 'home_auto' || selection === 'review_home_auto' || selection === 'bundle_review',
        currentBundleStatus: text(source.bundleStatus || source.bundle_status, 60),
        evidenceStatus: 'customer-reported'
      },
      condo: {
        active: entryType === 'condo' || appointmentReviewTrack === 'condo',
        propertyType: entryType === 'condo' || appointmentReviewTrack === 'condo' ? 'condo' : '',
        currentCarrier: text(source.currentCarrier || source.current_carrier, 60).toLowerCase(),
        renewalTiming: text(source.renewalTiming || source.renewal_timing, 40).toLowerCase(),
        autoVehicleCount: text(source.autoVehicleCount || source.auto_vehicle_count, 20).toLowerCase(),
        fivSignalVersion: text(source.fivSignalVersion || source.fiv_signal_version, 80),
        housingContext: text(source.housingContext || source.housing_context, 40).toLowerCase(),
        evidenceStatus: 'customer-reported'
      },
      professional: {
        active: PROFESSIONAL_PROGRAMS.has(professionalProgram),
        program: PROFESSIONAL_PROGRAMS.has(professionalProgram) ? professionalProgram : '',
        role: text(source.professionalRole || source.professional_role, 80),
        roleLabel: text(source.professionalRoleLabel || source.professional_role_label, 120),
        occupation: text(source.occupation, 120),
        eligibilityDetermined: false,
        discountDetermined: false
      },
      appointment: {
        active: appointmentOnly,
        reviewTrack: appointmentOnly ? appointmentReviewTrack : '',
        reason: appointmentOnly ? appointmentReason : '',
        housing: appointmentOnly ? text(source.housingContext || source.housing_context, 40).toLowerCase() : '',
        sourceType: appointmentOnly ? entryType : '',
        routePath: appointmentOnly ? routePath : '',
        propertyZip: appointmentOnly ? text(source.propertyZip || source.property_zip, 10) : '',
        closingDate: appointmentOnly ? text(source.closingDate || source.closing_date, 40) : '',
        reviewContext: appointmentOnly ? text(source.reviewContext || source.review_context, 120).toLowerCase() : '',
        autoNeed: appointmentOnly ? text(source.autoNeed || source.auto_need, 60).toLowerCase() : '',
        lifeGoal: appointmentOnly && entryType === 'life' ? appointmentReason : '',
        businessType: appointmentOnly ? text(source.businessType || source.business_type, 120) : '',
        businessNeed: appointmentOnly && entryType === 'business' ? appointmentReason : '',
        propertyType: appointmentOnly ? text(source.propertyType || source.property_type, 40).toLowerCase() : '',
        currentCarrier: appointmentOnly ? text(source.currentCarrier || source.current_carrier, 60).toLowerCase() : '',
        renewalTiming: appointmentOnly ? text(source.renewalTiming || source.renewal_timing, 40).toLowerCase() : '',
        autoVehicleCount: appointmentOnly ? text(source.autoVehicleCount || source.auto_vehicle_count, 20).toLowerCase() : '',
        fivSignalVersion: appointmentOnly ? text(source.fivSignalVersion || source.fiv_signal_version, 80) : '',
        quoteDetailsDeferred: appointmentOnly,
        dateOfBirthRequested: false,
        fullAddressRequested: false
      },
      conversation: conversational ? {
        channel: 'ai_caller',
        intent: conversational.intent,
        conversationId: conversational.conversationId,
        producerSafeFallback: conversational.producerSafeFallback,
        originalWordsPreserved: Boolean(conversational.originalWords)
      } : null
    },
    attribution: {
      source: sourceName,
      entryType,
      routePath,
      campaign: text(source.campaign, 160),
      campaignId: text(campaignId, 180),
      campaignVariant: text(campaignVariant, 80),
      campaignZip: text(campaignZip, 10),
      creative: text(source.creative, 120),
      partnerId: text(source.partnerId || source.partner_id, 64),
      partnerName: text(source.partnerName || source.partner_name, 100),
      realtorId: text(source.realtorId || source.realtor_id, 64),
      referralToken: text(source.referralToken || source.referral_token, 80),
      referralId: text(source.referralId || source.referral_id, 120),
      utm: {
        source: text(source.utmSource || source.utm_source, 120),
        medium: text(source.utmMedium || source.utm_medium, 120),
        campaign: text(source.utmCampaign || source.utm_campaign, 160),
        content: text(source.utmContent || source.utm_content, 160),
        term: text(source.utmTerm || source.utm_term, 160)
      }
    },
    evidence: {
      status: originalWords ? 'customer-reported' : 'unknown',
      exactCustomerWords: originalWords,
      sourceRefs: originalWords ? [`web:${entryType}:customer_selection`] : []
    },
    reconciliation: {
      agreementFields: [],
      conflictFields,
      unknownFields: (PVX_DISCOVERY_ORDERS[productTrack] || WEB_PVX_DISCOVERY_ORDER).filter(id => explicit.answers[id] == null),
      identityMergeAuthorized: false
    },
    consent: {
      reportSaved: false,
      contact: contactGranted,
      sms: false,
      call: false,
      email: false,
      knownContactIsPermission: false
    },
    ownership: {
      producerId: text(source.producerId || source.producer_id, 80) || 'dylan',
      silentlyReassigned: false
    },
    semantics: {
      campaignContextIsDiscoveryAnswer: false,
      pageRouteIsDiscoveryAnswer: false,
      customerReportedIsVerified: false,
      advisoryReviewTopicIsRecommendation: false,
      topicResponseIsRecommendationResponse: false,
      snapshotSavedIsContactPermission: false,
      smsPermissionIsCallOrEmailPermission: false,
      quoteReadinessIsCarrierEligibility: false,
      discoveryAffectsProtectionScore: false,
      actionReadinessInferred: false,
      changeScopeInferred: false,
      occupationProvesEligibility: false,
      identityMatchedByContactAlone: false,
      automatedSmsPermissionInferred: false,
      bindAuthorized: false
    }
  };
}

export function validateWebPvxMapping(mapping = {}) {
  const errors = [];
  if (mapping.contractId !== WEB_PVX_MAPPING_CONTRACT) errors.push('contract');
  if (!WEB_PVX_ENTRY_TYPES.includes(mapping.entry?.type)) errors.push('entry.type');
  if (mapping.semantics?.discoveryAffectsProtectionScore !== false) errors.push('score_boundary');
  if (mapping.semantics?.actionReadinessInferred !== false || mapping.semantics?.changeScopeInferred !== false) errors.push('readiness_boundary');
  if (mapping.semantics?.campaignContextIsDiscoveryAnswer !== false) errors.push('campaign_boundary');
  if (mapping.semantics?.snapshotSavedIsContactPermission !== false) errors.push('save_consent_boundary');
  if (mapping.consent?.sms !== false || mapping.consent?.call !== false || mapping.consent?.email !== false) errors.push('channel_consent');
  if (mapping.consent?.contact === true && (!mapping.contact?.identity?.firstName || !mapping.contact?.identity?.mobile || !mapping.contact?.agencyContactConsent?.version || !mapping.contact?.agencyContactConsent?.capturedAt)) errors.push('contact_consent_evidence');
  if (mapping.contact?.agencyContactConsent?.automatedSmsAuthorized !== false) errors.push('sms_inference');
  if (mapping.contact?.automatedMarketingSmsConsent?.granted === true && (!mapping.contact?.automatedMarketingSmsConsent?.version || !mapping.contact?.automatedMarketingSmsConsent?.capturedAt || !mapping.contact?.automatedMarketingSmsConsent?.seller || !mapping.contact?.identity?.mobile)) errors.push('marketing_sms_consent_evidence');
  if (mapping.context?.professional?.eligibilityDetermined !== false) errors.push('eligibility');
  if (mapping.journey?.requestedGoal === 'appointment' && mapping.journey?.experience !== 'appointment_only') errors.push('appointment_contract');
  if (mapping.reconciliation?.identityMergeAuthorized !== false) errors.push('identity');
  const prefillAllowed = mapping.entry?.type === 'ai_caller' ? (PVX_DISCOVERY_ORDERS[mapping.discovery?.productTrack] || WEB_PVX_DISCOVERY_ORDER) : ['shoppingReason', 'improvementPriorities', 'ownershipDuration'];
  if (mapping.discovery?.prefilledQuestionIds?.some(id => !prefillAllowed.includes(id))) errors.push('unsupported_prefill');
  if (mapping.entry?.type === 'ai_caller') {
    const conversationValidation = validateConversationalSeed({
      intent:mapping.context?.conversation?.intent,
      canEnterPvx:mapping.canEnterPvx,
      producerSafeFallback:mapping.producerSafeFallback,
      answers:mapping.discovery?.answers,
      consent:mapping.consent
    });
    if (!conversationValidation.valid) errors.push(...conversationValidation.errors.map(value=>`conversation:${value}`));
  }
  return { valid: errors.length === 0, errors };
}
