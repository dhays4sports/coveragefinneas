(function (root, factory) {
  'use strict';
  const api = factory();
  root.CoverageFitCampaignIdentifiers = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD = 'NP-1.5';
  const FAMILY = 'home_flyer';
  const VARIANTS = Object.freeze(['rate', 'fit']);
  const ZIP_PATTERN = /^\d{5}$/;
  const ID_PATTERN = /^(?:home[_-]?flyer|flyer)[_-](\d{5})[_-](rate|fit)$/i;

  function text(value, fallback) {
    if (value === 0) return '0';
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || '';
  }

  function normalizeZip(value) {
    const match = text(value).match(/\b(\d{5})(?:-\d{4})?\b/);
    return match && ZIP_PATTERN.test(match[1]) ? match[1] : '';
  }

  function normalizeVariant(value) {
    const candidate = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (['a', 'rate', 'rates', 'competitive_rate', 'local_rate', 'rate_proof'].includes(candidate)) return 'rate';
    if (['b', 'fit', 'strong_fit', 'home_fit', 'coverage_fit'].includes(candidate)) return 'fit';
    return '';
  }

  function campaignId(zip, variant) {
    const normalizedZip = normalizeZip(zip);
    const normalizedVariant = normalizeVariant(variant);
    return normalizedZip && normalizedVariant ? `${FAMILY}_${normalizedZip}_${normalizedVariant}` : '';
  }

  function parseIdentifier(value) {
    const candidate = text(value).replace(/\s+/g, '_');
    const direct = candidate.match(ID_PATTERN);
    if (direct) {
      const zip = normalizeZip(direct[1]);
      const variant = normalizeVariant(direct[2]);
      return Object.freeze({ active: true, campaign: FAMILY, campaignId: campaignId(zip, variant), campaignZip: zip, campaignVariant: variant });
    }
    const compact = candidate.match(/(?:^|[_-])(\d{5})[_-](rate|fit)(?:$|[_-])/i);
    if (compact) {
      const zip = normalizeZip(compact[1]);
      const variant = normalizeVariant(compact[2]);
      return Object.freeze({ active: true, campaign: FAMILY, campaignId: campaignId(zip, variant), campaignZip: zip, campaignVariant: variant });
    }
    return Object.freeze({ active: false, campaign: '', campaignId: '', campaignZip: '', campaignVariant: '' });
  }

  function resolve(input) {
    const source = input && typeof input === 'object' ? input : {};
    const zip = normalizeZip(source.campaignZip || source.campaign_zip || source.zip);
    const variant = normalizeVariant(source.campaignVariant || source.campaign_variant || source.variant);
    if (zip && variant) return Object.freeze({ active: true, campaign: FAMILY, campaignId: campaignId(zip, variant), campaignZip: zip, campaignVariant: variant });
    const candidates = [source.campaignId, source.campaign_id, source.campaign, source.utm_campaign, source.utmContent, source.utm_content, source.content];
    for (const candidate of candidates) {
      const parsed = parseIdentifier(candidate);
      if (parsed.active) return parsed;
    }
    return Object.freeze({ active: false, campaign: '', campaignId: '', campaignZip: '', campaignVariant: '' });
  }

  function apply(input) {
    const output = { ...(input && typeof input === 'object' ? input : {}) };
    const campaign = resolve(output);
    if (!campaign.active) return output;
    output.campaign = campaign.campaignId;
    output.campaign_id = campaign.campaignId;
    output.campaign_variant = campaign.campaignVariant;
    output.campaign_zip = campaign.campaignZip;
    if (!output.utm_campaign) output.utm_campaign = FAMILY;
    if (!output.utm_content) output.utm_content = campaign.campaignId;
    return output;
  }

  function readSearch(search) {
    let params;
    try { params = new URLSearchParams(text(search)); } catch (_) { params = new URLSearchParams(''); }
    const input = {};
    ['campaign', 'campaign_id', 'campaign_variant', 'campaign_zip', 'utm_campaign', 'utm_content'].forEach((key) => {
      const values = params.getAll(key);
      if (values.length === 1 && text(values[0])) input[key] = text(values[0]);
    });
    return resolve(input);
  }

  return Object.freeze({ VERSION, BUILD, FAMILY, VARIANTS, ZIP_PATTERN, ID_PATTERN, normalizeZip, normalizeVariant, campaignId, parseIdentifier, resolve, apply, readSearch });
});
