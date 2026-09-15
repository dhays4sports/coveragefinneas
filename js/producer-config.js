(() => {
  const defaults = {
    id: "coveragefit-demo",
    name: "Your Licensed Producer",
    firstName: "Your Producer",
    initials: "LP",
    title: "Licensed Insurance Producer",
    license: "",
    agency: "",
    carrier: "",
    phone: "",
    email: "",
    website: "",
    calendarUrl: "#review-tool",
    producerLogo: "",
    headshot: "",
    primaryAction: "Review My Report",
    secondaryAction: "Contact My Producer",
    presentedByLabel: "Presented by",
    consumerBrand: "CoverageFit",
    consumerProduct: "CoverageFit Home",
    reportFooter: "CoverageFit is an educational self-assessment. A licensed producer can help review the issued policy and available options.",
    disclosures: "CoverageFit is an educational self-assessment, not insurance advice, a quote, or a coverage determination. Actual coverage is governed exclusively by the issued policy, endorsements, exclusions, limits, deductibles, eligibility rules, and underwriting requirements."
  };

  const normalize = (raw = {}) => {
    const p = { ...defaults, ...raw };
    p.firstName = p.firstName || (p.name || "").trim().split(/\s+/)[0] || defaults.firstName;
    p.initials = p.initials || (p.name || "")
      .trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || defaults.initials;
    const digits = String(p.phone || "").replace(/\D/g, "");
    p.phoneHref = p.phoneHref || (digits ? `tel:${digits.length === 10 ? "1" + digits : digits}` : "");
    p.emailHref = p.emailHref || (p.email ? `mailto:${p.email}` : "");
    return p;
  };

  window.COVERAGEFIT_PRODUCER = normalize(window.COVERAGEFIT_PRODUCER || {});
  window.COVERAGEFIT_PRODUCER_READY = fetch("/producer.json", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`producer.json returned ${response.status}`);
      return response.json();
    })
    .then(data => {
      window.COVERAGEFIT_PRODUCER = normalize(data);
      window.dispatchEvent(new CustomEvent("coveragefit:producer-ready", { detail: window.COVERAGEFIT_PRODUCER }));
      return window.COVERAGEFIT_PRODUCER;
    })
    .catch(error => {
      console.warn("CoverageFit could not load producer.json. Safe defaults are being used.", error);
      window.dispatchEvent(new CustomEvent("coveragefit:producer-ready", { detail: window.COVERAGEFIT_PRODUCER }));
      return window.COVERAGEFIT_PRODUCER;
    });
})();
