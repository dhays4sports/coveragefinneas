(() => {
  'use strict';

  const VERSION = '1.0';
  const PROFILE_STORAGE_KEY = 'coveragefit_prospect_profile_v1';
  const WELCOME_STORAGE_KEY = 'coveragefit_transition_welcome_v1';
  const MAX_RECEIPT_AGE = 30 * 60 * 1000;

  const EXPERIENCES = Object.freeze({
    general: Object.freeze({
      title: 'Your Home Coverage Review Is Ready | CoverageFit',
      kicker: 'Your Coverage Review Is Ready',
      reasonLabel: 'Personalized home review',
      heading: 'Welcome. Let’s understand',
      highlight: 'your home protection.',
      status: 'Personalized review ready',
      statusDetail: 'Your onboarding is complete. Your Coverage Review is ready to begin.',
      lead: 'Start with a clearer view of what appears strong, what deserves another look, and what to ask before comparing insurance options.',
      copy: 'Review rebuilding, water, liability, deductibles, personal property, and recent life changes at your own pace.',
      note: 'The information you already provided has been carried forward securely, so you can begin without entering it again.',
      cta: 'Begin My Home Coverage Review'
    }),
    homebuyer: Object.freeze({
      title: 'Your New Home Coverage Review Is Ready | CoverageFit',
      kicker: 'Your New Home Review Is Ready',
      reasonLabel: 'New home purchase',
      heading: 'Welcome. Let’s review the protection',
      highlight: 'your new home may need.',
      status: 'New home review ready',
      statusDetail: 'Your onboarding is complete. Your new home review is ready to begin.',
      lead: 'Before comparing insurance options, start with the rebuilding, water, liability, and deductible decisions that can shape protection for your new home.',
      copy: 'CoverageFit will help you organize the questions worth answering before your closing or coverage decision.',
      note: 'The home and contact details you already provided have been carried forward securely.',
      cta: 'Begin My New Home Review'
    }),
    renewal: Object.freeze({
      title: 'Your Annual Coverage Review Is Ready | CoverageFit',
      kicker: 'Your Annual Review Is Ready',
      reasonLabel: 'Annual renewal',
      heading: 'Let’s review what still fits',
      highlight: 'before your renewal.',
      status: 'Annual review ready',
      statusDetail: 'Your onboarding is complete. Your annual Coverage Review is ready to begin.',
      lead: 'Your home and rebuilding needs can change even when the address does not. Confirm what still fits before deciding what to keep or change.',
      copy: 'Review your protection priorities, deductibles, and recent life changes before your next renewal decision.',
      note: 'The information you already provided has been carried forward securely into this review.',
      cta: 'Begin My Annual Review'
    }),
    'non-renewal': Object.freeze({
      title: 'Your Coverage Continuity Review Is Ready | CoverageFit',
      kicker: 'Your Coverage Review Is Ready',
      reasonLabel: 'Non-renewal',
      heading: 'Let’s build clarity before',
      highlight: 'your next coverage decision.',
      status: 'Coverage continuity review ready',
      statusDetail: 'Your onboarding is complete. Your coverage continuity review is ready to begin.',
      lead: 'A non-renewal creates urgency, but the next step should still begin with understanding the protection your home needs.',
      copy: 'Organize the rebuilding, water, liability, deductible, and personal-property questions worth discussing with a licensed professional.',
      note: 'The information you already provided has been carried forward securely so you can focus on the review.',
      cta: 'Begin My Coverage Review'
    }),
    'premium-increase': Object.freeze({
      title: 'Your Protection Review Is Ready | CoverageFit',
      kicker: 'Your Protection Review Is Ready',
      reasonLabel: 'Premium increase',
      heading: 'Review your protection',
      highlight: 'before changing it for price.',
      status: 'Protection review ready',
      statusDetail: 'Your onboarding is complete. Your protection review is ready to begin.',
      lead: 'A higher premium may justify comparison, but first confirm which protections, limits, and deductibles matter to you.',
      copy: 'CoverageFit helps you separate meaningful coverage decisions from changes made only to lower the price.',
      note: 'The information you already provided has been carried forward securely into this review.',
      cta: 'Begin My Protection Review'
    })
  });

  const safeGet = (storage, key) => {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_) { return null; }
  };

  const allowedReason = (value) => Object.prototype.hasOwnProperty.call(EXPERIENCES, value)
    ? value
    : 'general';

  const destinationIsHome = (value) => {
    try {
      const parsed = new URL(String(value || ''), window.location.origin);
      return parsed.origin === window.location.origin && (parsed.pathname === '/home/' || parsed.pathname === '/home');
    } catch (_) {
      return false;
    }
  };

  const receiptIsFresh = (receipt) => {
    const timestamp = Date.parse(receipt?.completedAt || '');
    return Number.isFinite(timestamp) && timestamp <= Date.now() + 5000 && Date.now() - timestamp <= MAX_RECEIPT_AGE;
  };

  const sessionMatches = (receipt, profile, personalizationContext) => {
    const receiptSession = String(receipt?.sessionId || '').trim();
    const profileSession = String(personalizationContext?.sessionId || profile?.integration?.sessionId || '').trim();
    return !receiptSession || !profileSession || receiptSession === profileSession;
  };

  const setDefaultState = () => {
    document.documentElement.dataset.welcomeState = 'default';
    window.CoverageFitWelcome = Object.freeze({ version: VERSION, active: false, reasonKey: 'general' });
  };

  const referredWelcome = window.CoverageFitReferredHomeownerWelcome?.render?.({
    document,
    location: window.location,
    storage: sessionStorage
  });

  if (referredWelcome?.rendered) {
    window.CoverageFitWelcome = Object.freeze({
      version: VERSION,
      active: true,
      mode: 'referred',
      reasonKey: 'neighbor'
    });
    return;
  }

  const receipt = safeGet(sessionStorage, WELCOME_STORAGE_KEY);
  const profile = safeGet(sessionStorage, PROFILE_STORAGE_KEY) || safeGet(localStorage, PROFILE_STORAGE_KEY);
  const personalizationContext = window.CoverageFitPersonalization?.get?.() || null;
  const hasProfile = personalizationContext ? Boolean(personalizationContext.flags?.hasProfile) : Boolean(profile);
  const active = Boolean(
    receipt?.version === VERSION
    && receipt?.hasProfile === true
    && hasProfile
    && receiptIsFresh(receipt)
    && destinationIsHome(receipt.destination)
    && sessionMatches(receipt, profile, personalizationContext)
  );

  if (!active) {
    setDefaultState();
    return;
  }

  const reasonKey = allowedReason(personalizationContext?.journey?.reasonKey || receipt?.reasonKey);
  const experience = EXPERIENCES[reasonKey];
  const renderContext = personalizationContext || {
    identity: { givenName: profile?.firstName || '' },
    property: { displayAddress: profile?.propertyAddress || '' },
    journey: { reasonKey },
    sessionId: profile?.integration?.sessionId || receipt?.sessionId || ''
  };
  const renderResult = window.CoverageFitHeroPersonalization?.render?.({
    document,
    experience,
    context: renderContext,
    reasonKey
  });
  const dashboardResult = window.CoverageFitHomeDashboard?.render?.({
    document,
    experience,
    context: renderContext,
    reasonKey
  });

  if (!renderResult?.rendered || (window.CoverageFitHomeDashboard && !dashboardResult?.rendered)) {
    setDefaultState();
    return;
  }

  document.title = experience.title;
  document.documentElement.dataset.welcomeState = 'personalized';
  document.documentElement.dataset.welcomeReason = reasonKey;

  window.CoverageFitWelcome = Object.freeze({
    version: VERSION,
    active: true,
    reasonKey
  });
})();
