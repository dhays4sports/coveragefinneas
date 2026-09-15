(function (root) {
  'use strict';
  const PROFILE_KEY = 'coveragefit_prospect_profile_v1';
  const ENTRY_KEY = 'coveragefit_pvx_entry_v1';
  const DISCOVERY_KEY = 'coveragefit_pvx_discovery_v1';
  const WEB_BRIDGE_KEY = 'coveragefit_pvx_web_bridge_v1';
  const RESET_ON_NEW_JOURNEY = Object.freeze([
    'coveragefit_pvx_branch_answers_v1','coveragefit_pvx_snapshot_v1','coveragefit_pvx_topic_responses_v1',
    'coveragefit_pvx_readiness_v1','coveragefit_pvx_preferred_continuation_v1','coveragefit_pvx_home_profile_v1',
    'coveragefit_pvx_checkpoint_id_v1','coveragefit_pvx_contact_prompt_declined_v1','coveragefit_property_profile_v1',
    'coveragefit_property_cache_v1','coveragefit_assessment_draft_v1'
  ]);
  const clean = (value, max = 240) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);
  const save = (storage, key, value) => { try { storage?.setItem?.(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
  const read = (storage, key) => { try { return JSON.parse(storage?.getItem?.(key) || 'null'); } catch (_) { return null; } };
  const clearJourneyState = () => { for (const storage of [root.sessionStorage, root.localStorage]) { for (const key of RESET_ON_NEW_JOURNEY) { try { storage?.removeItem?.(key); } catch (_) {} } } };
  const status = document.getElementById('pvxWebBootstrapStatus');
  const fallback = document.getElementById('pvxWebBootstrapFallback');
  const connecting = document.getElementById('pvxWebConnecting');
  const firstLook = document.getElementById('pvxTechFirstLook');
  const handoffState = new URLSearchParams(root.location.search).get('handoff') === 'fresh' ? 'fresh' : 'resume';

  function showTechFirstLook(journey, seed) {
    const professional = seed.context?.professional || {};
    if (handoffState !== 'fresh' || professional.active !== true || professional.program !== 'technology' || !professional.roleLabel) return false;
    document.getElementById('pvxTechRole').textContent = clean(professional.roleLabel, 120);
    document.getElementById('pvxTechHousing').textContent = seed.discovery?.productTrack === 'renter' ? 'Renter' : 'Homeowner';
    document.getElementById('pvxTechEligibilityReason').textContent = 'Your technology occupation may qualify for an available Farmers professional discount. Dylan will confirm eligibility during the review.';
    connecting.hidden = true;
    firstLook.hidden = false;
    try { root.CoverageFitPVXConsumerEvents?.emit?.('native_entry_viewed', { stage:'first_look', result:'technology_professional', productTrack:seed.discovery?.productTrack || 'home', journeyId:journey.journeyId }); } catch (_) {}
    return true;
  }

  fetch('/api/pvx/web-journey', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action: 'load' })
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data?.journey?.seed) throw new Error(data?.error?.message || 'Secure journey unavailable.');
    const journey = data.journey;
    const seed = journey.seed;
    const previousBridge = read(root.localStorage, WEB_BRIDGE_KEY) || read(root.sessionStorage, WEB_BRIDGE_KEY) || {};
    if (clean(previousBridge.journeyId, 120) !== clean(journey.journeyId, 120)) clearJourneyState();
    const address = seed.entry?.address || {};
    const earlyContact = seed.contact || {};
    const consent = earlyContact.agencyContactConsent || {};
    const identityKnown = consent.granted === true && earlyContact.leadCaptureStatus === 'confirmed';
    const identity = identityKnown ? (earlyContact.identity || {}) : {};
    const profile = {
      version: '2.0',
      firstName: clean(identity.firstName,80), lastName: '', fullName: clean(identity.firstName,80), phone: clean(identity.mobile,40), email: '',
      propertyAddress: clean(address.formattedAddress),
      reviewContext: clean(seed.evidence?.exactCustomerWords || 'CoverageFit Snapshot', 120),
      contactPermission: { confirmed: identityKnown, status: identityKnown ? 'confirmed' : 'not_requested', source: '408farmers_progressive_checkpoint', capturedAt: identityKnown ? clean(consent.capturedAt,40) : '', version: identityKnown ? clean(consent.version,80) : '', scope: identityKnown ? clean(consent.scope,80) : '', automatedSmsAuthorized: false },
      address: {
        formattedAddress: clean(address.formattedAddress), street: clean(address.line1, 120),
        city: clean(address.city, 80), state: clean(address.state, 2), postalCode: clean(address.postalCode, 10),
        country: 'US', selectionMethod: 'native_web'
      },
      integration: {
        source: clean(seed.attribution?.source || '408farmers_web', 80),
        entry: clean(seed.entry?.type, 40), assessment: 'pvx', handoffVersion: 'web-1',
        senderBuild: 'CF-DISCOVERY-1.5', leadCaptured: identityKnown, leadCaptureStatus: identityKnown ? 'confirmed' : earlyContact.leadCaptureStatus === 'skipped' ? 'skipped' : 'not_requested', leadCheckpointId: identityKnown ? clean(earlyContact.leadCheckpointId,120) : '', prefilled: true,
        campaign: clean(seed.attribution?.campaign, 160), campaignId: clean(seed.attribution?.campaignId, 180),
        partnerId: clean(seed.attribution?.partnerId, 64), partnerName: clean(seed.attribution?.partnerName, 100),
        referralId: clean(seed.attribution?.referralId, 120), pvxJourneyId: clean(journey.journeyId, 120)
      },
      receivedAt: new Date().toISOString()
    };
    const entry = {
      schemaVersion: '2.0', contractId: 'coveragefit-pvx-frictionless-entry-v1', address,
      source: seed.entry?.source || '408farmers_web', campaign: seed.attribution?.campaign || '',
      currentStage: seed.journey?.resumeState?.exactStage || 'entry', updatedAt: new Date().toISOString()
    };
    const bridge = {
      schemaVersion: '2.0', build: 'CF-DISCOVERY-1.5', journeyId: journey.journeyId,
      entry: seed.entry, context: seed.context, attribution: seed.attribution, evidence: seed.evidence,
      reconciliation: seed.reconciliation, ownership: seed.ownership, consent: seed.consent, semantics: seed.semantics,
      createdAt: journey.createdAt
    };
    for (const storage of [root.sessionStorage, root.localStorage]) save(storage, PROFILE_KEY, profile);
    save(root.localStorage, ENTRY_KEY, entry);
    save(root.localStorage, DISCOVERY_KEY, seed.discovery);
    for (const storage of [root.sessionStorage, root.localStorage]) save(storage, WEB_BRIDGE_KEY, bridge);
    try { root.history.replaceState(root.history.state, document.title, root.location.pathname); } catch (_) {}
    if (seed.journey?.experience === 'appointment_only' && journey.destination === '/pvx/appointment/') {
      if (status) status.textContent = 'Connected. Opening Dylan’s appointment calendar…';
      root.location.replace('/pvx/appointment/');
      return;
    }
    if (showTechFirstLook(journey, seed)) return;
    const carriedAnswerCount = Array.isArray(seed.discovery?.prefilledQuestionIds) ? seed.discovery.prefilledQuestionIds.length : 0;
    if (seed.entry?.type === 'snapshot') {
      const title = connecting?.querySelector?.('h1');
      if (title) title.textContent = 'Starting your Home Coverage Snapshot';
      if (status) status.textContent = carriedAnswerCount > 0 ? 'Your starting point is connected. Opening the questions that make it useful…' : 'Connected. Opening your quick coverage questions…';
    } else if (status) status.textContent = carriedAnswerCount > 0 ? 'Your answers are connected. Opening your review…' : 'Connected. Opening your review…';
    root.location.replace(journey.destination || '/pvx/start/');
  }).catch(() => {
    if (status) status.textContent = 'This secure return could not be opened.';
    if (fallback) fallback.hidden = false;
    document.body.removeAttribute('aria-busy');
  });
})(window);
