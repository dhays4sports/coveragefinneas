(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../print-sections.js'),
      require('../models/executive-summary-model.js'),
      require('../models/protection-snapshot-model.js'),
      require('../consultation-document-architecture.js')
    );
  } else {
    root.CoverageFitPrintSections = root.CoverageFitPrintSections || {};
    root.CoverageFitPrintSections['executive-summary'] = factory(
      root.CoverageFitPrintSectionRegistry,
      root.CoverageFitExecutiveSummaryModel,
      root.CoverageFitProtectionSnapshotModel,
      root.CoverageFitConsultationDocumentArchitecture
    );
  }
})(typeof window !== 'undefined' ? window : globalThis, function (registry, executiveSummaryModel, protectionSnapshotModel, architecture) {
  'use strict';

  if (!executiveSummaryModel || typeof executiveSummaryModel.create !== 'function') {
    throw new Error('CoverageFit Executive Summary Model is required.');
  }
  if (!protectionSnapshotModel || typeof protectionSnapshotModel.create !== 'function') {
    throw new Error('CoverageFit Protection Snapshot Model is required.');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderScoreScale(snapshot) {
    const bands = Array.isArray(snapshot?.scale) ? snapshot.scale : [];
    if (!bands.length) return '';
    const marker = snapshot.available
      ? `<i class="cf-score-marker" style="left:${escapeHtml(snapshot.position)}%" aria-hidden="true"></i>`
      : '';
    return `<div class="cf-score-scale" role="img" aria-label="Protection Score scale from 0 to 100${snapshot.available ? `; current score ${snapshot.value}` : ''}">
      <div class="cf-score-track">${bands.map(band => `<span class="cf-score-segment cf-score-segment-${escapeHtml(band.className)}${band.active ? ' is-active' : ''}" title="${escapeHtml(`${band.label}: ${band.min}–${band.max}`)}"></span>`).join('')}${marker}</div>
      <div class="cf-score-scale-labels"><span>0</span><span>100</span></div>
    </div>`;
  }

  function renderList(items, emptyMessage, className) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return `<p class="cf-exec-empty">${escapeHtml(emptyMessage)}</p>`;
    return `<ol class="${className}">${values.map((item, index) => (
      `<li><span class="cf-exec-list-number">${index + 1}</span><span>${escapeHtml(item)}</span></li>`
    )).join('')}</ol>`;
  }

  function contactLine(model) {
    return [model?.contact?.phone, model?.contact?.email].filter(Boolean).map(escapeHtml).join(' · ');
  }

  function renderOverviewHighlights(overview) {
    const values = [
      { label: 'What looks strongest', value: overview?.strongestArea || 'The submitted answers did not identify one clear strength.' },
      { label: 'What to discuss first', value: overview?.firstPriority || 'Review what the current policy says.' }
    ];
    return `<div class="cf-exec-overview-highlights" aria-label="Executive summary highlights">${values.map(item => (
      `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`
    )).join('')}</div>`;
  }

  const section = Object.freeze({
    id: 'executive-summary',
    name: 'Review Overview',
    version: '1.9.0',
    order: architecture?.getPage?.('review-overview')?.order || 10,
    requiredPaths: Object.freeze([]),
    createModel(model) {
      return executiveSummaryModel.create(model);
    },
    shouldRender(model) {
      return executiveSummaryModel.hasContent(this.createModel(model));
    },
    emptyState: Object.freeze({ message: 'No consultation overview is available for this record.' }),
    render(model) {
      const sectionModel = this.createModel(model);
      const scoreSnapshot = protectionSnapshotModel.create(sectionModel);
      const score = scoreSnapshot.value;
      const band = scoreSnapshot.band || { label: 'Not scored', className: 'unscored', min: null, max: null };
      const clientName = sectionModel.client.name || 'Homeowner';
      const preparedBy = sectionModel.consultation.preparedBy || 'Dylan Haysbert';
      const agency = sectionModel.consultation.agency || 'Virginia Tam Insurance Agency';
      const overview = sectionModel.overview || {};
      const summary = overview.summary || sectionModel.summary;
      const page = architecture?.getPage?.('review-overview') || { title: 'Review Overview' };
      const documentMap = architecture?.renderDocumentMap?.('review-overview') || '';

      const html = `<section class="cf-print-section cf-executive-summary" aria-labelledby="cf-exec-title" data-consistency-source="${escapeHtml(sectionModel.producerConsumerStory?.consistency?.source || 'legacy-print-model')}" data-document-page="review-overview">
  <header class="cf-exec-masthead">
    <div>
      <p class="cf-exec-eyebrow">Home Protection Consultation · Part 1</p>
      <h1 id="cf-exec-title">${escapeHtml(page.title)}</h1>
      <p class="cf-exec-client">Prepared for <strong>${escapeHtml(clientName)}</strong></p>
    </div>
    <div class="cf-exec-brand" aria-label="CoverageFit">CoverageFit<span>®</span></div>
  </header>

  ${documentMap}

  <div class="cf-exec-context" data-document-chapter="executive-summary">
    <div><span>Homeowner</span><strong>${escapeHtml(clientName)}</strong></div>
    <div><span>Home</span><strong>${escapeHtml(sectionModel.property.address || 'Address not provided')}</strong></div>
    <div><span>Contact</span><strong>${contactLine(sectionModel) || 'Not provided'}</strong></div>
    <div><span>Prepared by</span><strong>${escapeHtml(preparedBy)}</strong><small>${escapeHtml(agency)}</small></div>
  </div>

  <div class="cf-exec-hero-grid">
    <article class="cf-exec-score-card cf-exec-score-${escapeHtml(band.className)}" aria-labelledby="cf-score-title" data-document-chapter="protection-snapshot">
      <p class="cf-exec-card-label">Protection Snapshot</p>
      <div class="cf-exec-score-heading">
        <div class="cf-exec-score-value"><strong>${scoreSnapshot.available ? escapeHtml(score) : '—'}</strong><span>${scoreSnapshot.available ? '/ 100' : ''}</span></div>
        <div class="cf-exec-score-category">
          <span>What this score means</span>
          <strong id="cf-score-title">${escapeHtml(band.label)}</strong>
          <small>${scoreSnapshot.available ? escapeHtml(`${band.min}–${band.max}`) : 'Score unavailable'}</small>
        </div>
      </div>
      ${renderScoreScale(scoreSnapshot)}
      <p class="cf-exec-score-interpretation">${escapeHtml(scoreSnapshot.interpretation)}</p>
      <div class="cf-exec-score-use"><span>How this helps</span><p>${escapeHtml(scoreSnapshot.useGuidance)}</p></div>
      <p class="cf-exec-score-note">${escapeHtml(scoreSnapshot.purpose)} ${escapeHtml(scoreSnapshot.guardrail)}</p>
    </article>

    <article class="cf-exec-summary-card" data-document-chapter="executive-summary">
      <p class="cf-exec-card-label">Executive Summary</p>
      <div class="cf-exec-review-purpose">
        <span>Why this review started</span>
        <strong>${escapeHtml(overview.reviewPurpose || sectionModel.reviewReason || 'General coverage review')}</strong>
      </div>
      ${overview.storyNarrative ? `<div class="cf-exec-shared-story" data-story-kind="${escapeHtml(overview.storyKind)}"><span>How this review began</span><p>${escapeHtml(overview.storyNarrative)}</p></div>` : ''}
      <h2>What the answers show</h2>
      <p class="cf-exec-summary-copy">${escapeHtml(summary)}</p>
      ${renderOverviewHighlights(overview)}
    </article>
  </div>

  <div class="cf-exec-action-grid">
    <article class="cf-exec-panel cf-exec-priorities">
      <div class="cf-exec-panel-heading">
        <span>01</span><div><p>Discuss first</p><h2>Most important topics</h2></div>
      </div>
      ${renderList(sectionModel.priorities, 'No priority topics were identified.', 'cf-exec-priority-list')}
    </article>

    <article class="cf-exec-panel cf-exec-next-steps">
      <div class="cf-exec-panel-heading">
        <span>02</span><div><p>Still needed</p><h2>Details to confirm</h2></div>
      </div>
      ${renderList(sectionModel.missingInformation, 'The submitted review did not identify any major missing details.', 'cf-exec-next-list')}
    </article>
  </div>

  <section class="cf-exec-next-action" aria-label="Recommended starting point">
    <span>Recommended next step</span>
    <strong>${escapeHtml(overview.nextAction || sectionModel.nextSteps[0] || 'Review the priority topics, confirm what the current policy says, and record the agreed next step.')}</strong>
  </section>

  <footer class="cf-exec-footer-note">
    <span><strong>CoverageFit</strong> organizes the home protection conversation. The insurance company decides which options are available, what they cost, and the final policy terms. The formal quote and issued policy are the official sources.</span>
    <strong class="cf-document-section">${escapeHtml(page.title)}</strong>
  </footer>
</section>`;

      return Object.freeze({
        id: this.id,
        html,
        model: sectionModel,
        protectionSnapshot: scoreSnapshot,
        diagnostics: executiveSummaryModel.getDiagnostics(sectionModel)
      });
    }
  });

  if (registry && typeof registry.registerSection === 'function') {
    registry.registerSection(section.id, section, { replace: true });
  }

  return section;
});
