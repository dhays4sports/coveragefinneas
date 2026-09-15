(() => {
  'use strict';

  const VERSION = '1.5';
  const STORAGE_KEY = 'coveragefit_prospect_profile_v1';
  const SESSION_STORAGE_KEY = STORAGE_KEY;
  const LOCAL_STORAGE_KEY = STORAGE_KEY;
  const TRANSITION_STORAGE_KEY = 'coveragefit_transition_v1';
  const WELCOME_STORAGE_KEY = 'coveragefit_transition_welcome_v1';
  const PERSONALIZATION_STORAGE_KEY = 'coveragefit_personalization_context_v1';
  const TRANSITION_ROUTE = '/transition/';
  const PII_KEYS = [
    'first_name', 'last_name', 'phone', 'email', 'property_address', 'review_context', 'home_review_goal', 'occupation_segment', 'housing_context', 'review_timing', 'segment',
    'closing_date', 'occupancy', 'closing_urgency', 'partner_id', 'referral_source', 'launch_surface',
    'property_street', 'property_city', 'property_county', 'property_state',
    'property_zip', 'property_country', 'property_place_id', 'address_selection_method'
  ];
  const MARKER_KEYS = [
    'prefill', 'handoff_version', 'next', 'lead_captured', 'lead_capture_status',
    'sender_build', 'handoff_contract', 'contact_consent', 'consent',
    'consent_at', 'consent_version', 'submitted_at'
  ];

  const clean = (value, max = 180) => String(value || '')
    .trim()
    .replace(/[<>\u0000-\u001F\u007F]/g, '')
    .slice(0, max);

  const cleanEmail = (value) => clean(value, 254).toLowerCase();
  const cleanPhone = (value) => clean(value, 40).replace(/[^0-9+().\-\s]/g, '');
  const trueLike = value => /^(?:1|true|yes|on|accepted|confirmed)$/i.test(clean(value, 24));

  const safeSet = (storage, key, value) => {
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  };

  const safeGet = (storage, key) => {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
  };

  const normalizeRoute = (value, fallback = '/home/') => {
    const route = clean(value, 220);
    if (!route || !route.startsWith('/') || route.startsWith('//')) return fallback;
    try {
      const parsed = new URL(route, window.location.origin);
      if (parsed.origin !== window.location.origin) return fallback;
      const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      if (parsed.pathname === TRANSITION_ROUTE || parsed.pathname === '/transition') return fallback;
      return normalized;
    } catch (_) {
      return fallback;
    }
  };

  const params = new URLSearchParams(window.location.search);
  const isPrefill = params.get('prefill') === '1' || PII_KEYS.some((key) => params.has(key));

  const current = () => safeGet(sessionStorage, SESSION_STORAGE_KEY)
    || safeGet(localStorage, LOCAL_STORAGE_KEY)
    || null;

  const clear = () => {
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch (_) {}
    try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(TRANSITION_STORAGE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(WELCOME_STORAGE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(PERSONALIZATION_STORAGE_KEY); } catch (_) {}
  };

  if (!isPrefill) {
    window.CoverageFitPrefill = { version: VERSION, storageKey: STORAGE_KEY, get: current, clear };
    return;
  }

  const firstName = clean(params.get('first_name'), 80);
  const lastName = clean(params.get('last_name'), 80);
  const fullName = clean([firstName, lastName].filter(Boolean).join(' '), 160);
  const propertyAddress = clean(params.get('property_address'), 220);

  const source = clean(params.get('source'), 80) || '408farmers';
  const handoffContract = clean(params.get('handoff_contract'), 80);
  const senderBuild = clean(params.get('sender_build'), 80);
  const leadCaptureStatus = clean(params.get('lead_capture_status'), 40);
  const explicitConsent = trueLike(params.get('contact_consent') || params.get('consent'));
  const contractConsent = source.toLowerCase().replace(/[^a-z0-9]/g, '') === '408farmers'
    && handoffContract === 'coveragefit-handoff-v1'
    && /^408-/i.test(senderBuild)
    && Boolean(leadCaptureStatus || trueLike(params.get('lead_captured')));

  const profile = {
    version: VERSION,
    firstName,
    lastName,
    fullName,
    phone: cleanPhone(params.get('phone')),
    email: cleanEmail(params.get('email')),
    propertyAddress,
    reviewContext: clean(params.get('review_context') || params.get('segment'), 120),
    homeReviewGoal: clean(params.get('home_review_goal'), 80),
    occupationSegment: clean(params.get('occupation_segment'), 120),
    housingContext: clean(params.get('housing_context'), 120),
    reviewTiming: clean(params.get('review_timing'), 80),
    closingDate: clean(params.get('closing_date'), 40),
    occupancy: clean(params.get('occupancy'), 40),
    closingUrgency: clean(params.get('closing_urgency'), 40),
    contactPermission: {
      confirmed: Boolean(explicitConsent || contractConsent),
      status: explicitConsent ? 'confirmed' : contractConsent ? 'contract-confirmed' : 'unverified',
      basis: explicitConsent ? 'explicit_handoff_marker' : contractConsent ? '408farmers_required_form_contract' : '',
      source,
      contract: handoffContract,
      capturedAt: clean(params.get('consent_at') || params.get('submitted_at'), 40),
      version: clean(params.get('consent_version'), 40)
    },
    address: {
      formattedAddress: propertyAddress,
      street: clean(params.get('property_street'), 160),
      city: clean(params.get('property_city'), 100),
      county: clean(params.get('property_county'), 100),
      state: clean(params.get('property_state'), 40),
      postalCode: clean(params.get('property_zip'), 20),
      country: clean(params.get('property_country'), 40),
      placeId: clean(params.get('property_place_id'), 180),
      selectionMethod: clean(params.get('address_selection_method'), 40)
    },
    integration: {
      source,
      campaign: clean(params.get('campaign'), 160),
      campaignId: clean(params.get('campaign_id'), 180),
      campaignVariant: clean(params.get('campaign_variant'), 30),
      campaignZip: clean(params.get('campaign_zip'), 10),
      entry: clean(params.get('entry'), 100),
      launchSurface: clean(params.get('launch_surface'), 100),
      assessment: clean(params.get('assessment'), 80) || 'home',
      sessionId: clean(params.get('session_id') || params.get('cf_session_id'), 120),
      handoffVersion: clean(params.get('handoff_version'), 20) || '1',
      handoffContract,
      senderBuild,
      leadCaptured: trueLike(params.get('lead_captured')),
      leadCaptureStatus,
      partnerId: clean(params.get('partner_id'), 64),
      referralSource: clean(params.get('referral_source'), 80),
      prefilled: true
    },
    receivedAt: new Date().toISOString()
  };

  safeSet(sessionStorage, SESSION_STORAGE_KEY, profile);
  safeSet(localStorage, LOCAL_STORAGE_KEY, profile);
  try { sessionStorage.removeItem(WELCOME_STORAGE_KEY); } catch (_) {}
  try { sessionStorage.removeItem(PERSONALIZATION_STORAGE_KEY); } catch (_) {}

  const requestedDestination = params.get('next');
  const currentPath = window.location.pathname === TRANSITION_ROUTE || window.location.pathname === '/transition'
    ? '/home/'
    : window.location.pathname;
  const destination = normalizeRoute(requestedDestination || currentPath, '/home/');

  safeSet(sessionStorage, TRANSITION_STORAGE_KEY, {
    version: '1.0',
    destination,
    hasProfile: true,
    source: profile.integration.source,
    campaign: profile.integration.campaign,
    createdAt: new Date().toISOString()
  });

  PII_KEYS.concat(MARKER_KEYS).forEach((key) => params.delete(key));
  const query = params.toString();
  const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
  try { window.history.replaceState(window.history.state, document.title, cleanUrl); } catch (_) {}

  window.CoverageFitPrefill = { version: VERSION, storageKey: STORAGE_KEY, get: current, clear };

  try {
    window.dispatchEvent(new CustomEvent('coveragefit:prefill-ready', {
      detail: {
        version: VERSION,
        hasProfile: true,
        source: profile.integration.source,
        campaign: profile.integration.campaign,
        sessionId: profile.integration.sessionId
      }
    }));
  } catch (_) {}

  if (window.location.pathname !== TRANSITION_ROUTE && window.location.pathname !== '/transition') {
    const transitionUrl = `${TRANSITION_ROUTE}${query ? `?${query}` : ''}`;
    try { window.location.replace(transitionUrl); } catch (_) { window.location.href = transitionUrl; }
  }
})();
