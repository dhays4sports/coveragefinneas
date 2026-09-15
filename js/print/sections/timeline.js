(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../print-sections.js'),
      require('../models/timeline-model.js')
    );
  } else {
    root.CoverageFitPrintSections = root.CoverageFitPrintSections || {};
    root.CoverageFitPrintSections['timeline'] = factory(
      root.CoverageFitPrintSectionRegistry,
      root.CoverageFitTimelineModel
    );
  }
})(typeof window !== 'undefined' ? window : globalThis, function (registry, timelineModelFactory) {
  'use strict';

  if (!timelineModelFactory || typeof timelineModelFactory.create !== 'function') {
    throw new Error('CoverageFit Timeline Model is required.');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function statusLabel(status) {
    return ({ reviewed: 'Reviewed', current: 'Current', upcoming: 'Upcoming' })[status] || 'Upcoming';
  }

  function renderSummary(summary) {
    const stats = [
      ['Topics', summary.total],
      ['Reviewed', summary.reviewed],
      ['Current', summary.current],
      ['Upcoming', summary.upcoming]
    ];
    return `<section class="cf-time-summary" aria-label="Consultation timeline summary">
  <div class="cf-time-stats">${stats.map(([label, value]) => `<div><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>
  <div class="cf-time-duration"><strong>${summary.remainingMinutes}</strong><span>estimated minutes remaining</span></div>
</section>`;
  }

  function renderItem(item, options) {
    const settings = options || {};
    const firstClass = settings.firstInSection ? ' cf-time-item-first' : '';
    const currentLabel = item.status === 'current' ? '<span class="cf-time-now">Discussing now</span>' : '';
    const objective = item.objective ? `<p class="cf-time-objective">${escapeHtml(item.objective)}</p>` : '';
    const prompt = item.prompt ? `<div class="cf-time-prompt"><span>Consultation prompt</span><p>${escapeHtml(item.prompt)}</p></div>` : '';
    const note = item.coachingNote ? `<div class="cf-time-note"><span>Producer note</span><p>${escapeHtml(item.coachingNote)}</p></div>` : '';
    const minutes = item.estimatedMinutes ? `<span class="cf-time-minutes">${item.estimatedMinutes} min</span>` : '';
    const type = item.type ? `<span class="cf-time-type">${escapeHtml(item.type)}</span>` : '';
    return `<li class="cf-time-item cf-time-status-${escapeHtml(item.status)}${firstClass}" data-timeline-item-id="${escapeHtml(item.id)}" data-timeline-sequence="${item.sequence}">
  <div class="cf-time-rail" aria-hidden="true"><span>${item.sequence}</span></div>
  <div class="cf-time-item-content">
    <header class="cf-time-item-header">
      <div class="cf-time-labels"><span class="cf-time-status">${escapeHtml(statusLabel(item.status))}</span>${currentLabel}${type}${minutes}</div>
      <h3>${escapeHtml(item.title)}</h3>
      ${objective}
    </header>
    ${prompt}${note}
  </div>
</li>`;
  }

  function renderSection(sectionModel, items) {
    const sectionItems = items.filter(item => item.sectionId === sectionModel.id || (!item.sectionId && item.phaseId === sectionModel.id));
    if (!sectionItems.length) return '';
    const progress = sectionModel.itemCount ? Math.round(((sectionModel.reviewedCount + sectionModel.currentCount * 0.5) / sectionModel.itemCount) * 100) : 0;
    const sectionState = sectionModel.currentCount > 0 ? 'current' : (sectionModel.reviewedCount === sectionModel.itemCount ? 'reviewed' : 'upcoming');
    const sectionStateLabel = sectionState === 'current' ? 'In progress' : (sectionState === 'reviewed' ? 'Reviewed' : 'Upcoming');
    return `<section class="cf-time-group cf-time-group-${sectionState}" data-timeline-section-id="${escapeHtml(sectionModel.id)}" data-section-state="${sectionState}" data-section-count="${sectionModel.itemCount}" aria-labelledby="cf-time-${escapeHtml(sectionModel.id)}-title">
  <header class="cf-time-group-header">
    <div><p>Consultation section</p><h2 id="cf-time-${escapeHtml(sectionModel.id)}-title">${escapeHtml(sectionModel.title)}</h2><span class="cf-time-group-state">${sectionStateLabel}</span></div>
    <div class="cf-time-group-meta"><strong>${sectionModel.reviewedCount}/${sectionModel.itemCount}</strong><span>reviewed</span>${sectionModel.estimatedMinutes ? `<small>${sectionModel.estimatedMinutes} min</small>` : ''}</div>
  </header>
  <div class="cf-time-group-meter" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, progress))}%"></span></div>
  <ol class="cf-time-list">${sectionItems.map((item, index) => renderItem(item, { firstInSection: index === 0 })).join('')}</ol>
</section>`;
  }

  function renderReferenceList(title, items, className) {
    if (!Array.isArray(items) || !items.length) return '';
    return `<section class="${className}"><h2>${escapeHtml(title)}</h2><ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
  }

  const section = Object.freeze({
    id: 'timeline',
    name: 'Timeline',
    version: '1.3.0',
    order: 50,
    requiredPaths: Object.freeze(['timeline']),
    createModel(printModel) {
      return timelineModelFactory.create(printModel);
    },
    shouldRender(printModel) {
      return timelineModelFactory.hasContent(this.createModel(printModel));
    },
    emptyState: Object.freeze({ message: 'No consultation timeline is available.' }),
    render(printModel) {
      const model = this.createModel(printModel);
      const groups = model.sections.map(group => renderSection(group, model.items)).join('');
      const questions = renderReferenceList('Questions to Keep in View', model.questions, 'cf-time-questions');
      const guardrails = renderReferenceList('Consultation Guardrails', model.guardrails, 'cf-time-guardrails');
      const html = `<section class="cf-print-section cf-timeline" aria-labelledby="cf-time-title">
  <header class="cf-time-header">
    <div class="cf-time-heading-copy"><p class="cf-time-eyebrow">CoverageFit Consultation</p><h1 id="cf-time-title">Consultation Timeline</h1><p>A clear conversation roadmap showing what has been reviewed, the topic currently in focus, and what remains before the consultation is complete.</p><div class="cf-time-legend" aria-label="Timeline status legend"><span class="cf-time-legend-reviewed">Reviewed</span><span class="cf-time-legend-current">Current</span><span class="cf-time-legend-upcoming">Upcoming</span></div></div>
    <div class="cf-time-brand">CoverageFit<span>®</span><small>Conversation roadmap</small></div>
  </header>
  ${renderSummary(model.summary)}
  <div class="cf-time-groups">${groups}</div>
  <div class="cf-time-reference-grid">${questions}${guardrails}</div>
  <footer class="cf-time-footer"><p><strong>Timeline purpose:</strong> Support a clear, consistent consultation sequence. Topic status is a workflow indicator, not a coverage determination.</p><p>CoverageFit · Virginia Tam Insurance Agency · Confidential</p></footer>
</section>`;
      return Object.freeze({
        id: this.id,
        html,
        model,
        diagnostics: timelineModelFactory.getDiagnostics(model)
      });
    }
  });

  if (registry && typeof registry.registerSection === 'function') registry.registerSection(section.id, section, { replace: true });
  return section;
});
