(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../print-sections.js'),
      require('../models/recommendation-model.js')
    );
  } else {
    root.CoverageFitPrintSections = root.CoverageFitPrintSections || {};
    root.CoverageFitPrintSections['recommendations'] = factory(
      root.CoverageFitPrintSectionRegistry,
      root.CoverageFitRecommendationModel
    );
  }
})(typeof window !== 'undefined' ? window : globalThis, function (registry, recommendationModel) {
  'use strict';

  if (!recommendationModel || typeof recommendationModel.create !== 'function') {
    throw new Error('CoverageFit Recommendation Model is required.');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slug(value) {
    return String(value || 'review').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'review';
  }

  function renderDetail(label, value, className) {
    if (!value) return '';
    return `<div class="cf-rec-detail ${className || ''}"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(value)}</p></div>`;
  }

  function renderRecommendation(item, index, options) {
    const settings = options || {};
    const firstClass = settings.firstInGroup ? ' cf-rec-card-first' : '';
    const priorityClass = slug(item.priority);
    const category = item.category ? `<span class="cf-rec-category">${escapeHtml(item.category)}</span>` : '';
    const topic = item.discussionTopic || item.title;
    const question = item.question ? `<div class="cf-rec-question"><span>Conversation prompt</span><p>${escapeHtml(item.question)}</p></div>` : '';
    return `<article class="cf-rec-card cf-rec-priority-${priorityClass}${firstClass}" data-recommendation-id="${escapeHtml(item.id)}">
  <div class="cf-rec-card-rail" aria-hidden="true"><span>${String(index + 1).padStart(2, '0')}</span></div>
  <div class="cf-rec-card-content">
    <header class="cf-rec-card-header">
      <div class="cf-rec-title-block">
        <div class="cf-rec-labels"><span class="cf-rec-priority">${escapeHtml(item.priority)} priority</span>${category}</div>
        <h2>${escapeHtml(item.title)}</h2>
        ${topic && topic !== item.title ? `<p class="cf-rec-topic">${escapeHtml(topic)}</p>` : ''}
      </div>
    </header>
    <div class="cf-rec-card-body">
      ${renderDetail('Why this matters', item.whyItMatters, 'cf-rec-why')}
      ${renderDetail('Suggested review', item.suggestedReview, 'cf-rec-review')}
      ${question}
    </div>
  </div>
</article>`;
  }


  function renderGroup(group, startIndex) {
    const cards = group.recommendations.map((item, index) => renderRecommendation(item, startIndex + index, { firstInGroup: index === 0 })).join('');
    return `<section class="cf-rec-group cf-rec-group-${escapeHtml(group.key)}" data-group-count="${group.count}" aria-labelledby="${escapeHtml(group.id)}-title">
  <header class="cf-rec-group-header">
    <div><p>Coverage category</p><h2 id="${escapeHtml(group.id)}-title">${escapeHtml(group.title)}</h2></div>
    <span>${group.count} ${group.count === 1 ? 'topic' : 'topics'}</span>
  </header>
  <div class="cf-rec-group-list">${cards}</div>
</section>`;
  }

  function renderGroups(groups) {
    let offset = 0;
    return groups.map(group => {
      const html = renderGroup(group, offset);
      offset += group.count;
      return html;
    }).join('');
  }

  function countPriorities(items) {
    return items.reduce((counts, item) => {
      const key = slug(item.priority);
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function renderPriorityOverview(items) {
    const counts = countPriorities(items);
    const order = ['critical', 'high', 'medium', 'review', 'low'];
    const labels = { critical: 'Critical', high: 'High', medium: 'Medium', review: 'Review', low: 'Low' };
    const entries = order.filter(key => counts[key]).map(key => `<div class="cf-rec-overview-item cf-rec-overview-${key}"><strong>${counts[key]}</strong><span>${labels[key]}</span></div>`).join('');
    return entries ? `<div class="cf-rec-overview" aria-label="Recommendation priority overview">${entries}</div>` : '';
  }

  const section = Object.freeze({
    id: 'recommendations',
    name: 'Recommendations',
    version: '1.5.0',
    order: 30,
    requiredPaths: Object.freeze(['recommendations']),
    createModel(model) {
      return recommendationModel.create(model);
    },
    shouldRender(printModel) {
      return recommendationModel.hasContent(this.createModel(printModel));
    },
    emptyState: Object.freeze({ message: 'No recommendations are available for this consultation.' }),
    render(printModel) {
      const model = this.createModel(printModel);
      const groups = renderGroups(model.groups);
      const overview = renderPriorityOverview(model.recommendations);
      const html = `<section class="cf-print-section cf-recommendations" aria-labelledby="cf-rec-title">
  <header class="cf-rec-header">
    <div class="cf-rec-heading-copy">
      <p class="cf-rec-eyebrow">CoverageFit Consultation</p>
      <h1 id="cf-rec-title">What We Recommend Reviewing</h1>
      <p class="cf-rec-intro">A prioritized agenda for the coverage conversation. Each topic connects the consultation findings to a specific area worth reviewing together.</p>
    </div>
    <div class="cf-rec-brand">CoverageFit<span>®</span><small>Protection Review</small></div>
  </header>
  <div class="cf-rec-summary-strip">
    <div class="cf-rec-count" aria-label="Recommendation count"><strong>${model.count}</strong><span>${model.count === 1 ? 'discussion topic' : 'discussion topics'}</span></div>
    ${overview}
    <p>Priorities indicate the recommended conversation order. They are not underwriting decisions, coverage determinations, or instructions to purchase a particular product.</p>
  </div>
  <div class="cf-rec-groups">${groups}</div>
  <footer class="cf-rec-footer"><p><strong>Consultation next step:</strong> Confirm which topics matter most, compare the available coverage approaches, and document any agreed follow-up.</p><p>CoverageFit · Virginia Tam Insurance Agency · Confidential</p></footer>
</section>`;
      return Object.freeze({
        id: this.id,
        html,
        model,
        diagnostics: recommendationModel.getDiagnostics(model)
      });
    }
  });

  if (registry && typeof registry.registerSection === 'function') {
    registry.registerSection(section.id, section, { replace: true });
  }

  return section;
});
