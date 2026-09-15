(() => {
  'use strict';

  const VERSION = '1.0';

  const cleanDisplay = (value, max = 260) => String(value || '')
    .trim()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, max);

  const select = (documentRef, selector) => documentRef?.querySelector?.(selector) || null;
  const setText = (node, value) => {
    if (node) node.textContent = cleanDisplay(value, 500);
  };
  const setHidden = (node, hidden) => {
    if (node) node.hidden = Boolean(hidden);
  };

  const buildModel = ({ experience, context }) => {
    const givenName = cleanDisplay(context?.identity?.givenName, 80);
    const displayAddress = cleanDisplay(context?.property?.displayAddress, 220);
    const reasonLabel = cleanDisplay(experience?.reasonLabel || experience?.kicker || 'Personalized home review', 120);
    const cta = cleanDisplay(experience?.cta || 'Begin My Home Coverage Review', 140);
    const contactReady = Boolean(
      cleanDisplay(context?.identity?.displayName || givenName, 160)
      || cleanDisplay(context?.contact?.email, 180)
      || cleanDisplay(context?.contact?.phone, 40)
    );

    return Object.freeze({
      title: givenName ? `${givenName}, your Home Protection Review is ready to begin.` : 'Your Home Protection Review is ready to begin.',
      summary: displayAddress
        ? `Your onboarding details for ${displayAddress} are organized and ready for the next step.`
        : 'Your onboarding details are organized and ready for the next step.',
      displayAddress,
      reasonLabel,
      contactDetail: contactReady
        ? 'Your saved intake details will carry forward securely.'
        : 'You can confirm your contact details during the review.',
      propertyTitle: displayAddress ? 'Property confirmed' : 'Home details ready',
      propertyDetail: displayAddress || 'You can confirm the property details during the review.',
      cta,
      ctaLabel: givenName ? `${cta}, ${givenName}` : cta
    });
  };

  const render = ({ document: documentRef = document, experience, context } = {}) => {
    const root = select(documentRef, '[data-home-dashboard]');
    if (!root || !experience || !context) return Object.freeze({ rendered: false });

    const model = buildModel({ experience, context });
    const defaultArt = select(documentRef, '[data-home-default-art]');
    const title = documentRef?.getElementById?.('homeDashboardTitle') || null;
    const summary = select(documentRef, '[data-dashboard-summary]');
    const property = select(documentRef, '[data-dashboard-property]');
    const address = select(documentRef, '[data-dashboard-address]');
    const contactDetail = select(documentRef, '[data-dashboard-contact-detail]');
    const propertyTitle = select(documentRef, '[data-dashboard-property-title]');
    const propertyDetail = select(documentRef, '[data-dashboard-property-detail]');
    const reason = select(documentRef, '[data-dashboard-reason]');
    const cta = select(documentRef, '[data-dashboard-cta]');

    setText(title, model.title);
    setText(summary, model.summary);
    setText(address, model.displayAddress);
    setHidden(property, !model.displayAddress);
    setText(contactDetail, model.contactDetail);
    setText(propertyTitle, model.propertyTitle);
    setText(propertyDetail, model.propertyDetail);
    setText(reason, model.reasonLabel);
    setText(cta, model.cta);
    if (cta) {
      cta.href = '/assessment/';
      cta.setAttribute?.('aria-label', model.ctaLabel);
    }

    setHidden(defaultArt, true);
    setHidden(root, false);
    root.dataset.dashboardState = 'ready';
    documentRef.documentElement.dataset.homeArrival = 'dashboard';

    return Object.freeze({ rendered: true });
  };

  window.CoverageFitHomeDashboard = Object.freeze({
    version: VERSION,
    render
  });
})();
