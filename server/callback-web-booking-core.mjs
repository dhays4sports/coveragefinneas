import { normalizeE164 } from './ringcentral-client.mjs';
import { bookCallbackWebAppointment } from './sms-callback-scheduling-core.mjs';
import { hashToken, TOKEN_PATTERN } from './pvx-checkpoint-core.mjs';
import { timingSafeTextEqual } from './runtime-crypto.mjs';
import { loadPvxWebJourneyFromRequest, advancePvxWebJourney } from './pvx-web-journey-core.mjs';
import { loadPvxSmsJourneyFromRequest, advancePvxSmsJourney } from './pvx-sms-journey-core.mjs';
import { smsCheckpointId, upsertLeadJourney } from './lead-operations-core.mjs';
import { sendProducerBookingAlert } from './producer-booking-alert-core.mjs';

export const CALLBACK_WEB_BOOKING_BUILD = 'CF-CALLBACK-WEB-1.4';
export const CALLBACK_WEB_BOOKING_SCHEMA = '408-callback-browser-booking-v1';
export const CALLBACK_WEB_BOOKING_MAX_BODY_BYTES = 8 * 1024;
export const CALLBACK_WEB_BOOKING_MAX_SKEW_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();
const PRODUCTS = new Set(['home', 'condo', 'auto', 'bundle', 'life', 'business', 'general']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^20\d{2}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const text = (value, max = 160) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff'
  }
});
const error = (status, code, message, extra = {}) => json({ ok:false, error:{ code, message }, ...extra }, status);
const exactKeys = (value, allowed) => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key)));
const nowDate = options => {
  const supplied = typeof options?.now === 'function' ? options.now() : options?.now;
  const date = supplied instanceof Date ? supplied : supplied ? new Date(supplied) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const sameOrigin = request => {
  const origin = text(request.headers.get('origin'), 500);
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
};
const evidenceIsFresh = (value, trustedAt) => {
  const capturedAt = Date.parse(text(value, 40));
  const trusted = trustedAt instanceof Date ? trustedAt.getTime() : Date.parse(String(trustedAt || ''));
  return Number.isFinite(capturedAt) && Number.isFinite(trusted) && Math.abs(capturedAt - trusted) <= CALLBACK_WEB_BOOKING_MAX_SKEW_MS;
};

async function hmacHex(secret, message) {
  const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readBody(request) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > CALLBACK_WEB_BOOKING_MAX_BODY_BYTES) return { response:error(413, 'payload_too_large', 'The callback request is too large.') };
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return { response:error(415, 'unsupported_media_type', 'Expected application/json.') };
  let raw = '';
  try { raw = await request.text(); } catch (_) { return { response:error(400, 'invalid_request', 'The callback request could not be read.') } ; }
  if (encoder.encode(raw).byteLength > CALLBACK_WEB_BOOKING_MAX_BODY_BYTES) return { response:error(413, 'payload_too_large', 'The callback request is too large.') };
  try { return { raw, value:JSON.parse(raw) }; } catch (_) { return { response:error(400, 'invalid_json', 'A valid callback request is required.') }; }
}

function normalizeSignedBooking(value) {
  const keys = ['schema_version','request_id','correlation_id','first_name','phone','product_type','source_route','date','time','call_request','call_request_version','call_request_timestamp'];
  if (!exactKeys(value, keys) || value.schema_version !== CALLBACK_WEB_BOOKING_SCHEMA || !UUID.test(text(value.request_id, 64))) return null;
  const phone = normalizeE164(value.phone);
  const productType = PRODUCTS.has(text(value.product_type, 30).toLowerCase()) ? text(value.product_type, 30).toLowerCase() : '';
  const requestedDate = text(value.date, 10);
  const requestedTime = text(value.time, 5);
  const capturedAt = text(value.call_request_timestamp, 40);
  if (!phone || !productType || !DATE.test(requestedDate) || !TIME.test(requestedTime)) return null;
  if (value.call_request !== true || text(value.call_request_version, 100) !== CALLBACK_WEB_BOOKING_SCHEMA || !Number.isFinite(Date.parse(capturedAt))) return null;
  return {
    requestId:text(value.request_id, 64).toLowerCase(), correlationId:text(value.correlation_id, 120),
    firstName:text(value.first_name, 60).replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, ''), phone, productType,
    source:text(value.source_route, 80) || '408farmers', date:requestedDate, time:requestedTime,
    callRequestVersion:CALLBACK_WEB_BOOKING_SCHEMA, callRequestTimestamp:new Date(capturedAt).toISOString()
  };
}

async function authenticateSignedRequest(request, raw, options) {
  const secret = text(options?.env?.COVERAGEFIT_LEAD_SYNC_SECRET, 500);
  if (secret.length < 32) return { response:error(503, 'bridge_not_configured', 'Secure callback booking is not configured.') };
  if (text(request.headers.get('x-coveragefit-contract'), 100) !== 'coveragefit-callback-web-booking-v1') return { response:error(401, 'contract_rejected', 'The callback booking contract was rejected.') };
  const sentAt = text(request.headers.get('x-coveragefit-sent-at'), 30);
  const signature = text(request.headers.get('x-coveragefit-signature'), 128).toLowerCase();
  const sentAtNumber = Number(sentAt);
  if (!Number.isFinite(sentAtNumber) || Math.abs(nowDate(options).getTime() - sentAtNumber) > CALLBACK_WEB_BOOKING_MAX_SKEW_MS) return { response:error(401, 'stale_request', 'The callback request is no longer valid.') };
  const expected = await hmacHex(secret, `${sentAt}.${raw}`);
  return timingSafeTextEqual(signature, expected)
    ? { ok:true, relaySentAt:new Date(sentAtNumber).toISOString() }
    : { response:error(401, 'signature_rejected', 'The signed callback request was rejected.') };
}

async function book(payload, request, options) {
  try {
    const result = await bookCallbackWebAppointment(payload, { ...options, origin:new URL(request.url).origin });
    if (!result.available) return json({ ok:true, booked:false, available:false, alternatives:result.alternatives || [], build:CALLBACK_WEB_BOOKING_BUILD });
    return json({
      ok:true, booked:true, available:true, idempotent:result.idempotent === true, build:CALLBACK_WEB_BOOKING_BUILD,
      appointment:{ display:result.booking.scheduledDisplay, calendarUrl:result.calendarUrl }
    }, result.idempotent ? 200 : 201);
  } catch (cause) {
    return error(Number(cause?.status) || 422, text(cause?.code, 80) || 'callback_booking_failed', text(cause?.message, 240) || 'The callback could not be booked.');
  }
}

export async function handleSignedWebBooking(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  const parsed = await readBody(request);
  if (parsed.response) return parsed.response;
  const authentication = await authenticateSignedRequest(request, parsed.raw, options);
  if (authentication.response) return authentication.response;
  const payload = normalizeSignedBooking(parsed.value);
  if (!payload) return error(422, 'invalid_callback_request', 'The callback booking request is incomplete.');
  const receivedAt = nowDate(options);
  if (!evidenceIsFresh(payload.callRequestTimestamp, receivedAt)) return error(422, 'call_request_timestamp_invalid', 'The callback confirmation has expired. Please choose the time again.');
  payload.callRequestClientTimestamp = payload.callRequestTimestamp;
  payload.callRequestTimestamp = receivedAt.toISOString();
  payload.callRequestEvidenceSource = 'coveragefit_server_received_signed_408';
  payload.relayAuthenticatedTimestamp = authentication.relaySentAt;
  return book(payload, request, options);
}

export async function handleCustomerWebBooking(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'The callback request must originate from CoverageFit.');
  if (text(request.headers.get('x-coveragefit-callback-version'), 20) !== '1') return error(400, 'version_required', 'The callback request version is required.');
  const parsed = await readBody(request);
  if (parsed.response) return parsed.response;
  const keys = ['action','token','request_id','date','time','call_request','call_request_version','call_request_timestamp'];
  const value = parsed.value;
  const token = text(value?.token, 80);
  const requestId = text(value?.request_id, 64).toLowerCase();
  const requestedDate = text(value?.date, 10);
  const requestedTime = text(value?.time, 5);
  const capturedAt = text(value?.call_request_timestamp, 40);
  if (!exactKeys(value, keys) || value.action !== 'book_from_checkpoint' || !TOKEN_PATTERN.test(token) || !UUID.test(requestId) || !DATE.test(requestedDate) || !TIME.test(requestedTime)) return error(422, 'invalid_callback_request', 'The callback booking request is incomplete.');
  if (value.call_request !== true || text(value.call_request_version, 100) !== CALLBACK_WEB_BOOKING_SCHEMA || !Number.isFinite(Date.parse(capturedAt))) return error(422, 'invalid_callback_request', 'The callback booking request is incomplete.');
  const receivedAt = nowDate(options);
  if (!evidenceIsFresh(capturedAt, receivedAt)) return error(422, 'call_request_timestamp_invalid', 'The callback confirmation has expired. Please choose the time again.');
  const record = await options.leadStore?.get?.(`pvx/checkpoint/${await hashToken(token)}`);
  if (!record || Date.parse(record.expiresAt) <= nowDate(options).getTime()) return error(404, 'checkpoint_unavailable', 'The contact request is unavailable.');
  if (record.consent?.contact !== true || record.consent?.call !== true || record.contact?.preferredMethod !== 'call' || !normalizeE164(record.contact?.mobile)) return error(409, 'call_not_authorized', 'A confirmed call request and mobile number are required.');
  const name = text(record.contact?.name, 160);
  const payload = {
    requestId, correlationId:text(record.checkpointId, 120), firstName:name.split(/\s+/)[0] || '', phone:normalizeE164(record.contact.mobile),
    productType:'home', source:'coveragefit_snapshot', date:requestedDate, time:requestedTime,
    callRequestVersion:CALLBACK_WEB_BOOKING_SCHEMA,
    callRequestTimestamp:receivedAt.toISOString(),
    callRequestClientTimestamp:new Date(capturedAt).toISOString(),
    callRequestEvidenceSource:'coveragefit_server_received_same_origin_snapshot'
  };
  return book(payload, request, options);
}

export async function handleJourneyWebBooking(request, options = {}) {
  if (request.method !== 'POST') return error(405, 'method_not_allowed', 'POST is required.');
  if (!sameOrigin(request)) return error(403, 'origin_rejected', 'The appointment request must originate from CoverageFit.');
  if (text(request.headers.get('x-coveragefit-callback-version'), 20) !== '1') return error(400, 'version_required', 'The callback request version is required.');
  const parsed = await readBody(request);
  if (parsed.response) return parsed.response;
  const keys = ['action','request_id','date','time','call_request','call_request_version','call_request_timestamp'];
  const value = parsed.value;
  const requestId = text(value?.request_id, 64).toLowerCase();
  const requestedDate = text(value?.date, 10);
  const requestedTime = text(value?.time, 5);
  const capturedAt = text(value?.call_request_timestamp, 40);
  if (!exactKeys(value, keys) || !['book_from_journey','book_from_tech_journey'].includes(value.action) || !UUID.test(requestId) || !DATE.test(requestedDate) || !TIME.test(requestedTime)) return error(422, 'invalid_callback_request', 'Choose a valid callback date and time.');
  if (value.call_request !== true || text(value.call_request_version, 100) !== CALLBACK_WEB_BOOKING_SCHEMA || !Number.isFinite(Date.parse(capturedAt))) return error(422, 'invalid_callback_request', 'The appointment confirmation is incomplete.');
  const receivedAt = nowDate(options);
  if (!evidenceIsFresh(capturedAt, receivedAt)) return error(422, 'call_request_timestamp_invalid', 'The appointment confirmation has expired. Please choose the time again.');

  const webLoaded = await loadPvxWebJourneyFromRequest(request, { store:options.leadStore });
  const smsLoaded = webLoaded ? null : await loadPvxSmsJourneyFromRequest(request, { store:options.leadStore });
  const loaded = webLoaded || smsLoaded;
  const smsJourney = Boolean(smsLoaded);
  const seed = loaded?.record?.seed;
  const appointment = seed?.context?.appointment || {};
  const professional = seed?.context?.professional || {};
  const contact = seed?.contact || {};
  const permission = contact.agencyContactConsent || {};
  const phone = normalizeE164(contact.identity?.mobile || contact.mobile);
  const checkpointId = text(contact.leadCheckpointId || loaded?.record?.smsConversationId, 120);
  if (!loaded || seed?.journey?.experience !== 'appointment_only' || appointment.active !== true) return error(409, 'appointment_journey_required', 'This appointment page is not connected to a saved review request.');
  const savedWebRequest = contact.leadCaptureStatus === 'confirmed' && permission.granted === true;
  const activeSmsRequest = smsJourney && contact.smsConsent?.status === 'active';
  if ((!savedWebRequest && !activeSmsRequest) || !phone || !checkpointId) return error(409, 'call_not_authorized', 'A saved request and callback permission are required.');

  const payload = {
    requestId,
    correlationId:checkpointId,
    firstName:text(contact.identity?.firstName, 60),
    phone,
    productType:PRODUCTS.has(text(appointment.reviewTrack, 30).toLowerCase()) ? text(appointment.reviewTrack, 30).toLowerCase() : 'general',
    source:`408farmers_${text(appointment.sourceType, 30) || (smsJourney ? 'sms' : 'web')}_appointment`,
    date:requestedDate,
    time:requestedTime,
    callRequestVersion:CALLBACK_WEB_BOOKING_SCHEMA,
    callRequestTimestamp:receivedAt.toISOString(),
    callRequestClientTimestamp:new Date(capturedAt).toISOString(),
    callRequestEvidenceSource:smsJourney ? 'coveragefit_server_received_same_origin_sms_appointment' : 'coveragefit_server_received_same_origin_appointment_journey'
  };

  try {
    const result = await bookCallbackWebAppointment(payload, { ...options, origin:new URL(request.url).origin });
    if (!result.available) return json({ ok:true, booked:false, available:false, alternatives:result.alternatives || [], build:CALLBACK_WEB_BOOKING_BUILD });
    const advanceJourney = smsJourney ? advancePvxSmsJourney : advancePvxWebJourney;
    await advanceJourney(loaded, {
      ...options,
      store:options.leadStore,
      stage:'appointment_booked',
      completedStage:'appointment_requested',
      currentStep:'confirmed',
      details:{ requestedProducerAction:'contact_requested', appointmentCalendarUrl:new URL(result.calendarUrl).pathname + new URL(result.calendarUrl).search, appointmentDisplay:result.booking?.scheduledDisplay },
      ...(smsJourney ? { operationsStore:options.store } : {})
    });
    const workspaceCheckpointId = smsJourney
      ? smsCheckpointId({ id:loaded.record.smsConversationId })
      : checkpointId;
    if (workspaceCheckpointId) {
      await upsertLeadJourney(options.leadStore, {
        checkpointId:workspaceCheckpointId,
        stage:'contact_requested',
        occurredAt:receivedAt.toISOString(),
        identity:{},
        consent:{ contactRequested:true },
        context:{
          reviewTrack:text(appointment.reviewTrack, 40),
          reviewReason:text(appointment.reason, 60),
          reviewContext:text(appointment.reviewContext, 120),
          propertyZip:text(appointment.propertyZip, 10),
          closingDate:text(appointment.closingDate, 40),
          autoNeed:text(appointment.autoNeed, 60),
          lifeGoal:text(appointment.lifeGoal, 60),
          businessType:text(appointment.businessType, 120),
          businessNeed:text(appointment.businessNeed, 60),
          sourceType:text(appointment.sourceType, 40),
          appointment:{ status:'scheduled', display:text(result.booking?.scheduledDisplay, 160), start:text(result.booking?.scheduledStart, 40), end:text(result.booking?.scheduledEnd, 40), bookedAt:receivedAt.toISOString() }
        },
        attribution:{}
      }, options);
    }
    const producerAlert = await sendProducerBookingAlert({
      requestId,
      firstName:text(contact.identity?.firstName, 60),
      roleLabel:text(professional.roleLabel, 100),
      housing:text(appointment.housing, 30),
      reviewTrack:text(appointment.reviewTrack, 40),
      reviewReason:text(appointment.reason, 60),
      sourceType:text(appointment.sourceType, 30),
      propertyZip:text(appointment.propertyZip, 10),
      closingDate:text(appointment.closingDate, 40),
      appointmentDisplay:text(result.booking?.scheduledDisplay, 160),
      prospectPhone:phone
    }, { ...options, store:options.store });
    return json({
      ok:true,
      booked:true,
      available:true,
      idempotent:result.idempotent === true,
      build:CALLBACK_WEB_BOOKING_BUILD,
      appointment:{ display:result.booking.scheduledDisplay, calendarUrl:result.calendarUrl },
      producerAlert:{ status:producerAlert.status }
    }, result.idempotent ? 200 : 201);
  } catch (cause) {
    return error(Number(cause?.status) || 422, text(cause?.code, 80) || 'callback_booking_failed', text(cause?.message, 240) || 'The callback could not be booked.');
  }
}

export { normalizeSignedBooking, authenticateSignedRequest };
