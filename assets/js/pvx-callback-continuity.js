/* CF-CALLBACK-WEB-1.0 — direct browser booking after an explicit call request. */
(function (root, document) {
  'use strict';

  const BUILD = 'CF-CALLBACK-WEB-1.0';
  const SCHEMA = '408-callback-browser-booking-v1';
  const ENDPOINT = '/api/callback/customer-book';
  let mounted = false;

  function uuid() {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID();
    if (!root.crypto?.getRandomValues) return '';
    const bytes = new Uint8Array(16);
    root.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function weekend(value) {
    const parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) return false;
    const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
    return day === 0 || day === 6;
  }

  function timeOptions() {
    const options = [{ value: '', label: 'Choose a time' }];
    for (let hour = 9; hour <= 17; hour += 1) {
      for (let minute = 0; minute < 60; minute += 30) {
        const displayHour = hour > 12 ? hour - 12 : hour;
        options.push({
          value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          label: `${displayHour}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
        });
      }
    }
    return options;
  }

  function safeCalendarUrl(value) {
    try {
      const url = new URL(String(value || ''));
      const allowed = new Set(['https://coveragefit.com', 'https://www.coveragefit.com', 'https://review.408farmers.com']);
      return allowed.has(url.origin) && url.pathname === '/appointment/' && /^\?token=[A-Za-z0-9_-]{24,96}$/.test(url.search)
        ? url.toString()
        : '';
    } catch (_) {
      return '';
    }
  }

  function track(name, result) {
    root.CoverageFitPVXEvents?.track?.(name, { stage: 'snapshot', result });
  }

  function appendOption(select, option) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }

  function mount(detail) {
    if (mounted || detail?.callPermitted !== true || !detail.token) return;
    const status = document.getElementById('pvxContactStatus');
    const form = document.getElementById('pvxContactRequestForm');
    if (!status || !form) return;
    mounted = true;

    const region = document.createElement('section');
    region.className = 'pvx-callback-continuity';
    region.setAttribute('aria-labelledby', 'pvxCallbackTitle');
    region.innerHTML = [
      '<span class="pvx-kicker">Optional exact time</span>',
      '<h3 id="pvxCallbackTitle">Choose a callback time</h3>',
      '<p>Pick a convenient time. CoverageFit will check Dylan’s calendar before confirming it.</p>',
      '<div class="pvx-callback-fields">',
        '<label>Date<input type="date" data-pvx-callback-date></label>',
        '<label>Time<select data-pvx-callback-time aria-describedby="pvxCallbackTimeZone"></select></label>',
      '</div>',
      '<p class="pvx-callback-time-zone" id="pvxCallbackTimeZone">Times are shown in Pacific Time.</p>',
      '<button class="pvx-button pvx-button--primary" type="button" data-pvx-callback-book>Confirm callback</button>',
      '<button class="pvx-readiness-skip" type="button" data-pvx-callback-later>I’ll coordinate with Dylan later</button>',
      '<p class="pvx-callback-consent">By confirming, you ask Dylan to call the number already provided at the selected time. This does not enroll you in marketing texts.</p>',
      '<div class="pvx-callback-alternatives" data-pvx-callback-alternatives hidden></div>',
      '<p class="pvx-checkpoint-status" data-pvx-callback-status role="status" aria-live="polite"></p>'
    ].join('');
    form.insertAdjacentElement('afterend', region);

    const dateInput = region.querySelector('[data-pvx-callback-date]');
    const timeInput = region.querySelector('[data-pvx-callback-time]');
    const button = region.querySelector('[data-pvx-callback-book]');
    const later = region.querySelector('[data-pvx-callback-later]');
    const live = region.querySelector('[data-pvx-callback-status]');
    const alternatives = region.querySelector('[data-pvx-callback-alternatives]');
    const today = new Date();
    const maximum = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);
    dateInput.min = isoDate(today);
    dateInput.max = isoDate(maximum);
    timeOptions().forEach(option => appendOption(timeInput, option));
    let requestId = uuid();

    function resetAttempt() {
      requestId = uuid();
      alternatives.replaceChildren();
      alternatives.hidden = true;
    }

    function selectAlternative(slot) {
      dateInput.value = String(slot.date || '');
      timeInput.value = String(slot.time || '');
      resetAttempt();
      live.textContent = 'That available time is selected. Confirm it when you’re ready.';
      button.focus();
    }

    function showAlternatives(slots) {
      alternatives.replaceChildren();
      for (const slot of Array.isArray(slots) ? slots.slice(0, 2) : []) {
        if (!/^20\d{2}-\d{2}-\d{2}$/.test(String(slot?.date || '')) || !/^\d{2}:\d{2}$/.test(String(slot?.time || ''))) continue;
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.textContent = String(slot.display || 'Choose this available time').slice(0, 100);
        choice.addEventListener('click', () => selectAlternative(slot));
        alternatives.appendChild(choice);
      }
      alternatives.hidden = !alternatives.childElementCount;
    }

    dateInput.addEventListener('change', resetAttempt);
    timeInput.addEventListener('change', resetAttempt);

    later.addEventListener('click', () => {
      button.disabled = true;
      later.disabled = true;
      live.textContent = 'That’s okay—your call request is already saved for Dylan.';
      track('continuation_selected', 'continued');
    });

    button.addEventListener('click', async () => {
      if (!dateInput.value || !timeInput.value) {
        live.textContent = 'Choose a date and time.';
        (!dateInput.value ? dateInput : timeInput).focus();
        return;
      }
      if (weekend(dateInput.value)) {
        live.textContent = 'Choose a Monday through Friday.';
        dateInput.focus();
        return;
      }
      if (!requestId) requestId = uuid();
      button.disabled = true;
      later.disabled = true;
      live.textContent = 'Checking Dylan’s calendar…';
      try {
        const response = await root.fetch(ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CoverageFit-Callback-Version': '1'
          },
          body: JSON.stringify({
            action: 'book_from_checkpoint',
            token: detail.token,
            request_id: requestId,
            date: dateInput.value,
            time: timeInput.value,
            call_request: true,
            call_request_version: SCHEMA,
            call_request_timestamp: new Date().toISOString()
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok !== true) throw new Error(data?.error?.message || 'The callback time could not be confirmed.');
        if (data.booked !== true || data.available === false) {
          button.disabled = false;
          later.disabled = false;
          live.textContent = 'That time is no longer available. Choose another time below.';
          showAlternatives(data.alternatives);
          requestId = uuid();
          track('callback_booking_unavailable', 'unavailable');
          return;
        }
        const calendarUrl = safeCalendarUrl(data.appointment?.calendarUrl);
        if (!calendarUrl) throw new Error('Your callback is confirmed, but the calendar page could not be opened.');
        live.textContent = 'Confirmed. Opening your calendar page…';
        track('callback_booking_confirmed', 'confirmed');
        root.location.assign(calendarUrl);
      } catch (cause) {
        button.disabled = false;
        later.disabled = false;
        live.textContent = cause?.message || 'The callback time could not be confirmed. Please try again.';
        track('callback_booking_failed', 'failed');
      }
    });

    track('callback_booking_prompt_viewed', 'viewed');
  }

  root.addEventListener('coveragefit:contact_requested', event => mount(event.detail || {}));
  root.CoverageFitCallbackContinuity = Object.freeze({ build: BUILD, mount });
})(window, document);
