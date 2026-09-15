(function () {
  'use strict';

  const readyPromise = (async () => {
    await (window.COVERAGEFIT_PRODUCER_READY || Promise.resolve());

    const $ = id => document.getElementById(id);
    const cfg = window.COVERAGEFIT_REPORT_CONFIG || {};
    const storageKey = cfg.storageKey || 'coveragefit_home_report';
    const accessApi = window.CoverageFitProspectReports;
    const stateRoot = $('prospectReportState');
    const stateEyebrow = $('prospectReportStateEyebrow');
    const stateTitle = $('prospectReportStateTitle');
    const stateCopy = $('prospectReportStateCopy');
    const retry = $('prospectReportRetry');
    const retake = $('prospectReportRetake');
    const reportRoot = $('prospectReport');
    const accessStatus = $('prospectReportAccessStatus');

    const text = value => String(value ?? '').trim();
    const escapeHtml = value => text(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    const setText = (selector, value) => document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
    const formatDate = value => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    };

    function readLegacyReport() {
      try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) { return {}; }
    }

    function showState(kind, options = {}) {
      if (!stateRoot) return;
      stateRoot.hidden = false;
      stateRoot.dataset.state = kind;
      stateRoot.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
      if (stateEyebrow) stateEyebrow.textContent = options.eyebrow || 'Private Protection Snapshot';
      if (stateTitle) stateTitle.textContent = options.title || 'This private Snapshot is unavailable.';
      if (stateCopy) stateCopy.textContent = options.copy || 'The link may be incomplete or no longer available.';
      if (retry) retry.hidden = !options.retry;
      if (retake) retake.hidden = !options.retake;
      if (reportRoot) reportRoot.hidden = true;
      if (accessStatus) accessStatus.textContent = options.status || 'Private access unavailable';
      document.title = `${options.title || 'Protection Snapshot unavailable'} | CoverageFit`;
    }

    function showReport(access) {
      if (stateRoot) stateRoot.hidden = true;
      if (reportRoot) reportRoot.hidden = false;
      const expiry = formatDate(access?.expiresAt);
      if (accessStatus) {
        if (access?.workspacePreview) accessStatus.textContent = 'Agent Workspace preview';
        else if (access?.localOnly) accessStatus.textContent = expiry ? `Private device-only copy · available until ${expiry}` : 'Private device-only copy';
        else if (access?.cached) accessStatus.textContent = expiry ? `Private cached copy · available until ${expiry}` : 'Private cached copy';
        else accessStatus.textContent = expiry ? `Private link · available until ${expiry}` : 'Private link';
      }
    }

    if (retry) retry.addEventListener('click', () => location.reload());

    const reportId = accessApi?.readIdFromLocation?.() || '';
    let allowLegacyPreview = false;
    let allowWorkspacePreview = false;
    try {
      const hashParams = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
      allowLegacyPreview = hashParams.get('local_preview') === '1';
      allowWorkspacePreview = hashParams.get('workspace_preview') === '1';
    } catch (_) {}

    let accessResult = null;
    if (reportId && accessApi?.retrieve) {
      accessResult = await accessApi.retrieve(reportId);
    }

    if ((!accessResult?.ok || !accessResult?.report) && (allowLegacyPreview || allowWorkspacePreview)) {
      const workspaceReport = readLegacyReport();
      if (workspaceReport && Object.keys(workspaceReport).length) {
        accessResult = {
          ok: true,
          report: workspaceReport,
          reportId,
          durable: false,
          localOnly: true,
          cached: true,
          legacy: allowLegacyPreview,
          workspacePreview: allowWorkspacePreview,
          recoveryCode: accessResult?.code || '',
          expiresAt: ''
        };
      }
    }

    if (!accessResult) accessResult = { ok: false, code: 'report_unavailable' };

    if (!accessResult?.ok || !accessResult.report) {
      if (accessResult?.code === 'report_expired') {
        showState('expired', {
          title: 'This private Snapshot has expired.',
          copy: 'For privacy, private Protection Snapshot links are available for 30 days. Start a new review to create an updated Snapshot.',
          retake: true,
          status: 'Private link expired'
        });
      } else if (['storage_unavailable', 'storage_read_failed', 'fetch_unavailable', 'request_failed'].includes(accessResult?.code)) {
        showState('temporary', {
          title: 'We could not open your Snapshot right now.',
          copy: 'The private report service is temporarily unavailable. Try again, or start a new review if the issue continues.',
          retry: true,
          retake: true,
          status: 'Private report temporarily unavailable'
        });
      } else {
        showState('unavailable', {
          title: 'This private Snapshot is unavailable.',
          copy: 'The private link may be incomplete, deleted, or no longer available. Start a new review to create a new Snapshot.',
          retake: true,
          status: 'Private link unavailable'
        });
      }
      return { ok: false, ...accessResult };
    }

    const report = accessResult.report;
    try { localStorage.setItem(storageKey, JSON.stringify(report)); } catch (_) {}
    showReport(accessResult);

    const consumer = report.consumer || {};
    const name = text(consumer.name || [consumer.firstName, consumer.lastName].filter(Boolean).join(' ') || cfg.defaultName || 'Homeowner');
    const property = text(consumer.propertyAddress || consumer.property || consumer.detail || report.propertyAddress || report.property?.address || report.propertyProfile?.address);
    const rawReason = text(report.reviewContext || report.reviewReason || consumer.reviewContext || consumer.reviewReason);
    const createdAt = report.createdAt || Date.now();
    const score = Number(report.score || 0);
    const priorities = Array.isArray(report.priorities) ? report.priorities : [];
    const answers = Array.isArray(report.answers) ? report.answers : [];
    const strengths = Array.isArray(report.strengths) && report.strengths.length
      ? report.strengths
      : answers.filter(answer => (answer.findingType === 'strength' || Number(answer.scoreImpact || 0) === 0) && Number(answer.weight || 0) > 0).sort((a,b)=>Number(b.weight||0)-Number(a.weight||0)).slice(0, 3).map(answer => answer.insight || answer.label);

    function displayReason(value) {
      const raw = text(value);
      if (!raw) return 'Protection Review';
      if (/non[- ]?renew|cancel/i.test(raw)) return 'Non-Renewal Review';
      if (/premium|rate|price.*increase/i.test(raw)) return 'Premium Increase Review';
      if (/renew/i.test(raw)) return 'Annual Protection Review';
      if (/homebuyer|home purchase|buying|purchase|new home/i.test(raw)) return 'Home Purchase Review';
      return raw;
    }

    setText('[data-prospect-name]', name);
    setText('[data-prospect-property]', property || 'Property details to be confirmed');
    setText('[data-prospect-reason]', displayReason(rawReason));
    setText('[data-prospect-date]', formatDate(createdAt));
    document.querySelector('.prospect-report-meta__property')?.classList.toggle('is-missing', !property);

    const strengthRoot = $('strengths');
    const strengthValues = (strengths.length ? strengths : ['You completed a structured review instead of waiting for a problem.'])
      .slice(0, 3)
      .map(item => typeof item === 'string' ? item : (item.insight || item.label || item.title || 'Positive observation'));
    strengthValues.forEach(value => {
      const card = document.createElement('article');
      card.className = 'strength-item';
      const marker = document.createElement('span'); marker.className = 'strength-item__mark'; marker.textContent = '✓';
      const copy = document.createElement('p'); copy.textContent = text(value);
      card.append(marker, copy);
      strengthRoot?.appendChild(card);
    });

    const rawPriorityList = priorities.length
      ? priorities
      : answers.filter(answer => Number(answer.scoreImpact || 0) > 0 || Number(answer.points || 0) < 0).sort((a,b)=>Number(b.priorityScore||b.weightedPenalty||Math.abs(Number(b.points||0)))-Number(a.priorityScore||a.weightedPenalty||Math.abs(Number(a.points||0)))).slice(0, 3);
    const recommendations = window.CoverageFitRecommendationEngine
      ? window.CoverageFitRecommendationEngine.generate('home', { ...report, priorities: rawPriorityList, answers })
      : rawPriorityList;
    const topRecommendations=recommendations.slice(0,3);
    const priorityRoot = $('priorities');

    topRecommendations.forEach((recommendation, index) => {
      const topic = text(recommendation.name || recommendation.title || recommendation.tag || recommendation.category || 'Protection topic');
      const enriched = window.CoverageFitTriggerLibrary?.enrich(recommendation, topic) || recommendation;
      const explanation = text(recommendation.clientExplanation || recommendation.explanation || recommendation.insight || 'Your answer made this topic worth confirming.');
      const why = text(enriched.whyMatters || recommendation.whyMatters || 'The impact depends on your policy wording, limits, deductibles, and household circumstances.');
      const question = text(recommendation.conversationStarter || enriched.discussionQuestion || recommendation.question || 'Can we confirm how this protection works in my current policy?');
      const supporting = (recommendation.supportingAnswers || recommendation.evidence || []).map(text).filter(Boolean).slice(0, 1);
      const evidenceQuality = text(recommendation.evidenceQuality || 'confirmed');
      const evidenceLabel = text(recommendation.evidenceLabel || (evidenceQuality === 'confirmed' ? 'Clear response captured' : 'Needs policy verification'));

      const card = document.createElement('article');
      card.className = 'prospect-topic-card';
      card.innerHTML = `
        <div class="prospect-topic-card__number" aria-hidden="true">${index + 1}</div>
        <div class="prospect-topic-card__body">
          <div class="prospect-topic-card__meta"><span>${escapeHtml(recommendation.impactLabel || recommendation.priority || 'Review topic')}</span><em>Based on your responses</em></div>
          <h3></h3>
          <div class="prospect-topic-card__finding"><span>What your answers indicated</span><p></p></div>
          <div class="prospect-topic-card__details">
            <div><span>Why it matters</span><p></p></div>
            <div><span>Question to discuss</span><p></p></div>
          </div>
          ${supporting.length ? '<p class="prospect-topic-card__evidence"><strong>Response considered:</strong> <span></span></p>' : ''}
        </div>`;
      card.querySelector('h3').textContent = topic;
      const evidenceMeta = card.querySelector('.prospect-topic-card__meta em');
      evidenceMeta.textContent = evidenceLabel;
      evidenceMeta.dataset.evidenceQuality = evidenceQuality;
      card.querySelector('.prospect-topic-card__finding p').textContent = explanation;
      card.querySelector('.prospect-topic-card__details div:first-child p').textContent = why;
      card.querySelector('.prospect-topic-card__details div:last-child p').textContent = question;
      if (supporting.length) card.querySelector('.prospect-topic-card__evidence span').textContent = supporting[0];
      priorityRoot?.appendChild(card);
    });

    if (!topRecommendations.length && priorityRoot) {
      const empty = document.createElement('div');
      empty.className = 'report-empty';
      empty.textContent = 'No major answer-based concern was flagged. Use your review to confirm the positive foundation reflected in your answers.';
      priorityRoot.appendChild(empty);
    }

    const actions=[
      'Bring your current declarations page or policy summary so limits, deductibles, and endorsements can be confirmed.',
      topRecommendations.length
        ? 'Use the three topics in this Snapshot to focus the conversation instead of reviewing every policy detail at once.'
        : 'Confirm that your current limits, deductibles, endorsements, and household details are still accurate.',
      'Decide whether your current protection should stay the same or whether a formal quote comparison is worth preparing.'
    ];
    const actionRoot = $('actions');
    actions.forEach((action, index) => {
      const row = document.createElement('div');
      const number = document.createElement('b'); number.textContent = String(index + 1);
      const copy = document.createElement('span'); copy.textContent = action;
      row.append(number, copy);
      actionRoot?.appendChild(row);
    });

    const print = $('printReport');
    if (print) print.addEventListener('click', () => window.print());
    window.CoverageFitAnalytics?.track('report_viewed', {
      assessment: report.assessment || cfg.slug,
      score,
      privateAccess: accessResult.durable ? 'server' : 'local'
    });

    return { ok: true, report, access: accessResult };
  })();

  window.COVERAGEFIT_PROSPECT_REPORT_READY = readyPromise;
})();
