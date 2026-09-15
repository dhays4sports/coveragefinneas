(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoverageFitPVXDiscovery = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '2.1.0';
  const BUILD = 'CF-DISCOVERY-1.3';
  const CONTRACT_ID = 'coveragefit-multi-product-discovery-v1';
  const STORAGE_KEY = 'coveragefit_pvx_discovery_v1';
  const WEB_BRIDGE_KEY = 'coveragefit_pvx_web_bridge_v1';
  const contract = root.CoverageFitPVXDiscoveryContract || (typeof require === 'function' ? require('./pvx-discovery-contract.js') : null);
  const QUESTIONS = contract ? contract.questionsFor('home') : [];
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const clean = (value, max = 240) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);

  function initialState(productTrack = 'home') {
    const track = contract?.normalizeTrack(productTrack) || 'home';
    return {
      schemaVersion: '2.0', contractId: CONTRACT_ID, productTrack: track,
      questionOrder: contract?.orderFor(track) || [], currentQuestionId: contract?.questionsFor(track)?.[0]?.id || 'shoppingReason',
      answers: {}, exactCustomerWords: {}, prefilledQuestionIds: [], answerSources: {},
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null
    };
  }

  function entryType() {
    for (const storage of [root.localStorage, root.sessionStorage]) {
      try { const bridge = JSON.parse(storage?.getItem?.(WEB_BRIDGE_KEY) || 'null'); if (bridge?.entry?.type) return clean(bridge.entry.type, 40).toLowerCase(); } catch (_) {}
    }
    return '';
  }

  function questionsFor(profile = {}) {
    const questions = contract?.questionsFor(profile.productTrack) || QUESTIONS;
    return entryType() === 'snapshot' ? questions.filter(question => question.id !== 'permissionToAdvise') : questions;
  }

  function nextUnansweredQuestion(profile = {}, afterQuestionId = '') {
    const questions = questionsFor(profile);
    const start = Math.max(-1, questions.findIndex(question => question.id === afterQuestionId));
    for (let index = start + 1; index < questions.length; index += 1) {
      if (profile.answers?.[questions[index].id] == null) return questions[index].id;
    }
    return 'complete';
  }

  function validateCatalog(questions = QUESTIONS, productTrack = 'home') {
    if (contract && arguments.length < 1) return contract.validateCatalog(productTrack);
    const terms = /underinsured|qualified|eligible|approved|guaranteed savings|bind coverage/i;
    return { valid: questions.length <= 8 && questions.every(question => question.options?.length) && !questions.some(question => terms.test(`${question.title} ${question.description}`)), count: questions.length };
  }

  function captureAnswer(profile, questionId, value, words, source = 'customer-reported') {
    const base = { ...initialState(profile?.productTrack), ...clone(profile) };
    const question = questionsFor(base).find(item => item.id === questionId);
    if (!question) throw new TypeError('Unknown discovery question.');
    const next = { ...base, answers: { ...(base.answers || {}) }, exactCustomerWords: { ...(base.exactCustomerWords || {}) }, answerSources: { ...(base.answerSources || {}) } };
    const allowed = new Set(question.options.map(option => option.value));
    const values = Array.isArray(value) ? value : [value];
    if (!values.length || values.some(item => !allowed.has(item))) throw new TypeError('Unsupported discovery answer.');
    next.answers[questionId] = question.type === 'multi' ? [...new Set(values)] : values[0];
    const exact = clean(words);
    if (exact) next.exactCustomerWords[questionId] = exact;
    next.answerSources[questionId] = clean(source, 40) || 'customer-reported';
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function completeProfile(profile, at = new Date().toISOString()) {
    const next = { ...initialState(profile?.productTrack), ...clone(profile) };
    const missing = questionsFor(next).filter(question => next.answers?.[question.id] == null);
    if (missing.length) throw new TypeError('Every planned discovery question needs an answer; “Not sure” is valid.');
    next.currentQuestionId = 'complete'; next.completedAt = at; next.updatedAt = at;
    return next;
  }

  function install() {
    const doc = root.document;
    if (!doc?.body?.hasAttribute('data-pvx-discovery') || !contract) return null;
    const $ = id => doc.getElementById(id);
    let state = (() => { try { return JSON.parse(root.localStorage.getItem(STORAGE_KEY) || 'null') || initialState(); } catch (_) { return initialState(); } })();
    state = { ...initialState(state.productTrack), ...state, productTrack: contract.normalizeTrack(state.productTrack) };
    const questions = questionsFor(state);
    state.questionOrder = questions.map(question => question.id);
    const prefilled = new Set(Array.isArray(state.prefilledQuestionIds) ? state.prefilledQuestionIds : []);
    const isCarried = index => Boolean(questions[index] && prefilled.has(questions[index].id) && state.answers?.[questions[index].id] != null);
    const carriedCount = questions.reduce((count, _question, questionIndex) => count + (isCarried(questionIndex) ? 1 : 0), 0);
    const editableIndices = questions.map((_question, questionIndex) => questionIndex).filter(questionIndex => !isCarried(questionIndex));
    const editableTotal = editableIndices.length;
    const journeyPosition = questionIndex => Math.max(1, editableIndices.indexOf(questionIndex) + 1);
    const nextEditable = from => { let next = from + 1; while (next < questions.length && isCarried(next)) next += 1; return next; };
    const previousEditable = from => { let previous = from - 1; while (previous >= 0 && isCarried(previous)) previous -= 1; return previous; };
    let index = Math.max(0, questions.findIndex(question => question.id === state.currentQuestionId));
    if (isCarried(index)) index = nextEditable(index - 1);
    const save = () => {
      state.currentQuestionId = questions[index]?.id || 'complete'; state.updatedAt = new Date().toISOString();
      try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    };
    const announce = message => { $('pvxDiscoveryLive').textContent = ''; root.setTimeout(() => { $('pvxDiscoveryLive').textContent = message; }, 20); };
    const trackLabel = { home: 'home', buyer: 'home purchase', auto: 'auto', bundle: 'home + auto', renter: 'renter' }[state.productTrack] || 'coverage';
    const track = (name, detail) => { try { return root.CoverageFitPVXConsumerEvents?.emit?.(name, detail); } catch (_) { return null; } };
    track('discovery_started', { stage:'discovery', result:'viewed' });

    function render() {
      if (index >= questions.length) return finish();
      const question = questions[index];
      const position = journeyPosition(index);
      const progress = Math.round((position / Math.max(1, editableTotal)) * 100);
      $('pvxDiscoveryQuestion').hidden = false; $('pvxDiscoveryListening').hidden = true; $('pvxDiscoveryComplete').hidden = true;
      const continuity = $('pvxDiscoveryContinuity');
      if (continuity) continuity.hidden = carriedCount === 0;
      if (carriedCount > 0 && $('pvxDiscoveryContinuityText')) {
        $('pvxDiscoveryContinuityText').textContent = `Your earlier answers are already connected. ${editableTotal} quick ${editableTotal === 1 ? 'question' : 'questions'} left.`;
      }
      $('pvxDiscoveryKicker').textContent = question.kicker; $('pvxDiscoveryTitle').textContent = question.title; $('pvxDiscoveryDescription').textContent = question.description;
      $('pvxDiscoveryHelp').textContent = question.help; $('pvxDiscoveryHelp').hidden = true; $('pvxDiscoveryHelpToggle').setAttribute('aria-expanded', 'false');
      const remaining = Math.max(1, editableTotal - position + 1);
      $('pvxDiscoveryStage').textContent = question.stage; $('pvxDiscoveryProgressText').textContent = `${remaining} quick ${remaining === 1 ? 'question' : 'questions'} left`;
      $('pvxDiscoveryProgress').setAttribute('aria-valuenow', String(progress)); $('pvxDiscoveryProgress').setAttribute('aria-valuetext', `${position} of ${editableTotal} remaining questions`); $('pvxDiscoveryProgressBar').style.width = `${progress}%`;
      $('pvxDiscoveryBack').hidden = previousEditable(index) < 0; $('pvxDiscoveryError').hidden = true;
      const stored = state.answers[question.id]; const needsWords = stored === 'something_else';
      $('pvxDiscoveryContinue').hidden = question.autoAdvance && !needsWords; $('pvxExactWordsField').hidden = !needsWords; $('pvxExactWords').value = state.exactCustomerWords[question.id] || '';
      $('pvxDiscoveryControl').innerHTML = question.options.map(option => `<button class="pvx-choice${question.type === 'multi' ? ' pvx-choice--multi' : ''}" type="button" ${question.type === 'single' ? `role="radio" aria-checked="${stored === option.value}"` : `aria-pressed="${Array.isArray(stored) && stored.includes(option.value)}"`} data-value="${option.value}"><span class="pvx-choice__copy"><strong>${option.label}</strong></span><span class="pvx-choice__mark" aria-hidden="true">✓</span></button>`).join('');
      bind(question); announce(`Question ${position} of ${editableTotal}. ${question.stage}. ${question.title}.`); $('pvxDiscoveryMain').focus({ preventScroll: true });
    }

    function choose(question, button) {
      const value = button.dataset.value;
      const firstAnswer = state.answers[question.id] == null;
      if (question.type === 'multi') {
        const option = question.options.find(item => item.value === value);
        let values = Array.isArray(state.answers[question.id]) ? [...state.answers[question.id]] : [];
        if (option.exclusive) values = values.includes(value) ? [] : [value];
        else { values = values.filter(item => !question.options.find(candidate => candidate.value === item)?.exclusive); values = values.includes(value) ? values.filter(item => item !== value) : [...values, value]; }
        if (values.length) state = captureAnswer(state, question.id, values);
        else {
          state = { ...state, answers:{ ...(state.answers || {}) }, exactCustomerWords:{ ...(state.exactCustomerWords || {}) }, answerSources:{ ...(state.answerSources || {}) } };
          delete state.answers[question.id]; delete state.exactCustomerWords[question.id]; delete state.answerSources[question.id];
        }
        save();
        $('pvxDiscoveryControl').querySelectorAll('.pvx-choice').forEach(item => item.setAttribute('aria-pressed', String(values.includes(item.dataset.value))));
      } else {
        state = captureAnswer(state, question.id, value); save();
        $('pvxDiscoveryControl').querySelectorAll('.pvx-choice').forEach(item => item.setAttribute('aria-checked', String(item === button)));
        if (value === 'something_else') { $('pvxExactWordsField').hidden = false; $('pvxDiscoveryContinue').hidden = false; $('pvxExactWords').focus(); }
        else if (question.autoAdvance) listenAndAdvance(question);
      }
      if (firstAnswer) track('discovery_answered', { stage:'discovery', result:'selected', questionPosition:index + 1, journeyQuestionPosition:journeyPosition(index), journeyQuestionCount:editableTotal, carriedQuestionCount:carriedCount });
    }

    function bind(question) { $('pvxDiscoveryControl').querySelectorAll('.pvx-choice').forEach(button => button.addEventListener('click', () => choose(question, button))); }
    function listenAndAdvance(question) {
      $('pvxDiscoveryQuestion').hidden = true; $('pvxDiscoveryListening').hidden = false;
      const reaction = root.CoverageFitPVXContextualBranching?.acknowledgment?.(state, question.id);
      $('pvxDiscoveryListeningText').textContent = reaction || 'Got it. We’re keeping this in your own context.';
      root.setTimeout(() => { const next = nextEditable(index); if (next >= questions.length) return finish(); index = next; save(); render(); }, root.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
    }
    function finish() {
      state = completeProfile(state); save(); $('pvxDiscoveryQuestion').hidden = true; $('pvxDiscoveryListening').hidden = true; $('pvxDiscoveryComplete').hidden = false;
      $('pvxDiscoveryProgress').setAttribute('aria-valuenow', '100'); $('pvxDiscoveryProgressBar').style.width = '100%';
      const completionCopy = $('pvxDiscoveryComplete').querySelector('p'); if (completionCopy) completionCopy.textContent = `Your ${trackLabel} starting point is ready.`;
      announce('Discovery complete. We heard what matters.');
      try { root.dispatchEvent(new CustomEvent('coveragefit:pvx-discovery-complete', { detail: { contractId: CONTRACT_ID, productTrack: state.productTrack, questionCount: questions.length, answeredHereCount: editableTotal, carriedQuestionCount: carriedCount, technicalQuestions: 0, scoreCreated: false, contactCollected: false, repeatedQuestions: 0, snapshotIsPrimaryNextStep: true } })); } catch (_) {}
    }

    $('pvxDiscoveryForm').addEventListener('submit', event => {
      event.preventDefault(); const question = questions[index]; const value = state.answers[question.id];
      if (value == null || (Array.isArray(value) && !value.length)) { $('pvxDiscoveryError').textContent = 'Choose an answer. “Not sure” is always okay.'; $('pvxDiscoveryError').hidden = false; return; }
      const words = clean($('pvxExactWords').value); if (words) state = captureAnswer(state, question.id, value, words); save(); listenAndAdvance(question);
    });
    $('pvxDiscoveryBack').addEventListener('click', () => { const previous = previousEditable(index); if (previous >= 0) { index = previous; save(); render(); } });
    $('pvxDiscoveryHelpToggle').addEventListener('click', () => { const open = $('pvxDiscoveryHelp').hidden; $('pvxDiscoveryHelp').hidden = !open; $('pvxDiscoveryHelpToggle').setAttribute('aria-expanded', String(open)); });
    $('pvxDiscoverySave').addEventListener('click', () => { save(); announce('Progress saved on this device.'); });
    render(); return { getState: () => clone(state), render, questions: clone(questions) };
  }

  if (root.document) root.addEventListener('DOMContentLoaded', install, { once: true });
  return Object.freeze({ VERSION, BUILD, CONTRACT_ID, STORAGE_KEY, QUESTIONS, initialState, questionsFor, nextUnansweredQuestion, validateCatalog, captureAnswer, completeProfile, install });
});
