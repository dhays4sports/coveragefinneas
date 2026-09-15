(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis);
  } else {
    root.CoverageFitPrintEngine = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '0.4.0';
  const SCHEMA_VERSION = 1;
  const CONTRACT_VERSION = 1;
  const PIPELINE_CONTRACT_VERSION = 1;

  const PIPELINE_STAGES = Object.freeze([
    'workspace',
    'adapter',
    'snapshot',
    'validation',
    'renderer',
    'output'
  ]);

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); }
    catch (error) { return null; }
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  const SECTION_CONTRACTS = deepFreeze({
    metadata: {
      type: 'object',
      required: true,
      requiredFields: ['title', 'product', 'consultationDate', 'preparedBy', 'agency', 'sourceVersions'],
      optionalFields: []
    },
    customer: {
      type: 'object',
      required: true,
      requiredFields: ['name'],
      optionalFields: ['email', 'phone']
    },
    assessment: {
      type: 'object',
      required: true,
      requiredFields: ['score', 'status', 'strongest', 'topPriority'],
      optionalFields: ['createdAt']
    },
    executiveSummary: {
      type: 'string',
      required: true,
      allowEmpty: true
    },
    strengths: {
      type: 'array',
      required: true,
      itemType: 'string'
    },
    propertySummary: {
      type: 'object',
      required: true,
      requiredFields: ['available', 'address'],
      optionalFields: ['yearBuilt', 'livingArea', 'stories', 'construction', 'roof', 'foundation', 'pool', 'detachedStructures', 'coverage', 'riskHighlights', 'confirmation', 'quality']
    },
    recommendations: {
      type: 'array',
      required: true,
      itemType: 'object',
      itemRequiredFields: ['id', 'title', 'priority', 'category', 'summary', 'question', 'sourceIds']
    },
    evidenceHandoff: {
      type: 'object',
      required: false,
      requiredFields: ['available', 'state', 'summary', 'confirmedFacts', 'verificationItems', 'unresolvedQuestions', 'guardrail']
    },
    consultationChecklist: {
      type: 'object',
      required: true,
      requiredFields: ['available', 'summary', 'progress', 'currentPhase', 'remainingMinutes', 'plannerVersion', 'phases', 'items', 'diagnostics']
    },
    timeline: {
      type: 'object',
      required: true,
      requiredFields: ['state', 'summary', 'sections', 'items', 'questions', 'guardrails']
    },
    consultationContext: {
      type: 'object',
      required: true,
      requiredFields: ['reviewReason', 'missingInformation', 'decisions', 'nextAction', 'stage', 'outcome', 'dispositionNote', 'followUp'],
      optionalFields: ['recommendationPlan', 'explanationAssist', 'consultationCompletion', 'producerConsumerStory']
    },
    notes: {
      type: 'object',
      required: true,
      requiredFields: ['available', 'entries']
    },
    attribution: {
      type: ['object', 'null'],
      required: true
    },
    diagnostics: {
      type: 'object',
      required: true,
      requiredFields: ['valid', 'warnings', 'validation']
    }
  });

  function typeMatches(value, expected) {
    const types = Array.isArray(expected) ? expected : [expected];
    return types.some(type => {
      if (type === 'null') return value === null;
      if (type === 'array') return Array.isArray(value);
      if (type === 'object') return isPlainObject(value);
      return typeof value === type;
    });
  }

  function validateSection(name, value) {
    const contract = SECTION_CONTRACTS[name];
    const errors = [];
    const warnings = [];

    if (!contract) {
      errors.push(`Unknown print-model section: ${name}.`);
      return deepFreeze({ name, valid: false, errors, warnings });
    }

    if (value === undefined) {
      if (contract.required) errors.push(`${name} is required.`);
      return deepFreeze({ name, valid: errors.length === 0, errors, warnings });
    }

    if (!typeMatches(value, contract.type)) {
      const expected = asArray(contract.type).length ? contract.type.join(' or ') : contract.type;
      errors.push(`${name} must be ${expected}.`);
      return deepFreeze({ name, valid: false, errors, warnings });
    }

    if (contract.type === 'string' && !contract.allowEmpty && !text(value)) {
      errors.push(`${name} cannot be empty.`);
    }

    if (isPlainObject(value)) {
      asArray(contract.requiredFields).forEach(field => {
        if (!Object.prototype.hasOwnProperty.call(value, field)) {
          errors.push(`${name}.${field} is required.`);
        }
      });
    }

    if (Array.isArray(value) && contract.itemType) {
      value.forEach((item, index) => {
        if (!typeMatches(item, contract.itemType)) {
          errors.push(`${name}[${index}] must be ${contract.itemType}.`);
          return;
        }
        if (isPlainObject(item)) {
          asArray(contract.itemRequiredFields).forEach(field => {
            if (!Object.prototype.hasOwnProperty.call(item, field)) {
              errors.push(`${name}[${index}].${field} is required.`);
            }
          });
        }
      });
    }

    if (name === 'assessment' && value.score != null && finiteNumber(value.score) == null) {
      errors.push('assessment.score must be a finite number or null.');
    }
    if (name === 'propertySummary' && typeof value.available !== 'boolean') {
      errors.push('propertySummary.available must be boolean.');
    }
    if (name === 'evidenceHandoff') {
      if (typeof value.available !== 'boolean') errors.push('evidenceHandoff.available must be boolean.');
      if (!Array.isArray(value.confirmedFacts)) errors.push('evidenceHandoff.confirmedFacts must be an array.');
      if (!Array.isArray(value.verificationItems)) errors.push('evidenceHandoff.verificationItems must be an array.');
      if (!Array.isArray(value.unresolvedQuestions)) errors.push('evidenceHandoff.unresolvedQuestions must be an array.');
    }
    if (name === 'consultationChecklist') {
      if (typeof value.available !== 'boolean') errors.push('consultationChecklist.available must be boolean.');
      if (!Array.isArray(value.phases)) errors.push('consultationChecklist.phases must be an array.');
      if (!Array.isArray(value.items)) errors.push('consultationChecklist.items must be an array.');
    }
    if (name === 'notes') {
      if (typeof value.available !== 'boolean') errors.push('notes.available must be boolean.');
      if (!Array.isArray(value.entries)) errors.push('notes.entries must be an array.');
    }
    if (name === 'timeline' && value.state === 'ready' && !asArray(value.items).length) {
      warnings.push('timeline is ready but contains no items.');
    }
    if (name === 'recommendations' && !value.length) {
      warnings.push('No recommendation sections are available for print.');
    }

    return deepFreeze({ name, valid: errors.length === 0, errors, warnings });
  }

  function validateModel(model) {
    const errors = [];
    const warnings = [];
    const sections = {};

    if (!isPlainObject(model)) {
      return deepFreeze({
        valid: false,
        schemaVersion: null,
        contractVersion: CONTRACT_VERSION,
        errors: ['Print model must be an object.'],
        warnings,
        sections
      });
    }

    if (model.schemaVersion !== SCHEMA_VERSION) {
      errors.push(`Unsupported print-model schema version: ${model.schemaVersion}.`);
    }
    if (!text(model.engineVersion)) errors.push('engineVersion is required.');
    if (!['ready', 'empty'].includes(model.state)) errors.push('state must be ready or empty.');
    if (!text(model.generatedAt)) errors.push('generatedAt is required.');

    Object.keys(SECTION_CONTRACTS).forEach(name => {
      const result = validateSection(name, model[name]);
      sections[name] = result;
      result.errors.forEach(error => errors.push(error));
      result.warnings.forEach(warning => warnings.push(warning));
    });

    if (model.state === 'ready') {
      if (!text(model.customer?.name) || model.customer.name === 'Not provided') warnings.push('Ready print model has no customer name.');
      if (!text(model.executiveSummary)) warnings.push('Ready print model has no executive summary.');
    }

    return deepFreeze({
      valid: errors.length === 0,
      schemaVersion: model.schemaVersion ?? null,
      contractVersion: CONTRACT_VERSION,
      errors,
      warnings,
      sections
    });
  }

  function resolveDependencies(options) {
    const settings = options || {};
    return {
      workspaceData: settings.workspaceData || root.CoverageFitWorkspaceData || null,
      planner: settings.planner || root.CoverageFitConversationPlanner || null,
      checklist: settings.checklistEngine || root.CoverageFitConsultationChecklist || null,
      adapterRegistry: settings.adapterRegistry || root.CoverageFitPrintAdapterRegistry || null,
      sectionRegistry: settings.sectionRegistry || root.CoverageFitPrintSectionRegistry || null,
      rendererRegistry: settings.rendererRegistry || root.CoverageFitPrintRendererRegistry || null
    };
  }

  function resolveSourceState(options, dependencies) {
    const settings = options || {};
    const registry = dependencies.adapterRegistry;
    if (registry && typeof registry.createSnapshot === 'function') {
      const hintedProduct = settings.adapterType || settings.product || settings.workspaceSnapshot?.product || 'home';
      const adapterType = typeof registry.resolveType === 'function'
        ? registry.resolveType({ adapterType: hintedProduct, product: hintedProduct })
        : String(hintedProduct).toLowerCase();
      const adapted = registry.createSnapshot(adapterType, { settings, dependencies });
      if (!isPlainObject(adapted)) {
        throw createPrintError(
          'PRINT_ADAPTER_SNAPSHOT_INVALID',
          `Print adapter ${adapterType} returned an invalid snapshot boundary.`,
          { adapterType, outputType: Array.isArray(adapted) ? 'array' : typeof adapted }
        );
      }
      const boundary = deepFreeze({
        workspaceSnapshot: adapted.workspaceSnapshot || null,
        conversationPlan: adapted.conversationPlan || null,
        checklistState: adapted.checklistState || null,
        adapterType: text(adapted.adapterType, adapterType),
        adapterId: text(adapted.adapterId, adapterType),
        adapterVersion: text(adapted.adapterVersion),
        product: text(adapted.product)
      });
      return boundary;
    }
    const workspaceSnapshot = settings.workspaceSnapshot || dependencies.workspaceData?.getSnapshot?.() || null;
    const conversationPlan = settings.conversationPlan || dependencies.planner?.getPlan?.(workspaceSnapshot) || null;
    const checklistState = settings.checklistState || dependencies.checklist?.getWorkspaceState?.() || null;
    return deepFreeze({ workspaceSnapshot, conversationPlan, checklistState, adapterType: 'legacy', adapterId: 'legacy', adapterVersion: '', product: text(workspaceSnapshot?.product) });
  }


  function normalizeCustomer(customer) {
    const source = customer || {};
    return {
      name: text(source.name, 'Not provided'),
      email: text(source.email),
      phone: text(source.phone)
    };
  }

  function normalizeAssessment(assessment) {
    const source = assessment || {};
    return {
      createdAt: source.createdAt ?? null,
      score: finiteNumber(source.score),
      status: text(source.status, 'Review Summary'),
      strongest: text(source.strongest),
      topPriority: text(source.topPriority)
    };
  }

  function normalizeProperty(property) {
    const source = property || {};
    const coverage = source.coverage || {};
    return {
      available: Boolean(source.available),
      address: text(source.address, 'Not provided'),
      yearBuilt: source.yearBuilt ?? null,
      livingArea: source.livingArea ?? null,
      stories: source.stories ?? null,
      construction: source.construction ?? null,
      roof: source.roof ?? null,
      foundation: source.foundation ?? null,
      pool: source.pool ?? null,
      detachedStructures: source.detachedStructures ?? null,
      coverage: {
        replacementCost: coverage.replacementCost ?? source.replacementCost ?? source.rebuildValue ?? source.dwellingLimit ?? null,
        deductible: coverage.deductible ?? source.deductible ?? source.allOtherPerilsDeductible ?? null,
        currentCarrier: text(coverage.currentCarrier || coverage.carrier || source.currentCarrier || source.carrier),
        currentPremium: coverage.currentPremium ?? coverage.annualPremium ?? source.currentPremium ?? source.annualPremium ?? null,
        renewalDate: text(coverage.renewalDate || coverage.expirationDate || source.renewalDate || source.expirationDate)
      },
      riskHighlights: asArray(source.riskHighlights).map(String),
      confirmation: clone(source.confirmation) || null,
      quality: clone(source.quality) || null
    };
  }

  function normalizeRecommendations(recommendations) {
    return asArray(recommendations).map((item, index) => ({
      id: text(item?.id, `recommendation-${index + 1}`),
      title: text(item?.title, 'Review topic'),
      priority: text(item?.priority || item?.level, 'Review'),
      category: text(item?.category || item?.type),
      summary: text(item?.summary || item?.explanation || item?.clientExplanation || item?.description || item?.why),
      explanation: text(item?.explanation || item?.clientExplanation || item?.summary || item?.description || item?.why),
      question: text(item?.question || item?.conversationStarter || item?.discussionQuestion || item?.prompt),
      conversationStarter: text(item?.conversationStarter || item?.discussionQuestion || item?.question || item?.prompt),
      producerNotes: text(item?.producerNotes || item?.agentNotes || item?.suggestedReview || item?.recommendation),
      evidenceQuality: text(item?.evidenceQuality, 'confirmed'),
      evidenceLabel: text(item?.evidenceLabel, 'Clear response captured'),
      evidenceBasis: text(item?.evidenceBasis),
      evidencePrompt: text(item?.evidencePrompt),
      answerLabel: text(item?.answerLabel),
      evidence: asArray(item?.evidence || item?.supportingAnswers).map(String),
      sourceIds: asArray(item?.sourceIds).map(String)
    }));
  }

  function normalizeEvidenceItem(item, index) {
    return {
      id: text(item?.id || item?.key, `evidence-${index + 1}`),
      key: text(item?.key),
      order: finiteNumber(item?.order) || index + 1,
      priorityOrder: finiteNumber(item?.priorityOrder),
      title: text(item?.title, 'Assessment response'),
      category: text(item?.category),
      answer: text(item?.answer),
      statement: text(item?.statement),
      question: text(item?.question),
      evidenceQuality: text(item?.evidenceQuality, 'confirmed'),
      evidenceLabel: text(item?.evidenceLabel),
      evidenceBasis: text(item?.evidenceBasis),
      findingType: text(item?.findingType),
      required: item?.required !== false,
      answered: item?.answered !== false,
      propertyAware: Boolean(item?.propertyAware),
      reviewReasonAware: Boolean(item?.reviewReasonAware)
    };
  }

  function normalizeEvidenceHandoff(source) {
    const handoff = source || {};
    const summary = handoff.summary || {};
    return {
      schemaVersion: text(handoff.schemaVersion, '1.0'),
      handoffVersion: text(handoff.handoffVersion, '1.0.0'),
      available: Boolean(handoff.available),
      state: text(handoff.state, handoff.available ? 'ready' : 'legacy'),
      completionState: text(handoff.completionState, handoff.available ? 'complete' : 'legacy'),
      scoreIsFinal: handoff.scoreIsFinal !== false,
      scoreFormulaChanged: false,
      summary: {
        total: finiteNumber(summary.total) || 0,
        confirmed: finiteNumber(summary.confirmed) || 0,
        verification: finiteNumber(summary.verification) || 0,
        unresolved: finiteNumber(summary.unresolved) || 0,
        followUp: finiteNumber(summary.followUp) || 0
      },
      confirmedFacts: asArray(handoff.confirmedFacts).map(normalizeEvidenceItem),
      verificationItems: asArray(handoff.verificationItems).map(normalizeEvidenceItem),
      unresolvedQuestions: asArray(handoff.unresolvedQuestions).map(normalizeEvidenceItem),
      guardrail: text(handoff.guardrail, 'Confirm homeowner-reported responses against the issued policy before making a recommendation.')
    };
  }

  function normalizeTimeline(plan) {
    const source = plan || {};
    return {
      state: text(source.state, 'empty'),
      summary: clone(source.summary) || { topicCount: 0, agendaItemCount: 0, estimatedMinutes: 0, firstPriority: '' },
      sections: asArray(source.sections).map(section => ({
        id: text(section?.id),
        title: text(section?.title, 'Consultation section'),
        estimatedMinutes: finiteNumber(section?.estimatedMinutes) || 0,
        items: asArray(section?.items).map(item => ({
          id: text(item?.id), phase: text(item?.phase), type: text(item?.type), title: text(item?.title, 'Consultation topic'),
          estimatedMinutes: finiteNumber(item?.estimatedMinutes) || 0, objective: text(item?.objective), prompt: text(item?.prompt),
          coachingNote: text(item?.coachingNote), evidenceQuality: text(item?.evidenceQuality, 'confirmed'), evidenceLabel: text(item?.evidenceLabel), evidenceBasis: text(item?.evidenceBasis), evidencePrompt: text(item?.evidencePrompt), answerLabel: text(item?.answerLabel), sourceIds: asArray(item?.sourceIds).map(String)
        }))
      })),
      items: asArray(source.items).map(item => ({
        id: text(item?.id), phase: text(item?.phase), type: text(item?.type), title: text(item?.title, 'Consultation topic'),
        estimatedMinutes: finiteNumber(item?.estimatedMinutes) || 0, objective: text(item?.objective), prompt: text(item?.prompt),
        coachingNote: text(item?.coachingNote), evidenceQuality: text(item?.evidenceQuality, 'confirmed'), evidenceLabel: text(item?.evidenceLabel), evidenceBasis: text(item?.evidenceBasis), evidencePrompt: text(item?.evidencePrompt), answerLabel: text(item?.answerLabel), sourceIds: asArray(item?.sourceIds).map(String)
      })),
      questions: asArray(source.questions).map(String),
      guardrails: asArray(source.guardrails).map(String)
    };
  }

  function normalizeChecklist(state) {
    const source = state || {};
    const checklist = source.checklist || {};
    return {
      available: Boolean(checklist && asArray(checklist.items).length),
      summary: clone(source.summary) || { total: 0, completed: 0, active: 0, pending: 0, completionPercent: 0 },
      progress: clone(source.progress) || { total: 0, completed: 0, active: 0, pending: 0, completionPercent: 0, remainingMinutes: 0, completedPhases: 0, totalPhases: 0 },
      currentPhase: text(source.currentPhase),
      remainingMinutes: finiteNumber(source.remainingMinutes) || 0,
      plannerVersion: text(source.plannerVersion),
      phases: clone(checklist.phases) || [],
      items: clone(checklist.items) || [],
      diagnostics: clone(source.diagnostics) || null
    };
  }

  function normalizeConsultationContext(source) {
    const context = source || {};
    const followUp = context.followUp || {};
    return {
      reviewReason: text(context.reviewReason),
      missingInformation: asArray(context.missingInformation).map(String).filter(Boolean),
      decisions: asArray(context.decisions).map(String).filter(Boolean),
      nextAction: text(context.nextAction),
      stage: text(context.stage),
      outcome: text(context.outcome),
      dispositionNote: text(context.dispositionNote),
      followUp: {
        state: text(followUp.state, 'none'),
        dueDate: text(followUp.dueDate),
        note: text(followUp.note),
        completedAt: text(followUp.completedAt)
      },
      recommendationPlan: isPlainObject(context.recommendationPlan) ? clone(context.recommendationPlan) : null,
      explanationAssist: isPlainObject(context.explanationAssist) ? clone(context.explanationAssist) : null,
      consultationCompletion: isPlainObject(context.consultationCompletion) ? clone(context.consultationCompletion) : null,
      producerConsumerStory: isPlainObject(context.producerConsumerStory) ? clone(context.producerConsumerStory) : null
    };
  }

  function buildSourceDiagnostics(sources, dependencies) {
    const warnings = [];
    if (!sources.workspaceSnapshot) warnings.push('Workspace snapshot is unavailable.');
    if (sources.workspaceSnapshot?.state !== 'ready') warnings.push('Workspace snapshot is not in the ready state.');
    if (!sources.conversationPlan) warnings.push('Conversation plan is unavailable.');
    if (!sources.checklistState) warnings.push('Consultation checklist state is unavailable.');
    if (!dependencies.workspaceData) warnings.push('Workspace Data adapter is unavailable.');
    if (!dependencies.planner) warnings.push('Conversation Planner is unavailable.');
    if (!dependencies.checklist) warnings.push('Consultation Checklist engine is unavailable.');
    return { valid: Boolean(sources.workspaceSnapshot && sources.conversationPlan && sources.checklistState), warnings };
  }

  function buildModel(options) {
    const settings = options || {};
    const dependencies = resolveDependencies(settings);
    const sources = resolveSourceState(settings, dependencies);
    const snapshot = sources.workspaceSnapshot || {};
    const plan = sources.conversationPlan || {};
    const checklist = normalizeChecklist(sources.checklistState);
    const generatedAt = text(settings.generatedAt) || new Date().toISOString();
    const sourceDiagnostics = buildSourceDiagnostics(sources, dependencies);

    const model = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: VERSION,
      state: snapshot.state === 'ready' ? 'ready' : 'empty',
      generatedAt,
      metadata: {
        title: text(settings.title, 'CoverageFit Consultation Sheet'),
        product: text(snapshot.product, 'Home'),
        consultationDate: text(settings.consultationDate, generatedAt),
        preparedBy: text(settings.preparedBy, 'Dylan Haysbert'),
        agency: text(settings.agency, 'Virginia Tam Insurance Agency'),
        sourceVersions: {
          workspaceData: text(snapshot.adapterVersion || dependencies.workspaceData?.VERSION),
          workspaceSchema: snapshot.schemaVersion ?? dependencies.workspaceData?.SCHEMA_VERSION ?? null,
          planner: text(plan.plannerVersion || dependencies.planner?.VERSION),
          plannerSchema: plan.schemaVersion ?? dependencies.planner?.SCHEMA_VERSION ?? null,
          checklist: text(sources.checklistState?.version || dependencies.checklist?.VERSION),
          checklistSchema: dependencies.checklist?.SCHEMA_VERSION ?? null,
          printAdapter: text(sources.adapterId),
          printAdapterVersion: text(sources.adapterVersion)
        }
      },
      customer: normalizeCustomer(snapshot.customer),
      assessment: normalizeAssessment(snapshot.assessment),
      executiveSummary: text(snapshot.executiveSummary),
      strengths: asArray(snapshot.strengths).map(String),
      propertySummary: normalizeProperty(snapshot.property),
      recommendations: normalizeRecommendations(snapshot.recommendations),
      evidenceHandoff: normalizeEvidenceHandoff(snapshot.evidenceHandoff || settings.consultationContext?.evidenceHandoff),
      consultationChecklist: checklist,
      timeline: normalizeTimeline(plan),
      consultationContext: normalizeConsultationContext(settings.consultationContext),
      notes: { available: Boolean(asArray(settings.notes).length), entries: clone(asArray(settings.notes)) || [] },
      attribution: clone(snapshot.attribution) || null,
      diagnostics: {
        valid: sourceDiagnostics.valid,
        warnings: sourceDiagnostics.warnings,
        validation: null,
        adapter: { type: text(sources.adapterType), id: text(sources.adapterId), version: text(sources.adapterVersion) },
        pipeline: {
          contractVersion: PIPELINE_CONTRACT_VERSION,
          stages: PIPELINE_STAGES.slice(0, 4),
          rendererIsolatedFromWorkspace: true,
          immutableSnapshot: false
        }
      }
    };

    const validation = validateModel(model);
    model.diagnostics.validation = {
      valid: validation.valid,
      contractVersion: validation.contractVersion,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      errors: validation.errors,
      warnings: validation.warnings
    };
    model.diagnostics.valid = sourceDiagnostics.valid && validation.valid;
    model.diagnostics.pipeline.immutableSnapshot = true;
    return deepFreeze(model);
  }

  function createPrintError(code, message, details) {
    const error = new Error(message);
    error.name = 'CoverageFitPrintError';
    error.code = code;
    error.details = deepFreeze(clone(details) || {});
    return error;
  }

  function normalizeRenderArguments(rendererType, options) {
    if (isPlainObject(rendererType) || rendererType == null) {
      const settings = isPlainObject(rendererType) ? rendererType : (options || {});
      return {
        rendererType: text(settings.rendererType || settings.renderer || settings.format),
        options: settings
      };
    }

    if (typeof rendererType !== 'string') {
      throw new TypeError('Renderer type must be a string or an options object.');
    }

    return {
      rendererType: text(rendererType),
      options: isPlainObject(options) ? options : {}
    };
  }

  function selectRendererType(type, options, registry) {
    const settings = options || {};
    const explicit = text(type || settings.rendererType || settings.renderer || settings.format).toLowerCase();
    if (explicit) {
      return deepFreeze({ type: explicit, strategy: 'explicit', capability: null });
    }

    const capability = text(settings.rendererCapability || settings.capability).toLowerCase();
    if (capability && typeof registry?.listRenderers === 'function') {
      const candidates = Array.from(registry.listRenderers({ detailed: true }) || []);
      const match = candidates.find(item => Array.isArray(item?.capabilities) && item.capabilities.includes(capability));
      if (match?.type) {
        return deepFreeze({ type: text(match.type).toLowerCase(), strategy: 'capability', capability });
      }
      if (settings.requireCapability === true) {
        throw createPrintError(
          'PRINT_RENDERER_CAPABILITY_NOT_FOUND',
          `No registered print renderer supports capability: ${capability}.`,
          { capability, availableRenderers: candidates.map(item => item?.type).filter(Boolean) }
        );
      }
    }

    if (typeof registry?.getDefaultRendererType === 'function') {
      const defaultType = text(registry.getDefaultRendererType()).toLowerCase();
      if (defaultType) return deepFreeze({ type: defaultType, strategy: 'registry-default', capability: capability || null });
    }

    if (typeof registry?.hasRenderer === 'function' && registry.hasRenderer('html')) {
      return deepFreeze({ type: 'html', strategy: 'html-fallback', capability: capability || null });
    }

    const available = typeof registry?.listRenderers === 'function'
      ? Array.from(registry.listRenderers() || []).map(item => typeof item === 'string' ? item : item?.type).filter(Boolean)
      : [];
    if (available.length) return deepFreeze({ type: text(available[0]).toLowerCase(), strategy: 'first-registered', capability: capability || null });

    throw createPrintError(
      'PRINT_RENDERER_NOT_FOUND',
      'No print renderer is registered.',
      { availableRenderers: [] }
    );
  }

  function resolveRenderer(type, options) {
    const settings = options || {};
    const dependencies = resolveDependencies(settings);
    const registry = dependencies.rendererRegistry;
    if (!registry || (typeof registry.getRenderer !== 'function' && typeof registry.resolveRenderer !== 'function')) {
      throw createPrintError(
        'PRINT_RENDERER_REGISTRY_UNAVAILABLE',
        'Print renderer registry is unavailable.',
        { requestedRenderer: text(type) || null }
      );
    }

    const selection = selectRendererType(type, settings, registry);
    const requestedType = selection.type;
    if (typeof registry.resolveRenderer === 'function') {
      try {
        const resolved = registry.resolveRenderer(requestedType);
        if (!resolved || !resolved.renderer || typeof resolved.renderer.render !== 'function') {
          throw createPrintError(
            'PRINT_RENDERER_INVALID',
            `Print renderer ${requestedType} does not implement render(model, options).`,
            { requestedRenderer: requestedType }
          );
        }
        return {
          type: text(resolved.type, requestedType),
          renderer: resolved.renderer,
          metadata: resolved.metadata || null,
          registry,
          selection
        };
      } catch (error) {
        if (error?.code === 'PRINT_RENDERER_NOT_FOUND') {
          throw createPrintError(
            'PRINT_RENDERER_NOT_FOUND',
            `Unknown print renderer: ${requestedType}.`,
            error.details || { requestedRenderer: requestedType }
          );
        }
        throw error;
      }
    }

    const renderer = registry.getRenderer(requestedType);
    if (!renderer) {
      const available = typeof registry.listRenderers === 'function'
        ? Array.from(registry.listRenderers() || []).map(item => typeof item === 'string' ? item : item?.type).filter(Boolean)
        : [];
      throw createPrintError(
        'PRINT_RENDERER_NOT_FOUND',
        `Unknown print renderer: ${requestedType}.`,
        { requestedRenderer: requestedType, availableRenderers: available }
      );
    }
    if (typeof renderer.render !== 'function') {
      throw createPrintError(
        'PRINT_RENDERER_INVALID',
        `Print renderer ${requestedType} does not implement render(model, options).`,
        { requestedRenderer: requestedType }
      );
    }

    return { type: requestedType, renderer, metadata: null, registry, selection };
  }

  function renderModel(options) {
    const settings = isPlainObject(options) ? options : {};
    const model = buildModel(settings);
    const validation = validateModel(model);

    if (!validation.valid && settings.strictValidation !== false) {
      throw createPrintError(
        'PRINT_MODEL_INVALID',
        'Print model validation failed.',
        {
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
          errors: validation.errors,
          warnings: validation.warnings
        }
      );
    }

    return model;
  }

  function executePipeline(rendererType, options) {
    const normalized = normalizeRenderArguments(rendererType, options);
    const settings = normalized.options;
    const model = renderModel(settings);
    if (!Object.isFrozen(model)) {
      throw createPrintError(
        'PRINT_MODEL_MUTABLE',
        'Renderer pipeline requires an immutable print model.',
        { rendererType: normalized.rendererType || null }
      );
    }

    const resolved = resolveRenderer(normalized.rendererType, settings);
    const rendererOptions = deepFreeze(clone(settings.rendererOptions || settings.renderOptions) || {});
    const pipeline = deepFreeze({
      contractVersion: PIPELINE_CONTRACT_VERSION,
      stages: PIPELINE_STAGES,
      adapter: clone(model.diagnostics?.adapter) || { type: '', id: '', version: '' },
      snapshot: {
        schemaVersion: model.schemaVersion,
        engineVersion: model.engineVersion,
        immutable: Object.isFrozen(model),
        valid: Boolean(model.diagnostics?.validation?.valid)
      },
      renderer: {
        type: resolved.type,
        selectionStrategy: resolved.selection?.strategy || 'explicit',
        requestedCapability: resolved.selection?.capability || null,
        id: text(resolved.metadata?.id || resolved.renderer?.id, resolved.type),
        version: text(resolved.metadata?.version || resolved.renderer?.version),
        mediaType: resolved.metadata?.mediaType || resolved.renderer?.mediaType || null
      },
      isolation: {
        rendererReceivesWorkspaceState: false,
        rendererReceivesPrintModelOnly: true,
        rendererOptionsImmutable: Object.isFrozen(rendererOptions)
      }
    });

    const output = resolved.renderer.render(model, rendererOptions);
    if (output == null || (typeof output !== 'object' && typeof output !== 'string')) {
      throw createPrintError(
        'PRINT_RENDER_OUTPUT_INVALID',
        `Print renderer ${resolved.type} returned an invalid render output.`,
        { rendererType: resolved.type, outputType: typeof output }
      );
    }

    if (typeof output === 'string') return output;
    const normalizedOutput = Object.assign({}, output, { pipeline });
    return deepFreeze(normalizedOutput);
  }

  function render(rendererType, options) {
    return executePipeline(rendererType, options);
  }

  function getPipelineContract() {
    return deepFreeze({
      contractVersion: PIPELINE_CONTRACT_VERSION,
      stages: PIPELINE_STAGES,
      rendererInput: 'immutable-print-model',
      rendererWorkspaceAccess: false,
      outputImmutable: true
    });
  }

  function getSectionContracts() {
    return SECTION_CONTRACTS;
  }

  function registerAdapter(type, adapter, options) {
    const registry = root.CoverageFitPrintAdapterRegistry;
    if (!registry?.registerAdapter) throw new Error('Print adapter registry is unavailable.');
    return registry.registerAdapter(type, adapter, options);
  }

  function getAdapter(type) {
    return root.CoverageFitPrintAdapterRegistry?.getAdapter?.(type) || null;
  }

  function listAdapters() {
    return root.CoverageFitPrintAdapterRegistry?.listAdapters?.() || deepFreeze([]);
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    CONTRACT_VERSION,
    PIPELINE_CONTRACT_VERSION,
    buildModel,
    getModel: buildModel,
    renderModel,
    render,
    executePipeline,
    getPipelineContract,
    selectRendererType,
    getSectionContracts,
    validateSection,
    validateModel,
    registerAdapter,
    getAdapter,
    listAdapters
  });
});
