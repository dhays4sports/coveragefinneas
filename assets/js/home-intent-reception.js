(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitHomeIntent = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.2.0';
  const BUILD = '408-HOME-2.9';
  const STORAGE_KEY = 'coveragefit_home_intent_context_v1';
  const SCORE_POLICY = Object.freeze({
    affectsQuestionSelection: false,
    affectsQuestionWeights: false,
    affectsAnswerImpacts: false,
    affectsProtectionScore: false
  });
  const GOALS = Object.freeze({
    farmers_fit: Object.freeze({ label: 'See whether Farmers may be worth comparing', opening: 'You came to see whether Farmers may be worth comparing for this home.' }),
    coverage_fit: Object.freeze({ label: 'Review whether current protection still fits', opening: 'You came to check whether your current home protection still fits.' }),
    home_auto_bundle: Object.freeze({ label: 'Explore home and auto together', opening: 'You came to explore whether reviewing home and auto together could be useful.' }),
    exploring: Object.freeze({ label: 'Explore protection options', opening: 'You came to explore your home protection options without pressure.' })
  });
  const HOUSING = Object.freeze({
    owner_occupied: Object.freeze({ label: 'A home you own and live in', noun: 'the home you live in' }),
    landlord: Object.freeze({ label: 'A rental property you own', noun: 'your rental property' }),
    buyer: Object.freeze({ label: 'A home you are buying', noun: 'the home you are buying' }),
    renter: Object.freeze({ label: 'A home you rent', noun: 'the home you rent' })
  });
  const TIMING = Object.freeze({
    shopping_now: Object.freeze({ label: 'Reviewing now', phrase: 'You are reviewing now.' }),
    renewal_60: Object.freeze({ label: 'Renewal within 60 days', phrase: 'Your renewal is within about 60 days.' }),
    later: Object.freeze({ label: 'Planning ahead', phrase: 'You are planning ahead.' }),
    not_sure: Object.freeze({ label: 'Timing not decided', phrase: 'You are still deciding on timing.' })
  });

  const cleanKey = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '').slice(0, 40);
  const pick = (catalog, value) => Object.prototype.hasOwnProperty.call(catalog, cleanKey(value)) ? cleanKey(value) : '';
  const clone = value => { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };
  const cleanZip = value => /^\d{5}$/.test(String(value || '').trim()) ? String(value).trim() : '';
  const cleanVariant = value => ['rate', 'fit'].includes(cleanKey(value)) ? cleanKey(value) : '';
  const read = () => {
    try { return JSON.parse(root.sessionStorage?.getItem?.(STORAGE_KEY) || 'null'); } catch (_) { return null; }
  };
  const write = value => {
    try { root.sessionStorage?.setItem?.(STORAGE_KEY, JSON.stringify(value)); return true; } catch (_) { return false; }
  };

  function campaignFor(journey) {
    const source = journey || {};
    const campaignZip = cleanZip(source.campaignZip);
    const campaignVariant = cleanVariant(source.campaignVariant);
    const expectedId = campaignZip && campaignVariant ? `home_flyer_${campaignZip}_${campaignVariant}` : '';
    const suppliedId = String(source.campaignId || source.campaign || '').trim().toLowerCase().replace(/-/g, '_');
    if (!expectedId || (suppliedId && suppliedId !== 'home_flyer' && suppliedId !== expectedId)) return null;
    return {
      active: true,
      family: 'home_flyer',
      campaignId: expectedId,
      campaignZip,
      campaignVariant,
      label: campaignVariant === 'rate' ? `${campaignZip} competitive-rate review` : `${campaignZip} Farmers-fit review`,
      continuity: `Your ${campaignZip} neighborhood flyer context is connected.`
    };
  }

  function ensurePresentation() {
    if (!root.document) return;
    if (!root.document.querySelector('link[href="/assets/css/home-intent-reception.css"]')) {
      const link = root.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/css/home-intent-reception.css';
      root.document.head?.appendChild(link);
    }
    const intro = root.document.querySelector('.assessment-intro');
    if (intro && !root.document.getElementById('homeIntentIntroduction')) {
      const section = root.document.createElement('section');
      section.className = 'home-intent-reception';
      section.id = 'homeIntentIntroduction';
      section.hidden = true;
      section.setAttribute('aria-labelledby', 'homeIntentTitle');
      section.innerHTML = '<span class="home-intent-reception__eyebrow">Why you started</span><h2 id="homeIntentTitle"></h2><p id="homeIntentCopy"></p><p class="home-intent-reception__timing" id="homeIntentTiming"></p><p class="home-intent-reception__boundary" id="homeIntentScoreBoundary"></p>';
      intro.insertAdjacentElement('afterend', section);
    }
    [root.document.getElementById('transitionIntent'), root.document.getElementById('homeIntentIntroduction')].forEach(section => {
      if (!section || section.querySelector('[data-home-campaign-context]')) return;
      const campaign = root.document.createElement('p');
      campaign.className = 'home-intent-reception__campaign';
      campaign.setAttribute('data-home-campaign-context', '');
      campaign.hidden = true;
      section.insertBefore(campaign, section.firstChild);
    });
  }

  function build(source) {
    const personalization = source || root.CoverageFitPersonalization?.get?.() || null;
    const journey = personalization?.journey || {};
    const goal = pick(GOALS, journey.homeReviewGoal);
    const housing = pick(HOUSING, journey.housingContext);
    const timing = pick(TIMING, journey.reviewTiming);
    const campaign = campaignFor(journey);
    const complete = Boolean(goal && housing && timing);
    if (!complete || !personalization?.flags?.hasProfile) return null;
    const record = {
      schemaVersion: '1.0',
      receiverVersion: VERSION,
      build: BUILD,
      active: true,
      homeReviewGoal: goal,
      housingContext: housing,
      reviewTiming: timing,
      campaign,
      labels: {
        goal: GOALS[goal].label,
        housing: HOUSING[housing].label,
        timing: TIMING[timing].label
      },
      copy: {
        opening: GOALS[goal].opening,
        transition: `${campaign ? `${campaign.continuity} ` : ''}${GOALS[goal].opening} We’ll first confirm ${HOUSING[housing].noun}, then begin the existing Protection Snapshot.`,
        timing: TIMING[timing].phrase,
        assessment: `${campaign ? `${campaign.continuity} ` : ''}We’ll keep your goal in view while you answer the coverage-understanding questions for ${HOUSING[housing].noun}.`,
        scoreBoundary: 'Your entry answers provide context for Dylan; only your CoverageFit assessment responses affect the Protection Score.'
      },
      scorePolicy: { ...SCORE_POLICY }
    };
    write(record);
    return record;
  }

  function get(source) {
    const built = build(source);
    if (built) return clone(built);
    const stored = read();
    if (!stored?.active) return null;
    const goal = pick(GOALS, stored.homeReviewGoal);
    const housing = pick(HOUSING, stored.housingContext);
    const timing = pick(TIMING, stored.reviewTiming);
    return goal && housing && timing ? build({ flags: { hasProfile: true }, journey: { homeReviewGoal: goal, housingContext: housing, reviewTiming: timing, campaignId: stored.campaign?.campaignId, campaignZip: stored.campaign?.campaignZip, campaignVariant: stored.campaign?.campaignVariant } }) : null;
  }

  function forRecord(source) {
    const value = get(source);
    if (!value) return null;
    return {
      schemaVersion: value.schemaVersion,
      homeReviewGoal: value.homeReviewGoal,
      housingContext: value.housingContext,
      reviewTiming: value.reviewTiming,
      campaign: clone(value.campaign),
      labels: clone(value.labels),
      summary: `${value.labels.goal}; ${value.labels.housing}; ${value.labels.timing}.`,
      scorePolicy: clone(SCORE_POLICY)
    };
  }

  function render(source) {
    if (!root.document) return null;
    ensurePresentation();
    const value = get(source);
    const transition = root.document.getElementById('transitionIntent');
    const assessment = root.document.getElementById('homeIntentIntroduction');
    [transition, assessment].forEach(node => { if (node) node.hidden = !value; });
    if (!value) return null;
    const set = (id, text) => { const node = root.document.getElementById(id); if (node) node.textContent = text; };
    set('transitionIntentTitle', value.labels.goal);
    set('transitionIntentCopy', value.copy.transition);
    set('transitionIntentTiming', value.copy.timing);
    set('homeIntentTitle', value.labels.goal);
    set('homeIntentCopy', value.copy.assessment);
    set('homeIntentTiming', value.copy.timing);
    set('homeIntentScoreBoundary', value.copy.scoreBoundary);
    root.document.querySelectorAll('[data-home-campaign-context]').forEach(node => {
      node.hidden = !value.campaign;
      node.textContent = value.campaign ? value.campaign.label : '';
    });
    return clone(value);
  }

  const api = Object.freeze({ VERSION, BUILD, STORAGE_KEY, SCORE_POLICY, GOALS, HOUSING, TIMING, campaignFor, build, get, forRecord, render });
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => render(), { once: true });
    else render();
  }
  return api;
});
