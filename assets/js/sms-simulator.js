(function () {
  'use strict';
  const ENDPOINT = '/api/sms/simulator';
  const RC_STATUS_ENDPOINT = '/api/sms/ringcentral/status';
  const PRODUCER_ENDPOINT = '/api/sms/producer';
  const RC_SUBSCRIPTION_ENDPOINT = '/api/sms/ringcentral/subscription';
  const TOKEN_KEY = 'coveragefit.producerInbox.token';
  const CONVERSATION_KEY = 'coveragefit.smsSimulator.conversationId';
  const TEST_PHONE = '+14085550199';

  const $ = id => document.getElementById(id);
  const lock = $('simLock');
  const workspace = $('simWorkspace');
  const accessForm = $('simAccessForm');
  const accessKey = $('simAccessKey');
  const accessStatus = $('simAccessStatus');
  const messageForm = $('simMessageForm');
  const messageInput = $('simMessage');
  const messageStatus = $('simMessageStatus');
  const transcript = $('simTranscript');
  const chips = $('simChips');
  let conversation = null;

  function text(value, fallback = '') {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
  }

  function getSession(key) { try { return sessionStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function setSession(key, value) { try { sessionStorage.setItem(key, String(value)); return true; } catch (_) { return false; } }
  function removeSession(key) { try { sessionStorage.removeItem(key); } catch (_) {} }
  function opaqueId() {
    if (crypto?.randomUUID) return `sms-sim-${crypto.randomUUID()}`;
    return `sms-sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
  function messageId() {
    if (crypto?.randomUUID) return `sim-msg-${crypto.randomUUID()}`;
    return `sim-msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
  function token() { return text(getSession(TOKEN_KEY)); }
  function headers(json) {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(json ? { 'Content-Type': 'application/json' } : {})
    };
  }
  async function parse(response) {
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (response.ok) return body || { ok: true };
    const error = new Error(text(body?.error?.message, `Request failed (${response.status}).`));
    error.code = text(body?.error?.code, 'request_failed');
    error.status = response.status;
    throw error;
  }
  async function apiAt(endpoint, method, payload, query) {
    const response = await fetch(`${endpoint}${query || ''}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: headers(Boolean(payload)),
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    return parse(response);
  }
  function api(method, payload, query) { return apiAt(ENDPOINT, method, payload, query); }
  function status(node, message, isError) {
    node.textContent = message || '';
    node.classList.toggle('is-error', Boolean(isError));
  }
  function label(value) { return text(value).replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
  function phone(value) {
    const digits = text(value).replace(/\D/g, '');
    return digits.length === 11 ? `+${digits[0]} ${digits.slice(1,4)}-${digits.slice(4,7)}-${digits.slice(7)}` : text(value);
  }
  function renderTranscript(items) {
    transcript.innerHTML = '';
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'sim-empty';
      empty.textContent = 'Start the simulation or send any fictional message. The engine will return the exact deterministic reply for the current state.';
      transcript.appendChild(empty);
      return;
    }
    list.forEach(item => {
      const bubble = document.createElement('div');
      bubble.className = `sim-bubble sim-bubble--${item.direction === 'inbound' ? 'inbound' : 'outbound'}`;
      bubble.textContent = text(item.body);
      const meta = document.createElement('small');
      meta.textContent = `${item.direction === 'inbound' ? 'Test prospect' : item.kind === 'operator' ? 'Operator state' : '408FARMERS automation'} · ${label(item.stateAfter)}`;
      bubble.appendChild(meta);
      transcript.appendChild(bubble);
    });
    transcript.scrollTop = transcript.scrollHeight;
  }
  function suggestions(state) {
    return ({
      new: ['Hello'],
      intent_requested: ['1', 'I am buying a home', 'RUSH', '2', '3', '4', 'HELP', 'DYLAN'],
      buyer_address_requested: ['123 Test Street, San Jose, CA 95118', 'RUSH', 'HELP', 'DYLAN'],
      buyer_closing_date_requested: ['2026-09-15', 'next Friday', 'this week', 'RUSH', 'HELP'],
      buyer_occupancy_requested: ['1', '2', '3', '4', 'RUSH', 'HELP'],
      buyer_bundle_requested: ['YES', 'NO', 'RUSH', 'HELP'],
      coveragefit_ready: ['HELP', 'RESTART', 'DYLAN'],
      awaiting_producer: ['HELP', 'RESTART', 'START'],
      human_takeover: ['HELP', 'RESTART'],
      opted_out: ['START']
    })[state] || ['RESTART', 'HELP'];
  }
  function renderChips(state) {
    chips.innerHTML = '';
    suggestions(state).forEach(value => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sim-chip';
      button.textContent = value;
      button.addEventListener('click', () => { messageInput.value = value; messageInput.focus(); });
      chips.appendChild(button);
    });
  }
  function render(current) {
    conversation = current;
    $('simState').textContent = label(current?.state || 'new');
    $('simConversationId').textContent = text(current?.id, '—');
    $('simTestPhone').textContent = phone(current?.testPhone || TEST_PHONE);
    $('simIntent').textContent = current?.intent ? label(current.intent) : 'Not selected';
    $('simInvalidAttempts').textContent = String(Number(current?.invalidIntentAttempts) || 0);
    $('simLastCommand').textContent = current?.lastCommand ? label(current.lastCommand) : 'None';
    $('simAddress').textContent = text(current?.answers?.propertyAddress, 'Not captured');
    $('simClosing').textContent = text(current?.answers?.closingDateDisplay || current?.answers?.closingDateRaw || current?.answers?.closingDate, 'Not captured');
    $('simOccupancy').textContent = current?.answers?.occupancy ? label(current.answers.occupancy) : 'Not captured';
    $('simBundle').textContent = typeof current?.answers?.autoReview === 'boolean' ? (current.answers.autoReview ? 'Yes' : 'No') : 'Not captured';
    $('simPriority').textContent = current?.answers?.priority === 'rush' ? 'Rush / time-sensitive' : 'Standard';
    const partnerName = text(current?.attribution?.partnerName, 'Direct / no partner captured');
    const partnerNode = $('simPartner');
    if (partnerNode) partnerNode.textContent = partnerName;
    const summaryNode = $('simProducerSummary');
    if (summaryNode) {
      const closing = text(current?.answers?.closingDateDisplay || current?.answers?.closingDateRaw || current?.answers?.closingDate, 'Not captured');
      const occupancy = current?.answers?.occupancy ? label(current.answers.occupancy) : 'Not captured';
      const autoReview = typeof current?.answers?.autoReview === 'boolean' ? (current.answers.autoReview ? 'Yes' : 'No') : 'Not captured';
      summaryNode.textContent = [
        'NEW 408FARMERS BUYER', '',
        `Buyer: ${phone(current?.testPhone || TEST_PHONE)}`,
        `Referred by: ${partnerName}`,
        `Property: ${text(current?.answers?.propertyAddress, 'Not captured')}`,
        `Closing: ${closing}`,
        `Occupancy: ${occupancy}`,
        `Auto review: ${autoReview}`,
        `Priority: ${current?.answers?.priority === 'rush' ? 'RUSH / time-sensitive' : 'Standard'}`,
        `CoverageFit: ${current?.handoff?.url ? 'Link delivered / available' : 'Not delivered'}`
      ].join('\n');
    }
    const handoffNode = $('simHandoff');
    if (handoffNode) {
      handoffNode.textContent = '';
      if (current?.handoff?.url) {
        const link = document.createElement('a');
        link.href = current.handoff.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open secure continuation';
        handoffNode.appendChild(link);
      } else handoffNode.textContent = 'Not created';
    }
    renderTranscript(current?.transcript);
    renderChips(current?.state || 'new');
  }
  async function createOrRestart() {
    const id = text(getSession(CONVERSATION_KEY), opaqueId());
    setSession(CONVERSATION_KEY, id);
    const body = await api('POST', { conversationId: id, testPhone: TEST_PHONE, action: 'restart' });
    render(body.conversation);
  }
  async function load() {
    const id = text(getSession(CONVERSATION_KEY));
    if (!id) return createOrRestart();
    try {
      const body = await api('GET', null, `?conversation_id=${encodeURIComponent(id)}`);
      render(body.conversation);
    } catch (error) {
      if (error.status === 404) return createOrRestart();
      throw error;
    }
  }
  function renderRingCentralStatus(current) {
    const state = $('rcConnectionState');
    const missing = Array.isArray(current?.missing) ? current.missing : [];
    $('rcEnvironment').textContent = label(current?.environment || 'not configured');
    $('rcFromNumber').textContent = text(current?.fromNumber, 'Not configured');
    $('rcSmsCapability').textContent = current?.phoneNumber?.smsSender ? 'Available' : current?.phoneNumber?.found ? 'Unavailable' : 'Not verified';
    $('rcWebhookStatus').textContent = current?.subscription ? `${label(current.subscription.status || 'active')} · ${text(current.subscription.expirationTime, 'expiration unavailable')}` : 'No active subscription found';
    const maintenance = current?.maintenance;
    $('rcMaintenanceStatus').textContent = maintenance?.checkedAt
      ? `${label(maintenance.status || 'checked')} · ${label(maintenance.action || 'checked')} · ${maintenance.checkedAt}`
      : 'Awaiting first scheduled check';
    if (current?.error) {
      state.textContent = 'Connection issue';
      state.dataset.state = 'error';
      status($('rcConnectionMessage'), current.error.message, true);
    } else if (!current?.configured) {
      state.textContent = 'Configuration required';
      state.dataset.state = 'warning';
      status($('rcConnectionMessage'), missing.length ? `Add ${missing.length} required server environment variable${missing.length === 1 ? '' : 's'}.` : 'RingCentral is not configured.', false);
    } else if (current?.connected) {
      state.textContent = 'Connected';
      state.dataset.state = 'connected';
      status($('rcConnectionMessage'), 'The phone number supports SMS and the inbound webhook subscription is active.');
    } else if (current?.senderReady) {
      state.textContent = current?.subscriptionHealth?.state === 'blacklisted' ? 'Webhook blacklisted' : 'Webhook unavailable';
      state.dataset.state = 'warning';
      status($('rcConnectionMessage'), text(current?.subscriptionHealth?.reason, 'The sender is ready, but the inbound SMS webhook is not active.'), current?.subscriptionHealth?.state === 'blacklisted');
    } else {
      state.textContent = 'Sender not ready';
      state.dataset.state = 'warning';
      status($('rcConnectionMessage'), 'Confirm the temporary number is assigned to this RingCentral extension with SmsSender capability.');
    }
    $('rcCreateSubscription').disabled = !current?.configured || !current?.senderReady;
  }
  async function checkRingCentralConnection(showProgress = true) {
    if (showProgress) status($('rcConnectionMessage'), 'Checking RingCentral…');
    const body = await apiAt(RC_STATUS_ENDPOINT, 'GET');
    renderRingCentralStatus(body.status || {});
    return body.status || {};
  }
  async function createRingCentralSubscription() {
    const button = $('rcCreateSubscription');
    button.disabled = true;
    status($('rcConnectionMessage'), 'Creating or renewing the RingCentral webhook…');
    try {
      const body = await apiAt(RC_SUBSCRIPTION_ENDPOINT, 'POST', {});
      status($('rcConnectionMessage'), body.created ? 'Webhook created. Running a fresh connection check…' : 'Webhook renewed. Running a fresh connection check…');
      await checkRingCentralConnection(false);
    } catch (error) {
      status($('rcConnectionMessage'), error.message, true);
      throw error;
    } finally {
      if ($('rcConnectionState').dataset.state !== 'connected') button.disabled = false;
    }
  }

  function renderProducerQueue(items) {
    const root = $('simProducerQueue');
    if (!root) return;
    root.innerHTML = '';
    if (!Array.isArray(items) || !items.length) {
      const p = document.createElement('p'); p.textContent = 'No live conversations are currently awaiting Dylan or in human takeover.'; root.appendChild(p); return;
    }
    items.slice(0, 12).forEach(item => {
      const card = document.createElement('article'); card.className = 'sim-live-item';
      const pre = document.createElement('pre'); pre.textContent = text(item?.producerSummary?.text, 'Summary unavailable'); card.appendChild(pre);
      const actions = document.createElement('div'); actions.className = 'sim-live-actions';
      [['pause','Pause'],['resume','Resume'],['resend_handoff','Resend link'],['complete','Complete'],['not_proceeding','Not proceeding']].forEach(([action,labelText]) => {
        const button = document.createElement('button'); button.type='button'; button.className='sim-button sim-button--secondary'; button.textContent=labelText;
        button.addEventListener('click', async () => {
          button.disabled=true; status($('simProducerQueueStatus'), `Applying ${labelText.toLowerCase()}…`);
          try { await apiAt(PRODUCER_ENDPOINT,'POST',{conversationId:item.id,action}); await loadProducerQueue(); status($('simProducerQueueStatus'),'Live handoff updated.'); }
          catch(error){ status($('simProducerQueueStatus'),error.message,true); }
          finally { button.disabled=false; }
        });
        actions.appendChild(button);
      });
      card.appendChild(actions); root.appendChild(card);
    });
  }
  async function loadProducerQueue() {
    status($('simProducerQueueStatus'),'Loading live handoffs…');
    const body = await apiAt(PRODUCER_ENDPOINT,'GET');
    renderProducerQueue(body.conversations || []);
    status($('simProducerQueueStatus'), body.count ? `${body.count} live handoff${body.count===1?'':'s'} loaded.` : 'No live handoffs waiting.');
    return body;
  }

  async function unlock(candidate) {
    if (text(candidate).length < 24) throw new Error('Enter the full producer access key.');
    setSession(TOKEN_KEY, candidate);
    await load();
    await checkRingCentralConnection(false).catch(error => status($('rcConnectionMessage'), error.message, true));
    await loadProducerQueue().catch(error => status($('simProducerQueueStatus'), error.message, true));
    lock.hidden = true;
    workspace.hidden = false;
    messageInput.focus();
  }

  accessForm.addEventListener('submit', async event => {
    event.preventDefault();
    status(accessStatus, 'Connecting…');
    try { await unlock(accessKey.value); status(accessStatus, ''); }
    catch (error) { removeSession(TOKEN_KEY); status(accessStatus, error.message, true); }
  });

  messageForm.addEventListener('submit', async event => {
    event.preventDefault();
    const bodyText = text(messageInput.value);
    if (!bodyText || !conversation?.id) return;
    messageInput.disabled = true;
    status(messageStatus, 'Processing test message…');
    try {
      const body = await api('POST', { conversationId: conversation.id, testPhone: TEST_PHONE, messageId: messageId(), body: bodyText });
      messageInput.value = '';
      render(body.conversation);
      status(messageStatus, body.deduped ? 'Duplicate message ignored.' : 'State updated and reply generated.');
    } catch (error) { status(messageStatus, error.message, true); }
    finally { messageInput.disabled = false; messageInput.focus(); }
  });

  document.querySelectorAll('[data-sim-action]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!conversation?.id) return;
      status(messageStatus, 'Updating simulator state…');
      try {
        const body = await api('POST', { conversationId: conversation.id, testPhone: TEST_PHONE, action: button.dataset.simAction });
        render(body.conversation);
        status(messageStatus, 'Simulator state updated.');
      } catch (error) { status(messageStatus, error.message, true); }
    });
  });


  $('rcCheckConnection').addEventListener('click', async () => {
    $('rcCheckConnection').disabled = true;
    try { await checkRingCentralConnection(true); }
    catch (error) { status($('rcConnectionMessage'), error.message, true); }
    finally { $('rcCheckConnection').disabled = false; }
  });
  $('rcCreateSubscription').addEventListener('click', () => createRingCentralSubscription().catch(() => {}));
  $('simRefreshProducerQueue').addEventListener('click', () => loadProducerQueue().catch(error => status($('simProducerQueueStatus'), error.message, true)));

  $('simDisconnect').addEventListener('click', () => {
    removeSession(TOKEN_KEY);
    workspace.hidden = true;
    lock.hidden = false;
    accessKey.value = '';
    status(accessStatus, 'Simulator locked.');
  });

  const saved = token();
  if (saved.length >= 24) unlock(saved).catch(() => removeSession(TOKEN_KEY));
})();
