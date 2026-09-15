(function () {
  'use strict';

  if (typeof window.__CoverageFitAgentWorkspaceTeardown === 'function') {
    window.__CoverageFitAgentWorkspaceTeardown('reinitialize');
  }

  const byId = id => document.getElementById(id);
  const data = window.CoverageFitWorkspaceData;
  const commandCenter = window.CoverageFitConsultationCommandCenter;
  const producerConsumerStory = window.CoverageFitProducerConsumerStory;
  const planner = window.CoverageFitConversationPlanner;
  const recommendationBuilder = window.CoverageFitRecommendationBuilder;
  const explanationAssist = window.CoverageFitExplanationAssist;
  const consultationProgress = window.CoverageFitConsultationProgress;
  const producerPilotReadiness = window.CoverageFitProducerPilotReadiness;
  const consultationCompletion = window.CoverageFitConsultationCompletion;
  const checklistEngine = window.CoverageFitConsultationChecklist;
  const remoteInbox = window.CoverageFitRemoteConsultations;
  const pipelineSummary = window.CoverageFitConsultationPipelineSummary;
  let remoteInboxSyncing = false;
  const remoteStatusPending = new Set();
  const followUpPending = new Set();
  const notePending = new Set();
  const dispositionPending = new Set();
  const recommendationPlanPending = new Set();
  const completionPending = new Set();
  let checklistSyncTimer = null;
  let checklistSyncQueue = Promise.resolve();
  let pendingChecklistProgress = null;
  let checklistPersistenceState = 'device';
  let lastConsultationQueueSignature = '';
  let lastPipelineSummarySignature = '';
  let pipelineExportObjectUrl = '';
  let pipelineExportRevokeTimer = null;
  let lastFollowUpFormSignature = '';
  let followUpFeedback = null;
  let noteFeedback = null;
  let dispositionFeedback = null;
  let recommendationPlanFeedback = null;
  let completionFeedback = null;
  let lastDispositionFormSignature = '';
  let lastCompletionFormSignature = '';
  let lastActivitySignature = '';
  let currentConversationPlan = null;
  let currentRecommendationPlan = null;
  let currentWorkspaceSnapshot = null;
  const explanationDisclosureState = new Map();
  let checklistShellState = 'loading';
  let lastAnnouncedChecklistSignature = '';
  let pendingFocusItemId = '';
  let pendingFocusTimelineItemId = '';
  let mobileSidebarPreference = null;
  let previousChecklistMotionState = new Map();
  let checklistHasRendered = false;
  let previousTimelineMotionState = new Map();
  let timelineHasRendered = false;
  let previousProgressMotionState = null;
  let workspaceHasRendered = false;
  let loadingExitTimer = null;
  let surfaceMotionTimer = null;
  let lastChecklistStructureSignature = '';
  let lastTimelineStructureSignature = '';
  let lastGuidedQuestionSignature = '';
  let lastRecommendationBuilderSignature = '';
  let lastConsultationProgressSignature = '';
  let lastProducerPilotReadinessSignature = '';
  let lastPropertySignature = '';
  let lastRecommendationSignature = '';
  let lastEvidenceHandoffSignature = '';
  let lastConsultationRecordsSignature = '';
  let workspaceDisposed = false;
  let workspaceRenderInProgress = false;
  let headerScrolled = false;
  let activeSnapshotViewport = '';
  let lastMobileFocusStageId = '';
  let activeWorkspaceView = 'inbox';
  let activeInboxQuickFilter = 'all';
  let remoteInboxExpandedByUser = false;
  let consultationFocusModeEnabled = true;
  let consultationFocusStageId = '';
  let consultationFocusStageLocked = false;
  let consultationFocusRecordId = '';
  let currentConsultationProgressModel = null;
  const pilotOutputConfirmations = new Set();
  const WORKSPACE_VIEWS = Object.freeze(['today', 'inbox', 'consultation', 'pipeline']);
  const CONSULTATION_FOCUS_STAGE_ORDER = Object.freeze(['understand', 'verify', 'discuss', 'recommend', 'decide', 'next-step']);
  const CONSULTATION_FOCUS_SURFACES = Object.freeze([
    { selector: '#consultationCommandCenter', stages: ['understand', 'verify'] },
    { selector: '.consultation-command-center__orientation', stages: ['understand'] },
    { selector: '#consultationProspectStory', stages: ['understand'] },
    { selector: '#consultationCommandPriorities', stages: ['understand'] },
    { selector: '#consultationCommandVerify', stages: ['verify'] },
    { selector: '.consultation-command-action', stages: ['understand', 'verify'] },
    { selector: '#consultationDocumentStory', stages: ['understand', 'verify'] },
    { selector: '.consultation-phase--before', stages: ['understand', 'verify'] },
    { selector: '.consultation-before-grid .workspace-card--summary', stages: ['understand'] },
    { selector: '#evidenceHandoffCard', stages: ['verify'] },
    { selector: '.consultation-before-grid .workspace-card--recommendations', stages: ['understand'] },
    { selector: '.consultation-detail-grid', stages: ['understand', 'verify'] },
    { selector: '.consultation-phase--during', stages: ['discuss', 'recommend'] },
    { selector: '#consultationProgress', stages: [] },
    { selector: '#guidedQuestionsPanel', stages: ['discuss'] },
    { selector: '.workspace-card--consultation-flow', stages: ['discuss'] },
    { selector: '#recommendationBuilder', stages: ['recommend'] },
    { selector: '.consultation-phase--after', stages: ['decide', 'next-step'] },
    { selector: '#consultationCompletion', stages: ['decide', 'next-step'] },
    { selector: '#consultationDispositionForm', stages: ['decide'] },
    { selector: '#consultationFollowUpForm', stages: ['next-step'] },
    { selector: '#consultationNotesActivity', stages: ['next-step'] }
  ]);
  const lifecycleCleanups = [];
  const lifecycleStats = { listeners: 0, subscriptions: 0, teardowns: 0 };

  function registerCleanup(callback, type) {
    if (typeof callback !== 'function') return function () {};
    let active = true;
    lifecycleCleanups.push(() => {
      if (!active) return;
      active = false;
      callback();
      if (type === 'listener') lifecycleStats.listeners = Math.max(0, lifecycleStats.listeners - 1);
      if (type === 'subscription') lifecycleStats.subscriptions = Math.max(0, lifecycleStats.subscriptions - 1);
    });
    if (type === 'listener') lifecycleStats.listeners += 1;
    if (type === 'subscription') lifecycleStats.subscriptions += 1;
    return lifecycleCleanups[lifecycleCleanups.length - 1];
  }

  function listen(target, eventName, handler, options) {
    if (!target?.addEventListener || typeof handler !== 'function') return function () {};
    target.addEventListener(eventName, handler, options);
    return registerCleanup(() => target.removeEventListener?.(eventName, handler, options), 'listener');
  }

  function clearPipelineExportObjectUrl() {
    if (!pipelineExportObjectUrl) return false;
    try { (window.URL || window.webkitURL)?.revokeObjectURL?.(pipelineExportObjectUrl); } catch (_) {}
    pipelineExportObjectUrl = '';
    return true;
  }

  function clearWorkspaceTimers() {
    if (loadingExitTimer !== null && typeof window.clearTimeout === 'function') window.clearTimeout(loadingExitTimer);
    if (surfaceMotionTimer !== null && typeof window.clearTimeout === 'function') window.clearTimeout(surfaceMotionTimer);
    if (pipelineExportRevokeTimer !== null && typeof window.clearTimeout === 'function') window.clearTimeout(pipelineExportRevokeTimer);
    if (checklistSyncTimer !== null && typeof window.clearTimeout === 'function') window.clearTimeout(checklistSyncTimer);
    loadingExitTimer = null;
    surfaceMotionTimer = null;
    pipelineExportRevokeTimer = null;
    checklistSyncTimer = null;
    clearPipelineExportObjectUrl();
  }

  function teardownWorkspace(reason) {
    if (workspaceDisposed) return false;
    workspaceDisposed = true;
    clearWorkspaceTimers();
    while (lifecycleCleanups.length) {
      const cleanup = lifecycleCleanups.pop();
      try { cleanup(); } catch (error) { /* teardown remains best-effort */ }
    }
    lifecycleStats.teardowns += 1;
    if (window.__CoverageFitAgentWorkspaceTeardown === teardownWorkspace) {
      window.__CoverageFitAgentWorkspaceTeardown = null;
    }
    return reason || true;
  }

  window.__CoverageFitAgentWorkspaceTeardown = teardownWorkspace;
  const performanceStats = {
    checklistRenders: 0,
    checklistSkips: 0,
    timelineRenders: 0,
    timelineSkips: 0,
    progressUpdates: 0,
    propertyRenders: 0,
    propertySkips: 0,
    recommendationRenders: 0,
    recommendationSkips: 0,
    evidenceHandoffRenders: 0,
    evidenceHandoffSkips: 0,
    lastEventDurationMs: 0
  };

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || 'Not provided';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;'
    })[character]);
  }

  function stableSignature(value) {
    try {
      return JSON.stringify(value, (key, item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return Object.keys(item).sort().reduce((ordered, name) => {
            ordered[name] = item[name];
            return ordered;
          }, {});
        }
        return item;
      });
    } catch (error) {
      return String(value);
    }
  }

  function nowMs() {
    return window.performance?.now?.() ?? Date.now();
  }


  function prefersReducedMotion() {
    return Boolean(window.CoverageFitWorkspaceMotion?.prefersReducedMotion?.());
  }

  function safeScrollIntoView(element, options) {
    if (!element?.scrollIntoView) return false;
    const settings = { block: 'nearest', inline: 'nearest', ...(options || {}) };
    settings.behavior = prefersReducedMotion() ? 'auto' : (settings.behavior || 'smooth');
    try {
      element.scrollIntoView(settings);
      return true;
    } catch (error) {
      try { element.scrollIntoView(); return true; } catch (fallbackError) { return false; }
    }
  }

  function isTypingTarget(target) {
    const tag = String(target?.tagName || '').toLowerCase();
    return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tag));
  }

  function setRefreshBusy(busy) {
    const control = byId('refreshWorkspace');
    if (!control) return;
    control.disabled = Boolean(busy);
    control.setAttribute?.('aria-busy', String(Boolean(busy)));
    control.classList?.toggle?.('is-busy', Boolean(busy));
  }

  function syncStickyHeaderDepth() {
    const header = document.querySelector?.('.workspace-header');
    if (!header) return;
    const scrolled = Number(window.scrollY || window.pageYOffset || 0) > 6;
    if (scrolled === headerScrolled) return;
    headerScrolled = scrolled;
    header.classList?.toggle?.('is-scrolled', scrolled);
  }

  function syncActiveCustomerSnapshotDisclosure() {
    const disclosure = byId('activeCustomerSnapshotDetails');
    if (!disclosure || typeof window.matchMedia !== 'function') return false;
    const viewport = window.matchMedia('(min-width: 1181px)').matches ? 'wide' : 'compact';
    if (viewport !== activeSnapshotViewport) {
      disclosure.open = viewport === 'wide';
      activeSnapshotViewport = viewport;
    }
    return disclosure.open;
  }

  function updateText(element, value) {
    if (!element) return false;
    const next = String(value ?? '');
    if (element.textContent === next) return false;
    element.textContent = next;
    return true;
  }

  function setHidden(element, hidden) {
    if (!element || element.hidden === Boolean(hidden)) return false;
    element.hidden = Boolean(hidden);
    return true;
  }

  function setWorkspaceView(view, options) {
    const next = WORKSPACE_VIEWS.includes(view) ? view : 'inbox';
    const settings = options || {};
    activeWorkspaceView = next;
    WORKSPACE_VIEWS.forEach(name => {
      const suffix = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      const panel = byId(`workspaceView${suffix}`);
      const tab = byId(`workspaceTab${suffix}`);
      const selected = name === next;
      if (panel) panel.hidden = !selected;
      if (tab) {
        tab.setAttribute?.('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }
    });
    if (document.documentElement?.dataset) document.documentElement.dataset.workspaceView = next;
    if (next === 'inbox' && settings.preserveDirectLink !== true) clearConsultationUrl();
    if (settings.focus) {
      const suffix = `${next.charAt(0).toUpperCase()}${next.slice(1)}`;
      byId(`workspaceTab${suffix}`)?.focus?.();
    }
    if (settings.announce) {
      announce(`${next.charAt(0).toUpperCase()}${next.slice(1)} view opened.`);
    }
    if (next === 'consultation' && currentWorkspaceSnapshot) {
      const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
      const selectedSnapshot = typeof data?.getSnapshot === 'function' ? data.getSnapshot() : currentWorkspaceSnapshot;
      const activeId = plainText(selectedSnapshot?.consultation?.id || byId('consultationRecordSelect')?.value || currentWorkspaceSnapshot?.consultation?.id);
      maybeMarkConsultationOpened(activeConsultationRecord(records, activeId));
    }
    return next;
  }

  function handleWorkspaceTabClick(event) {
    const control = event.target.closest?.('[data-workspace-view]');
    if (!control) return;
    setWorkspaceView(plainText(control.dataset.workspaceView), { announce: true });
  }

  function handleWorkspaceTabKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = WORKSPACE_VIEWS.map(name => {
      const suffix = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      return byId(`workspaceTab${suffix}`);
    }).filter(Boolean);
    if (!tabs.length) return;
    const currentIndex = Math.max(0, tabs.indexOf(event.target));
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    event.preventDefault?.();
    const next = tabs[nextIndex];
    setWorkspaceView(plainText(next?.dataset?.workspaceView), { focus: true, announce: true });
  }

  function setCustomerActionLink(id, href, enabled, label) {
    const action = byId(id);
    if (!action) return false;
    action.href = enabled ? href : '#';
    action.setAttribute?.('aria-disabled', enabled ? 'false' : 'true');
    action.classList?.toggle?.('is-disabled', !enabled);
    action.tabIndex = enabled ? 0 : -1;
    action.title = enabled ? label : `${label} unavailable`;
    return enabled;
  }

  function renderCustomerActionHeader(snapshot) {
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const activeId = text(snapshot?.consultation?.id, '');
    const record = activeConsultationRecord(records, activeId);
    const customer = { ...(record?.customer || {}), ...(snapshot?.customer || {}) };
    const name = text(customer.name, 'Homeowner review');
    const propertyAddress = text(customer.propertyAddress || snapshot?.property?.address, 'Property address not provided');
    const reason = text(customer.reviewContext, 'General coverage review');
    const phone = plainText(customer.phone);
    const email = plainText(customer.email);
    const callablePhone = phone.replace(/[^+\d]/g, '');

    updateText(byId('activeCustomerName'), name);
    updateText(byId('mobileConsultationCustomer'), name);
    updateText(byId('activeCustomerProperty'), propertyAddress);
    updateText(byId('activeCustomerReason'), reason);
    updateText(
      byId('activeCustomerReceived'),
      `${record?.createdAt ? `Received ${displayDateTime(record.createdAt)}` : `Assessment ${displayDate(snapshot?.assessment?.createdAt)}`}${record ? ` · ${consultationStageLabel(record)}` : ''}`
    );
    const stage = dispositionDetails(record).stage;
    const stageLabel = consultationStageLabel(record);
    const followUp = followUpDisplay(record);
    const priority = text(record?.assessment?.topPriority || snapshot?.assessment?.topPriority, 'No major priority identified');
    updateText(byId('activeCustomerPriority'), priority);
    const status = byId('activeCustomerStatus');
    updateText(status, stageLabel);
    if (status?.dataset) status.dataset.stage = stage;
    updateText(byId('activeCustomerNextStep'), followUp.state === 'unscheduled' || followUp.state === 'local' ? 'Continue guided consultation' : followUp.text);
    updateText(byId('activeCustomerSnapshotSummary'), `${stageLabel} · ${followUp.state === 'unscheduled' || followUp.state === 'local' ? 'Continue guided consultation' : followUp.text}`);

    setCustomerActionLink('customerCallAction', `tel:${callablePhone}`, Boolean(callablePhone), `Call ${name}`);
    setCustomerActionLink('mobileCallAction', `tel:${callablePhone}`, Boolean(callablePhone), `Call ${name}`);
    setCustomerActionLink('customerTextAction', `sms:${callablePhone}`, Boolean(callablePhone), `Text ${name}`);
    setCustomerActionLink('mobileTextAction', `sms:${callablePhone}`, Boolean(callablePhone), `Text ${name}`);
    setCustomerActionLink('customerEmailAction', `mailto:${email}`, Boolean(email), `Email ${name}`);
    setCustomerActionLink('mobileEmailAction', `mailto:${email}`, Boolean(email), `Email ${name}`);
    const choose = byId('chooseConsultationAction');
    if (choose) {
      choose.disabled = records.length < 2;
      choose.title = records.length < 2 ? 'No other consultation records are available' : 'Open the consultation inbox';
    }
    return Boolean(record || snapshot?.state === 'ready');
  }

  function renderProducerConsumerStory(snapshot, record, checklistState, stage) {
    const region = byId('consultationDocumentStory');
    if (!region || !producerConsumerStory?.build) return null;
    try {
      const model = producerConsumerStory.build(snapshot, record, { stage, checklist: checklistState || null });
      window.CoverageFitAgentWorkspaceProducerConsumerStory = model;
      if (region.dataset) {
        region.dataset.storySource = model.consistency.source;
        region.dataset.completionState = model.completion?.status || 'draft';
      }
      updateText(byId('consultationDocumentStoryWhy'), model.review.reason);
      updateText(byId('consultationDocumentStoryVerify'), model.verification.detailsToConfirm.length
        ? `${model.verification.detailsToConfirm.length} detail${model.verification.detailsToConfirm.length === 1 ? '' : 's'} carried forward`
        : 'No priority confirmation details identified');
      updateText(byId('consultationDocumentStoryRecommendations'), `${Number(model.recommendations.summary?.verified || 0)} confirmed · ${Number(model.recommendations.summary?.undecided || 0)} not decided`);
      updateText(byId('consultationDocumentStoryNext'), model.nextAction.title);
      const priorities = byId('consultationDocumentStoryPriorities');
      if (priorities) priorities.innerHTML = model.priorities.length
        ? model.priorities.map(item => `<li data-story-priority-id="${escapeHtml(item.id)}"><span>${item.rank}</span><strong>${escapeHtml(item.title)}</strong></li>`).join('')
        : '<li class="is-empty">No ranked findings are available.</li>';
      return model;
    } catch (_) {
      window.CoverageFitAgentWorkspaceProducerConsumerStory = null;
      region.hidden = true;
      return null;
    }
  }

  function renderConsultationCommandCenter(snapshot, checklistState) {
    if (!commandCenter || typeof commandCenter.build !== 'function') return false;
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const record = activeConsultationRecord(records, text(snapshot?.consultation?.id, ''));
    const disposition = dispositionDetails(record);
    const model = commandCenter.build(snapshot, { stage: disposition.stage, checklist: checklistState || null });
    window.CoverageFitAgentWorkspaceCommandCenter = model;
    renderProducerConsumerStory(snapshot, record, checklistState, disposition.stage);

    updateText(byId('consultationCommandWhoName'), model.who.name);
    updateText(byId('consultationCommandWhoProperty'), model.who.property);
    updateText(byId('consultationCommandWhyReason'), model.why.reason);
    updateText(byId('consultationCommandWhyDetail'), model.why.detail);
    const status = byId('consultationCommandStatus');
    updateText(status, model.status.label);
    if (status?.dataset) status.dataset.stage = model.status.stage;
    updateText(byId('consultationCommandStatusDetail'), model.status.detail);

    const storyRegion = byId('consultationProspectStory');
    if (storyRegion?.dataset) storyRegion.dataset.storyKind = model.story.kind;
    updateText(byId('consultationProspectStoryNarrative'), model.story.narrative);
    updateText(byId('consultationProspectStoryNote'), model.story.note);
    const storyFacts = byId('consultationProspectStoryFacts');
    if (storyFacts) {
      storyFacts.innerHTML = model.story.facts.map(item => `<li data-kind="${escapeHtml(item.kind)}">
        <span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>
      </li>`).join('');
      storyFacts.hidden = model.story.facts.length === 0;
    }

    updateText(byId('consultationCommandPriorityCount'), `${model.priorities.length} ranked finding${model.priorities.length === 1 ? '' : 's'}`);
    const priorityList = byId('consultationCommandPriorityList');
    if (priorityList) {
      priorityList.innerHTML = model.priorities.length ? model.priorities.map(item => `<li data-finding-type="${escapeHtml(item.findingType)}" data-evidence-quality="${escapeHtml(item.evidenceQuality)}">
        <span aria-hidden="true">${item.rank}</span>
        <div><div class="consultation-priority-finding__meta"><em>${escapeHtml(item.sequenceLabel)}</em><span>${escapeHtml(item.actionLabel)}</span></div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.rationale)}</small></div>
      </li>`).join('') : '<li class="is-empty">No assessment priorities are available. Review the assessment before advising.</li>';
    }

    updateText(byId('consultationCommandVerifyCount'), `${model.verification.totalCount} classified item${model.verification.totalCount === 1 ? '' : 's'}`);
    const verifyList = byId('consultationCommandVerifyList');
    if (verifyList) {
      verifyList.innerHTML = model.verification.groups.map(group => `<li data-verification-state="${escapeHtml(group.id)}">
        <div class="consultation-verification-map__heading"><span aria-hidden="true">${escapeHtml(group.icon)}</span><strong>${escapeHtml(group.label)}</strong><em>${group.count}</em></div>
        <p>${escapeHtml(group.description)}</p>
        <small>${group.preview ? `<b>${escapeHtml(group.preview.source)}:</b> ${escapeHtml(group.preview.title)}${group.preview.detail ? ` · ${escapeHtml(group.preview.detail)}` : ''}` : escapeHtml(group.empty)}</small>
      </li>`).join('');
    }
    updateText(byId('consultationCommandGuardrail'), model.guardrail);
    updateText(byId('consultationCommandActionEyebrow'), model.action.eyebrow);
    updateText(byId('consultationCommandActionTitle'), model.action.title);
    updateText(byId('consultationCommandActionDetail'), model.action.detail);
    const action = byId('consultationCommandAction');
    if (action) {
      action.textContent = model.action.label;
      action.href = model.action.target;
    }
    return true;
  }

  function consultationFocusStateLabel(stage) {
    if (!stage) return 'Upcoming';
    if (stage.state === 'complete') return 'Complete';
    if (stage.state === 'current') return 'Current';
    if (stage.state === 'attention') return 'Needs attention';
    return 'Upcoming';
  }

  function applyConsultationFocusSurfaces(stageId) {
    const grid = byId('workspaceGrid');
    grid?.classList?.toggle?.('is-consultation-focus-mode', consultationFocusModeEnabled);
    if (grid?.dataset) grid.dataset.consultationFocusStage = consultationFocusModeEnabled ? stageId : 'full-record';
    CONSULTATION_FOCUS_SURFACES.forEach(rule => {
      document.querySelectorAll?.(rule.selector)?.forEach(element => {
        const visible = !consultationFocusModeEnabled || rule.stages.includes(stageId);
        element.classList?.toggle?.('is-focus-hidden', !visible);
      });
    });
  }

  function centerMobileFocusStage(control, stageId) {
    if (!control || stageId === lastMobileFocusStageId || !window.matchMedia?.('(max-width: 900px)').matches) return false;
    const nav = control.closest?.('nav');
    if (!nav) return false;
    lastMobileFocusStageId = stageId;
    const left = Math.max(0, Number(control.offsetLeft || 0) - Math.max(0, (Number(nav.clientWidth || 0) - Number(control.offsetWidth || 0)) / 2));
    try {
      nav.scrollTo?.({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      if (!nav.scrollTo) nav.scrollLeft = left;
      return true;
    } catch (_) {
      nav.scrollLeft = left;
      return true;
    }
  }

  function renderConsultationFocusMode(model, consultationId) {
    const region = byId('consultationFocusMode');
    if (!region || !model?.stages?.length) return false;
    const recordId = text(consultationId, '');
    if (recordId !== consultationFocusRecordId) {
      consultationFocusRecordId = recordId;
      consultationFocusModeEnabled = true;
      consultationFocusStageLocked = false;
      consultationFocusStageId = '';
      lastMobileFocusStageId = '';
    }
    const recommendedId = model.current?.id || model.stages[0].id;
    if (!consultationFocusStageLocked || !CONSULTATION_FOCUS_STAGE_ORDER.includes(consultationFocusStageId)) {
      consultationFocusStageId = recommendedId;
    }
    const selectedStage = model.stages.find(stage => stage.id === consultationFocusStageId)
      || model.stages.find(stage => stage.id === recommendedId)
      || model.stages[0];
    const recommendedStage = model.stages.find(stage => stage.id === recommendedId) || selectedStage;
    const selectedIndex = CONSULTATION_FOCUS_STAGE_ORDER.indexOf(selectedStage.id);
    const modeStage = consultationFocusModeEnabled ? selectedStage : recommendedStage;

    region.dataset.enabled = String(consultationFocusModeEnabled);
    region.dataset.stage = selectedStage.id;
    const toggle = byId('consultationFocusModeToggle');
    if (toggle) {
      toggle.setAttribute?.('aria-pressed', String(consultationFocusModeEnabled));
      toggle.textContent = consultationFocusModeEnabled ? 'Show full record' : 'Use focus mode';
    }
    updateText(
      byId('consultationFocusModeDetail'),
      consultationFocusModeEnabled
        ? `Showing only ${selectedStage.label} work. Supporting context stays available in the relevant disclosures.`
        : 'The complete consultation record is visible. Use Focus Mode whenever you want one stage at a time.'
    );

    const stageList = byId('consultationFocusModeStages');
    let selectedControl = null;
    stageList?.querySelectorAll?.('[data-consultation-focus-stage]')?.forEach(control => {
      const stage = model.stages.find(item => item.id === control.dataset.consultationFocusStage);
      if (!stage) return;
      const selected = consultationFocusModeEnabled && stage.id === selectedStage.id;
      if (selected) selectedControl = control;
      const item = control.closest?.('li');
      if (item?.dataset) item.dataset.state = stage.state;
      item?.classList?.toggle?.('is-selected', selected);
      control.setAttribute?.('aria-pressed', String(selected));
      control.tabIndex = stage.id === (consultationFocusModeEnabled ? selectedStage.id : recommendedStage.id) ? 0 : -1;
      if (stage.id === recommendedId) control.setAttribute?.('aria-current', 'step');
      else control.removeAttribute?.('aria-current');
      const marker = control.querySelector?.('span');
      if (marker) marker.textContent = stage.state === 'complete' ? '✓' : String(stage.number);
      const state = control.querySelector?.('small');
      if (state) state.textContent = selected && stage.id !== recommendedId ? 'Viewing' : consultationFocusStateLabel(stage);
      control.setAttribute?.('aria-label', `${stage.label}: ${consultationFocusStateLabel(stage)}${selected ? ', selected' : ''}`);
    });
    centerMobileFocusStage(selectedControl, selectedStage.id);

    const previous = region.querySelector?.('[data-consultation-focus-action="previous"]');
    const next = region.querySelector?.('[data-consultation-focus-action="next"]');
    if (previous) {
      previous.disabled = !consultationFocusModeEnabled || selectedIndex <= 0;
      previous.textContent = selectedIndex > 0 ? `Previous: ${model.stages[selectedIndex - 1]?.label || 'stage'}` : 'Previous stage';
    }
    if (next) {
      next.disabled = !consultationFocusModeEnabled || selectedIndex >= model.stages.length - 1;
      next.textContent = selectedIndex < model.stages.length - 1 ? `Next: ${model.stages[selectedIndex + 1]?.label || 'stage'}` : 'Next stage';
    }
    const current = region.querySelector?.('[data-consultation-focus-action="current"]');
    if (current) current.hidden = !consultationFocusModeEnabled || selectedStage.id === recommendedId;
    updateText(
      byId('consultationFocusModeStatus'),
      consultationFocusModeEnabled
        ? selectedStage.id === recommendedId
          ? `Showing ${selectedStage.label}, the recommended current stage.`
          : `Showing ${selectedStage.label}. Recommended now: ${recommendedStage.label}.`
        : `Showing the full record. Recommended now: ${recommendedStage.label}.`
    );

    applyConsultationFocusSurfaces(modeStage.id);

    const focus = byId('consultationFocus');
    if (focus && modeStage) {
      if (focus.dataset) focus.dataset.state = ['attention', 'complete'].includes(modeStage.state) ? modeStage.state : 'active';
      updateText(byId('consultationFocusStep'), `Step ${modeStage.number} of ${model.summary.total}`);
      updateText(
        byId('consultationFocusLabel'),
        consultationFocusModeEnabled && modeStage.id !== recommendedId
          ? `Viewing · ${modeStage.label}`
          : `${model.state === 'complete' ? 'Complete' : 'Now'} · ${modeStage.label}`
      );
      updateText(byId('consultationFocusTitle'), modeStage.summary);
      updateText(byId('consultationFocusDetail'), modeStage.detail);
      const focusMeta = consultationFocusModeEnabled && modeStage.id !== recommendedId
        ? `Recommended now: ${recommendedStage.label}`
        : model.state === 'complete'
          ? `All ${model.summary.total} stages complete`
          : model.summary.attention
            ? `${model.summary.attention} earlier ${model.summary.attention === 1 ? 'step needs' : 'steps need'} attention`
            : `${model.summary.completed} complete`;
      updateText(byId('consultationFocusMeta'), focusMeta);
      const focusProgress = byId('consultationFocusProgress');
      if (focusProgress) {
        focusProgress.setAttribute?.('aria-valuenow', String(model.summary.percent));
        focusProgress.style?.setProperty?.('--consultation-focus-progress', `${model.summary.percent}%`);
      }
      const focusAction = byId('consultationFocusAction');
      if (focusAction) {
        focusAction.textContent = modeStage.actionLabel;
        focusAction.href = modeStage.target;
      }
    }
    updateText(byId('activeCustomerNextStep'), recommendedStage.summary);
    const activeStatus = text(byId('activeCustomerStatus')?.textContent, 'Review received');
    updateText(byId('activeCustomerSnapshotSummary'), `${activeStatus} · ${recommendedStage.label}: ${recommendedStage.summary}`);
    const mobileFocusAction = byId('mobileFocusAction');
    if (mobileFocusAction) {
      mobileFocusAction.href = recommendedStage.target;
      mobileFocusAction.textContent = recommendedStage.label;
      mobileFocusAction.setAttribute?.('aria-label', `Go to current consultation stage: ${recommendedStage.label}. ${recommendedStage.summary}`);
      if (mobileFocusAction.dataset) mobileFocusAction.dataset.state = recommendedStage.state;
    }
    return true;
  }

  function selectConsultationFocusStage(stageId, options) {
    const model = currentConsultationProgressModel;
    const stage = model?.stages?.find?.(item => item.id === stageId);
    if (!stage) return false;
    consultationFocusModeEnabled = true;
    consultationFocusStageLocked = options?.locked !== false;
    consultationFocusStageId = stage.id;
    renderConsultationFocusMode(model, consultationFocusRecordId);
    if (options?.scroll) safeScrollIntoView(document.querySelector?.(stage.target), { block: 'start' });
    if (options?.announce) announce(`Focus Mode is showing ${stage.label}. ${consultationFocusStateLabel(stage)}.`);
    return true;
  }

  function handleConsultationFocusModeClick(event) {
    const control = event.target.closest?.('button');
    const region = byId('consultationFocusMode');
    if (!control || !region?.contains?.(control) || !currentConsultationProgressModel) return;
    if (control.id === 'consultationFocusModeToggle') {
      consultationFocusModeEnabled = !consultationFocusModeEnabled;
      if (consultationFocusModeEnabled && !consultationFocusStageId) consultationFocusStageId = currentConsultationProgressModel.current?.id || 'understand';
      renderConsultationFocusMode(currentConsultationProgressModel, consultationFocusRecordId);
      announce(consultationFocusModeEnabled ? 'Focus Mode on. Showing one consultation stage.' : 'Focus Mode off. Showing the complete consultation record.');
      return;
    }
    const requestedStage = control.dataset.consultationFocusStage;
    if (requestedStage) {
      selectConsultationFocusStage(requestedStage, { announce: true, locked: true, scroll: true });
      return;
    }
    const action = control.dataset.consultationFocusAction;
    const selectedIndex = CONSULTATION_FOCUS_STAGE_ORDER.indexOf(consultationFocusStageId);
    if (action === 'previous' && selectedIndex > 0) {
      selectConsultationFocusStage(CONSULTATION_FOCUS_STAGE_ORDER[selectedIndex - 1], { announce: true, locked: true, scroll: true });
    } else if (action === 'next' && selectedIndex < CONSULTATION_FOCUS_STAGE_ORDER.length - 1) {
      selectConsultationFocusStage(CONSULTATION_FOCUS_STAGE_ORDER[selectedIndex + 1], { announce: true, locked: true, scroll: true });
    } else if (action === 'current') {
      selectConsultationFocusStage(currentConsultationProgressModel.current?.id, { announce: true, locked: false, scroll: true });
    }
  }

  function handleConsultationFocusModeKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const control = event.target.closest?.('[data-consultation-focus-stage]');
    const stageList = byId('consultationFocusModeStages');
    if (!control || !stageList?.contains?.(control) || !currentConsultationProgressModel) return;
    const controls = Array.from(stageList.querySelectorAll?.('[data-consultation-focus-stage]') || []);
    const currentIndex = controls.indexOf(control);
    if (currentIndex < 0 || !controls.length) return;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % controls.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + controls.length) % controls.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = controls.length - 1;
    event.preventDefault?.();
    const next = controls[nextIndex];
    selectConsultationFocusStage(next?.dataset?.consultationFocusStage, { announce: true, locked: true, scroll: false });
    next?.focus?.({ preventScroll: true });
    centerMobileFocusStage(next, next?.dataset?.consultationFocusStage);
  }

  function renderConsultationProgress(snapshot, checklistState) {
    const region = byId('consultationProgress');
    const list = byId('consultationProgressStages');
    if (!region || !list || !consultationProgress?.build) return false;
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const record = activeConsultationRecord(records, text(snapshot?.consultation?.id, ''));
    const model = consultationProgress.build(snapshot, {
      checklist: checklistState || window.CoverageFitAgentWorkspaceChecklist || null,
      recommendationPlan: currentRecommendationPlan,
      disposition: dispositionDetails(record),
      followUp: followUpDetails(record),
      serverBacked: Boolean(record?.remote?.serverBacked)
    });
    const consultationId = text(snapshot?.consultation?.id, '');
    const signature = stableSignature({ consultationId, model });
    currentConsultationProgressModel = model;
    if (signature === lastConsultationProgressSignature) {
      renderConsultationFocusMode(model, consultationId);
      return false;
    }
    lastConsultationProgressSignature = signature;
    window.CoverageFitAgentWorkspaceConsultationProgress = model;
    if (region.dataset) region.dataset.state = model.state;
    updateText(byId('consultationProgressBadge'), `${model.summary.completed} of ${model.summary.total} complete`);
    list.innerHTML = model.stages.map(stage => `<li data-state="${escapeHtml(stage.state)}">
      <a href="${escapeHtml(stage.target)}" ${stage.state === 'current' ? 'aria-current="step"' : ''}>
        <span aria-hidden="true">${stage.state === 'complete' ? '✓' : stage.number}</span>
        <strong>${escapeHtml(stage.label)}</strong>
        <small>${stage.state === 'complete' ? 'Complete' : stage.state === 'current' ? 'Current' : stage.state === 'attention' ? 'Needs attention' : 'Upcoming'}</small>
      </a>
    </li>`).join('');
    updateText(byId('consultationProgressCurrentLabel'), `${model.state === 'complete' ? 'Complete' : 'Current'} · ${model.current.label}`);
    updateText(byId('consultationProgressCurrentTitle'), model.current.summary);
    updateText(byId('consultationProgressCurrentDetail'), model.current.detail);
    updateText(byId('consultationProgressGuardrail'), model.guardrail);
    const action = byId('consultationProgressCurrentAction');
    if (action) {
      action.textContent = model.current.actionLabel;
      action.href = model.current.target;
    }
    renderConsultationFocusMode(model, consultationId);
    return true;
  }

  function renderProducerPilotReadiness(checklistState) {
    const region = byId('producerPilotReadiness');
    const list = byId('producerPilotReadinessChecks');
    if (!region || !list || !producerPilotReadiness?.build || !currentWorkspaceSnapshot) return false;
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const record = activeConsultationRecord(records, text(currentWorkspaceSnapshot?.consultation?.id, ''));
    const consultationId = text(record?.id || currentWorkspaceSnapshot?.consultation?.id, '');
    const model = producerPilotReadiness.build(currentWorkspaceSnapshot, {
      record,
      plan: currentConversationPlan,
      checklist: checklistState || window.CoverageFitAgentWorkspaceChecklist || null,
      connection: remoteInboxConnection(),
      persistenceState: checklistPersistenceState,
      documentAvailable: Boolean(consultationId),
      documentHref: consultationDocumentHref(consultationId),
      printPreviewConfirmed: pilotOutputConfirmations.has(consultationId)
    });
    const signature = stableSignature(model);
    if (signature === lastProducerPilotReadinessSignature) return false;
    lastProducerPilotReadinessSignature = signature;
    window.CoverageFitAgentWorkspacePilotReadiness = model;
    if (region.dataset) region.dataset.state = model.state;
    updateText(byId('producerPilotReadinessBadge'), model.ready ? 'Ready for pilot' : `${model.summary.ready} of ${model.summary.total} ready`);
    updateText(
      byId('producerPilotReadinessDetail'),
      model.ready
        ? 'The selected consultation, recoverable workflow, secure save path, and this device’s document preview are ready.'
        : model.next?.detail || 'Complete the remaining operational checks before beginning the pilot consultation.'
    );
    list.innerHTML = model.checks.map(item => `<li data-state="${escapeHtml(item.state)}">
      <div class="producer-pilot-readiness__check-heading"><span aria-hidden="true">${item.ready ? '✓' : '!'}</span><strong>${escapeHtml(item.label)}</strong></div>
      <p>${escapeHtml(item.detail)}</p>
      ${!item.ready && item.action ? `<a href="${escapeHtml(item.action.target)}"${item.action.target.startsWith('/agent/consultation/') ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(item.action.label)}</a>` : ''}
    </li>`).join('');
    updateText(byId('producerPilotReadinessGuardrail'), model.guardrail);
    const action = byId('producerPilotReadinessAction');
    if (action) {
      action.textContent = model.action.label;
      action.href = model.action.target;
      if (model.action.target.startsWith('/agent/consultation/')) {
        action.target = '_blank';
        action.rel = 'noopener';
      } else {
        action.removeAttribute?.('target');
        action.removeAttribute?.('rel');
      }
    }
    const confirmation = byId('producerPilotOutputConfirmed');
    if (confirmation) {
      confirmation.disabled = !model.checks.find(item => item.id === 'document')?.ready;
      confirmation.checked = pilotOutputConfirmations.has(consultationId);
    }
    return true;
  }

  function handlePilotOutputConfirmation(event) {
    const consultationId = text(currentWorkspaceSnapshot?.consultation?.id, '');
    if (!consultationId) return;
    if (event?.target?.checked) pilotOutputConfirmations.add(consultationId);
    else pilotOutputConfirmations.delete(consultationId);
    lastProducerPilotReadinessSignature = '';
    renderProducerPilotReadiness(window.CoverageFitAgentWorkspaceChecklist || null);
    announce(event?.target?.checked
      ? 'Print Preview review confirmed for this consultation and Workspace session.'
      : 'Print Preview confirmation removed.');
  }

  function setRemoteInboxExpanded(expanded, options) {
    const bar = byId('remoteInboxBar');
    const panel = byId('remoteInboxPanel');
    const control = byId('remoteInboxDisclosure');
    const next = Boolean(expanded);
    if (bar) bar.classList?.toggle?.('is-collapsed', !next);
    if (panel) panel.hidden = !next;
    if (control) {
      control.setAttribute?.('aria-expanded', String(next));
      control.textContent = next ? 'Hide setup' : 'Manage connection';
    }
    if (options?.remember) remoteInboxExpandedByUser = next;
    return next;
  }

  function syncRemoteInboxPresentation(connection) {
    const current = connection || remoteInboxConnection();
    const connected = Boolean(current.connected);
    const bar = byId('remoteInboxBar');
    const summary = byId('remoteInboxSummary');
    if (bar) bar.classList?.toggle?.('is-connected', connected);
    if (summary) {
      const synced = remoteInboxSyncLabel(current.lastSyncedAt);
      summary.textContent = connected
        ? (synced ? `Connected · Last synced ${synced}` : 'Connected and ready to receive reviews')
        : 'Connect once to receive completed reviews from prospect devices.';
    }
    if (connected && !remoteInboxExpandedByUser) setRemoteInboxExpanded(false);
    if (!connected) setRemoteInboxExpanded(true);
    return connected;
  }

  function handleRemoteInboxDisclosure() {
    const expanded = byId('remoteInboxDisclosure')?.getAttribute('aria-expanded') === 'true';
    setRemoteInboxExpanded(!expanded, { remember: true });
    announce(`Producer inbox setup ${expanded ? 'collapsed' : 'expanded'}.`);
  }

  function getPerformanceSnapshot() {
    return Object.freeze({ ...performanceStats });
  }

  window.CoverageFitAgentWorkspacePerformance = Object.freeze({
    version: '1.0.0',
    getSnapshot: getPerformanceSnapshot,
    reset() {
      Object.keys(performanceStats).forEach(key => { performanceStats[key] = 0; });
      return getPerformanceSnapshot();
    }
  });

  window.CoverageFitAgentWorkspaceLifecycle = Object.freeze({
    version: '1.0.0',
    getSnapshot() {
      return Object.freeze({
        disposed: workspaceDisposed,
        listeners: lifecycleStats.listeners,
        subscriptions: lifecycleStats.subscriptions,
        teardowns: lifecycleStats.teardowns,
        pendingTimers: Number(loadingExitTimer !== null) + Number(surfaceMotionTimer !== null)
      });
    },
    teardown: teardownWorkspace
  });

  function remoteInboxConnection() {
    try { return remoteInbox?.connection?.() || { connected: false, lastSyncedAt: '' }; }
    catch (_) { return { connected: false, lastSyncedAt: '' }; }
  }

  function remoteInboxSyncLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
  }

  function setRemoteInboxState(state, message, tone) {
    const badge = byId('remoteInboxBadge');
    const status = byId('remoteInboxMessage');
    if (badge) {
      if (badge.dataset) badge.dataset.state = state || 'disconnected';
      else badge.setAttribute?.('data-state', state || 'disconnected');
      badge.textContent = state === 'connected' ? 'Connected' : state === 'syncing' ? 'Syncing' : state === 'error' ? 'Connection issue' : 'Not connected';
    }
    if (status) {
      status.textContent = message || 'Browser-local records remain available even when the secure inbox is not connected.';
      status.classList?.toggle?.('is-error', tone === 'error');
      status.classList?.toggle?.('is-success', tone === 'success');
    }
  }

  function updateRemoteInboxControls() {
    const connection = remoteInboxConnection();
    const input = byId('remoteInboxToken');
    const connect = byId('remoteInboxConnect');
    const sync = byId('remoteInboxSync');
    const disconnect = byId('remoteInboxDisconnect');
    if (!remoteInbox) {
      if (input) input.disabled = true;
      if (connect) connect.disabled = true;
      if (sync) sync.disabled = true;
      if (disconnect) disconnect.hidden = true;
      setRemoteInboxState('error', 'The secure inbox client could not be loaded. Browser-local records remain available.', 'error');
      syncRemoteInboxPresentation(connection);
      renderInboxConnectionState(typeof data?.listConsultations === 'function' ? data.listConsultations() : []);
      return connection;
    }
    if (input) {
      input.disabled = connection.connected || remoteInboxSyncing;
      if (connection.connected) input.value = '';
    }
    if (connect) {
      connect.hidden = connection.connected;
      connect.disabled = remoteInboxSyncing;
    }
    if (sync) {
      sync.hidden = !connection.connected;
      sync.disabled = !connection.connected || remoteInboxSyncing;
    }
    if (disconnect) {
      disconnect.hidden = !connection.connected;
      disconnect.disabled = remoteInboxSyncing;
    }
    if (!remoteInboxSyncing) {
      const synced = remoteInboxSyncLabel(connection.lastSyncedAt);
      setRemoteInboxState(
        connection.connected ? 'connected' : 'disconnected',
        connection.connected
          ? (synced ? `Secure inbox connected. Last synced ${synced}.` : 'Secure inbox connected. Sync to receive completed reviews from prospect devices.')
          : 'Browser-local records remain available even when the secure inbox is not connected.',
        connection.connected ? 'success' : ''
      );
    }
    syncRemoteInboxPresentation(connection);
    renderInboxConnectionState(typeof data?.listConsultations === 'function' ? data.listConsultations() : []);
    renderProducerPilotReadiness(window.CoverageFitAgentWorkspaceChecklist || null);
    return connection;
  }

  async function syncRemoteInbox(options) {
    const settings = options || {};
    if (!remoteInbox?.sync || remoteInboxSyncing || workspaceDisposed) return null;
    const suppliedToken = typeof settings.token === 'string' ? settings.token.trim() : '';
    if (suppliedToken && !remoteInbox.setToken?.(suppliedToken)) {
      setRemoteInboxState('error', 'Enter an access key containing at least 24 characters.', 'error');
      byId('remoteInboxToken')?.focus?.();
      return null;
    }
    remoteInboxSyncing = true;
    setRemoteInboxState('syncing', 'Securely checking the producer inbox for completed reviews.');
    updateRemoteInboxControls();
    try {
      const result = await remoteInbox.sync();
      if (workspaceDisposed) return result;
      remoteInboxSyncing = false;
      updateRemoteInboxControls();
      const message = result.count
        ? `Synced ${result.count} remote review${result.count === 1 ? '' : 's'}; ${result.imported} record${result.imported === 1 ? '' : 's'} available in this Workspace.`
        : 'Secure inbox connected. No completed remote reviews are waiting yet.';
      setRemoteInboxState('connected', message, 'success');
      if (!settings.silent) announce(message);
      render();
      return result;
    } catch (error) {
      if (workspaceDisposed) return null;
      remoteInboxSyncing = false;
      if (error?.status === 401 || error?.code === 'unauthorized') remoteInbox.clearToken?.();
      updateRemoteInboxControls();
      const message = error?.code === 'inbox_not_configured'
        ? 'The server inbox is deployed but the producer access key has not been configured in Cloudflare.'
        : error?.status === 401 || error?.code === 'unauthorized'
          ? 'The producer inbox access key was not accepted. Re-enter the configured key.'
          : 'The secure inbox could not be reached. Browser-local consultation records are still available.';
      setRemoteInboxState('error', message, 'error');
      if (!settings.silent) announce(message);
      return null;
    }
  }

  function handleRemoteInboxSubmit(event) {
    event?.preventDefault?.();
    const token = String(byId('remoteInboxToken')?.value || '').trim();
    syncRemoteInbox({ token });
  }

  function handleRemoteInboxDisconnect() {
    remoteInbox?.clearToken?.();
    const input = byId('remoteInboxToken');
    if (input) { input.value = ''; input.disabled = false; }
    remoteInboxExpandedByUser = false;
    updateRemoteInboxControls();
    setRemoteInboxExpanded(true);
    setRemoteInboxState('disconnected', 'Secure inbox disconnected from this browser session. Saved local records remain available.');
    announce('Secure producer inbox disconnected.');
  }

  function handleWorkspaceRefresh() {
    if (remoteInboxConnection().connected) syncRemoteInbox({ silent: true });
    else render();
  }

  function initializeRemoteInbox() {
    const connection = updateRemoteInboxControls();
    if (connection.connected) Promise.resolve().then(() => syncRemoteInbox({ silent: true }));
  }

  function displayDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function displayDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
  }

  function consultationStatus(record) {
    if (!record?.remote?.serverBacked) return 'local';
    const value = String(record.remote.status || record.status || 'new').toLowerCase();
    return ['new', 'opened', 'acknowledged'].includes(value) ? value : 'new';
  }

  function consultationStatusLabel(record) {
    const status = consultationStatus(record);
    if (status === 'acknowledged') return 'Acknowledged';
    if (status === 'opened') return 'Opened';
    if (status === 'new') return 'New';
    return 'Saved locally';
  }

  function consultationRecordLabel(record) {
    const customer = record?.customer || {};
    const name = text(customer.name, 'Unnamed homeowner');
    const address = text(customer.propertyAddress, 'Address not provided');
    return `${consultationStatusLabel(record)} · ${name} · ${address} · ${displayDate(record?.createdAt)}`;
  }

  function consultationNotificationMessage(record) {
    if (!record?.remote?.serverBacked) return '';
    const notification = record.remote.notification || {};
    const state = plainText(notification.state, 'legacy').toLowerCase();
    if (state === 'sent') {
      const sentAt = displayDateTime(notification.sentAt || notification.attemptedAt);
      return sentAt ? `Producer email alert sent ${sentAt}` : 'Producer email alert sent';
    }
    if (state === 'failed') return 'Producer email alert delivery failed; the review remains saved in the secure inbox';
    if (state === 'skipped') {
      return notification.reason === 'disabled'
        ? 'Producer email alerts are disabled; the review remains available in the secure inbox'
        : 'Producer email alert not configured; the review remains available in the secure inbox';
    }
    if (state === 'pending') return 'Producer email alert pending';
    return 'Producer email alert history is unavailable for this earlier record';
  }

  function consultationDeliveryMessage(record) {
    if (!record?.remote?.serverBacked) return 'This consultation is saved in this browser and has no server delivery state.';
    const remote = record.remote;
    const delivered = displayDateTime(remote.deliveredAt);
    const opened = displayDateTime(remote.openedAt);
    const acknowledged = displayDateTime(remote.acknowledgedAt);
    const parts = [];
    if (delivered) parts.push(`Delivered ${delivered}`);
    if (acknowledged) parts.push(`Acknowledged ${acknowledged}`);
    else if (opened) parts.push(`Opened ${opened}`);
    else parts.push('Waiting to be opened');
    const notification = consultationNotificationMessage(record);
    if (notification) parts.push(notification);
    return `${parts.join(' · ')}.`;
  }

  function renderConsultationDelivery(record) {
    const region = byId('consultationDeliveryState');
    const badge = byId('consultationDeliveryBadge');
    const meta = byId('consultationDeliveryMeta');
    const acknowledge = byId('acknowledgeConsultation');
    if (!region || !badge || !meta || !acknowledge) return false;
    const status = consultationStatus(record);
    badge.dataset.state = status;
    badge.textContent = consultationStatusLabel(record);
    meta.textContent = consultationDeliveryMessage(record);
    const serverBacked = Boolean(record?.remote?.serverBacked);
    const pending = remoteStatusPending.has(record?.id);
    const connected = remoteInboxConnection().connected;
    acknowledge.hidden = !serverBacked;
    acknowledge.disabled = !serverBacked || status === 'acknowledged' || pending || !connected;
    acknowledge.setAttribute?.('aria-busy', String(pending));
    acknowledge.textContent = status === 'acknowledged' ? 'Acknowledged' : pending ? 'Updating…' : 'Acknowledge review';
    acknowledge.title = !serverBacked
      ? 'Only remotely delivered consultations have a server acknowledgment state'
      : status === 'acknowledged'
        ? 'This consultation has been acknowledged'
        : connected
          ? 'Mark this delivered consultation as acknowledged'
          : 'Connect the secure producer inbox to acknowledge this consultation';
    return true;
  }

  function plainText(value, fallback = '') {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function followUpDetails(record) {
    const source = record?.remote?.followUp || {};
    const stateValue = plainText(source.state, 'none').toLowerCase();
    const state = ['none', 'scheduled', 'completed'].includes(stateValue) ? stateValue : 'none';
    return {
      state,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(plainText(source.dueDate)) ? plainText(source.dueDate) : '',
      note: plainText(source.note).slice(0, 240),
      scheduledAt: plainText(source.scheduledAt),
      completedAt: plainText(source.completedAt),
      updatedAt: plainText(source.updatedAt)
    };
  }

  function followUpTiming(record, todayValue) {
    const followUp = followUpDetails(record);
    const today = todayValue || localDateKey(new Date());
    if (followUp.state === 'completed') return 'completed';
    if (followUp.state !== 'scheduled' || !followUp.dueDate) return 'unscheduled';
    if (followUp.dueDate < today) return 'overdue';
    if (followUp.dueDate === today) return 'today';
    return 'upcoming';
  }

  function followUpDisplay(record) {
    if (!record?.remote?.serverBacked) return { state: 'local', text: 'Saved locally · follow-up scheduling unavailable' };
    const followUp = followUpDetails(record);
    const timing = followUpTiming(record);
    if (followUp.state === 'completed') {
      return { state: 'completed', text: `Follow-up completed${followUp.completedAt ? ` ${displayDate(followUp.completedAt)}` : ''}` };
    }
    if (followUp.state === 'scheduled') {
      const prefix = timing === 'overdue' ? 'Overdue' : timing === 'today' ? 'Due today' : `Due ${displayDate(`${followUp.dueDate}T12:00:00`)}`;
      return { state: timing, text: `${prefix}${followUp.note ? ` · ${followUp.note}` : ''}` };
    }
    return { state: 'unscheduled', text: 'No follow-up scheduled' };
  }


  const CONSULTATION_STAGE_LABELS = Object.freeze({
    review_received: 'Review received',
    contact_attempted: 'Contact attempted',
    consultation_scheduled: 'Consultation scheduled',
    consultation_completed: 'Consultation completed',
    proposal_prepared: 'Proposal prepared',
    decision_pending: 'Decision pending',
    closed: 'Closed'
  });
  const CONSULTATION_OUTCOME_LABELS = Object.freeze({
    none: 'No final outcome',
    policy_bound: 'Policy bound',
    current_carrier_retained: 'Stayed with current carrier',
    declined_price: 'Declined — price',
    declined_coverage: 'Declined — coverage',
    unable_to_reach: 'Unable to reach',
    not_eligible: 'Not eligible / not a fit',
    deferred: 'Deferred / future review'
  });

  function dispositionDetails(record) {
    const source = record?.remote?.disposition || record?.disposition || {};
    const stage = Object.prototype.hasOwnProperty.call(CONSULTATION_STAGE_LABELS, plainText(source.stage)) ? plainText(source.stage) : 'review_received';
    const outcomeValue = Object.prototype.hasOwnProperty.call(CONSULTATION_OUTCOME_LABELS, plainText(source.outcome)) ? plainText(source.outcome) : 'none';
    return {
      stage,
      outcome: stage === 'closed' ? outcomeValue : 'none',
      note: plainText(source.note).slice(0, 240),
      stageUpdatedAt: plainText(source.stageUpdatedAt),
      outcomeUpdatedAt: plainText(source.outcomeUpdatedAt),
      closedAt: plainText(source.closedAt),
      updatedAt: plainText(source.updatedAt)
    };
  }

  function consultationStageLabel(record) { return CONSULTATION_STAGE_LABELS[dispositionDetails(record).stage] || 'Review received'; }
  function consultationOutcomeLabel(record) { return CONSULTATION_OUTCOME_LABELS[dispositionDetails(record).outcome] || 'No final outcome'; }

  function recordSearchText(record) {
    const customer = record?.customer || {};
    return [
      customer.name,
      customer.firstName,
      customer.lastName,
      customer.email,
      customer.phone,
      customer.propertyAddress,
      customer.reviewContext,
      record?.assessment?.topPriority,
      record?.integration?.campaign,
      record?.integration?.referralSource,
      followUpDetails(record).note,
      consultationStageLabel(record),
      consultationOutcomeLabel(record),
      dispositionDetails(record).note,
      ...(Array.isArray(record?.remote?.notes) ? record.remote.notes.map(note => note.body) : [])
    ].map(value => plainText(value).toLowerCase()).filter(Boolean).join(' ');
  }

  function recordMatchesQueue(record, query, statusFilter, followUpFilter, stageFilter) {
    const normalizedQuery = plainText(query).toLowerCase();
    if (normalizedQuery && !recordSearchText(record).includes(normalizedQuery)) return false;
    if (statusFilter && statusFilter !== 'all' && consultationStatus(record) !== statusFilter) return false;
    if (stageFilter && stageFilter !== 'all' && dispositionDetails(record).stage !== stageFilter) return false;
    const timing = followUpTiming(record);
    if (!followUpFilter || followUpFilter === 'all') return true;
    if (followUpFilter === 'needs-action') return timing === 'overdue' || timing === 'today' || timing === 'upcoming';
    return timing === followUpFilter;
  }

  function recordNeedsInboxAttention(record) {
    const timing = followUpTiming(record);
    return consultationStatus(record) === 'new' || timing === 'overdue' || timing === 'today';
  }

  function recordMatchesInboxQuickFilter(record, quickFilter) {
    if (quickFilter === 'attention') return recordNeedsInboxAttention(record);
    if (quickFilter === 'new') return consultationStatus(record) === 'new';
    if (quickFilter === 'today') return followUpTiming(record) === 'today';
    return true;
  }

  function renderInboxSummary(records) {
    const safe = Array.isArray(records) ? records : [];
    const counts = {
      all: safe.length,
      attention: safe.filter(recordNeedsInboxAttention).length,
      new: safe.filter(record => consultationStatus(record) === 'new').length,
      today: safe.filter(record => followUpTiming(record) === 'today').length
    };
    updateText(byId('inboxSummaryAll'), counts.all);
    updateText(byId('inboxSummaryAttention'), counts.attention);
    updateText(byId('inboxSummaryNew'), counts.new);
    updateText(byId('inboxSummaryToday'), counts.today);
    document.querySelectorAll?.('[data-inbox-quick-filter]').forEach(control => {
      const selected = control.dataset.inboxQuickFilter === activeInboxQuickFilter;
      control.setAttribute?.('aria-pressed', String(selected));
    });
    return counts;
  }

  function renderInboxConnectionState(records) {
    const region = byId('inboxConnectionState');
    if (!region) return false;
    const connection = remoteInboxConnection();
    const connected = Boolean(connection.connected);
    const count = Array.isArray(records) ? records.length : 0;
    const eyebrow = byId('inboxConnectionEyebrow');
    const title = byId('inboxConnectionTitle');
    const message = byId('inboxConnectionMessage');
    const action = byId('inboxConnectionAction');
    region.dataset.state = connected ? 'connected' : 'offline';
    updateText(eyebrow, connected ? 'Secure inbox connected' : 'Saved-device mode');
    updateText(title, connected ? 'Reviews are synchronized' : 'Showing reviews saved on this device');
    updateText(message, connected
      ? `${count} homeowner review${count === 1 ? '' : 's'} available. Sync again whenever you expect a new submission.`
      : 'Connect the secure producer inbox to receive and update reviews completed on other devices. Saved-device reviews remain available.');
    if (action) {
      action.dataset.inboxAction = connected ? 'sync' : 'connect';
      action.textContent = connected ? 'Sync now' : 'Connect inbox';
      action.disabled = remoteInboxSyncing;
    }
    return connected;
  }

  function activeInboxFilterCount() {
    return [
      plainText(byId('consultationSearch')?.value),
      plainText(byId('consultationStatusFilter')?.value, 'all') !== 'all',
      plainText(byId('consultationStageFilter')?.value, 'all') !== 'all',
      plainText(byId('consultationFollowUpFilter')?.value, 'all') !== 'all',
      activeInboxQuickFilter !== 'all'
    ].filter(Boolean).length;
  }

  function syncInboxFilterSummary() {
    const count = activeInboxFilterCount();
    updateText(byId('consultationActiveFilterCount'), count ? `${count} active` : 'None active');
    return count;
  }

  function queueSortValue(record) {
    const timing = followUpTiming(record);
    const followUp = followUpDetails(record);
    const timingRank = timing === 'overdue' ? 0
      : timing === 'today' ? 1
        : consultationStatus(record) === 'new' ? 2
          : ({ upcoming: 3, unscheduled: 4, completed: 5 }[timing] ?? 6);
    const due = followUp.dueDate || '9999-12-31';
    const delivered = plainText(record?.remote?.deliveredAt || record?.createdAt);
    return [timingRank, due, delivered];
  }

  function sortQueueRecords(records) {
    return records.slice().sort((left, right) => {
      const a = queueSortValue(left);
      const b = queueSortValue(right);
      if (a[0] !== b[0]) return a[0] - b[0];
      if (a[1] !== b[1]) return a[1].localeCompare(b[1]);
      return b[2].localeCompare(a[2]);
    });
  }

  function pipelineDateOptions() {
    return {
      range: plainText(byId('pipelineDateRange')?.value, 'all'),
      startDate: plainText(byId('pipelineDateStart')?.value),
      endDate: plainText(byId('pipelineDateEnd')?.value)
    };
  }

  function defaultCustomPipelineDates() {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    return { start: localDateKey(start), end: localDateKey(end) };
  }

  function syncPipelineDateControls(options) {
    const settings = options || pipelineDateOptions();
    const custom = byId('pipelineCustomDates');
    const start = byId('pipelineDateStart');
    const end = byId('pipelineDateEnd');
    const today = localDateKey(new Date());
    if (start) start.max = today;
    if (end) end.max = today;
    if (custom) custom.hidden = settings.range !== 'custom';
    if (settings.range === 'custom' && start && end && (!start.value || !end.value)) {
      const defaults = defaultCustomPipelineDates();
      if (!start.value) start.value = defaults.start;
      if (!end.value) end.value = defaults.end;
    }
    return pipelineDateOptions();
  }

  function fallbackPipelineSelection(records, options) {
    const safe = Array.isArray(records) ? records.filter(record => record && typeof record === 'object') : [];
    return { records: safe, range: { key: 'all', label: 'All time', valid: true, error: '' }, availableTotal: safe.length };
  }

  function pipelineRecordSelection(records, options) {
    if (pipelineSummary?.filterRecords) return pipelineSummary.filterRecords(records, options);
    return fallbackPipelineSelection(records, options);
  }

  function buildPipelineSummary(records, options) {
    if (pipelineSummary?.summarize) return pipelineSummary.summarize(records, options);
    const selection = fallbackPipelineSelection(records, options);
    const stageKeys = Object.keys(CONSULTATION_STAGE_LABELS);
    const outcomeKeys = Object.keys(CONSULTATION_OUTCOME_LABELS).filter(key => key !== 'none');
    const safe = selection.records;
    const stageCounts = Object.fromEntries(stageKeys.map(key => [key, 0]));
    const outcomeCounts = Object.fromEntries(outcomeKeys.map(key => [key, 0]));
    safe.forEach(record => {
      const details = dispositionDetails(record);
      stageCounts[details.stage] = (stageCounts[details.stage] || 0) + 1;
      if (details.stage === 'closed' && details.outcome !== 'none') outcomeCounts[details.outcome] = (outcomeCounts[details.outcome] || 0) + 1;
    });
    const total = safe.length;
    const closed = stageCounts.closed || 0;
    const percent = (count, base) => base ? Math.round((count / base) * 100) : 0;
    return {
      total,
      availableTotal: selection.availableTotal,
      open: Math.max(0, total - closed),
      closed,
      bound: outcomeCounts.policy_bound || 0,
      closeRate: percent(closed, total),
      boundRate: percent(outcomeCounts.policy_bound || 0, closed),
      range: selection.range,
      stages: stageKeys.map(key => ({ key, label: CONSULTATION_STAGE_LABELS[key], count: stageCounts[key] || 0, percentage: percent(stageCounts[key] || 0, total) })),
      outcomes: outcomeKeys.map(key => ({ key, label: CONSULTATION_OUTCOME_LABELS[key], count: outcomeCounts[key] || 0, percentage: percent(outcomeCounts[key] || 0, closed) })),
      sources: { campaigns: [], referrals: [], entries: [] },
      trend: { granularity: 'month', label: 'Monthly', selectedTotal: total, buckets: [] }
    };
  }

  function pipelineRow(item, kind) {
    const interactive = kind === 'stage';
    const listItem = document.createElement('div');
    listItem.className = 'consultation-pipeline__list-item';
    listItem.setAttribute('role', 'listitem');
    const row = document.createElement(interactive ? 'button' : 'div');
    row.className = 'consultation-pipeline__row';
    row.dataset[kind] = item.key;
    if (interactive) {
      row.type = 'button';
      row.dataset.pipelineStage = item.key;
      row.disabled = item.count === 0;
      row.setAttribute('aria-label', `${item.label}: ${item.count} consultation${item.count === 1 ? '' : 's'}. ${item.count ? 'Focus the queue on this stage.' : 'No consultations in this stage.'}`);
    }
    const copy = document.createElement('span');
    copy.className = 'consultation-pipeline__row-copy';
    const label = document.createElement('span');
    label.className = 'consultation-pipeline__row-label';
    const name = document.createElement('span');
    name.textContent = item.label;
    const share = document.createElement('span');
    share.textContent = `${item.percentage}%`;
    label.append(name, share);
    const bar = document.createElement('span');
    bar.className = 'consultation-pipeline__bar';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.className = 'consultation-pipeline__bar-fill';
    fill.style.width = `${Math.max(0, Math.min(100, Number(item.percentage) || 0))}%`;
    bar.appendChild(fill);
    copy.append(label, bar);
    const count = document.createElement('span');
    count.className = 'consultation-pipeline__row-count';
    count.textContent = String(item.count);
    row.append(copy, count);
    listItem.appendChild(row);
    return listItem;
  }

  function renderPipelineList(list, empty, items, kind) {
    if (!list || !empty) return false;
    const reported = Array.isArray(items) ? items.filter(item => item.count > 0) : [];
    const fragment = document.createDocumentFragment();
    reported.forEach(item => fragment.appendChild(pipelineRow(item, kind)));
    list.replaceChildren(fragment);
    list.hidden = reported.length === 0;
    empty.hidden = reported.length > 0;
    return true;
  }

  function pipelineTrendSvg(trend) {
    const buckets = Array.isArray(trend?.buckets) ? trend.buckets : [];
    if (!buckets.length) return '';
    const width = 960;
    const height = 280;
    const margin = { top: 22, right: 58, bottom: 54, left: 52 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxCount = Math.max(1, ...buckets.map(bucket => Number(bucket.consultations) || 0));
    const slot = plotWidth / buckets.length;
    const barWidth = Math.max(6, Math.min(34, slot * .52));
    const labelStep = Math.max(1, Math.ceil(buckets.length / 8));
    const bars = [];
    const points = [];
    const labels = [];
    buckets.forEach((bucket, index) => {
      const center = margin.left + slot * index + slot / 2;
      const consultations = Math.max(0, Number(bucket.consultations) || 0);
      const conversion = Math.max(0, Math.min(100, Number(bucket.conversionRate) || 0));
      const barHeight = consultations / maxCount * plotHeight;
      const barY = margin.top + plotHeight - barHeight;
      const pointY = margin.top + plotHeight - conversion / 100 * plotHeight;
      const safeLabel = escapeHtml(bucket.label || `Period ${index + 1}`);
      bars.push(`<rect class="consultation-pipeline__trend-bar" x="${(center - barWidth / 2).toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="4"><title>${safeLabel}: ${consultations} consultation${consultations === 1 ? '' : 's'}</title></rect>`);
      points.push({ x: center, y: pointY, label: safeLabel, conversion });
      if (index % labelStep === 0 || index === buckets.length - 1) {
        labels.push(`<text class="consultation-pipeline__trend-axis" x="${center.toFixed(2)}" y="${height - 20}" text-anchor="middle">${safeLabel}</text>`);
      }
    });
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const circles = points.map(point => `<circle class="consultation-pipeline__trend-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4"><title>${point.label}: ${point.conversion}% policy-bound conversion</title></circle>`).join('');
    const grid = [0, .5, 1].map(ratio => {
      const y = margin.top + plotHeight - ratio * plotHeight;
      const countLabel = Math.round(maxCount * ratio);
      const conversionLabel = Math.round(100 * ratio);
      return `<line class="consultation-pipeline__trend-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="consultation-pipeline__trend-axis" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${countLabel}</text><text class="consultation-pipeline__trend-axis" x="${width - margin.right + 10}" y="${y + 4}" text-anchor="start">${conversionLabel}%</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}${bars.join('')}<path class="consultation-pipeline__trend-line" d="${path}"></path>${circles}${labels.join('')}</svg>`;
  }

  function renderPipelineTrend(summary) {
    const chart = byId('pipelineTrendChart');
    const empty = byId('pipelineTrendEmpty');
    const tableWrap = byId('pipelineTrendTableWrap');
    const tableBody = byId('pipelineTrendTableBody');
    const meta = byId('pipelineTrendMeta');
    if (!chart || !empty || !tableWrap || !tableBody || !meta) return false;
    const trend = summary?.trend || { label: 'Monthly', buckets: [] };
    const buckets = Array.isArray(trend.buckets) ? trend.buckets : [];
    const available = buckets.length > 0;
    const undated = Math.max(0, Number(trend.undatedTotal) || 0);
    meta.textContent = available
      ? `${trend.label || 'Date'} buckets · ${Number(trend.datedTotal) || trend.selectedTotal || 0} dated record${(Number(trend.datedTotal) || trend.selectedTotal || 0) === 1 ? '' : 's'}${undated ? ` · ${undated} without a received date` : ''}`
      : 'No dated consultations in this range';
    chart.hidden = !available;
    empty.hidden = available;
    tableWrap.hidden = !available;
    if (!available) {
      chart.innerHTML = '';
      tableBody.replaceChildren();
      return true;
    }
    chart.innerHTML = pipelineTrendSvg(trend);
    chart.setAttribute?.('aria-label', `${trend.label || 'Date-bucketed'} consultation volume and policy-bound conversion trend across ${buckets.length} period${buckets.length === 1 ? '' : 's'}.`);
    const fragment = document.createDocumentFragment();
    buckets.forEach(bucket => {
      const row = document.createElement('tr');
      [
        bucket.label,
        String(bucket.consultations),
        String(bucket.closed),
        String(bucket.bound),
        `${bucket.closeRate}%`,
        `${bucket.conversionRate}%`
      ].forEach((value, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.setAttribute?.('scope', 'row');
        cell.textContent = value;
        row.appendChild(cell);
      });
      fragment.appendChild(row);
    });
    tableBody.replaceChildren(fragment);
    return true;
  }

  function syncPipelineExportControl(summary) {
    const control = byId('pipelineExportCsv');
    const message = byId('pipelineExportMessage');
    if (!control || !message) return false;
    const supported = typeof pipelineSummary?.buildCsv === 'function';
    const valid = summary?.range?.valid !== false;
    const count = Number(summary?.total) || 0;
    control.disabled = !supported || !valid || count === 0;
    control.setAttribute?.('aria-disabled', String(control.disabled));
    message.classList?.remove?.('is-error');
    message.textContent = !supported
      ? 'CSV export is unavailable in this build.'
      : !valid
        ? summary?.range?.error || 'Choose a valid reporting date range before exporting.'
        : count
          ? `CSV export will include ${count} consultation${count === 1 ? '' : 's'} in ${summary.range?.label || 'the selected date range'}.`
          : 'No consultations are available to export in this date range.';
    return true;
  }

  function handlePipelineCsvExport() {
    const message = byId('pipelineExportMessage');
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const result = pipelineSummary?.buildCsv?.(records, pipelineDateOptions());
    if (!result?.valid || !result.rowCount) {
      const error = result?.error || 'No consultations are available to export in this date range.';
      if (message) {
        message.textContent = error;
        message.classList?.add?.('is-error');
      }
      announce(error);
      return false;
    }
    const urlApi = window.URL || window.webkitURL;
    if (typeof window.Blob !== 'function' || !urlApi?.createObjectURL || !document.body?.appendChild) {
      const error = 'This browser could not prepare the pipeline CSV download.';
      if (message) {
        message.textContent = error;
        message.classList?.add?.('is-error');
      }
      announce(error);
      return false;
    }
    try {
      if (pipelineExportRevokeTimer !== null && typeof window.clearTimeout === 'function') window.clearTimeout(pipelineExportRevokeTimer);
      pipelineExportRevokeTimer = null;
      clearPipelineExportObjectUrl();
      const blob = new window.Blob([result.csv], { type: 'text/csv;charset=utf-8' });
      pipelineExportObjectUrl = urlApi.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = pipelineExportObjectUrl;
      link.download = result.filename;
      link.hidden = true;
      document.body.appendChild(link);
      link.click?.();
      link.remove?.();
      if (link.parentNode) link.parentNode.removeChild(link);
      if (typeof window.setTimeout === 'function') {
        pipelineExportRevokeTimer = window.setTimeout(() => {
          pipelineExportRevokeTimer = null;
          clearPipelineExportObjectUrl();
        }, 1000);
      }
      if (message) {
        message.textContent = `Downloaded ${result.rowCount} consultation${result.rowCount === 1 ? '' : 's'} as ${result.filename}.`;
        message.classList?.remove?.('is-error');
      }
      announce(`Pipeline CSV downloaded with ${result.rowCount} consultation${result.rowCount === 1 ? '' : 's'}.`);
      return true;
    } catch (_) {
      clearPipelineExportObjectUrl();
      const error = 'The pipeline CSV could not be downloaded. Try again.';
      if (message) {
        message.textContent = error;
        message.classList?.add?.('is-error');
      }
      announce(error);
      return false;
    }
  }

  function renderConsultationPipeline(records) {
    const region = byId('consultationPipeline');
    const meta = byId('consultationPipelineMeta');
    const stageList = byId('pipelineStageList');
    const outcomeList = byId('pipelineOutcomeList');
    const outcomeEmpty = byId('pipelineOutcomeEmpty');
    const campaignList = byId('pipelineCampaignList');
    const campaignEmpty = byId('pipelineCampaignEmpty');
    const referralList = byId('pipelineReferralList');
    const referralEmpty = byId('pipelineReferralEmpty');
    const entryList = byId('pipelineEntryList');
    const entryEmpty = byId('pipelineEntryEmpty');
    const dateMessage = byId('pipelineDateMessage');
    if (!region || !meta || !stageList || !outcomeList || !outcomeEmpty || !campaignList || !campaignEmpty || !referralList || !referralEmpty || !entryList || !entryEmpty || !dateMessage) return false;
    const options = syncPipelineDateControls();
    const summary = buildPipelineSummary(records, options);
    updateText(byId('pipelineTotalCount'), String(summary.total));
    updateText(byId('pipelineOpenCount'), String(summary.open));
    updateText(byId('pipelineClosedCount'), String(summary.closed));
    updateText(byId('pipelineBoundCount'), String(summary.bound));
    updateText(byId('pipelineTotalScope'), summary.range?.key === 'all' ? 'All synchronized records' : summary.range?.label || 'Selected date range');
    updateText(byId('pipelineOpenShare'), `${summary.total ? 100 - summary.closeRate : 0}% of pipeline`);
    updateText(byId('pipelineClosedShare'), `${summary.closeRate}% of pipeline`);
    updateText(byId('pipelineBoundShare'), `${summary.boundRate}% of closed`);
    const validRange = summary.range?.valid !== false;
    region.dataset.rangeState = validRange ? 'valid' : 'invalid';
    dateMessage.classList?.toggle?.('is-error', !validRange);
    dateMessage.textContent = validRange
      ? `${summary.range?.label || 'All time'} · ${summary.total} of ${summary.availableTotal} synchronized record${summary.availableTotal === 1 ? '' : 's'} included.`
      : summary.range?.error || 'Choose a valid reporting date range.';
    meta.textContent = validRange
      ? `${summary.total} consultation${summary.total === 1 ? '' : 's'} · ${summary.open} open · ${summary.closed} closed`
      : 'Date range needs attention';
    syncPipelineExportControl(summary);
    const signature = stableSignature(summary);
    if (signature !== lastPipelineSummarySignature) {
      const stageFragment = document.createDocumentFragment();
      summary.stages.forEach(item => stageFragment.appendChild(pipelineRow(item, 'stage')));
      stageList.replaceChildren(stageFragment);
      renderPipelineList(outcomeList, outcomeEmpty, summary.outcomes, 'outcome');
      renderPipelineList(campaignList, campaignEmpty, summary.sources?.campaigns, 'campaign');
      renderPipelineList(referralList, referralEmpty, summary.sources?.referrals, 'referral');
      renderPipelineList(entryList, entryEmpty, summary.sources?.entries, 'entry');
      renderPipelineTrend(summary);
      lastPipelineSummarySignature = signature;
    }
    region.dataset.state = !validRange ? 'invalid' : summary.total ? 'ready' : 'empty';
    return true;
  }

  function handlePipelineDateChange(event) {
    const rangeControl = byId('pipelineDateRange');
    const range = plainText(rangeControl?.value, 'all');
    if (range === 'custom') syncPipelineDateControls({ range });
    lastPipelineSummarySignature = '';
    lastConsultationQueueSignature = '';
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    renderConsultationPipeline(records);
    renderConsultationQueue(records, plainText(byId('consultationRecordSelect')?.value));
    const options = pipelineDateOptions();
    const resolved = pipelineSummary?.resolveDateRange?.(options);
    if (resolved?.valid === false) announce(resolved.error || 'Choose a valid reporting date range.');
    else if (event?.target) announce(`Pipeline reporting updated to ${resolved?.label || 'the selected date range'}.`);
  }

  function handlePipelineStageClick(event) {
    const control = event.target.closest?.('[data-pipeline-stage]');
    const stage = plainText(control?.dataset?.pipelineStage);
    const filter = byId('consultationStageFilter');
    if (!stage || !filter || control.disabled) return;
    filter.value = stage;
    activeInboxQuickFilter = 'all';
    const advanced = byId('consultationAdvancedFilters');
    if (advanced) advanced.open = true;
    renderQueueFromCurrentRecords();
    setWorkspaceView('inbox', { focus: true });
    announce(`Consultation inbox filtered to ${CONSULTATION_STAGE_LABELS[stage] || stage}.`);
    safeScrollIntoView(byId('consultationQueueTitle'), { block: 'start' });
  }

  function renderConsultationQueue(records, activeId) {
    const list = byId('consultationQueueList');
    const empty = byId('consultationQueueEmpty');
    const meta = byId('consultationQueueMeta');
    if (!list || !empty || !meta) return false;
    const query = plainText(byId('consultationSearch')?.value);
    const statusFilter = plainText(byId('consultationStatusFilter')?.value, 'all');
    const followUpFilter = plainText(byId('consultationFollowUpFilter')?.value, 'all');
    const stageFilter = plainText(byId('consultationStageFilter')?.value, 'all');
    const dateSelection = pipelineRecordSelection(records, pipelineDateOptions());
    const dateScopedRecords = Array.isArray(dateSelection.records) ? dateSelection.records : [];
    const quickFilter = activeInboxQuickFilter;
    const filtered = sortQueueRecords(dateScopedRecords.filter(record => recordMatchesQueue(record, query, statusFilter, followUpFilter, stageFilter) && recordMatchesInboxQuickFilter(record, quickFilter)));
    const signature = stableSignature({
      activeId,
      query,
      statusFilter,
      followUpFilter,
      stageFilter,
      quickFilter,
      dateRange: dateSelection.range,
      records: filtered.map(record => [
        record.id,
        record.status,
        record.customer?.name,
        record.customer?.email,
        record.customer?.phone,
        record.customer?.propertyAddress,
        record.customer?.reviewContext,
        record.remote?.status,
        record.remote?.followUp,
        record.remote?.disposition,
        record.disposition
      ])
    });
    if (signature !== lastConsultationQueueSignature) {
      const fragment = document.createDocumentFragment();
      filtered.forEach(record => {
        const item = document.createElement('article');
        const needsAttention = recordNeedsInboxAttention(record);
        item.className = `consultation-queue__item${record.id === activeId ? ' is-active' : ''}${needsAttention ? ' needs-attention' : ''}`;
        item.setAttribute('role', 'listitem');
        item.dataset.attention = needsAttention ? 'true' : 'false';

        const copy = document.createElement('div');
        copy.className = 'consultation-queue__item-copy';

        const title = document.createElement('div');
        title.className = 'consultation-queue__item-title';
        const name = document.createElement('strong');
        name.textContent = plainText(record.customer?.name, 'Unnamed homeowner');
        const status = document.createElement('span');
        status.className = 'consultation-queue__status';
        status.dataset.state = consultationStatus(record);
        status.textContent = consultationStatusLabel(record);
        title.append(name, status);

        const reason = document.createElement('span');
        reason.className = 'consultation-queue__item-reason';
        reason.textContent = plainText(record.customer?.reviewContext, 'General coverage review');

        const details = document.createElement('span');
        details.className = 'consultation-queue__item-meta';
        const receivedAt = plainText(record?.remote?.deliveredAt || record?.createdAt);
        details.textContent = [
          plainText(record.customer?.propertyAddress, 'Address not provided'),
          receivedAt ? `Received ${displayDateTime(receivedAt)}` : 'Received date unavailable'
        ].join(' · ');

        const followUpDisplayValue = followUpDisplay(record);
        const followUp = document.createElement('span');
        followUp.className = 'consultation-queue__item-follow-up';
        followUp.dataset.state = followUpDisplayValue.state;
        followUp.textContent = followUpDisplayValue.text;

        const stage = document.createElement('span');
        stage.className = 'consultation-queue__stage';
        stage.dataset.stage = dispositionDetails(record).stage;
        stage.textContent = dispositionDetails(record).stage === 'closed'
          ? `${consultationStageLabel(record)} · ${consultationOutcomeLabel(record)}`
          : consultationStageLabel(record);

        const signals = document.createElement('div');
        signals.className = 'consultation-queue__item-signals';
        signals.append(stage, followUp);

        copy.append(title, reason, details, signals);

        const open = document.createElement('button');
        open.className = 'button button--primary button--compact cf-button cf-button--primary cf-button--compact';
        open.type = 'button';
        open.dataset.consultationOpen = record.id;
        open.textContent = record.id === activeId ? 'Continue review' : 'Open review';
        open.setAttribute('aria-label', `${record.id === activeId ? 'Continue consultation for' : 'Open consultation for'} ${plainText(record.customer?.name, 'homeowner')}`);

        item.append(copy, open);
        fragment.appendChild(item);
      });
      list.replaceChildren(fragment);
      lastConsultationQueueSignature = signature;
    }
    empty.hidden = filtered.length > 0;
    renderInboxSummary(records);
    syncInboxFilterSummary();
    const overdue = dateScopedRecords.filter(record => followUpTiming(record) === 'overdue').length;
    const today = dateScopedRecords.filter(record => followUpTiming(record) === 'today').length;
    const attention = dateScopedRecords.filter(recordNeedsInboxAttention).length;
    const rangeLabel = dateSelection.range?.valid === false ? 'invalid date range' : (dateSelection.range?.label || 'All time');
    meta.textContent = `${filtered.length} of ${dateScopedRecords.length} shown${attention ? ` · ${attention} need attention` : ''}${overdue ? ` · ${overdue} overdue` : ''}${today ? ` · ${today} due today` : ''}${rangeLabel !== 'All time' ? ` · ${rangeLabel}` : ''}${records.length !== dateScopedRecords.length ? ` · ${records.length} total saved` : ''}`;
    return true;
  }

  function setFollowUpMessage(message, tone) {
    const target = byId('consultationFollowUpMessage');
    if (!target) return;
    target.textContent = message;
    target.classList?.toggle?.('is-error', tone === 'error');
    target.classList?.toggle?.('is-success', tone === 'success');
  }

  function renderConsultationFollowUp(record) {
    const form = byId('consultationFollowUpForm');
    const badge = byId('consultationFollowUpBadge');
    const dateInput = byId('consultationFollowUpDate');
    const noteInput = byId('consultationFollowUpNote');
    const save = byId('saveConsultationFollowUp');
    const complete = byId('completeConsultationFollowUp');
    const clear = byId('clearConsultationFollowUp');
    if (!form || !badge || !dateInput || !noteInput || !save || !complete || !clear) return false;
    const serverBacked = Boolean(record?.remote?.serverBacked);
    form.hidden = !serverBacked;
    if (!serverBacked) {
      lastFollowUpFormSignature = '';
      return false;
    }
    const followUp = followUpDetails(record);
    const pending = followUpPending.has(record.id);
    const connected = remoteInboxConnection().connected;
    const signature = stableSignature([record.id, followUp, connected, pending]);
    if (signature !== lastFollowUpFormSignature) {
      dateInput.value = followUp.dueDate;
      noteInput.value = followUp.note;
      lastFollowUpFormSignature = signature;
    }
    badge.dataset.state = followUp.state;
    badge.textContent = followUp.state === 'completed'
      ? 'Completed'
      : followUp.state === 'scheduled'
        ? (followUpTiming(record) === 'overdue' ? 'Overdue' : followUpTiming(record) === 'today' ? 'Due today' : 'Scheduled')
        : 'Not scheduled';
    form.setAttribute('aria-busy', String(pending));
    dateInput.disabled = pending || !connected;
    noteInput.disabled = pending || !connected;
    save.disabled = pending || !connected;
    complete.disabled = pending || !connected || followUp.state !== 'scheduled';
    clear.disabled = pending || !connected || followUp.state === 'none';
    save.textContent = pending ? 'Saving…' : 'Save follow-up';
    complete.textContent = pending ? 'Updating…' : 'Mark complete';
    clear.textContent = pending ? 'Updating…' : 'Clear';
    if (followUpFeedback?.recordId === record.id) {
      setFollowUpMessage(followUpFeedback.message, followUpFeedback.tone);
    } else if (!connected) setFollowUpMessage('Connect the secure producer inbox to schedule or update follow-up.', '');
    else if (followUp.state === 'completed') setFollowUpMessage(`Follow-up completed${followUp.completedAt ? ` ${displayDateTime(followUp.completedAt)}` : ''}. Schedule a new date to reopen the queue item.`, 'success');
    else if (followUp.state === 'scheduled') setFollowUpMessage(`${followUpDisplay(record).text}. Changes sync with the secure producer inbox.`, followUpTiming(record) === 'overdue' ? 'error' : 'success');
    else setFollowUpMessage('Choose a date and add an optional action note.', '');
    return true;
  }

  function activeRecordFromWorkspace() {
    const activeId = plainText(byId('consultationRecordSelect')?.value);
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    return activeConsultationRecord(records, activeId);
  }

  async function saveActiveFollowUp(event) {
    event?.preventDefault?.();
    const record = activeRecordFromWorkspace();
    if (!record?.remote?.serverBacked) return null;
    const dueDate = plainText(byId('consultationFollowUpDate')?.value);
    const note = plainText(byId('consultationFollowUpNote')?.value).slice(0, 240);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setFollowUpMessage('Choose a valid follow-up date.', 'error');
      byId('consultationFollowUpDate')?.focus?.();
      return null;
    }
    if (!remoteInboxConnection().connected) {
      setFollowUpMessage('Connect the secure producer inbox before scheduling follow-up.', 'error');
      return null;
    }
    if (followUpPending.has(record.id)) return null;
    followUpPending.add(record.id);
    renderConsultationFollowUp(record);
    try {
      const result = await remoteInbox.scheduleFollowUp(record.id, dueDate, note);
      followUpFeedback = null;
      announce(`Follow-up scheduled for ${plainText(record.customer?.name, 'the selected homeowner')} on ${displayDate(`${dueDate}T12:00:00`)}.`);
      return result;
    } catch (error) {
      followUpFeedback = {
        recordId: record.id,
        message: error?.status === 401 ? 'The producer inbox connection expired. Reconnect and try again.' : 'The follow-up could not be saved. Try again.',
        tone: 'error'
      };
      setFollowUpMessage(followUpFeedback.message, followUpFeedback.tone);
      return null;
    } finally {
      followUpPending.delete(record.id);
      lastFollowUpFormSignature = '';
      if (!workspaceDisposed) render();
    }
  }

  async function completeActiveFollowUp() {
    const record = activeRecordFromWorkspace();
    if (!record?.remote?.serverBacked || followUpDetails(record).state !== 'scheduled' || followUpPending.has(record.id)) return null;
    followUpPending.add(record.id);
    renderConsultationFollowUp(record);
    try {
      const result = await remoteInbox.completeFollowUp(record.id);
      followUpFeedback = null;
      announce(`Follow-up completed for ${plainText(record.customer?.name, 'the selected homeowner')}.`);
      return result;
    } catch (error) {
      followUpFeedback = { recordId: record.id, message: 'The follow-up could not be marked complete. Try again.', tone: 'error' };
      setFollowUpMessage(followUpFeedback.message, followUpFeedback.tone);
      return null;
    } finally {
      followUpPending.delete(record.id);
      lastFollowUpFormSignature = '';
      if (!workspaceDisposed) render();
    }
  }

  async function clearActiveFollowUp() {
    const record = activeRecordFromWorkspace();
    if (!record?.remote?.serverBacked || followUpDetails(record).state === 'none' || followUpPending.has(record.id)) return null;
    followUpPending.add(record.id);
    renderConsultationFollowUp(record);
    try {
      const result = await remoteInbox.clearFollowUp(record.id);
      followUpFeedback = null;
      announce(`Cleared follow-up for ${plainText(record.customer?.name, 'the selected homeowner')}.`);
      return result;
    } catch (error) {
      followUpFeedback = { recordId: record.id, message: 'The follow-up could not be cleared. Try again.', tone: 'error' };
      setFollowUpMessage(followUpFeedback.message, followUpFeedback.tone);
      return null;
    } finally {
      followUpPending.delete(record.id);
      lastFollowUpFormSignature = '';
      if (!workspaceDisposed) render();
    }
  }


  function setDispositionMessage(message, tone) {
    const target = byId('consultationDispositionMessage');
    if (!target) return;
    target.textContent = message;
    target.classList?.toggle?.('is-error', tone === 'error');
    target.classList?.toggle?.('is-success', tone === 'success');
  }

  function syncDispositionOutcomeControl() {
    const stage = plainText(byId('consultationStage')?.value, 'review_received');
    const outcome = byId('consultationOutcome');
    if (!outcome) return false;
    const closed = stage === 'closed';
    outcome.disabled = !closed || dispositionPending.size > 0;
    outcome.required = closed;
    if (!closed) outcome.value = 'none';
    return closed;
  }

  function renderConsultationDisposition(record) {
    const form = byId('consultationDispositionForm');
    const badge = byId('consultationDispositionBadge');
    const stageInput = byId('consultationStage');
    const outcomeInput = byId('consultationOutcome');
    const noteInput = byId('consultationDispositionNote');
    const save = byId('saveConsultationDisposition');
    if (!form || !badge || !stageInput || !outcomeInput || !noteInput || !save || !record) return false;
    const disposition = dispositionDetails(record);
    const pending = dispositionPending.has(record.id);
    const serverBacked = Boolean(record.remote?.serverBacked);
    const connected = remoteInboxConnection().connected;
    const editable = !pending && (!serverBacked || connected);
    const signature = stableSignature([record.id, disposition, serverBacked, connected, pending]);
    if (signature !== lastDispositionFormSignature) {
      stageInput.value = disposition.stage;
      outcomeInput.value = disposition.outcome;
      noteInput.value = disposition.note;
      lastDispositionFormSignature = signature;
    }
    badge.dataset.stage = disposition.stage;
    badge.textContent = disposition.stage === 'closed' ? `${consultationStageLabel(record)} · ${consultationOutcomeLabel(record)}` : consultationStageLabel(record);
    form.setAttribute('aria-busy', String(pending));
    stageInput.disabled = !editable;
    noteInput.disabled = !editable;
    save.disabled = !editable;
    syncDispositionOutcomeControl();
    if (disposition.stage === 'closed') outcomeInput.disabled = !editable;
    save.textContent = pending ? 'Saving…' : disposition.stage === 'closed' ? 'Save outcome' : 'Save stage';
    if (dispositionFeedback?.recordId === record.id) setDispositionMessage(dispositionFeedback.message, dispositionFeedback.tone);
    else if (serverBacked && !connected) setDispositionMessage('Connect the secure producer inbox to update stage or outcome.', '');
    else if (disposition.stage === 'closed') setDispositionMessage(`Closed${disposition.closedAt ? ` ${displayDateTime(disposition.closedAt)}` : ''} · ${consultationOutcomeLabel(record)}.`, 'success');
    else setDispositionMessage(serverBacked ? 'Stage changes sync with the secure producer inbox.' : 'This stage is saved in the current browser.', '');
    return true;
  }

  function setCompletionMessage(message, tone) {
    const target = byId('consultationCompletionMessage');
    if (!target) return;
    target.textContent = message;
    target.classList?.toggle?.('is-error', tone === 'error');
    target.classList?.toggle?.('is-success', tone === 'success');
  }

  function syncCompletionConditionalFields() {
    const unresolvedState = plainText(byId('consultationCompletionUnresolvedState')?.value, 'open');
    const unresolvedField = byId('consultationCompletionUnresolvedField');
    const unresolved = byId('consultationCompletionUnresolved');
    const quoteState = plainText(byId('consultationCompletionQuoteState')?.value, 'not_requested');
    const quoteField = byId('consultationCompletionQuoteField');
    const quote = byId('consultationCompletionQuoteRequirements');
    if (unresolvedField) unresolvedField.hidden = unresolvedState === 'none';
    if (unresolved) {
      unresolved.required = unresolvedState === 'open';
      if (unresolvedState === 'none') unresolved.value = '';
    }
    if (quoteField) quoteField.hidden = quoteState === 'not_requested';
    if (quote) {
      quote.required = quoteState === 'needs_items';
      if (quoteState === 'not_requested') quote.value = '';
    }
    return true;
  }

  function renderConsultationCompletion(record, snapshot) {
    const region = byId('consultationCompletion');
    const form = byId('consultationCompletionForm');
    const badge = byId('consultationCompletionBadge');
    const save = byId('saveConsultationCompletion');
    if (!region || !form || !badge || !save || !record || !consultationCompletion?.build) return false;
    const model = consultationCompletion.build(snapshot || currentWorkspaceSnapshot, record);
    const value = model.completion;
    const pending = completionPending.has(record.id);
    const serverBacked = Boolean(record?.remote?.serverBacked);
    const connected = remoteInboxConnection().connected;
    const editable = !pending && (!serverBacked || connected);
    const signature = stableSignature([record.id, value, model.decisions, model.evidence, model.followUp, serverBacked, connected, pending]);
    if (signature !== lastCompletionFormSignature) {
      byId('consultationCompletionDecision').value = value.decisionSummary;
      byId('consultationCompletionUnresolvedState').value = value.unresolvedState;
      byId('consultationCompletionUnresolved').value = value.unresolvedSummary;
      byId('consultationCompletionQuoteState').value = value.quoteState;
      byId('consultationCompletionQuoteRequirements').value = value.quoteRequirements;
      byId('consultationCompletionNextAction').value = value.nextAction;
      lastCompletionFormSignature = signature;
    }
    region.dataset.state = model.status;
    badge.dataset.state = model.status;
    badge.textContent = model.status === 'complete' ? 'Closeout saved' : 'Closeout needed';
    updateText(byId('consultationCompletionDecisionCount'), `${model.decisions.length} finding decision${model.decisions.length === 1 ? '' : 's'}`);
    const decisionList = byId('consultationCompletionDecisionList');
    if (decisionList) decisionList.innerHTML = model.decisions.length
      ? model.decisions.map(item => `<li><span>${escapeHtml(item.title)}</span><strong>${escapeHtml(item.label)}</strong></li>`).join('')
      : '<li><span>No ranked findings</span><strong>Review manually</strong></li>';
    const totalOpen = model.evidence.openCount + model.evidence.findingOpenCount;
    updateText(byId('consultationCompletionOpenCount'), `${totalOpen} open signal${totalOpen === 1 ? '' : 's'}`);
    updateText(byId('consultationCompletionOpenDetail'), `${model.evidence.openCount} assessment confirmation item${model.evidence.openCount === 1 ? '' : 's'} · ${model.evidence.findingOpenCount} finding${model.evidence.findingOpenCount === 1 ? '' : 's'} unverified, deferred, or undecided.`);
    updateText(byId('consultationCompletionFollowUpState'), model.followUp.state === 'scheduled' ? `Scheduled${model.followUp.dueDate ? ` · ${displayDate(`${model.followUp.dueDate}T12:00:00`)}` : ''}` : model.followUp.state === 'completed' ? 'Follow-up completed' : model.followUp.state === 'local' ? 'Local record' : 'Not scheduled');
    updateText(byId('consultationCompletionFollowUpDetail'), model.followUp.note || (model.followUp.state === 'local' ? 'Use the next-action field to assign the next touchpoint.' : 'Use the existing follow-up controls below after saving this closeout.'));
    form.setAttribute?.('aria-busy', String(pending));
    form.querySelectorAll?.('textarea, select').forEach(control => { control.disabled = !editable; });
    save.disabled = !editable;
    save.textContent = pending ? 'Saving…' : model.status === 'complete' ? 'Update consultation closeout' : 'Save consultation closeout';
    syncCompletionConditionalFields();
    if (completionFeedback?.recordId === record.id) setCompletionMessage(completionFeedback.message, completionFeedback.tone);
    else if (serverBacked && !connected) setCompletionMessage('Connect the secure producer inbox to save this closeout.', '');
    else if (model.status === 'complete') setCompletionMessage(`Closeout saved${value.completedAt ? ` ${displayDateTime(value.completedAt)}` : ''}. Update it if the consultation changes.`, 'success');
    else setCompletionMessage('Complete all required closeout fields before saving.', '');
    updateText(byId('consultationCompletionGuardrail'), model.guardrail);
    window.CoverageFitAgentWorkspaceConsultationCompletion = model;
    return true;
  }

  async function saveActiveCompletion(event) {
    event?.preventDefault?.();
    const record = activeRecordFromWorkspace();
    if (!record || completionPending.has(record.id) || !consultationCompletion?.prepare) return null;
    const prepared = consultationCompletion.prepare({
      decisionSummary: byId('consultationCompletionDecision')?.value,
      unresolvedState: byId('consultationCompletionUnresolvedState')?.value,
      unresolvedSummary: byId('consultationCompletionUnresolved')?.value,
      quoteState: byId('consultationCompletionQuoteState')?.value,
      quoteRequirements: byId('consultationCompletionQuoteRequirements')?.value,
      nextAction: byId('consultationCompletionNextAction')?.value,
      completedAt: record?.remote?.completion?.completedAt || record?.completion?.completedAt
    });
    if (!prepared.valid) {
      const first = prepared.errors[0];
      setCompletionMessage(first?.message || 'Review the consultation closeout.', 'error');
      byId(`consultationCompletion${({ decisionSummary: 'Decision', unresolvedSummary: 'Unresolved', quoteRequirements: 'QuoteRequirements', nextAction: 'NextAction' })[first?.field] || 'Decision'}`)?.focus?.();
      return null;
    }
    if (record.remote?.serverBacked && !remoteInboxConnection().connected) {
      setCompletionMessage('Connect the secure producer inbox before saving this closeout.', 'error');
      return null;
    }
    completionPending.add(record.id);
    renderConsultationCompletion(record, currentWorkspaceSnapshot);
    try {
      const result = record.remote?.serverBacked
        ? await remoteInbox.updateCompletion(record.id, prepared.completion)
        : data?.updateConsultationCompletion?.(record.id, prepared.completion) || window.CoverageFitConsultationRecords?.updateCompletion?.(record.id, prepared.completion);
      if (!result) throw new Error('Consultation completion update failed');
      completionFeedback = { recordId: record.id, message: 'Consultation closeout saved. Stage moved to Consultation completed when appropriate.', tone: 'success' };
      announce(`Consultation closeout saved for ${plainText(record.customer?.name, 'the selected homeowner')}.`);
      return result;
    } catch (error) {
      completionFeedback = { recordId: record.id, message: error?.status === 401 ? 'The producer inbox connection expired. Reconnect and try again.' : 'The consultation closeout could not be saved. Review the required fields and try again.', tone: 'error' };
      setCompletionMessage(completionFeedback.message, completionFeedback.tone);
      return null;
    } finally {
      completionPending.delete(record.id);
      lastCompletionFormSignature = '';
      if (!workspaceDisposed) render();
    }
  }

  async function saveActiveDisposition(event) {
    event?.preventDefault?.();
    const record = activeRecordFromWorkspace();
    if (!record || dispositionPending.has(record.id)) return null;
    const stage = plainText(byId('consultationStage')?.value, 'review_received');
    const outcome = stage === 'closed' ? plainText(byId('consultationOutcome')?.value, 'none') : 'none';
    const note = plainText(byId('consultationDispositionNote')?.value).slice(0, 240);
    if (stage === 'closed' && outcome === 'none') {
      setDispositionMessage('Choose a final outcome before closing the consultation.', 'error');
      byId('consultationOutcome')?.focus?.();
      return null;
    }
    if (record.remote?.serverBacked && !remoteInboxConnection().connected) {
      setDispositionMessage('Connect the secure producer inbox before updating this consultation.', 'error');
      return null;
    }
    dispositionPending.add(record.id);
    renderConsultationDisposition(record);
    try {
      let result;
      if (record.remote?.serverBacked) result = await remoteInbox.updateDisposition(record.id, { stage, outcome, note });
      else result = data?.updateConsultationDisposition?.(record.id, { stage, outcome, note }) || window.CoverageFitConsultationRecords?.updateDisposition?.(record.id, { stage, outcome, note });
      if (!result) throw new Error('Disposition update failed');
      dispositionFeedback = { recordId: record.id, message: stage === 'closed' ? `Consultation closed as ${CONSULTATION_OUTCOME_LABELS[outcome]}.` : `Consultation moved to ${CONSULTATION_STAGE_LABELS[stage]}.`, tone: 'success' };
      announce(dispositionFeedback.message);
      return result;
    } catch (error) {
      dispositionFeedback = { recordId: record.id, message: error?.status === 401 ? 'The producer inbox connection expired. Reconnect and try again.' : 'The consultation stage or outcome could not be saved. Try again.', tone: 'error' };
      setDispositionMessage(dispositionFeedback.message, dispositionFeedback.tone);
      return null;
    } finally {
      dispositionPending.delete(record.id);
      lastDispositionFormSignature = '';
      if (!workspaceDisposed) render();
    }
  }

  function renderQueueFromCurrentRecords() {
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    return renderConsultationQueue(records, plainText(byId('consultationRecordSelect')?.value));
  }

  function setInboxQuickFilter(value, options) {
    const next = ['all', 'attention', 'new', 'today'].includes(value) ? value : 'all';
    activeInboxQuickFilter = next;
    lastConsultationQueueSignature = '';
    renderQueueFromCurrentRecords();
    if (options?.announce) announce(`${next === 'all' ? 'All homeowner reviews' : `${next === 'attention' ? 'Reviews needing attention' : next === 'today' ? 'Reviews due today' : 'New reviews'}`} shown.`);
    return next;
  }

  function clearInboxFilters(options) {
    const search = byId('consultationSearch');
    const status = byId('consultationStatusFilter');
    const stage = byId('consultationStageFilter');
    const followUp = byId('consultationFollowUpFilter');
    if (search) search.value = '';
    if (status) status.value = 'all';
    if (stage) stage.value = 'all';
    if (followUp) followUp.value = 'all';
    activeInboxQuickFilter = 'all';
    lastConsultationQueueSignature = '';
    renderQueueFromCurrentRecords();
    if (options?.focus) search?.focus?.();
    if (options?.announce !== false) announce('Inbox filters cleared. All homeowner reviews shown.');
  }

  function handleInboxSummaryClick(event) {
    const control = event.target.closest?.('[data-inbox-quick-filter]');
    if (!control) return;
    setInboxQuickFilter(plainText(control.dataset.inboxQuickFilter), { announce: true });
  }

  function handleInboxFilterChange(event) {
    if (event?.target?.matches?.('select')) activeInboxQuickFilter = 'all';
    lastConsultationQueueSignature = '';
    renderQueueFromCurrentRecords();
  }

  function focusRemoteInboxConnection() {
    setRemoteInboxExpanded(true, { remember: true });
    safeScrollIntoView(byId('remoteInboxBar'), { block: 'start' });
    window.setTimeout(() => byId('remoteInboxToken')?.focus?.(), 220);
  }

  function handleInboxAction(event) {
    const control = event.target.closest?.('[data-inbox-action]');
    if (!control) return;
    const action = plainText(control.dataset.inboxAction);
    if (action === 'connect') focusRemoteInboxConnection();
    if (action === 'sync') syncRemoteInbox();
    if (action === 'clear-filters') clearInboxFilters({ focus: true });
  }

  function handleConsultationQueueClick(event) {
    const control = event.target.closest?.('[data-consultation-open]');
    const consultationId = plainText(control?.dataset?.consultationOpen);
    if (!consultationId) return;
    openConsultationRecord(consultationId);
  }



  function consultationActivity(record) {
    if (!record?.remote?.serverBacked) return [];
    const events = Array.isArray(record.remote.activity) ? record.remote.activity.slice() : [];
    return events.filter(event => event && event.id && event.type && event.occurredAt)
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  }

  function activityTitle(event) {
    return plainText(event?.title, ({
      delivered: 'Review delivered', opened: 'Review opened', acknowledged: 'Review acknowledged',
      follow_up_scheduled: 'Follow-up scheduled', follow_up_updated: 'Follow-up updated',
      follow_up_completed: 'Follow-up completed', follow_up_cleared: 'Follow-up cleared',
      stage_changed: 'Consultation stage changed', outcome_recorded: 'Final outcome recorded',
      consultation_reopened: 'Consultation reopened', disposition_updated: 'Consultation disposition updated',
      consultation_completion_saved: 'Consultation completion saved',
      producer_note: 'Producer note added', consultation_document_opened: 'Consultation document opened',
      customer_report_opened: 'Customer report opened', producer_notified: 'Producer email alert sent'
    })[plainText(event?.type)] || 'Consultation activity');
  }

  function setNoteMessage(message, tone) {
    const region = byId('consultationNoteMessage');
    if (!region) return;
    region.textContent = message;
    region.classList?.toggle?.('is-error', tone === 'error');
    region.classList?.toggle?.('is-success', tone === 'success');
  }

  function renderConsultationActivity(record) {
    const region = byId('consultationNotesActivity');
    const form = byId('consultationNoteForm');
    const textarea = byId('consultationNoteText');
    const button = byId('saveConsultationNote');
    const count = byId('consultationActivityCount');
    const list = byId('consultationActivityList');
    const empty = byId('consultationActivityEmpty');
    if (!region || !form || !textarea || !button || !count || !list || !empty || !record) return false;
    region.hidden = false;
    const serverBacked = Boolean(record.remote?.serverBacked);
    const connected = remoteInboxConnection().connected;
    const pending = notePending.has(record.id);
    const events = consultationActivity(record);
    form.hidden = !serverBacked;
    textarea.disabled = pending || !connected;
    button.disabled = pending || !connected;
    button.setAttribute?.('aria-busy', String(pending));
    button.textContent = pending ? 'Saving…' : 'Add note';
    if (!serverBacked) setNoteMessage('Producer notes and server activity are available for remotely delivered consultations.', '');
    else if (noteFeedback?.recordId === record.id) setNoteMessage(noteFeedback.message, noteFeedback.tone);
    else if (!connected) setNoteMessage('Connect the secure producer inbox to add a persistent note.', '');
    else setNoteMessage('Notes are saved to the secure producer inbox and appear in this activity timeline.', '');
    count.textContent = events.length ? `${events.length} activit${events.length === 1 ? 'y' : 'ies'} · latest first` : 'No activity yet';
    const signature = stableSignature(events);
    if (signature !== lastActivitySignature) {
      const fragment = document.createDocumentFragment();
      events.forEach(event => {
        const item = document.createElement('li');
        item.className = 'consultation-activity-item';
        item.dataset.type = plainText(event.type, 'activity');
        const marker = document.createElement('span');
        marker.className = 'consultation-activity-item__marker';
        marker.setAttribute('aria-hidden', 'true');
        const body = document.createElement('div');
        body.className = 'consultation-activity-item__body';
        const topline = document.createElement('div');
        topline.className = 'consultation-activity-item__topline';
        const title = document.createElement('strong');
        title.textContent = activityTitle(event);
        const time = document.createElement('time');
        time.dateTime = plainText(event.occurredAt);
        time.textContent = displayDateTime(event.occurredAt) || 'Time unavailable';
        topline.append(title, time);
        body.appendChild(topline);
        if (plainText(event.detail)) {
          const detail = document.createElement('p');
          detail.textContent = plainText(event.detail);
          body.appendChild(detail);
        }
        const actor = document.createElement('span');
        actor.className = 'consultation-activity-item__actor';
        actor.textContent = plainText(event.actor, 'CoverageFit');
        body.appendChild(actor);
        item.append(marker, body);
        fragment.appendChild(item);
      });
      list.replaceChildren(fragment);
      lastActivitySignature = signature;
    }
    list.hidden = !events.length;
    empty.hidden = Boolean(events.length);
    empty.textContent = serverBacked
      ? 'No consultation activity has been recorded yet.'
      : 'This browser-local consultation has no server-backed activity timeline.';
    return true;
  }

  async function saveActiveConsultationNote(event) {
    event?.preventDefault?.();
    const activeId = plainText(byId('consultationRecordSelect')?.value);
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const record = activeConsultationRecord(records, activeId);
    const textarea = byId('consultationNoteText');
    const note = plainText(textarea?.value);
    if (!record?.remote?.serverBacked || !note || notePending.has(record.id)) return null;
    if (!remoteInboxConnection().connected) {
      setNoteMessage('Connect the secure producer inbox before adding a note.', 'error');
      return null;
    }
    notePending.add(record.id);
    noteFeedback = null;
    renderConsultationActivity(record);
    try {
      const result = await remoteInbox.addNote(record.id, note);
      if (textarea) textarea.value = '';
      noteFeedback = { recordId: record.id, message: 'Producer note saved to the consultation record.', tone: 'success' };
      announce(`Producer note saved for ${text(record.customer?.name, 'the selected homeowner')}.`);
      return result;
    } catch (error) {
      noteFeedback = { recordId: record.id, message: 'The producer note could not be saved. Try again.', tone: 'error' };
      return null;
    } finally {
      notePending.delete(record.id);
      if (!workspaceDisposed) render();
    }
  }

  function logConsultationDocumentActivity() {
    const activeId = plainText(byId('consultationRecordSelect')?.value);
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const record = activeConsultationRecord(records, activeId);
    if (!record?.remote?.serverBacked || !remoteInboxConnection().connected || !remoteInbox?.logActivity) return;
    remoteInbox.logActivity(record.id, 'consultation_document_opened').catch(() => {});
  }

  function logCustomerReportActivity(event) {
    const activeId = plainText(byId('consultationRecordSelect')?.value);
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const record = activeConsultationRecord(records, activeId);
    if (!cacheCustomerReportPreview(record)) {
      event?.preventDefault?.();
      announce('The customer report preview could not be prepared in this browser. Refresh the Workspace and try again.');
      return;
    }
    if (!record?.remote?.serverBacked || !remoteInboxConnection().connected || !remoteInbox?.logActivity) return;
    remoteInbox.logActivity(record.id, 'customer_report_opened').catch(() => {});
  }

  function activeConsultationRecord(records, activeId) {
    const summary = records.find(record => record.id === activeId) || null;
    if (!activeId || typeof data?.getConsultation !== 'function') return summary;
    return data.getConsultation(activeId) || summary;
  }

  function maybeMarkConsultationOpened(record) {
    if (!record?.remote?.serverBacked || consultationStatus(record) !== 'new') return false;
    if (!remoteInboxConnection().connected || !remoteInbox?.markOpened || remoteStatusPending.has(record.id)) return false;
    remoteStatusPending.add(record.id);
    renderConsultationDelivery(record);
    Promise.resolve().then(async () => {
      try {
        await remoteInbox.markOpened(record.id);
        if (!workspaceDisposed) announce(`Opened remote consultation record for ${text(record.customer?.name, 'the selected homeowner')}.`);
      } catch (error) {
        if (!workspaceDisposed) announce('The consultation opened locally, but its server delivery state could not be updated.');
      } finally {
        remoteStatusPending.delete(record.id);
        if (!workspaceDisposed) render();
      }
    });
    return true;
  }

  async function acknowledgeActiveConsultation() {
    const activeId = text(byId('consultationRecordSelect')?.value, '');
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const record = activeConsultationRecord(records, activeId);
    if (!record?.remote?.serverBacked) {
      announce('This consultation is saved locally and does not require server acknowledgment.');
      return null;
    }
    if (!remoteInboxConnection().connected) {
      announce('Connect the secure producer inbox before acknowledging this consultation.');
      return null;
    }
    if (consultationStatus(record) === 'acknowledged' || remoteStatusPending.has(record.id)) return null;
    remoteStatusPending.add(record.id);
    renderConsultationDelivery(record);
    try {
      const result = await remoteInbox.acknowledge(record.id);
      announce(`Acknowledged consultation record for ${text(record.customer?.name, 'the selected homeowner')}.`);
      return result;
    } catch (error) {
      const message = error?.status === 401 || error?.code === 'unauthorized'
        ? 'The producer inbox connection expired. Reconnect before acknowledging this consultation.'
        : 'The consultation could not be acknowledged on the server. Try again.';
      announce(message);
      return null;
    } finally {
      remoteStatusPending.delete(record.id);
      if (!workspaceDisposed) render();
    }
  }

  function consultationDocumentHref(consultationId) {
    const id = text(consultationId, '');
    return id ? `/agent/consultation/?consultation_id=${encodeURIComponent(id)}` : '/agent/consultation/';
  }

  function customerReportHref(record) {
    const reportId = text(record?.report?.prospectReport?.id, '');
    return reportId
      ? `/home/report/#report_id=${encodeURIComponent(reportId)}&workspace_preview=1`
      : '/home/report/#local_preview=1&workspace_preview=1';
  }

  function cacheCustomerReportPreview(record) {
    const report = record?.report;
    if (!report || typeof report !== 'object') return false;
    try {
      window.localStorage?.setItem?.('coveragefit_home_report', JSON.stringify(report));
      return true;
    } catch (_) {
      return false;
    }
  }

  function updateCustomerReportAction(snapshot) {
    const actions = [byId('openCustomerReport'), byId('activeCustomerSnapshotAction'), byId('mobileSnapshotAction')].filter(Boolean);
    if (!actions.length) return false;
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const activeId = text(snapshot?.consultation?.id, '');
    const record = activeConsultationRecord(records, activeId);
    const enabled = snapshot?.state === 'ready' && Boolean(record?.report);
    const reportId = text(record?.report?.prospectReport?.id, '');
    actions.forEach(action => {
      action.href = enabled ? customerReportHref(record) : '/home/report/';
      action.setAttribute?.('aria-disabled', enabled ? 'false' : 'true');
      action.classList?.toggle?.('is-disabled', !enabled);
      action.tabIndex = enabled ? 0 : -1;
      action.title = enabled
        ? reportId
          ? 'Open the private customer Protection Snapshot for the active saved review'
          : 'Open the browser-local customer report preview for this legacy review'
        : 'Complete and save a homeowner review before opening a customer report';
    });
    return enabled;
  }

  function updateConsultationDocumentAction(snapshot) {
    const actions = [byId('openConsultationDocument'), byId('activeCustomerDocumentAction'), byId('mobileDocumentAction')].filter(Boolean);
    if (!actions.length) return false;
    const consultationId = text(snapshot?.consultation?.id, '');
    const enabled = snapshot?.state === 'ready' && Boolean(consultationId);
    actions.forEach(action => {
      action.href = consultationDocumentHref(consultationId);
      action.setAttribute?.('aria-disabled', enabled ? 'false' : 'true');
      action.classList?.toggle?.('is-disabled', !enabled);
      action.tabIndex = enabled ? 0 : -1;
      action.title = enabled
        ? 'Open the printable consultation document for the active saved review'
        : 'Complete and save a homeowner review before opening a consultation document';
    });
    return enabled;
  }

  function updateConsultationUrl(consultationId) {
    if (!consultationId || !window.history?.replaceState) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('consultation_id', consultationId);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {}
  }

  function clearConsultationUrl() {
    if (!window.history?.replaceState) return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('consultation_id')) return;
      url.searchParams.delete('consultation_id');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {}
  }

  function renderConsultationRecords(snapshot) {
    const bar = byId('consultationRecordsBar');
    const select = byId('consultationRecordSelect');
    const meta = byId('consultationRecordMeta');
    const records = typeof data?.listConsultations === 'function' ? data.listConsultations() : [];
    const activeId = text(snapshot?.consultation?.id, '');
    const inboxEmpty = byId('inboxViewEmpty');
    const pipelineEmpty = byId('pipelineViewEmpty');
    const pipelineRegion = byId('consultationPipeline');
    const connected = renderInboxConnectionState(records);
    renderInboxSummary(records);
    if (!bar || !select || !meta || !records.length || !activeId) {
      if (bar) bar.hidden = true;
      if (pipelineRegion) pipelineRegion.hidden = true;
      if (inboxEmpty) inboxEmpty.hidden = false;
      if (pipelineEmpty) pipelineEmpty.hidden = false;
      updateText(byId('inboxEmptyTitle'), connected ? 'No completed homeowner reviews yet' : 'No saved homeowner reviews yet');
      updateText(byId('inboxEmptyMessage'), connected
        ? 'The secure inbox is connected. Sync again when you expect a new submission, or start a Home assessment on this device.'
        : 'Connect the secure producer inbox or complete a Home assessment to populate this list.');
      return false;
    }
    bar.hidden = false;
    if (pipelineRegion) pipelineRegion.hidden = false;
    if (inboxEmpty) inboxEmpty.hidden = true;
    if (pipelineEmpty) pipelineEmpty.hidden = true;
    const signature = stableSignature(records.map(record => [
      record.id,
      record.updatedAt,
      record.customer?.name,
      record.customer?.propertyAddress,
      record.status,
      record.remote?.status,
      record.remote?.deliveredAt,
      record.remote?.openedAt,
      record.remote?.acknowledgedAt,
      record.remote?.followUp,
      record.remote?.disposition,
      record.disposition,
      record.remote?.completion,
      record.completion,
      record.remote?.notes,
      record.remote?.activity
    ]));
    if (signature !== lastConsultationRecordsSignature) {
      const fragment = document.createDocumentFragment();
      records.forEach(record => {
        const option = document.createElement('option');
        option.value = record.id;
        option.textContent = consultationRecordLabel(record);
        fragment.appendChild(option);
      });
      select.replaceChildren(fragment);
      lastConsultationRecordsSignature = signature;
    }
    select.value = activeId;
    const count = records.length;
    const activeRecord = activeConsultationRecord(records, activeId);
    const newCount = records.filter(record => consultationStatus(record) === 'new').length;
    meta.textContent = `${count} saved consultation record${count === 1 ? '' : 's'}${newCount ? ` · ${newCount} new` : ''} · Active record created ${displayDate(snapshot.consultation.createdAt)}`;
    updateText(byId('workspaceSubtitle'), `Selected homeowner review created ${displayDate(snapshot.consultation.createdAt)}. Use Inbox to open another consultation.`);
    renderConsultationPipeline(records);
    renderConsultationQueue(records, activeId);
    renderConsultationDelivery(activeRecord);
    renderConsultationDisposition(activeRecord);
    renderConsultationFollowUp(activeRecord);
    renderConsultationCompletion(activeRecord, snapshot);
    renderConsultationActivity(activeRecord);
    if (activeWorkspaceView === 'consultation') maybeMarkConsultationOpened(activeRecord);
    return true;
  }

  function requestedConsultationId() {
    try { return new URLSearchParams(window.location.search || '').get('consultation_id') || ''; } catch (_) { return ''; }
  }

  function initialWorkspaceView() {
    if (requestedConsultationId()) return 'consultation';
    const requested = new URLSearchParams(window.location.search || '').get('view');
    return WORKSPACE_VIEWS.includes(requested) ? requested : 'today';
  }

  function activateRequestedConsultation() {
    const consultationId = requestedConsultationId();
    if (!consultationId || typeof data?.selectConsultation !== 'function') return null;
    return data.selectConsultation(consultationId, { dispatch: false });
  }

  function openConsultationRecord(consultationId) {
    const id = plainText(consultationId);
    if (!id || typeof data?.selectConsultation !== 'function') return null;
    const selected = data.selectConsultation(id, { dispatch: false });
    if (!selected) {
      announce('That consultation record could not be opened.');
      return null;
    }
    updateConsultationUrl(selected.id);
    lastFollowUpFormSignature = '';
    lastDispositionFormSignature = '';
    followUpFeedback = null;
    dispositionFeedback = null;
    recommendationPlanFeedback = null;
    lastRecommendationBuilderSignature = '';
    setWorkspaceView('consultation', { focus: true });
    announce(`Opened consultation record for ${plainText(selected.customer?.name, 'the selected homeowner')}.`);
    render();
    return selected;
  }

  function handleConsultationSelection(event) {
    openConsultationRecord(event?.target?.value);
  }

  function formatPropertyValue(key, value) {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    if (key === 'livingArea' && value && !String(value).toLowerCase().includes('sq')) {
      const numeric = Number(String(value).replace(/,/g, ''));
      return Number.isFinite(numeric) ? `${numeric.toLocaleString('en-US')} sq. ft.` : text(value);
    }
    return text(value);
  }


  function setInlineState(id, options) {
    const region = byId(id);
    if (!region) return;
    const settings = options || {};
    region.hidden = !settings.visible;
    region.classList?.toggle?.('workspace-inline-state--warning', settings.tone === 'warning');
    region.classList?.toggle?.('workspace-inline-state--error', settings.tone === 'error');
    if (settings.visible) {
      region.innerHTML = `<strong>${escapeHtml(settings.title || 'Information unavailable')}</strong><p>${escapeHtml(settings.message || '')}</p>${settings.actionLabel ? `<button class="button button--secondary button--compact cf-button cf-button--secondary cf-button--compact" type="button" data-workspace-action="${escapeHtml(settings.action || 'retry')}">${escapeHtml(settings.actionLabel)}</button>` : ''}`;
      if (!window.CoverageFitWorkspaceMotion?.prefersReducedMotion?.()) {
        region.classList?.remove?.('workspace-surface--motion-enter');
        void region.offsetWidth;
        region.classList?.add?.('workspace-surface--motion-enter');
      }
    } else {
      region.innerHTML = '';
    }
  }

  function configurePageState(options) {
    const state = byId('emptyState');
    if (!state) return;
    const settings = options || {};
    state.dataset.state = settings.tone || 'empty';
    byId('emptyStateEyebrow').textContent = settings.eyebrow || 'Workspace unavailable';
    byId('emptyStateTitle').textContent = settings.title || 'The Workspace could not be prepared.';
    byId('emptyStateMessage').textContent = settings.message || 'Try loading the Workspace again.';
    const primary = byId('emptyStatePrimaryAction');
    if (primary) {
      primary.hidden = !settings.primaryLabel;
      primary.textContent = settings.primaryLabel || '';
      primary.href = settings.primaryHref || '/assessment/';
    }
    const retry = byId('emptyStateRetry');
    if (retry) retry.hidden = settings.showRetry === false;
    if (!window.CoverageFitWorkspaceMotion?.prefersReducedMotion?.()) {
      state.classList?.remove?.('workspace-surface--motion-enter');
      void state.offsetWidth;
      state.classList?.add?.('workspace-surface--motion-enter');
    }
  }


  function humanizeSource(integration) {
    const source = text(integration?.source, '').toLowerCase();
    const campaign = text(integration?.campaign, '');
    if (source.includes('408')) return campaign ? `408FARMERS · ${campaign}` : '408FARMERS';
    if (source) return campaign ? `${text(integration.source)} · ${campaign}` : text(integration.source);
    return 'CoverageFit direct';
  }

  function renderClientIntake(snapshot) {
    const customer = snapshot?.customer || {};
    const integration = snapshot?.integration || {};
    updateText(byId('clientIntakeName'), text(customer.name));
    updateText(byId('clientIntakePhone'), text(customer.phone));
    updateText(byId('clientIntakeEmail'), text(customer.email));
    updateText(byId('clientIntakeProperty'), text(customer.propertyAddress || snapshot?.property?.address));
    updateText(byId('clientIntakeReason'), text(customer.reviewContext, 'General coverage review'));
    updateText(byId('clientIntakeSource'), humanizeSource(integration));
    updateText(byId('clientIntakeStatus'), integration.prefilled ? '408FARMERS handoff' : 'Assessment provided');
    const activeDisplacementRecord=typeof activeRecordFromWorkspace==='function'?activeRecordFromWorkspace():null;
    const displacement=snapshot?.displacementContext||activeDisplacementRecord?.displacementContext||activeDisplacementRecord?.report?.displacementContext||activeDisplacementRecord?.report?.prospectProfile?.displacementContext||null;
    const dispBox=byId('displacementProducerBrief'),dispText=byId('displacementProducerBriefText');
    if(dispBox&&dispText){dispBox.hidden=!displacement;if(displacement){const carrier={safeco:'Safeco',liberty_mutual:'Liberty Mutual',aaa_csaa:'AAA / CSAA',state_farm:'State Farm',travelers:'Travelers',mercury:'Mercury',other:'Another carrier',unsure:'Carrier unclear'}[displacement.carrier]||'Carrier unclear';const urgency={immediate:'Immediate (≤30 days)',active:'Active (31–60 days)',planning:'Planning (61–90 days)',early:'Early (>90 days)',unclear:'Date unclear'}[displacement.operationalUrgency]||'Date unclear';dispText.textContent=` ${carrier} · ${urgency}${displacement.currentCoverageEndDate?` · Ends ${displacement.currentCoverageEndDate}`:''}${displacement.postalCode?` · ZIP ${displacement.postalCode}`:''}. Customer-reported context; not an eligibility or underwriting decision.`;}}
    updateText(byId('clientIntakeNote'), displacement
      ? 'Carrier-displacement context was carried forward so the homeowner does not have to repeat the notice, deadline, carrier or reason. Confirm the notice before advising.'
      : integration.prefilled
        ? 'Information was carried into CoverageFit from 408FARMERS and remains customer-editable. Confirm contact details and the reason for review before quoting.'
        : 'Confirm the client’s contact information and review reason before beginning the consultation.');
  }

  function renderProperty(property) {
    const signature = stableSignature(property || null);
    if (signature === lastPropertySignature) {
      performanceStats.propertySkips += 1;
      return false;
    }
    lastPropertySignature = signature;
    performanceStats.propertyRenders += 1;
    const grid = byId('propertyGrid');
    if (!property?.available) {
      if (grid) grid.hidden = true;
      setInlineState('propertyState', { visible: true, title: 'Property details unavailable', message: 'No Property Intelligence profile was found. Confirm the address, construction, roof, foundation, and other material details during the consultation.', actionLabel: 'Refresh property data' });
    } else {
      if (grid) grid.hidden = false;
      setInlineState('propertyState', { visible: false });
    }
    const rows = [
      ['Address', property.address, 'address'],
      ['Year built', property.yearBuilt, 'yearBuilt'],
      ['Living area', property.livingArea, 'livingArea'],
      ['Stories', property.stories, 'stories'],
      ['Construction', property.construction, 'construction'],
      ['Roof', property.roof, 'roof'],
      ['Foundation', property.foundation, 'foundation'],
      ['Pool', property.pool, 'pool'],
      ['Detached structures', property.detachedStructures, 'detachedStructures']
    ];
    byId('propertyGrid').innerHTML = rows.map(([label, value, key]) => `
      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatPropertyValue(key, value))}</dd></div>
    `).join('');
    byId('propertyConfidence').textContent = property.confirmation.label;
    byId('propertyNote').textContent = property.available
      ? 'Use these facts as a consultation starting point. Confirm material property details before relying on them.'
      : 'No Property Intelligence profile was found. Confirm all property details during the consultation.';
    return true;
  }

  function producerEvidenceLabel(item) {
    const quality = plainText(item?.evidenceQuality, 'confirmed');
    if (quality === 'confirmed') return 'Homeowner answer';
    if (quality === 'needs-verification') return 'Check policy';
    if (quality === 'partial' || quality === 'missing') return 'Ask homeowner';
    return plainText(item?.evidenceLabel, 'Review item');
  }

  function evidenceHandoffLabel(state) {
    if (state === 'ready') return 'Ready for conversation';
    if (state === 'verification-needed') return 'Policy checks needed';
    if (state === 'open-questions') return 'Questions to ask';
    return 'Manual review needed';
  }

  function renderEvidenceItems(elementId, items, kind) {
    const list = byId(elementId);
    if (!list) return;
    const values = Array.isArray(items) ? items.slice(0, 6) : [];
    if (!values.length) {
      const empty = kind === 'confirmed'
        ? 'No clear homeowner answers were carried forward.'
        : kind === 'verification'
          ? 'No policy checks were identified.'
          : 'No open homeowner questions were identified.';
      list.innerHTML = `<li class="is-empty">${escapeHtml(empty)}</li>`;
      return;
    }
    list.innerHTML = values.map(item => {
      const title = item.title || 'Assessment response';
      const answer = item.answer || item.statement || '';
      const question = item.question || '';
      if (kind === 'confirmed') {
        return `<li><strong>${escapeHtml(title)}</strong>${answer ? `<span>${escapeHtml(answer)}</span>` : ''}</li>`;
      }
      return `<li><strong>${escapeHtml(title)}</strong>${answer ? `<span>Homeowner answer: ${escapeHtml(answer)}</span>` : ''}${question ? `<em>${escapeHtml(question)}</em>` : ''}</li>`;
    }).join('');
  }

  function renderEvidenceHandoff(handoff) {
    const source = handoff || {};
    const summary = source.summary || {};
    const signature = stableSignature({
      available: source.available,
      state: source.state,
      summary,
      confirmedFacts: (source.confirmedFacts || []).map(item => [item.key, item.statement, item.answer]),
      verificationItems: (source.verificationItems || []).map(item => [item.key, item.answer, item.question]),
      unresolvedQuestions: (source.unresolvedQuestions || []).map(item => [item.key, item.answer, item.question])
    });
    if (signature === lastEvidenceHandoffSignature) {
      performanceStats.evidenceHandoffSkips += 1;
      return false;
    }
    lastEvidenceHandoffSignature = signature;
    performanceStats.evidenceHandoffRenders += 1;
    const state = source.available ? (source.state || 'ready') : 'legacy';
    const status = byId('evidenceHandoffStatus');
    if (status) {
      if (status.dataset) status.dataset.state = state;
      else status.setAttribute?.('data-state', state);
      status.textContent = evidenceHandoffLabel(state);
    }
    updateText(byId('evidenceConfirmedCount'), Number(summary.confirmed || 0));
    updateText(byId('evidenceVerificationCount'), Number(summary.verification || 0));
    updateText(byId('evidenceUnresolvedCount'), Number(summary.unresolved || 0));
    renderEvidenceItems('evidenceConfirmedList', source.confirmedFacts, 'confirmed');
    renderEvidenceItems('evidenceVerificationList', source.verificationItems, 'verification');
    renderEvidenceItems('evidenceUnresolvedList', source.unresolvedQuestions, 'unresolved');
    const note = source.available
      ? (source.guardrail || 'Confirm all homeowner-reported facts against the issued policy before making a recommendation.')
      : 'This record predates evidence-quality handoff. Review the saved answers manually and confirm them against the current policy.';
    updateText(byId('evidenceHandoffNote'), note);
    return true;
  }

  function renderRecommendations(recommendations) {
    const priorities = (Array.isArray(recommendations) ? recommendations : []).slice(0, 3);
    const signature = stableSignature(priorities);
    if (signature === lastRecommendationSignature) {
      performanceStats.recommendationSkips += 1;
      return false;
    }
    lastRecommendationSignature = signature;
    performanceStats.recommendationRenders += 1;
    const container = byId('recommendationList');
    if (!priorities.length) {
      container.hidden = true;
      setInlineState('recommendationState', { visible: true, title: 'No recommendation topics available', message: 'The saved assessment did not include recommendation topics. Review the customer’s answers and current policy manually before the consultation.', actionLabel: 'Refresh recommendations' });
      return true;
    }
    container.hidden = false;
    setInlineState('recommendationState', { visible: false });
    container.innerHTML = priorities.map(item => {
      const quality = item.evidenceQuality || 'confirmed';
      const evidenceLabel = producerEvidenceLabel(item);
      const evidencePrompt = item.evidencePrompt || item.conversationStarter || '';
      const tags = [item.priority, item.confidence != null && item.confidence > 0 ? `${item.confidence}% confidence` : 'Review topic'].filter(Boolean);
      return `<article class="recommendation-card cf-card cf-card--inset" data-evidence-quality="${escapeHtml(quality)}">
        <span class="recommendation-number">${item.order}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.explanation)}</p>
        <div class="recommendation-evidence" data-quality="${escapeHtml(quality)}"><span>${escapeHtml(evidenceLabel)}</span>${quality !== 'confirmed' && evidencePrompt ? `<p>${escapeHtml(evidencePrompt)}</p>` : ''}</div>
        <div class="recommendation-meta">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
      </article>`;
    }).join('');
    return true;
  }

  function setStatus(message, state) {
    const status = byId('workspaceStatus');
    status.className = `workspace-status ${state ? `is-${state}` : ''}`.trim();
    status.querySelector('span:last-child').textContent = message;
  }

  function setWorkspaceLoading(isLoading) {
    const loading = byId('workspaceLoading');
    if (!loading) return;
    if (loadingExitTimer && typeof window.clearTimeout === 'function') {
      window.clearTimeout(loadingExitTimer);
      loadingExitTimer = null;
    }
    loading.setAttribute?.('aria-busy', String(Boolean(isLoading)));
    if (isLoading) {
      loading.hidden = false;
      loading.classList?.remove?.('is-leaving');
      return;
    }
    const motion = window.CoverageFitWorkspaceMotion;
    const reduced = Boolean(motion?.prefersReducedMotion?.());
    if (reduced || loading.hidden) {
      loading.hidden = true;
      loading.classList?.remove?.('is-leaving');
      return;
    }
    loading.classList?.add?.('is-leaving');
    const duration = Number(motion?.getDuration?.('fast')) || 0;
    if (!duration || typeof window.setTimeout !== 'function') {
      loading.hidden = true;
      loading.classList?.remove?.('is-leaving');
      return;
    }
    loadingExitTimer = window.setTimeout(() => {
      loading.hidden = true;
      loading.classList?.remove?.('is-leaving');
      loadingExitTimer = null;
    }, duration + 40);
  }

  function animateWorkspaceSurfaces() {
    const layout = byId('workspaceLayout');
    if (!layout) return;
    const motion = window.CoverageFitWorkspaceMotion;
    if (motion?.prefersReducedMotion?.()) {
      layout.classList?.remove?.('workspace-layout--entering');
      workspaceHasRendered = true;
      return;
    }
    if (surfaceMotionTimer && typeof window.clearTimeout === 'function') {
      window.clearTimeout(surfaceMotionTimer);
      surfaceMotionTimer = null;
    }
    layout.classList?.remove?.('workspace-layout--entering');
    void layout.offsetWidth;
    layout.classList?.add?.('workspace-layout--entering');
    const duration = Number(motion?.getDuration?.(workspaceHasRendered ? 'fast' : 'slow')) || 0;
    if (typeof window.setTimeout === 'function') {
      surfaceMotionTimer = window.setTimeout(() => {
        layout.classList?.remove?.('workspace-layout--entering');
        surfaceMotionTimer = null;
      }, duration + 180);
    }
    workspaceHasRendered = true;
  }




  function announce(message) {
    const region = byId('workspaceAnnouncements');
    if (!region || !message) return;
    region.textContent = '';
    const defer = typeof window.setTimeout === 'function' ? window.setTimeout.bind(window) : (callback => callback());
    defer(() => { region.textContent = message; }, 20);
  }

  function focusChecklistItem(itemId) {
    if (!itemId) return;
    const selector = `[data-checklist-item-id="${CSS.escape(itemId)}"] [data-checklist-action="toggle-complete"]`;
    document.querySelector(selector)?.focus?.({ preventScroll: true });
  }

  function focusTimelineItem(itemId) {
    if (!itemId) return;
    const selector = `[data-checklist-item-id="${CSS.escape(itemId)}"]`;
    byId('conversationTimeline')?.querySelector(selector)?.focus?.({ preventScroll: true });
  }

  function restoreInteractionFocus() {
    if (pendingFocusItemId) {
      focusChecklistItem(pendingFocusItemId);
      pendingFocusItemId = '';
    } else if (pendingFocusTimelineItemId) {
      focusTimelineItem(pendingFocusTimelineItemId);
      pendingFocusTimelineItemId = '';
    }
  }

  function setChecklistShellState(nextState) {
    const sidebar = byId('checklistSidebar');
    const loading = byId('checklistLoadingState');
    const empty = byId('checklistEmptyState');
    const error = byId('checklistErrorState');
    const phaseShell = byId('checklistPhaseShell');
    if (!sidebar || !loading || !empty || !error || !phaseShell) return;

    const state = ['loading', 'ready', 'empty', 'error'].includes(nextState) ? nextState : 'error';
    checklistShellState = state;
    if (sidebar.dataset) sidebar.dataset.state = state;
    if (sidebar.classList?.toggle) {
      sidebar.classList.toggle('is-loading', state === 'loading');
      sidebar.classList.toggle('is-ready', state === 'ready');
      sidebar.classList.toggle('is-empty', state === 'empty');
      sidebar.classList.toggle('is-error', state === 'error');
    }
    loading.hidden = state !== 'loading';
    empty.hidden = state !== 'empty';
    error.hidden = state !== 'error';
    phaseShell.hidden = state !== 'ready';
  }

  function setChecklistSidebarCollapsed(collapsed, options) {
    const sidebar = byId('checklistSidebar');
    const toggle = byId('checklistSidebarToggle');
    if (!sidebar || !toggle) return;
    const wasCollapsed = sidebar.classList.contains('is-collapsed');
    sidebar.classList.toggle('is-collapsed', Boolean(collapsed));
    if (wasCollapsed !== Boolean(collapsed) && !window.CoverageFitWorkspaceMotion?.prefersReducedMotion?.()) {
      const motion = window.CoverageFitWorkspaceMotion;
      if (typeof motion?.restartClass === 'function') motion.restartClass(sidebar, 'checklist-sidebar--motion-toggle', 'normal', 80);
      else {
        sidebar.classList?.remove?.('checklist-sidebar--motion-toggle');
        void sidebar.offsetWidth;
        sidebar.classList?.add?.('checklist-sidebar--motion-toggle');
      }
    }
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const label = toggle.querySelector('.checklist-sidebar__toggle-label');
    if (label) label.textContent = collapsed ? 'Show details' : 'Hide details';
    if (options?.remember) mobileSidebarPreference = Boolean(collapsed);
  }

  function syncChecklistSidebarForViewport() {
    const sidebar = byId('checklistSidebar');
    if (!sidebar || !window.matchMedia) return;
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    if (!mobile) {
      setChecklistSidebarCollapsed(false);
      return;
    }
    const collapsed = mobileSidebarPreference == null ? true : mobileSidebarPreference;
    setChecklistSidebarCollapsed(collapsed);
  }


  function formatMinutes(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return 'Time not estimated';
    const rounded = Math.round(minutes * 10) / 10;
    return `${rounded} min`;
  }

  function phaseStatus(phase, items, currentPhaseId) {
    const phaseItems = items.filter(item => item.phaseId === phase.id);
    const completed = phaseItems.filter(item => item.status === 'complete').length;
    if (phaseItems.length && completed === phaseItems.length) return 'complete';
    if (phase.id === currentPhaseId || phaseItems.some(item => item.status === 'active')) return 'current';
    return 'pending';
  }


  function captureProgressMotionState(percentage, completed, remainingMinutes, currentPhaseId, complete) {
    return { percentage, completed, remainingMinutes, currentPhaseId: String(currentPhaseId || ''), complete: Boolean(complete) };
  }

  function applyProgressMotion(nextState) {
    const motion = window.CoverageFitWorkspaceMotion;
    const reduced = Boolean(motion?.prefersReducedMotion?.());
    const previous = previousProgressMotionState;
    previousProgressMotionState = nextState;
    if (!previous || reduced) return;

    const targets = [];
    if (previous.percentage !== nextState.percentage) targets.push(byId('checklistProgressPlaceholder'), byId('checklistProgressTrack'));
    if (previous.completed !== nextState.completed) targets.push(byId('checklistProgressCount'));
    if (previous.remainingMinutes !== nextState.remainingMinutes) targets.push(byId('checklistRemainingMinutes'));
    if (previous.currentPhaseId !== nextState.currentPhaseId) targets.push(byId('checklistCurrentPhase'));
    if (!previous.complete && nextState.complete) targets.push(byId('checklistCompleteState'));

    const duration = motion?.getDuration?.('normal') ?? 220;
    targets.filter(Boolean).forEach(element => {
      if (typeof motion?.restartClass === 'function') motion.restartClass(element, 'checklist-progress--motion-update', duration, 80);
      else element.classList?.add('checklist-progress--motion-update');
    });
  }

  function renderChecklistProgress(state, phases, items) {
    const summary = state?.summary || {};
    const progress = state?.progress || {};
    const total = Number(summary.total ?? progress.total ?? items.length) || 0;
    const completed = Number(summary.completed ?? progress.completed) || 0;
    const percentage = Math.max(0, Math.min(100, Number(progress.completionPercent ?? summary.completionPercent) || 0));
    const remainingMinutes = Math.max(0, Number(state?.remainingMinutes ?? progress.remainingMinutes) || 0);
    const currentPhaseId = state?.currentPhase || '';
    const currentPhase = phases.find(phase => phase.id === currentPhaseId);
    const complete = total > 0 && completed === total;

    const percentageLabel = byId('checklistProgressPlaceholder');
    const countLabel = byId('checklistProgressCount');
    const minutesLabel = byId('checklistRemainingMinutes');
    const phaseLabel = byId('checklistCurrentPhase');
    const track = byId('checklistProgressTrack');
    const bar = byId('checklistProgressBar');
    const completeState = byId('checklistCompleteState');

    let changed = false;
    changed = updateText(percentageLabel, `${percentage}%`) || changed;
    changed = updateText(countLabel, `${completed}/${total}`) || changed;
    changed = updateText(minutesLabel, formatMinutes(remainingMinutes)) || changed;
    changed = updateText(phaseLabel, complete ? 'Complete' : text(currentPhase?.title, total ? 'Not started' : 'Preparing')) || changed;
    if (track?.setAttribute && track.getAttribute?.('aria-valuenow') !== String(percentage)) {
      track.setAttribute('aria-valuenow', String(percentage));
      changed = true;
    }
    if (bar?.style && bar.style.width !== `${percentage}%`) {
      bar.style.width = `${percentage}%`;
      changed = true;
    }
    changed = setHidden(completeState, !complete) || changed;
    if (changed) performanceStats.progressUpdates += 1;
    applyProgressMotion(captureProgressMotionState(percentage, completed, remainingMinutes, currentPhaseId, complete));
  }


  function captureChecklistMotionState(items) {
    const snapshot = new Map();
    (Array.isArray(items) ? items : []).forEach(item => {
      if (item?.id) snapshot.set(String(item.id), String(item.status || 'pending'));
    });
    return snapshot;
  }

  function applyChecklistMotion(items) {
    const motion = window.CoverageFitWorkspaceMotion;
    const reduced = Boolean(motion?.prefersReducedMotion?.());
    const nextState = captureChecklistMotionState(items);
    if (!checklistHasRendered || reduced) {
      previousChecklistMotionState = nextState;
      checklistHasRendered = true;
      return;
    }

    nextState.forEach((status, itemId) => {
      const previous = previousChecklistMotionState.get(itemId);
      const element = byId(`checklist-item-${itemId}`);
      if (!element || previous === status) return;
      let className = 'checklist-item--motion-state';
      if (status === 'complete') className = 'checklist-item--motion-complete';
      else if (previous === 'complete') className = 'checklist-item--motion-reopen';
      else if (status === 'active') className = 'checklist-item--motion-active';
      const duration = motion?.getDuration?.('normal') ?? 220;
      if (typeof motion?.restartClass === 'function') motion.restartClass(element, className, duration, 80);
      else element.classList?.add(className);
    });

    const list = byId('checklistPhaseList');
    const refreshDuration = motion?.getDuration?.('fast') ?? 160;
    if (typeof motion?.restartClass === 'function') motion.restartClass(list, 'checklist-phase-list--motion-refresh', refreshDuration, 60);
    else list?.classList?.add('checklist-phase-list--motion-refresh');
    previousChecklistMotionState = nextState;
  }

  function renderChecklist(state) {
    const list = byId('checklistPhaseList');
    const overview = byId('checklistOverviewText');
    if (!list) return;

    const checklist = state?.checklist;
    const phases = Array.isArray(checklist?.phases) ? checklist.phases : [];
    const items = Array.isArray(checklist?.items) ? checklist.items : [];
    if (!phases.length || !items.length) {
      const emptySignature = 'empty';
      if (lastChecklistStructureSignature !== emptySignature) {
        list.innerHTML = '';
        lastChecklistStructureSignature = emptySignature;
        performanceStats.checklistRenders += 1;
      } else {
        performanceStats.checklistSkips += 1;
      }
      if (overview) updateText(overview, 'No consultation items are available for this plan.');
      renderChecklistProgress(state, phases, items);
      return false;
    }

    if (overview) {
      overview.textContent = `${phases.length} phase${phases.length === 1 ? '' : 's'} · ${items.length} discussion item${items.length === 1 ? '' : 's'} prepared`;
    }
    renderChecklistProgress(state, phases, items);
    const resetAll = byId('checklistResetAll');
    if (resetAll) resetAll.disabled = !(state?.summary?.completed || state?.summary?.active);

    const structureSignature = stableSignature({
      currentPhase: state?.currentPhase || '',
      phases: phases.map(phase => ({ id: phase.id, title: phase.title, estimatedMinutes: phase.estimatedMinutes })),
      items: items.map(item => ({
        id: item.id,
        phaseId: item.phaseId,
        order: item.order,
        title: item.title,
        description: item.description,
        estimatedMinutes: item.estimatedMinutes,
        required: item.required,
        evidenceQuality: item.evidenceQuality,
        evidenceLabel: item.evidenceLabel,
        evidencePrompt: item.evidencePrompt,
        status: item.status
      }))
    });
    if (structureSignature === lastChecklistStructureSignature) {
      performanceStats.checklistSkips += 1;
      return false;
    }
    lastChecklistStructureSignature = structureSignature;
    performanceStats.checklistRenders += 1;

    list.innerHTML = phases.map((phase, phaseIndex) => {
      const phaseItems = items
        .filter(item => item.phaseId === phase.id)
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      const status = phaseStatus(phase, items, state.currentPhase);
      const statusLabel = status === 'complete' ? 'Complete' : status === 'current' ? 'Current' : 'Upcoming';
      const phaseMinutes = phase.estimatedMinutes || phaseItems.reduce((sum, item) => sum + Number(item.estimatedMinutes || 0), 0);
      return `<section class="checklist-phase cf-card cf-card--inset checklist-phase--${status}" data-phase-id="${escapeHtml(phase.id)}" role="listitem" aria-labelledby="checklist-phase-title-${escapeHtml(phase.id)}">
        <div class="checklist-phase__header">
          <div class="checklist-phase__identity">
            <span class="checklist-phase__number">${phaseIndex + 1}</span>
            <div>
              <h3 id="checklist-phase-title-${escapeHtml(phase.id)}">${escapeHtml(phase.title || `Phase ${phaseIndex + 1}`)}</h3>
              <p>${escapeHtml(formatMinutes(phaseMinutes))}</p>
            </div>
          </div>
          <div class="checklist-phase__header-actions">
            <span class="checklist-phase__status">${statusLabel}</span>
            <button class="checklist-phase__reset" type="button" data-checklist-action="reset-phase" data-phase-id="${escapeHtml(phase.id)}">Reset phase</button>
          </div>
        </div>
        <ol class="checklist-item-list" aria-label="${escapeHtml(phase.title || `Phase ${phaseIndex + 1}`)} checklist items">
          ${phaseItems.map(item => {
            const itemStatus = item.status === 'complete' ? 'complete' : item.status === 'active' ? 'active' : 'pending';
            const requirement = item.required === false ? 'Optional' : 'Required';
            const checkboxLabel = itemStatus === 'complete' ? `Reopen ${item.title}` : `Complete ${item.title}`;
            return `<li class="checklist-item cf-card--inset checklist-item--${itemStatus}" id="checklist-item-${escapeHtml(item.id)}" data-checklist-item-id="${escapeHtml(item.id)}" aria-current="${itemStatus === 'active' ? 'step' : 'false'}">
              <button class="checklist-item__check" type="button" data-checklist-action="toggle-complete" data-item-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(checkboxLabel)}" aria-pressed="${itemStatus === 'complete'}" aria-describedby="checklist-item-status-${escapeHtml(item.id)}">
                <span class="checklist-item__marker" aria-hidden="true"></span>
              </button>
              <div class="checklist-item__content">
                <div class="checklist-item__title-row">
                  <span class="checklist-item__title">${escapeHtml(item.title)}</span>
                  <span class="checklist-item__time">${escapeHtml(formatMinutes(item.estimatedMinutes))}</span>
                </div>
                ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
                <div class="checklist-item__meta" id="checklist-item-status-${escapeHtml(item.id)}">
                  <span>${requirement}</span>
                  <span>${itemStatus === 'complete' ? 'Completed' : itemStatus === 'active' ? 'In review' : 'Not started'}</span>
                  ${item.evidenceLabel ? `<span class="checklist-item__evidence" data-quality="${escapeHtml(item.evidenceQuality || 'confirmed')}">${escapeHtml(producerEvidenceLabel(item))}</span>` : ''}
                </div>
                ${item.evidenceQuality && item.evidenceQuality !== 'confirmed' && item.evidencePrompt ? `<p class="checklist-item__evidence-prompt">${escapeHtml(item.evidencePrompt)}</p>` : ''}
                <div class="checklist-item__actions">
                  ${itemStatus !== 'complete' ? `<button type="button" data-checklist-action="activate" data-item-id="${escapeHtml(item.id)}">${itemStatus === 'active' ? 'Active' : 'Review now'}</button>` : ''}
                  ${itemStatus !== 'pending' ? `<button type="button" data-checklist-action="reset-item" data-item-id="${escapeHtml(item.id)}">Reset item</button>` : ''}
                </div>
              </div>
            </li>`;
          }).join('')}
        </ol>
      </section>`;
    }).join('');
    applyChecklistMotion(items);
    return true;
  }


  function captureTimelineMotionState(planItems, checklistBySource, currentPhaseId) {
    const snapshot = new Map();
    planItems.forEach(item => {
      const checklistItem = checklistBySource.get(item.id);
      snapshot.set(String(item.id), timelineItemStatus(checklistItem, item.phase, currentPhaseId));
    });
    return snapshot;
  }

  function applyTimelineMotion(planItems, checklistBySource, currentPhaseId) {
    const motion = window.CoverageFitWorkspaceMotion;
    const reduced = Boolean(motion?.prefersReducedMotion?.());
    const nextState = captureTimelineMotionState(planItems, checklistBySource, currentPhaseId);
    if (!timelineHasRendered || reduced) {
      previousTimelineMotionState = nextState;
      timelineHasRendered = true;
      return;
    }

    nextState.forEach((status, sourceId) => {
      const previous = previousTimelineMotionState.get(sourceId);
      if (!previous || previous === status) return;
      const item = byId('conversationTimeline')?.querySelector?.(`[data-timeline-source-id="${CSS.escape(sourceId)}"]`);
      if (!item) return;
      const className = status === 'complete'
        ? 'conversation-timeline__item--motion-complete'
        : status === 'current'
          ? 'conversation-timeline__item--motion-current'
          : 'conversation-timeline__item--motion-update';
      const duration = motion?.getDuration?.('normal') ?? 220;
      if (typeof motion?.restartClass === 'function') motion.restartClass(item, className, duration, 80);
      else item.classList?.add(className);
    });

    const current = byId('conversationTimeline')?.querySelector?.('.conversation-timeline__item--current');
    safeScrollIntoView(current, { behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    previousTimelineMotionState = nextState;
  }

  function timelineItemStatus(checklistItem, phaseId, currentPhaseId) {
    if (!checklistItem) return phaseId === currentPhaseId ? 'current' : 'upcoming';
    if (checklistItem.status === 'complete') return 'complete';
    if (checklistItem.status === 'active' || phaseId === currentPhaseId) return 'current';
    return 'upcoming';
  }

  function renderGuidedQuestions(plan) {
    const panel = byId('guidedQuestionsPanel');
    const list = byId('guidedQuestionList');
    const count = byId('guidedQuestionCount');
    if (!panel || !list) return false;
    const questions = Array.isArray(plan?.guidedQuestions) ? plan.guidedQuestions : [];
    const signature = stableSignature(questions.map(item => ({
      id: item.id,
      order: item.order,
      kind: item.kind,
      label: item.label,
      question: item.question,
      why: item.why,
      sourceTitle: item.sourceTitle
    })));
    if (signature === lastGuidedQuestionSignature) return false;
    lastGuidedQuestionSignature = signature;
    window.CoverageFitAgentWorkspaceGuidedQuestions = questions;
    if (count) updateText(count, `${questions.length} question${questions.length === 1 ? '' : 's'} prepared`);
    if (!questions.length) {
      list.innerHTML = '<li class="guided-question-list__empty">No assessment-driven follow-up question is available. Use the conversation map and confirm that the homeowner’s information is still current.</li>';
      if (panel.dataset) panel.dataset.state = 'empty';
      return true;
    }
    if (panel.dataset) panel.dataset.state = 'ready';
    list.innerHTML = questions.map(item => `<li class="guided-question" data-question-kind="${escapeHtml(item.kind || 'finding')}">
      <span class="guided-question__number" aria-hidden="true">${Number(item.order) || 1}</span>
      <div class="guided-question__content">
        <div class="guided-question__meta"><span>${escapeHtml(item.label || 'Ask next')}</span>${item.sourceTitle ? `<strong>${escapeHtml(item.sourceTitle)}</strong>` : ''}</div>
        <p>${escapeHtml(item.question)}</p>
        ${item.why ? `<small><span>Why this question:</span> ${escapeHtml(item.why)}</small>` : ''}
      </div>
    </li>`).join('');
    return true;
  }

  function recommendationPlanStateLabel(state) {
    if (state === 'structured') return 'Structured';
    if (state === 'draft') return 'Draft in progress';
    if (state === 'empty') return 'No findings';
    return 'Not started';
  }

  function setRecommendationBuilderMessage(message, tone) {
    const target = byId('recommendationBuilderMessage');
    if (!target) return;
    target.textContent = message;
    target.classList?.toggle?.('is-error', tone === 'error');
    target.classList?.toggle?.('is-success', tone === 'success');
  }

  function updateRecommendationBuilderSummary(plan) {
    const summary = plan?.summary || {};
    const target = byId('recommendationBuilderSummary');
    const status = byId('recommendationBuilderStatus');
    if (target) target.innerHTML = [
      `${Number(summary.verified || 0)} verified`,
      `${Number(summary.recommend || 0)} recommended`,
      `${Number(summary.consider || 0)} to consider`,
      `${Number(summary.undecided || 0)} undecided`
    ].map(label => `<span>${escapeHtml(label)}</span>`).join('');
    if (status) {
      if (status.dataset) status.dataset.state = plainText(plan?.state, 'not-started');
      status.textContent = recommendationPlanStateLabel(plan?.state);
    }
  }

  function renderExplanationAssist(item, assistance, consultationId) {
    if (!assistance) return '';
    const disclosureKey = `${consultationId || 'local'}:${item.id}`;
    const open = explanationDisclosureState.has(disclosureKey)
      ? explanationDisclosureState.get(disclosureKey)
      : Number(item.rank) === 1;
    const checks = Array.isArray(assistance.verification) ? assistance.verification : [];
    return `<details class="explanation-assist" data-explanation-disclosure="${escapeHtml(disclosureKey)}" data-readiness="${escapeHtml(assistance.readiness || 'verify-first')}" ${open ? 'open' : ''}>
      <summary><span class="explanation-assist__summary-copy"><span class="eyebrow">Explanation assist</span><strong>Understand it, explain it, verify it</strong></span><span class="explanation-assist__readiness">${escapeHtml(assistance.readinessLabel || 'Verify first')}</span></summary>
      <div class="explanation-assist__body">
        <div class="explanation-assist__grid">
          <section><span>What the issue is</span><p>${escapeHtml(assistance.issue)}</p><small>${escapeHtml(assistance.whatItMeans)}</small></section>
          <section><span>Why it matters</span><p>${escapeHtml(assistance.whyItMatters)}</p></section>
        </div>
        <section class="explanation-assist__talk-track"><span>Say it naturally</span><blockquote>${escapeHtml(assistance.talkTrack)}</blockquote></section>
        <section class="explanation-assist__verify"><span>Verify before final advice</span><ul>${checks.map(check => `<li>${escapeHtml(check)}</li>`).join('')}</ul></section>
        <p class="explanation-assist__coach"><strong>Producer cue:</strong> ${escapeHtml(assistance.coachingNote)}</p>
        <p class="explanation-assist__guardrail">${escapeHtml(assistance.guardrail)}</p>
      </div>
    </details>`;
  }

  function renderRecommendationBuilder(snapshot) {
    const panel = byId('recommendationBuilder');
    const list = byId('recommendationBuilderList');
    const form = byId('recommendationBuilderForm');
    const save = byId('saveRecommendationPlan');
    if (!panel || !list || !form || !save) return false;
    const plan = currentRecommendationPlan;
    const items = Array.isArray(plan?.items) ? plan.items : [];
    const assistance = explanationAssist?.build?.(snapshot, plan) || { items: [] };
    const assistanceByFinding = new Map((Array.isArray(assistance?.items) ? assistance.items : []).map(item => [item.findingId, item]));
    const consultationId = plainText(snapshot?.consultation?.id);
    const serverBacked = Boolean(snapshot?.consultation?.remote?.serverBacked);
    const connected = remoteInboxConnection().connected;
    const pending = consultationId && recommendationPlanPending.has(consultationId);
    const editable = Boolean(consultationId && !pending && (!serverBacked || connected));
    const signature = stableSignature({ consultationId, items, assistance: assistance?.items, state: plan?.state, editable, pending, feedback: recommendationPlanFeedback });
    if (signature === lastRecommendationBuilderSignature) return false;
    lastRecommendationBuilderSignature = signature;
    window.CoverageFitAgentWorkspaceRecommendationPlan = plan;
    window.CoverageFitAgentWorkspaceExplanationAssist = assistance;
    updateRecommendationBuilderSummary(plan);
    form.setAttribute?.('aria-busy', String(Boolean(pending)));
    save.disabled = !editable || !items.length;
    save.textContent = pending ? 'Saving…' : 'Save recommendation plan';
    if (!items.length) {
      list.innerHTML = '<div class="recommendation-builder__empty">No ranked findings are available. Review the assessment manually before advising.</div>';
    } else {
      list.innerHTML = items.map(item => {
        const requiresReason = ['recommend', 'not_recommended'].includes(item.decision);
        const verificationCopy = item.verified
          ? 'Producer marked the relevant facts and policy language verified.'
          : item.evidenceQuality === 'needs-verification'
            ? 'Compare this finding with the current declarations, endorsements, and policy language.'
            : item.evidenceQuality === 'partial' || item.evidenceQuality === 'missing'
              ? 'Resolve the open homeowner detail before relying on this finding.'
              : 'Confirm the homeowner-reported facts and relevant policy language before advising.';
        const options = (recommendationBuilder?.DECISIONS || []).map(option => `<option value="${escapeHtml(option.value)}" ${option.value === item.decision ? 'selected' : ''} ${option.value === 'recommend' && !item.verified ? 'disabled' : ''}>${escapeHtml(option.label)}</option>`).join('');
        return `<article class="recommendation-builder-item" data-builder-item-id="${escapeHtml(item.id)}" data-builder-decision="${escapeHtml(item.decision)}" data-builder-verified="${item.verified ? 'true' : 'false'}">
          <div class="recommendation-builder-item__heading"><span class="recommendation-builder-item__rank">${Number(item.rank) || 1}</span><div><span class="recommendation-builder-item__priority">${escapeHtml(item.priority || 'Review topic')}</span><h3>${escapeHtml(item.title)}</h3></div><span class="recommendation-builder-item__evidence" data-quality="${escapeHtml(item.evidenceQuality || 'confirmed')}">${escapeHtml(item.evidenceLabel || 'Assessment finding')}</span></div>
          <p class="recommendation-builder-item__detail">${escapeHtml(item.detail)}</p>
          <p class="recommendation-builder-item__why"><strong>Why it is here:</strong> ${escapeHtml(item.assessmentRationale)}</p>
          ${renderExplanationAssist(item, assistanceByFinding.get(item.findingId), consultationId)}
          <div class="recommendation-builder-item__controls">
            <label class="recommendation-builder-item__verification"><input type="checkbox" data-recommendation-field="verified" data-recommendation-item="${escapeHtml(item.id)}" ${item.verified ? 'checked' : ''} ${editable ? '' : 'disabled'}/><span><strong>Verified for advising</strong><small>${escapeHtml(verificationCopy)}</small></span></label>
            <label class="recommendation-builder-item__decision"><span>Producer judgment</span><select data-recommendation-field="decision" data-recommendation-item="${escapeHtml(item.id)}" ${editable ? '' : 'disabled'}>${options}</select><small>${escapeHtml(item.action || 'No recommendation recorded')}</small></label>
            <label class="recommendation-builder-item__reason"><span>Producer reasoning${requiresReason ? ' · required' : ' · optional'}</span><textarea maxlength="500" rows="2" data-recommendation-field="producerReason" data-recommendation-item="${escapeHtml(item.id)}" placeholder="Explain why this fits—or does not fit—the homeowner’s verified situation." ${editable ? '' : 'disabled'}>${escapeHtml(item.producerReason || '')}</textarea><small>Use verified homeowner needs and policy facts. Do not paste a carrier proposal.</small></label>
          </div>
          ${item.evidencePrompt && !item.verified ? `<p class="recommendation-builder-item__prompt"><strong>Resolve first:</strong> ${escapeHtml(item.evidencePrompt)}</p>` : ''}
        </article>`;
      }).join('');
    }
    if (recommendationPlanFeedback?.recordId === consultationId) setRecommendationBuilderMessage(recommendationPlanFeedback.message, recommendationPlanFeedback.tone);
    else if (!consultationId) setRecommendationBuilderMessage('Open a saved consultation record to use the Recommendation Builder.', '');
    else if (serverBacked && !connected) setRecommendationBuilderMessage('Connect the secure producer inbox to edit this recommendation plan.', '');
    else if (plan?.updatedAt) setRecommendationBuilderMessage(`Recommendation plan saved ${displayDateTime(plan.updatedAt)}.`, 'success');
    else setRecommendationBuilderMessage('No recommendation is selected automatically.', '');
    return true;
  }

  function handleRecommendationBuilderInput(event) {
    const control = event.target?.closest?.('[data-recommendation-field]');
    if (!control || !currentRecommendationPlan || !recommendationBuilder?.update) return;
    const field = control.dataset.recommendationField;
    const itemId = control.dataset.recommendationItem;
    const previous = currentRecommendationPlan.items?.find(item => item.id === itemId);
    const value = field === 'verified' ? Boolean(control.checked) : control.value;
    currentRecommendationPlan = recommendationBuilder.update(currentRecommendationPlan, itemId, { [field]: value });
    window.CoverageFitAgentWorkspaceRecommendationPlan = currentRecommendationPlan;
    recommendationPlanFeedback = null;
    if (field === 'producerReason' && event.type === 'input') {
      setRecommendationBuilderMessage('Unsaved recommendation changes.', '');
      return;
    }
    if (field === 'verified' && previous?.decision === 'recommend' && !value) {
      announce(`${plainText(previous.title, 'The finding')} was returned to Not decided because verification was removed.`);
    }
    lastRecommendationBuilderSignature = '';
    renderRecommendationBuilder(currentWorkspaceSnapshot);
    renderConsultationProgress(currentWorkspaceSnapshot, window.CoverageFitAgentWorkspaceChecklist || null);
  }

  function handleExplanationDisclosure(event) {
    const disclosure = event.target?.closest?.('[data-explanation-disclosure]');
    if (!disclosure) return;
    explanationDisclosureState.set(disclosure.dataset.explanationDisclosure, Boolean(disclosure.open));
  }

  async function saveActiveRecommendationPlan(event) {
    event?.preventDefault?.();
    const record = activeRecordFromWorkspace();
    if (!record || recommendationPlanPending.has(record.id) || !recommendationBuilder?.prepareForSave) return null;
    const prepared = recommendationBuilder.prepareForSave(currentRecommendationPlan);
    if (!prepared.valid) {
      const first = prepared.errors?.[0];
      setRecommendationBuilderMessage(first?.message || 'Review the recommendation plan before saving.', 'error');
      if (first?.itemId) byId('recommendationBuilderList')?.querySelector?.(`[data-builder-item-id="${CSS.escape(first.itemId)}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return null;
    }
    if (record.remote?.serverBacked && !remoteInboxConnection().connected) {
      setRecommendationBuilderMessage('Connect the secure producer inbox before saving this recommendation plan.', 'error');
      return null;
    }
    recommendationPlanPending.add(record.id);
    lastRecommendationBuilderSignature = '';
    renderRecommendationBuilder(currentWorkspaceSnapshot);
    try {
      let result;
      if (record.remote?.serverBacked) result = await remoteInbox.updateRecommendationPlan(record.id, prepared.plan);
      else result = data?.updateConsultationRecommendationPlan?.(record.id, prepared.plan) || window.CoverageFitConsultationRecords?.updateRecommendationPlan?.(record.id, prepared.plan);
      if (!result) throw new Error('Recommendation plan update failed');
      recommendationPlanFeedback = { recordId: record.id, message: 'Recommendation plan saved to this consultation record.', tone: 'success' };
      announce(`Recommendation plan saved for ${plainText(record.customer?.name, 'the selected homeowner')}.`);
      return result;
    } catch (error) {
      recommendationPlanFeedback = { recordId: record.id, message: error?.status === 401 ? 'The producer inbox connection expired. Reconnect and try again.' : 'The recommendation plan could not be saved. Review the required fields and try again.', tone: 'error' };
      setRecommendationBuilderMessage(recommendationPlanFeedback.message, recommendationPlanFeedback.tone);
      return null;
    } finally {
      recommendationPlanPending.delete(record.id);
      lastRecommendationBuilderSignature = '';
      if (!workspaceDisposed) render();
    }
  }

  function renderConversationTimeline(state) {
    const container = byId('conversationTimeline');
    const summary = byId('conversationTimelineSummary');
    if (!container) return;
    const plan = currentConversationPlan;
    const planItems = Array.isArray(plan?.items) ? plan.items : [];
    const checklistItems = Array.isArray(state?.checklist?.items) ? state.checklist.items : [];
    const currentPhaseId = state?.currentPhase || '';

    if (!plan || plan.state !== 'ready' || !planItems.length) {
      if (lastTimelineStructureSignature !== 'empty') {
        container.innerHTML = '<div class="conversation-timeline__empty">A conversation timeline will appear after the consultation plan is prepared.</div>';
        lastTimelineStructureSignature = 'empty';
        performanceStats.timelineRenders += 1;
      } else {
        performanceStats.timelineSkips += 1;
      }
      if (summary) updateText(summary, 'Timeline unavailable');
      return false;
    }

    const checklistBySource = new Map(checklistItems.map(item => [item.sourceItemId, item]));
    const completed = checklistItems.filter(item => item.status === 'complete').length;
    if (summary) updateText(summary, `${completed}/${checklistItems.length} topics reviewed`);
    const structureSignature = stableSignature({
      currentPhaseId,
      items: planItems.map(item => ({
        id: item.id,
        phase: item.phase,
        title: item.title,
        estimatedMinutes: item.estimatedMinutes,
        evidenceQuality: item.evidenceQuality,
        evidenceLabel: item.evidenceLabel,
        checklistId: checklistBySource.get(item.id)?.id || '',
        status: timelineItemStatus(checklistBySource.get(item.id), item.phase, currentPhaseId)
      }))
    });
    if (structureSignature === lastTimelineStructureSignature) {
      performanceStats.timelineSkips += 1;
      return false;
    }
    lastTimelineStructureSignature = structureSignature;
    performanceStats.timelineRenders += 1;

    container.innerHTML = `<ol class="conversation-timeline__list cf-list" aria-label="Conversation timeline">
      ${planItems.map((item, index) => {
        const checklistItem = checklistBySource.get(item.id);
        const status = timelineItemStatus(checklistItem, item.phase, currentPhaseId);
        const stateLabel = status === 'complete' ? 'Reviewed' : status === 'current' ? 'Current' : 'Upcoming';
        return `<li class="conversation-timeline__item conversation-timeline__item--${status}" data-timeline-source-id="${escapeHtml(item.id)}" data-phase-id="${escapeHtml(item.phase)}">
          <button type="button" class="conversation-timeline__button" data-timeline-action="activate" data-checklist-item-id="${escapeHtml(checklistItem?.id || '')}" ${checklistItem ? '' : 'disabled'} ${status === 'current' ? 'aria-current="step"' : ''} tabindex="${status === 'current' ? '0' : '-1'}" aria-label="${escapeHtml(`${item.title}. ${stateLabel}. ${formatMinutes(item.estimatedMinutes)}`)}">
            <span class="conversation-timeline__marker" aria-hidden="true">${status === 'complete' ? '✓' : index + 1}</span>
            <span class="conversation-timeline__content">
              <span class="conversation-timeline__state">${stateLabel}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(formatMinutes(item.estimatedMinutes))}</small>
              ${item.evidenceLabel ? `<span class="conversation-timeline__evidence">${escapeHtml(producerEvidenceLabel(item))}</span>` : ''}
            </span>
          </button>
        </li>`;
      }).join('')}
    </ol>`;
    applyTimelineMotion(planItems, checklistBySource, currentPhaseId);
    return true;
  }

  function handleTimelineAction(event) {
    const control = event.target.closest?.('[data-timeline-action="activate"]');
    if (!control || control.disabled || !checklistEngine) return;
    const itemId = control.dataset.checklistItemId;
    if (!itemId) return;
    const state = window.CoverageFitAgentWorkspaceChecklist;
    const item = state?.checklist?.items?.find(entry => entry.id === itemId);
    if (!item || item.status === 'complete' || item.status === 'active') return;
    try {
      pendingFocusTimelineItemId = itemId;
      checklistEngine.activate(itemId);
      safeScrollIntoView(byId(`checklist-item-${itemId}`), { block: 'nearest' });
    } catch (error) {
      console.error('[CoverageFit Agent Workspace] Timeline activation failed.', error);
      setStatus('Timeline topic could not be activated', 'warning');
    }
  }

  function checklistStatusMessage(state, reason) {
    const plan = currentConversationPlan;
    if (!plan || plan.state !== 'ready') return '';
    const topicLabel = `${plan.summary.topicCount} priority topic${plan.summary.topicCount === 1 ? '' : 's'}`;
    const checklistCount = state?.summary?.total || 0;
    const checklistReady = state?.checklist?.state === 'ready';
    const checklistLabel = checklistReady
      ? ` · ${checklistCount} checklist item${checklistCount === 1 ? '' : 's'} prepared`
      : '';
    const progressLabel = checklistReady && reason !== 'plan-restored'
      ? ` · ${state.summary.completed || 0}/${checklistCount} complete`
      : '';
    const evidenceFollowUp = Number(plan.summary?.evidenceVerificationCount || 0) + Number(plan.summary?.evidenceUnresolvedCount || 0);
    const evidenceLabel = evidenceFollowUp ? ` · ${evidenceFollowUp} item${evidenceFollowUp === 1 ? '' : 's'} to confirm` : '';
    return `Assessment loaded · ${topicLabel} · ${plan.summary.estimatedMinutes}-minute conversation plan prepared${evidenceLabel}${checklistLabel}${progressLabel}`;
  }

  function renderChecklistPersistence(state) {
    const element = byId('checklistPersistenceState');
    if (!element) return;
    const recovered = state?.checklist?.persistence?.recoveredFrom === 'consultation-record';
    const connected = remoteInboxConnection().connected && Boolean(currentWorkspaceSnapshot?.consultation?.remote?.serverBacked);
    const labels = {
      recovered: 'Recovered from consultation record',
      syncing: 'Saving with consultation…',
      secure: 'Saved with consultation',
      pending: 'Saved on this device · secure sync pending',
      device: connected ? 'Saved on this device' : 'Saved on this device · available offline'
    };
    const key = recovered && checklistPersistenceState === 'device' ? 'recovered' : checklistPersistenceState;
    element.textContent = labels[key] || labels.device;
    if (element.dataset) element.dataset.state = key;
    renderProducerPilotReadiness(state || window.CoverageFitAgentWorkspaceChecklist || null);
  }

  function checklistProgressTime(progress) {
    const value = new Date(progress?.lastUpdatedAt || progress?.createdAt || 0).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  function flushChecklistProgress(keepalive) {
    if (!pendingChecklistProgress || !remoteInbox?.updateChecklistProgress) return checklistSyncQueue;
    const record = currentWorkspaceSnapshot?.consultation;
    if (!record?.id || !record?.remote?.serverBacked || !remoteInboxConnection().connected) {
      checklistPersistenceState = 'device';
      renderChecklistPersistence(window.CoverageFitAgentWorkspaceChecklist);
      return checklistSyncQueue;
    }
    const progress = pendingChecklistProgress;
    pendingChecklistProgress = null;
    checklistPersistenceState = 'syncing';
    renderChecklistPersistence(window.CoverageFitAgentWorkspaceChecklist);
    checklistSyncQueue = checklistSyncQueue.catch(() => null).then(() => remoteInbox.updateChecklistProgress(record.id, progress, {
      dispatch: false,
      keepalive: keepalive === true
    })).then(result => {
      checklistPersistenceState = result?.ok && !pendingChecklistProgress ? 'secure' : 'pending';
      renderChecklistPersistence(window.CoverageFitAgentWorkspaceChecklist);
      return result;
    }).catch(() => {
      if (!pendingChecklistProgress || checklistProgressTime(progress) > checklistProgressTime(pendingChecklistProgress)) {
        pendingChecklistProgress = progress;
      }
      checklistPersistenceState = 'pending';
      renderChecklistPersistence(window.CoverageFitAgentWorkspaceChecklist);
      return null;
    });
    return checklistSyncQueue;
  }

  function persistChecklistProgress(state) {
    const recordId = currentWorkspaceSnapshot?.consultation?.id;
    const progress = checklistEngine?.exportProgress?.(state?.checklist);
    if (!recordId || !progress) {
      renderChecklistPersistence(state);
      return null;
    }
    data?.updateConsultationChecklistProgress?.(recordId, progress, { dispatch: false });
    pendingChecklistProgress = progress;
    checklistPersistenceState = 'device';
    if (currentWorkspaceSnapshot?.consultation?.remote?.serverBacked && remoteInboxConnection().connected) {
      checklistPersistenceState = 'pending';
      if (checklistSyncTimer !== null) window.clearTimeout(checklistSyncTimer);
      checklistSyncTimer = window.setTimeout(() => {
        checklistSyncTimer = null;
        flushChecklistProgress(false);
      }, 600);
    }
    renderChecklistPersistence(state);
    return progress;
  }

  function handleChecklistEvent(event) {
    if (workspaceDisposed) return;
    const startedAt = nowMs();
    const state = event?.detail?.state;
    if (!state || typeof state !== 'object') return;
    window.CoverageFitAgentWorkspaceChecklist = state;
    persistChecklistProgress(state);
    if (currentWorkspaceSnapshot) renderConsultationCommandCenter(currentWorkspaceSnapshot, state);
    if (currentWorkspaceSnapshot) renderConsultationProgress(currentWorkspaceSnapshot, state);
    renderProducerPilotReadiness(state);
    renderChecklist(state);
    renderConversationTimeline(state);
    const storage = state?.diagnostics?.storageHealth;
    const storageUnavailable = storage && (storage.enabled === false || ['blocked', 'unavailable', 'error'].includes(storage.status));
    const storageState = byId('checklistStorageState');
    if (storageState) storageState.hidden = !storageUnavailable;
    renderChecklistPersistence(state);
    const checklistState = state?.checklist?.state;
    setChecklistShellState(checklistState === 'ready' ? 'ready' : checklistState === 'empty' ? 'empty' : 'error');
    const message = checklistStatusMessage(state, event.detail?.reason);
    if (message) setStatus(message, 'ready');
    const signature = `${state?.summary?.completed || 0}|${state?.summary?.active || 0}|${state?.currentPhase || ''}`;
    if (signature !== lastAnnouncedChecklistSignature) {
      lastAnnouncedChecklistSignature = signature;
      const total = state?.summary?.total || 0;
      const completed = state?.summary?.completed || 0;
      announce(`${completed} of ${total} consultation items complete. ${state?.remainingMinutes || 0} minutes remaining.`);
    }
    restoreInteractionFocus();
    performanceStats.lastEventDurationMs = Math.max(0, Math.round((nowMs() - startedAt) * 100) / 100);
  }

  function confirmReset(message) {
    return typeof window.confirm !== 'function' || window.confirm(message);
  }

  function handleChecklistAction(event) {
    const control = event.target.closest?.('[data-checklist-action]');
    if (!control || !checklistEngine) return;
    const action = control.dataset.checklistAction;
    const itemId = control.dataset.itemId;
    const phaseId = control.dataset.phaseId;
    const currentState = window.CoverageFitAgentWorkspaceChecklist;
    const item = currentState?.checklist?.items?.find(entry => entry.id === itemId);

    try {
      if (itemId) pendingFocusItemId = itemId;
      if (action === 'toggle-complete' && itemId) {
        if (item?.status === 'complete') {
          checklistEngine.reopen(itemId);
        } else {
          const orderedItems = Array.isArray(currentState?.checklist?.items)
            ? currentState.checklist.items.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
            : [];
          const currentIndex = orderedItems.findIndex(entry => entry.id === itemId);
          const nextItem = orderedItems.slice(currentIndex + 1).find(entry => entry.status !== 'complete');
          checklistEngine.complete(itemId);
          if (nextItem) checklistEngine.activate(nextItem.id);
        }
      } else if (action === 'activate' && itemId && item?.status !== 'active') {
        checklistEngine.activate(itemId);
      } else if (action === 'reset-item' && itemId) {
        checklistEngine.resetItem(itemId);
      } else if (action === 'reset-phase' && phaseId) {
        pendingFocusItemId = '';
        if (confirmReset('Reset every checklist item in this phase?')) {
          checklistEngine.resetPhase(phaseId);
        } else {
          announce('Phase reset cancelled.');
          control.focus?.({ preventScroll: true });
        }
      } else if (action === 'reset-all') {
        pendingFocusItemId = '';
        if (confirmReset('Reset the entire consultation checklist?')) {
          checklistEngine.reset();
        } else {
          announce('Full checklist reset cancelled.');
          control.focus?.({ preventScroll: true });
        }
      }
    } catch (error) {
      console.error('[CoverageFit Agent Workspace] Checklist action failed.', error);
      setStatus('Checklist action could not be completed', 'warning');
    }
  }


  function handleTimelineKeydown(event) {
    const buttons = Array.from(byId('conversationTimeline')?.querySelectorAll('.conversation-timeline__button:not(:disabled)') || []);
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = Math.min(buttons.length - 1, currentIndex + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons.forEach((button, index) => button.tabIndex = index === nextIndex ? 0 : -1);
    buttons[nextIndex].focus();
  }

  function handleSidebarKeydown(event) {
    if (event.key !== 'Escape') return;
    const sidebar = byId('checklistSidebar');
    if (!sidebar || sidebar.classList.contains('is-collapsed')) return;
    if (window.matchMedia?.('(max-width: 860px)').matches) {
      setChecklistSidebarCollapsed(true);
      byId('checklistSidebarToggle')?.focus();
      announce('Consultation checklist collapsed.');
    }
  }

  function handleWorkspaceShortcuts(event) {
    if (event.key === 'Escape' && byId('mobileConsultationMore')?.open) {
      event.preventDefault();
      byId('mobileConsultationMore').open = false;
      byId('mobileConsultationMore')?.querySelector?.('summary')?.focus?.();
      announce('More consultation actions closed.');
      return;
    }
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTypingTarget(event.target)) return;
    const key = String(event.key || '').toLowerCase();
    if (key === 'r') {
      event.preventDefault();
      announce('Refreshing the Agent Workspace.');
      render();
    } else if (key === 'c') {
      event.preventDefault();
      const sidebar = byId('checklistSidebar');
      if (!sidebar || byId('workspaceLayout')?.hidden) return;
      const collapsed = !sidebar.classList.contains('is-collapsed');
      setChecklistSidebarCollapsed(collapsed, { remember: true });
      byId('checklistSidebarToggle')?.focus?.({ preventScroll: true });
      announce(`Consultation checklist ${collapsed ? 'collapsed' : 'expanded'}.`);
    }
  }

  function showEmpty(snapshot, reason) {
    setWorkspaceLoading(false);
    byId('workspaceLayout').hidden = true;
    const recordsBar = byId('consultationRecordsBar');
    if (recordsBar) recordsBar.hidden = true;
    const pipelineRegion = byId('consultationPipeline');
    if (pipelineRegion) pipelineRegion.hidden = true;
    const inboxEmpty = byId('inboxViewEmpty');
    if (inboxEmpty) inboxEmpty.hidden = false;
    const remoteConnected = renderInboxConnectionState([]);
    renderInboxSummary([]);
    updateText(byId('inboxEmptyTitle'), remoteConnected ? 'No completed homeowner reviews yet' : 'No saved homeowner reviews yet');
    updateText(byId('inboxEmptyMessage'), remoteConnected
      ? 'The secure inbox is connected. Sync again when you expect a new submission, or start a Home assessment on this device.'
      : 'Connect the secure producer inbox or complete a Home assessment to populate this list.');
    const pipelineEmpty = byId('pipelineViewEmpty');
    if (pipelineEmpty) pipelineEmpty.hidden = false;
    updateConsultationDocumentAction(snapshot);
    updateCustomerReportAction(snapshot);
    setChecklistShellState('empty');
    byId('emptyState').hidden = false;
    const warning = snapshot?.diagnostics?.warnings?.[0] || 'No saved Home assessment found';
    if (reason === 'adapter') {
      configurePageState({
        tone: 'error',
        eyebrow: 'Workspace unavailable',
        title: 'The Workspace data service did not load.',
        message: 'Refresh the page to try again. If the problem continues, confirm that the Workspace JavaScript files were deployed correctly.',
        primaryLabel: 'Open Home assessment',
        primaryHref: '/assessment/'
      });
      setStatus('Workspace data adapter unavailable', 'warning');
      return;
    }
    configurePageState({
      tone: 'empty',
      eyebrow: remoteConnected ? 'Producer inbox is connected' : 'No assessment loaded',
      title: remoteConnected ? 'No completed homeowner reviews have arrived yet.' : 'Complete a Home assessment on this device first.',
      message: remoteConnected
        ? 'CoverageFit checked the secure producer inbox and found no completed remote reviews. You can sync again or complete a Home assessment on this device.'
        : 'Connect the secure producer inbox to receive reviews completed on prospect devices, or complete a Home assessment in this browser.',
      primaryLabel: 'Open Home assessment',
      primaryHref: '/assessment/'
    });
    setStatus(warning, 'empty');
  }

  function render() {
    const recommendationEntry = byId('prepareQuoteRecommendation');
    if (recommendationEntry) recommendationEntry.href = '/agent/recommendations/';
    if (workspaceDisposed || workspaceRenderInProgress) return;
    workspaceRenderInProgress = true;
    setRefreshBusy(true);
    setWorkspaceLoading(true);
    lastChecklistStructureSignature = '';
    lastTimelineStructureSignature = '';
    byId('workspaceLayout').hidden = true;
    byId('emptyState').hidden = true;
    if (!data || typeof data.getSnapshot !== 'function') {
      showEmpty({ diagnostics: { warnings: ['Workspace data adapter could not be loaded.'] } }, 'adapter');
      workspaceRenderInProgress = false;
      setRefreshBusy(false);
      return;
    }
    const snapshot = data.getSnapshot();
    if (snapshot.state !== 'ready') {
      currentWorkspaceSnapshot = null;
      window.CoverageFitAgentWorkspaceCommandCenter = null;
      showEmpty(snapshot, 'assessment');
      workspaceRenderInProgress = false;
      setRefreshBusy(false);
      return;
    }

    currentWorkspaceSnapshot = snapshot;
    const quoteLink = byId('prepareQuoteRecommendation');
    if (quoteLink) quoteLink.href = snapshot?.consultation?.id ? '/agent/recommendations/?context=consultation&context_id=' + encodeURIComponent(snapshot.consultation.id) : '/agent/recommendations/';

    setWorkspaceLoading(false);
    byId('emptyState').hidden = true;
    byId('workspaceLayout').hidden = false;
    animateWorkspaceSurfaces();
    setChecklistShellState('loading');
    const checklistList = byId('checklistPhaseList');
    if (checklistList) checklistList.innerHTML = '';
    const checklistOverview = byId('checklistOverviewText');
    if (checklistOverview) checklistOverview.textContent = 'Preparing consultation phases and discussion items.';
    const timeline = byId('conversationTimeline');
    if (timeline) timeline.innerHTML = '<div class="conversation-timeline__empty">Preparing conversation timeline.</div>';
    byId('scoreValue').textContent = snapshot.assessment.score == null ? '—' : Math.round(snapshot.assessment.score);
    byId('scoreBand').textContent = snapshot.assessment.status;
    byId('customerName').textContent = snapshot.customer.name;
    byId('assessmentDate').textContent = displayDate(snapshot.assessment.createdAt);
    byId('primaryPriority').textContent = snapshot.assessment.topPriority || 'No major priority identified';
    byId('primaryStrength').textContent = snapshot.assessment.strongest || 'Assessment completed';
    byId('executiveSummary').textContent = snapshot.executiveSummary;

    renderConsultationRecords(snapshot);
    renderCustomerActionHeader(snapshot);
    renderConsultationCommandCenter(snapshot, null);
    updateConsultationDocumentAction(snapshot);
    updateCustomerReportAction(snapshot);
    renderClientIntake(snapshot);
    renderProperty(snapshot.property);
    renderEvidenceHandoff(snapshot.evidenceHandoff);
    renderRecommendations(snapshot.recommendations);
    currentRecommendationPlan = recommendationBuilder?.build?.(snapshot, snapshot?.consultation?.recommendationPlan) || null;
    renderRecommendationBuilder(snapshot);
    renderConsultationProgress(snapshot, null);

    const plan = planner && typeof planner.getPlan === 'function' ? planner.getPlan(snapshot) : null;
    currentConversationPlan = plan;
    window.CoverageFitAgentWorkspacePlan = plan;
    renderGuidedQuestions(plan);
    renderProducerPilotReadiness(window.CoverageFitAgentWorkspaceChecklist || null);
    if (plan?.state === 'ready') {
      window.dispatchEvent(new CustomEvent('coveragefit:conversation-plan-ready', { detail: plan }));
      if (checklistEngine && typeof checklistEngine.restoreFromPlan === 'function') {
        checklistEngine.restoreFromPlan(plan, { recoveryRecord: snapshot?.consultation?.checklistProgress });
      } else {
        setStatus('Assessment loaded, but the consultation checklist engine could not be loaded', 'warning');
      }
    } else {
      currentConversationPlan = null;
      const timelineRegion = byId('conversationTimeline');
      if (timelineRegion) timelineRegion.innerHTML = '<div class="workspace-inline-state workspace-inline-state--error cf-state" role="alert"><strong>Conversation plan unavailable</strong><p>The saved assessment loaded, but the planner could not prepare an agenda. Refresh the Workspace or review the assessment manually.</p><button class="button button--secondary button--compact cf-button cf-button--secondary cf-button--compact" type="button" data-workspace-action="retry">Prepare again</button></div>';
      const timelineSummary = byId('conversationTimelineSummary');
      if (timelineSummary) timelineSummary.textContent = 'Planner unavailable';
      if (checklistEngine && typeof checklistEngine.restoreFromPlan === 'function') {
        checklistEngine.restoreFromPlan(plan, { recoveryRecord: snapshot?.consultation?.checklistProgress });
      }
      window.CoverageFitAgentWorkspaceChecklist = null;
      setStatus('Assessment loaded, but the conversation planner could not prepare an agenda', 'warning');
    }
    workspaceRenderInProgress = false;
    setRefreshBusy(false);
  }

  function handleWorkspaceAction(event) {
    const control = event.target.closest?.('[data-workspace-action]');
    if (!control) return;
    const action = control.dataset.workspaceAction;
    if (action === 'retry') {
      announce('Refreshing the Agent Workspace.');
      render();
    }
  }

  function handleSidebarToggle() {
    const sidebar = byId('checklistSidebar');
    const collapsed = !sidebar?.classList.contains('is-collapsed');
    setChecklistSidebarCollapsed(collapsed, { remember: true });
    announce(`Consultation checklist ${collapsed ? 'collapsed' : 'expanded'}.`);
  }

  function closeMobileConsultationMore(options) {
    const disclosure = byId('mobileConsultationMore');
    if (!disclosure?.open) return false;
    disclosure.open = false;
    if (options?.focus) disclosure.querySelector?.('summary')?.focus?.();
    return true;
  }

  function handleMobileConsoleAction(event) {
    const dock = byId('mobileConsultationDock');
    if (!dock?.contains?.(event.target)) return;
    const action = event.target.closest?.('[data-mobile-console-action]');
    if (action?.dataset.mobileConsoleAction === 'close') {
      closeMobileConsultationMore({ focus: true });
      announce('More consultation actions closed.');
      return;
    }
    if (action?.dataset.mobileConsoleAction === 'inbox') {
      closeMobileConsultationMore();
      setWorkspaceView('inbox', { announce: true, focus: true });
      return;
    }
    if (event.target.closest?.('.mobile-consultation-more__panel a')) closeMobileConsultationMore();
  }

  function handleMobileConsoleDismiss(event) {
    const disclosure = byId('mobileConsultationMore');
    if (!disclosure?.open || disclosure.contains?.(event.target)) return;
    closeMobileConsultationMore();
  }

  listen(document, 'click', handleWorkspaceAction);
  listen(document, 'click', handleInboxAction);
  listen(document, 'click', handleMobileConsoleDismiss);
  listen(byId('mobileConsultationDock'), 'click', handleMobileConsoleAction);
  listen(byId('workspaceTabs'), 'click', handleWorkspaceTabClick);
  listen(byId('workspaceTabs'), 'keydown', handleWorkspaceTabKeydown);
  listen(byId('remoteInboxDisclosure'), 'click', handleRemoteInboxDisclosure);
  listen(byId('chooseConsultationAction'), 'click', () => setWorkspaceView('inbox', { announce: true, focus: true }));
  listen(byId('consultationFocusMode'), 'click', handleConsultationFocusModeClick);
  listen(byId('consultationFocusMode'), 'keydown', handleConsultationFocusModeKeydown);
  listen(window, 'coveragefit:consultation-checklist-ready', handleChecklistEvent);
  listen(window, 'coveragefit:consultation-checklist-change', handleChecklistEvent);
  listen(window, 'coveragefit:consultation-checklist-reset', handleChecklistEvent);
  listen(byId('refreshWorkspace'), 'click', handleWorkspaceRefresh);
  listen(byId('remoteInboxForm'), 'submit', handleRemoteInboxSubmit);
  listen(byId('remoteInboxSync'), 'click', () => syncRemoteInbox());
  listen(byId('remoteInboxDisconnect'), 'click', handleRemoteInboxDisconnect);
  listen(byId('consultationRecordSelect'), 'change', handleConsultationSelection);
  listen(byId('pipelineDateRange'), 'change', handlePipelineDateChange);
  listen(byId('pipelineDateStart'), 'change', handlePipelineDateChange);
  listen(byId('pipelineDateEnd'), 'change', handlePipelineDateChange);
  listen(byId('pipelineStageList'), 'click', handlePipelineStageClick);
  listen(byId('pipelineExportCsv'), 'click', handlePipelineCsvExport);
  listen(byId('consultationQueueList'), 'click', handleConsultationQueueClick);
  listen(byId('inboxSummary'), 'click', handleInboxSummaryClick);
  listen(byId('clearConsultationFilters'), 'click', () => clearInboxFilters({ focus: true }));
  listen(byId('consultationSearch'), 'input', handleInboxFilterChange);
  listen(byId('consultationStatusFilter'), 'change', handleInboxFilterChange);
  listen(byId('consultationFollowUpFilter'), 'change', handleInboxFilterChange);
  listen(byId('consultationStageFilter'), 'change', handleInboxFilterChange);
  listen(byId('consultationDispositionForm'), 'submit', saveActiveDisposition);
  listen(byId('consultationCompletionForm'), 'submit', saveActiveCompletion);
  listen(byId('consultationCompletionUnresolvedState'), 'change', syncCompletionConditionalFields);
  listen(byId('consultationCompletionQuoteState'), 'change', syncCompletionConditionalFields);
  listen(byId('recommendationBuilderForm'), 'submit', saveActiveRecommendationPlan);
  listen(byId('recommendationBuilderList'), 'change', handleRecommendationBuilderInput);
  listen(byId('recommendationBuilderList'), 'input', handleRecommendationBuilderInput);
  listen(byId('recommendationBuilderList'), 'toggle', handleExplanationDisclosure, true);
  listen(byId('consultationStage'), 'change', syncDispositionOutcomeControl);
  listen(byId('consultationFollowUpForm'), 'submit', saveActiveFollowUp);
  listen(byId('consultationNoteForm'), 'submit', saveActiveConsultationNote);
  listen(byId('openConsultationDocument'), 'click', logConsultationDocumentActivity);
  listen(byId('activeCustomerDocumentAction'), 'click', logConsultationDocumentActivity);
  listen(byId('mobileDocumentAction'), 'click', logConsultationDocumentActivity);
  listen(byId('producerPilotOutputConfirmed'), 'change', handlePilotOutputConfirmation);
  listen(byId('openCustomerReport'), 'click', logCustomerReportActivity);
  listen(byId('activeCustomerSnapshotAction'), 'click', logCustomerReportActivity);
  listen(byId('mobileSnapshotAction'), 'click', logCustomerReportActivity);
  listen(byId('completeConsultationFollowUp'), 'click', completeActiveFollowUp);
  listen(byId('clearConsultationFollowUp'), 'click', clearActiveFollowUp);
  listen(byId('acknowledgeConsultation'), 'click', acknowledgeActiveConsultation);
  listen(byId('checklistSidebar'), 'click', handleChecklistAction);
  listen(byId('conversationTimeline'), 'click', handleTimelineAction);
  listen(byId('conversationTimeline'), 'keydown', handleTimelineKeydown);
  listen(byId('checklistSidebar'), 'keydown', handleSidebarKeydown);
  listen(byId('checklistSidebarToggle'), 'click', handleSidebarToggle);
  listen(window, 'resize', syncChecklistSidebarForViewport);
  listen(window, 'resize', syncActiveCustomerSnapshotDisclosure);
  listen(window, 'scroll', syncStickyHeaderDepth, { passive: true });
  listen(document, 'keydown', handleWorkspaceShortcuts);
  listen(window, 'pagehide', () => {
    if (checklistSyncTimer !== null) window.clearTimeout(checklistSyncTimer);
    checklistSyncTimer = null;
    flushChecklistProgress(true);
    teardownWorkspace('pagehide');
  }, { once: true });
  syncChecklistSidebarForViewport();
  syncActiveCustomerSnapshotDisclosure();
  syncStickyHeaderDepth();
  syncPipelineDateControls();
  activateRequestedConsultation();
  setWorkspaceView(initialWorkspaceView());
  initializeRemoteInbox();
  const unsubscribeWorkspaceData = data?.subscribe?.(render);
  if (typeof unsubscribeWorkspaceData === 'function') registerCleanup(unsubscribeWorkspaceData, 'subscription');
  render();
})();
