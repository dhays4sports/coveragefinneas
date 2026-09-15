(function (root) {
  'use strict';

  const VERSION = '1.3.1';
  const STAGE_LABELS = Object.freeze({
    review_received: 'Review received',
    contact_attempted: 'Contact attempted',
    consultation_scheduled: 'Consultation scheduled',
    consultation_completed: 'Consultation completed',
    proposal_prepared: 'Proposal prepared',
    decision_pending: 'Decision pending',
    closed: 'Closed'
  });

  function text(value, fallback) {
    const normalized = value == null ? '' : String(value).trim();
    return normalized || fallback || '';
  }

  function list(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function sourceValue(item, key) {
    if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
    return item?.source?.[key];
  }

  const FINDING_RANK = Object.freeze({
    'identified-gap': 4,
    uncertainty: 3,
    consideration: 2,
    strength: 1
  });

  const EVIDENCE_RANK = Object.freeze({
    'needs-verification': 4,
    missing: 3,
    partial: 2,
    confirmed: 1
  });

  function labelPriority(value) {
    const key = text(value).toLowerCase();
    if (/critical|urgent|highest|high/.test(key)) return 4;
    if (/important|priority|recommended/.test(key)) return 3;
    if (/medium|moderate|review/.test(key)) return 2;
    if (/low|optional|additional|consider/.test(key)) return 1;
    return 0;
  }

  function prioritySignals(item, index) {
    const priorityScore = finiteNumber(sourceValue(item, 'priorityScore'));
    const weightedPenalty = finiteNumber(sourceValue(item, 'weightedPenalty'));
    const findingType = text(sourceValue(item, 'findingType')).toLowerCase();
    const evidenceQuality = text(item?.evidenceQuality || sourceValue(item, 'evidenceQuality'), 'confirmed').toLowerCase();
    const reviewReasonBoost = finiteNumber(sourceValue(item, 'reviewReasonPriorityBoost')) || 0;
    const propertyBoost = finiteNumber(sourceValue(item, 'propertyPriorityBoost')) || 0;
    const sourceOrder = finiteNumber(sourceValue(item, 'order'));
    return {
      priorityScore,
      weightedPenalty,
      findingType,
      evidenceQuality,
      reviewReasonBoost,
      propertyBoost,
      signalClass: priorityScore != null ? 3 : weightedPenalty != null ? 2 : 1,
      findingRank: FINDING_RANK[findingType] || 0,
      evidenceRank: EVIDENCE_RANK[evidenceQuality] || 0,
      labelRank: labelPriority(item?.priority),
      sourceOrder: sourceOrder != null ? sourceOrder : finiteNumber(item?.order) || index + 1,
      inputOrder: index
    };
  }

  function comparePriorityFindings(left, right) {
    const a = left.signals;
    const b = right.signals;
    if (b.signalClass !== a.signalClass) return b.signalClass - a.signalClass;
    if ((b.priorityScore ?? -1) !== (a.priorityScore ?? -1)) return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
    if ((b.weightedPenalty ?? -1) !== (a.weightedPenalty ?? -1)) return (b.weightedPenalty ?? -1) - (a.weightedPenalty ?? -1);
    if (b.findingRank !== a.findingRank) return b.findingRank - a.findingRank;
    if (b.reviewReasonBoost !== a.reviewReasonBoost) return b.reviewReasonBoost - a.reviewReasonBoost;
    if (b.propertyBoost !== a.propertyBoost) return b.propertyBoost - a.propertyBoost;
    if (b.evidenceRank !== a.evidenceRank) return b.evidenceRank - a.evidenceRank;
    if (b.labelRank !== a.labelRank) return b.labelRank - a.labelRank;
    if (a.sourceOrder !== b.sourceOrder) return a.sourceOrder - b.sourceOrder;
    return a.inputOrder - b.inputOrder;
  }

  function findingRationale(signals) {
    if (signals.findingType === 'identified-gap' && signals.reviewReasonBoost > 0) {
      return 'Identified gap prioritized for the homeowner\u2019s stated review reason.';
    }
    if (signals.findingType === 'identified-gap' && signals.propertyBoost > 0) {
      return 'Identified gap prioritized using the property context in the assessment.';
    }
    if (signals.findingType === 'identified-gap') return 'The homeowner\u2019s response produced an identified protection gap.';
    if (signals.findingType === 'uncertainty') return 'The assessment found an important protection detail is still uncertain.';
    if (signals.evidenceQuality === 'needs-verification') return 'A priority finding still needs policy verification before advising.';
    if (signals.evidenceQuality === 'missing' || signals.evidenceQuality === 'partial') return 'A priority finding needs a homeowner detail before advising.';
    if (signals.reviewReasonBoost > 0) return 'Prioritized for the homeowner\u2019s stated reason for this review.';
    if (signals.propertyBoost > 0) return 'Prioritized using the property context included in the assessment.';
    return 'One of the assessment\u2019s highest-priority protection findings.';
  }

  function findingAction(evidenceQuality) {
    if (evidenceQuality === 'needs-verification') return 'Check policy';
    if (evidenceQuality === 'missing' || evidenceQuality === 'partial') return 'Ask homeowner';
    return 'Discuss finding';
  }

  function priorityPosition(item) {
    const priority = Number(item?.priorityOrder);
    if (Number.isFinite(priority) && priority > 0) return priority;
    const order = Number(item?.order);
    return Number.isFinite(order) && order > 0 ? order + 1000 : Number.MAX_SAFE_INTEGER;
  }

  const VERIFICATION_GROUPS = Object.freeze([
    Object.freeze({
      id: 'known', label: 'Known', icon: '✓',
      description: 'Clear homeowner-reported answers. Validate any policy-specific detail before advising.',
      empty: 'No clear homeowner answers were carried forward.'
    }),
    Object.freeze({
      id: 'inferred', label: 'Inferred', icon: '≈',
      description: 'CoverageFit interpretations derived from answers, not verified policy facts.',
      empty: 'No assessment-derived findings are available.'
    }),
    Object.freeze({
      id: 'missing', label: 'Missing', icon: '—',
      description: 'Required assessment details that were not provided.',
      empty: 'No required assessment answers are missing.'
    }),
    Object.freeze({
      id: 'confirmation', label: 'Needs confirmation', icon: '?',
      description: 'Items to check with the policy, property record, or homeowner.',
      empty: 'No specific confirmation item was identified.'
    })
  ]);

  function verificationPreviewItem(item, fallbackId, source) {
    return {
      id: text(item?.id || item?.key, fallbackId),
      title: text(item?.title, 'Review item'),
      detail: text(item?.answer || item?.statement || item?.question, 'Review this item before advising.'),
      source
    };
  }

  function verificationMap(snapshot) {
    const evidence = snapshot?.evidenceHandoff || {};
    const confirmed = list(evidence.confirmedFacts).map((item, index) =>
      verificationPreviewItem(item, `known-${index + 1}`, 'Homeowner reported')
    );
    const inferred = list(snapshot?.recommendations).map((item, index) => ({
      id: text(item?.id, `inferred-${index + 1}`),
      title: text(item?.title, 'Assessment finding'),
      detail: 'Assessment-derived finding. Discuss and verify before treating it as a policy fact.',
      source: 'CoverageFit interpretation'
    }));
    const unresolved = list(evidence.unresolvedQuestions);
    const missing = unresolved
      .filter(item => text(item?.evidenceQuality).toLowerCase() === 'missing')
      .map((item, index) => verificationPreviewItem(item, `missing-${index + 1}`, 'Not provided'));
    const confirmation = list(evidence.verificationItems)
      .map((item, index) => verificationPreviewItem(item, `policy-${index + 1}`, 'Check policy'))
      .concat(unresolved
        .filter(item => text(item?.evidenceQuality).toLowerCase() !== 'missing')
        .map((item, index) => verificationPreviewItem(item, `homeowner-${index + 1}`, 'Ask homeowner')));

    if (snapshot?.property?.available && snapshot?.property?.confirmation?.requiresConfirmation === false) {
      confirmed.push({
        id: 'property-profile-known',
        title: 'Property profile',
        detail: text(snapshot?.property?.confirmation?.label, 'Customer-confirmed property details are available.'),
        source: 'Homeowner confirmed'
      });
    } else if (snapshot?.property?.available) {
      confirmation.push({
        id: 'property-profile-confirmation',
        title: 'Property profile',
        detail: text(snapshot?.property?.confirmation?.label, 'Confirm the property details with the homeowner.'),
        source: 'Confirm property'
      });
    } else {
      missing.push({
        id: 'property-profile-missing',
        title: 'Property profile',
        detail: 'No Property Intelligence profile is available. Gather the relevant property facts before advising.',
        source: 'Not available'
      });
    }
    if (!evidence.available && snapshot?.state === 'ready') {
      confirmation.push({
        id: 'legacy-evidence-review',
        title: 'Saved assessment evidence',
        detail: 'This report predates evidence-quality handoff. Review the saved answers manually.',
        source: 'Manual review'
      });
    }

    const values = { known: confirmed, inferred, missing, confirmation };
    const groups = VERIFICATION_GROUPS.map(definition => {
      const items = values[definition.id];
      return {
        ...definition,
        count: items.length,
        items,
        preview: items[0] || null
      };
    });
    return {
      version: '1.0.0',
      state: !evidence.available ? 'legacy' : missing.length ? 'missing' : confirmation.length ? 'confirmation-needed' : 'ready',
      groups,
      totalCount: groups.reduce((total, group) => total + group.count, 0),
      reviewCount: inferred.length + missing.length + confirmation.length,
      knownCount: confirmed.length,
      inferredCount: inferred.length,
      missingCount: missing.length,
      confirmationCount: confirmation.length,
      guardrail: text(evidence.guardrail, 'Confirm policy details before making a recommendation.')
    };
  }

  function priorityFindings(snapshot, limit) {
    const boundedLimit = Math.max(1, Math.min(5, finiteNumber(limit) || 3));
    const recommendations = list(snapshot?.recommendations)
      .map((item, index) => ({ item, signals: prioritySignals(item, index) }))
      .sort(comparePriorityFindings)
      .slice(0, boundedLimit)
      .map(({ item, signals }, index) => ({
        id: text(item?.id, `priority-${index + 1}`),
        rank: index + 1,
        sequenceLabel: index === 0 ? 'Discuss first' : index === 1 ? 'Discuss next' : 'Then review',
        title: text(item?.title, 'Protection topic'),
        detail: text(item?.explanation, 'Confirm how the current policy addresses this topic.'),
        rationale: findingRationale(signals),
        actionLabel: findingAction(signals.evidenceQuality),
        priority: text(item?.priority, 'Review topic'),
        evidenceQuality: signals.evidenceQuality,
        findingType: signals.findingType || 'review-topic'
      }));
    if (recommendations.length) return recommendations;
    const fallback = text(snapshot?.assessment?.topPriority);
    return fallback ? [{
      id: 'assessment-priority', rank: 1, sequenceLabel: 'Discuss first', title: fallback,
      detail: 'Use the assessment finding as the first discussion topic.',
      rationale: 'This is the leading priority preserved in the saved assessment.',
      actionLabel: 'Discuss finding', priority: 'Review topic', evidenceQuality: 'confirmed', findingType: 'review-topic'
    }] : [];
  }

  function verificationItems(snapshot) {
    const evidence = snapshot?.evidenceHandoff || {};
    return list(evidence.verificationItems).map((item, index) => ({
      id: text(item?.id, `policy-check-${index + 1}`),
      title: text(item?.title, 'Policy detail'),
      detail: text(item?.question, 'Confirm this item against the current policy.'),
      kind: 'policy',
      label: 'Check policy',
      position: priorityPosition(item),
      sourceOrder: index
    })).concat(list(evidence.unresolvedQuestions).map((item, index) => ({
      id: text(item?.id, `homeowner-question-${index + 1}`),
      title: text(item?.title, 'Open question'),
      detail: text(item?.question, 'Confirm this detail with the homeowner.'),
      kind: 'homeowner',
      label: 'Ask homeowner',
      position: priorityPosition(item),
      sourceOrder: index
    }))).sort((left, right) => left.position - right.position || (left.kind === right.kind ? left.sourceOrder - right.sourceOrder : left.kind === 'policy' ? -1 : 1)).slice(0, 3);
  }

  function statusModel(snapshot, context) {
    const stage = Object.prototype.hasOwnProperty.call(STAGE_LABELS, text(context?.stage)) ? text(context.stage) : 'review_received';
    const checklist = context?.checklist || {};
    const total = Number(checklist?.summary?.total || 0);
    const completed = Number(checklist?.summary?.completed || 0);
    const assessmentState = snapshot?.assessment?.completion?.state;
    const assessmentLabel = assessmentState === 'complete' || snapshot?.state === 'ready' ? 'Assessment complete' : 'Assessment loaded';
    return {
      stage,
      label: STAGE_LABELS[stage],
      detail: total > 0 ? `${assessmentLabel} · ${completed} of ${total} guided steps complete` : `${assessmentLabel} · Guided steps are being prepared`,
      completed,
      total
    };
  }

  function nextAction(status, verify) {
    if (status.stage === 'closed') return {
      eyebrow: 'Next action', title: 'Confirm the record is complete',
      detail: 'Review the recorded outcome, notes, and any promised follow-up.',
      label: 'Review outcome', target: '#consultationDispositionTitle'
    };
    if (['consultation_completed', 'proposal_prepared', 'decision_pending'].includes(status.stage) || (status.total > 0 && status.completed >= status.total)) return {
      eyebrow: 'Next action', title: 'Record the next commitment',
      detail: 'Capture the decision, unresolved items, documents needed, and follow-up.',
      label: 'Record next step', target: '#consultationAfterTitle'
    };
    if (status.stage === 'contact_attempted') return {
      eyebrow: 'Next action', title: 'Plan the next contact attempt',
      detail: 'Use the saved contact details, then record the result or schedule follow-up.',
      label: 'Open next-step controls', target: '#consultationAfterTitle'
    };
    if (status.stage === 'consultation_scheduled') return {
      eyebrow: 'Next action', title: verify.length ? 'Prepare the scheduled consultation' : 'Begin the scheduled consultation',
      detail: verify.length ? `Review ${verify.length} priority confirmation item${verify.length === 1 ? '' : 's'} before advising.` : 'The assessment is ready for the guided conversation.',
      label: verify.length ? 'Review verification items' : 'Open guided steps',
      target: verify.length ? '#consultationCommandVerify' : '#consultationDuringTitle'
    };
    if (verify.some(item => item.kind === 'professional')) return {
      eyebrow: 'Next action', title: 'Verify the professional program opportunity',
      detail: 'Confirm the reported occupation and which Farmers professional discounts may be available during quoting and underwriting.',
      label: 'Review professional verification', target: '#consultationCommandVerify'
    };
    if (verify.length) return {
      eyebrow: 'Next action', title: 'Review what must be confirmed',
      detail: `${verify.length} priority item${verify.length === 1 ? '' : 's'} should be checked before advice is finalized.`,
      label: 'Review verification items', target: '#consultationCommandVerify'
    };
    return {
      eyebrow: 'Next action', title: status.completed > 0 ? 'Continue the guided consultation' : 'Begin the guided consultation',
      detail: 'Use the prepared questions and checks while preserving producer judgment.',
      label: 'Open guided steps', target: '#consultationDuringTitle'
    };
  }

  function normalized(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function displayDate(value) {
    const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return text(value);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[Number(match[2]) - 1];
    return month ? `${month} ${Number(match[3])}, ${match[1]}` : text(value);
  }

  function occupancyLabel(value) {
    const key = normalized(value);
    if (['primary residence', 'primary home', 'owner occupied'].includes(key)) return 'Primary residence';
    if (['rental', 'rental property', 'tenant occupied'].includes(key)) return 'Rental property';
    if (['second home', 'secondary residence', 'vacation home'].includes(key)) return 'Second home';
    if (['not sure', 'unknown', 'undecided'].includes(key)) return 'Not decided';
    return text(value);
  }

  function housingLabel(value) {
    const key = normalized(value);
    if (/rent.*apartment/.test(key)) return 'Rents an apartment';
    if (/rent.*house|rent.*townhome/.test(key)) return 'Rents a house or townhome';
    if (/own.*home/.test(key)) return 'Owns current home';
    if (key === 'other') return 'Other housing context';
    return text(value);
  }

  function referralLabel(context) {
    if (text(context?.partnerName)) return text(context.partnerName);
    const source = normalized(context?.referralSource);
    if (/realtor|partner/.test(source)) return 'Realtor partner';
    if (/neighbor/.test(source)) return 'Neighbor referral';
    return '';
  }

  function campaignLabel(value) {
    const campaign = text(value);
    if (!campaign || /[_=]/.test(campaign) || !/[a-z]/i.test(campaign)) return '';
    return campaign.length <= 80 ? campaign : '';
  }

  function entryLabel(context) {
    if (context?.sms) return '408-FARMERS text';
    const source = normalized(context?.source);
    if (/408 farmers|408farmers/.test(source)) return '408FARMERS web';
    const campaign = campaignLabel(context?.campaign);
    if (campaign) return campaign;
    if (!source || source === 'direct' || source === 'coveragefit') return 'CoverageFit direct';
    return 'Transferred web entry';
  }

  function prospectStory(snapshot) {
    const context = snapshot?.entryContext || {};
    const reviewReason = text(snapshot?.customer?.reviewContext);
    const reviewKey = normalized(reviewReason);
    const acquisitionKey = normalized([context?.campaign, context?.entryPoint, context?.launchSurface].filter(Boolean).join(' '));
    const fullName = text(snapshot?.customer?.name);
    const firstName = text(snapshot?.customer?.firstName) || (fullName && fullName !== 'Not provided' ? fullName.split(/\s+/)[0] : '');
    const subject = firstName || 'The homeowner';
    const address = text(snapshot?.customer?.propertyAddress || snapshot?.property?.address);
    const property = address && !/not provided/i.test(address) ? address : 'the property';
    const occupation = text(context?.occupationSegment);
    const professional = Boolean(occupation && (/professional eligibility/.test(reviewKey) || (!reviewReason && /healthcare|teacher|school|tech|engineer|professional|occupation/.test(acquisitionKey))));
    const buyer = /buying a home|home purchase|new home/.test(reviewKey) || Boolean(context?.closingDate);
    const bundle = /home and auto|home auto|bundle/.test(reviewKey) || /auto bundle|bundle/.test(acquisitionKey);
    const kind = buyer ? 'homebuyer' : bundle ? 'bundle' : professional ? 'professional' : 'homeowner';
    const sentences = [];

    if (kind === 'homebuyer') {
      sentences.push(address && !/not provided/i.test(address)
        ? `${subject} is buying the home at ${property} and requested a home protection review.`
        : `${subject} is buying a home and requested a home protection review.`);
      if (context?.closingDate) sentences.push(`A closing date of ${displayDate(context.closingDate)} was provided.`);
      if (context?.occupancy) sentences.push(`They reported the expected occupancy as ${occupancyLabel(context.occupancy).toLowerCase()}.`);
    } else if (kind === 'bundle') {
      sentences.push(`${subject} requested a home and auto review.`);
      sentences.push(`CoverageFit is organizing the home protection portion for ${property}.`);
    } else if (kind === 'professional') {
      sentences.push(`${subject} identified their professional context as ${occupation} and requested a professional discount eligibility review for ${property}.`);
      sentences.push('Eligibility and discounts have not been determined; Dylan must verify available Farmers discounts during quoting and underwriting.');
    } else {
      sentences.push(`${subject} requested a home protection review for ${property}.`);
      if (reviewReason) sentences.push(`Their stated reason is “${reviewReason}.”`);
      else sentences.push('The original review reason was not captured and should be confirmed.');
    }

    const referral = referralLabel(context);
    if (referral) sentences.push(`${referral} referred them.`);
    if (context?.sms) sentences.push('The journey began through the 408-FARMERS text intake and continued into CoverageFit.');
    else if (/408 farmers|408farmers/.test(normalized(context?.source))) sentences.push('The journey began on 408FARMERS and continued into CoverageFit.');
    else if (!referral && campaignLabel(context?.campaign)) sentences.push(`They arrived through the ${campaignLabel(context.campaign)} campaign.`);
    else if (!referral && (!context?.source || ['direct', 'coveragefit'].includes(normalized(context.source)))) sentences.push('They began directly in CoverageFit.');
    if (context?.rush) sentences.push('The request is marked time-sensitive; timing and coverage availability still require confirmation.');

    const facts = [];
    const addFact = (label, value, kindValue) => {
      const cleanValue = text(value);
      if (!cleanValue || facts.some(item => item.label === label && item.value === cleanValue)) return;
      facts.push({ label, value: cleanValue, kind: kindValue || 'context' });
    };
    if (context?.rush) addFact('Urgency', 'Time-sensitive', 'urgent');
    addFact('Professional context', occupation, 'professional');
    addFact('Closing', displayDate(context?.closingDate), 'buyer');
    addFact('Occupancy', occupancyLabel(context?.occupancy), 'buyer');
    addFact('Housing context', housingLabel(context?.housingContext), 'housing');
    addFact('Referred by', referral, 'referral');
    addFact('Entry', entryLabel(context), 'entry');

    let note = 'Acquisition context explains how they arrived; it does not replace the homeowner’s stated review reason.';
    if (professional && context?.rush) note = 'Professional eligibility, discount availability, timing, and coverage still require confirmation; Dylan must verify them during quoting and underwriting.';
    else if (professional) note = 'Eligibility and available Farmers professional discounts still require confirmation; Dylan must verify available Farmers professional discounts during quoting and underwriting.';
    else if (context?.rush) note = 'Timing and coverage availability still require confirmation.';
    return { kind, narrative: sentences.join(' '), facts: facts.slice(0, 6), note };
  }

  function build(snapshot, context) {
    const reason = text(snapshot?.customer?.reviewContext);
    const status = statusModel(snapshot, context || {});
    const story = prospectStory(snapshot);
    const verify = verificationItems(snapshot);
    if (story.kind === 'professional' && !verify.some(item => item.kind === 'professional')) {
      verify.unshift({
        id: 'professional-program-verification',
        title: 'Professional program opportunity',
        detail: 'Confirm the reported occupation and verify which Farmers professional discounts may be available during quoting and underwriting.',
        kind: 'professional',
        label: 'Verify professional program',
        position: 0,
        sourceOrder: -1
      });
    }
    if (verify.length > 3) verify.length = 3;
    const verification = verificationMap(snapshot);
    const model = {
      version: VERSION,
      who: {
        name: text(snapshot?.customer?.name, 'Homeowner name not provided'),
        property: text(snapshot?.customer?.propertyAddress || snapshot?.property?.address, 'Property address not provided')
      },
      why: {
        reason: reason || 'Review reason not provided',
        detail: reason ? 'Homeowner-provided reason for this review.' : 'Confirm why the homeowner requested the review.'
      },
      status,
      story,
      priorities: priorityFindings(snapshot, 3),
      verification,
      verify,
      action: null,
      guardrail: verification.guardrail
    };
    model.action = nextAction(status, verify);
    return model;
  }

  const api = Object.freeze({ VERSION, STAGE_LABELS, VERIFICATION_GROUPS, priorityFindings, verificationMap, build });
  root.CoverageFitConsultationCommandCenter = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
