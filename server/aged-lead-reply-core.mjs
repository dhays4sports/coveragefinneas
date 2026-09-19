import { setSmsReplyContext, clearSmsReplyContext } from './sms-orchestrator-core.mjs';

export const AGED_LEAD_REPLY_BUILD = 'CF-AGED-LEAD-1.0.1';
export const AGED_LEAD_CONTEXTS = Object.freeze({
  DISPOSITION: 'aged_disposition',
  RENEWAL: 'aged_renewal_timing',
  CONTACT: 'aged_contact_method',
  LINE: 'aged_line_of_business',
  CARRIER: 'aged_carrier_status'
});

const MONTHS = Object.freeze({
  january:1, jan:1, february:2, feb:2, march:3, mar:3, april:4, apr:4,
  may:5, june:6, jun:6, july:7, jul:7, august:8, aug:8, september:9, sep:9, sept:9,
  october:10, oct:10, november:11, nov:11, december:12, dec:12
});
const MONTH_LABELS = Object.freeze(['','January','February','March','April','May','June','July','August','September','October','November','December']);
const KNOWN_CARRIERS = Object.freeze([
  'state farm','geico','progressive','allstate','mercury','safeco','liberty mutual','usaa','aaa','aaa insurance',
  'wawanesa','nationwide','travelers','farmers','connect','costco','american family','kemper','amica','the hartford'
]);

function text(value, fallback='') {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function normalizeAgedLeadText(value) {
  return text(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\/\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeAgedLeadDisposition(value) {
  const c = normalizeAgedLeadText(value);
  if (!c) return '';

  // Closed / handled language wins over generic affirmation. This prevents
  // "yeah, I'm all set" and "yes, I already switched" from becoming OPEN.
  if (/\b(?:all set|already (?:got|have|found|switched|covered)|took care of it|got it handled|handled it|found (?:something|coverage)|no longer (?:looking|shopping)|not shopping|staying with|keeping my current|renewed already)\b/.test(c)) return 'not_shopping';
  if (/^(?:no|nope|nah)(?:\s+thanks)?$/.test(c) || /\b(?:not interested|no thanks|don't contact|dont contact|leave me alone)\b/.test(c)) return 'declined';
  if (/\b(?:not right now|maybe later|not at the moment)\b/.test(c)) return 'not_shopping';
  if (/^(?:yeah|yes|yep|yup|sure|okay|ok)\s+no$/.test(c)) return 'declined';

  // Natural positive / open replies, including compound affirmations.
  if (/^(?:yes|yeah|yep|yup|sure|okay|ok|absolutely|definitely|maybe|possibly|interested)$/.test(c)) return 'open';
  if (/^(?:yes|yeah|yep|yup|sure|okay|ok)[, ]+(?:i am|i'm|im|we are|we're|were)(?:\s+(?:still\s+)?(?:open|interested|looking|shopping))?$/.test(c)) return 'open';
  if (/^(?:i am|i'm|im|we are|we're|were)\s+(?:still\s+)?(?:open|interested|looking|shopping)$/.test(c)) return 'open';
  if (/^(?:still am|still interested|still looking|still shopping|open to it|open to comparing|let'?s compare|lets compare|why not|sure why not)$/.test(c)) return 'open';
  if (/\b(?:still (?:open|interested|looking|shopping)|open to (?:it|comparing)|would compare|can compare|interested in comparing|haven't switched|havent switched)\b/.test(c)) return 'open';
  if (/\bdepends(?:\s+on)?\s+(?:price|cost|premium|rate|coverage)\b/.test(c)) return 'open';
  return '';
}

export function normalizeContactPreference(value) {
  const c = normalizeAgedLeadText(value);
  if (!c) return '';
  if (/^(?:text|txt|text me|by text|sms|message|message me|text is fine|texting|texting is fine)$/.test(c)) return 'text';
  if (/^(?:call|call me|phone|phone call|by phone|a call|call is fine|calling is fine)$/.test(c)) return 'call';
  if (/\b(?:prefer|rather|would rather)\s+(?:to\s+)?text\b/.test(c)) return 'text';
  if (/\b(?:prefer|rather|would rather)\s+(?:a\s+)?call\b/.test(c)) return 'call';
  return '';
}

export function normalizeLineOfBusiness(value) {
  const c = normalizeAgedLeadText(value);
  if (/^(?:auto|car|vehicle|auto insurance|car insurance)$/.test(c)) return 'auto';
  if (/^(?:home|homeowners|home insurance|homeowners insurance)$/.test(c)) return 'home';
  if (/^(?:both|bundle|home and auto|auto and home|home auto)$/.test(c)) return 'bundle';
  return '';
}

export function normalizeRenewalTiming(value, options={}) {
  const raw = text(value).slice(0, 120);
  const c = normalizeAgedLeadText(raw);
  if (!c) return null;
  if (/^(?:not sure|unsure|don't know|dont know|i don't know|i dont know|unknown|no idea)$/.test(c)) return { raw, unknown:true, month:null, day:null, year:null, approximate:true, display:'Not sure' };

  const nowValue = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : new Date();
  const now = Number.isNaN(nowValue.getTime()) ? new Date() : nowValue;
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  let month = null, day = null, year = null, approximate = false;
  const named = c.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/);
  if (named) month = MONTHS[named[1]];

  const slash = c.match(/\b(1[0-2]|0?[1-9])\s*[\/\-]\s*(3[01]|[12]?\d)(?:\s*[\/\-]\s*(20\d{2}|\d{2}))?\b/);
  if (slash) {
    month = Number(slash[1]); day = Number(slash[2]);
    if (slash[3]) year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
  }
  if (month && !day) {
    const dayMatch = c.match(/\b(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(3[01]|[12]?\d)(?:st|nd|rd|th)?\b/);
    if (dayMatch) day = Number(dayMatch[1]);
  }
  const explicitYear = c.match(/\b(20\d{2})\b/);
  if (explicitYear) year = Number(explicitYear[1]);
  if (/\b(?:early|mid|middle|late|end of|around|about|probably|i think)\b/.test(c)) approximate = true;

  if (!month) {
    const numericMonthOnly = c.match(/^(?:month\s*)?(1[0-2]|0?[1-9])$/);
    if (numericMonthOnly) month = Number(numericMonthOnly[1]);
  }
  if (!month) return null;
  if (!year) year = month < currentMonth ? currentYear + 1 : currentYear;
  const display = day ? `${MONTH_LABELS[month]} ${day}, ${year}` : `${MONTH_LABELS[month]} ${year}`;
  return { raw, unknown:false, month, day, year, approximate, display };
}

export function normalizeCarrierStatus(value) {
  const c = normalizeAgedLeadText(value);
  if (!c) return null;
  const carrier = KNOWN_CARRIERS.find(name => new RegExp(`\\b${name.replace(/ /g,'\\s+')}\\b`).test(c)) || '';
  const switched = /\b(?:switched|moved|changed|went)\s+(?:to|over to)\b/.test(c) || /\b(?:now with|currently with)\b/.test(c);
  const same = /\b(?:still with|same company|same carrier|haven't switched|havent switched|didn't switch|didnt switch|stayed with|sticking with)\b/.test(c);
  if (!carrier && !switched && !same) return null;
  return { carrier: carrier ? carrier.replace(/\b\w/g, x => x.toUpperCase()) : '', status: switched ? 'switched' : same ? 'same_carrier' : 'carrier_mentioned', raw:text(value).slice(0,120) };
}

function latestExternalOutbound(conversation={}) {
  const transcript = Array.isArray(conversation.transcript) ? conversation.transcript : [];
  return [...transcript].reverse().find(item => item?.direction === 'outbound') || null;
}

export function inferAgedLeadPromptContext(conversation={}, options={}) {
  const explicit = text(conversation.orchestration?.replyContext?.context);
  if (Object.values(AGED_LEAD_CONTEXTS).includes(explicit)) return explicit;
  const latest = latestExternalOutbound(conversation);
  if (!latest) return '';
  const maxAgeDays = Number(options.maxAgeDays) || 21;
  const sentAt = Date.parse(text(latest.occurredAt));
  const nowValue = options.now instanceof Date ? options.now : options.now ? new Date(options.now) : new Date();
  const now = nowValue.getTime();
  if (Number.isFinite(sentAt) && Number.isFinite(now) && now - sentAt > maxAgeDays * 86400000) return '';
  const b = normalizeAgedLeadText(latest.body);
  if (/still open to comparing|are you still open|or are you all set|still open to (?:a )?comparison/.test(b)) return AGED_LEAD_CONTEXTS.DISPOSITION;
  if (/what month.*renew|month.*insurance renew|when.*renew/.test(b)) return AGED_LEAD_CONTEXTS.RENEWAL;
  if (/text or.*call|rather handle.*text|text.*quick call|would you rather.*text/.test(b)) return AGED_LEAD_CONTEXTS.CONTACT;
  if (/did you end up switching|still with the same company|same carrier/.test(b)) return AGED_LEAD_CONTEXTS.CARRIER;
  if (/reply renewal|just reply renewal/.test(b)) return AGED_LEAD_CONTEXTS.RENEWAL;
  return '';
}

export function classifyAgedLeadReply(conversation={}, body, options={}) {
  const context = inferAgedLeadPromptContext(conversation, options);
  const c = normalizeAgedLeadText(body);
  if (!c) return { handled:false, reason:'empty' };

  if (context === AGED_LEAD_CONTEXTS.DISPOSITION) {
    const disposition = normalizeAgedLeadDisposition(body);
    return disposition ? { handled:true, kind:'disposition', value:disposition, context, confidence:'contextual' } : { handled:false, reason:'ambiguous_disposition', context };
  }
  if (context === AGED_LEAD_CONTEXTS.RENEWAL) {
    if (/^renewal$/.test(c)) return { handled:true, kind:'renewal_keyword', value:'renewal', context, confidence:'contextual' };
    const timing = normalizeRenewalTiming(body, options);
    return timing ? { handled:true, kind:'renewal', value:timing, context, confidence:'contextual' } : { handled:false, reason:'ambiguous_renewal', context };
  }
  if (context === AGED_LEAD_CONTEXTS.CONTACT) {
    const pref = normalizeContactPreference(body);
    return pref ? { handled:true, kind:'contact_preference', value:pref, context, confidence:'contextual' } : { handled:false, reason:'ambiguous_contact_preference', context };
  }
  if (context === AGED_LEAD_CONTEXTS.CARRIER) {
    const carrier = normalizeCarrierStatus(body);
    return carrier ? { handled:true, kind:'carrier', value:carrier, context, confidence:'contextual' } : { handled:false, reason:'ambiguous_carrier_status', context };
  }
  if (context === AGED_LEAD_CONTEXTS.LINE) {
    const line = normalizeLineOfBusiness(body);
    return line ? { handled:true, kind:'line', value:line, context, confidence:'contextual' } : { handled:false, reason:'ambiguous_line', context };
  }

  // Conservative no-context fallbacks: only signals that are unusually specific.
  if (/^renewal$/.test(c)) return { handled:true, kind:'renewal_keyword', value:'renewal', context:'', confidence:'strong_keyword' };
  const pref = normalizeContactPreference(body);
  if (pref && /^(?:text|txt|text me|call|call me|by text|by phone|sms)$/.test(c)) return { handled:true, kind:'contact_preference', value:pref, context:'', confidence:'strong_keyword' };
  const carrier = normalizeCarrierStatus(body);
  if (carrier && /\b(?:still with|switched|moved to|changed to|now with|currently with|haven't switched|havent switched)\b/.test(c)) return { handled:true, kind:'carrier', value:carrier, context:'', confidence:'strong_phrase' };
  return { handled:false, reason:'no_aged_context' };
}

export function applyAgedLeadReply(conversation={}, body, options={}) {
  const occurredAt = text(options.occurredAt || options.now || conversation.updatedAt || new Date().toISOString());
  const classified = classifyAgedLeadReply(conversation, body, { ...options, now: occurredAt });
  if (!classified.handled) return { handled:false, conversation, classification:classified };

  let next = { ...conversation, agedLead: { ...(conversation.agedLead || {}), build:AGED_LEAD_REPLY_BUILD, lastInbound:text(body).slice(0,300), updatedAt:occurredAt } };
  let reply = '';
  let replyContext = '';
  let replyRoute = 'coveragefit';
  let workflow = 'aged_lead_reengagement';

  if (classified.kind === 'disposition') {
    next.agedLead.disposition = classified.value;
    next.agedLead.dispositionAt = occurredAt;
    if (classified.value === 'open') {
      reply = 'Absolutely. Is this mainly AUTO, HOME, or both?';
      replyContext = AGED_LEAD_CONTEXTS.LINE;
    } else if (classified.value === 'not_shopping') {
      reply = "Got it. If you'd like, I can note your next renewal for Dylan. What month does it renew?";
      replyContext = AGED_LEAD_CONTEXTS.RENEWAL;
    } else {
      reply = 'No problem — thanks for letting me know.';
      next.agedLead.status = 'closed';
    }
  } else if (classified.kind === 'renewal_keyword') {
    reply = 'Absolutely. What month does your current insurance renew?';
    replyContext = AGED_LEAD_CONTEXTS.RENEWAL;
  } else if (classified.kind === 'renewal') {
    next.agedLead.renewal = classified.value;
    next.agedLead.renewalCapturedAt = occurredAt;
    if (classified.value.unknown) reply = 'No worries. If you find it later, just text me the month.';
    else reply = `Perfect — I'll note ${MONTH_LABELS[classified.value.month]}. Dylan can reconnect closer to renewal.`;
    next.agedLead.status = 'xdate_captured';
  } else if (classified.kind === 'contact_preference') {
    next.agedLead.contactPreference = classified.value;
    next.agedLead.contactPreferenceAt = occurredAt;
    if (classified.value === 'text') {
      reply = 'Absolutely. We can do this here. Is this mainly AUTO, HOME, or both?';
      replyContext = AGED_LEAD_CONTEXTS.LINE;
    } else {
      reply = 'Sure. What day and time works best?';
      replyContext = 'callback_time_request';
      replyRoute = 'appointment';
      workflow = 'missed_call_callback_v1';
    }
  } else if (classified.kind === 'carrier') {
    next.agedLead.carrier = classified.value;
    next.agedLead.carrierCapturedAt = occurredAt;
    reply = 'Got it. Do you know what month that policy renews?';
    replyContext = AGED_LEAD_CONTEXTS.RENEWAL;
  } else if (classified.kind === 'line') {
    next.agedLead.lineOfBusiness = classified.value;
    next.agedLead.lineCapturedAt = occurredAt;
    // Feed the normalized keyword into the ordinary CoverageFit state machine on
    // the next turn; this turn only acknowledges the re-engagement preference.
    // The caller can use normalizedIntent to start the standard intake now.
    return { handled:true, conversation:next, classification:classified, normalizedIntent: classified.value === 'bundle' ? 'bundle' : classified.value, bridgeToCoverageFit:true };
  }

  if (replyContext) {
    next.orchestration = setSmsReplyContext(next, { context:replyContext, route:replyRoute, workflow, source:'aged_lead', ttlSeconds: 21 * 86400 }, { occurredAt });
  } else {
    next.orchestration = clearSmsReplyContext(next, { occurredAt });
  }
  return { handled:true, conversation:next, classification:classified, reply, replyContext, replyRoute, workflow };
}
