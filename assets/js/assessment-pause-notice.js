(() => {
  'use strict';

  const PAUSE_NOTICE_KEY = 'coveragefit_assessment_pause_notice_v1';
  const params = new URLSearchParams(window.location.search);
  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem(PAUSE_NOTICE_KEY) || 'null'); } catch (_) {}
  const pausedAt = Date.parse(stored?.pausedAt || '');
  const freshStoredNotice = Number.isFinite(pausedAt) && Date.now() - pausedAt < 30 * 60 * 1000;
  if (params.get('review_saved') !== '1' && !freshStoredNotice) return;

  const main = document.querySelector('main');
  if (!main || document.getElementById('assessmentPausedNotice')) return;

  const notice = document.createElement('section');
  notice.id = 'assessmentPausedNotice';
  notice.className = 'assessment-paused-notice';
  notice.setAttribute('role', 'status');

  const inner = document.createElement('div');
  inner.className = 'wrap assessment-paused-notice__inner';
  const copy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Review saved';
  const title = document.createElement('strong');
  title.textContent = 'Your Coverage Review is paused on this device.';
  const detail = document.createElement('p');
  detail.textContent = 'Continue within seven days to return to the same question with your previous answers selected.';
  const action = document.createElement('a');
  action.className = 'btn primary';
  action.href = '/assessment/';
  action.textContent = 'Continue My Review';
  copy.append(eyebrow, title, detail);
  inner.append(copy, action);
  notice.appendChild(inner);
  main.insertAdjacentElement('afterbegin', notice);

  try { sessionStorage.removeItem(PAUSE_NOTICE_KEY); } catch (_) {}
  if (params.has('review_saved')) {
    params.delete('review_saved');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }
})();
