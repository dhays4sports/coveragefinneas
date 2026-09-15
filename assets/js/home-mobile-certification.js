(function (window, document) {
  'use strict';

  var VERSION = '1.0.0';
  var BUILD = 'CF-HOME-2.9';

  function appendToken(value, token) {
    var tokens = String(value || '').split(/\s+/).filter(Boolean);
    if (tokens.indexOf(token) === -1) tokens.push(token);
    return tokens.join(' ');
  }

  function removeToken(value, token) {
    return String(value || '').split(/\s+/).filter(function (item) { return item && item !== token; }).join(' ');
  }

  function errorId(field) {
    return (field.id || field.name || 'field').replace(/[^a-z0-9_-]/gi, '-') + '-error';
  }

  function clearInvalid(field) {
    if (!field || typeof field.checkValidity !== 'function' || !field.checkValidity()) return;
    field.removeAttribute('aria-invalid');
    var id = errorId(field);
    var describedBy = removeToken(field.getAttribute('aria-describedby'), id);
    if (describedBy) field.setAttribute('aria-describedby', describedBy);
    else field.removeAttribute('aria-describedby');
    document.getElementById(id)?.remove();
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest?.('a.cf-skip-link[href^="#"]');
    if (!link) return;
    var target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  });

  document.addEventListener('invalid', function (event) {
    var field = event.target;
    if (!field || !field.matches?.('input, select, textarea')) return;
    var id = errorId(field);
    var error = document.getElementById(id);
    if (!error) {
      error = document.createElement('span');
      error.className = 'cf-field-error';
      error.id = id;
      error.setAttribute('role', 'alert');
      field.insertAdjacentElement('afterend', error);
    }
    error.textContent = field.validationMessage || 'Please check this field.';
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', appendToken(field.getAttribute('aria-describedby'), id));
  }, true);

  ['input', 'change'].forEach(function (name) {
    document.addEventListener(name, function (event) { clearInvalid(event.target); });
  });

  window.CoverageFitMobileAccessibilityCertification = Object.freeze({
    VERSION: VERSION,
    BUILD: BUILD,
    viewportFloor: 320,
    touchTargetFloor: 44,
    initialTransferBudgetBytes: 500000
  });
})(window, document);
