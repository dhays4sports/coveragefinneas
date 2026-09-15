(() => {
  'use strict';
  const KEY = 'coveragefit.producerInbox.token';
  const ENDPOINT = '/api/sms/operations/';
  const PRODUCER_ENDPOINT = '/api/sms/producer/';
  const CALLBACK_ENDPOINT = '/api/sms/callback/';
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  let access = sessionStorage.getItem(KEY) || '';

  const status = (id, message, bad = false) => {
    const element = $(id);
    if (!element) return;
    element.textContent = message || '';
    element.dataset.error = bad ? 'true' : 'false';
  };

  async function api(method = 'GET', body = null) {
    const params = new URLSearchParams();
    if (method === 'GET' && $('opsFilter')?.value) params.set('status', $('opsFilter').value);
    const linkedConversation = new URL(location.href).searchParams.get('conversation_id');
    if (method === 'GET' && linkedConversation) params.set('conversation_id', linkedConversation);
    const url = `${ENDPOINT}${params.size ? `?${params}` : ''}`;
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : null
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data?.error?.message || 'Operations request failed.');
    return data;
  }

  const card = (label, value) => `<div class="sim-card"><span class="sim-card__label">${escapeHtml(label)}</span><h2 style="margin:6px 0 0">${escapeHtml(value || 0)}</h2></div>`;
  const formatDate = value => {
    if (!value) return '—';
    try { return new Date(value).toLocaleString(); } catch (_) { return value; }
  };
  const alertText = alert => alert
    ? `${String(alert.type || 'alert').replaceAll('_', ' ')} · ${alert.state}${alert.sentAt ? ` ${formatDate(alert.sentAt)}` : ''}`
    : 'No actionable alert triggered';

  const workflowOptions = [
    ['coveragefit_homebuyer', 'CoverageFit · Homebuyer'],
    ['coveragefit_home_review', 'CoverageFit · Home review'],
    ['coveragefit_bundle', 'CoverageFit · Home + auto'],
    ['coveragefit_auto', 'CoverageFit · Auto'],
    ['coveragefit_life', 'CoverageFit · Life'],
    ['coveragefit_business', 'CoverageFit · Business'],
    ['coveragefit_other', 'CoverageFit · Other'],
    ['quote_followup', 'Quote follow-up'],
    ['service', 'Service'],
    ['appointment', 'Appointment'],
    ['life', 'Life'],
    ['commercial', 'Commercial']
  ];

  function continuityControls(conversation) {
    const options = workflowOptions.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
    const id = escapeHtml(conversation.id);
    return `<div class="sim-actions sim-actions--inline" data-continuity-controls="${id}" style="margin-top:12px;flex-wrap:wrap">
      <button type="button" class="sim-button sim-button--secondary" data-producer-action="take_ownership" data-conversation-id="${id}">Take ownership</button>
      <button type="button" class="sim-button sim-button--secondary" data-producer-action="return_to_coveragefit" data-conversation-id="${id}">Return to CoverageFit</button>
      <button type="button" class="sim-button sim-button--secondary" data-producer-action="pause_automation" data-conversation-id="${id}">Pause automation</button>
      <button type="button" class="sim-button sim-button--secondary" data-producer-action="resume_workflow" data-conversation-id="${id}">Resume workflow</button>
      <button type="button" class="sim-button sim-button--secondary" data-producer-action="close_workflow" data-conversation-id="${id}">Close workflow</button>
      <label style="display:flex;gap:8px;align-items:center"><span class="sim-card__label">New workflow</span><select data-workflow-select="${id}">${options}</select></label>
      <button type="button" class="sim-button sim-button--secondary" data-producer-action="start_workflow" data-conversation-id="${id}">Start new workflow</button>
    </div>`;
  }

  function render(data) {
    const order = ['new', 'active', 'awaiting_dylan', 'human_takeover', 'link_delivered', 'coveragefit_started', 'coveragefit_completed', 'failed', 'stale', 'opted_out', 'completed'];
    $('opsCounts').innerHTML = order.map(key => card(key.replaceAll('_', ' '), data.counts?.[key] || 0)).join('');
    $('opsConversations').innerHTML = data.conversations?.length
      ? data.conversations.map(conversation => {
          const orchestration = conversation.orchestration || {};
          const replyContext = orchestration.replyContext;
          const replyLine = replyContext
            ? `${replyContext.context || 'context'} → ${replyContext.route || 'producer'} until ${formatDate(replyContext.expiresAt)}`
            : 'None';
          return `<article class="sim-live-item"><div><strong>${escapeHtml(conversation.status.replaceAll('_', ' '))}</strong> · ${escapeHtml(conversation.contact)} · ${escapeHtml(conversation.intent || 'intent pending')}</div><div>${escapeHtml(conversation.partnerName || 'Direct')} · ${escapeHtml(conversation.priority)} · updated ${escapeHtml(formatDate(conversation.updatedAt))}</div><div><small>Owner: ${escapeHtml(orchestration.owner || 'none')} · Previous: ${escapeHtml(orchestration.previousOwner || 'none')} · Workflow: ${escapeHtml((orchestration.workflowType || 'none').replaceAll('_', ' '))} · Automation: ${escapeHtml((orchestration.automationMode || 'assist_only').replaceAll('_', ' '))}</small></div><div><small>Workflow state: ${escapeHtml((orchestration.workflowState || conversation.state || 'new').replaceAll('_', ' '))} · Episodes: ${escapeHtml(orchestration.workflowEpisodeCount || 0)} · Producer alert: ${escapeHtml(alertText(conversation.producerAlert))}</small></div><div><small>Reply context: ${escapeHtml(replyLine)}</small></div><div><small>Consent: ${escapeHtml(conversation.consent?.status || 'active')} · Provider: ${escapeHtml(conversation.consent?.providerStatus || 'unknown')} · Last command: ${escapeHtml(conversation.consent?.lastCommand || '—')}</small></div><div><small>Last outbound: ${escapeHtml(conversation.outboundContext?.origin || '—')} → ${escapeHtml(conversation.outboundContext?.replyRoute || '—')} · ${escapeHtml((conversation.outboundContext?.ownershipEffect || '—').replaceAll('_', ' '))}</small></div><pre>${escapeHtml(conversation.producerSummary?.text || 'Summary unavailable')}</pre>${continuityControls(conversation)}</article>`;
        }).join('')
      : '<p>No conversations match this view.</p>';

    const certification = data.certification || {};
    const certificationRuntime = certification.runtime || {};
    const certificationConfig = certificationRuntime.configuration || {};
    const certificationEvidence = certification.evidence || {};
    const certificationRetries = certificationEvidence.retries || {};
    $('opsCertification').innerHTML = `<div><dt>Status</dt><dd>${escapeHtml((certification.status || 'not evaluated').replaceAll('_', ' '))}</dd></div><div><dt>Application layer</dt><dd>${escapeHtml(certification.applicationCertification || 'unknown')}</dd></div><div><dt>Carrier layer</dt><dd>${escapeHtml((certification.carrierCertification || 'pending').replaceAll('_', ' '))}</dd></div><div><dt>Runtime build sync</dt><dd>${certificationRuntime.operationsBuildSynchronized ? 'Certified' : 'Needs attention'}</dd></div><div><dt>Runtime configuration</dt><dd>${certificationConfig.complete ? 'Complete' : `Missing ${escapeHtml((certificationConfig.missing || []).join(', ') || 'bindings')}`}</dd></div><div><dt>Webhook evidence</dt><dd>${certificationEvidence.webhook?.observed ? 'Observed' : 'Not observed yet'}</dd></div><div><dt>Retry state</dt><dd>${escapeHtml(certificationRetries.pending || 0)} pending · ${escapeHtml(certificationRetries.failed || 0)} failed · ${escapeHtml(certificationRetries.suppressed || 0)} suppressed</dd></div>`;

    const health = data.health || {};
    $('opsHealth').innerHTML = `<div><dt>Last event</dt><dd>${escapeHtml(formatDate(health.lastEventAt))}</dd></div><div><dt>Last success</dt><dd>${escapeHtml(formatDate(health.lastSuccessAt))}</dd></div><div><dt>Last failure</dt><dd>${escapeHtml(formatDate(health.lastFailureAt))}</dd></div><div><dt>Success / failure</dt><dd>${escapeHtml(health.successCount || 0)} / ${escapeHtml(health.failureCount || 0)}</dd></div><div><dt>Stale after</dt><dd>${escapeHtml(data.config?.staleHours)} hours</dd></div><div><dt>Retention</dt><dd>${escapeHtml(data.config?.retentionDays)} days</dd></div>`;
    const alerts = data.config?.producerAlerts || {};
    $('opsAlertHealth').innerHTML = `<div><dt>Enabled</dt><dd>${alerts.enabled ? 'Yes' : 'No'}</dd></div><div><dt>Configured</dt><dd>${alerts.configured ? 'Ready' : 'Needs setup'}</dd></div><div><dt>Missing</dt><dd>${escapeHtml(alerts.missing?.join(', ') || 'Nothing')}</dd></div><div><dt>Privacy</dt><dd>No lead PII in email</dd></div>`;
    $('opsRetries').innerHTML = data.retries?.length ? data.retries.map(item => `<div class="sim-live-item"><strong>${escapeHtml(item.status)}</strong> · attempts ${escapeHtml(item.attempts)}<br><small>${escapeHtml(item.lastError || formatDate(item.updatedAt))}</small></div>`).join('') : '<p>No retry jobs.</p>';
    $('opsCampaigns').innerHTML = data.campaigns?.length ? data.campaigns.map(item => `<div class="sim-live-item"><strong>${escapeHtml(item.partner || item.key)}</strong><br>${escapeHtml(item.total)} conversations · ${escapeHtml(item.started)} started · ${escapeHtml(item.completed)} completed · ${escapeHtml(item.rush)} rush</div>`).join('') : '<p>No campaign activity yet.</p>';
    $('opsAudit').innerHTML = data.audit?.length ? data.audit.slice(0, 30).map(item => `<div class="sim-live-item"><strong>${escapeHtml(item.type)}</strong> · ${escapeHtml(formatDate(item.at))}<br><small>${escapeHtml(item.detail)}</small></div>`).join('') : '<p>No audit events yet.</p>';
  }

  async function producerAction(conversationId, actionName, extra = {}) {
    status('opsActionStatus', 'Updating conversation…');
    const response = await fetch(PRODUCER_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, action: actionName, ...extra })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data?.error?.message || 'Conversation update failed.');
    status('opsActionStatus', `${actionName.replaceAll('_', ' ')} complete.`);
    await load();
    return data;
  }

  async function load() {
    try {
      render(await api());
      $('opsLock').hidden = true;
      $('opsWorkspace').hidden = false;
      status('opsAccessStatus', '');
    } catch (cause) {
      $('opsLock').hidden = false;
      $('opsWorkspace').hidden = true;
      status('opsAccessStatus', cause.message, true);
    }
  }

  async function action(name) {
    const target = name === 'test_producer_alert' ? 'opsAlertStatus' : 'opsActionStatus';
    status(target, 'Working…');
    try {
      const data = await api('POST', { action: name });
      const message = name === 'retry_pending'
        ? `Processed ${data.processed}; sent ${data.sent}; pending ${data.pending}; suppressed ${data.suppressed || 0}; failed ${data.failed}.`
        : name === 'cleanup'
          ? `Deleted ${data.deleted} expired operational records.`
          : data.alert?.state === 'sent'
            ? 'Privacy-safe test alert sent.'
            : `Test alert ${data.alert?.state || 'finished'}${data.alert?.reason ? `: ${data.alert.reason}` : '.'}`;
      status(target, message, data.alert && data.alert.state !== 'sent');
      await load();
    } catch (cause) {
      status(target, cause.message, true);
    }
  }

  $('opsAccessForm').addEventListener('submit', event => {
    event.preventDefault();
    access = $('opsAccessKey').value.trim();
    sessionStorage.setItem(KEY, access);
    load();
  });
  $('opsRefresh').addEventListener('click', load);
  $('opsFilter').addEventListener('change', load);
  $('opsRetry').addEventListener('click', () => action('retry_pending'));
  $('opsCleanup').addEventListener('click', () => action('cleanup'));
  $('opsTestAlert').addEventListener('click', () => action('test_producer_alert'));
  $('callbackStartForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    status('callbackStartStatus', 'Sending callback request…');
    try {
      const response = await fetch(CALLBACK_ENDPOINT, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_sequence', firstName: $('callbackFirstName').value,
          phone: $('callbackPhone').value, productType: $('callbackProduct').value,
          callAttempted: $('callbackAttempted').checked
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data?.error?.message || 'Callback request failed.');
      status('callbackStartStatus', `Callback request sent. Next follow-up: ${formatDate(data.sequence?.nextSendAt)}.`);
      $('callbackStartForm').reset();
      await load();
    } catch (cause) { status('callbackStartStatus', cause.message, true); }
    finally { if (submit) submit.disabled = false; }
  });
  $('opsConversations').addEventListener('click', async event => {
    const button = event.target.closest('[data-producer-action]');
    if (!button) return;
    const conversationId = button.dataset.conversationId || '';
    const actionName = button.dataset.producerAction || '';
    const extra = {};
    if (actionName === 'start_workflow') {
      const controls = button.closest('[data-continuity-controls]');
      const select = controls?.querySelector('[data-workflow-select]');
      extra.workflowType = select?.value || '';
    }
    button.disabled = true;
    try { await producerAction(conversationId, actionName, extra); }
    catch (cause) { status('opsActionStatus', cause.message, true); }
    finally { button.disabled = false; }
  });
  if (access) load();
})();
