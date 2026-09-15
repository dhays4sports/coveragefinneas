(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXEntry = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const BUILD = 'CF-PVX-1.2';
  const CONTRACT_ID = 'coveragefit-pvx-frictionless-entry-v1';
  const PROFILE_KEY = 'coveragefit_prospect_profile_v1';
  const ENTRY_KEY = 'coveragefit_pvx_entry_v1';
  const clean = (value, max = 160) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function normalizeAddress(value = {}, source = 'customer-reported') {
    const formatted = clean(value.formattedAddress || value.propertyAddress || value.property_address, 240);
    return {
      line1: clean(value.line1 || value.street || value.property_street || (formatted ? formatted.split(',')[0] : ''), 120),
      city: clean(value.city || value.property_city, 80),
      state: clean(value.state || value.property_state || 'CA', 2).toUpperCase(),
      postalCode: clean(value.postalCode || value.property_zip, 10),
      formattedAddress: formatted,
      source,
      confirmed: source === 'customer-confirmed'
    };
  }

  function addressLabel(value = {}) {
    const address = normalizeAddress(value, value.source);
    return address.formattedAddress || [address.line1, [address.city, address.state].filter(Boolean).join(', '), address.postalCode].filter(Boolean).join(' ');
  }

  function readStoredProfile(storage) {
    try { return JSON.parse(storage?.getItem?.(PROFILE_KEY) || 'null'); } catch (_) { return null; }
  }

  function resolveEntry({ query = '', sessionStorage, localStorage } = {}) {
    const params = new URLSearchParams(query);
    const stored = readStoredProfile(sessionStorage) || readStoredProfile(localStorage) || {};
    const address = normalizeAddress({
      formattedAddress: params.get('property_address') || stored.propertyAddress || stored.address?.formattedAddress,
      line1: params.get('property_street') || stored.address?.street,
      city: params.get('property_city') || stored.address?.city,
      state: params.get('property_state') || stored.address?.state,
      postalCode: params.get('property_zip') || stored.address?.postalCode
    }, 'handoff-reported');
    const knownAddress = Boolean(address.formattedAddress || (address.line1 && address.city && address.postalCode));
    return {
      knownAddress,
      address,
      firstName: clean(params.get('first_name') || stored.firstName, 80),
      source: clean(params.get('source') || stored.integration?.source || 'direct', 80),
      campaign: clean(params.get('campaign') || stored.integration?.campaign, 160),
      contactConsent: Boolean(stored.contactPermission?.confirmed),
      prefilled: Boolean(stored.integration?.prefilled || params.get('prefill') === '1')
    };
  }

  function validateAddress(value) {
    const address = normalizeAddress(value);
    const errors = [];
    if (!address.line1) errors.push('street address');
    if (!address.city) errors.push('city');
    if (!/^[A-Z]{2}$/.test(address.state)) errors.push('two-letter state');
    if (!/^\d{5}(-\d{4})?$/.test(address.postalCode)) errors.push('valid ZIP code');
    return { valid: errors.length === 0, errors, address };
  }

  function confirmAddress(value, at = new Date().toISOString()) {
    const result = validateAddress(value);
    if (!result.valid) throw new TypeError(`Address needs ${result.errors.join(', ')}.`);
    return { ...result.address, source: 'customer-confirmed', confirmed: true, confirmedAt: at };
  }

  function saveEntry(value, storage = root.localStorage) {
    const record = { schemaVersion: '1.0', contractId: CONTRACT_ID, address: clone(value.address), source: clean(value.source || 'direct', 80), campaign: clean(value.campaign, 160), currentStage: value.currentStage || 'entry', updatedAt: new Date().toISOString() };
    try { storage?.setItem?.(ENTRY_KEY, JSON.stringify(record)); return true; } catch (_) { return false; }
  }

  function secureResumeDestination(journey = {}) {
    const stage = clean(journey.currentStage, 60);
    if (stage === 'discovery' || stage === 'discovery_started') return '/pvx/discovery/';
    if (stage === 'snapshot' || ['snapshot_viewed', 'snapshot_saved'].includes(stage)) return '/pvx/snapshot/';
    if (stage === 'home-profile' || ['home_profile_started', 'home_profile_ready'].includes(stage)) return '/pvx/home-profile/';
    if (stage === 'current-policy' || ['policy_review_started', 'coverage_review_ready'].includes(stage)) return '/pvx/policy/';
    return '';
  }

  async function restoreSecureStage(fetchImpl = root.fetch) {
    try {
      const response = await fetchImpl('/api/pvx/sms-journey', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'load' }) });
      if (!response.ok) return '';
      const body = await response.json();
      return secureResumeDestination(body?.journey);
    } catch (_) { return ''; }
  }

  function install() {
    const doc = root.document;
    if (!doc?.body?.hasAttribute('data-pvx-start')) return null;
    const entry = resolveEntry({ query: root.location?.search, sessionStorage: root.sessionStorage, localStorage: root.localStorage });
    restoreSecureStage().then(destination => { if (destination && destination !== root.location?.pathname) root.location?.replace?.(destination); });
    const $ = id => doc.getElementById(id);
    const welcome = $('pvxEntryWelcome'), step = $('pvxAddressStep'), complete = $('pvxEntryComplete'), form = $('pvxAddressForm'), known = $('pvxKnownAddress'), error = $('pvxAddressError'), live = $('pvxEntryLive');
    const announce = message => { live.textContent = ''; root.setTimeout(() => { live.textContent = message; }, 20); };
    const showStep = () => {
      welcome.hidden = true; step.hidden = false; complete.hidden = true;
      if (entry.knownAddress) { known.hidden = false; form.hidden = true; $('pvxKnownAddressLabel').textContent = addressLabel(entry.address); $('pvxConfirmKnown').focus(); }
      else { known.hidden = true; form.hidden = false; form.elements.line1.focus(); }
      announce(entry.knownAddress ? 'Confirm the home we already have.' : 'Enter the home you want to review.');
    };
    const finish = address => {
      saveEntry({ address, source: entry.source, campaign: entry.campaign, currentStage: 'discovery' });
      welcome.hidden = true; step.hidden = true; complete.hidden = false; $('pvxEntryCompleteAddress').textContent = addressLabel(address); announce('Home confirmed. Entry complete.');
      try { root.dispatchEvent(new CustomEvent('coveragefit:pvx-entry-complete', { detail: { contractId: CONTRACT_ID, source: entry.source, prefilled: entry.prefilled, addressSource: address.source, repeatedFields: 0 } })); } catch (_) {}
    };
    $('pvxEntryBegin').addEventListener('click', showStep);
    $('pvxEntryBack').addEventListener('click', () => { step.hidden = true; welcome.hidden = false; $('pvxEntryBegin').focus(); });
    $('pvxEditKnown').addEventListener('click', () => { known.hidden = true; form.hidden = false; form.elements.line1.value = entry.address.line1; form.elements.city.value = entry.address.city; form.elements.state.value = entry.address.state || 'CA'; form.elements.postalCode.value = entry.address.postalCode; form.elements.line1.focus(); });
    $('pvxConfirmKnown').addEventListener('click', () => {
      const normalized = normalizeAddress(entry.address);
      finish({ ...normalized, source: 'customer-confirmed', confirmed: true, confirmedAt: new Date().toISOString() });
    });
    form.addEventListener('submit', event => { event.preventDefault(); const result = validateAddress(Object.fromEntries(new FormData(form).entries())); if (!result.valid) { error.textContent = `Please add the ${result.errors.join(', ')}.`; error.hidden = false; announce(error.textContent); return; } error.hidden = true; finish(confirmAddress(result.address)); });
    return { entry, showStep, finish };
  }

  if (root.document) root.addEventListener('DOMContentLoaded', install, { once: true });
  return Object.freeze({ VERSION, BUILD, CONTRACT_ID, PROFILE_KEY, ENTRY_KEY, normalizeAddress, addressLabel, readStoredProfile, resolveEntry, validateAddress, confirmAddress, saveEntry, secureResumeDestination, restoreSecureStage, install });
});
