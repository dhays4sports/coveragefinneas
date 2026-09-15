(() => {
  'use strict';

  const PI = window.CoverageFitPropertyIntelligence;
  const continuity = window.CoverageFitAssessmentContinuity || null;
  const conversionHandoff = window.CoverageFitConversionHandoff?.get?.() || null;
  const advisoryOpening = window.CoverageFitAdvisoryOpening || null;
  const advisoryRelationship = window.CoverageFitAdvisoryRelationshipDiscovery || null;
  const advisoryLifestyle = window.CoverageFitAdvisoryLifestyleDiscovery || null;
  const advisoryOutcome = window.CoverageFitAdvisoryOutcomeDiscovery || null;
  if (!PI) return;

  const $ = id => document.getElementById(id);
  const shell = document.querySelector('[data-property-confirmation]');
  const quiz = $('quiz');
  if (!shell || !quiz) return;

  const form = $('propertyConfirmationForm');
  const skip = $('propertySkipBtn');
  const quality = $('propertyQuality');
  const qualityBar = $('propertyQualityBar');
  const qualityText = $('propertyQualityText');
  const foundNote = $('propertyFoundNote');
  const optionalDetails = $('propertyOptionalDetails');
  const optionalSummary = $('propertyOptionalSummary');
  const quickConfirm = $('propertyQuickConfirm');
  const quickAddress = $('propertyQuickAddress');
  const quickConfirmButton = $('propertyQuickConfirmBtn');
  const quickEditButton = $('propertyQuickEditBtn');
  const editPanel = $('propertyEditPanel');
  const fields = {
    line1: $('propertyLine1'), city: $('propertyCity'), state: $('propertyState'), postalCode: $('propertyPostalCode'),
    yearBuilt: $('propertyYearBuilt'), squareFeet: $('propertySquareFeet'), stories: $('propertyStories'),
    constructionType: $('propertyConstructionType'), roofType: $('propertyRoofType'), roofYear: $('propertyRoofYear'),
    foundationType: $('propertyFoundationType'), pool: $('propertyPool'), detachedStructures: $('propertyDetachedStructures')
  };

  let profile = PI.load();

  const boolToSelect = value => value === true ? 'yes' : value === false ? 'no' : '';
  const selectToBool = value => value === 'yes' ? true : value === 'no' ? false : null;
  const value = el => el?.value?.trim?.() ?? '';
  const quickEligible = () => Boolean(
    conversionHandoff?.flags?.quickPropertyConfirmationEligible
      && profile?.address?.isComplete
      && profile?.address?.formatted
  );

  function setField(el, val) {
    if (!el || val === null || val === undefined) return;
    el.value = String(val);
  }

  function hydrate(existing) {
    if (!existing) return;
    const a = existing.address || {};
    const d = existing.data || {};
    setField(fields.line1, a.line1);
    setField(fields.city, a.city);
    setField(fields.state, a.state);
    setField(fields.postalCode, a.postalCode);
    setField(fields.yearBuilt, d.yearBuilt);
    setField(fields.squareFeet, d.squareFeet);
    setField(fields.stories, d.stories);
    setField(fields.constructionType, d.constructionType);
    setField(fields.roofType, d.roofType);
    setField(fields.roofYear, d.roofYear);
    setField(fields.foundationType, d.foundationType);
    fields.pool.value = boolToSelect(d.pool);
    fields.detachedStructures.value = boolToSelect(d.detachedStructures);
    const optionalValues = [d.yearBuilt, d.squareFeet, d.stories, d.constructionType, d.roofType, d.roofYear, d.foundationType, d.pool, d.detachedStructures];
    if (optionalSummary && optionalValues.some(item => item !== '' && item !== null && item !== undefined)) {
      optionalSummary.textContent = 'Review optional home details';
    }
    foundNote.hidden = false;
    foundNote.textContent = existing.provider?.id && existing.provider.id !== 'manual'
      ? `We found a starting property profile from ${existing.provider.name || 'a property-data source'}. Please confirm or update it.`
      : 'We found a saved property profile from this browser. Please confirm or update it.';
    updateQuality(existing);
  }

  function buildProfile() {
    const address = {
      line1: value(fields.line1), city: value(fields.city), state: value(fields.state), postalCode: value(fields.postalCode), country: 'US'
    };
    const data = {
      yearBuilt: value(fields.yearBuilt), squareFeet: value(fields.squareFeet), stories: value(fields.stories),
      constructionType: value(fields.constructionType), roofType: value(fields.roofType), roofYear: value(fields.roofYear),
      foundationType: value(fields.foundationType), pool: selectToBool(fields.pool.value),
      detachedStructures: selectToBool(fields.detachedStructures.value)
    };
    const base = profile || PI.createProfile({ address, provider: { id: 'manual', name: 'Homeowner confirmation', defaultConfidence: 1 }, status: 'manual_confirmation' });
    return PI.mergeProfile(base, { address, data }, { source: 'user', verifiedByUser: true, status: 'confirmed' });
  }

  function updateQuality(nextProfile = buildProfile()) {
    const q = nextProfile.quality || PI.calculateConfidence(nextProfile);
    quality.hidden = false;
    qualityBar.style.width = `${q.completeness || 0}%`;
    qualityText.textContent = `${q.completeness || 0}% complete · ${q.label}`;
  }

  function continueToAssessment(savedProfile, action) {
    profile = savedProfile;
    PI.save(savedProfile);
    continuity?.save?.({
      propertyConfirmed: true,
      propertyProfileId: savedProfile.profileId || '',
      propertyConfirmedAt: new Date().toISOString(),
      stage: 'assessment'
    }, { force: true });
    const zipField = $('propertyField');
    if (zipField && !zipField.value) zipField.value = savedProfile.address?.postalCode || '';
    shell.hidden = true;
    document.body.classList.add('property-confirmed');
    const advisoryStarted = advisoryOpening?.start?.({ propertyProfileId: savedProfile.profileId || '', action }) === true;
    quiz.style.display = advisoryStarted ? 'none' : '';
    const relationshipStarted = !advisoryStarted && advisoryRelationship?.start?.({ propertyProfileId: savedProfile.profileId || '', action }) === true;
    if (relationshipStarted) quiz.style.display = 'none';
    const lifestyleStarted = !advisoryStarted && !relationshipStarted && advisoryLifestyle?.start?.({ propertyProfileId: savedProfile.profileId || '', action }) === true;
    if (lifestyleStarted) quiz.style.display = 'none';
    const outcomeStarted = !advisoryStarted && !relationshipStarted && !lifestyleStarted && advisoryOutcome?.start?.({ propertyProfileId: savedProfile.profileId || '', action }) === true;
    if (outcomeStarted) quiz.style.display = 'none';
    window.CoverageFitAnalytics?.track('property_profile_confirmed', {
      assessment: 'home',
      action,
      completeness: savedProfile.quality?.completeness || 0,
      confidence: savedProfile.quality?.confidence || 0,
      provider: savedProfile.provider?.id || 'manual'
    });
    window.dispatchEvent(new CustomEvent('coveragefit:property-profile-confirmed', { detail: savedProfile }));
    if (!advisoryStarted && !relationshipStarted && !lifestyleStarted && !outcomeStarted) {
      requestAnimationFrame(() => document.querySelector('.question')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }


  function showQuickConfirmation() {
    if (!quickConfirm || !editPanel || !quickEligible()) return false;
    quickAddress.textContent = profile.address.formatted;
    quickConfirm.hidden = false;
    editPanel.hidden = true;
    foundNote.hidden = true;
    document.body.classList.add('property-quick-confirmation');
    window.CoverageFitAnalytics?.track('property_quick_confirmation_viewed', {
      assessment: 'home',
      source: conversionHandoff?.source || '408farmers',
      provider: profile?.provider?.id || '408farmers-prefill'
    });
    return true;
  }

  function openPropertyEditor() {
    if (quickConfirm) quickConfirm.hidden = true;
    if (editPanel) editPanel.hidden = false;
    document.body.classList.remove('property-quick-confirmation');
    foundNote.hidden = false;
    foundNote.textContent = 'Your 408FARMERS address is ready. Update it or add optional home details before continuing.';
    window.CoverageFitAnalytics?.track('property_quick_confirmation_edited', {
      assessment: 'home',
      source: conversionHandoff?.source || '408farmers'
    });
    requestAnimationFrame(() => fields.line1?.focus?.({ preventScroll: true }));
  }

  quickConfirmButton?.addEventListener('click', () => {
    const nextProfile = buildProfile();
    continueToAssessment(nextProfile, 'handoff_address_confirmed');
  });

  quickEditButton?.addEventListener('click', openPropertyEditor);

  optionalDetails?.addEventListener('toggle', () => {
    window.CoverageFitAnalytics?.track(optionalDetails.open
      ? 'property_optional_details_opened'
      : 'property_optional_details_closed', {
      assessment: 'home',
      hasExistingProfile: Boolean(profile)
    });
  });

  form.addEventListener('input', () => {
    try { updateQuality(); } catch (_) {}
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const nextProfile = buildProfile();
    continueToAssessment(nextProfile, 'confirmed');
  });

  skip.addEventListener('click', () => {
    const nextProfile = buildProfile();
    nextProfile.status = 'partial_confirmation';
    continueToAssessment(nextProfile, 'continued_with_partial_profile');
  });

  const savedDraft = continuity?.getDraft?.() || null;
  const resumeConfirmedProperty = Boolean(savedDraft?.propertyConfirmed && profile);

  hydrate(profile);
  if (!profile) updateQuality(PI.createProfile({ status: 'manual_confirmation' }));

  if (resumeConfirmedProperty) {
    shell.hidden = true;
    document.body.classList.add('property-confirmed');
    const advisoryStarted = advisoryOpening?.start?.({ resume: true, propertyProfileId: profile?.profileId || '' }) === true;
    quiz.style.display = advisoryStarted ? 'none' : '';
    const relationshipStarted = !advisoryStarted && advisoryRelationship?.start?.({ resume: true, propertyProfileId: profile?.profileId || '' }) === true;
    if (relationshipStarted) quiz.style.display = 'none';
    const lifestyleStarted = !advisoryStarted && !relationshipStarted && advisoryLifestyle?.start?.({ resume: true, propertyProfileId: profile?.profileId || '' }) === true;
    if (lifestyleStarted) quiz.style.display = 'none';
    const outcomeStarted = !advisoryStarted && !relationshipStarted && !lifestyleStarted && advisoryOutcome?.start?.({ resume: true, propertyProfileId: profile?.profileId || '' }) === true;
    if (outcomeStarted) quiz.style.display = 'none';
    window.CoverageFitAnalytics?.track('property_profile_resumed', {
      assessment: 'home',
      provider: profile?.provider?.id || 'manual',
      completeness: profile?.quality?.completeness || 0
    });
  } else {
    quiz.style.display = 'none';
    const quickShown = showQuickConfirmation();
    if (!quickShown) {
      if (quickConfirm) quickConfirm.hidden = true;
      if (editPanel) editPanel.hidden = false;
      window.CoverageFitAnalytics?.track('property_confirmation_viewed', {
        assessment: 'home',
        hasExistingProfile: Boolean(profile),
        provider: profile?.provider?.id || 'none'
      });
    }
  }
})();
