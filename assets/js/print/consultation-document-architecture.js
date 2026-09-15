(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoverageFitConsultationDocumentArchitecture = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.1.0';
  const SCHEMA_VERSION = '1.0';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  const CHAPTERS = deepFreeze([
    { id: 'executive-summary', number: '01', title: 'Executive Summary', pageId: 'review-overview', purpose: 'What this review is for and what matters most.' },
    { id: 'protection-snapshot', number: '02', title: 'Protection Snapshot', pageId: 'review-overview', purpose: 'What the score means and how to use it.' },
    { id: 'property-snapshot', number: '03', title: 'Property Snapshot', pageId: 'property-verification', purpose: 'Important details about the home.' },
    { id: 'items-to-verify', number: '04', title: 'Items to Verify', pageId: 'property-verification', purpose: 'Details to confirm before making changes.' },
    { id: 'priority-findings', number: '05', title: 'Priority Findings', pageId: 'consultation-record', purpose: 'The home protection topics to discuss first.' },
    { id: 'recommendations', number: '06', title: 'Recommendations', pageId: 'consultation-record', purpose: 'Options and reasoning to review together.' },
    { id: 'decisions-next-steps', number: '07', title: 'Decisions and Next Steps', pageId: 'consultation-record', purpose: 'What was decided, what is still open, and what happens next.' }
  ]);

  const PAGES = deepFreeze([
    { id: 'review-overview', number: '01', order: 10, title: 'Review Overview', chapterIds: ['executive-summary', 'protection-snapshot'] },
    { id: 'property-verification', number: '02', order: 20, title: 'Property & Verification', chapterIds: ['property-snapshot', 'items-to-verify'] },
    { id: 'consultation-record', number: '03', order: 30, title: 'Consultation Record', chapterIds: ['priority-findings', 'recommendations', 'decisions-next-steps'] }
  ]);

  function getPage(id) {
    return PAGES.find(page => page.id === id) || null;
  }

  function getChapter(id) {
    return CHAPTERS.find(chapter => chapter.id === id) || null;
  }

  function chaptersForPage(id) {
    const page = getPage(id);
    return deepFreeze((page?.chapterIds || []).map(getChapter).filter(Boolean));
  }

  function renderDocumentMap(activePageId) {
    const items = PAGES.map(page => {
      const active = page.id === activePageId;
      const chapterTitles = chaptersForPage(page.id).map(chapter => chapter.title).join(' · ');
      return `<li class="cf-document-map__item${active ? ' is-active' : ''}"${active ? ' aria-current="step"' : ''} data-document-page="${page.id}"><span>${page.number}</span><div><strong>${page.title}</strong><small>${chapterTitles}</small></div></li>`;
    }).join('');
    return `<nav class="cf-document-map" aria-label="Home protection consultation sections"><ol>${items}</ol></nav>`;
  }

  function diagnostics() {
    const pageIds = new Set(PAGES.map(page => page.id));
    const chapterIds = new Set(CHAPTERS.map(chapter => chapter.id));
    const assigned = PAGES.flatMap(page => page.chapterIds);
    const errors = [];
    if (pageIds.size !== PAGES.length) errors.push('Duplicate document page ID.');
    if (chapterIds.size !== CHAPTERS.length) errors.push('Duplicate document chapter ID.');
    if (assigned.length !== CHAPTERS.length || assigned.some(id => !chapterIds.has(id)) || new Set(assigned).size !== assigned.length) {
      errors.push('Every chapter must be assigned to exactly one document page.');
    }
    if (CHAPTERS.some(chapter => !pageIds.has(chapter.pageId))) errors.push('Chapter references an unknown document page.');
    return deepFreeze({ valid: errors.length === 0, version: VERSION, schemaVersion: SCHEMA_VERSION, pageCount: PAGES.length, chapterCount: CHAPTERS.length, errors });
  }

  return deepFreeze({ VERSION, SCHEMA_VERSION, PAGES, CHAPTERS, getPage, getChapter, chaptersForPage, renderDocumentMap, diagnostics });
});
