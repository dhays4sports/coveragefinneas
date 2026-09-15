(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitConsultationDocument = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document && typeof root.document.addEventListener === 'function') {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', api.initialize, { once: true });
    else api.initialize();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.8.0';
  let initialized = false;
  let currentRecordId = '';
  let generatedOutput = null;
  let currentRenderRequest = null;
  let currentCertification = null;

  function text(value, fallback) {
    if (value === 0) return '0';
    return typeof value === 'string' && value.trim() ? value.trim() : (fallback || '');
  }

  function byId(id) { return root.document?.getElementById?.(id) || null; }

  function requestedConsultationId(search) {
    try { return text(new URLSearchParams(search == null ? root.location?.search || '' : search).get('consultation_id')); }
    catch (_) { return ''; }
  }

  function workspaceHref(id) {
    const value = text(id);
    return value ? `/agent/workspace/?consultation_id=${encodeURIComponent(value)}` : '/agent/workspace/';
  }

  function displayDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function announce(message) {
    const region = byId('documentAnnouncements');
    if (region) region.textContent = text(message);
  }

  function fallbackCertification(output, canPrint) {
    const diagnostics = output?.diagnostics || {};
    const ready = Boolean(output?.html && diagnostics.valid === true && diagnostics.reportShellValid === true && canPrint !== false);
    return Object.freeze({
      state: ready ? 'ready' : 'blocked',
      ready,
      label: ready ? 'Ready for Letter print/PDF' : 'Print setup needs attention',
      blockers: ready ? [] : ['Print document or browser print service'],
      warnings: [],
      setupSteps: []
    });
  }

  function certifyOutput(output, target) {
    const service = root.CoverageFitPrintProductionReadiness;
    const canPrint = Boolean(target && typeof target.print === 'function');
    if (service && typeof service.certify === 'function') return service.certify(output, { canPrint });
    return fallbackCertification(output, canPrint);
  }

  function presentCertification(certification) {
    currentCertification = certification || null;
    const status = byId('printProductionStatus');
    const label = byId('printProductionStatusLabel');
    if (status) status.setAttribute('data-state', certification?.state || 'blocked');
    if (label) label.textContent = text(certification?.label, 'Print setup needs attention');
    const printButton = byId('printConsultationDocument');
    if (printButton) printButton.disabled = !certification?.ready;
  }

  function setState(state, message) {
    const loading = byId('documentLoading');
    const error = byId('documentError');
    const preview = byId('documentPreview');
    if (loading) loading.hidden = state !== 'loading';
    if (error) error.hidden = state !== 'error';
    if (preview) preview.hidden = state !== 'ready';
    if (loading) loading.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    if (state === 'error' && byId('documentErrorMessage')) byId('documentErrorMessage').textContent = text(message, 'Return to the Agent Workspace and select a completed homeowner review.');
    const printButton = byId('printConsultationDocument');
    if (printButton) printButton.disabled = state !== 'ready' || !currentCertification?.ready;
  }

  function resolveRecord(records, id) {
    if (!records) return null;
    const requested = text(id);
    if (requested && typeof records.get === 'function') return records.get(requested, { storage: root.localStorage });
    return typeof records.getActive === 'function' ? records.getActive({ storage: root.localStorage }) : null;
  }

  function producerOptions(producer) {
    const p = producer || {};
    return {
      preparedBy: text(p.name, 'Dylan Haysbert'),
      agency: text(p.agency, 'Virginia Tam Insurance Agency'),
      producerTitle: text(p.title, 'Licensed Insurance Producer'),
      producerLicense: text(p.license),
      producerPhone: text(p.phone),
      producerEmail: text(p.email)
    };
  }

  function humanize(value) {
    return text(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  function deriveMissingInformation(snapshot) {
    const sharedStory = root.CoverageFitProducerConsumerStory;
    if (sharedStory && typeof sharedStory.missingInformation === 'function') return sharedStory.missingInformation(snapshot);
    const missing = [];
    const customer = snapshot?.customer || {};
    const coverage = snapshot?.property?.coverage || {};
    if (!text(customer.phone)) missing.push('Homeowner phone number');
    if (!text(customer.email)) missing.push('Homeowner email address');
    if (!text(snapshot?.property?.address)) missing.push('Confirmed property address');
    if (coverage.replacementCost == null || coverage.replacementCost === '') missing.push('Current estimated rebuilding amount');
    if (coverage.deductible == null || coverage.deductible === '') missing.push('Current property deductible');
    if (!text(coverage.currentCarrier)) missing.push('Current insurance company');
    if (coverage.currentPremium == null || coverage.currentPremium === '') missing.push('Current annual policy cost');
    if (!text(coverage.renewalDate)) missing.push('Next policy date');
    return missing.slice(0, 6);
  }

  function deriveConsultationContext(record, snapshot, checklistState) {
    const disposition = record?.remote?.disposition || record?.disposition || {};
    const followUp = record?.remote?.followUp || record?.followUp || {};
    const evidenceHandoff = snapshot?.evidenceHandoff || null;
    const evidenceFollowUpCount = Number(evidenceHandoff?.summary?.verification || 0) + Number(evidenceHandoff?.summary?.unresolved || 0);
    const decisions = [];
    if (text(disposition.note)) decisions.push(text(disposition.note));
    if (text(disposition.outcome) && disposition.outcome !== 'none') decisions.push(`Recorded outcome: ${humanize(disposition.outcome)}`);
    let nextAction = '';
    if (followUp.state === 'scheduled') {
      nextAction = `Follow up${followUp.dueDate ? ` on ${displayDate(followUp.dueDate)}` : ''}${followUp.note ? `: ${text(followUp.note)}` : '.'}`;
    } else if (text(disposition.stage) === 'closed') {
      nextAction = 'Confirm that the final outcome and any required documentation are complete.';
    } else if (text(disposition.stage) === 'proposal_prepared' || text(disposition.stage) === 'decision_pending') {
      nextAction = 'Review the prepared quote or proposal, address any remaining concern, and confirm the decision path.';
    } else {
      nextAction = evidenceFollowUpCount
        ? `Confirm ${evidenceFollowUpCount} open detail${evidenceFollowUpCount === 1 ? '' : 's'}, complete the consultation, and record the agreed next step.`
        : 'Complete the consultation, confirm what the current policy says, and record the agreed follow-up.';
    }
    const recommendationGuidance = deriveRecommendationGuidance(snapshot);
    const consultationCompletion = deriveConsultationCompletion(record, snapshot);
    const producerConsumerStory = deriveProducerConsumerStory(record, snapshot, checklistState, text(disposition.stage, 'review_received'));
    return {
      reviewReason: text(producerConsumerStory?.review?.reason, text(snapshot?.customer?.reviewContext, 'General coverage review')),
      evidenceHandoff,
      missingInformation: producerConsumerStory?.verification?.detailsToConfirm?.map(item => item.title) || deriveMissingInformation(snapshot),
      decisions,
      nextAction: text(producerConsumerStory?.nextAction?.title, nextAction),
      stage: text(disposition.stage, 'review_received'),
      outcome: text(disposition.outcome, 'none'),
      dispositionNote: text(disposition.note),
      followUp: {
        state: text(followUp.state, 'none'),
        dueDate: text(followUp.dueDate),
        note: text(followUp.note),
        completedAt: text(followUp.completedAt)
      },
      recommendationPlan: recommendationGuidance.plan,
      explanationAssist: recommendationGuidance.assistance,
      consultationCompletion,
      producerConsumerStory
    };
  }

  function deriveProducerConsumerStory(record, snapshot, checklistState, stage) {
    const story = root.CoverageFitProducerConsumerStory;
    if (!story || typeof story.build !== 'function') return null;
    try { return story.build(snapshot, record, { checklist: checklistState || null, stage }); }
    catch (_) { return null; }
  }

  function deriveRecommendationGuidance(snapshot) {
    const builder = root.CoverageFitRecommendationBuilder;
    const explanationAssist = root.CoverageFitExplanationAssist;
    if (!builder || typeof builder.build !== 'function' || !explanationAssist || typeof explanationAssist.build !== 'function') {
      return { plan: null, assistance: null };
    }
    try {
      const savedPlan = snapshot?.consultation?.recommendationPlan || null;
      const plan = builder.build(snapshot, savedPlan);
      const assistance = explanationAssist.build(snapshot, plan);
      return { plan, assistance };
    } catch (_) {
      return { plan: null, assistance: null };
    }
  }

  function deriveConsultationCompletion(record, snapshot) {
    const completion = root.CoverageFitConsultationCompletion;
    if (!completion || typeof completion.build !== 'function') return null;
    try { return completion.build(snapshot, record); }
    catch (_) { return null; }
  }

  function coverPreference() {
    return Boolean(byId('includeCoverPage')?.checked);
  }

  function buildRenderOptions(record, snapshot, plan, checklistState, producer, preferences) {
    const producerData = producerOptions(producer);
    const consultationDate = text(snapshot?.consultation?.createdAt || snapshot?.assessment?.createdAt || record?.createdAt, new Date().toISOString());
    const customerName = text(snapshot?.customer?.name, 'Homeowner');
    const consultationContext = deriveConsultationContext(record, snapshot, checklistState);
    return {
      adapterType: 'home',
      workspaceSnapshot: snapshot,
      conversationPlan: plan,
      checklistState,
      consultationContext,
      notes: record?.remote?.notes || [],
      generatedAt: new Date().toISOString(),
      consultationDate,
      title: 'Home Protection Consultation',
      preparedBy: producerData.preparedBy,
      agency: producerData.agency,
      rendererOptions: {
        title: `${customerName} | Consultation Document | CoverageFit`,
        reportShellOptions: {
          title: 'Home Protection Consultation',
          documentLabel: 'Consultation Document',
          reportId: text(record?.id),
          consultationDate,
          generatedAt: new Date().toISOString(),
          ...producerData,
          confidentialLabel: 'Consultation working document',
          includeCover: Boolean(preferences?.includeCover),
          includePageNumbers: true
        }
      }
    };
  }

  function renderDocument(record, dependencies) {
    const data = dependencies.workspaceData;
    const planner = dependencies.planner;
    const checklist = dependencies.checklist;
    const engine = dependencies.printEngine;
    if (!record || !data || !planner || !checklist || !engine) throw new Error('Required consultation document services are unavailable.');

    if (typeof data.selectConsultation === 'function') data.selectConsultation(record.id, { dispatch: false });
    const snapshot = data.getSnapshot({ consultationId: record.id });
    if (!snapshot || snapshot.state !== 'ready' || snapshot.consultation?.id !== record.id) throw new Error('The selected consultation record could not be loaded.');
    const plan = planner.getPlan(snapshot);
    if (!plan || plan.state !== 'ready') throw new Error('The consultation conversation plan could not be prepared.');
    checklist.restoreFromPlan(plan);
    const checklistState = checklist.getWorkspaceState();
    const options = buildRenderOptions(record, snapshot, plan, checklistState, dependencies.producer, { includeCover: Boolean(dependencies.includeCover) });
    const output = engine.render('html', options);
    if (!output || typeof output.html !== 'string' || !output.html.includes('data-print-shell="body"')) throw new Error('The Print Engine did not return a valid consultation document.');
    return { record, snapshot, plan, checklistState, output, options };
  }

  async function resolveProducer() {
    try {
      if (root.COVERAGEFIT_PRODUCER_READY && typeof root.COVERAGEFIT_PRODUCER_READY.then === 'function') await root.COVERAGEFIT_PRODUCER_READY;
    } catch (_) {}
    return root.COVERAGEFIT_PRODUCER || {};
  }

  function present(result) {
    generatedOutput = result.output;
    currentRecordId = result.record.id;
    const frame = byId('consultationDocumentFrame');
    if (!frame) throw new Error('The consultation document preview frame is unavailable.');
    let previewReady = false;
    const completePreview = () => {
      if (previewReady) return;
      previewReady = true;
      const certification = certifyOutput(result.output, frame.contentWindow);
      presentCertification(certification);
      if (!certification.ready) {
        fail(new Error(`The document is not ready to print: ${certification.blockers.join(', ')}.`));
        return;
      }
      setState('ready');
      announce(`Consultation document ready for ${text(result.snapshot.customer?.name, 'the selected homeowner')}. Letter print and PDF checks passed.`);
    };
    frame.addEventListener?.('load', completePreview, { once: true });
    frame.srcdoc = result.output.html;
    root.setTimeout?.(completePreview, 1200);
    const label = byId('documentRecordLabel');
    if (label) label.textContent = `${text(result.snapshot.customer?.name, 'Homeowner')} · ${text(result.snapshot.customer?.propertyAddress, 'Address not provided')} · ${displayDate(result.snapshot.consultation?.createdAt)}`;
    const workspaceLink = workspaceHref(currentRecordId);
    const back = byId('backToWorkspace');
    const errorAction = byId('documentErrorAction');
    if (back) back.href = workspaceLink;
    if (errorAction) errorAction.href = workspaceLink;
    root.document.title = `${text(result.snapshot.customer?.name, 'Homeowner')} | Consultation Document | CoverageFit`;
  }

  function fail(error) {
    generatedOutput = null;
    currentCertification = null;
    presentCertification(null);
    const requested = requestedConsultationId();
    const workspaceLink = workspaceHref(requested);
    const back = byId('backToWorkspace');
    const errorAction = byId('documentErrorAction');
    if (back) back.href = workspaceLink;
    if (errorAction) errorAction.href = workspaceLink;
    setState('error', text(error?.message, 'Return to the Agent Workspace and select a completed homeowner review.'));
    announce('Consultation document unavailable.');
  }

  function printDocument() {
    if (!generatedOutput) return false;
    const frame = byId('consultationDocumentFrame');
    const target = frame?.contentWindow;
    if (!target || typeof target.print !== 'function') {
      fail(new Error('The browser print service is unavailable.'));
      return false;
    }
    const certification = certifyOutput(generatedOutput, target);
    presentCertification(certification);
    if (!certification.ready) {
      announce(`Printing is blocked until the document check passes: ${certification.blockers.join(', ')}.`);
      return false;
    }
    try {
      target.focus?.();
      target.print();
      announce('Print dialog opened. Use Letter portrait, Default or 100% scale, background graphics on, and browser headers and footers off. Choose Save as PDF to save a PDF copy.');
      return true;
    } catch (_) {
      fail(new Error('The browser could not open the print dialog.'));
      return false;
    }
  }

  function regenerateDocument() {
    if (!currentRenderRequest) return null;
    setState('loading');
    try {
      const result = renderDocument(currentRenderRequest.record, {
        ...currentRenderRequest.dependencies,
        includeCover: coverPreference()
      });
      present(result);
      return result.output;
    } catch (error) {
      fail(error);
      return null;
    }
  }

  function togglePrintSetup() {
    const button = byId('printSetupToggle');
    const panel = byId('printSetupPanel');
    if (!button || !panel) return false;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    return willOpen;
  }

  async function initialize() {
    if (initialized) return generatedOutput;
    initialized = true;
    setState('loading');
    const printButton = byId('printConsultationDocument');
    printButton?.addEventListener?.('click', printDocument);
    byId('printSetupToggle')?.addEventListener?.('click', togglePrintSetup);
    byId('includeCoverPage')?.addEventListener?.('change', regenerateDocument);
    try {
      const records = root.CoverageFitConsultationRecords;
      const record = resolveRecord(records, requestedConsultationId());
      if (!record) throw new Error('No saved homeowner consultation record was found in this browser.');
      const producer = await resolveProducer();
      const dependencies = {
        workspaceData: root.CoverageFitWorkspaceData,
        planner: root.CoverageFitConversationPlanner,
        checklist: root.CoverageFitConsultationChecklist,
        printEngine: root.CoverageFitPrintEngine,
        producer
      };
      currentRenderRequest = { record, dependencies };
      const result = renderDocument(record, { ...dependencies, includeCover: coverPreference() });
      present(result);
      return result.output;
    } catch (error) {
      fail(error);
      return null;
    }
  }

  return Object.freeze({
    VERSION,
    initialize,
    requestedConsultationId,
    workspaceHref,
    resolveRecord,
    producerOptions,
    buildRenderOptions,
    deriveMissingInformation,
    deriveConsultationContext,
    deriveProducerConsumerStory,
    deriveRecommendationGuidance,
    deriveConsultationCompletion,
    renderDocument,
    regenerateDocument,
    printDocument,
    certifyOutput,
    togglePrintSetup,
    getCurrentRecordId: () => currentRecordId,
    getGeneratedOutput: () => generatedOutput,
    getCurrentCertification: () => currentCertification
  });
});
