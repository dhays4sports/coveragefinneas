(() => {
  const applyBranding = () => {
    const p = window.COVERAGEFIT_PRODUCER || {};
    const setText = (selector, value) => document.querySelectorAll(selector).forEach(el => { if (value !== undefined && value !== null && value !== "") el.textContent = value; });
    const setHref = (selector, value) => document.querySelectorAll(selector).forEach(el => { if (value) el.href = value; });
    const setSrc = (selector, value) => document.querySelectorAll(selector).forEach(el => {
      if (value) { el.src = value; el.hidden = false; }
      else { el.hidden = true; }
    });

    setText('[data-producer-name]', p.name);
    setText('[data-producer-first-name]', p.firstName);
    setText('[data-producer-initials]', p.initials);
    setText('[data-producer-title]', p.title);
    setText('[data-producer-license]', p.license);
    setText('[data-producer-agency]', p.agency);
    setText('[data-producer-carrier]', p.carrier);
    setText('[data-producer-phone]', p.phone);
    setText('[data-producer-email]', p.email);
    setText('[data-producer-primary-action]', p.primaryAction);
    setText('[data-producer-secondary-action]', p.secondaryAction);
    setText('[data-presented-by-label]', p.presentedByLabel || 'Presented by');
    setText('[data-consumer-brand]', p.consumerBrand || 'CoverageFit');
    setText('[data-consumer-product]', p.consumerProduct || 'CoverageFit Home');
    setText('[data-producer-disclosure]', p.disclosures);
    setText('[data-producer-report-footer]', p.reportFooter);

    setHref('[data-producer-phone-link]', p.phoneHref);
    setHref('[data-producer-email-link]', p.emailHref);
    setHref('[data-producer-calendar-link]', p.calendarUrl);
    setHref('[data-producer-website-link]', p.website);
    setSrc('[data-producer-logo]', p.producerLogo);
    setSrc('[data-producer-headshot]', p.headshot);

    document.querySelectorAll('[data-producer-phone-link]').forEach(el => {
      if (!el.textContent.trim()) el.textContent = p.phone || 'Contact producer';
    });
    document.querySelectorAll('[data-producer-calendar-link]').forEach(el => {
      if (!el.textContent.trim() || ['Review My Results','Review My Report'].includes(el.textContent.trim())) el.textContent = p.firstName ? `Review My Report With ${p.firstName}` : (p.primaryAction || 'Review My Report');
    });

    document.querySelectorAll('[data-optional-producer-field]').forEach(el => {
      const key = el.getAttribute('data-optional-producer-field');
      el.hidden = !p[key];
    });

    document.querySelectorAll('form').forEach(form => {
      let input = form.querySelector('input[name="producer_id"]');
      if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.name = 'producer_id'; form.appendChild(input); }
      input.value = p.id || '';
      let pname = form.querySelector('input[name="producer_name"]');
      if (!pname) { pname = document.createElement('input'); pname.type = 'hidden'; pname.name = 'producer_name'; form.appendChild(pname); }
      pname.value = p.name || '';
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  else applyBranding();
  window.addEventListener('coveragefit:producer-ready', applyBranding);
})();
