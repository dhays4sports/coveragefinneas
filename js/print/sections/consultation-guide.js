(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../print-sections.js'), require('../models/consultation-guide-model.js'), require('../consultation-document-architecture.js'));
  } else {
    root.CoverageFitPrintSections = root.CoverageFitPrintSections || {};
    root.CoverageFitPrintSections['consultation-guide'] = factory(root.CoverageFitPrintSectionRegistry, root.CoverageFitConsultationGuideModel, root.CoverageFitConsultationDocumentArchitecture);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (registry, guideModel, architecture) {
  'use strict';
  if (!guideModel || typeof guideModel.create !== 'function') throw new Error('CoverageFit Consultation Guide Model is required.');

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function formatDate(value) {
    if (!value) return 'Not scheduled';
    const date = new Date(String(value).includes('T') ? value : `${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }
  function renderWritingLines(count, label) {
    return `<div class="cf-guide-writing-lines" aria-label="${escapeHtml(label || 'Space for notes')}">${Array.from({ length: count || 3 }, () => '<span></span>').join('')}</div>`;
  }
  function renderConfirm(items) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    const normalized = values.length ? values : ['Current limits, deductibles, added policy options, what the policy does not cover, and the homeowner’s preference.'];
    return `<ul class="cf-guide-check-list">${normalized.map(item => `<li><span class="cf-guide-check-box" aria-hidden="true"></span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>`;
  }
  function renderHandoffList(items, emptyMessage, kind) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return `<li class="cf-guide-evidence__empty">${escapeHtml(emptyMessage)}</li>`;
    return values.map(item => {
      const detail = kind === 'confirmed' ? (item.answer || item.statement) : (item.question || item.answer || item.statement);
      return `<li><strong>${escapeHtml(item.title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</li>`;
    }).join('');
  }
  function workingEvidenceLabel(topic) {
    const quality = String(topic?.evidenceQuality || '').toLowerCase();
    if (quality === 'confirmed' || quality === 'clear') return 'Homeowner answer';
    if (quality.includes('verification') || quality === 'partial') return 'Check policy';
    if (quality.includes('unresolved') || quality.includes('missing') || quality.includes('insufficient')) return 'Confirm together';
    return topic?.evidenceLabel ? String(topic.evidenceLabel) : 'Review item';
  }
  function renderEvidenceHandoff(handoff) {
    const source = handoff || {};
    const summary = source.summary || {};
    if (!source.available) {
      return `<section class="cf-guide-evidence cf-guide-evidence--legacy" aria-label="Information used for this review">
        <div class="cf-guide-evidence__heading"><span>Information used for this review</span><strong>Older record</strong></div>
        <p>This older record does not separate confirmed answers from open questions. Review the saved answers before relying on them.</p>
      </section>`;
    }
    return `<section class="cf-guide-evidence" aria-labelledby="cf-guide-evidence-title">
      <div class="cf-guide-evidence__heading">
        <div><span>Information used for this review</span><h2 id="cf-guide-evidence-title">What was shared and what still needs confirmation</h2></div>
        <strong>${Number(summary.confirmed || 0)} clear answer${Number(summary.confirmed || 0) === 1 ? '' : 's'} · ${Number(summary.followUp || 0)} detail${Number(summary.followUp || 0) === 1 ? '' : 's'} to confirm</strong>
      </div>
      <div class="cf-guide-evidence__grid">
        <section><h3>What the homeowner shared</h3><ul>${renderHandoffList(source.confirmedFacts, 'No clear homeowner answers were carried forward.', 'confirmed')}</ul></section>
        <section><h3>What to check in the policy</h3><ul>${renderHandoffList(source.verificationItems, 'No current-policy checks were identified.', 'verification')}</ul></section>
        <section><h3>What to confirm together</h3><ul>${renderHandoffList(source.unresolvedQuestions, 'No open homeowner questions were identified.', 'unresolved')}</ul></section>
      </div>
      <p class="cf-guide-evidence__guardrail">${escapeHtml(source.guardrail)}</p>
    </section>`;
  }

  function renderRecommendationExplanation(recommendation) {
    const source = recommendation || {};
    return `<section class="cf-guide-recommendation" data-document-chapter="recommendations" data-recommendation-state="${escapeHtml(source.status || 'undecided')}" data-verification-state="${source.verified ? 'verified' : 'needs-verification'}">
      <header class="cf-guide-recommendation__header">
        <div><span>Recommendation</span><h3>${escapeHtml(source.statusLabel || 'No recommendation recorded')}</h3></div>
        <strong>${escapeHtml(source.verificationLabel || 'Needs confirmation')}</strong>
      </header>
      <div class="cf-guide-recommendation__explanation">
        <section><span>What this means</span><p>${escapeHtml(source.meaning)}</p></section>
        <section><span>Why it matters</span><p>${escapeHtml(source.importance)}</p></section>
      </div>
      <section class="cf-guide-recommendation__reason"><span>${escapeHtml(source.reasonLabel || 'Before a recommendation')}</span><p>${escapeHtml(source.reason)}</p></section>
      <p class="cf-guide-recommendation__guardrail">${escapeHtml(source.guardrail)}</p>
    </section>`;
  }

  function renderTopic(topic) {
    return `<article class="cf-guide-topic" data-topic-id="${escapeHtml(topic.id)}" data-priority-order="${escapeHtml(topic.order)}" data-evidence-quality="${escapeHtml(topic.evidenceQuality || 'confirmed')}" data-document-chapters="priority-findings recommendations">
      <header class="cf-guide-topic__header" data-document-chapter="priority-findings">
        <span class="cf-guide-topic__number">${String(topic.order).padStart(2, '0')}</span>
        <div>
          <p><strong class="cf-guide-topic__sequence">${escapeHtml(topic.sequenceLabel)}</strong> · ${escapeHtml(topic.priority)}${topic.category ? ` · ${escapeHtml(topic.category)}` : ''}<em class="cf-guide-topic__evidence">${escapeHtml(workingEvidenceLabel(topic))}</em></p>
          <h2>${escapeHtml(topic.title)}</h2>
        </div>
      </header>

      <div class="cf-guide-topic__body">
        <section class="cf-guide-topic__known" data-document-chapter="priority-findings">
          <span>What the assessment found</span>
          <p>${escapeHtml(topic.discovered)}</p>
        </section>

        <section class="cf-guide-topic__priority" data-document-chapter="priority-findings">
          <div><span>Why this comes first</span><p>${escapeHtml(topic.priorityReason)}</p></div>
          <div class="cf-guide-topic__evidence-action"><strong>${escapeHtml(topic.actionLabel)}</strong><p>${escapeHtml(topic.evidenceInstruction)}</p></div>
        </section>

        ${renderRecommendationExplanation(topic.recommendation)}

        <section class="cf-guide-topic__guidance" data-document-chapter="recommendations">
          <span>Questions to discuss</span>
          <p>Use these questions to understand the homeowner’s priorities and confirm what the current policy says.</p>
        </section>

        <section class="cf-guide-topic__ask" data-document-chapter="recommendations">
          <span>A question to discuss</span>
          <p class="cf-guide-question">“${escapeHtml(topic.question)}”</p>
        </section>

        <div class="cf-guide-topic__supporting" data-document-chapter="recommendations">
          <section>
            <span>Why we are asking</span>
            <p>${escapeHtml(topic.direction)}</p>
          </section>
          <section>
            <span>What to confirm</span>
            ${renderConfirm(topic.confirm)}
          </section>
        </div>

        <section class="cf-guide-topic__notes" data-document-chapter="recommendations">
          <span>Notes</span>
          ${renderWritingLines(3, `Notes for ${topic.title}`)}
        </section>
      </div>
    </article>`;
  }

  function renderDecisions(items) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    return `${values.length ? `<ul class="cf-guide-decision-list">${values.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}${renderWritingLines(values.length ? 2 : 4, 'Space for decisions and next steps')}`;
  }

  function renderMissing(items) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    return `${values.length ? `<ul class="cf-guide-check-list">${values.map(item => `<li><span class="cf-guide-check-box" aria-hidden="true"></span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>` : '<p class="cf-guide-empty-note">No outstanding information was identified in the saved review.</p>'}${renderWritingLines(2, 'Space for additional information still needed')}`;
  }

  function renderFindingDecisions(items) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return '<p class="cf-guide-empty-note">No topic decisions were saved.</p>';
    return `<ul class="cf-guide-close__finding-list">${values.map(item => `<li data-decision-state="${escapeHtml(item.state || 'undecided')}">
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.label)}</span></div>
      <em data-verification-state="${item.verified ? 'verified' : 'needs-verification'}">${escapeHtml(item.verificationLabel)}</em>
    </li>`).join('')}</ul>`;
  }

  function renderFollowUp(followUp) {
    const source = followUp || {};
    if (source.state === 'scheduled') return `<strong>Follow-up scheduled${source.dueDate ? ` for ${formatDate(source.dueDate)}` : ''}</strong>${source.note ? `<span>${escapeHtml(source.note)}</span>` : ''}`;
    if (source.state === 'completed') return `<strong>Follow-up completed</strong>${source.note ? `<span>${escapeHtml(source.note)}</span>` : ''}`;
    return '<strong>No separate follow-up is scheduled</strong><span>The agreed next step remains the current plan.</span>';
  }

  function renderCompletionClose(completion) {
    const source = completion || {};
    const complete = source.state === 'complete';
    const recorded = source.recordedAt ? ` · Updated ${formatDate(source.recordedAt)}` : '';
    const working = !complete && (source.workingDecisions?.length || source.workingMissingInformation?.length)
      ? `<div class="cf-guide-close__working">
          <section><h3>Earlier notes</h3>${renderDecisions(source.workingDecisions)}</section>
          <section><h3>Details currently identified</h3>${renderMissing(source.workingMissingInformation)}</section>
        </div>` : '';
    return `<div class="cf-guide-close__status" data-closeout-state="${complete ? 'complete' : 'draft'}">
      <div><span>Consultation status</span><strong>${escapeHtml(source.statusLabel || 'Consultation summary not yet saved')}</strong></div>
      <small>${complete ? `Saved consultation summary${recorded}` : 'Draft document · decisions and next steps are not final'}</small>
    </div>
    <section class="cf-guide-close__decision" data-closeout-state="${complete ? 'complete' : 'draft'}">
      <span>${complete ? 'What the homeowner decided' : 'Decision summary'}</span>
      <p>${escapeHtml(source.decision?.summary || 'The homeowner’s decisions have not yet been recorded.')}</p>
    </section>
    <div class="cf-guide-close__grid">
      <section class="cf-guide-close__card" data-unresolved-state="${escapeHtml(source.unresolved?.state || 'draft')}">
        <span>Open items</span><h3>${escapeHtml(source.unresolved?.label || 'Not yet recorded')}</h3><p>${escapeHtml(source.unresolved?.summary)}</p>
      </section>
      <section class="cf-guide-close__card" data-quote-state="${escapeHtml(source.quote?.state || 'draft')}">
        <span>Formal insurance quote</span><h3>${escapeHtml(source.quote?.label || 'Not yet recorded')}</h3><p>${escapeHtml(source.quote?.summary)}</p>
      </section>
      <section class="cf-guide-close__findings">
        <div class="cf-guide-close__subheading"><span>Topic decisions</span><strong>${Number(source.recommendationDecisions?.length || 0)} recorded</strong></div>
        ${renderFindingDecisions(source.recommendationDecisions)}
      </section>
      <section class="cf-guide-next-action" data-next-action-state="${source.nextAction?.available ? 'agreed' : 'working'}">
        <span>${escapeHtml(source.nextAction?.label || 'Next action')}</span>
        <p class="cf-guide-next-action__suggestion">${escapeHtml(source.nextAction?.summary || 'Record the agreed next step, who will handle it, and when.')}</p>
        <div class="cf-guide-close__follow-up">${renderFollowUp(source.followUp)}</div>
      </section>
    </div>
    ${working}
    <p class="cf-guide-close__guardrail">${escapeHtml(source.guardrail)}</p>`;
  }

  const section = Object.freeze({
    id: 'consultation-guide',
    name: 'Consultation Record',
    version: '1.7.0',
    order: architecture?.getPage?.('consultation-record')?.order || 30,
    requiredPaths: Object.freeze(['consultationContext', 'recommendations']),
    createModel(model) { return guideModel.create(model); },
    shouldRender(model) { return guideModel.hasContent(this.createModel(model)); },
    emptyState: Object.freeze({ message: 'No consultation guide is available.' }),
    render(model) {
      const m = this.createModel(model);
      const contact = [m.customer.phone, m.customer.email].filter(Boolean).join(' · ') || 'Contact not provided';
      const topics = m.topics.map(renderTopic).join('');
      const page = architecture?.getPage?.('consultation-record') || { title: 'Consultation Record' };
      const documentMap = architecture?.renderDocumentMap?.('consultation-record') || '';
      const followUp = m.followUp.state === 'scheduled'
        ? `${formatDate(m.followUp.dueDate)}${m.followUp.note ? ` · ${escapeHtml(m.followUp.note)}` : ''}`
        : 'Not yet scheduled';

      const html = `<section class="cf-print-section cf-consultation-guide" aria-labelledby="cf-guide-title" data-consistency-source="${escapeHtml(m.story?.source || 'legacy-print-model')}" data-document-page="consultation-record">
        <header class="cf-guide-header">
          <div>
            <p class="cf-guide-eyebrow">Home Protection Consultation · Part 3</p>
            <h1 id="cf-guide-title">${escapeHtml(page.title)}</h1>
            <p>${escapeHtml(m.customer.name)} · ${escapeHtml(m.propertyAddress || 'Property address not provided')}</p>
          </div>
          <div class="cf-guide-brand">CoverageFit<span>®</span><small>Consultation Document</small></div>
        </header>

        ${documentMap}

        <section class="cf-guide-context" aria-label="Review details">
          <div><span>Reason</span><strong>${escapeHtml(m.reviewReason)}</strong></div>
          <div><span>Contact</span><strong>${escapeHtml(contact)}</strong></div>
          <div><span>Stage</span><strong>${escapeHtml(m.stage)}</strong></div>
          <div><span>Follow-up</span><strong>${followUp}</strong></div>
        </section>

        ${m.story?.narrative ? `<section class="cf-guide-shared-story" data-story-kind="${escapeHtml(m.story.kind)}"><span>How this review began</span><p>${escapeHtml(m.story.narrative)}</p></section>` : ''}

        ${renderEvidenceHandoff(m.evidenceHandoff)}

        <section class="cf-guide-discussion" aria-labelledby="cf-guide-discussion-title" data-document-chapters="priority-findings recommendations">
          <div class="cf-guide-section-heading">
            <span>During the conversation</span>
            <h2 id="cf-guide-discussion-title">Priority findings</h2>
            <p>The most important assessment topics are listed in conversation order. Confirm the homeowner’s answers and what the current policy says before making a recommendation.</p>
          </div>
          <div class="cf-guide-topics">${topics || '<p class="cf-guide-empty">No discussion topics were captured. Use the decision fields below to document the consultation.</p>'}</div>
        </section>

        <section class="cf-guide-close" aria-labelledby="cf-guide-close-title" data-document-chapter="decisions-next-steps">
          <div class="cf-guide-close__heading">
            <span>After the conversation</span>
            <h2 id="cf-guide-close-title">Decisions and next steps</h2>
          </div>

          ${renderCompletionClose(m.completion)}
        </section>

        <footer class="cf-guide-footer">
          <p><strong>About this document:</strong> It summarizes the review and recorded decisions. The insurance company decides which options are available, what they cost, and the final policy terms. The formal quote and issued policy are the official sources.</p>
          <p>CoverageFit · Virginia Tam Insurance Agency · Private consultation document</p>
          <strong class="cf-document-section">${escapeHtml(page.title)}</strong>
        </footer>
      </section>`;

      return Object.freeze({ id: this.id, html, model: m, diagnostics: guideModel.getDiagnostics(m) });
    }
  });

  if (registry && typeof registry.registerSection === 'function') registry.registerSection(section.id, section, { replace: true });
  return section;
});
