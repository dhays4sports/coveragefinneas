(() => {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'CONV-1.1';
  const PROFILE_KEY = 'coveragefit_prospect_profile_v1';
  const TRUSTED_SOURCE = '408farmers';
  const TRUSTED_CONTRACT = 'coveragefit-handoff-v1';
  const ASSESSMENT_ROUTE = '/assessment/';

  const clean = (value, max = 220) => String(value || '')
    .trim()
    .replace(/[<>\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max);

  const readJson = (storage, key) => {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
  };

  const profileFromStorage = () => window.CoverageFitPrefill?.get?.()
    || readJson(sessionStorage, PROFILE_KEY)
    || readJson(localStorage, PROFILE_KEY)
    || null;

  const normalizeSource = value => clean(value, 100).toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizeAssessment = value => clean(value, 40).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 254));
  const usableAddress = value => {
    const address = clean(value, 240);
    return address.length >= 5 && /[a-z]/i.test(address) && !/^(?:n\/?a|none|unknown|not provided|not available|tbd)$/i.test(address);
  };

  const build = () => {
    const profile = profileFromStorage();
    const context = window.CoverageFitPersonalization?.get?.() || null;
    const integration = profile?.integration || {};
    const journey = context?.journey || {};
    const permission = profile?.contactPermission || context?.contactPermission || {};

    const source = clean(journey.source || integration.source, 100);
    const contract = clean(journey.handoffContract || integration.handoffContract, 80);
    const senderBuild = clean(journey.senderBuild || integration.senderBuild, 80);
    const assessment = clean(journey.assessment || integration.assessment || 'home', 40);
    const contact = {
      name: clean(context?.identity?.displayName || profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '), 160),
      firstName: clean(context?.identity?.givenName || profile?.firstName, 80),
      lastName: clean(context?.identity?.familyName || profile?.lastName, 80),
      email: clean(context?.contact?.email || profile?.email, 254).toLowerCase(),
      phone: clean(context?.contact?.phone || profile?.phone, 40)
    };
    const property = {
      displayAddress: clean(context?.property?.displayAddress || profile?.propertyAddress || profile?.address?.formattedAddress, 240),
      street: clean(context?.property?.street || profile?.address?.street, 180),
      city: clean(context?.property?.city || profile?.address?.city, 100),
      state: clean(context?.property?.state || profile?.address?.state, 40),
      postalCode: clean(context?.property?.postalCode || profile?.address?.postalCode, 20)
    };

    const trustedContract = normalizeSource(source) === TRUSTED_SOURCE
      && contract === TRUSTED_CONTRACT
      && /^408-/i.test(senderBuild);
    const isHomeHandoff = Boolean(profile)
      && trustedContract
      && normalizeAssessment(assessment || 'home') === 'home';
    const permissionConfirmed = Boolean(permission.confirmed || context?.flags?.contactPermissionConfirmed);
    const hasRequiredContact = Boolean(contact.name && validEmail(contact.email));
    const hasAddress = usableAddress(property.displayAddress || property.street);
    const hasStructuredAddress = Boolean(property.street && property.city && property.state && property.postalCode);

    return Object.freeze({
      version: VERSION,
      build: BUILD,
      source,
      contract,
      senderBuild,
      assessment,
      profile,
      context,
      contact: Object.freeze(contact),
      property: Object.freeze(property),
      flags: Object.freeze({
        trustedContract,
        isHomeHandoff,
        permissionConfirmed,
        hasRequiredContact,
        hasAddress,
        hasStructuredAddress,
        directAssessmentEligible: isHomeHandoff,
        quickPropertyConfirmationEligible: isHomeHandoff && hasStructuredAddress,
        zeroRepeatEligible: isHomeHandoff && permissionConfirmed && hasRequiredContact
      }),
      destinationForTransition(fallback = '/home/') {
        return isHomeHandoff ? ASSESSMENT_ROUTE : fallback;
      },
      missingContactFields() {
        return [
          !contact.name ? 'name' : '',
          !validEmail(contact.email) ? 'email' : ''
        ].filter(Boolean);
      }
    });
  };

  let state = build();
  const api = Object.freeze({
    VERSION,
    BUILD,
    TRUSTED_SOURCE,
    TRUSTED_CONTRACT,
    ASSESSMENT_ROUTE,
    get: () => state,
    refresh: () => (state = build()),
    isUsableAddress: usableAddress
  });

  window.CoverageFitConversionHandoff = api;
  try {
    window.dispatchEvent(new CustomEvent('coveragefit:conversion-handoff-ready', {
      detail: {
        build: BUILD,
        directAssessmentEligible: state.flags.directAssessmentEligible,
        quickPropertyConfirmationEligible: state.flags.quickPropertyConfirmationEligible,
        zeroRepeatEligible: state.flags.zeroRepeatEligible
      }
    }));
  } catch (_) {}
})();
