(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../print-sections.js'),
      require('../models/checklist-model.js')
    );
  } else {
    root.CoverageFitPrintSections = root.CoverageFitPrintSections || {};
    root.CoverageFitPrintSections['checklist'] = factory(
      root.CoverageFitPrintSectionRegistry,
      root.CoverageFitChecklistModel
    );
  }
})(typeof window !== 'undefined' ? window : globalThis, function (registry, checklistModelFactory) {
  'use strict';

  if (!checklistModelFactory || typeof checklistModelFactory.create !== 'function') {
    throw new Error('CoverageFit Checklist Model is required.');
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
    return ({ complete: 'Complete', active: 'In progress', pending: 'Pending', skipped: 'Skipped' })[status] || 'Pending';
  }

  function renderSummary(summary) {
    const stats = [
      ['Total', summary.total],
      ['Complete', summary.completed],
      ['In progress', summary.active],
      ['Pending', summary.pending]
    ];
    return `<section class="cf-check-summary" aria-label="Checklist progress">
  <div class="cf-check-progress"><strong>${summary.completionPercent}%</strong><span>complete</span><div class="cf-check-progress-track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, summary.completionPercent))}%"></i></div></div>
  <div class="cf-check-stats">${stats.map(([label,value]) => `<div><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>
  <div class="cf-check-time"><strong>${summary.remainingMinutes}</strong><span>estimated minutes remaining</span></div>
</section>`;
  }

  function renderItem(item) {
    const description = item.description ? `<p class="cf-check-description">${escapeHtml(item.description)}</p>` : '';
    const prompt = item.prompt ? `<div class="cf-check-prompt"><span>Consultation prompt</span><p>${escapeHtml(item.prompt)}</p></div>` : '';
    const note = item.coachingNote ? `<div class="cf-check-note"><span>Producer note</span><p>${escapeHtml(item.coachingNote)}</p></div>` : '';
    const priority = item.priority ? `<span class="cf-check-priority">${escapeHtml(item.priority)} priority</span>` : '';
    const required = item.required ? '<span class="cf-check-required">Required</span>' : '<span class="cf-check-optional">Optional</span>';
    const minutes = item.estimatedMinutes ? `<span class="cf-check-minutes">${item.estimatedMinutes} min</span>` : '';
    return `<li class="cf-check-item cf-check-status-${escapeHtml(item.status)}" data-checklist-item-id="${escapeHtml(item.id)}">
  <div class="cf-check-marker" aria-hidden="true"><span></span></div>
  <div class="cf-check-item-content">
    <header class="cf-check-item-header">
      <div><div class="cf-check-labels"><span class="cf-check-status">${escapeHtml(statusLabel(item.status))}</span>${priority}${required}${minutes}</div><h3>${escapeHtml(item.title)}</h3>${description}</div>
    </header>
    ${prompt}${note}
  </div>
</li>`;
  }

  function renderPhase(phase, items, currentPhaseId) {
    const phaseItems = items.filter(item => item.phaseId === phase.id);
    if (!phaseItems.length) return '';
    const isCurrent = phase.id === currentPhaseId;
    const current = isCurrent ? '<span class="cf-check-current">Current phase</span>' : '';
    const phasePercent = Math.max(0, Math.min(100, Number(phase.completionPercent) || 0));
    return `<section class="cf-check-phase${isCurrent ? ' cf-check-phase-current' : ''}" data-phase-id="${escapeHtml(phase.id)}" aria-labelledby="cf-check-${escapeHtml(phase.id)}-title">
  <header class="cf-check-phase-header">
    <div><p>Consultation phase</p><h2 id="cf-check-${escapeHtml(phase.id)}-title">${escapeHtml(phase.title)}</h2></div>
    <div class="cf-check-phase-progress">${current}<strong>${phase.completedCount}/${phase.itemCount}</strong><span>complete</span></div>
  </header>
  <div class="cf-check-phase-meter" aria-hidden="true"><span style="width:${phasePercent}%"></span></div>
  <ol class="cf-check-list">${phaseItems.map(renderItem).join('')}</ol>
</section>`;
  }

  const section = Object.freeze({
    id: 'checklist',
    name: 'Checklist',
    version: '1.3.0',
    order: 40,
    requiredPaths: Object.freeze(['consultationChecklist']),
    createModel(printModel) {
      return checklistModelFactory.create(printModel);
    },
    shouldRender(printModel) {
      return checklistModelFactory.hasContent(this.createModel(printModel));
    },
    emptyState: Object.freeze({ message: 'No consultation checklist is available.' }),
    render(printModel) {
      const model = this.createModel(printModel);
      const phases = model.phases.map(phase => renderPhase(phase, model.items, model.currentPhaseId)).join('');
      const html = `<section class="cf-print-section cf-checklist" aria-labelledby="cf-check-title">
  <header class="cf-check-header">
    <div class="cf-check-heading-copy"><p class="cf-check-eyebrow">CoverageFit Consultation</p><h1 id="cf-check-title">Consultation Checklist</h1><p>Use this structured agenda to confirm the important facts, discuss coverage priorities, and document the remaining consultation steps.</p></div>
    <div class="cf-check-brand">CoverageFit<span>®</span><small>Consultation workflow</small></div>
  </header>
  ${renderSummary(model.summary)}
  <div class="cf-check-phases">${phases}</div>
  <footer class="cf-check-footer"><p><strong>Checklist purpose:</strong> Support a complete, consistent consultation. Completion status is a workflow record, not a coverage determination.</p><p>CoverageFit · Virginia Tam Insurance Agency · Confidential</p></footer>
</section>`;
      return Object.freeze({
        id: this.id,
        html,
        model,
        diagnostics: checklistModelFactory.getDiagnostics(model)
      });
    }
  });

  if (registry && typeof registry.registerSection === 'function') {
    registry.registerSection(section.id, section, { replace: true });
  }

  return section;
});
