(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CoverageFitRecommendationModel = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.2.0';
  const SCHEMA_VERSION = 1;
  const PRIORITY_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, review: 3, low: 4 });
  const CATEGORY_ORDER = Object.freeze({ property: 0, liability: 1, water: 2, life: 3, umbrella: 4, miscellaneous: 5 });

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function text(value) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }

  function firstText() {
    for (let index = 0; index < arguments.length; index += 1) {
      const candidate = text(arguments[index]);
      if (candidate) return candidate;
    }
    return null;
  }

  function normalizePriority(value) {
    const raw = firstText(value, 'Review');
    const key = raw.toLowerCase();
    if (key.includes('critical') || key.includes('urgent')) return 'Critical';
    if (key.includes('high')) return 'High';
    if (key.includes('medium') || key.includes('moderate')) return 'Medium';
    if (key.includes('low')) return 'Low';
    return 'Review';
  }

  function normalizeCategoryKey(value) {
    const raw = firstText(value);
    if (!raw) return 'miscellaneous';
    const key = raw.toLowerCase();
    if (key.includes('water')) return 'water';
    if (key.includes('umbrella') || key.includes('excess')) return 'umbrella';
    if (key.includes('liability')) return 'liability';
    if (key.includes('life')) return 'life';
    if (key.includes('property') || key.includes('home') || key.includes('dwelling')) return 'property';
    return 'miscellaneous';
  }


  const CATEGORY_LABELS = Object.freeze({
    property: 'Property Protection',
    liability: 'Liability Protection',
    water: 'Water Damage Prevention',
    life: 'Life Protection',
    umbrella: 'Umbrella Protection',
    miscellaneous: 'Additional Review Topics'
  });

  function buildGroups(recommendations) {
    const buckets = new Map();
    recommendations.forEach(item => {
      const key = item.categoryKey || 'miscellaneous';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    });
    return Object.keys(CATEGORY_ORDER)
      .filter(key => buckets.has(key))
      .map((key, index) => ({
        id: `recommendation-group-${key}`,
        key,
        title: CATEGORY_LABELS[key] || CATEGORY_LABELS.miscellaneous,
        order: index,
        count: buckets.get(key).length,
        recommendations: buckets.get(key).slice()
      }));
  }

  function compareRecommendations(left, right) {
    const priorityDifference = left.priorityRank - right.priorityRank;
    if (priorityDifference) return priorityDifference;

    const leftCategoryRank = CATEGORY_ORDER[left.categoryKey] ?? CATEGORY_ORDER.miscellaneous;
    const rightCategoryRank = CATEGORY_ORDER[right.categoryKey] ?? CATEGORY_ORDER.miscellaneous;
    const categoryDifference = leftCategoryRank - rightCategoryRank;
    if (categoryDifference) return categoryDifference;

    return left.sourceIndex - right.sourceIndex;
  }

  function clone(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (typeof value === 'object') {
      const result = {};
      Object.keys(value).forEach(key => { result[key] = clone(value[key]); });
      return result;
    }
    return value;
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    (Array.isArray(values) ? values : []).forEach(value => {
      const normalized = text(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    });
    return result;
  }

  function mapRecommendation(item, index) {
    const source = item && typeof item === 'object' ? item : {};
    const priority = normalizePriority(source.priority || source.level || source.severity);
    return {
      id: firstText(source.id, `recommendation-${index + 1}`),
      title: firstText(source.title, source.name, source.topic, 'Coverage review topic'),
      priority,
      priorityRank: PRIORITY_ORDER[priority.toLowerCase()] ?? PRIORITY_ORDER.review,
      category: firstText(source.category, source.type, source.group),
      categoryKey: normalizeCategoryKey(firstText(source.category, source.type, source.group, source.title, source.name, source.topic)),
      sourceIndex: index,
      discussionTopic: firstText(source.discussionTopic, source.topic, source.title, source.name),
      whyItMatters: firstText(source.whyItMatters, source.summary, source.description, source.why, source.rationale),
      suggestedReview: firstText(source.suggestedReview, source.recommendation, source.action, source.nextStep),
      question: firstText(source.question, source.prompt),
      sourceIds: uniqueStrings(source.sourceIds),
      metadata: source.metadata && typeof source.metadata === 'object' ? clone(source.metadata) : null
    };
  }

  function create(printModel) {
    const source = printModel && typeof printModel === 'object' ? printModel : {};
    const raw = Array.isArray(source.recommendations) ? source.recommendations : [];
    const recommendations = raw.map(mapRecommendation).sort(compareRecommendations);
    const groups = buildGroups(recommendations);

    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      modelVersion: VERSION,
      count: recommendations.length,
      groupCount: groups.length,
      recommendations,
      groups,
      source: {
        printSchemaVersion: source.schemaVersion ?? null,
        printEngineVersion: firstText(source.engineVersion),
        generatedAt: firstText(source.generatedAt)
      }
    });
  }

  function hasContent(model) {
    return Boolean(model && Array.isArray(model.recommendations) && model.recommendations.length);
  }

  function getDiagnostics(model) {
    const warnings = [];
    const items = Array.isArray(model?.recommendations) ? model.recommendations : [];
    if (!items.length) warnings.push('No recommendations are available.');
    items.forEach((item, index) => {
      if (!item.title) warnings.push(`Recommendation ${index + 1} has no title.`);
      if (!item.whyItMatters) warnings.push(`Recommendation ${index + 1} has no explanation.`);
      if (!item.suggestedReview && !item.question) warnings.push(`Recommendation ${index + 1} has no suggested review or discussion question.`);
    });
    return deepFreeze({
      valid: hasContent(model),
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      warningCount: warnings.length,
      warnings
    });
  }

  return Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    PRIORITY_ORDER,
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    create,
    hasContent,
    getDiagnostics
  });
});
