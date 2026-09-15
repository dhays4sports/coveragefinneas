(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../print-sections.js'), require('../models/property-summary-model.js'), require('../consultation-document-architecture.js'));
  } else {
    root.CoverageFitPrintSections = root.CoverageFitPrintSections || {};
    root.CoverageFitPrintSections['property-summary'] = factory(root.CoverageFitPrintSectionRegistry, root.CoverageFitPropertySummaryModel, root.CoverageFitConsultationDocumentArchitecture);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (registry, propertySummaryModel, architecture) {
  'use strict';
  if (!propertySummaryModel || typeof propertySummaryModel.create !== 'function') throw new Error('CoverageFit Property Summary Model is required.');

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function present(value) { return value != null && value !== ''; }
  function display(value) { return escapeHtml(value); }
  function number(value) { return Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : ''; }
  function year(value) { return Number.isFinite(value) ? String(Math.trunc(value)) : ''; }
  function date(value) {
    if (!value) return '';
    const raw = String(value).trim();
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
    return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(parsed);
  }
  function currency(value) {
    return Number.isFinite(value) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value) : '';
  }
  function fact(label, value) {
    return `<div class="cf-property-fact"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
  }
  function overview(label, value) {
    return `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
  }
  function panelHeading(numberValue, eyebrow, title, id) {
    return `<div class="cf-property-section-heading"><p>${String(numberValue).padStart(2,'0')}</p><div><span>${escapeHtml(eyebrow)}</span><h2 id="${escapeHtml(id)}">${escapeHtml(title)}</h2></div></div>`;
  }

  const section = Object.freeze({
    id: 'property-summary',
    name: 'Property & Verification',
    version: '1.6.0',
    order: architecture?.getPage?.('property-verification')?.order || 20,
    requiredPaths: Object.freeze([]),
    createModel(model) { return propertySummaryModel.create(model); },
    shouldRender(model) { return propertySummaryModel.hasContent(this.createModel(model)); },
    emptyState: Object.freeze({ message: 'No property information is available for this consultation.' }),
    render(model) {
      const m = this.createModel(model);
      const address = m.property.address || [m.property.street,m.property.city,m.property.state,m.property.zip].filter(Boolean).join(', ');
      const risks = Array.isArray(m.riskHighlights) ? m.riskHighlights.filter(Boolean) : [];
      const page = architecture?.getPage?.('property-verification') || { title: 'Property & Verification' };
      const documentMap = architecture?.renderDocumentMap?.('property-verification') || '';

      const constructionFacts = [
        ['Year built', year(m.construction.yearBuilt)],
        ['Living area', Number.isFinite(m.construction.squareFeet) ? `${number(m.construction.squareFeet)} sq. ft.` : ''],
        ['Stories', number(m.construction.stories)],
        ['Construction', present(m.construction.constructionType) ? display(m.construction.constructionType) : ''],
        ['Foundation', present(m.construction.foundationType) ? display(m.construction.foundationType) : ''],
        ['Roof', present(m.construction.roof) ? display(m.construction.roof) : '']
      ].filter(([,value]) => present(value));

      const coverageFacts = [
        ['Estimated rebuilding amount', currency(m.coverage.replacementCost), 'The rebuilding or dwelling amount reported during the review'],
        ['Home deductible', currency(m.coverage.deductible), 'The amount reported for the homeowner’s share of a covered home claim'],
        ['Current insurance company', present(m.coverage.currentCarrier) ? display(m.coverage.currentCarrier) : '', 'The insurance company reported during the review'],
        ['Current annual policy cost', currency(m.coverage.currentPremium), 'The yearly amount reported during the review'],
        ['Next policy date', date(m.coverage.renewalDate), 'The renewal, expiration, or cancellation date reported during the review']
      ].filter(([,value]) => present(value));

      const overviewFacts = [
        ['Residence', present(m.construction.constructionType) ? display(m.construction.constructionType) : ''],
        ['Built', year(m.construction.yearBuilt)],
        ['Size', Number.isFinite(m.construction.squareFeet) ? `${number(m.construction.squareFeet)} sq. ft.` : ''],
        ['Insurance company', present(m.coverage.currentCarrier) ? display(m.coverage.currentCarrier) : '']
      ].filter(([,value]) => present(value));

      let sectionNumber = 0;
      const panels = [];

      if (constructionFacts.length) {
        sectionNumber += 1;
        panels.push(`<section class="cf-property-panel" aria-labelledby="cf-property-details-heading" data-document-chapter="property-snapshot">
          ${panelHeading(sectionNumber, 'Property Snapshot', 'Home details provided', 'cf-property-details-heading')}
          <dl class="cf-property-grid">${constructionFacts.map(([label,value]) => fact(label,value)).join('')}</dl>
        </section>`);
      }

      if (coverageFacts.length) {
        sectionNumber += 1;
        panels.push(`<section class="cf-property-panel cf-property-coverage-panel" aria-labelledby="cf-property-coverage-heading" data-document-chapter="items-to-verify">
          ${panelHeading(sectionNumber, 'Items to Verify', 'Policy details to confirm', 'cf-property-coverage-heading')}
          <dl class="cf-property-coverage-cards">${coverageFacts.map(([label,value,note]) => `<div class="cf-property-coverage-card"><dt>${escapeHtml(label)}</dt><dd>${value}</dd><small>${escapeHtml(note)}</small></div>`).join('')}</dl>
          <p class="cf-property-coverage-note">Confirm every amount, detail, and date against the current policy summary (declarations page) and issued policy before making a recommendation.</p>
        </section>`);
      }

      if (risks.length) {
        sectionNumber += 1;
        panels.push(`<section class="cf-property-panel cf-property-risks" aria-labelledby="cf-property-risks-heading" data-document-chapter="property-snapshot">
          ${panelHeading(sectionNumber, 'Discuss', 'Home details worth reviewing', 'cf-property-risks-heading')}
          <ol class="cf-property-risk-list">${risks.map((item,index) => `<li><span>${String(index+1).padStart(2,'0')}</span><p>${escapeHtml(item)}</p></li>`).join('')}</ol>
        </section>`);
      }

      const detailsMarkup = panels.length
        ? `<div class="cf-property-sections">${panels.join('')}</div>`
        : `<section class="cf-property-empty-state" aria-label="Property details not provided">
            <strong>Only the property address was provided.</strong>
            <p>Use the conversation to confirm construction details, current policy information, and any home features that may affect the protection review.</p>
          </section>`;

      const html = `<section class="cf-print-section cf-property-summary" aria-labelledby="cf-property-title" data-document-page="property-verification">
  <header class="cf-property-header">
    <div class="cf-property-heading-copy">
      <p class="cf-property-eyebrow">Home Protection Consultation · Part 2</p>
      <h1 id="cf-property-title">${escapeHtml(page.title)}</h1>
      <p class="cf-property-address">${address ? display(address) : 'Property address not provided'}</p>
    </div>
    <div class="cf-property-brand" aria-label="CoverageFit">CoverageFit<span>®</span><small>Consultation Document</small></div>
  </header>

  ${documentMap}

  ${overviewFacts.length ? `<section class="cf-property-overview" aria-label="Property Snapshot" data-document-chapter="property-snapshot">${overviewFacts.map(([label,value]) => overview(label,value)).join('')}</section>` : ''}

  ${detailsMarkup}

  <footer class="cf-property-footer">
    <p><strong>About these details:</strong> This page uses only the information provided. Confirm missing details and what the current policy says before making a recommendation.</p>
    <p>CoverageFit · Virginia Tam Insurance Agency · Private consultation document</p>
    <strong class="cf-document-section">${escapeHtml(page.title)}</strong>
  </footer>
</section>`;

      return Object.freeze({ id:this.id, html, model:m, diagnostics:propertySummaryModel.getDiagnostics(m) });
    }
  });

  if (registry && typeof registry.registerSection === 'function') registry.registerSection(section.id, section, { replace:true });
  return section;
});
