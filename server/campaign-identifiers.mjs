export const FLYER_CAMPAIGN_FAMILY = 'home_flyer';
export const FLYER_VARIANTS = Object.freeze(['rate', 'fit']);
export const FLYER_ZIP_PATTERN = /^\d{5}$/;
export const FLYER_ID_PATTERN = /^(?:home[_-]?flyer|flyer)[_-](\d{5})[_-](rate|fit)$/i;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function normalizeFlyerZip(value) {
  const candidate = text(value).match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] || '';
  return FLYER_ZIP_PATTERN.test(candidate) ? candidate : '';
}

export function normalizeFlyerVariant(value) {
  const candidate = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['a', 'rate', 'rates', 'competitive_rate', 'local_rate', 'rate_proof'].includes(candidate)) return 'rate';
  if (['b', 'fit', 'strong_fit', 'home_fit', 'coverage_fit'].includes(candidate)) return 'fit';
  return '';
}

export function flyerCampaignId(zip, variant) {
  const normalizedZip = normalizeFlyerZip(zip);
  const normalizedVariant = normalizeFlyerVariant(variant);
  return normalizedZip && normalizedVariant ? `${FLYER_CAMPAIGN_FAMILY}_${normalizedZip}_${normalizedVariant}` : '';
}

export function parseFlyerCampaignId(value) {
  const candidate = text(value).replace(/\s+/g, '_');
  const direct = candidate.match(FLYER_ID_PATTERN);
  if (direct) {
    const zip = normalizeFlyerZip(direct[1]);
    const variant = normalizeFlyerVariant(direct[2]);
    return Object.freeze({ active: true, campaignId: flyerCampaignId(zip, variant), campaign: FLYER_CAMPAIGN_FAMILY, campaignZip: zip, campaignVariant: variant });
  }
  const compact = candidate.match(/(?:^|[_-])(\d{5})[_-](rate|fit)(?:$|[_-])/i);
  if (compact) {
    const zip = normalizeFlyerZip(compact[1]);
    const variant = normalizeFlyerVariant(compact[2]);
    return Object.freeze({ active: true, campaignId: flyerCampaignId(zip, variant), campaign: FLYER_CAMPAIGN_FAMILY, campaignZip: zip, campaignVariant: variant });
  }
  return Object.freeze({ active: false, campaignId: '', campaign: '', campaignZip: '', campaignVariant: '' });
}

export function resolveFlyerCampaign(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const explicitZip = normalizeFlyerZip(source.campaignZip || source.campaign_zip || source.zip);
  const explicitVariant = normalizeFlyerVariant(source.campaignVariant || source.campaign_variant || source.variant);
  if (explicitZip && explicitVariant) {
    return Object.freeze({
      active: true,
      campaignId: flyerCampaignId(explicitZip, explicitVariant),
      campaign: FLYER_CAMPAIGN_FAMILY,
      campaignZip: explicitZip,
      campaignVariant: explicitVariant
    });
  }
  for (const candidate of [source.campaignId, source.campaign_id, source.campaign, source.utm_campaign, source.utmContent, source.utm_content, source.content]) {
    const parsed = parseFlyerCampaignId(candidate);
    if (parsed.active) return parsed;
  }
  return Object.freeze({ active: false, campaignId: '', campaign: '', campaignZip: '', campaignVariant: '' });
}
