(function (root) {
  'use strict';
  function install() {
    if (!root.document?.body?.hasAttribute('data-pvx-snapshot')) return;
    const button = document.getElementById('pvxReviewWithDylan');
    const section = document.getElementById('pvxContactRequest');
    const heading = document.getElementById('pvxContactRequestTitle');
    if (!button || !section) return;
    button.addEventListener('click', () => {
      section.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      heading?.focus?.({ preventScroll: true });
      section.scrollIntoView?.({ behavior: root.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      try { root.CoverageFitPVXConsumerEvents?.emit?.('desired_action_selected', { stage:'snapshot', result:'selected', desiredAction:'review_with_dylan' }); } catch (_) {}
    });
    button.setAttribute('aria-controls', 'pvxContactRequest');
    button.setAttribute('aria-expanded', 'false');
    if (root.location.hash === '#pvxContactRequest') button.click();
  }
  root.addEventListener('DOMContentLoaded', install, { once:true });
})(window);
