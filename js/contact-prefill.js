(() => {
  'use strict';

  const VERSION = '1.1';
  const PROFILE_KEY = 'coveragefit_prospect_profile_v1';
  const clean = (value, max = 220) => String(value || '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, max);
  const readJson = (storage, key) => {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
  };
  const getProfile = () => window.CoverageFitPrefill?.get?.()
    || readJson(sessionStorage, PROFILE_KEY)
    || readJson(localStorage, PROFILE_KEY)
    || null;

  const apply = () => {
    const form = document.getElementById('captureForm');
    if (!form) return;

    const profile = getProfile();
    const personalizationContext = window.CoverageFitPersonalization?.get?.() || null;
    const conversion = window.CoverageFitConversionHandoff?.refresh?.()
      || window.CoverageFitConversionHandoff?.get?.()
      || null;
    const hasProfile = personalizationContext ? Boolean(personalizationContext.flags?.hasProfile) : Boolean(profile);
    const consentWrap = document.getElementById('contactConsentConfirmWrap');
    const consentInput = document.getElementById('contactConsentConfirm');
    const consentCopy = document.getElementById('captureConsentCopy');
    const heading = document.getElementById('captureHeading');
    const copy = document.getElementById('captureCopy');
    const zeroRepeatContact = document.getElementById('zeroRepeatContact');

    if (!hasProfile) {
      window.CoverageFitContactPrefill = {
        version: VERSION,
        applied: false,
        fields: [],
        profile: null,
        context: personalizationContext,
        conversion,
        missingFields: ['name', 'email'],
        zeroRepeatEligible: false
      };
      return;
    }

    const address = profile?.address || {};
    const values = {
      firstName: clean(personalizationContext?.identity?.displayName || profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '), 160),
      email: clean(personalizationContext?.contact?.email || profile?.email, 254).toLowerCase(),
      phone: clean(personalizationContext?.contact?.phone || profile?.phone, 40),
      propertyField: clean(personalizationContext?.property?.postalCode || address.postalCode, 20)
    };

    const appliedFields = [];
    Object.entries(values).forEach(([id, value]) => {
      if (!value) return;
      const field = document.getElementById(id);
      if (!field || field.value.trim()) return;
      field.value = value;
      field.dataset.prefilled = 'true';
      appliedFields.push(id);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const isHandoff = Boolean(conversion?.flags?.isHomeHandoff);
    const permissionConfirmed = Boolean(conversion?.flags?.permissionConfirmed);
    const missingFields = conversion?.missingContactFields?.() || [];

    if (isHandoff) {
      form.dataset.zeroRepeatHandoff = 'true';
      ['firstName', 'email', 'phone', 'propertyField'].forEach((id) => {
        const field = document.getElementById(id);
        const label = field?.closest?.('label');
        if (!field || !label) return;
        const hasValue = Boolean(field.value.trim());
        label.hidden = hasValue;
        if (hasValue) field.dataset.confirmedFromHandoff = 'true';
      });

      if (consentWrap && consentInput) {
        consentWrap.hidden = permissionConfirmed;
        consentInput.required = !permissionConfirmed;
        if (permissionConfirmed) consentInput.checked = true;
      }
      if (consentCopy) {
        consentCopy.textContent = permissionConfirmed
          ? 'Your contact permission and details were carried forward from the 408FARMERS request you already completed.'
          : 'Confirm contact permission above to open your Snapshot. No purchase is required.';
      }
      if (heading) {
        heading.textContent = missingFields.length
          ? 'One last detail before your Snapshot opens.'
          : 'Your contact information is connected.';
      }
      if (copy) {
        copy.textContent = missingFields.length
          ? 'We carried over what you already provided. Complete only the missing information below.'
          : 'We’ll use the information you already provided and open your Protection Snapshot automatically.';
      }
      if (zeroRepeatContact) {
        zeroRepeatContact.textContent = [values.firstName, values.email, values.phone].filter(Boolean).join(' · ');
      }
    }

    if (appliedFields.length || isHandoff) {
      const note = document.createElement('p');
      note.className = 'contact-prefill-note';
      note.id = 'contactPrefillNote';
      note.setAttribute('role', 'status');
      note.textContent = isHandoff
        ? (missingFields.length
          ? 'Your 408FARMERS information is connected. Only the missing fields remain.'
          : 'Your 408FARMERS information is connected. You will not need to enter it again.')
        : 'We carried over the information you already provided. Please confirm it is still correct.';
      form.insertBefore(note, form.firstChild);
    }

    const zeroRepeatEligible = Boolean(conversion?.flags?.zeroRepeatEligible);
    window.CoverageFitContactPrefill = {
      version: VERSION,
      applied: appliedFields.length > 0,
      fields: appliedFields.slice(),
      profile,
      context: personalizationContext,
      conversion,
      missingFields: missingFields.slice(),
      permissionConfirmed,
      zeroRepeatEligible
    };

    window.CoverageFitAnalytics?.track?.('contact_handoff_prepared', {
      assessment: 'home',
      handoff: isHandoff,
      permissionConfirmed,
      missingFieldCount: missingFields.length,
      zeroRepeatEligible
    });

    try {
      window.dispatchEvent(new CustomEvent('coveragefit:contact-prefill-ready', {
        detail: {
          applied: appliedFields.length > 0,
          fields: appliedFields.slice(),
          source: personalizationContext?.journey?.source || profile?.integration?.source || '',
          zeroRepeatEligible,
          permissionConfirmed,
          missingFieldCount: missingFields.length
        }
      }));
    } catch (_) {}
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
})();
