(() => {
  'use strict';
  const PROFILE_KEY = 'coveragefit_prospect_profile_v1';
  const ENTRY_KEY = 'coveragefit_pvx_entry_v1';
  const DISCOVERY_KEY = 'coveragefit_pvx_discovery_v1';
  const SMS_BRIDGE_KEY = 'coveragefit_pvx_sms_bridge_v1';
  const clean = (value, max = 240) => String(value == null ? '' : value).trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, max);
  const save = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
  const params = new URLSearchParams(location.search);
  const token = clean(params.get('token'), 80);
  const status = document.getElementById('status');
  const loading = document.getElementById('loading');
  const fallback = document.getElementById('fallback');
  const fallbackCopy = document.getElementById('fallbackCopy');
  const fail = message => {
    try { history.replaceState(history.state, document.title, location.pathname); } catch (_) {}
    if (loading) loading.hidden = true;
    if (fallback) fallback.setAttribute('aria-hidden', 'false');
    if (fallbackCopy && message) fallbackCopy.textContent = message;
  };
  if (!/^sh_[A-Za-z0-9_-]{22}$/.test(token)) {
    fail('This secure appointment link is unavailable. Return to your text conversation and reply CALLBACK for a new link.');
    return;
  }
  if (status) status.textContent = 'Verifying what you already shared…';
  fetch('/api/sms/handoff/read', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data?.pvx?.seed) {
      throw Object.assign(new Error(data?.error?.message || 'This secure continuation could not be loaded.'), { status: response.status });
    }
    const seed = data.pvx.seed;
    const address = seed.entry?.address || {};
    const now = new Date().toISOString();
    const profile = {
      version: '1.3', firstName: '', lastName: '', fullName: '',
      phone: clean(seed.contact?.mobile, 40), email: '',
      propertyAddress: clean(address.formattedAddress),
      reviewContext: clean(seed.discovery?.exactCustomerWords?.shoppingReason || 'Insurance review appointment', 120),
      contactPermission: { confirmed: false, status: 'not_requested', basis: '', source: '408farmers_sms', capturedAt: '', version: 'CF-PVX-SMS-1.1' },
      smsPermission: seed.contact?.smsConsent || { status: 'unknown', authoritative: true },
      address: { formattedAddress: clean(address.formattedAddress), street: clean(address.line1, 120), city: clean(address.city, 80), state: clean(address.state, 2), postalCode: clean(address.postalCode, 10), country: 'US', selectionMethod: 'sms' },
      integration: {
        source: clean(seed.attribution?.source || '408farmers_sms', 80), campaign: clean(seed.attribution?.campaign, 160), campaignId: clean(seed.attribution?.campaignId, 180),
        entry: 'sms_handoff', assessment: 'pvx', handoffVersion: '2', senderBuild: 'CF-PVX-SMS-1.1', leadCaptured: false, leadCaptureStatus: 'sms_intake_complete', prefilled: true,
        partnerId: clean(seed.attribution?.partnerId, 64), partnerName: clean(seed.attribution?.partnerName, 100), referralSource: clean(seed.attribution?.referralSource, 60), entryMethod: clean(seed.attribution?.entryMethod || 'sms', 30),
        smsConversationId: clean(seed.journey?.smsConversationId, 120), pvxJourneyId: clean(data.pvx.journeyId, 120)
      },
      receivedAt: now
    };
    const entry = {
      schemaVersion: '1.0', contractId: 'coveragefit-pvx-frictionless-entry-v1', address,
      source: seed.entry?.source || 'ringcentral_sms', campaign: seed.entry?.campaign || '',
      currentStage: seed.journey?.resumeState?.exactStage || 'entry', updatedAt: now
    };
    const bridge = {
      schemaVersion: '1.0', build: 'CF-PVX-SMS-1.1', journeyId: clean(data.pvx.journeyId, 120), smsConversationId: clean(seed.journey?.smsConversationId, 120),
      contact: seed.contact, homebuyerContext: seed.homebuyerContext, bundleContext: seed.bundleContext, homeProfilePrefill: seed.homeProfilePrefill,
      operational: seed.operational, attribution: seed.attribution, evidence: seed.evidence, semantics: seed.semantics, createdAt: now
    };
    save(sessionStorage, PROFILE_KEY, profile);
    save(localStorage, PROFILE_KEY, profile);
    save(localStorage, ENTRY_KEY, entry);
    save(localStorage, DISCOVERY_KEY, seed.discovery);
    save(sessionStorage, SMS_BRIDGE_KEY, bridge);
    save(localStorage, SMS_BRIDGE_KEY, bridge);
    try { history.replaceState(history.state, document.title, location.pathname); } catch (_) {}
    if (status) status.textContent = 'Ready. Opening Dylan’s appointment calendar…';
    location.replace(data.pvx.destination || '/pvx/start/');
  }).catch(error => fail(error?.status === 410
    ? 'This secure appointment link has expired. Return to your text conversation and reply CALLBACK for a new link.'
    : error?.status === 409
      ? 'This secure appointment link was already used. Return to your text conversation if you need another link.'
      : 'This secure appointment link is unavailable. Return to your text conversation and reply CALLBACK for a new link.'));
})();
