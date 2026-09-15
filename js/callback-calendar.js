(() => {
  'use strict';
  const status = document.getElementById('calendarStatus');
  const eventRegion = document.getElementById('calendarEvent');
  const when = document.getElementById('calendarWhen');
  const google = document.getElementById('googleCalendar');
  const device = document.getElementById('deviceCalendar');
  const token = new URL(location.href).searchParams.get('token') || '';
  const condoPrep = document.getElementById('condoWaterPrep');
  const condoStatus = document.getElementById('condoWaterStatus');
  const deviceFieldset = document.getElementById('waterDeviceFieldset');
  const willingFieldset = document.getElementById('waterWillingFieldset');
  let waterState = { unitWaterShutoff:'', automaticWaterShutoffDevice:'', waterShutoffWillingness:'not_asked' };
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const googleUrl = event => {
    const query = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${stamp(event.start)}/${stamp(event.end)}`,
      details: [`Dylan will call you at the scheduled time. Virginia Tam Insurance Agency, Inc. · ${event.agencyPhone}`, event.preparationText || '', event.reviewUrl || ''].filter(Boolean).join('\n'),
      ctz: event.timeZone
    });
    return `https://calendar.google.com/calendar/render?${query}`;
  };
  const selectButtons = (selector, value, attr) => document.querySelectorAll(selector).forEach(button => button.setAttribute('aria-pressed', String(button.dataset[attr] === value)));
  async function saveWaterPrep() {
    if (!waterState.unitWaterShutoff) return;
    if (condoStatus) condoStatus.textContent = 'Saving this for Dylan…';
    try {
      const response = await fetch('/api/pvx/web-journey', {
        method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({ action:'update', stage:'appointment_booked', currentStep:'condo_water_prep', details:waterState })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) throw new Error('save_failed');
      if (condoStatus) condoStatus.textContent = 'Saved. Dylan will verify the requirement with you on the call.';
    } catch (_) {
      if (condoStatus) condoStatus.textContent = 'Your appointment is still confirmed. We can cover this on the call.';
    }
  }
  async function loadCondoPrep() {
    if (!condoPrep) return;
    try {
      const response = await fetch('/api/pvx/web-journey', {method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify({action:'load'})});
      const data = await response.json().catch(() => ({}));
      const journey = data?.journey, appointment = journey?.seed?.context?.appointment || {};
      if (!response.ok || data.ok !== true || journey?.currentStage !== 'appointment_booked' || appointment.reviewTrack !== 'condo') return;
      const projection = journey.projection || {};
      waterState.unitWaterShutoff = projection.unitWaterShutoff || '';
      waterState.automaticWaterShutoffDevice = projection.automaticWaterShutoffDevice || '';
      waterState.waterShutoffWillingness = projection.waterShutoffWillingness || 'not_asked';
      condoPrep.hidden = false;
      if (waterState.unitWaterShutoff) selectButtons('[data-unit-water]', waterState.unitWaterShutoff, 'unitWater');
      if (waterState.unitWaterShutoff === 'independent') {
        deviceFieldset.hidden = false;
        if (waterState.automaticWaterShutoffDevice) selectButtons('[data-water-device]', waterState.automaticWaterShutoffDevice, 'waterDevice');
        if (waterState.automaticWaterShutoffDevice === 'not_installed') {
          willingFieldset.hidden = false;
          if (waterState.waterShutoffWillingness && waterState.waterShutoffWillingness !== 'not_asked') selectButtons('[data-water-willing]', waterState.waterShutoffWillingness, 'waterWilling');
        }
      }
      document.querySelectorAll('[data-unit-water]').forEach(button => button.addEventListener('click', async () => {
        waterState.unitWaterShutoff = button.dataset.unitWater;
        selectButtons('[data-unit-water]', waterState.unitWaterShutoff, 'unitWater');
        if (waterState.unitWaterShutoff === 'building_controlled') {
          waterState.automaticWaterShutoffDevice = 'not_applicable'; waterState.waterShutoffWillingness = 'not_asked'; deviceFieldset.hidden = true; willingFieldset.hidden = true; await saveWaterPrep();
        } else if (waterState.unitWaterShutoff === 'unsure') {
          waterState.automaticWaterShutoffDevice = 'unsure'; waterState.waterShutoffWillingness = 'not_asked'; deviceFieldset.hidden = true; willingFieldset.hidden = true; await saveWaterPrep();
        } else {
          waterState.automaticWaterShutoffDevice = ''; waterState.waterShutoffWillingness = 'not_asked'; deviceFieldset.hidden = false; willingFieldset.hidden = true; await saveWaterPrep(); if (condoStatus) condoStatus.textContent = 'Saved. One more optional question can help Dylan prepare.';
        }
      }));
      document.querySelectorAll('[data-water-device]').forEach(button => button.addEventListener('click', async () => {
        waterState.automaticWaterShutoffDevice = button.dataset.waterDevice;
        selectButtons('[data-water-device]', waterState.automaticWaterShutoffDevice, 'waterDevice');
        if (waterState.automaticWaterShutoffDevice === 'not_installed') {
          waterState.waterShutoffWillingness = 'not_asked'; willingFieldset.hidden = false; await saveWaterPrep(); if (condoStatus) condoStatus.textContent = 'Saved. Last optional question.';
        } else {
          waterState.waterShutoffWillingness = 'not_asked'; willingFieldset.hidden = true; await saveWaterPrep();
        }
      }));
      document.querySelectorAll('[data-water-willing]').forEach(button => button.addEventListener('click', async () => {
        waterState.waterShutoffWillingness = button.dataset.waterWilling;
        selectButtons('[data-water-willing]', waterState.waterShutoffWillingness, 'waterWilling');
        await saveWaterPrep();
      }));
    } catch (_) {}
  }
  if (!/^[A-Za-z0-9_-]{24,96}$/.test(token)) {
    status.textContent = 'This appointment link is unavailable.';
    return;
  }
  fetch(`/api/sms/callback/calendar?token=${encodeURIComponent(token)}`, { credentials: 'same-origin', cache: 'no-store' })
    .then(async response => ({ response, data: await response.json().catch(() => ({})) }))
    .then(({ response, data }) => {
      if (!response.ok || !data.ok) throw new Error('This appointment link is unavailable or has expired.');
      const event = data.event;
      status.textContent = 'Your callback is confirmed.';
      when.textContent = event.display;
      google.href = googleUrl(event);
      google.target = '_blank';
      google.rel = 'noopener noreferrer nofollow';
      device.href = `/api/sms/callback/calendar?token=${encodeURIComponent(token)}&format=ics`;
      if (event.preparationText) {
        const preparation = document.createElement('p');
        preparation.textContent = event.preparationText;
        preparation.style.whiteSpace = 'pre-line';
        eventRegion.append(preparation);
      }
      if (event.reviewUrl) {
        try {
          const reviewUrl = new URL(event.reviewUrl, location.origin);
          if (reviewUrl.origin === location.origin && reviewUrl.pathname === '/review/') {
            const link = document.createElement('a'); link.href = reviewUrl.href; link.textContent = 'Return to my recommendation'; eventRegion.append(link);
          }
        } catch (_) {}
      }
      eventRegion.hidden = false;
      loadCondoPrep();
      if (event.preparationBySms && Date.parse(event.start) > Date.now()) {
        const preparation = document.createElement('section');
        const heading = document.createElement('h2'); heading.textContent = 'Help Dylan prepare (optional)';
        const copy = document.createElement('p'); copy.textContent = 'Your appointment is booked. Answer up to three questions by text, or leave the details for your call.';
        const link = document.createElement('a'); link.className = 'button'; link.href = 'sms:+14083276377?body=READY'; link.textContent = 'Text READY to begin';
        const fallback = document.createElement('p'); fallback.textContent = 'You can also reply READY in your existing booking text conversation.';
        preparation.append(heading, copy, link, fallback); eventRegion.append(preparation);
      }
    })
    .catch(cause => { status.textContent = cause.message; });
})();
