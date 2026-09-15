(function () {
  'use strict';

  const tools = document.querySelector('.workspace-tools');
  const readiness = document.querySelector('.workspace-readiness-disclosure');
  const readinessPanel = document.getElementById('producerPilotReadiness');

  if (tools) {
    document.addEventListener('click', event => {
      if (tools.open && !tools.contains(event.target)) tools.removeAttribute('open');
    });

    tools.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      tools.removeAttribute('open');
      tools.querySelector('summary')?.focus();
    });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    const disclosure = target?.closest('details');
    if (disclosure && !disclosure.open) disclosure.open = true;
  });

  if (readiness && readinessPanel) {
    const reflectReadiness = () => {
      const state = readinessPanel.dataset.state || 'blocked';
      readiness.dataset.state = state;
      const action = readiness.querySelector(':scope > summary b');
      if (action) action.firstChild.textContent = state === 'ready' ? 'Ready' : 'Open checks';
    };
    reflectReadiness();
    new MutationObserver(reflectReadiness).observe(readinessPanel, {
      attributes: true,
      attributeFilter: ['data-state']
    });
  }
})();
