(() => {
  'use strict';

  const config = window.COVERAGEFIT_CONFIG;
  const scoring = window.CoverageFitProtectionScore;
  if (!config) throw new Error('CoverageFit config is missing.');
  if (!scoring || typeof scoring.evaluate !== 'function') throw new Error('CoverageFit Protection Score methodology is missing.');

  const continuity = window.CoverageFitAssessmentContinuity || null;
  const consumerCopy = window.CoverageFitAssessmentConsumerCopy || null;
  const conversionHandoff = window.CoverageFitConversionHandoff || null;
  const advisoryDiscovery = window.CoverageFitAdvisoryDiscoveryContract || null;
  const advisorySignals = window.CoverageFitAdvisorySignalEngine || null;
  const advisoryAnchors = window.CoverageFitAdvisoryRecommendationAnchorContract || null;
  const advisoryOpening = window.CoverageFitAdvisoryOpening || null;
  const advisoryRelationship = window.CoverageFitAdvisoryRelationshipDiscovery || null;
  const advisoryLifestyle = window.CoverageFitAdvisoryLifestyleDiscovery || null;
  const advisoryOutcome = window.CoverageFitAdvisoryOutcomeDiscovery || null;
  const advisoryOrchestration = window.CoverageFitAdvisoryAssessmentOrchestration || null;
  const advisoryReaction = window.CoverageFitAdvisoryCustomerReaction || null;
  const advisoryResults = window.CoverageFitAdvisoryResultsModel || null;
  const restoredDraft = continuity?.getDraft?.() || null;
  let current = 0;
  let selections = restoredDraft?.selections && typeof restoredDraft.selections === 'object'
    ? JSON.parse(JSON.stringify(restoredDraft.selections))
    : {};
  let earlyInsightShown = Boolean(restoredDraft?.earlyInsightShown);
  let restoredView = restoredDraft?.view || 'quiz';
  const restoredStartedAt = Number(restoredDraft?.startedAt || 0);
  const startedAt = Number.isFinite(restoredStartedAt) && restoredStartedAt > 0 ? restoredStartedAt : Date.now();
  const $ = id => document.getElementById(id);
  const qTitle = $('questionTitle');
  const qHelp = $('questionHelp');
  const answersEl = $('answers');
  const stepLabel = $('stepLabel');
  const bar = $('progressBar');
  const progressRegion = bar?.parentElement || null;
  const back = $('backBtn');
  const next = $('nextBtn');
  const quiz = $('quiz');
  const result = $('result');
  const restart = $('restartBtn');
  const remaining = $('timeRemaining');
  const kicker = $('questionKicker');
  const earlyInsight = $('earlyInsight');
  const earlyInsightTitle = $('earlyInsightTitle');
  const earlyInsightCopy = $('earlyInsightCopy');
  const questionLive = $('assessmentQuestionLive');
  const assessmentChapter = $('assessmentChapter');
  const assessmentChapterStep = $('assessmentChapterStep');
  const assessmentChapterCount = $('assessmentChapterCount');
  const assessmentChapterTitle = $('assessmentChapterTitle');
  const assessmentChapterCopy = $('assessmentChapterCopy');
  let lastAnnouncedQuestion = '';
  let lastTrackedChapter = '';

  let propertyContext = $('propertyQuestionContext');
  if (!propertyContext) {
    propertyContext = document.createElement('div');
    propertyContext.id = 'propertyQuestionContext';
    propertyContext.className = 'property-question-context';
    propertyContext.hidden = true;
    qHelp.insertAdjacentElement('afterend', propertyContext);
  }

  let reviewReasonContext = $('reviewReasonQuestionContext');
  if (!reviewReasonContext) {
    reviewReasonContext = document.createElement('div');
    reviewReasonContext.id = 'reviewReasonQuestionContext';
    reviewReasonContext.className = 'review-reason-question-context';
    reviewReasonContext.hidden = true;
    propertyContext.insertAdjacentElement('afterend', reviewReasonContext);
  }

  let feedback = $('answerFeedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'answerFeedback';
    feedback.className = 'answer-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    answersEl.insertAdjacentElement('afterend', feedback);
  }

  const chapter = config.chapterLabels || {};
  const storageKey = config.storageKey || `coveragefit_${config.slug}_report`;
  const subject = config.subjectLabel || 'Protection';
  let profile = null;
  if (config.profileStorageKey) {
    try {
      profile = JSON.parse(sessionStorage.getItem(config.profileStorageKey) || localStorage.getItem(config.profileStorageKey) || 'null');
    } catch (_) {}
  }

  const activeReviewReason = () => {
    const personalization = window.CoverageFitPersonalization?.get?.() || window.CoverageFitAssessmentPrefill?.context || null;
    return advisoryOpening?.getReviewReason?.()
      || personalization?.journey?.reviewReason
      || window.CoverageFitAssessmentPrefill?.reviewContext
      || window.CoverageFitTrigger
      || '';
  };

  const activeQuestions = () => {
    if (typeof config.resolveQuestions === 'function') {
      return config.resolveQuestions({ selections, profile: profile || {}, reviewReason: activeReviewReason() });
    }
    return config.questions.filter(question => !question.condition || question.condition(selections, profile || {}));
  };

  if (restoredDraft) {
    const questions = activeQuestions();
    const restoredIndex = questions.findIndex(question => question.key === restoredDraft.currentQuestionKey);
    current = restoredIndex >= 0
      ? restoredIndex
      : Math.max(0, Math.min(Number(restoredDraft.currentIndex || 0), Math.max(0, questions.length - 1)));
  }

  function pruneHidden() {
    const active = new Set(activeQuestions().map(question => question.key));
    Object.keys(selections).forEach(key => {
      if (!active.has(key)) delete selections[key];
    });
  }

  function saveDraft(reason = 'progress', extra = {}) {
    if (!continuity?.save) return null;
    const questions = activeQuestions();
    const question = questions[current] || null;
    return continuity.save({
      currentIndex: current,
      currentQuestionKey: question?.key || '',
      questionCount: questions.length,
      selections,
      earlyInsightShown,
      view: 'quiz',
      propertyConfirmed: document.body.classList.contains('property-confirmed'),
      startedAt,
      advisoryChapterId: advisoryOrchestration?.questionContext?.(questions, current)?.chapter?.id || '',
      advisoryChapterNumber: advisoryOrchestration?.questionContext?.(questions, current)?.chapter?.number || null,
      lastSaveReason: reason,
      ...extra
    });
  }

  function answerState(answer, question) {
    const impact = scoring.impactFor(answer, question);
    return {
      impact,
      findingType: scoring.findingTypeFor(answer, impact),
      positive: impact <= 0
    };
  }

  function feedbackFor(answer, question) {
    const state = answerState(answer, question);
    if (state.positive) return 'This gives your review a clear starting point.';
    if (state.findingType === scoring.FINDING_TYPES.IDENTIFIED_GAP) {
      return 'This is worth discussing with Dylan so you can understand the available options.';
    }
    if (state.findingType === scoring.FINDING_TYPES.UNCERTAINTY) {
      return 'No problem. CoverageFit will add this to the list of items to confirm in your policy.';
    }
    return 'This may be worth comparing with your current needs during the review.';
  }

  function evidenceStateFor(answer, question) {
    const state = answerState(answer, question);
    const quality = scoring.evidenceQualityFor?.(answer, question, state.findingType)
      || (answer ? 'confirmed' : 'missing');
    const labels = scoring.EVIDENCE_LABELS || {};
    return {
      quality,
      label: labels[quality] || (quality === 'confirmed' ? 'Clear response captured' : 'Needs policy verification')
    };
  }

  function renderAnswerFeedback(answer, question) {
    const state = answerState(answer, question);
    const evidence = evidenceStateFor(answer, question);
    const friendlyEvidence = {
      confirmed: 'Clear answer captured',
      partial: 'A little more detail may help',
      'needs-verification': 'Good item to confirm',
      missing: 'Choose the closest answer'
    }[evidence.quality] || 'Good item to confirm';
    feedback.dataset.evidenceQuality = evidence.quality;
    feedback.innerHTML = `<strong>${state.positive ? '✓ Good to know' : '→ Added to your review'}</strong><span>${feedbackFor(answer, question)}</span><small class="evidence-quality evidence-quality--${evidence.quality}">${friendlyEvidence}</small>`;
  }

  function showIncompleteFeedback(question) {
    feedback.dataset.evidenceQuality = 'missing';
    feedback.innerHTML = `<strong>Choose one answer to continue</strong><span>Select the option that best matches what you know today. “Not sure” is always okay.</span>`;
    window.CoverageFitAnalytics?.track('assessment_completion_blocked', {
      assessment: config.slug,
      question: question?.key || '',
      step: current + 1
    });
  }

  function updateJourney(stage) {
    const order = ['profile', 'industry', 'coverage', 'snapshot', 'contact'];
    const activeIndex = order.indexOf(stage);
    document.querySelectorAll('#businessJourney .journey-step').forEach(element => {
      const index = order.indexOf(element.dataset.stage);
      element.classList.toggle('is-active', index === activeIndex);
      element.classList.toggle('is-complete', index < activeIndex);
    });
  }

  function render() {
    pruneHidden();
    const questions = activeQuestions();
    if (current >= questions.length) current = Math.max(0, questions.length - 1);
    const question = questions[current];
    const conversation = advisoryOrchestration?.questionContext?.(questions, current) || null;
    const progress = conversation?.progressPercent ?? Math.round((current + 1) / questions.length * 100);
    const minutes = consumerCopy?.remainingMinutes?.(questions.length, current)
      || Math.max(1, Math.ceil((questions.length - current) * 0.42));
    const stage = question.section === 'coverage' ? 'coverage' : 'industry';
    updateJourney(stage);

    const visibleQuestion = consumerCopy?.question?.(question) || question;
    qTitle.textContent = visibleQuestion.title || question.title;
    qHelp.textContent = visibleQuestion.help || question.help;
    propertyContext.hidden = !question.propertyContext;
    propertyContext.textContent = question.propertyContext || '';
    propertyContext.dataset.propertyAware = question.propertyAware ? 'true' : 'false';
    reviewReasonContext.hidden = !question.reviewReasonContext;
    reviewReasonContext.textContent = question.reviewReasonContext || '';
    reviewReasonContext.dataset.reviewReason = question.reviewReasonKey || 'general';
    reviewReasonContext.dataset.reviewReasonAware = question.reviewReasonAware ? 'true' : 'false';
    stepLabel.textContent = conversation
      ? `Coverage question ${conversation.coverageQuestionNumber} of ${conversation.coverageQuestionCount}`
      : `Question ${current + 1} of ${questions.length}`;
    remaining.textContent = minutes === 1 ? 'About 1 minute left in the coverage review' : `About ${minutes} minutes left in the coverage review`;
    kicker.textContent = chapter[question.category] || 'What this helps you understand';
    bar.style.width = `${progress}%`;
    if (conversation && assessmentChapter) {
      assessmentChapter.dataset.chapter = conversation.chapter.id;
      assessmentChapter.dataset.entered = conversation.enteredChapter ? 'true' : 'false';
      if (assessmentChapterStep) assessmentChapterStep.textContent = `Chapter ${conversation.chapter.number} of 6`;
      if (assessmentChapterCount) assessmentChapterCount.textContent = `${conversation.chapterQuestionNumber} of ${conversation.chapterQuestionCount} in this chapter`;
      if (assessmentChapterTitle) assessmentChapterTitle.textContent = conversation.chapter.title;
      if (assessmentChapterCopy) assessmentChapterCopy.textContent = conversation.chapter.description;
      document.body.dataset.assessmentChapter = conversation.chapter.id;
      if (lastTrackedChapter !== conversation.chapter.id) {
        window.CoverageFitAnalytics?.track?.('advisory_assessment_chapter_entered', {
          assessment: config.slug,
          chapter: conversation.chapter.id,
          chapterNumber: conversation.chapter.number,
          coverageQuestion: conversation.coverageQuestionNumber,
          scoreFormulaChanged: false
        });
        lastTrackedChapter = conversation.chapter.id;
      }
    }
    if (progressRegion) {
      progressRegion.setAttribute('aria-valuemax', String(questions.length));
      progressRegion.setAttribute('aria-valuenow', String(current + 1));
      progressRegion.setAttribute('aria-valuetext', conversation?.progressText || `Question ${current + 1} of ${questions.length}`);
    }
    if (questionLive && lastAnnouncedQuestion !== question.key) {
      questionLive.textContent = `${conversation?.progressText || `Question ${current + 1} of ${questions.length}.`} ${visibleQuestion.title || question.title}`;
      lastAnnouncedQuestion = question.key;
    }
    answersEl.innerHTML = '';
    feedback.innerHTML = '';
    earlyInsight.hidden = !(current === 1 && earlyInsightShown);
    if (current === 1 && earlyInsightShown) showEarlyInsight(true);

    if (question.type === 'text' || question.type === 'date') {
      const wrap = document.createElement('div');
      wrap.className = 'answer-input-wrap';
      const input = document.createElement('input');
      input.className = 'answer-input';
      input.type = question.type;
      input.placeholder = question.placeholder || '';
      input.value = selections[question.key]?.value || '';
      input.setAttribute('aria-label', question.title);
      const note = document.createElement('span');
      note.className = 'answer-input-note';
      note.textContent = question.required === false
        ? 'Optional. You can continue without an exact date.'
        : 'This will be included in your private review summary.';
      wrap.append(input, note);
      answersEl.appendChild(wrap);

      const store = () => {
        const value = input.value.trim();
        if (value) {
          selections[question.key] = {
            questionKey: question.key,
            questionTitle: question.title,
            category: question.category,
            weight: question.weight || 0,
            label: value,
            value,
            points: 0,
            scoreImpact: 0,
            impactLevel: 'none',
            findingType: scoring.FINDING_TYPES.STRENGTH,
            tag: question.tag || question.title,
            insight: `${question.tag || question.title}: ${value}`,
            question: `Confirm ${String(question.tag || question.title).toLowerCase()} during the review.`
          };
        } else {
          delete selections[question.key];
        }
        next.disabled = question.required !== false && !value;
        saveDraft('answer_updated');
      };
      input.addEventListener('input', store);
      input.addEventListener('change', store);
      next.disabled = question.required !== false && !input.value.trim();
    } else {
      question.answers.forEach((answer, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `answer ${selections[question.key]?.index === index ? 'selected' : ''}`;
        button.setAttribute('aria-pressed', selections[question.key]?.index === index ? 'true' : 'false');
        const visibleAnswer = consumerCopy?.answer?.(question, index, answer) || answer;
        button.innerHTML = `<div><strong>${visibleAnswer.label}</strong><span>${visibleAnswer.sub}</span></div><div class="circle" aria-hidden="true"></div>`;
        button.onclick = () => {
          selections[question.key] = {
            ...answer,
            index,
            questionKey: question.key,
            questionTitle: question.title,
            category: question.category,
            weight: question.weight,
            section: question.section,
            propertyAware: Boolean(question.propertyAware),
            propertyContext: question.propertyContext || '',
            applicabilityReason: question.applicabilityReason || '',
            priorityBoost: Number(question.priorityBoost || 0),
            propertyPriorityBoost: Number(question.propertyPriorityBoost || 0),
            reviewReasonAware: Boolean(question.reviewReasonAware),
            reviewReasonKey: question.reviewReasonKey || 'general',
            reviewReasonLabel: question.reviewReasonLabel || '',
            reviewReasonContext: question.reviewReasonContext || '',
            reviewReasonApplicabilityReason: question.reviewReasonApplicabilityReason || '',
            reviewReasonPriorityBoost: Number(question.reviewReasonPriorityBoost || 0)
          };
          pruneHidden();
          saveDraft('answer_selected');
          window.CoverageFitAnalytics?.track('answer_selected', {
            assessment: config.slug,
            industry: profile?.industry || '',
            question: question.key,
            answer: answer.label,
            findingType: answerState(answer, question).findingType,
            reviewReason: question.reviewReasonKey || 'general',
            reviewReasonAware: Boolean(question.reviewReasonAware),
            step: current + 1
          });
          next.disabled = false;
          render();
          renderAnswerFeedback(answer, question);
          answersEl.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
          if (current === 1 && !earlyInsightShown) showEarlyInsight();
        };
        answersEl.appendChild(button);
      });

      if (selections[question.key]) {
        renderAnswerFeedback(selections[question.key], question);
      }
      next.disabled = !selections[question.key];
    }

    back.disabled = current === 0;
    next.textContent = current === questions.length - 1
      ? (advisoryOrchestration ? 'Review What We Found' : (config.finalButtonLabel || `Build My ${subject} Snapshot`))
      : 'Continue';
  }

  function scoreEvaluation() {
    return scoring.evaluate({
      questions: activeQuestions(),
      selections,
      methodology: config.scoreMethodology
    });
  }

  function payload() {
    const evaluation = scoreEvaluation();
    const findingByKey = new Map(evaluation.findings.map(finding => [finding.key, finding]));
    const answerRows = Object.values(selections).map(answer => {
      const finding = findingByKey.get(answer.questionKey);
      return {
        key: answer.questionKey,
        title: answer.questionTitle,
        tag: answer.tag,
        category: answer.category,
        label: answer.label,
        value: answer.value || '',
        points: finding?.points ?? answer.points ?? 0,
        scoreImpact: finding?.scoreImpact ?? 0,
        impactLevel: finding?.impactLevel || answer.impactLevel || null,
        findingType: finding?.findingType || answer.findingType || scoring.FINDING_TYPES.STRENGTH,
        evidenceQuality: finding?.evidenceQuality || answer.evidenceQuality || 'confirmed',
        evidenceLabel: finding?.evidenceLabel || '',
        evidenceSufficient: finding?.evidenceSufficient !== false,
        evidenceBasis: finding?.evidenceBasis || '',
        evidencePrompt: finding?.evidencePrompt || '',
        answered: finding?.answered !== false,
        required: finding?.required !== false,
        weight: finding?.weight ?? answer.weight ?? 0,
        weightedPenalty: finding?.weightedPenalty ?? 0,
        priorityScore: finding?.priorityScore ?? 0,
        severityLabel: finding?.severityLabel || 'Confirmed starting point',
        propertyAware: Boolean(finding?.propertyAware || answer.propertyAware),
        propertyContext: finding?.propertyContext || answer.propertyContext || '',
        applicabilityReason: finding?.applicabilityReason || answer.applicabilityReason || '',
        priorityBoost: finding?.priorityBoost ?? answer.priorityBoost ?? 0,
        propertyPriorityBoost: finding?.propertyPriorityBoost ?? answer.propertyPriorityBoost ?? 0,
        reviewReasonAware: Boolean(finding?.reviewReasonAware || answer.reviewReasonAware),
        reviewReasonKey: finding?.reviewReasonKey || answer.reviewReasonKey || 'general',
        reviewReasonLabel: finding?.reviewReasonLabel || answer.reviewReasonLabel || '',
        reviewReasonContext: finding?.reviewReasonContext || answer.reviewReasonContext || '',
        reviewReasonApplicabilityReason: finding?.reviewReasonApplicabilityReason || answer.reviewReasonApplicabilityReason || '',
        reviewReasonPriorityBoost: finding?.reviewReasonPriorityBoost ?? answer.reviewReasonPriorityBoost ?? 0,
        insight: answer.insight,
        question: answer.question
      };
    });

    const prospect = window.CoverageFitAssessmentPrefill?.profile || null;
    const displacementContext = (()=>{try{return JSON.parse(window.localStorage?.getItem?.('coveragefit_displacement_context_v1')||'null');}catch(_){return null;}})();
    const personalization = window.CoverageFitPersonalization?.get?.() || window.CoverageFitAssessmentPrefill?.context || null;
    const journey = personalization?.journey || {};
    const attribution = window.CoverageFitAttribution?.getPayload?.() || null;
    const referral = window.CoverageFitReferralAttribution?.getContext?.() || { active: false };
    const integration = personalization
      ? {
          source: journey.source || '',
          campaign: journey.campaign || '',
          campaignId: journey.campaignId || '',
          campaignVariant: journey.campaignVariant || '',
          campaignZip: journey.campaignZip || '',
          referralId: referral.active ? referral.referralId : '',
          referralSource: referral.active ? referral.referralSource : (journey.referralSource || ''),
          partnerId: journey.partnerId || prospect?.integration?.partnerId || '',
          partnerName: journey.partnerName || prospect?.integration?.partnerName || '',
          entryMethod: journey.entryMethod || prospect?.integration?.entryMethod || '',
          referralChannel: referral.active ? referral.referralChannel : '',
          entry: journey.entryPoint || '',
          assessment: journey.assessment || config.slug,
          sessionId: personalization.sessionId || '',
          prefilled: Boolean(personalization.flags?.hasProfile)
        }
      : (prospect?.integration
        ? { ...prospect.integration }
        : {
            source: attribution?.source || '',
            campaign: attribution?.campaign || '',
            campaignId: attribution?.lastTouch?.campaign_id || attribution?.firstTouch?.campaign_id || '',
            campaignVariant: attribution?.lastTouch?.campaign_variant || attribution?.firstTouch?.campaign_variant || '',
            campaignZip: attribution?.lastTouch?.campaign_zip || attribution?.firstTouch?.campaign_zip || '',
            referralId: referral.active ? referral.referralId : '',
            referralSource: referral.active ? referral.referralSource : '',
            referralChannel: referral.active ? referral.referralChannel : '',
            entry: attribution?.entry || '',
            sessionId: attribution?.sessionId || '',
            prefilled: false
          });

    let discoveryProfile = advisoryDiscovery?.seedFromExistingContext?.({
      product: config.slug,
      reviewReason: activeReviewReason(),
      journey,
      prospect,
      integration,
      personalization,
      currentCarrier: prospect?.currentCarrier || prospect?.coverage?.currentCarrier || prospect?.currentCoverage?.currentCarrier || ''
    }) || null;
    const openingDiscovery = advisoryOpening?.getDiscoveryProfile?.() || null;
    if (discoveryProfile && openingDiscovery && advisoryDiscovery?.merge) {
      discoveryProfile = advisoryDiscovery.merge(discoveryProfile, openingDiscovery);
    } else if (!discoveryProfile && openingDiscovery) {
      discoveryProfile = openingDiscovery;
    }
    const relationshipDiscovery = advisoryRelationship?.getDiscoveryProfile?.() || null;
    if (discoveryProfile && relationshipDiscovery && advisoryDiscovery?.merge) {
      discoveryProfile = advisoryDiscovery.merge(discoveryProfile, relationshipDiscovery);
    } else if (!discoveryProfile && relationshipDiscovery) {
      discoveryProfile = relationshipDiscovery;
    }
    const lifestyleDiscovery = advisoryLifestyle?.getDiscoveryProfile?.() || null;
    if (discoveryProfile && lifestyleDiscovery && advisoryDiscovery?.merge) {
      discoveryProfile = advisoryDiscovery.merge(discoveryProfile, lifestyleDiscovery);
    } else if (!discoveryProfile && lifestyleDiscovery) {
      discoveryProfile = lifestyleDiscovery;
    }
    const outcomeDiscovery = advisoryOutcome?.getDiscoveryProfile?.() || null;
    if (discoveryProfile && outcomeDiscovery && advisoryDiscovery?.merge) {
      discoveryProfile = advisoryDiscovery.merge(discoveryProfile, outcomeDiscovery);
    } else if (!discoveryProfile && outcomeDiscovery) {
      discoveryProfile = outcomeDiscovery;
    }
    if (discoveryProfile && advisorySignals?.apply) {
      Object.assign(discoveryProfile, advisorySignals.apply(discoveryProfile));
    }

    const priorityRows = evaluation.priorities.slice(0, 3).map(finding => ({
      name: finding.tag,
      tag: finding.tag,
      category: finding.category,
      insight: finding.insight,
      question: finding.question,
      points: finding.points,
      weight: finding.weight,
      weightedPenalty: finding.weightedPenalty,
      priorityScore: finding.priorityScore,
      scoreImpact: finding.scoreImpact,
      findingType: finding.findingType,
      severityLabel: finding.severityLabel,
      evidenceQuality: finding.evidenceQuality,
      evidenceLabel: finding.evidenceLabel,
      evidenceSufficient: finding.evidenceSufficient,
      evidenceBasis: finding.evidenceBasis,
      evidencePrompt: finding.evidencePrompt,
      answered: finding.answered,
      required: finding.required,
      propertyAware: Boolean(finding.propertyAware),
      propertyContext: finding.propertyContext || '',
      applicabilityReason: finding.applicabilityReason || '',
      priorityBoost: finding.priorityBoost || 0,
      propertyPriorityBoost: finding.propertyPriorityBoost || 0,
      reviewReasonAware: Boolean(finding.reviewReasonAware),
      reviewReasonKey: finding.reviewReasonKey || 'general',
      reviewReasonLabel: finding.reviewReasonLabel || '',
      reviewReasonContext: finding.reviewReasonContext || '',
      reviewReasonApplicabilityReason: finding.reviewReasonApplicabilityReason || '',
      reviewReasonPriorityBoost: finding.reviewReasonPriorityBoost || 0,
      priority: finding.findingType === scoring.FINDING_TYPES.IDENTIFIED_GAP ? 'high' : finding.findingType === scoring.FINDING_TYPES.UNCERTAINTY ? 'medium' : 'review'
    }));
    const strengthFindings = evaluation.strengths.slice(0, 3);
    if (discoveryProfile && advisoryAnchors?.apply) {
      const anchored = advisoryAnchors.apply(discoveryProfile, priorityRows, { timestamp: new Date().toISOString() });
      Object.assign(discoveryProfile, anchored);
    }

    const report = {
      version: config.slug === 'business' ? 'v2.9' : 'v2.4',
      assessment: config.slug,
      attribution,
      personalizationContext: personalization,
      propertyProfile: config.slug === 'home' ? (window.CoverageFitPropertyIntelligence?.load?.() || null) : null,
      industryModule: config.industryModule || profile?.module || profile?.industry || 'general',
      industryLabel: config.industryLabel || profile?.industryLabel || 'Business',
      profile,
      reviewContext: activeReviewReason(),
      prospectProfile: prospect,
      integration,
      discoveryProfile,
      conversionHandoff: config.slug === 'home' && conversionHandoff?.get ? (() => {
        const state = conversionHandoff.get();
        return {
          build: state?.build || '',
          trustedContract: Boolean(state?.flags?.trustedContract),
          directAssessment: Boolean(state?.flags?.directAssessmentEligible),
          quickPropertyConfirmation: Boolean(state?.flags?.quickPropertyConfirmationEligible),
          zeroRepeatEligible: Boolean(state?.flags?.zeroRepeatEligible)
        };
      })() : null,
      trigger: window.CoverageFitTrigger || sessionStorage.getItem('coveragefit_trigger') || '',
      createdAt: new Date().toISOString(),
      score: evaluation.score,
      status: evaluation.status,
      rating: evaluation.status,
      scoreMethodology: evaluation.methodology,
      propertyPersonalization: config.slug === 'home' ? {
        ...(config.propertyPersonalization || {}),
        profileId: profile?.profileId || null,
        activeQuestionKeys: activeQuestions().filter(question => question.propertyAware).map(question => question.key),
        prioritizedQuestionKeys: activeQuestions().filter(question => Number(question.propertyPriorityBoost || 0) > 0).map(question => question.key),
        usedConfirmedPropertyData: activeQuestions().some(question => question.propertyAware)
      } : null,
      reviewReasonPersonalization: config.slug === 'home' ? {
        ...(config.reviewReasonPersonalization || {}),
        reviewReason: activeReviewReason(),
        reasonKey: config.reviewReasonKeyFor?.(activeReviewReason()) || 'general',
        label: config.reviewReasonRules?.[config.reviewReasonKeyFor?.(activeReviewReason()) || 'general']?.label || 'General review',
        summary: config.reviewReasonRules?.[config.reviewReasonKeyFor?.(activeReviewReason()) || 'general']?.summary || '',
        contextualQuestionKeys: activeQuestions().filter(question => question.reviewReasonAware).map(question => question.key),
        prioritizedQuestionKeys: activeQuestions().filter(question => Number(question.reviewReasonPriorityBoost || 0) > 0).map(question => question.key),
        scoreFormulaChanged: false
      } : null,
      assessmentCompletion: {
        ...(evaluation.completion || evaluation.evidence || {}),
        methodology: config.evidenceQualityMethodology || {
          id: 'coveragefit-assessment-evidence-quality-v1',
          version: '1.0.0',
          description: 'Classifies whether each recorded response is clear enough to carry into a licensed review without changing the Protection Score formula.'
        },
        activeQuestionKeys: evaluation.findings.map(finding => finding.key),
        unansweredQuestionKeys: evaluation.findings.filter(finding => !finding.answered && finding.required !== false).map(finding => finding.key)
      },
      scoreDiagnostics: {
        totalWeight: evaluation.methodology.totalWeight,
        weightedPenalty: evaluation.methodology.totalPenalty,
        identifiedGapCount: evaluation.priorities.filter(finding => finding.findingType === scoring.FINDING_TYPES.IDENTIFIED_GAP).length,
        uncertaintyCount: evaluation.priorities.filter(finding => finding.findingType === scoring.FINDING_TYPES.UNCERTAINTY).length,
        considerationCount: evaluation.priorities.filter(finding => finding.findingType === scoring.FINDING_TYPES.CONSIDERATION).length,
        activeQuestionCount: evaluation.findings.length,
        propertyAwareQuestionCount: evaluation.findings.filter(finding => finding.propertyAware).length,
        reviewReasonAwareQuestionCount: evaluation.findings.filter(finding => finding.reviewReasonAware).length,
        confirmedEvidenceCount: evaluation.completion?.confirmedCount || 0,
        partialEvidenceCount: evaluation.completion?.partialCount || 0,
        needsVerificationCount: evaluation.completion?.needsVerificationCount || 0,
        missingRequiredCount: evaluation.completion?.missingRequiredCount || 0,
        completionRate: evaluation.completion?.completionRate ?? 100,
        scoreIsFinal: evaluation.completion?.scoreIsFinal !== false
      },
      categories: evaluation.categories,
      answers: answerRows,
      industryResponses: Object.fromEntries(answerRows.map(answer => [answer.key, {
        question: answer.title,
        answer: answer.label,
        value: answer.value,
        category: answer.category,
        points: answer.points,
        scoreImpact: answer.scoreImpact,
        findingType: answer.findingType,
        evidenceQuality: answer.evidenceQuality,
        evidenceSufficient: answer.evidenceSufficient,
        weightedPenalty: answer.weightedPenalty,
        priorityScore: answer.priorityScore
      }])),
      strengths: strengthFindings.map(finding => finding.insight || finding.label),
      strengthFindings,
      priorities: priorityRows,
      strongest: strengthFindings[0]?.insight || 'Completing this review is a positive first step.',
      topPriority: priorityRows[0]?.insight || config.defaultPriority || 'Confirm your current protection details during a licensed review.'
    };
    if (config.slug === 'home' && advisoryResults?.derive) {
      report.advisoryResults = advisoryResults.derive(report);
    }
    return report;
  }

  function save(report) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(report));
      sessionStorage.setItem(`${storageKey}_responses`, JSON.stringify(report.industryResponses || {}));
    } catch (_) {}
  }

  function renderEvidencePreview(completion) {
    const snapshotPreview = result.querySelector('.snapshot-preview');
    if (!snapshotPreview) return;
    let preview = $('evidenceQualityPreview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'evidenceQualityPreview';
      preview.className = 'evidence-quality-preview';
      snapshotPreview.insertAdjacentElement('afterend', preview);
    }
    const summary = completion || {};
    preview.dataset.state = summary.state || 'complete';
    preview.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'evidence-quality-preview__heading';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'Assessment evidence';
    const title = document.createElement('strong');
    title.textContent = summary.label || 'Evidence ready';
    heading.append(eyebrow, title);

    const metrics = document.createElement('div');
    metrics.className = 'evidence-quality-preview__metrics';
    [
      ['Clear responses', summary.confirmedCount || 0],
      ['Need confirmation', summary.followUpCount || 0],
      ['Still unanswered', summary.missingRequiredCount || 0]
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      const number = document.createElement('b');
      number.textContent = String(value);
      const copy = document.createElement('span');
      copy.textContent = label;
      item.append(number, copy);
      metrics.appendChild(item);
    });

    const message = document.createElement('p');
    message.textContent = summary.message || 'Your responses are ready to organize the licensed review.';
    preview.append(heading, metrics, message);
  }

  let zeroRepeatStarted = false;

  function startZeroRepeatCompletion() {
    if (zeroRepeatStarted || config.slug !== 'home') return false;
    const state = conversionHandoff?.refresh?.() || conversionHandoff?.get?.() || null;
    if (!state?.flags?.zeroRepeatEligible) return false;

    const form = $('captureForm');
    const panel = $('zeroRepeatCapture');
    if (!form) return false;
    if (!form.checkValidity()) {
      form.hidden = false;
      if (panel) panel.hidden = true;
      return false;
    }

    zeroRepeatStarted = true;
    form.dataset.zeroRepeatAuto = 'true';
    form.hidden = true;
    if (panel) panel.hidden = false;
    if ($('captureHeading')) $('captureHeading').textContent = 'Opening your Protection Snapshot…';
    if ($('captureCopy')) $('captureCopy').textContent = 'Your information is already connected. CoverageFit is saving the completed review before opening your Snapshot.';
    if ($('zeroRepeatTitle')) $('zeroRepeatTitle').textContent = 'No repeated form needed.';
    if ($('zeroRepeatDetail')) $('zeroRepeatDetail').textContent = 'We’ll use the contact information and permission from your 408FARMERS request.';

    window.CoverageFitAnalytics?.track('zero_repeat_completion_started', {
      assessment: 'home',
      source: state.source || '408farmers',
      trustedContract: Boolean(state.flags.trustedContract)
    });

    window.setTimeout(() => {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, 0);
    return true;
  }

  function finish() {
    const report = payload();
    if (advisoryOrchestration) document.body.dataset.assessmentChapter = 'worth-reviewing';
    updateJourney('snapshot');
    quiz.style.display = 'none';
    result.style.display = 'block';
    $('resultTitle').textContent = `Your ${subject} Snapshot is ready.`;
    $('resultCopy').textContent = report.priorities.length
      ? (config.resultCopy || 'Your responses revealed positive starting points and a few topics worth confirming with a licensed insurance professional.')
      : (config.strongResultCopy || 'Your responses suggest a strong starting point. A brief review can confirm that everything still fits today.');
    $('strongestPreview').textContent = report.strongest;
    $('priorityPreview').textContent = report.topPriority;
    renderEvidencePreview(report.assessmentCompletion);
    $('captureScore').value = report.score;
    $('captureRisks').value = report.priorities.map(item => item.tag).join(', ') || 'No major concerns flagged';
    $('capturePriority').value = report.topPriority;
    $('capturePayload').value = JSON.stringify(report);
    save(report);
    continuity?.markCompleted?.({
      answerCount: Object.keys(selections).length,
      questionCount: activeQuestions().length,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000)
    });
    window.CoverageFitAnalytics?.track('assessment_completed', {
      assessment: config.slug,
      industry: report.industryModule,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      score: report.score,
      scoreMethodology: report.scoreMethodology?.id,
      identifiedGapCount: report.scoreDiagnostics?.identifiedGapCount,
      uncertaintyCount: report.scoreDiagnostics?.uncertaintyCount,
      confirmedEvidenceCount: report.assessmentCompletion?.confirmedCount,
      needsVerificationCount: report.assessmentCompletion?.needsVerificationCount,
      completionState: report.assessmentCompletion?.state
    });
    const zeroRepeat = startZeroRepeatCompletion();
    window.CoverageFitAnalytics?.track('assessment_completion_handoff', {
      assessment: config.slug,
      zeroRepeat
    });
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  function showEarlyInsight(restoring = false) {
    const questions = activeQuestions();
    const first = selections[questions[0]?.key];
    const second = selections[questions[1]?.key];
    const uncertain = [first, second].filter((answer, index) => answer && answerState(answer, questions[index]).impact > 0).length;
    const insight = config.earlyInsight || {};
    earlyInsightTitle.textContent = uncertain
      ? (insight.concernTitle || 'You already have two useful items for your review.')
      : (insight.strongTitle || 'You have a useful starting foundation.');
    earlyInsightCopy.textContent = uncertain
      ? (insight.concernCopy || 'CoverageFit will keep these items organized so you know what to confirm later.')
      : (insight.strongCopy || 'CoverageFit will help you confirm what is strong and what is still worth asking about.');
    earlyInsight.hidden = false;
    earlyInsightShown = true;
    saveDraft(restoring ? 'early_insight_restored' : 'early_insight_shown', { view: 'quiz' });
    if (!restoring) {
      window.CoverageFitAnalytics?.track('assessment_early_insight_shown', {
        assessment: config.slug,
        concernCount: uncertain,
        step: current + 1,
        blocking: false
      });
    }
  }

  next.onclick = () => {
    const questions = activeQuestions();
    if (current === questions.length - 1) {
      const firstMissing = questions.findIndex(question => question.required !== false && !selections[question.key]);
      if (firstMissing >= 0) {
        current = firstMissing;
        render();
        showIncompleteFeedback(questions[firstMissing]);
        qTitle?.focus({ preventScroll: true });
        window.scrollTo({
          top: document.querySelector('.tool-card')?.offsetTop || 0,
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
        return;
      }
      bar.style.width = '100%';
      finish();
    } else {
      current += 1;
      render();
      saveDraft('question_advanced');
      qTitle?.focus({ preventScroll: true });
      qTitle?.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  };

  back.onclick = () => {
    if (current) {
      current -= 1;
      render();
      saveDraft('question_revisited');
      qTitle?.focus({ preventScroll: true });
    }
  };

  restart.onclick = () => {
    continuity?.restart?.('retake_review');
    current = 0;
    selections = {};
    earlyInsightShown = false;
    earlyInsight.hidden = true;
    result.style.display = 'none';
    advisoryOpening?.reset?.({ preserveInherited: true });
    advisoryRelationship?.reset?.({ preserveInherited: true });
    advisoryLifestyle?.reset?.();
    advisoryOutcome?.reset?.();
    advisoryReaction?.hide?.();
    const advisoryStarted = advisoryOpening?.start?.({ force: true }) === true;
    quiz.style.display = advisoryStarted ? 'none' : 'block';
    render();
  };

  $('captureForm').addEventListener('focusin', () => updateJourney('contact'));
  $('captureForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    const autoSubmission = this.dataset.zeroRepeatAuto === 'true';
    if (!this.checkValidity()) {
      if (autoSubmission) {
        this.hidden = false;
        const panel = $('zeroRepeatCapture');
        if (panel) panel.hidden = true;
        zeroRepeatStarted = false;
      }
      this.reportValidity();
      return;
    }

    const questions = activeQuestions();
    const firstMissing = questions.findIndex(question => question.required !== false && !selections[question.key]);
    if (firstMissing >= 0) {
      current = firstMissing;
      result.style.display = 'none';
      quiz.style.display = 'block';
      render();
      showIncompleteFeedback(questions[firstMissing]);
      window.scrollTo({ top: document.querySelector('.tool-card')?.offsetTop || 0, behavior: 'smooth' });
      return;
    }

    updateJourney('contact');
    const generation = autoSubmission
      ? window.CoverageFitReportGeneration?.start?.({ minDuration: 2400 }) || null
      : null;
    const report = payload();
    const detail = $('propertyField').value.trim() || 'Not provided';
    const enteredName = $('firstName').value.trim() || config.defaultName;
    const prospect = report.prospectProfile || {};
    const personalization = report.personalizationContext || {};
    const identity = personalization.identity || {};
    const property = personalization.property || {};
    const journey = personalization.journey || {};
    const referral = window.CoverageFitReferralAttribution?.getContext?.() || { active: false, referralId: '', referralSource: '', referralChannel: '' };
    const nameParts = enteredName.split(/\s+/).filter(Boolean);
    const importedName = identity.displayName || prospect.fullName || '';
    const sameImportedName = Boolean(importedName && enteredName.toLowerCase() === String(importedName).toLowerCase());

    report.consumer = {
      firstName: sameImportedName ? (identity.givenName || prospect.firstName || nameParts[0] || '') : (nameParts[0] || ''),
      lastName: sameImportedName ? (identity.familyName || prospect.lastName || nameParts.slice(1).join(' ')) : nameParts.slice(1).join(' '),
      name: enteredName,
      email: $('email').value.trim(),
      phone: $('phone').value.trim(),
      detail,
      propertyAddress: property.displayAddress || prospect.propertyAddress || prospect.address?.formattedAddress || detail,
      reviewContext: report.reviewContext || journey.reviewReason || prospect.reviewContext || '',
      contactPermission: {
        confirmed: Boolean(
          window.CoverageFitConversionHandoff?.get?.()?.flags?.permissionConfirmed
            || $('contactConsentConfirm')?.checked
        ),
        status: personalization.contactPermission?.status || ($('contactConsentConfirm')?.checked ? 'confirmed-on-coveragefit' : 'unverified'),
        basis: personalization.contactPermission?.basis || ($('contactConsentConfirm')?.checked ? 'completion_confirmation' : ''),
        contract: personalization.contactPermission?.contract || journey.handoffContract || ''
      }
    };
    report.integration = {
      ...(report.integration || {}),
      source: report.integration?.source || report.attribution?.source || '',
      campaign: report.integration?.campaign || report.attribution?.campaign || '',
      campaignId: report.integration?.campaignId || journey.campaignId || report.attribution?.lastTouch?.campaign_id || report.attribution?.firstTouch?.campaign_id || '',
      campaignVariant: report.integration?.campaignVariant || journey.campaignVariant || report.attribution?.lastTouch?.campaign_variant || report.attribution?.firstTouch?.campaign_variant || '',
      campaignZip: report.integration?.campaignZip || journey.campaignZip || report.attribution?.lastTouch?.campaign_zip || report.attribution?.firstTouch?.campaign_zip || '',
      referralId: report.integration?.referralId || referral.referralId || '',
      referralSource: report.integration?.referralSource || referral.referralSource || journey.referralSource || '',
      partnerId: report.integration?.partnerId || journey.partnerId || prospect.integration?.partnerId || '',
      partnerName: report.integration?.partnerName || journey.partnerName || prospect.integration?.partnerName || '',
      entryMethod: report.integration?.entryMethod || journey.entryMethod || prospect.integration?.entryMethod || '',
      operationsRef: report.integration?.operationsRef || journey.operationsRef || prospect.integration?.operationsRef || '',
      referralChannel: report.integration?.referralChannel || referral.referralChannel || '',
      entry: report.integration?.entry || report.attribution?.entry || '',
      sessionId: report.integration?.sessionId || report.attribution?.sessionId || '',
      handoffContract: report.integration?.handoffContract || journey.handoffContract || prospect.integration?.handoffContract || '',
      senderBuild: report.integration?.senderBuild || journey.senderBuild || prospect.integration?.senderBuild || '',
      leadCaptureStatus: report.integration?.leadCaptureStatus || journey.leadCaptureStatus || prospect.integration?.leadCaptureStatus || '',
      zeroRepeat: autoSubmission,
      displacement: Boolean(displacementContext),
      displacementCarrier: displacementContext?.carrier || prospect.integration?.displacementCarrier || '',
      displacementUrgency: displacementContext?.operationalUrgency || prospect.integration?.displacementUrgency || '',
      prefilled: Boolean((prospect && Object.keys(prospect).length) || personalization.flags?.hasProfile)
    };

    if(displacementContext) report.displacementContext = JSON.parse(JSON.stringify(displacementContext));
    const businessName = $('businessName');
    const businessType = $('businessType');
    if (businessName) report.consumer.businessName = businessName.value.trim();
    if (businessType) report.consumer.businessType = businessType.value;
    if (report.profile) {
      report.consumer.industry = report.profile.industry;
      report.consumer.industryLabel = report.profile.industryLabel;
      report.consumer.businessSize = report.profile.businessSize;
      report.consumer.locationType = report.profile.locationType;
      report.consumer.employees = report.profile.employees;
      report.consumer.revenueRange = report.profile.revenueRange;
    }
    if (config.detailKey) report.consumer[config.detailKey] = detail;

    let prospectReportAccess = { ok: false };
    if (config.slug === 'home' && window.CoverageFitProspectReports) {
      prospectReportAccess = await window.CoverageFitProspectReports.create(report, { honeypot: $('website')?.value || '' });
      if (prospectReportAccess?.ok) {
        report.prospectReport = {
          id: prospectReportAccess.reportId,
          schemaVersion: window.CoverageFitProspectReports.SCHEMA_VERSION || '1.0',
          createdAt: prospectReportAccess.createdAt,
          expiresAt: prospectReportAccess.expiresAt,
          durable: Boolean(prospectReportAccess.durable),
          localOnly: Boolean(prospectReportAccess.localOnly)
        };
        window.CoverageFitProspectReports.cache?.(prospectReportAccess.reportId, report, report.prospectReport);
      }
    }

    let consultationRecord = null;
    if (config.slug === 'home' && window.CoverageFitConsultationRecords) {
      const records = window.CoverageFitConsultationRecords;
      const recordId = records.createId?.(report) || '';
      if (recordId) {
        report.consultationRecord = {
          id: recordId,
          schemaVersion: records.SCHEMA_VERSION || '1.0',
          status: 'ready',
          createdAt: report.createdAt
        };
        consultationRecord = records.upsert?.(report, { id: recordId }) || null;
        if (consultationRecord) {
          report.consultationRecord.createdAt = consultationRecord.createdAt;
          report.consultationRecord.updatedAt = consultationRecord.updatedAt;
        }
      }
    }

    const consultationField = $('consultationRecordId');
    if (consultationField) consultationField.value = consultationRecord?.id || report.consultationRecord?.id || '';
    const formPayload = JSON.parse(JSON.stringify(report));
    delete formPayload.prospectReport;
    $('capturePayload').value = JSON.stringify(formPayload);
    window.CoverageFitAttribution?.enrichForm?.(this);
    save(report);

    const remoteSubmission = config.slug === 'home' && window.CoverageFitRemoteConsultations
      ? window.CoverageFitRemoteConsultations.submit(report, { honeypot: $('website')?.value || '' })
      : Promise.resolve({ ok: false, skipped: true });
    await (window.COVERAGEFIT_PRODUCER_READY || Promise.resolve());
    const producer = window.COVERAGEFIT_PRODUCER || {};
    if (producer.formEndpoint) this.action = producer.formEndpoint;
    let formSubmissionSucceeded = false;
    try {
      const formResponse = await fetch(this.action, { method: 'POST', body: new FormData(this), headers: { Accept: 'application/json' } });
      formSubmissionSucceeded = Boolean(formResponse?.ok);
      if (!formSubmissionSucceeded) console.warn(`CoverageFit form delivery returned status ${formResponse?.status || 'unknown'}.`);
    } catch (error) {
      console.warn(error);
    }
    let remoteSubmissionResult = { ok: false };
    try {
      remoteSubmissionResult = await remoteSubmission;
    } catch (error) {
      console.warn(error);
    }
    if (formSubmissionSucceeded || remoteSubmissionResult?.ok) {
      const completedReportId = report.prospectReport?.id || prospectReportAccess?.reportId || '';
      window.CoverageFitPostSubmissionShare?.markSuccessfulSubmission?.({
        assessment: config.slug,
        reportId: completedReportId,
        submittedAt: new Date().toISOString(),
        formSubmissionSucceeded,
        remoteSubmissionSucceeded: remoteSubmissionResult?.ok === true
      });
      if (report.prospectReport?.durable && completedReportId) {
        window.CoverageFitReferralAttribution?.markComplete?.(completedReportId).catch?.(() => {});
      }
    }
    if (generation) await generation.complete();
    else await new Promise(resolve => setTimeout(resolve, 1750));
    const reportUrl = window.CoverageFitProspectReports?.buildUrl?.(report.prospectReport?.id, config.reportPath) || config.reportPath;
    window.CoverageFitAnalytics?.track('snapshot_opened_after_completion', {
      assessment: config.slug,
      zeroRepeat: autoSubmission,
      durableReport: Boolean(report.prospectReport?.durable),
      localFallback: Boolean(report.prospectReport?.localOnly)
    });
    location.href = reportUrl;
  });

  window.addEventListener('coveragefit:advisory-opening-completed', event => {
    current = 0;
    pruneHidden();
    render();
    saveDraft('advisory_opening_completed', {
      advisoryOpeningCompleted: true,
      advisoryReasonKey: event.detail?.state?.reason?.key || '',
      advisoryPriorityKey: event.detail?.state?.priority?.key || ''
    });
    window.CoverageFitAnalytics?.track('assessment_advisory_context_applied', {
      assessment: config.slug,
      reviewReason: config.reviewReasonKeyFor?.(activeReviewReason()) || 'general',
      priority: event.detail?.state?.priority?.key || 'unsure',
      scoreFormulaChanged: false
    });
  });

  window.addEventListener('coveragefit:advisory-relationship-completed', event => {
    current = 0;
    pruneHidden();
    render();
    saveDraft('advisory_relationship_completed', {
      advisoryRelationshipCompleted: true,
      advisoryCarrierKnown: Boolean(event.detail?.state?.carrier?.label),
      advisoryTenureKey: event.detail?.state?.tenure?.key || '',
      advisoryWouldChangeKey: event.detail?.state?.wouldChange?.[0]?.key || ''
    });
    window.CoverageFitAnalytics?.track('assessment_current_relationship_applied', {
      assessment: config.slug,
      carrierKnown: Boolean(event.detail?.state?.carrier?.label),
      tenureKey: event.detail?.state?.tenure?.key || '',
      likesCount: Number(event.detail?.state?.likes?.length || 0),
      mustKeepCount: Number(event.detail?.state?.mustKeep?.length || 0),
      scoreFormulaChanged: false
    });
  });

  window.addEventListener('coveragefit:advisory-lifestyle-completed', event => {
    current = 0;
    pruneHidden();
    render();
    saveDraft('advisory_lifestyle_completed', {
      advisoryLifestyleCompleted: true,
      advisoryPrimaryHomeKey: event.detail?.state?.primaryHome?.key || '',
      advisoryStayIntentKey: event.detail?.state?.stayIntent?.key || '',
      advisoryDisplacementKey: event.detail?.state?.displacement?.key || ''
    });
    window.CoverageFitAnalytics?.track('assessment_lifestyle_context_applied', {
      assessment: config.slug,
      primaryHome: event.detail?.state?.primaryHome?.key || '',
      stayIntent: event.detail?.state?.stayIntent?.key || '',
      householdRelianceCount: Number(event.detail?.state?.householdReliance?.length || 0),
      displacement: event.detail?.state?.displacement?.key || '',
      scoreFormulaChanged: false
    });
  });

  window.addEventListener('coveragefit:advisory-outcome-completed', event => {
    current = 0;
    pruneHidden();
    render();
    saveDraft('advisory_outcome_completed', {
      advisoryOutcomeCompleted: true,
      advisoryOutcomeConcernCount: Number(event.detail?.state?.concerns?.length || 0),
      advisoryPrimaryOutcomeKey: event.detail?.state?.concerns?.[0]?.key || ''
    });
    window.CoverageFitAnalytics?.track('assessment_outcome_context_applied', {
      assessment: config.slug,
      concernCount: Number(event.detail?.state?.concerns?.length || 0),
      firstConcern: event.detail?.state?.concerns?.[0]?.key || '',
      secondConcern: event.detail?.state?.concerns?.[1]?.key || '',
      scoreFormulaChanged: false
    });
  });

  window.addEventListener('coveragefit:property-profile-confirmed', event => {
    profile = event.detail || null;
    pruneHidden();
    if (current >= activeQuestions().length) current = Math.max(0, activeQuestions().length - 1);
    render();
    saveDraft('property_profile_confirmed', {
      propertyConfirmed: true,
      propertyProfileId: profile?.profileId || ''
    });
    window.CoverageFitAnalytics?.track('assessment_property_personalized', {
      assessment: config.slug,
      activeQuestionCount: activeQuestions().length,
      propertyAwareQuestionCount: activeQuestions().filter(question => question.propertyAware).length
    });
  });

  window.addEventListener('beforeunload', () => {
    if (result.style.display !== 'block') saveDraft('page_unloaded');
  });

  window.CoverageFitAnalytics?.track('assessment_started', {
    assessment: config.slug,
    industry: profile?.industry || 'general',
    scoreMethodology: config.scoreMethodology?.id || scoring.METHODOLOGY_ID,
    restoredDraft: Boolean(restoredDraft)
  });
  render();
  if (restoredView === 'earlyInsight' && earlyInsightShown && current !== 1) {
    current = Math.min(1, Math.max(0, activeQuestions().length - 1));
    render();
  }
})();
