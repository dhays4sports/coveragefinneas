(() => {
  'use strict';

  const VERSION = '1.0';

  const cleanDisplay = (value, max = 220) => String(value || '')
    .trim()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, max);

  const sentence = (...parts) => cleanDisplay(parts.filter(Boolean).join(' '), 260)
    .replace(/\s+([.,!?])/g, '$1');

  const select = (documentRef, selector) => documentRef?.querySelector?.(selector) || null;
  const setText = (node, value) => {
    if (node) node.textContent = cleanDisplay(value, 500);
  };
  const setHidden = (node, hidden) => {
    if (node) node.hidden = Boolean(hidden);
  };

  const buildModel = ({ experience, context, reasonKey }) => {
    const givenName = cleanDisplay(context?.identity?.givenName, 80);
    const displayAddress = cleanDisplay(context?.property?.displayAddress, 220);
    const journeyHeading = sentence(
      String(experience?.heading || '').replace(/^Welcome\.\s*/i, ''),
      experience?.highlight
    );
    const followUpDetail = cleanDisplay(experience?.statusDetail, 320)
      .replace(/^Your onboarding is complete\.\s*/i, '');
    const completionDetail = `${givenName ? `${givenName}, your` : 'Your'} onboarding is complete${displayAddress ? ` for ${displayAddress}` : ''}. ${followUpDetail}`;

    return Object.freeze({
      reasonKey: cleanDisplay(reasonKey || 'general', 60) || 'general',
      reasonLabel: cleanDisplay(experience?.reasonLabel || experience?.kicker || 'Personalized home review', 100),
      greeting: givenName ? `Welcome, ${givenName}.` : 'Welcome.',
      journeyHeading,
      status: cleanDisplay(experience?.status, 140),
      completionDetail: cleanDisplay(completionDetail, 500),
      lead: cleanDisplay(experience?.lead, 500),
      copy: cleanDisplay(experience?.copy, 500),
      note: cleanDisplay(experience?.note, 500),
      kicker: cleanDisplay(experience?.kicker, 140),
      cta: cleanDisplay(experience?.cta, 140),
      ctaLabel: givenName ? `${experience?.cta || 'Begin my review'}, ${givenName}` : (experience?.cta || 'Begin my review'),
      ctaContext: displayAddress
        ? `Your saved details for ${displayAddress} will carry into the review.`
        : 'Your saved details will carry into the review.',
      displayAddress
    });
  };

  const greeting = Object.freeze({
    name: 'greeting',
    render(documentRef, model) {
      const root = select(documentRef, '[data-hero-greeting]');
      const main = select(documentRef, '[data-welcome-heading-main]');
      const highlight = select(documentRef, '[data-welcome-heading-highlight]');
      setText(main, model.greeting);
      setText(highlight, model.journeyHeading);
      if (root) root.dataset.componentState = 'personalized';
      return Boolean(main && highlight);
    }
  });

  const reasonBanner = Object.freeze({
    name: 'reason-banner',
    render(documentRef, model) {
      const root = select(documentRef, '[data-hero-reason-banner]');
      setText(root, model.kicker);
      if (root) {
        root.dataset.reason = model.reasonKey;
        root.setAttribute?.('aria-label', `Review reason: ${model.reasonLabel}`);
      }
      return Boolean(root);
    }
  });

  const journeyContext = Object.freeze({
    name: 'journey-context',
    render(documentRef, model) {
      const root = select(documentRef, '[data-hero-journey-context]');
      const status = documentRef?.getElementById?.('personalizedWelcomeStatus') || null;
      const detail = documentRef?.getElementById?.('personalizedWelcomeDetail') || null;
      const reason = select(documentRef, '[data-welcome-context-reason]');
      const property = select(documentRef, '[data-welcome-context-property]');
      const lead = select(documentRef, '[data-welcome-lead]');
      const copy = select(documentRef, '[data-welcome-copy]');
      const note = select(documentRef, '[data-welcome-note]');

      setText(status, model.status);
      setText(detail, model.completionDetail);
      setText(reason, model.reasonLabel);
      setText(property, model.displayAddress);
      setHidden(property, !model.displayAddress);
      setText(lead, model.lead);
      setText(copy, model.copy);
      setText(note, model.note);
      setHidden(root, false);
      if (root) root.dataset.componentState = 'ready';
      return Boolean(root && status && detail);
    }
  });

  const dynamicCta = Object.freeze({
    name: 'dynamic-cta',
    render(documentRef, model) {
      const root = select(documentRef, '[data-hero-dynamic-cta]');
      const link = select(documentRef, '[data-welcome-cta]');
      const context = select(documentRef, '[data-welcome-cta-context]');
      setText(link, model.cta);
      if (link) {
        link.href = '/assessment/';
        link.setAttribute?.('aria-label', cleanDisplay(model.ctaLabel, 180));
      }
      setText(context, model.ctaContext);
      setHidden(context, false);
      if (root) root.dataset.componentState = 'personalized';
      return Boolean(root && link);
    }
  });

  const components = Object.freeze({
    greeting,
    journeyContext,
    reasonBanner,
    dynamicCta
  });

  const render = ({ document: documentRef = document, experience, context, reasonKey = 'general' } = {}) => {
    if (!documentRef || !experience || !context) return Object.freeze({ rendered: false, components: Object.freeze([]) });
    const model = buildModel({ experience, context, reasonKey });
    const rendered = Object.values(components)
      .filter(component => component.render(documentRef, model))
      .map(component => component.name);
    return Object.freeze({ rendered: rendered.length === 4, components: Object.freeze(rendered.slice()) });
  };

  window.CoverageFitHeroPersonalization = Object.freeze({
    version: VERSION,
    render,
    components
  });
})();
