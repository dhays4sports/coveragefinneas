(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.CoverageFitConversationPlanner = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.dispatchEvent && root.CustomEvent) {
    root.dispatchEvent(new root.CustomEvent('coveragefit:conversation-planner-ready', {
      detail: { version: api.VERSION, schemaVersion: api.SCHEMA_VERSION }
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.2.0';
  const SCHEMA_VERSION = '1.0';
  const DEFAULT_TOPIC_LIMIT = 5;
  const DEFAULT_GUIDED_QUESTION_LIMIT = 5;

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  }

  function text(value, fallback) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value === 0) return '0';
    return fallback || '';
  }

  function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function priorityRank(value) {
    const normalized = text(value).toLowerCase();
    if (/critical|urgent|highest/.test(normalized)) return 4;
    if (/high|important|priority/.test(normalized)) return 3;
    if (/medium|moderate|review/.test(normalized)) return 2;
    if (/low|optional|consider/.test(normalized)) return 1;
    return 2;
  }

  function stableId(prefix, value, index) {
    const raw = text(value, `${prefix}-${index + 1}`).toLowerCase();
    const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    return `${prefix}-${slug || index + 1}`;
  }

  function normalizeTopics(snapshot, limit) {
    const recommendations = Array.isArray(snapshot?.recommendations) ? snapshot.recommendations : [];
    return recommendations
      .map((item, index) => ({
        id: text(item?.id, stableId('topic', item?.title, index)),
        questionKey: text(item?.questionKey || item?.key),
        sourceOrder: finiteNumber(item?.order) || index + 1,
        title: text(item?.title, 'Protection topic'),
        category: text(item?.category, 'General review'),
        priority: text(item?.priority, 'Review topic'),
        priorityRank: priorityRank(item?.priority),
        confidence: finiteNumber(item?.confidence),
        explanation: text(item?.explanation, 'Confirm how this topic is addressed by the current policy.'),
        conversationStarter: text(item?.conversationStarter, 'Can we confirm how this topic is addressed by the current policy?'),
        producerNotes: text(item?.producerNotes),
        evidenceQuality: text(item?.evidenceQuality, 'confirmed'),
        evidenceLabel: text(item?.evidenceLabel, 'Clear response captured'),
        evidenceBasis: text(item?.evidenceBasis),
        evidencePrompt: text(item?.evidencePrompt),
        answerLabel: text(item?.answerLabel),
        evidence: Array.isArray(item?.evidence) ? item.evidence.filter(Boolean).map(String) : []
      }))
      .sort((a, b) => {
        if (b.priorityRank !== a.priorityRank) return b.priorityRank - a.priorityRank;
        const confidenceA = a.confidence == null ? -1 : a.confidence;
        const confidenceB = b.confidence == null ? -1 : b.confidence;
        if (confidenceB !== confidenceA) return confidenceB - confidenceA;
        return a.sourceOrder - b.sourceOrder;
      })
      .slice(0, limit);
  }

  function questionReason(kind, title) {
    const subject = text(title, 'this detail').toLowerCase();
    if (kind === 'missing') return `No answer was recorded for ${subject}.`;
    if (kind === 'clarify') return `The homeowner provided some context for ${subject}, but an important detail is still incomplete.`;
    if (kind === 'policy') return `The assessment response for ${subject} needs to be compared with current policy documents or licensed confirmation.`;
    if (kind === 'property') return 'Property Intelligence is a starting point until the homeowner confirms the details.';
    return 'This is one of the assessment’s highest-priority protection findings.';
  }

  function guidedQuestion(options) {
    const settings = options || {};
    const kind = text(settings.kind, 'finding');
    const title = text(settings.title, 'Protection detail');
    return {
      id: stableId('guided-question', settings.id || title, finiteNumber(settings.order) || 0),
      order: finiteNumber(settings.order) || 0,
      kind,
      label: kind === 'missing'
        ? 'Ask homeowner'
        : kind === 'clarify'
          ? 'Clarify answer'
          : kind === 'policy'
            ? 'Check policy'
            : kind === 'property'
              ? 'Confirm property'
              : 'Explore finding',
      question: text(settings.question),
      why: text(settings.why, questionReason(kind, title)),
      sourceId: text(settings.sourceId || settings.id),
      sourceTitle: title,
      evidenceQuality: text(settings.evidenceQuality, kind === 'finding' ? 'confirmed' : kind),
      priority: text(settings.priority),
      findingId: text(settings.findingId),
      questionKey: text(settings.questionKey)
    };
  }

  function buildGuidedQuestions(snapshot, topics, limit) {
    const handoff = snapshot?.evidenceHandoff || {};
    const unresolved = Array.isArray(handoff.unresolvedQuestions) ? handoff.unresolvedQuestions : [];
    const verification = Array.isArray(handoff.verificationItems) ? handoff.verificationItems : [];
    const candidates = [];
    let sourceOrder = 0;

    unresolved.forEach(item => {
      const quality = text(item?.evidenceQuality, 'missing').toLowerCase();
      const kind = quality === 'partial' ? 'clarify' : 'missing';
      const question = text(item?.question || item?.statement);
      if (!question) return;
      candidates.push({
        groupRank: kind === 'missing' ? 0 : 1,
        priorityOrder: finiteNumber(item?.priorityOrder) || 999,
        sourceOrder: sourceOrder++,
        question: guidedQuestion({
          id: item?.id || item?.key,
          kind,
          title: item?.title,
          question,
          sourceId: item?.key || item?.id,
          questionKey: item?.key,
          evidenceQuality: quality,
          priority: item?.priority
        })
      });
    });

    verification.forEach(item => {
      const question = text(item?.question || item?.statement);
      if (!question) return;
      candidates.push({
        groupRank: 2,
        priorityOrder: finiteNumber(item?.priorityOrder) || 999,
        sourceOrder: sourceOrder++,
        question: guidedQuestion({
          id: item?.id || item?.key,
          kind: 'policy',
          title: item?.title,
          question,
          sourceId: item?.key || item?.id,
          questionKey: item?.key,
          evidenceQuality: text(item?.evidenceQuality, 'needs-verification'),
          priority: item?.priority
        })
      });
    });

    const property = snapshot?.property || {};
    if (property?.confirmation?.requiresConfirmation !== false) {
      const address = text(property.address, 'the insured property');
      candidates.push({
        groupRank: 3,
        priorityOrder: 999,
        sourceOrder: sourceOrder++,
        question: guidedQuestion({
          id: 'property-confirmation',
          kind: 'property',
          title: address,
          question: property.available
            ? 'Can we confirm the property details and any updates that may not appear in public records?'
            : 'Can we confirm the property address, characteristics, and any recent updates before reviewing coverage?',
          sourceId: 'property-profile',
          evidenceQuality: property.available ? 'needs-verification' : 'missing'
        })
      });
    }

    topics.forEach((topic, index) => {
      const question = text(topic.conversationStarter);
      if (!question) return;
      candidates.push({
        groupRank: 4,
        priorityOrder: index + 1,
        sourceOrder: sourceOrder++,
        question: guidedQuestion({
          id: topic.id,
          kind: 'finding',
          title: topic.title,
          question,
          sourceId: topic.id,
          questionKey: topic.questionKey,
          evidenceQuality: topic.evidenceQuality,
          priority: topic.priority,
          findingId: topic.id
        })
      });
    });

    candidates.sort((a, b) => {
      if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank;
      if (a.priorityOrder !== b.priorityOrder) return a.priorityOrder - b.priorityOrder;
      return a.sourceOrder - b.sourceOrder;
    });

    const seenText = new Set();
    const evidenceKeys = new Set(candidates
      .filter(candidate => candidate.groupRank < 3)
      .map(candidate => text(candidate.question.questionKey || candidate.question.sourceId).toLowerCase())
      .filter(Boolean));
    const selected = [];
    candidates.forEach(candidate => {
      const question = candidate.question;
      const normalizedText = question.question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const key = text(question.questionKey || question.sourceId).toLowerCase();
      if (!normalizedText || seenText.has(normalizedText)) return;
      if (candidate.groupRank === 4 && key && evidenceKeys.has(key)) return;
      seenText.add(normalizedText);
      selected.push({ ...question, order: selected.length + 1 });
    });
    return selected.slice(0, limit);
  }

  function getGuidedQuestions(snapshot, options) {
    const settings = options || {};
    if (text(snapshot?.state, 'empty') !== 'ready') return [];
    const topicLimit = clamp(finiteNumber(settings.topicLimit) || DEFAULT_TOPIC_LIMIT, 1, 10);
    const questionLimit = clamp(finiteNumber(settings.questionLimit) || DEFAULT_GUIDED_QUESTION_LIMIT, 1, 10);
    return buildGuidedQuestions(snapshot, normalizeTopics(snapshot, topicLimit), questionLimit);
  }

  function openingItem(snapshot) {
    const name = text(snapshot?.customer?.name, 'the customer');
    const strength = text(snapshot?.assessment?.strongest) ||
      (Array.isArray(snapshot?.strengths) ? text(snapshot.strengths[0]) : '') ||
      'completion of the CoverageFit review';
    return {
      id: 'opening-alignment',
      phase: 'opening',
      type: 'alignment',
      title: 'Set the agenda and establish context',
      estimatedMinutes: 2,
      objective: `Confirm what ${name} wants from the conversation and explain that the review will focus on fit, not simply price.`,
      prompt: 'Before we look at numbers, what would make this conversation most useful for you today?',
      coachingNote: `Recognize the positive starting point: ${strength}.`,
      sourceIds: []
    };
  }

  function propertyItem(snapshot) {
    const property = snapshot?.property || {};
    const requiresConfirmation = property?.confirmation?.requiresConfirmation !== false;
    const address = text(property.address, 'the insured property');
    return {
      id: 'context-property',
      phase: 'context',
      type: 'property-confirmation',
      title: requiresConfirmation ? 'Confirm the property facts' : 'Validate the confirmed property profile',
      estimatedMinutes: requiresConfirmation ? 4 : 2,
      objective: `Make sure the discussion is based on accurate details for ${address}.`,
      prompt: requiresConfirmation
        ? 'Before we review coverage, can we confirm the property details and any updates that may not appear in public records?'
        : 'I have the property details you confirmed. Has anything changed since you completed the assessment?',
      coachingNote: requiresConfirmation
        ? 'Treat Property Intelligence as a starting point. Customer confirmation controls the conversation.'
        : text(property?.confirmation?.label, 'Customer-confirmed property details are available.'),
      sourceIds: []
    };
  }

  function evidenceAlignmentItem(snapshot) {
    const handoff = snapshot?.evidenceHandoff || {};
    const summary = handoff.summary || {};
    const confirmed = finiteNumber(summary.confirmed) || 0;
    const verification = finiteNumber(summary.verification) || 0;
    const unresolved = finiteNumber(summary.unresolved) || 0;
    const followUp = verification + unresolved;
    const firstVerification = handoff.verificationItems?.[0];
    const firstUnresolved = handoff.unresolvedQuestions?.[0];
    const firstOpen = firstUnresolved || firstVerification;
    const confirmedExamples = Array.isArray(handoff.confirmedFacts)
      ? handoff.confirmedFacts.slice(0, 3).map(item => text(item?.statement)).filter(Boolean)
      : [];
    const openPrompts = []
      .concat(Array.isArray(handoff.unresolvedQuestions) ? handoff.unresolvedQuestions : [])
      .concat(Array.isArray(handoff.verificationItems) ? handoff.verificationItems : [])
      .slice(0, 4)
      .map(item => text(item?.question || item?.statement))
      .filter(Boolean);
    return {
      id: 'context-evidence-handoff',
      phase: 'context',
      type: 'evidence-handoff',
      title: followUp ? 'Resolve the assessment evidence' : 'Validate the confirmed assessment facts',
      estimatedMinutes: followUp ? Math.min(6, Math.max(3, followUp + 2)) : 2,
      objective: handoff.available
        ? `${confirmed} confirmed fact${confirmed === 1 ? '' : 's'}, ${verification} policy-verification item${verification === 1 ? '' : 's'}, and ${unresolved} unresolved question${unresolved === 1 ? '' : 's'} were carried forward from the homeowner review.`
        : 'The saved report predates evidence-quality handoff. Confirm the homeowner responses before relying on them.',
      prompt: firstOpen
        ? text(firstOpen.question, 'Which policy details should we verify before discussing recommendations?')
        : 'Before we discuss recommendations, has anything changed or does any assessment response need clarification?',
      coachingNote: followUp
        ? `Resolve the open items before treating the related response as confirmed. ${openPrompts.join(' ')}`
        : confirmedExamples.length
          ? `Use the confirmed facts as homeowner-reported context, then validate that they remain accurate: ${confirmedExamples.join('; ')}.`
          : 'Confirm the homeowner-reported facts against the current policy and household details.',
      evidenceQuality: followUp ? 'needs-verification' : 'confirmed',
      evidenceLabel: followUp ? `${followUp} follow-up item${followUp === 1 ? '' : 's'}` : 'Assessment facts ready to validate',
      evidence: confirmedExamples,
      sourceIds: openPrompts.length
        ? []
          .concat(Array.isArray(handoff.unresolvedQuestions) ? handoff.unresolvedQuestions : [])
          .concat(Array.isArray(handoff.verificationItems) ? handoff.verificationItems : [])
          .map(item => text(item?.key)).filter(Boolean)
        : [],
      metadata: {
        evidenceHandoff: clone(handoff),
        confirmedCount: confirmed,
        verificationCount: verification,
        unresolvedCount: unresolved
      }
    };
  }

  function topicItem(topic, index) {
    return {
      id: stableId('review', topic.id || topic.title, index),
      phase: 'review',
      type: 'recommendation-topic',
      title: topic.title,
      estimatedMinutes: topic.priorityRank >= 3 ? 5 : 4,
      objective: topic.explanation,
      prompt: topic.conversationStarter,
      coachingNote: topic.producerNotes || `Confirm the current limits, deductible, endorsements, exclusions, and customer preference before making a recommendation.`,
      priority: topic.priority,
      confidence: topic.confidence,
      evidenceQuality: topic.evidenceQuality,
      evidenceLabel: topic.evidenceLabel,
      evidenceBasis: topic.evidenceBasis,
      evidencePrompt: topic.evidencePrompt,
      answerLabel: topic.answerLabel,
      evidence: clone(topic.evidence) || [],
      sourceIds: [topic.id],
      metadata: {
        evidenceQuality: topic.evidenceQuality,
        evidenceLabel: topic.evidenceLabel,
        evidenceBasis: topic.evidenceBasis,
        evidencePrompt: topic.evidencePrompt,
        answerLabel: topic.answerLabel
      }
    };
  }

  function connectionItem(topics) {
    const topicNames = topics.slice(0, 2).map(topic => topic.title).join(' and ');
    return {
      id: 'connection-whole-picture',
      phase: 'connect',
      type: 'coverage-connection',
      title: 'Connect the coverage decisions',
      estimatedMinutes: 3,
      objective: topicNames
        ? `Explain how decisions around ${topicNames} may affect the broader protection strategy without forcing a product conclusion.`
        : 'Connect the customer’s home, liability, vehicle, and family protection priorities where relevant.',
      prompt: 'Are there any other policies, assets, drivers, rentals, or family responsibilities that should be considered before we finalize the review?',
      coachingNote: 'Only introduce Auto, Umbrella, Life, Landlord, or Business when the customer facts make the connection relevant.',
      sourceIds: topics.slice(0, 2).map(topic => topic.id)
    };
  }

  function closingItem() {
    return {
      id: 'close-next-step',
      phase: 'close',
      type: 'next-step',
      title: 'Confirm decisions and the next step',
      estimatedMinutes: 3,
      objective: 'Summarize what was confirmed, what still needs verification, and the specific next action.',
      prompt: 'Based on what we reviewed, which option feels like the best fit, and what would you still need to feel comfortable moving forward?',
      coachingNote: 'Do not end with a vague promise to follow up. Name the owner, action, and timing for each open item.',
      sourceIds: []
    };
  }

  function buildSections(items) {
    const definitions = [
      ['opening', 'Open and align'],
      ['context', 'Confirm the facts'],
      ['review', 'Review priority topics'],
      ['connect', 'Connect the protection strategy'],
      ['close', 'Agree on next steps']
    ];
    return definitions.map(([id, title]) => {
      const sectionItems = items.filter(item => item.phase === id);
      return {
        id,
        title,
        estimatedMinutes: sectionItems.reduce((total, item) => total + item.estimatedMinutes, 0),
        items: sectionItems
      };
    }).filter(section => section.items.length);
  }

  function getPlan(snapshot, options) {
    const settings = options || {};
    const topicLimit = clamp(finiteNumber(settings.topicLimit) || DEFAULT_TOPIC_LIMIT, 1, 10);
    const questionLimit = clamp(finiteNumber(settings.questionLimit) || DEFAULT_GUIDED_QUESTION_LIMIT, 1, 10);
    const state = text(snapshot?.state, 'empty');
    if (state !== 'ready') {
      return {
        schemaVersion: SCHEMA_VERSION,
        plannerVersion: VERSION,
        state: 'empty',
        generatedAt: new Date().toISOString(),
        consultationId: text(snapshot?.consultation?.id),
        customer: { name: text(snapshot?.customer?.name, 'Not provided') },
        summary: { topicCount: 0, guidedQuestionCount: 0, agendaItemCount: 0, estimatedMinutes: 0, firstPriority: '', evidenceConfirmedCount: 0, evidenceVerificationCount: 0, evidenceUnresolvedCount: 0 },
        evidenceHandoff: null,
        sections: [],
        items: [],
        guidedQuestions: [],
        questions: [],
        diagnostics: { isReady: false, warnings: ['A ready workspace snapshot is required to generate a conversation plan.'] }
      };
    }

    const topics = normalizeTopics(snapshot, topicLimit);
    const guidedQuestions = buildGuidedQuestions(snapshot, topics, questionLimit);
    const items = [openingItem(snapshot), propertyItem(snapshot), evidenceAlignmentItem(snapshot)]
      .concat(topics.map(topicItem))
      .concat([connectionItem(topics), closingItem()]);
    const sections = buildSections(items);
    const estimatedMinutes = items.reduce((total, item) => total + item.estimatedMinutes, 0);
    const warnings = [];
    if (!topics.length) warnings.push('No recommendation topics were available; the plan uses a general discovery structure.');
    if (!snapshot?.property?.available) warnings.push('No Property Intelligence profile is available; property facts must be gathered during the conversation.');

    return {
      schemaVersion: SCHEMA_VERSION,
      plannerVersion: VERSION,
      state: 'ready',
      generatedAt: new Date().toISOString(),
      consultationId: text(snapshot?.consultation?.id),
      customer: clone(snapshot.customer) || { name: 'Not provided' },
      assessment: {
        score: finiteNumber(snapshot?.assessment?.score),
        status: text(snapshot?.assessment?.status, 'Review Summary'),
        createdAt: snapshot?.assessment?.createdAt || null
      },
      summary: {
        topicCount: topics.length,
        guidedQuestionCount: guidedQuestions.length,
        agendaItemCount: items.length,
        estimatedMinutes,
        firstPriority: topics[0]?.title || '',
        openingFocus: text(snapshot?.assessment?.strongest) || text(snapshot?.strengths?.[0]) || 'Complete a structured protection review',
        evidenceConfirmedCount: finiteNumber(snapshot?.evidenceHandoff?.summary?.confirmed) || 0,
        evidenceVerificationCount: finiteNumber(snapshot?.evidenceHandoff?.summary?.verification) || 0,
        evidenceUnresolvedCount: finiteNumber(snapshot?.evidenceHandoff?.summary?.unresolved) || 0
      },
      evidenceHandoff: clone(snapshot?.evidenceHandoff) || null,
      sections,
      items,
      guidedQuestions,
      questions: items.map(item => item.prompt).filter(Boolean),
      guardrails: [
        'Use CoverageFit recommendations as discussion topics, not binding coverage conclusions.',
        'Confirm customer facts and issued policy language before making a recommendation.',
        'Treat confirmed facts as homeowner-reported context; resolve verification items and unresolved questions before relying on them.',
        'Keep the conversation educational, personalized, transparent, and professional.'
      ],
      diagnostics: { isReady: true, warnings }
    };
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    getGuidedQuestions,
    getPlan
  });
});
