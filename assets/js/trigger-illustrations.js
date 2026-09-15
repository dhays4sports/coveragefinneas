
(function () {
  const VALID = new Set(["homebuyer", "renewal", "non-renewal", "premium-increase"]);
  const MAP = {
    homebuyer: {
      label: "Home Purchase Review",
      title: "Congratulations on your new home.",
      alt: "House with moving boxes and a key",
      src: "/assets/illustrations/homebuyer.svg"
    },
    renewal: {
      label: "Annual Protection Review",
      title: "A thoughtful time to review what protects your home.",
      alt: "Calendar, shield, and checklist",
      src: "/assets/illustrations/renewal.svg"
    },
    "non-renewal": {
      label: "Coverage Transition Review",
      title: "Prepare for the next coverage conversation.",
      alt: "Home, policy document, and transition arrow",
      src: "/assets/illustrations/default.svg"
    },
    "premium-increase": {
      label: "Premium Increase Review",
      title: "Understand the change before making one.",
      alt: "Policy document, rising line, and magnifying glass",
      src: "/assets/illustrations/premium-increase.svg"
    },
    default: {
      label: "Protection Review",
      title: "Understand your protection with greater clarity.",
      alt: "Home and protection shield",
      src: "/assets/illustrations/default.svg"
    }
  };

  function getTrigger() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("trigger");
    if (VALID.has(query)) {
      sessionStorage.setItem("coveragefit_trigger", query);
      return query;
    }
    const stored = sessionStorage.getItem("coveragefit_trigger");
    return VALID.has(stored) ? stored : "default";
  }

  const trigger = getTrigger();
  const data = MAP[trigger] || MAP.default;
  document.documentElement.dataset.coveragefitTrigger = trigger;

  document.querySelectorAll("[data-trigger-illustration]").forEach((img) => {
    img.src = data.src;
    img.alt = data.alt;
  });
  document.querySelectorAll("[data-trigger-label]").forEach((el) => {
    el.textContent = data.label;
  });
  document.querySelectorAll("[data-trigger-title]").forEach((el) => {
    if (!el.dataset.preserveText) el.textContent = data.title;
  });

  window.CoverageFitTriggerVisuals = { trigger, data, map: MAP };
})();
