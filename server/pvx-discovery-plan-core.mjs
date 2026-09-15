export const PVX_DISCOVERY_PLAN_BUILD = 'CF-DISCOVERY-1.1';
export const PVX_DISCOVERY_CONTRACT = 'coveragefit-multi-product-discovery-v1';
export const PVX_DISCOVERY_TRACKS = Object.freeze(['home', 'auto', 'bundle', 'buyer', 'renter']);
export const PVX_DISCOVERY_ORDERS = Object.freeze({
  home: Object.freeze(['shoppingReason', 'improvementPriorities', 'ownershipDuration', 'upgradeSummary', 'claimExperience', 'permissionToAdvise']),
  buyer: Object.freeze(['shoppingReason', 'improvementPriorities', 'ownershipDuration', 'upgradeSummary', 'otherProperties', 'claimExperience', 'permissionToAdvise']),
  auto: Object.freeze(['shoppingReason', 'improvementPriorities', 'annualMileage', 'vehicleCount', 'liabilityKnowledge', 'permissionToAdvise']),
  bundle: Object.freeze(['shoppingReason', 'improvementPriorities', 'ownershipDuration', 'annualMileage', 'vehicleCount', 'permissionToAdvise']),
  renter: Object.freeze(['shoppingReason', 'improvementPriorities', 'renterProperty', 'renterPriorities', 'permissionToAdvise'])
});

const clean = (value, max = 120) => String(value ?? '').trim().replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
export function normalizeProductTrack(value, fallback = 'home') {
  const candidate = clean(value, 30).toLowerCase();
  return PVX_DISCOVERY_TRACKS.includes(candidate) ? candidate : fallback;
}
export function discoveryOrder(track) { return PVX_DISCOVERY_ORDERS[normalizeProductTrack(track)] || PVX_DISCOVERY_ORDERS.home; }
export function firstUnansweredDiscoveryQuestion(track, answers = {}) { return discoveryOrder(track).find(id => answers?.[id] == null) || 'complete'; }
export function mergeDiscoveryAnswers(track, ...sources) {
  const allowed = new Set(discoveryOrder(track));
  const answers = {}, exactCustomerWords = {}, answerSources = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const values = source.answers && typeof source.answers === 'object' ? source.answers : {};
    for (const [key, value] of Object.entries(values)) if (allowed.has(key) && value != null) answers[key] = clone(value);
    const words = source.exactCustomerWords && typeof source.exactCustomerWords === 'object' ? source.exactCustomerWords : {};
    for (const [key, value] of Object.entries(words)) if (allowed.has(key) && clean(value, 800)) exactCustomerWords[key] = clean(value, 800);
    const attribution = source.answerSources && typeof source.answerSources === 'object' ? source.answerSources : {};
    for (const [key, value] of Object.entries(attribution)) if (allowed.has(key) && clean(value, 40)) answerSources[key] = clean(value, 40);
  }
  return { answers, exactCustomerWords, answerSources, prefilledQuestionIds: Object.keys(answers), currentQuestionId: firstUnansweredDiscoveryQuestion(track, answers) };
}
export function buildDiscoverySeed({ productTrack = 'home', answers = {}, exactCustomerWords = {}, answerSources = {}, startedAt = '' } = {}) {
  const track = normalizeProductTrack(productTrack), merged = mergeDiscoveryAnswers(track, { answers, exactCustomerWords, answerSources });
  const now = new Date().toISOString();
  return {
    schemaVersion: '2.0', contractId: PVX_DISCOVERY_CONTRACT, build: PVX_DISCOVERY_PLAN_BUILD, productTrack: track,
    questionOrder: [...discoveryOrder(track)], currentQuestionId: merged.currentQuestionId, answers: merged.answers, exactCustomerWords: merged.exactCustomerWords,
    answerSources: merged.answerSources, prefilledQuestionIds: merged.prefilledQuestionIds,
    startedAt: clean(startedAt, 40) || now, updatedAt: now, completedAt: merged.currentQuestionId === 'complete' ? now : null
  };
}
export function validateDiscoverySeed(seed = {}) {
  const track = normalizeProductTrack(seed.productTrack, '');
  const errors = [];
  if (!track) errors.push('productTrack');
  if (seed.contractId !== PVX_DISCOVERY_CONTRACT) errors.push('contractId');
  const allowed = new Set(discoveryOrder(track));
  if (Object.keys(seed.answers || {}).some(key => !allowed.has(key))) errors.push('answers');
  if (seed.currentQuestionId !== 'complete' && !allowed.has(seed.currentQuestionId)) errors.push('currentQuestionId');
  return { valid: errors.length === 0, errors };
}
