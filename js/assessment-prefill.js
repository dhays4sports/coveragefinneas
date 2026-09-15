(() => {
  'use strict';

  const PROFILE_KEY = 'coveragefit_prospect_profile_v1';
  const PROPERTY_KEY = 'coveragefit_property_profile_v1';
  const TRIGGER_KEY = 'coveragefit_trigger';
  const CONTEXT_KEY = 'coveragefit_review_context_v1';

  const clean = (value, max = 220) => String(value || '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, max);
  const readJson = (storage, key) => {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
  };
  const writeJson = (storage, key, value) => {
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  };

  const getProfile = () => window.CoverageFitPrefill?.get?.()
    || readJson(sessionStorage, PROFILE_KEY)
    || readJson(localStorage, PROFILE_KEY)
    || null;

  const normalizeContext = value => clean(value, 120).toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
  const triggerFor = value => {
    const context = normalizeContext(value);
    if (!context) return '';
    if (/\bnon[\s-]*renew|not\s+(?:being\s+)?renew|coverage\s+(?:is\s+)?ending|carrier\s+(?:is\s+)?leaving|cancel(?:led|ation)?\b/.test(context)) return 'non-renewal';
    if (/buying|purchas|new home|homebuyer/.test(context)) return 'homebuyer';
    if (/renew/.test(context)) return 'renewal';
    if (/premium|rate increase|price increase/.test(context)) return 'premium-increase';
    if (/remodel|renovat/.test(context)) return 'remodel';
    if (/family|baby|child/.test(context)) return 'new-family';
    if (/rental|landlord/.test(context)) return 'landlord';
    return '';
  };

  const profile = getProfile();
  const personalizationContext = window.CoverageFitPersonalization?.get?.() || null;
  const conversionHandoff = window.CoverageFitConversionHandoff?.get?.() || null;
  const hasProfile = personalizationContext ? Boolean(personalizationContext.flags?.hasProfile) : Boolean(profile);
  if (!hasProfile) {
    window.CoverageFitAssessmentPrefill = { applied: false, profile: null, context: personalizationContext, reviewContext: '', trigger: '' };
    return;
  }

  const reviewContext = clean(personalizationContext?.journey?.reviewReason || profile?.reviewContext, 120);
  const trigger = triggerFor(reviewContext);
  if (reviewContext) {
    writeJson(sessionStorage, CONTEXT_KEY, { value: reviewContext, receivedAt: profile.receivedAt || new Date().toISOString() });
  }
  if (trigger) {
    try { sessionStorage.setItem(TRIGGER_KEY, trigger); } catch (_) {}
  }

  const PI = window.CoverageFitPropertyIntelligence;
  const existingProperty = PI?.load?.() || readJson(localStorage, PROPERTY_KEY) || readJson(sessionStorage, PROPERTY_KEY);
  let propertySeeded = false;
  const sourceAddress = profile?.address || {};
  const contextProperty = personalizationContext?.property || {};
  const formatted = clean(contextProperty.displayAddress || profile?.propertyAddress || sourceAddress.formattedAddress, 220);
  const addressInput = {
    formatted,
    line1: clean(contextProperty.street || sourceAddress.street, 180),
    city: clean(contextProperty.city || sourceAddress.city, 100),
    state: clean(contextProperty.state || sourceAddress.state, 2).toUpperCase(),
    postalCode: clean(contextProperty.postalCode || sourceAddress.postalCode, 10),
    county: clean(contextProperty.county || sourceAddress.county, 100),
    country: clean(contextProperty.country || sourceAddress.country || 'US', 2).toUpperCase(),
    providerPlaceId: clean(contextProperty.placeId || sourceAddress.placeId, 180)
  };

  const hasIncomingAddress = Boolean(addressInput.formatted || addressInput.line1 || addressInput.postalCode);
  const incomingAddress = PI?.normalizeAddress?.(addressInput) || null;
  const existingKey = existingProperty?.address?.normalizedKey || '';
  const incomingKey = incomingAddress?.normalizedKey || '';
  const replaceStaleProperty = Boolean(
    conversionHandoff?.flags?.isHomeHandoff
      && hasIncomingAddress
      && existingProperty
      && incomingKey
      && existingKey !== incomingKey
  );

  if (PI && hasIncomingAddress && (!existingProperty || replaceStaleProperty)) {
    const seeded = PI.createProfile({
      address: addressInput,
      provider: { id: '408farmers-prefill', name: '408FARMERS intake', defaultConfidence: 0.9 },
      status: 'prefilled_pending_confirmation'
    });
    PI.save(seeded);
    try { sessionStorage.setItem(PROPERTY_KEY, JSON.stringify(seeded)); } catch (_) {}
    propertySeeded = true;
  }

  window.CoverageFitAssessmentPrefill = {
    applied: true,
    profile,
    context: personalizationContext,
    reviewContext,
    trigger,
    propertySeeded,
    replacedStaleProperty: replaceStaleProperty,
    directAssessment: Boolean(conversionHandoff?.flags?.directAssessmentEligible),
    getReviewContext: () => reviewContext
  };

  try {
    window.dispatchEvent(new CustomEvent('coveragefit:assessment-prefill-ready', {
      detail: {
        applied: true,
        hasReviewContext: Boolean(reviewContext),
        trigger,
        propertySeeded,
        replacedStaleProperty: replaceStaleProperty,
        directAssessment: Boolean(conversionHandoff?.flags?.directAssessmentEligible),
        source: personalizationContext?.journey?.source || profile?.integration?.source || ''
      }
    }));
  } catch (_) {}
})();
