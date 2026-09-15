(() => {
  const PRIORITY_RANK = Object.freeze({ high: 3, recommended: 2, additional: 1 });
  const PRIORITY_LABEL = Object.freeze({
    high: 'High Priority Review',
    recommended: 'Recommended Discussion',
    additional: 'Additional Consideration'
  });
  const IMPACT_LABEL = Object.freeze({ high: 'High impact', moderate: 'Moderate impact', informational: 'Informational' });
  const products = new Map();

  const clean = value => String(value ?? '').trim();
  const unique = values => [...new Set((values || []).map(clean).filter(Boolean))];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function normalizePriority(priority) {
    return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, priority) ? priority : 'additional';
  }

  function impactFromPriority(priority, explicit) {
    if (explicit && IMPACT_LABEL[explicit]) return explicit;
    return priority === 'high' ? 'high' : priority === 'recommended' ? 'moderate' : 'informational';
  }

  function calculateConfidence(item = {}) {
    if (Number.isFinite(Number(item.confidence))) return clamp(Math.round(Number(item.confidence)), 0, 100);
    const priority = normalizePriority(item.priority);
    const evidenceCount = unique(item.evidence || []).length;
    const ruleCount = unique(item.ruleIds || []).length;
    const triggerCount = unique(item.triggerParts || []).length;
    const base = priority === 'high' ? 72 : priority === 'recommended' ? 60 : 48;
    return clamp(base + Math.min(evidenceCount, 4) * 5 + Math.min(ruleCount, 3) * 4 + Math.min(triggerCount, 3) * 3, 0, 97);
  }

  function buildConversationStarter(item = {}) {
    const topic = clean(item.name || item.topic || item.tag || item.category || 'this topic');
    return clean(item.conversationStarter || item.discussionQuestion || item.question || `Let's confirm how ${topic.toLowerCase()} is addressed and whether anything should be updated.`);
  }

  function buildClientExplanation(item = {}) {
    return clean(item.clientExplanation || item.why || item.reason || 'Your answers made this topic worth confirming during a licensed review.');
  }

  function buildAgentNotes(item = {}) {
    const topic = clean(item.name || item.topic || item.tag || item.category || 'this topic');
    const evidence = unique(item.evidence || []);
    const evidenceText = evidence.length ? ` Tie the discussion back to: ${evidence.slice(0, 3).join('; ')}.` : '';
    return clean(item.agentNotes || `Confirm current limits, deductibles, endorsements, and household details before making a recommendation about ${topic.toLowerCase()}.${evidenceText}`);
  }

  function normalizeItem(item = {}, defaults = {}) {
    const name = clean(item.name || item.topic || item.tag || item.category || defaults.name || 'Coverage topic');
    const priority = normalizePriority(item.priority || defaults.priority);
    const whyParts = unique([
      ...(Array.isArray(item.whyParts) ? item.whyParts : []),
      item.why,
      item.reason,
      defaults.why
    ]);
    const triggerParts = unique([
      ...(Array.isArray(item.triggerParts) ? item.triggerParts : []),
      item.trigger,
      item.source,
      defaults.trigger
    ]);
    const evidence = unique([
      ...(Array.isArray(item.evidence) ? item.evidence : []),
      ...(Array.isArray(item.supportingAnswers) ? item.supportingAnswers : []),
      item.answerLabel,
      item.answerValue
    ]);
    const ruleIds = unique([...(item.ruleIds || []), item.ruleId, defaults.ruleId]);
    const normalized = {
      ...item,
      name,
      priority,
      priorityLabel: PRIORITY_LABEL[priority],
      why: whyParts.join(' '),
      whyParts,
      trigger: triggerParts.join(' · '),
      triggerParts,
      evidence,
      supportingAnswers: evidence,
      ruleIds,
      product: item.product || defaults.product || 'general'
    };
    normalized.impact = impactFromPriority(priority, item.impact || defaults.impact);
    normalized.impactLabel = IMPACT_LABEL[normalized.impact];
    normalized.confidence = calculateConfidence(normalized);
    normalized.clientExplanation = buildClientExplanation(normalized);
    normalized.conversationStarter = buildConversationStarter(normalized);
    normalized.agentNotes = buildAgentNotes(normalized);
    normalized.intelligenceVersion = '4.0-a';
    return normalized;
  }

  function mergeItems(existing, incoming) {
    if (!existing) return normalizeItem(incoming);
    const next = normalizeItem(incoming, { product: existing.product });
    const stronger = PRIORITY_RANK[next.priority] > PRIORITY_RANK[existing.priority] ? next.priority : existing.priority;
    return normalizeItem({
      ...existing,
      ...next,
      priority: stronger,
      impact: impactFromPriority(stronger),
      confidence: Math.max(Number(existing.confidence || 0), Number(next.confidence || 0)),
      whyParts: unique([...(existing.whyParts || []), ...(next.whyParts || [])]),
      triggerParts: unique([...(existing.triggerParts || []), ...(next.triggerParts || [])]),
      evidence: unique([...(existing.evidence || []), ...(next.evidence || [])]),
      supportingAnswers: unique([...(existing.supportingAnswers || []), ...(next.supportingAnswers || [])]),
      ruleIds: unique([...(existing.ruleIds || []), ...(next.ruleIds || [])])
    });
  }

  function createCollector(options = {}) {
    const product = options.product || 'general';
    const items = new Map();
    const diagnostics = {
      product, added: 0, merged: 0, upgraded: 0, skipped: 0,
      evaluatedRules: 0, matchedRules: 0
    };

    function add(itemOrName, priority, why, trigger, extra = {}) {
      const raw = typeof itemOrName === 'string'
        ? { name: itemOrName, priority, why, trigger, ...extra }
        : { ...(itemOrName || {}) };
      if (!clean(raw.name || raw.topic || raw.tag || raw.category)) {
        diagnostics.skipped += 1;
        return null;
      }
      const normalized = normalizeItem(raw, { product });
      const current = items.get(normalized.name);
      if (!current) diagnostics.added += 1;
      else {
        diagnostics.merged += 1;
        if (PRIORITY_RANK[normalized.priority] > PRIORITY_RANK[current.priority]) diagnostics.upgraded += 1;
      }
      const merged = mergeItems(current, normalized);
      items.set(merged.name, merged);
      return merged;
    }

    function evaluate(rules = [], context = {}) {
      rules.forEach((rule, index) => {
        diagnostics.evaluatedRules += 1;
        let matched = false;
        try {
          matched = typeof rule.when === 'function' ? Boolean(rule.when(context)) : Boolean(rule.when ?? true);
        } catch (error) {
          console.warn('[CoverageFitRecommendationEngine] Rule evaluation failed', rule.id || index, error);
        }
        if (!matched) return;
        diagnostics.matchedRules += 1;
        const output = typeof rule.recommend === 'function' ? rule.recommend(context) : rule.recommend;
        (Array.isArray(output) ? output : [output]).filter(Boolean).forEach(item => add({
          ...item,
          ruleId: item.ruleId || rule.id || `${product}-rule-${index + 1}`,
          product
        }));
      });
      return api;
    }

    function values(options = {}) {
      let output = [...items.values()];
      if (options.enrich !== false && window.CoverageFitTriggerLibrary) {
        output = output.map(item => normalizeItem(window.CoverageFitTriggerLibrary.enrich(item, item.name), { product }));
      }
      output.sort((a, b) =>
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
        Number(b.confidence || 0) - Number(a.confidence || 0) ||
        (b.supportingAnswers || []).length - (a.supportingAnswers || []).length ||
        (b.ruleIds || []).length - (a.ruleIds || []).length ||
        a.name.localeCompare(b.name)
      );
      return output;
    }

    const api = {
      add, evaluate, values,
      has: name => items.has(name),
      get: name => items.get(name) || null,
      diagnostics
    };
    return api;
  }

  function registerProduct(product, definition = {}) {
    const key = clean(product).toLowerCase();
    if (!key) throw new Error('A product key is required.');
    if (typeof definition.generate !== 'function' && !Array.isArray(definition.rules)) {
      throw new Error(`Recommendation product "${key}" needs generate() or rules[].`);
    }
    products.set(key, Object.freeze({ ...definition, product: key }));
    return products.get(key);
  }

  function generate(product, context = {}, options = {}) {
    const key = clean(product).toLowerCase();
    const definition = products.get(key);
    if (!definition) {
      console.warn(`[CoverageFitRecommendationEngine] No rules registered for ${key}.`);
      return [];
    }
    let output;
    if (typeof definition.generate === 'function') {
      output = definition.generate(context, { engine: api, options });
    } else {
      const collector = createCollector({ product: key });
      collector.evaluate(definition.rules, context);
      output = collector.values(options);
    }
    return normalizeItems(Array.isArray(output) ? output : [], { product: key, ...options });
  }

  function normalizeItems(items = [], options = {}) {
    const collector = createCollector(options);
    items.forEach(item => collector.add(item));
    return collector.values(options);
  }

  function listProducts() { return [...products.keys()]; }
  function getProduct(product) { return products.get(clean(product).toLowerCase()) || null; }

  const api = Object.freeze({
    PRIORITY_RANK, PRIORITY_LABEL, IMPACT_LABEL,
    normalizePriority, normalizeItem, normalizeItems, calculateConfidence,
    createCollector, registerProduct, generate, listProducts, getProduct
  });
  window.CoverageFitRecommendationEngine = api;
})();
