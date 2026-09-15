(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CoverageFitPrintReportShell = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.3.0';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function text(value) {
    if (value === 0) return '0';
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  function firstText() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = text(arguments[index]);
      if (value) return value;
    }
    return '';
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    const raw = text(value);
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  }

  function buildContext(model, options) {
    const source = model || {};
    const settings = options || {};
    const metadata = source.metadata || {};
    const customer = source.customer || {};
    const property = source.propertySummary || {};
    const producer = metadata.producer || source.producer || {};
    const agencyDetails = metadata.agencyDetails || source.agency || {};
    const address = firstText(property.address, property.formattedAddress);
    const title = firstText(settings.title, metadata.title, 'CoverageFit Consultation');
    const preparedBy = firstText(settings.preparedBy, metadata.preparedBy, producer.name);
    const agency = firstText(settings.agency, metadata.agency, agencyDetails.name);
    const reportId = firstText(
      settings.reportId,
      metadata.reportId,
      metadata.consultationId,
      metadata.snapshotId,
      source.id
    );
    const producerPhone = firstText(settings.producerPhone, metadata.producerPhone, producer.phone);
    const producerEmail = firstText(settings.producerEmail, metadata.producerEmail, producer.email);
    const producerTitle = firstText(settings.producerTitle, metadata.producerTitle, producer.title);
    const producerLicense = firstText(settings.producerLicense, metadata.producerLicense, producer.license);
    const agencyAddress = firstText(settings.agencyAddress, metadata.agencyAddress, agencyDetails.address);
    const generatedDate = formatDate(settings.generatedAt || metadata.generatedAt || source.generatedAt);
    const documentLabel = firstText(settings.documentLabel, metadata.documentLabel, 'Consultation Report');

    return deepFreeze({
      title,
      documentLabel,
      product: firstText(metadata.product, 'Insurance'),
      clientName: firstText(customer.name, 'Client Consultation'),
      propertyAddress: address,
      consultationDate: formatDate(metadata.consultationDate || source.generatedAt),
      generatedDate,
      preparedBy,
      producerTitle,
      producerLicense,
      producerPhone,
      producerEmail,
      agency,
      agencyAddress,
      reportId,
      confidentialLabel: firstText(settings.confidentialLabel, 'Confidential consultation document'),
      pageLabel: firstText(settings.pageLabel, 'Page')
    });
  }

  function buildPreparedBy(context) {
    return [
      context.preparedBy,
      context.producerTitle,
      context.agency,
      context.producerLicense ? `License ${context.producerLicense}` : ''
    ].filter(Boolean).map(escapeHtml).join('<br>');
  }

  function buildContactLine(context) {
    return [context.producerPhone, context.producerEmail].filter(Boolean).map(escapeHtml).join(' · ');
  }

  function buildCover(context) {
    const propertyLine = context.propertyAddress
      ? `<p class="cf-shell-cover-property">${escapeHtml(context.propertyAddress)}</p>`
      : '';
    const preparedBy = buildPreparedBy(context);
    const contactLine = buildContactLine(context);
    const reportReference = context.reportId
      ? `<div><span>Report reference</span><strong>${escapeHtml(context.reportId)}</strong></div>`
      : '';
    const contactBlock = contactLine || context.agencyAddress
      ? `<div class="cf-shell-cover-contact">${contactLine ? `<strong>${contactLine}</strong>` : ''}${context.agencyAddress ? `<span>${escapeHtml(context.agencyAddress)}</span>` : ''}</div>`
      : '';

    return `<section class="cf-report-cover" data-print-shell="cover">
      <div class="cf-shell-cover-brand">CoverageFit<span>®</span></div>
      <div class="cf-shell-cover-main">
        <p class="cf-shell-cover-eyebrow">${escapeHtml(context.product)} Protection Review</p>
        <h1>${escapeHtml(context.title)}</h1>
        <p class="cf-shell-cover-client">Prepared for ${escapeHtml(context.clientName)}</p>
        ${propertyLine}
      </div>
      <div class="cf-shell-cover-meta">
        <div><span>Consultation date</span><strong>${escapeHtml(context.consultationDate || 'Not provided')}</strong></div>
        <div><span>Prepared by</span><strong>${preparedBy || 'Not provided'}</strong></div>
        ${reportReference}
      </div>
      ${contactBlock}
      <footer><span>${escapeHtml(context.confidentialLabel)}</span><span>${escapeHtml(context.documentLabel)}</span></footer>
    </section>`;
  }

  function buildRunningChrome(context, options) {
    const settings = options || {};
    const headerSubject = context.propertyAddress || context.clientName;
    const footerOwner = context.agency || context.preparedBy || 'CoverageFit';
    const footerContact = buildContactLine(context);
    const reportReference = context.reportId ? `Ref ${context.reportId}` : context.documentLabel;
    const includePageNumbers = settings.includePageNumbers !== false;
    const pageNumber = includePageNumbers
      ? `<span class="cf-shell-running-page" data-print-shell="page-number" aria-label="${escapeHtml(context.pageLabel)}"><span class="cf-shell-page-prefix">${escapeHtml(context.pageLabel)}</span></span>`
      : '';

    return `<header class="cf-report-running-header" aria-hidden="true" data-print-shell="header">
      <span class="cf-shell-running-brand">CoverageFit</span>
      <span class="cf-shell-running-document">${escapeHtml(context.documentLabel)}</span>
      <strong class="cf-shell-running-subject">${escapeHtml(headerSubject)}</strong>
    </header>
    <footer class="cf-report-running-footer${includePageNumbers ? ' cf-report-running-footer-paged' : ''}" aria-hidden="true" data-print-shell="footer" data-page-numbering="${includePageNumbers ? 'css-paged-media' : 'disabled'}">
      <span class="cf-shell-running-owner">${escapeHtml(footerOwner)}</span>
      <span class="cf-shell-running-contact">${footerContact}</span>
      <span class="cf-shell-running-reference">${escapeHtml(reportReference)}</span>
      <span class="cf-shell-running-confidential">${escapeHtml(context.confidentialLabel)}</span>
      ${pageNumber}
    </footer>`;
  }

  function compose(sectionOutputs, model, options) {
    const outputs = Array.isArray(sectionOutputs) ? sectionOutputs : [];
    const context = buildContext(model || {}, options || {});
    const sectionHtml = outputs.map(section => section && typeof section.html === 'string' ? section.html : '').filter(Boolean).join('\n');
    const includeCover = options && options.includeCover === false ? false : true;
    const includePageNumbers = options && options.includePageNumbers === false ? false : true;
    const html = `${includeCover ? buildCover(context) : ''}\n${buildRunningChrome(context, { includePageNumbers })}\n<main class="cf-report-body" data-print-shell="body">${sectionHtml}</main>`;
    const warnings = [];
    if (!outputs.length) warnings.push('REPORT_SHELL_NO_SECTIONS');
    if (!context.clientName) warnings.push('REPORT_SHELL_CLIENT_MISSING');
    if (!context.preparedBy) warnings.push('REPORT_SHELL_PREPARED_BY_MISSING');
    if (!context.reportId) warnings.push('REPORT_SHELL_REFERENCE_MISSING');
    const diagnostics = deepFreeze({
      valid: html.includes('data-print-shell="body"') && html.includes('data-print-shell="header"') && html.includes('data-print-shell="footer"'),
      certified: outputs.length > 0 && warnings.length === 0,
      warningCount: warnings.length,
      warnings,
      sectionIds: outputs.map(section => section && section.id ? String(section.id) : '').filter(Boolean),
      shellVersion: VERSION,
      includeCover,
      includePageNumbers,
      pageNumberingMode: includePageNumbers ? 'css-paged-media' : 'disabled'
    });
    return deepFreeze({
      version: VERSION,
      context,
      includeCover,
      includePageNumbers,
      pageNumberingMode: includePageNumbers ? 'css-paged-media' : 'disabled',
      sectionCount: outputs.length,
      diagnostics,
      html
    });
  }

  return Object.freeze({ VERSION, compose, buildContext, buildRunningChrome, escapeHtml });
});
