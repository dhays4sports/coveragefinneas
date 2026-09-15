import { authorizeProducer } from './consultation-inbox-core.mjs';
import { normalizeE164 } from './ringcentral-client.mjs';
import { smsLiveConversationId, sendSmsThroughGateway } from './sms-outbound-gateway.mjs';
import { smsPermissionSnapshot } from './sms-consent-core.mjs';
import { timingSafeTextEqual } from './runtime-crypto.mjs';
import {handlePreparation, preparationInvitation} from './callback-preparation-core.mjs';
import {projectSoloDeskEventBestEffort} from './solo-desk-event-projection.mjs';

export const SMS_CALLBACK_BUILD = 'RC-SMS-1.10.2';
export const CALLBACK_SEQUENCE_PREFIX = 'sms-callback-sequences/';
export const CALLBACK_CALENDAR_PREFIX = 'sms-callback-calendar/';
export const CALLBACK_WEB_BOOKING_PREFIX = 'callback-web-bookings/';
export const CALLBACK_WEB_BOOKING_RUNTIME_BUILD = 'CF-CALLBACK-WEB-1.2';
export const CALLBACK_WORKFLOW = 'missed_call_callback_v1';
export const CALLBACK_TIME_ZONE = 'America/Los_Angeles';
export const CALLBACK_OFFER_DAYS = 17;
export const CALLBACK_MAX_BODY_BYTES = 12000;

const TERMINAL_SEQUENCE = new Set(['engaged', 'scheduled', 'text_requested', 'email_requested', 'not_interested', 'opted_out', 'completed', 'expired', 'cancelled']);
const TERMINAL_CALLBACK = new Set(['call_now_requested', 'call_anytime_requested', 'cancelled', 'completed', 'expired']);
const CALLBACK_TOKEN = /^[A-Za-z0-9_-]{24,96}$/;
const PRODUCT_TYPES = new Set(['home', 'condo', 'auto', 'bundle', 'life', 'business', 'general']);
const MONTHS = Object.freeze({
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12
});
const WEEKDAYS = Object.freeze({ sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 });

const text = (value, fallback = '') => {
  if (value === 0) return '0';
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
};
const cleanLine = (value, max = 160) => text(value).replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const safeProduct = value => PRODUCT_TYPES.has(text(value).toLowerCase()) ? text(value).toLowerCase() : 'general';
const nowDate = (options = {}) => {
  const value = typeof options.now === 'function' ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', ...extra }
});
const error = (status, code, message) => json({ ok: false, error: { code, message } }, status);
const sameOrigin = request => {
  const origin = text(request.headers.get('origin'));
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
};

export function callbackConfig(env = {}) {
  const number = (name, fallback, min, max) => Math.max(min, Math.min(max, Number(env?.[name]) || fallback));
  return Object.freeze({
    timeZone: cleanLine(env.CALLBACK_TIME_ZONE, 80) || CALLBACK_TIME_ZONE,
    calendarId: cleanLine(env.GOOGLE_CALENDAR_ID, 240),
    clientId: cleanLine(env.GOOGLE_CALENDAR_CLIENT_ID, 300),
    clientSecret: text(env.GOOGLE_CALENDAR_CLIENT_SECRET),
    refreshToken: text(env.GOOGLE_CALENDAR_REFRESH_TOKEN),
    cronSecret: text(env.CALLBACK_CRON_SECRET),
    startHour: number('CALLBACK_START_HOUR', 9, 0, 23),
    endHour: number('CALLBACK_END_HOUR', 18, 1, 24),
    durationMinutes: number('CALLBACK_DURATION_MINUTES', 15, 10, 90),
    callMinutes: number('CALLBACK_CUSTOMER_CALL_MINUTES', 10, 5, 60),
    bufferMinutes: number('CALLBACK_BUFFER_MINUTES', 5, 0, 60),
    minimumNoticeMinutes: number('CALLBACK_MINIMUM_NOTICE_MINUTES', 30, 0, 10080),
    maximumHorizonDays: number('CALLBACK_MAXIMUM_HORIZON_DAYS', 60, 1, 365),
    reminderMinutes: number('CALLBACK_REMINDER_MINUTES', 30, 0, 10080)
  });
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: text(parts.weekday).toLowerCase(), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

function localToUtc(parts, timeZone) {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  for (let index = 0; index < 3; index += 1) {
    const actual = zonedParts(new Date(guess), timeZone);
    const desiredStamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const actualStamp = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    const difference = desiredStamp - actualStamp;
    if (!difference) break;
    guess += difference;
  }
  const verified = zonedParts(new Date(guess), timeZone);
  if (verified.year !== parts.year || verified.month !== parts.month || verified.day !== parts.day || verified.hour !== parts.hour || verified.minute !== parts.minute) return null;
  return new Date(guess);
}

function addLocalDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function parseDay(raw, today) {
  const normalized = raw.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\btoday\b/.test(normalized)) return { year: today.year, month: today.month, day: today.day, source: 'today' };
  if (/\btomorrow\b/.test(normalized)) return { ...addLocalDays(today, 1), source: 'tomorrow' };
  const iso = normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]), source: 'date' };
  const slash = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}|\d{2}))?\b/);
  if (slash) {
    let year = slash[3] ? Number(slash[3]) : today.year;
    if (year < 100) year += 2000;
    return { year, month: Number(slash[1]), day: Number(slash[2]), source: 'date' };
  }
  const named = normalized.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(20\d{2}))?\b/);
  if (named) return { year: named[3] ? Number(named[3]) : today.year, month: MONTHS[named[1]], day: Number(named[2]), source: 'date' };
  const weekday = normalized.match(/\b(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekday) {
    const todayIndex = WEEKDAYS[today.weekday];
    const desired = WEEKDAYS[weekday[2]];
    let delta = (desired - todayIndex + 7) % 7;
    if (weekday[1] === 'next') delta += delta === 0 ? 7 : 7;
    else if (delta === 0) delta = 7;
    return { ...addLocalDays(today, delta), source: weekday[2] };
  }
  return null;
}

function parseTime(raw) {
  const normalized = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const period = /\b(morning|afternoon|evening|lunch|lunchtime)\b/.exec(normalized)?.[1] || '';
  // Prefer a time introduced by natural scheduling language, then an
  // explicitly qualified AM/PM time. This prevents the day in "August 31 at
  // 2" from being mistaken for 31:00.
  const match = normalized.match(/\b(?:at|around|about|after|before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)
    || normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!match) return { time: null, period };
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  let meridiem = match[3] || '';
  if (!meridiem && period === 'afternoon' && hour < 12) meridiem = 'pm';
  if (!meridiem && period === 'evening' && hour < 12) meridiem = 'pm';
  if (!meridiem && (period === 'morning' || period === 'lunch' || period === 'lunchtime')) meridiem = hour === 12 ? 'pm' : 'am';
  if (!meridiem && hour >= 1 && hour <= 7) meridiem = 'pm';
  if (!meridiem && hour >= 8 && hour <= 11) meridiem = 'am';
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return { time: null, period, invalid: true };
  return { time: { hour, minute }, period };
}

export function parseCallbackDateTime(value, options = {}) {
  const raw = cleanLine(value, 300);
  const config = options.config || callbackConfig(options.env || {});
  const now = nowDate(options);
  const today = zonedParts(now, config.timeZone);
  const day = parseDay(raw, today);
  const parsedTime = parseTime(raw);
  if (!day && !parsedTime.time) return { ok: false, reason: 'missing_day_and_time', raw };
  if (!day) return { ok: false, reason: 'missing_day', raw, time: parsedTime.time };
  if (!parsedTime.time) return { ok: false, reason: parsedTime.period ? 'vague_time' : 'missing_time', raw, day, period: parsedTime.period };
  const start = localToUtc({ ...day, ...parsedTime.time }, config.timeZone);
  if (!start) return { ok: false, reason: 'invalid_local_time', raw };
  const earliest = new Date(now.getTime() + config.minimumNoticeMinutes * 60000);
  const latest = new Date(now.getTime() + config.maximumHorizonDays * 86400000);
  if (start <= earliest) return { ok: false, reason: 'too_soon', raw, start: start.toISOString() };
  if (start > latest) return { ok: false, reason: 'too_far', raw, start: start.toISOString() };
  const local = zonedParts(start, config.timeZone);
  const afterCallbackWindow = local.hour > config.endHour || (local.hour === config.endHour && local.minute > 0);
  if (local.hour < config.startHour || afterCallbackWindow || local.weekday === 'saturday' || local.weekday === 'sunday') {
    return { ok: false, reason: 'outside_hours', raw, start: start.toISOString(), local };
  }
  const end = new Date(start.getTime() + config.durationMinutes * 60000);
  return { ok: true, raw, start: start.toISOString(), end: end.toISOString(), display: displayCallbackDate(start, config.timeZone), timeZone: config.timeZone };
}

export function displayCallbackDate(value, timeZone = CALLBACK_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
}

function latestOutbound(conversation = {}) {
  const transcript = Array.isArray(conversation.transcript) ? conversation.transcript : [];
  return [...transcript].reverse().find(item => item?.direction === 'outbound') || null;
}

export function recentCallbackInvitation(conversation = {}, options = {}) {
  const item = latestOutbound(conversation);
  if (!item) return false;
  const occurred = Date.parse(text(item.occurredAt));
  const now = nowDate(options).getTime();
  if (Number.isFinite(occurred) && now - occurred > CALLBACK_OFFER_DAYS * 86400000) return false;
  return /best day and time|what day and time|good day and time|good time.{0,40}call|quick (?:10-minute )?call|brief call|reply with (?:the )?(?:best |good )?(?:day|time)/i.test(text(item.body));
}

export function isCallNowRequest(value) {
  const normalized = cleanLine(value, 300)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/\bnow\b/.test(normalized)) return false;

  // A bare occurrence of "now" is not enough. These guards keep ordinary
  // refusals and availability constraints from creating an urgent alert.
  if (/\b(?:not|never)\s+(?:right\s+)?now\b/.test(normalized)) return false;
  if (/\b(?:can't|cant|cannot|unable to)\s+(?:talk|speak|call|take (?:a )?call)(?:\s+right)?\s+now\b/.test(normalized)) return false;
  if (/\b(?:i am|i'm|im)\s+(?:busy|unavailable|not available|not free)(?:\s+right)?\s+now\b/.test(normalized)) return false;
  if (/\b(?:do not|don't|dont)\s+call(?:\s+me)?(?:\s+right)?\s+now\b/.test(normalized)) return false;

  return [
    /^(?:please\s+)?(?:right\s+)?now(?:\s+(?:please|thanks))?$/,
    /\b(?:i am|i'm|im)\s+(?:available|free)(?:\s+right)?\s+now\b/,
    /\b(?:i can|we can)\s+(?:talk|speak|take (?:a )?call)(?:\s+right)?\s+now\b/,
    /\b(?:you can\s+)?call(?:\s+me)?(?:\s+right)?\s+now\b/,
    /\b(?:right\s+)?now\s+(?:is|works|would be)\s+(?:good|great|fine|perfect|okay|ok|best|convenient)\b/
  ].some(pattern => pattern.test(normalized));
}

const callbackCommand = value => {
  const normalized = cleanLine(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (isCallNowRequest(value)) return 'call_now';
  if (/^(callback|schedule|schedule a call|book a call|call back)$/.test(normalized)) return 'callback';
  if (/^(anytime|call anytime|call me anytime|when available|call when available|call me when available)$/.test(normalized)) return 'anytime';
  if (/^(yes|y|confirm|book it|that works|works for me)$/.test(normalized)) return 'yes';
  if (/^(change|reschedule|different time|another time)$/.test(normalized)) return 'change';
  if (/^(cancel|cancel callback|cancel appointment)$/.test(normalized)) return 'cancel';
  if (/^(status|appointment|when is my call)$/.test(normalized)) return 'status';
  return '';
};

const explicitNonCallback = value => /^(home|auto|life|business|buyer|text|email|stop|start|help|dylan|agent|human|not interested|no thanks|done)$/i.test(cleanLine(value, 100));
const independentProducerRequest = value => /\b(?:text(?: me)?|email(?: me)?|call me now|quote|price|cost|premium|coverage|policy|claim|deductible|carrier)\b/i.test(cleanLine(value, 300));

export function shouldHandleCallbackInbound(conversation = {}, body, options = {}) {
  if (conversation.callbackScheduling?.status === 'scheduled' && (/^ready[.!?]*$/i.test(cleanLine(body, 100)) || conversation.callbackPreparation?.status === 'active') && !explicitNonCallback(body)) return true;
  const command = callbackCommand(body);
  const callback = conversation.callbackScheduling && typeof conversation.callbackScheduling === 'object' ? conversation.callbackScheduling : {};
  const active = callback.status && !TERMINAL_CALLBACK.has(callback.status);
  const replyContext = conversation.orchestration?.replyContext?.context === 'callback_time_request';
  if (command === 'callback' || command === 'anytime' || command === 'call_now') return true;
  if (explicitNonCallback(body)) return Boolean(active && ['cancel', 'status'].includes(command));
  if (independentProducerRequest(body)) return false;
  if (active || replyContext || recentCallbackInvitation(conversation, options)) return true;
  // RingCentral's instant SMS webhook is inbound-focused, so an AgencyZoom
  // outbound invitation may not appear in this transcript. A bounded reply
  // containing an actual day and/or time is still safe to route to scheduling;
  // product keywords, producer requests, and insurance questions were excluded
  // above and remain under their existing routes.
  const timing = parseCallbackDateTime(body, options);
  return timing.ok || ['missing_day', 'missing_time', 'vague_time'].includes(timing.reason);
}

function pendingDayValue(day) {
  if (!day || !Number.isInteger(day.year) || !Number.isInteger(day.month) || !Number.isInteger(day.day)) return '';
  return `${String(day.year).padStart(4, '0')}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

function pendingTimeValue(time) {
  if (!time || !Number.isInteger(time.hour) || !Number.isInteger(time.minute)) return '';
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function parseCallbackTurn(body, callback, options = {}) {
  const raw = cleanLine(body, 300);
  let parsed = parseCallbackDateTime(raw, options);
  const savedDay = pendingDayValue(callback.pendingDay);
  const savedTime = pendingTimeValue(callback.pendingTime);
  // Bare numbers are times only while answering a saved day's time question.
  // Keep this narrow so phone numbers and unrelated numerical replies do not book.
  const shortTime = raw.match(/^(?:(?:at|around|about)\s+)?(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)(?:\s+(?:ok(?:ay)?|works(?: for me)?|please|thanks|thank you))?\s*[?.!]*$/i);
  if (savedDay && shortTime) {
    const legacyPeriod = callback.pendingPeriod === undefined ? parseTime(cleanLine(callback.requestedRaw, 300)).period : '';
    const period = ['morning', 'afternoon', 'evening', 'lunch', 'lunchtime'].includes(callback.pendingPeriod) ? callback.pendingPeriod : legacyPeriod;
    return parseCallbackDateTime(`${savedDay} at ${shortTime[1]} ${period}`, options);
  }
  if (!parsed.ok && parsed.reason === 'missing_day' && savedDay) {
    parsed = parseCallbackDateTime(`${savedDay} at ${raw}`, options);
  } else if (!parsed.ok && ['missing_time', 'vague_time'].includes(parsed.reason) && savedTime) {
    parsed = parseCallbackDateTime(`${raw} at ${savedTime}`, options);
  }
  return parsed;
}

async function googleAccessToken(config, options = {}) {
  if (!config.clientId || !config.clientSecret || !config.refreshToken || !config.calendarId) return { configured: false, token: '' };
  const fetchFn = options.fetch || options.fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('Google Calendar transport is unavailable.');
  const response = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: 'refresh_token' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !text(data.access_token)) throw new Error('Google Calendar authorization failed.');
  return { configured: true, token: text(data.access_token) };
}

export async function googleCalendarAvailability(start, end, options = {}) {
  const config = options.config || callbackConfig(options.env || {});
  const access = await googleAccessToken(config, options);
  if (!access.configured) return { configured: false, available: false, reason: 'google_calendar_not_configured' };
  const fetchFn = options.fetch || options.fetchImpl || globalThis.fetch;
  const response = await fetchFn('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST', headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: start, timeMax: end, timeZone: config.timeZone, items: [{ id: config.calendarId }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Google Calendar availability could not be checked.');
  const busy = data.calendars?.[config.calendarId]?.busy;
  return { configured: true, available: Array.isArray(busy) && busy.length === 0, busy: Array.isArray(busy) ? busy : [] };
}

async function googleCalendarAlternativeSlots(requestedStart, options = {}) {
  const config = options.config || callbackConfig(options.env || {});
  const access = await googleAccessToken(config, options);
  if (!access.configured) return [];
  const local = zonedParts(new Date(requestedStart), config.timeZone);
  const rangeStart = new Date(new Date(requestedStart).getTime() + 30 * 60000);
  const rangeEnd = localToUtc({ year: local.year, month: local.month, day: local.day, hour: config.endHour, minute: 0 }, config.timeZone);
  if (!rangeEnd || rangeStart >= rangeEnd) return [];
  const fetchFn = options.fetch || options.fetchImpl || globalThis.fetch;
  const response = await fetchFn('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST', headers: { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: rangeStart.toISOString(), timeMax: rangeEnd.toISOString(), timeZone: config.timeZone, items: [{ id: config.calendarId }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  const busy = Array.isArray(data.calendars?.[config.calendarId]?.busy) ? data.calendars[config.calendarId].busy : [];
  const slots = [];
  for (let at = rangeStart.getTime(); at + config.durationMinutes * 60000 <= rangeEnd.getTime() && slots.length < 2; at += 30 * 60000) {
    const start = new Date(at);
    const end = new Date(at + config.durationMinutes * 60000);
    const overlaps = busy.some(item => Date.parse(item.start) < end.getTime() && Date.parse(item.end) > start.getTime());
    if (!overlaps) slots.push({ start: start.toISOString(), end: end.toISOString(), display: displayCallbackDate(start, config.timeZone) });
  }
  return slots;
}

async function googleEvent(method, eventId, event, options = {}) {
  const config = options.config || callbackConfig(options.env || {});
  const access = await googleAccessToken(config, options);
  if (!access.configured) return { configured: false };
  const fetchFn = options.fetch || options.fetchImpl || globalThis.fetch;
  const path = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
  const response = await fetchFn(path, {
    method, headers: { Authorization: `Bearer ${access.token}`, ...(event ? { 'Content-Type': 'application/json' } : {}) }, body: event ? JSON.stringify(event) : undefined
  });
  if (method === 'DELETE' && response.status === 404) return { configured: true, deleted: true };
  if (method === 'GET' && response.status === 404) return { configured: true, event: null, notFound: true };
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Google Calendar appointment could not be updated.');
  return { configured: true, event: data, deleted: method === 'DELETE' };
}

function googleEventBody(conversation, callback, config) {
  const firstName = cleanLine(conversation.callbackSequence?.firstName, 60);
  const product = safeProduct(conversation.callbackSequence?.productType || callback.productType);
  const productLabel = product === 'general' ? 'Insurance' : product === 'bundle' ? 'Home + auto insurance' : `${product[0].toUpperCase()}${product.slice(1)} insurance`;
  return {
    summary: `Callback — ${productLabel}${firstName ? ` — ${firstName}` : ''}`,
    description: [
      'Dylan Haysbert — Virginia Tam Insurance Agency, Inc.',
      'Insurance Producer · CA License #4528400',
      `Prospect mobile: ${normalizeE164(conversation.contactPhone) || 'not available'}`,
      `CoverageFit conversation: ${cleanLine(conversation.id, 100)}`,
      `Review context: ${product}`
    ].join('\n'),
    start: { dateTime: callback.proposedStart, timeZone: config.timeZone },
    end: { dateTime: callback.proposedEnd, timeZone: config.timeZone },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: Math.max(0, config.reminderMinutes) }] },
    extendedProperties: { private: {
      coveragefitConversationId: cleanLine(conversation.id, 100),
      coveragefitRequestId: cleanLine(conversation.callbackSequence?.id, 64),
      coveragefitBuild: cleanLine(conversation.callbackSequence?.build, 100) || SMS_CALLBACK_BUILD
    } }
  };
}

function calendarToken() {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function writePublicCalendarRecord(store, conversation, callback, options = {}) {
  const config = options.config || callbackConfig(options.env || {});
  const token = callback.calendarToken || calendarToken();
  const expiresAt = new Date(Date.parse(callback.proposedEnd) + 30 * 86400000).toISOString();
  const record = {
    schemaVersion: '1.0', build: SMS_CALLBACK_BUILD, token, status: 'scheduled',
    title: 'Call with Dylan — Virginia Tam Insurance Agency', start: callback.proposedStart, end: callback.proposedEnd,
    timeZone: config.timeZone, display: callback.proposedDisplay, agencyPhone: '(408) 327-6377', reminderMinutes: config.reminderMinutes,
    preparationBySms: Boolean(conversation.callbackPreparation?.available),
    uid: `coveragefit-${token}@review.408farmers.com`, createdAt: nowDate(options).toISOString(), updatedAt: nowDate(options).toISOString(), expiresAt
  };
  await store.setJSON(`${CALLBACK_CALENDAR_PREFIX}${token}`, record, { metadata: { status: 'scheduled', createdAt: record.createdAt, updatedAt: record.updatedAt, expiresAt } });
  const origin = cleanLine(options.origin, 300).replace(/\/$/, '');
  return { token, url: `${origin}/appointment/?token=${encodeURIComponent(token)}`, record };
}

function bookingFailure(message, status = 422, code = 'callback_booking_failed') {
  const failure = new Error(message);
  failure.status = status;
  failure.code = code;
  return failure;
}

function browserSlot(slot, timeZone) {
  const local = zonedParts(new Date(slot.start), timeZone);
  return {
    date: `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`,
    time: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    display: slot.display
  };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function webSlotEventId(start, end, calendarId) {
  return `cf${(await sha256Hex(`coveragefit-web-slot-v1|${calendarId}|${start}|${end}`)).slice(0, 62)}`;
}

async function webCalendarToken(requestId, calendarId) {
  return `cb_${await sha256Hex(`coveragefit-web-appointment-v1|${calendarId}|${requestId}`)}`;
}

function eventOwner(event) {
  return cleanLine(event?.extendedProperties?.private?.coveragefitRequestId, 64).toLowerCase();
}

async function unavailableWebBooking(store, key, lock, parsed, options, config) {
  const alternatives = await googleCalendarAlternativeSlots(parsed.start, { ...options, config }).catch(() => []);
  const unavailable = {
    ...lock,
    status:'unavailable',
    alternatives:alternatives.map(slot => browserSlot(slot, config.timeZone)),
    updatedAt:nowDate(options).toISOString()
  };
  await store.setJSON(key, unavailable, { metadata:{ status:'unavailable', createdAt:lock.createdAt, updatedAt:unavailable.updatedAt } });
  return { idempotent:false, available:false, alternatives:unavailable.alternatives };
}

async function finalizeWebBooking({ store, key, lock, requestId, conversation, callback, eventResult, eventId, options, config, idempotent }) {
  callback.googleEventId = text(eventResult?.event?.id, eventId);
  callback.googleEventUrl = text(eventResult?.event?.htmlLink);
  callback.scheduledAt = nowDate(options).toISOString();
  callback.updatedAt = callback.scheduledAt;
  callback.calendarToken = await webCalendarToken(requestId, config.calendarId);
  const publicCalendar = await writePublicCalendarRecord(store, conversation, callback, { ...options, config });
  callback.calendarUrl = publicCalendar.url;
  const booking = {
    ...lock,
    status:'scheduled',
    slotEventId:eventId,
    googleEventId:callback.googleEventId,
    googleEventUrl:callback.googleEventUrl,
    scheduledStart:callback.proposedStart,
    scheduledEnd:callback.proposedEnd,
    scheduledDisplay:callback.proposedDisplay,
    calendarToken:publicCalendar.token,
    calendarUrl:publicCalendar.url,
    scheduledAt:callback.scheduledAt,
    updatedAt:callback.updatedAt
  };
  await store.setJSON(key, booking, { metadata:{ status:'scheduled', createdAt:lock.createdAt, updatedAt:booking.updatedAt, calendarToken:publicCalendar.token } });
  if(options.db)await projectSoloDeskEventBestEffort({db:options.db,env:options.env||{}},{kind:'booking',record:booking});
  return { idempotent:idempotent === true, available:true, booking, calendarUrl:publicCalendar.url };
}

export async function bookCallbackWebAppointment(input = {}, options = {}) {
  const store = options.store;
  if (!store?.get || !store?.setJSON) throw bookingFailure('Callback booking storage is unavailable.', 503, 'storage_unavailable');
  const requestId = cleanLine(input.requestId, 64).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw bookingFailure('A valid booking request is required.', 422, 'invalid_request_id');
  const phone = normalizeE164(input.phone || input.mobile);
  if (!phone) throw bookingFailure('A valid callback number is required.', 422, 'invalid_callback_number');
  const firstName = cleanLine(input.firstName, 60).replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, '');
  const productType = safeProduct(input.productType);
  const correlationId = cleanLine(input.correlationId, 120);
  const source = cleanLine(input.source, 80) || 'web_callback';
  const date = cleanLine(input.date, 10);
  const time = cleanLine(input.time, 5);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw bookingFailure('Choose a valid callback date and time.', 422, 'invalid_callback_time');
  const config = callbackConfig(options.env || {});
  const parsed = parseCallbackDateTime(`${date} at ${time}`, { ...options, config });
  if (!parsed.ok) throw bookingFailure('Choose a weekday callback time within Dylan’s available hours and scheduling window.', 422, `callback_time_${parsed.reason}`);

  const key = `${CALLBACK_WEB_BOOKING_PREFIX}${requestId}`;
  const existing = await store.get(key);
  if (existing?.status === 'scheduled' && existing.calendarUrl) {
    return { idempotent:true, available:true, booking:existing, calendarUrl:existing.calendarUrl };
  }
  const at = nowDate(options).toISOString();
  const lock = {
    schemaVersion:'1.1', build:CALLBACK_WEB_BOOKING_RUNTIME_BUILD, status:'processing', requestId, correlationId, productType, source,
    requestedStart:parsed.start, requestedEnd:parsed.end, requestedDisplay:parsed.display,
    callRequest:{
      granted:true,
      version:cleanLine(input.callRequestVersion, 100),
      capturedAt:cleanLine(input.callRequestTimestamp, 40),
      clientCapturedAt:cleanLine(input.callRequestClientTimestamp, 40),
      relayAuthenticatedAt:cleanLine(input.relayAuthenticatedTimestamp, 40),
      evidenceSource:cleanLine(input.callRequestEvidenceSource, 60) || 'server_received',
      purpose:'scheduled_callback'
    },
    createdAt:existing?.createdAt || at, updatedAt:at
  };

  const conversation = {
    id:`web-callback-${requestId.replace(/-/g, '')}`,
    contactPhone:phone,
    callbackSequence:{ id:requestId, build:CALLBACK_WEB_BOOKING_RUNTIME_BUILD, firstName, productType, correlationId, source }
  };
  const callback = { status:'scheduled', productType, proposedStart:parsed.start, proposedEnd:parsed.end, proposedDisplay:parsed.display };
  const deterministicEventId = await webSlotEventId(parsed.start, parsed.end, config.calendarId);

  if (existing) {
    let recovered;
    try { recovered = await googleEvent('GET', deterministicEventId, null, { ...options, config }); }
    catch (_) { throw bookingFailure('The existing callback could not be verified right now. Please try again.', 503, 'calendar_recovery_unavailable'); }
    if (recovered?.event) {
      if (eventOwner(recovered.event) !== requestId) return unavailableWebBooking(store, key, lock, parsed, options, config);
      return finalizeWebBooking({ store, key, lock, requestId, conversation, callback, eventResult:recovered, eventId:deterministicEventId, options, config, idempotent:true });
    }
    if (existing.status === 'processing' && nowDate(options).getTime() - Date.parse(existing.updatedAt || existing.createdAt) < 2 * 60 * 1000) {
      throw bookingFailure('This callback time is already being confirmed. Please try again.', 409, 'booking_in_progress');
    }
  }

  try {
    await store.setJSON(key, lock, { ...(existing ? {} : { onlyIfNew:true }), metadata:{ status:'processing', createdAt:lock.createdAt, updatedAt:at } });
  } catch (_) {
    const raced = await store.get(key);
    if (raced?.status === 'scheduled' && raced.calendarUrl) return { idempotent:true, available:true, booking:raced, calendarUrl:raced.calendarUrl };
    throw bookingFailure('This callback time is already being confirmed. Please try again.', 409, 'booking_in_progress');
  }

  let availability;
  try { availability = await googleCalendarAvailability(parsed.start, parsed.end, { ...options, config }); }
  catch (_) {
    await store.setJSON(key, { ...lock, status:'failed', updatedAt:nowDate(options).toISOString() }, { metadata:{ status:'failed', createdAt:lock.createdAt, updatedAt:nowDate(options).toISOString() } }).catch(() => {});
    throw bookingFailure('Dylan’s calendar could not be checked right now. Please try again.', 503, 'calendar_unavailable');
  }
  if (!availability.configured) {
    await store.setJSON(key, { ...lock, status:'failed', updatedAt:nowDate(options).toISOString() }, { metadata:{ status:'failed', createdAt:lock.createdAt, updatedAt:nowDate(options).toISOString() } }).catch(() => {});
    throw bookingFailure('Callback booking is not configured yet.', 503, 'calendar_not_configured');
  }
  if (!availability.available) {
    return unavailableWebBooking(store, key, lock, parsed, options, config);
  }

  const eventBody = googleEventBody(conversation, callback, config);
  eventBody.id = deterministicEventId;
  let eventResult;
  let recoveredAfterCreate = false;
  try {
    eventResult = await googleEvent('POST', '', eventBody, { ...options, config });
  } catch (createError) {
    eventResult = await googleEvent('GET', deterministicEventId, null, { ...options, config }).catch(() => { throw createError; });
    if (!eventResult?.event) throw createError;
    if (eventOwner(eventResult.event) !== requestId) return unavailableWebBooking(store, key, lock, parsed, options, config);
    recoveredAfterCreate = true;
  }
  return finalizeWebBooking({ store, key, lock, requestId, conversation, callback, eventResult, eventId:deterministicEventId, options, config, idempotent:recoveredAfterCreate });
}

async function stopSequence(store, conversation, outcome, options = {}) {
  const id = text(conversation.callbackSequence?.id || conversation.callbackScheduling?.sequenceId);
  if (!id || !store?.get || !store?.setJSON) return;
  const key = `${CALLBACK_SEQUENCE_PREFIX}${id}`;
  const record = await store.get(key);
  if (!record || TERMINAL_SEQUENCE.has(record.status)) return;
  const at = nowDate(options).toISOString();
  record.status = outcome;
  record.updatedAt = at;
  record.completedAt = at;
  record.nextSendAt = '';
  await store.setJSON(key, record, { metadata: { status: record.status, conversationId: record.conversationId || '', createdAt: record.createdAt || at, updatedAt: at } });
}

export async function markCallbackSequenceReplied(conversation, body, options = {}) {
  const command = cleanLine(body, 100).toUpperCase();
  const outcome = command === 'STOP' ? 'opted_out' : command === 'TEXT' ? 'text_requested' : command === 'EMAIL' ? 'email_requested' : 'engaged';
  await stopSequence(options.store, conversation, outcome, options);
}

export async function handleCallbackInbound(conversation = {}, body, options = {}) {
  const result = await handleCallbackTurn(conversation, body, options);
  if (result.handled && result.reply && !result.conversation.callbackScheduling?.assistantIntroducedAt) {
    result.reply = `I’m Dylan’s automated scheduling assistant. ${result.reply}`;
    result.conversation = {...result.conversation, callbackScheduling: {...result.conversation.callbackScheduling, assistantIntroducedAt: nowDate(options).toISOString()}};
  }
  return result;
}

async function handleCallbackTurn(conversation = {}, body, options = {}) {
  if (!shouldHandleCallbackInbound(conversation, body, options)) return { handled: false, conversation };
  const config = options.config || callbackConfig(options.env || {});
  const at = nowDate(options).toISOString();
  const command = callbackCommand(body);
  // During preparation, dates answer the timing question unless the customer
  // explicitly asks to change/cancel their appointment.
  const naturalChange = /\b(?:reschedule|change (?:my |the )?(?:time|appointment|call)|cancel (?:my |the )?(?:appointment|call))\b/i.test(body);
  if (conversation.callbackScheduling?.status === 'scheduled' && /\b(?:when|what (?:day|time))\b.*\b(?:appointment|call|booked|scheduled)\b/i.test(body)) return handleCallbackInbound(conversation, 'status', options);
  if (!command && !naturalChange) {
    const preparation = handlePreparation(conversation, body, at);
    if (preparation) return preparation;
  }
  if (naturalChange && !command) return handleCallbackInbound({...conversation, callbackPreparation: {...conversation.callbackPreparation, status: 'paused'}}, /\bcancel\b/i.test(body) ? 'cancel' : 'change', options);
  let callback = conversation.callbackScheduling && typeof conversation.callbackScheduling === 'object'
    ? { ...conversation.callbackScheduling }
    : { schemaVersion: '1.0', build: SMS_CALLBACK_BUILD, status: 'callback_requested', createdAt: at, sequenceId: text(conversation.callbackSequence?.id), productType: safeProduct(conversation.callbackSequence?.productType) };
  await stopSequence(options.store, conversation, command === 'cancel' ? 'cancelled' : 'engaged', options);

  if (command === 'call_now') {
    callback = {
      ...callback,
      status: 'call_now_requested',
      requestedAt: at,
      requestedRaw: cleanLine(body, 300),
      proposedStart: '',
      proposedEnd: '',
      proposedDisplay: '',
      pendingDay: null,
      pendingTime: null,
      updatedAt: at
    };
    return {
      handled: true,
      contactChoice: 'now',
      conversation: {
        ...conversation,
        callbackScheduling: callback,
        answers: {
          ...(conversation.answers && typeof conversation.answers === 'object' ? conversation.answers : {}),
          callNowRequested: true,
          callNowRequestedAt: at
        }
      },
      reply: 'Got it—I’ve let Dylan know you’re available now. He may call shortly. If he can’t reach you right away, he’ll text you to arrange another time.'
    };
  }

  if (command === 'anytime') {
    callback = {
      ...callback,
      status: 'call_anytime_requested',
      requestedAt: at,
      proposedStart: '',
      proposedEnd: '',
      proposedDisplay: '',
      pendingDay: null,
      pendingTime: null,
      updatedAt: at
    };
    return {
      handled: true,
      contactChoice: 'anytime',
      conversation: {
        ...conversation,
        callbackScheduling: callback,
        answers: {
          ...(conversation.answers && typeof conversation.answers === 'object' ? conversation.answers : {}),
          callAnytimeRequested: true,
          callAnytimeRequestedAt: at
        }
      },
      reply: 'Thanks—Dylan may call you at this number when he is available. If you would rather choose a specific time, reply CALLBACK.'
    };
  }

  if (command === 'cancel') {
    if (callback.googleEventId) await googleEvent('DELETE', callback.googleEventId, null, { ...options, config }).catch(() => {});
    callback = { ...callback, status: 'cancelled', cancelledAt: at, updatedAt: at };
    return { handled: true, conversation: { ...conversation, callbackScheduling: callback }, reply: 'Your callback has been cancelled. If you want to schedule again later, reply CALLBACK.' };
  }
  if (command === 'status') {
    const reply = callback.status === 'scheduled' && callback.proposedDisplay
      ? `You’re scheduled for ${callback.proposedDisplay}. I’ll call you at this number.`
      : 'You do not currently have a confirmed callback. Reply with the best day and time for a quick call.';
    return { handled: true, conversation: { ...conversation, callbackScheduling: { ...callback, updatedAt: at } }, reply };
  }
  if (command === 'change') {
    callback = { ...callback, status: 'callback_requested', proposedStart: '', proposedEnd: '', proposedDisplay: '', pendingDay: null, pendingTime: null, updatedAt: at };
    return { handled: true, conversation: { ...conversation, callbackScheduling: callback }, reply: 'No problem. What day and time would work better for you?' };
  }
  if (command === 'callback' || (command === 'yes' && !callback.proposedStart)) {
    callback = { ...callback, status: 'callback_requested', pendingDay: null, pendingTime: null, updatedAt: at };
    return { handled: true, conversation: { ...conversation, callbackScheduling: callback }, reply: 'What’s the best day and time for a quick call? You can reply “tomorrow at 3” or “Friday morning.”' };
  }
  if (command === 'yes') {
    if (callback.status === 'scheduled') return {handled: true, conversation, reply: `You’re already booked for ${callback.proposedDisplay}. Reply READY for optional preparation or CHANGE to choose another time.`};
    if (!callback.proposedStart || !callback.proposedEnd) return { handled: true, conversation, reply: 'What day and time would work best for a quick call?' };
    const availability = await googleCalendarAvailability(callback.proposedStart, callback.proposedEnd, { ...options, config }).catch(cause => ({ configured: true, available: false, error: cause }));
    if (!availability.configured || availability.error) {
      callback = { ...callback, status: 'producer_confirmation_needed', updatedAt: at };
      return { handled: true, conversation: { ...conversation, callbackScheduling: callback }, reply: `I have your requested time as ${callback.proposedDisplay}. Dylan needs to confirm the calendar and will text you shortly.` };
    }
    if (!availability.available) {
      const alternativeSlots = await googleCalendarAlternativeSlots(callback.proposedStart, { ...options, config }).catch(() => []);
      callback = { ...callback, status: 'callback_requested', proposedStart: '', proposedEnd: '', proposedDisplay: '', updatedAt: at };
      callback.alternativeSlots = alternativeSlots;
      const alternatives = alternativeSlots.length === 2
        ? ` Reply 1 for ${alternativeSlots[0].display} or 2 for ${alternativeSlots[1].display}.`
        : ' What other day and time would work for you?';
      return { handled: true, conversation: { ...conversation, callbackScheduling: callback }, reply: `That time was just taken.${alternatives}` };
    }
    const eventBody = googleEventBody(conversation, callback, config);
    let eventResult;
    try {
      eventResult = callback.googleEventId
        ? await googleEvent('PATCH', callback.googleEventId, eventBody, { ...options, config })
        : await googleEvent('POST', '', eventBody, { ...options, config });
      if (!eventResult.event?.id) throw new Error('Calendar event identity missing');
    } catch (_) {
      callback = {...callback, status: 'producer_confirmation_needed', updatedAt: at};
      return {handled: true, conversation: {...conversation, callbackScheduling: callback}, reply: `Your requested time is ${callback.proposedDisplay}. The calendar could not confirm the booking. Dylan will need to verify it and text you.`};
    }
    const scheduledAt = nowDate(options).toISOString();
    callback = { ...callback, status: 'scheduled', googleEventId: text(eventResult.event?.id), googleEventUrl: text(eventResult.event?.htmlLink), scheduledAt, updatedAt: scheduledAt };
    conversation = {...conversation, callbackPreparation: {...conversation.callbackPreparation, available: true}};
    const publicCalendar = await writePublicCalendarRecord(options.store, conversation, callback, { ...options, config });
    callback.calendarToken = publicCalendar.token;
    callback.calendarUrl = publicCalendar.url;
    await stopSequence(options.store, { ...conversation, callbackScheduling: callback }, 'scheduled', options);
    return {
      handled: true,
      conversation: { ...conversation, state: 'human_takeover', callbackScheduling: callback },
      followupReply: preparationInvitation({...conversation, callbackScheduling: callback}),
      reply: `Perfect—you’re set for ${callback.proposedDisplay}. Dylan will call you at this number. Add it to your calendar: ${publicCalendar.url} Reply CHANGE to reschedule or CANCEL to cancel.`
    };
  }

  const alternativeChoice = /^(1|2)$/.exec(cleanLine(body, 20));
  if (/\b(?:not|can't|cannot|cant|maybe|possibly|after|before|between|around|about|or)\b|\d\s*[-–]\s*\d/i.test(body)) {
    return {handled: true, conversation: {...conversation, callbackScheduling: callback}, reply: 'What exact day and time should I book for your call? If you already chose a day, just send the time—for example, “2 PM.”'};
  }
  const selectedAlternative = alternativeChoice ? callback.alternativeSlots?.[Number(alternativeChoice[1]) - 1] : null;
  const parsed = selectedAlternative
    ? { ok: true, raw: cleanLine(body, 20), start: selectedAlternative.start, end: selectedAlternative.end, display: selectedAlternative.display, timeZone: config.timeZone }
    : parseCallbackTurn(body, callback, { ...options, config });
  if (!parsed.ok) {
    const messages = {
      missing_day_and_time: 'What day and time would work best for a quick call? You can reply “tomorrow at 3” or “Friday morning.”',
      missing_day: 'What day would work best for that time?',
      missing_time: 'What time would work best that day?',
      vague_time: `${parsed.day?.source ? `${parsed.day.source[0].toUpperCase()}${parsed.day.source.slice(1)}` : 'That day'} works. What specific time is best for you?`,
      too_soon: 'That time is too close to confirm automatically. What later time would work for you?',
      too_far: 'Please choose a callback time within the next 60 days.',
      outside_hours: 'That time is outside Dylan’s normal callback hours. What weekday time between 9:00 AM and 6:00 PM works best?',
      invalid_local_time: 'That time falls during a clock change. Please choose another time.'
    };
    const retainsPartial = ['missing_day', 'missing_time', 'vague_time', 'missing_day_and_time'].includes(parsed.reason);
    callback = {
      ...callback,
      status: 'clarification_needed',
      requestedRaw: cleanLine(body, 300),
      pendingDay: retainsPartial && parsed.day ? { year: parsed.day.year, month: parsed.day.month, day: parsed.day.day, source: parsed.day.source || '' } : retainsPartial ? callback.pendingDay || null : null,
      pendingTime: retainsPartial && parsed.time ? { hour: parsed.time.hour, minute: parsed.time.minute } : retainsPartial ? callback.pendingTime || null : null,
      pendingPeriod: retainsPartial ? (parsed.day ? parsed.period || '' : callback.pendingPeriod || '') : '',
      updatedAt: at
    };
    const contextualPrompt = parsed.reason === 'missing_day_and_time' && callback.pendingDay
      ? 'I still have your selected day. What time works best? You can reply “10 AM” or “2 PM.”' : '';
    return { handled: true, conversation: { ...conversation, callbackScheduling: callback }, reply: contextualPrompt || messages[parsed.reason] || 'I could not confirm that day and time. Please reply with something like “tomorrow at 3 PM.”' };
  }
  if (callback.status === 'scheduled' && Date.parse(callback.proposedStart) === Date.parse(parsed.start)) return {handled:true, conversation, reply:`You’re already booked for ${callback.proposedDisplay}. Dylan will call you at this number. Reply CHANGE to reschedule or CANCEL to cancel.`};
  const availability = await googleCalendarAvailability(parsed.start, parsed.end, { ...options, config }).catch(cause => ({ configured: true, available: false, error: cause }));
  callback = { ...callback, requestedRaw: parsed.raw, proposedStart: parsed.start, proposedEnd: parsed.end, proposedDisplay: parsed.display, pendingDay: null, pendingTime: null, updatedAt: at };
  if (!availability.configured || availability.error) {
    callback.status = 'producer_confirmation_needed';
    return { handled: true, conversation: { ...conversation, callbackScheduling: callback }, reply: `I have ${parsed.display}. Dylan needs to confirm availability and will text you shortly.` };
  }
  if (!availability.available) {
    const alternativeSlots = await googleCalendarAlternativeSlots(parsed.start, { ...options, config }).catch(() => []);
    callback.status = 'callback_requested';
    callback.proposedStart = '';
    callback.proposedEnd = '';
    callback.proposedDisplay = '';
    callback.alternativeSlots = alternativeSlots;
    const alternatives = alternativeSlots.length === 2
      ? ` Reply 1 for ${alternativeSlots[0].display} or 2 for ${alternativeSlots[1].display}.`
      : ' What other day and time would work for you?';
    return { handled: true, conversation: { ...conversation, callbackScheduling: callback }, reply: `Dylan is already scheduled at that time.${alternatives}` };
  }
  callback.status = 'prospect_confirmation';
  callback.alternativeSlots = [];
  return handleCallbackTurn({...conversation, callbackScheduling: callback}, 'YES', options);
}

function firstMessage({ firstName, callAttempted, customerInitiated }) {
  const greeting = firstName ? `Hi ${firstName}, ` : 'Hi, ';
  const opening = customerInitiated
    ? 'You asked to choose a time for a quick call about your insurance request.'
    : (callAttempted ? 'I just tried calling about the insurance request you sent in.' : 'I’m following up on the insurance request you sent in.');
  return `${greeting}this is Dylan from Virginia Tam’s Farmers Insurance office. ${opening} What day and time works best for a quick 10-minute call to go over what you need and see which options make sense? You can reply “tomorrow at 3” or “Friday morning.” Reply STOP to opt out.`;
}

const FOLLOW_UPS = Object.freeze([
  '',
  'Just following up on the insurance request you sent in. What day and time would be easiest for a quick call? Send me a day and time, and I’ll confirm it.',
  'I’d still be happy to help with your insurance request. Is there a good time for a quick call this week? If a call is hard to fit in, reply TEXT or EMAIL and we can continue that way.',
  'I’m going to close your request for now. If you’d still like help, reply with a good time to call, TEXT, or EMAIL, and I’ll pick it back up.'
]);
const FOLLOW_UP_DELAYS_DAYS = Object.freeze([0, 2, 5, 10]);

function addDaysIso(source, days) { return new Date(Date.parse(source) + days * 86400000).toISOString(); }

export async function startCallbackSequence(input = {}, options = {}) {
  const store = options.store;
  if (!store?.get || !store?.setJSON) throw new Error('Callback sequence storage is unavailable.');
  const phone = normalizeE164(input.phone || input.mobile);
  if (!phone) throw new TypeError('A valid prospect mobile number is required.');
  const firstName = cleanLine(input.firstName, 60).replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, '');
  const productType = safeProduct(input.productType);
  const callAttempted = input.callAttempted === true;
  const customerInitiated = input.customerInitiated === true;
  const correlationId = cleanLine(input.correlationId, 120);
  const source = cleanLine(input.source, 80);
  const config = callbackConfig(options.env || {});
  const businessNumber = normalizeE164(options.env?.RINGCENTRAL_FROM_NUMBER);
  if (!businessNumber) throw new Error('The RingCentral sending number is not configured.');
  const conversationId = await smsLiveConversationId(phone, businessNumber, options.env?.RINGCENTRAL_CONVERSATION_HASH_SECRET);
  const requestedSequenceId = cleanLine(input.sequenceId, 64);
  const sequenceId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedSequenceId)
    ? requestedSequenceId
    : crypto.randomUUID();
  const existingSequence = await store.get(`${CALLBACK_SEQUENCE_PREFIX}${sequenceId}`);
  if (existingSequence) return { sequence: existingSequence, conversationId: existingSequence.conversationId || conversationId, sent: { idempotent: true } };
  const conversationKey = `sms-live-conversations/${conversationId}`;
  const existingConversation = await store.get(conversationKey);
  if (existingConversation && !smsPermissionSnapshot(existingConversation).allowed) {
    const suppressed = new Error('This SMS relationship is suppressed.');
    suppressed.status = 409;
    suppressed.code = 'sms_channel_suppressed';
    throw suppressed;
  }
  const createdAt = nowDate(options).toISOString();
  const message = firstMessage({ firstName, callAttempted, customerInitiated });
  const sent = await sendSmsThroughGateway({
    to: phone, message, origin: 'producer_console', workflow: CALLBACK_WORKFLOW, replyRoute: 'appointment', ownershipEffect: 'transfer', ownershipTarget: 'appointment',
    replyContext: 'callback_time_request', replyContextTtlSeconds: 7 * 86400, idempotencyKey: `callback:${sequenceId}:0`
  }, { ...options, store });
  const conversation = await store.get(conversationKey) || {};
  conversation.callbackSequence = { id: sequenceId, build: SMS_CALLBACK_BUILD, status: 'active', firstName, productType, callAttempted, customerInitiated, correlationId, source, startedAt: createdAt, currentStep: 0, updatedAt: createdAt };
  conversation.callbackScheduling = { schemaVersion: '1.0', build: SMS_CALLBACK_BUILD, status: 'callback_requested', sequenceId, productType, correlationId, source, createdAt, updatedAt: createdAt };
  await store.setJSON(conversationKey, conversation, { metadata: { status: 'active', conversationId, workflow: CALLBACK_WORKFLOW, createdAt: conversation.createdAt || createdAt, updatedAt: createdAt } });
  const sequence = { schemaVersion: '1.0', build: SMS_CALLBACK_BUILD, id: sequenceId, conversationId, contactPhone: phone, firstName, productType, callAttempted, customerInitiated, correlationId, source, status: 'active', currentStep: 0, sentSteps: [0], providerMessageIds: [text(sent.providerMessageId)], createdAt, updatedAt: createdAt, nextSendAt: addDaysIso(createdAt, FOLLOW_UP_DELAYS_DAYS[1]), expiresAt: addDaysIso(createdAt, CALLBACK_OFFER_DAYS) };
  await store.setJSON(`${CALLBACK_SEQUENCE_PREFIX}${sequenceId}`, sequence, { metadata: { status: 'active', conversationId, currentStep: 0, createdAt, updatedAt: createdAt, expiresAt: sequence.expiresAt } });
  return { sequence, conversationId, sent };
}

export async function processDueCallbackSequences(options = {}) {
  const store = options.store;
  if (!store?.list || !store?.get || !store?.setJSON) throw new Error('Callback sequence storage is unavailable.');
  const now = nowDate(options);
  const listed = await store.list({ prefix: CALLBACK_SEQUENCE_PREFIX, limit: 500 });
  const results = [];
  for (const item of listed.blobs || []) {
    const sequence = await store.get(item.key);
    if (!sequence || sequence.status !== 'active') continue;
    if (Date.parse(sequence.expiresAt) <= now.getTime()) {
      sequence.status = 'expired'; sequence.nextSendAt = ''; sequence.updatedAt = now.toISOString();
      await store.setJSON(item.key, sequence, { metadata: { status: 'expired', conversationId: sequence.conversationId, createdAt: sequence.createdAt, updatedAt: sequence.updatedAt } });
      results.push({ id: sequence.id, status: 'expired' });
      continue;
    }
    if (Date.parse(sequence.nextSendAt) > now.getTime()) continue;
    const conversationKey = `sms-live-conversations/${sequence.conversationId}`;
    const conversation = await store.get(conversationKey);
    if (!conversation || !smsPermissionSnapshot(conversation).allowed || (conversation.lastInboundAt && Date.parse(conversation.lastInboundAt) >= Date.parse(sequence.createdAt))) {
      sequence.status = !conversation || smsPermissionSnapshot(conversation).allowed ? 'engaged' : 'opted_out';
      sequence.nextSendAt = ''; sequence.updatedAt = now.toISOString();
      await store.setJSON(item.key, sequence, { metadata: { status: sequence.status, conversationId: sequence.conversationId, createdAt: sequence.createdAt, updatedAt: sequence.updatedAt } });
      results.push({ id: sequence.id, status: sequence.status });
      continue;
    }
    const step = Math.min(3, Number(sequence.currentStep) + 1);
    const greeting = sequence.firstName ? `Hi ${sequence.firstName}, ` : 'Hi, ';
    const message = `${greeting}${FOLLOW_UPS[step]}`;
    try {
      const sent = await sendSmsThroughGateway({
        to: sequence.contactPhone, message, origin: 'campaign', workflow: CALLBACK_WORKFLOW, replyRoute: 'appointment', ownershipEffect: 'transfer', ownershipTarget: 'appointment',
        replyContext: 'callback_time_request', replyContextTtlSeconds: 7 * 86400, idempotencyKey: `callback:${sequence.id}:${step}`
      }, { ...options, store });
      sequence.currentStep = step;
      sequence.sentSteps = [...new Set([...(sequence.sentSteps || []), step])];
      sequence.providerMessageIds = [...(sequence.providerMessageIds || []), text(sent.providerMessageId)].filter(Boolean).slice(-10);
      sequence.updatedAt = now.toISOString();
      sequence.status = step >= 3 ? 'completed' : 'active';
      sequence.nextSendAt = step >= 3 ? '' : addDaysIso(sequence.createdAt, FOLLOW_UP_DELAYS_DAYS[step + 1]);
      await store.setJSON(item.key, sequence, { metadata: { status: sequence.status, conversationId: sequence.conversationId, currentStep: step, createdAt: sequence.createdAt, updatedAt: sequence.updatedAt, expiresAt: sequence.expiresAt } });
      results.push({ id: sequence.id, status: sequence.status, step, sent: true });
    } catch (cause) {
      sequence.lastError = cleanLine(cause?.message, 160);
      sequence.updatedAt = now.toISOString();
      await store.setJSON(item.key, sequence, { metadata: { status: 'active', conversationId: sequence.conversationId, currentStep: sequence.currentStep, createdAt: sequence.createdAt, updatedAt: sequence.updatedAt, expiresAt: sequence.expiresAt } });
      results.push({ id: sequence.id, status: 'failed', step, sent: false });
    }
  }
  return { processed: results.length, sent: results.filter(item => item.sent).length, results };
}

async function requestBody(request) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > CALLBACK_MAX_BODY_BYTES) return { response: error(413, 'payload_too_large', 'Callback request is too large.') };
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return { response: error(415, 'unsupported_media_type', 'Expected application/json.') };
  try { return { payload: await request.json() }; } catch (_) { return { response: error(400, 'invalid_json', 'A valid callback request is required.') }; }
}

export async function handleSmsCallbackAdmin(request, options = {}) {
  const authorization = authorizeProducer(request, options.env || {});
  if (!authorization.ok) return authorization.response;
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'Callback changes must originate from this CoverageFit site.');
  const parsed = await requestBody(request);
  if (parsed.response) return parsed.response;
  try {
    const action = text(parsed.payload?.action).toLowerCase();
    if (action !== 'start_sequence') return error(422, 'invalid_action', 'Unsupported callback action.');
    const result = await startCallbackSequence(parsed.payload, { ...options, origin: new URL(request.url).origin });
    return json({ ok: true, build: SMS_CALLBACK_BUILD, sequence: { id: result.sequence.id, status: result.sequence.status, conversationId: result.conversationId, nextSendAt: result.sequence.nextSendAt } }, 201);
  } catch (cause) {
    return error(Number(cause?.status) || 422, text(cause?.code, 'callback_start_failed'), cleanLine(cause?.message, 240) || 'The callback sequence could not be started.');
  }
}

export async function handleSmsCallbackCron(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  const config = callbackConfig(options.env || {});
  const supplied = text(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
  if (!config.cronSecret || !timingSafeTextEqual(supplied, config.cronSecret)) return error(401, 'unauthorized', 'Callback scheduler authorization is required.');
  try { return json({ ok: true, build: SMS_CALLBACK_BUILD, ...(await processDueCallbackSequences(options)) }); }
  catch (cause) { return error(503, 'callback_scheduler_failed', cleanLine(cause?.message, 240) || 'The callback scheduler could not run.'); }
}

function escapeIcs(value) { return text(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsStamp(value) { return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
export function callbackCalendarIcs(record = {}) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CoverageFit//Callback Scheduler//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${escapeIcs(record.uid)}`, `DTSTAMP:${icsStamp(record.updatedAt || record.createdAt || new Date().toISOString())}`,
    `DTSTART:${icsStamp(record.start)}`, `DTEND:${icsStamp(record.end)}`, `SUMMARY:${escapeIcs(record.title)}`,
    `DESCRIPTION:${escapeIcs([`Dylan will call you at the scheduled time. Virginia Tam Insurance Agency, Inc. · (408) 327-6377 · CA License #4528400`, record.preparationText || '', record.reviewUrl || ''].filter(Boolean).join('\n'))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${Math.max(0, Number(record.reminderMinutes) || 30)}M`, 'DESCRIPTION:Upcoming call with Dylan', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', ''
  ].join('\r\n');
}

// CF-RECOMMEND-1.0: narrow adapters preserve the existing callback entry contracts.
export async function recommendationCalendarSlots(date, options = {}) {
  const config=callbackConfig(options.env || {}), candidates=[];
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(String(date || ''))) return {slots:[],timeZone:config.timeZone,message:'Choose a date.'};
  for(let minute=config.startHour*60;minute<config.endHour*60;minute+=30) {
    const time=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
    const parsed=parseCallbackDateTime(`${date} at ${time}`,{...options,config});
    if(parsed.ok)candidates.push({...parsed,date,time});
  }
  if(!candidates.length)return {slots:[],timeZone:config.timeZone,message:'Choose another weekday within the scheduling window.'};
  const availability=await googleCalendarAvailability(candidates[0].start,candidates.at(-1).end,{...options,config});
  if(!availability.configured)throw bookingFailure('Booking is temporarily unavailable. Your request to proceed is still saved.',503,'calendar_unavailable');
  const slots=candidates.filter(slot=>!(availability.busy || []).some(b=>Date.parse(b.start)<Date.parse(slot.end)&&Date.parse(b.end)>Date.parse(slot.start))).map(({date,time,display})=>({date,time,display}));
  return {slots,timeZone:config.timeZone,message:slots.length?'':'No available times on this date. Choose another date or contact Dylan.'};
}

export async function recommendationCalendarDetails(appointment, details, options = {}) {
  const existing=await googleEvent('GET',appointment.googleEventId,null,options);
  if(!existing.configured || !existing.event)throw bookingFailure('The appointment could not be verified.',503,'calendar_unavailable');
  if(appointment.requestId && eventOwner(existing.event)!==appointment.requestId)throw bookingFailure('The appointment could not be verified.',409,'appointment_owner');
  const preparationText=[details.nextSteps,(details.checklist || []).length?`Please have ready: ${details.checklist.join('; ')}`:'Nothing additional needs preparing.'].filter(Boolean).join('\n');
  await googleEvent('PATCH',appointment.googleEventId,{status:details.pendingChange?'tentative':'confirmed',summary:`${details.pendingChange?'Pending change · ':''}${String(existing.event.summary || 'Call with Dylan').replace(/^Pending change · /,'')}`,description:[String(existing.event.description || '').split('\nCoverageFit recommendation:')[0],`CoverageFit recommendation: ${details.reviewUrl}`,preparationText].join('\n')},options);
  const key=`${CALLBACK_CALENDAR_PREFIX}${appointment.calendarToken}`,record=await options.store.get(key);
  if(record)await options.store.setJSON(key,{...record,preparationText,reviewUrl:details.reviewUrl,updatedAt:nowDate(options).toISOString()},{metadata:{status:record.status,createdAt:record.createdAt,updatedAt:nowDate(options).toISOString(),expiresAt:record.expiresAt}});
}

export async function recommendationCalendarRemove(appointment, options = {}) {
  const found=await googleEvent('GET',appointment.googleEventId,null,options);
  if(!found.configured)throw bookingFailure('The calendar is unavailable.',503,'calendar_unavailable');
  if(found.event && appointment.requestId && eventOwner(found.event)!==appointment.requestId)throw bookingFailure('The appointment could not be verified.',409,'appointment_owner');
  if(found.event) {
    try{await googleEvent('DELETE',appointment.googleEventId,null,options);}
    catch(error){const check=await googleEvent('GET',appointment.googleEventId,null,options);if(check.event)throw error;}
  }
  const at=nowDate(options).toISOString(),key=`${CALLBACK_CALENDAR_PREFIX}${appointment.calendarToken}`,calendar=await options.store.get(key);
  if(calendar)await options.store.setJSON(key,{...calendar,status:'cancelled',updatedAt:at},{metadata:{status:'cancelled',createdAt:calendar.createdAt,updatedAt:at,expiresAt:calendar.expiresAt}});
  if(appointment.sourceKey){const original=await options.store.get(appointment.sourceKey);if(original) {
    const updated=original.callbackScheduling?{...original,callbackScheduling:{...original.callbackScheduling,status:'cancelled',updatedAt:at}}:{...original,status:'cancelled',updatedAt:at};
    await options.store.setJSON(appointment.sourceKey,updated,{metadata:{status:'cancelled',updatedAt:at}});
  }}
  return true;
}

export async function handleCallbackCalendarRead(request, options = {}) {
  if (request.method !== 'GET') return error(405, 'method_not_allowed', 'GET is required.');
  const url = new URL(request.url);
  const token = text(url.searchParams.get('token'));
  if (!CALLBACK_TOKEN.test(token)) return error(404, 'calendar_unavailable', 'This calendar invitation is unavailable.');
  const record = await options.store?.get?.(`${CALLBACK_CALENDAR_PREFIX}${token}`);
  if (!record || record.status !== 'scheduled' || Date.parse(record.expiresAt) <= Date.now()) return error(404, 'calendar_unavailable', 'This calendar invitation is unavailable.');
  if (url.searchParams.get('format') === 'ics') {
    return new Response(callbackCalendarIcs(record), { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="coveragefit-callback.ics"', 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
  }
  return json({ ok: true, event: { title: record.title, start: record.start, end: record.end, timeZone: record.timeZone, display: record.display, agencyPhone: record.agencyPhone, reminderMinutes: record.reminderMinutes, preparationBySms: Boolean(record.preparationBySms), preparationText: record.preparationText || '', reviewUrl: record.reviewUrl || '' } });
}
