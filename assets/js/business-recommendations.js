(() => {
  const engine = window.CoverageFitRecommendationEngine;
  if (!engine) throw new Error('CoverageFitRecommendationEngine is required.');
  window.CoverageFitBusinessRecommendations = Object.freeze({
    generate(report) { return engine.generate('business', report); },
    priorityLabel: engine.PRIORITY_LABEL,
    engine
  });
})();
