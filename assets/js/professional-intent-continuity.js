(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitProfessionalIntent = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) api.init();
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = '408-CRO-1.6.2.1';
  const text = (value, max = 220) => String(value || '').trim().replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, max);
  const normalized = value => text(value).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

  function contextFor(input) {
    const source = input || {};
    const personalization = source.personalizationContext || source.context || root.CoverageFitPersonalization?.get?.() || {};
    const journey = personalization.journey || source.journey || {};
    const prospect = source.prospectProfile || source.profile || root.CoverageFitPrefill?.get?.() || {};
    const integration = source.integration || prospect.integration || {};
    const reviewReason = text(source.reviewContext || journey.reviewReason || prospect.reviewContext, 160);
    const occupation = text(journey.occupationSegment || prospect.occupationSegment, 160);
    const acquisition = normalized([
      integration.entry || journey.entryPoint,
      integration.launchSurface || journey.launchSurface,
      integration.campaign || journey.campaign
    ].filter(Boolean).join(' '));
    const professionalReview = /professional(?: discount)? eligibility|professional home/.test(normalized(reviewReason));
    const professionalEntry = /healthcare|teacher|education|tech|engineer|professional|occupation/.test(acquisition);
    return Object.freeze({
      active: Boolean(professionalReview || (occupation && professionalEntry)),
      occupation,
      reviewReason,
      entry: text(integration.entry || journey.entryPoint, 120),
      campaign: text(integration.campaign || journey.campaign, 160)
    });
  }

  function customerCopy(context) {
    const role = context?.occupation ? `Professional role connected: ${context.occupation}.` : 'Your professional role is connected.';
    return Object.freeze({
      bannerLabel: 'Professional Discount Eligibility Review',
      bannerTitle: 'See which professional discounts may apply.',
      bannerCopy: `${role} Build the coverage picture Dylan needs to review your protection and check which Farmers professional discounts may be available during quoting and underwriting.`,
      assessmentTitle: "Let's build your Protection Snapshot—with your professional role connected.",
      progressLabel: 'Professional role connected',
      checkpointTitle: 'You’re building a clearer picture of your protection—and possible professional savings.',
      checkpointCopy: 'Keep going to see what looks strong, what may deserve a closer look, and which professional discounts Dylan should verify.',
      completionTitle: 'Your Protection Snapshot is ready, with your professional role attached.',
      completionCopy: 'Your answers organized your strongest areas, first discussion priorities, and the context Dylan needs to check which Farmers professional discounts may be available.',
      captureHeading: 'Open your completed Protection Snapshot.',
      captureCopy: 'Your contact information and professional role stay connected so Dylan can prepare for a focused coverage and discount review.',
      connectedHeading: 'Opening your Protection Snapshot…',
      connectedTitle: 'Your professional role is connected.',
      connectedCopy: 'Dylan will review your coverage and verify any available Farmers professional discounts during quoting and underwriting.',
      reportTitle: 'Your Protection Snapshot is ready—with your professional role connected.',
      reportIntro: 'Your answers identified protection strengths and discussion priorities while preserving the professional context Dylan needs to check possible Farmers discounts.',
      reportReason: 'Professional Coverage and Discount Review',
      reportNext: 'Review your Snapshot and any professional discounts that may be available with Dylan',
      reportCta: 'Turn your Snapshot into a focused coverage and discount conversation.'
    });
  }

  function createBanner(documentRef, copy, compact) {
    const banner = documentRef.createElement('aside');
    banner.className = `professional-intent-banner${compact ? ' professional-intent-banner--compact' : ''}`;
    banner.dataset.professionalIntent = 'true';
    banner.setAttribute('role', 'note');
    const label = documentRef.createElement('span');
    label.textContent = copy.bannerLabel;
    const title = documentRef.createElement('strong');
    title.textContent = copy.bannerTitle;
    const body = documentRef.createElement('p');
    body.textContent = copy.bannerCopy;
    banner.append(label, title, body);
    return banner;
  }

  function applyAssessment(context, options) {
    const documentRef = options?.document || root.document;
    if (!documentRef || !context.active) return { active: false };
    const copy = customerCopy(context);
    documentRef.documentElement.dataset.professionalIntent = 'true';
    const intro = documentRef.querySelector('.assessment-intro');
    if (intro && !intro.querySelector('[data-professional-intent]')) intro.append(createBanner(documentRef, copy, false));
    const title = documentRef.querySelector('[data-trigger-assessment-title]');
    if (title) title.textContent = copy.assessmentTitle;
    const progress = documentRef.querySelector('.progress-meta');
    if (progress && !progress.querySelector('.professional-intent-progress')) {
      const chip = documentRef.createElement('span');
      chip.className = 'professional-intent-progress';
      chip.textContent = copy.progressLabel;
      progress.append(chip);
    }

    const setText = (node, value) => {
      if (node && node.textContent !== value) node.textContent = value;
    };
    const applyDynamic = () => {
      const early = documentRef.getElementById('earlyInsight');
      if (early && !early.hidden) {
        const earlyTitle = documentRef.getElementById('earlyInsightTitle');
        const earlyCopy = documentRef.getElementById('earlyInsightCopy');
        setText(earlyTitle, copy.checkpointTitle);
        setText(earlyCopy, copy.checkpointCopy);
      }
      const result = documentRef.getElementById('result');
      if (result && (result.style.display === 'block' || !result.hidden)) {
        const resultTitle = documentRef.getElementById('resultTitle');
        const resultCopy = documentRef.getElementById('resultCopy');
        const captureHeading = documentRef.getElementById('captureHeading');
        const captureCopy = documentRef.getElementById('captureCopy');
        setText(resultTitle, copy.completionTitle);
        setText(resultCopy, copy.completionCopy);
        setText(captureHeading, copy.captureHeading);
        setText(captureCopy, copy.captureCopy);
      }
      const connected = documentRef.getElementById('zeroRepeatCapture');
      if (connected && !connected.hidden) {
        const captureHeading = documentRef.getElementById('captureHeading');
        const zeroRepeatTitle = documentRef.getElementById('zeroRepeatTitle');
        const zeroRepeatDetail = documentRef.getElementById('zeroRepeatDetail');
        setText(captureHeading, copy.connectedHeading);
        setText(zeroRepeatTitle, copy.connectedTitle);
        setText(zeroRepeatDetail, copy.connectedCopy);
      }
    };
    applyDynamic();
    const Observer = options?.MutationObserver || root.MutationObserver;
    if (typeof Observer === 'function') {
      const observer = new Observer(applyDynamic);
      ['earlyInsight', 'result', 'zeroRepeatCapture'].map(id => documentRef.getElementById(id)).filter(Boolean)
        .forEach(node => observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'style', 'class'], childList: true, subtree: true }));
    }
    return { active: true, context, copy };
  }

  async function applyReport(options) {
    const documentRef = options?.document || root.document;
    const ready = options?.ready || root.COVERAGEFIT_PROSPECT_REPORT_READY;
    if (!documentRef || !ready) return { active: false };
    const result = await ready;
    const context = contextFor(result?.report || {});
    if (!result?.ok || !context.active) return { active: false, context };
    const copy = customerCopy(context);
    documentRef.documentElement.dataset.professionalIntent = 'true';
    const introCopy = documentRef.querySelector('.prospect-report-intro__copy');
    const meta = documentRef.querySelector('.prospect-report-meta');
    if (introCopy && !introCopy.querySelector('[data-professional-intent]')) introCopy.insertBefore(createBanner(documentRef, copy, true), meta || null);
    const set = (selector, value) => documentRef.querySelectorAll(selector).forEach(node => {
      if (node.textContent !== value) node.textContent = value;
    });
    const applyCopy = () => {
      set('[data-prospect-eyebrow]', copy.bannerLabel);
      set('[data-prospect-title]', copy.reportTitle);
      set('[data-prospect-intro]', copy.reportIntro);
      set('[data-prospect-reason]', copy.reportReason);
      const next = documentRef.getElementById('prospect-next-title');
      if (next && next.textContent !== copy.reportNext) next.textContent = copy.reportNext;
      const cta = documentRef.querySelector('.prospect-report-cta h2');
      if (cta && cta.textContent !== copy.reportCta) cta.textContent = copy.reportCta;
    };
    applyCopy();
    await new Promise(resolve => (root.requestAnimationFrame || root.setTimeout)(resolve));
    applyCopy();
    return { active: true, context, copy };
  }

  function init() {
    const documentRef = root.document;
    const route = documentRef.body?.dataset?.assessmentRoute;
    if (route) return applyAssessment(contextFor(), { document: documentRef });
    if (documentRef.body?.dataset?.reportType === 'home') return applyReport({ document: documentRef });
    return { active: false };
  }

  return Object.freeze({ VERSION, BUILD, contextFor, customerCopy, applyAssessment, applyReport, init });
});
