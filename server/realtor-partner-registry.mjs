export const SMS_PARTNER_REGISTRY_BUILD = 'RC-SMS-1.6';
export const SMS_PARTNER_REGISTRY_ENV = 'RCSMS_PARTNER_REGISTRY_JSON';
export const SMS_PARTNER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,15}$/;

function text(value, fallback = '') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function normalizePartnerCode(value) {
  const candidate = text(value).toUpperCase().replace(/[^A-Z0-9_-]+/g, '').slice(0, 16);
  return SMS_PARTNER_CODE_PATTERN.test(candidate) ? candidate : '';
}

export function normalizePartnerId(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 64);
}

export function normalizePartnerName(value) {
  return text(value).replace(/[<>\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').slice(0, 100);
}

function normalizeSource(value) {
  const candidate = text(value, 'realtor_partner').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 60);
  return candidate || 'realtor_partner';
}

export function normalizePartnerRegistry(input) {
  const source = Array.isArray(input) ? input : [];
  const seenCodes = new Set();
  const seenIds = new Set();
  const records = [];
  for (const raw of source) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const code = normalizePartnerCode(raw.code || raw.smsCode || raw.sms_code);
    const partnerId = normalizePartnerId(raw.partnerId || raw.partner_id || raw.id);
    const partnerName = normalizePartnerName(raw.partnerName || raw.partner_name || raw.name);
    if (!code || !partnerId || !partnerName) continue;
    if (seenCodes.has(code)) throw new TypeError(`Duplicate SMS partner code: ${code}`);
    if (seenIds.has(partnerId)) throw new TypeError(`Duplicate SMS partner ID: ${partnerId}`);
    seenCodes.add(code); seenIds.add(partnerId);
    records.push(Object.freeze({
      code,
      partnerId,
      partnerName,
      status: text(raw.status, raw.active === false ? 'inactive' : 'active').toLowerCase() === 'active' ? 'active' : 'inactive',
      source: normalizeSource(raw.source || raw.defaultSource),
      defaultIntent: text(raw.defaultIntent || raw.default_intent).toLowerCase() === 'buyer' ? 'buyer' : ''
    }));
  }
  return Object.freeze(records);
}

export function partnerRegistryFromEnv(env = {}) {
  const raw = text(env?.[SMS_PARTNER_REGISTRY_ENV]);
  if (!raw) return Object.freeze([]);
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { throw new TypeError(`${SMS_PARTNER_REGISTRY_ENV} must be valid JSON.`); }
  if (!Array.isArray(parsed)) throw new TypeError(`${SMS_PARTNER_REGISTRY_ENV} must be a JSON array.`);
  return normalizePartnerRegistry(parsed);
}

function codeCandidates(body) {
  const value = text(body).slice(0, 1000);
  const matches = [];
  const patterns = [
    /\b(?:ref|referral|code)\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{1,15})\b/ig,
    /\[ref\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{1,15})\]/ig
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(value))) {
      const code = normalizePartnerCode(match[1]);
      if (code && !matches.some(item => item.code === code)) matches.push({ code, start: match.index, end: pattern.lastIndex });
    }
  }
  return matches;
}

function stripMatchedCode(body, match) {
  if (!match) return text(body).slice(0, 1000);
  const value = text(body).slice(0, 1000);
  return `${value.slice(0, match.start)} ${value.slice(match.end)}`.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

export function resolveSmsPartnerAttribution(body, registry = []) {
  const records = normalizePartnerRegistry(registry);
  const byCode = new Map(records.map(record => [record.code, record]));
  for (const candidate of codeCandidates(body)) {
    const record = byCode.get(candidate.code);
    if (!record) continue;
    const cleanedBody = stripMatchedCode(body, candidate);
    if (record.status !== 'active') return Object.freeze({ matched: true, active: false, code: record.code, cleanedBody, attribution: null, defaultIntent: '' });
    return Object.freeze({
      matched: true,
      active: true,
      code: record.code,
      cleanedBody,
      defaultIntent: record.defaultIntent,
      attribution: Object.freeze({
        partnerId: record.partnerId,
        partnerName: record.partnerName,
        partnerCode: record.code,
        referralSource: record.source,
        entryMethod: 'sms'
      })
    });
  }
  return Object.freeze({ matched: false, active: false, code: '', cleanedBody: text(body).slice(0, 1000), attribution: null, defaultIntent: '' });
}
