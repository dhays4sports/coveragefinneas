import { normalizeE164 } from './ringcentral-client.mjs';
import { sendSmsThroughGateway } from './sms-outbound-gateway.mjs';

export const PRODUCER_BOOKING_ALERT_BUILD = 'CF-PRODUCER-BOOKING-ALERT-1.1';
export const PRODUCER_BOOKING_ALERT_WORKFLOW = 'producer_booking_alert';
export const PRODUCER_CALL_NOW_ALERT_WORKFLOW = 'producer_call_now_alert';

const text = (value, max = 160) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';

const REVIEW_LABELS = Object.freeze({
  home: 'Home',
  auto: 'Auto',
  bundle: 'Home + auto',
  life: 'Life',
  business: 'Business',
  general: 'Insurance review'
});

const REASON_LABELS = Object.freeze({
  price: 'Price',
  upcoming_renewal: 'Upcoming renewal',
  new_home_or_vehicle: 'New home or vehicle',
  coverage_concern: 'Coverage concern',
  comparison: 'Just comparing'
});

const HOUSING_LABELS = Object.freeze({ homeowner:'Homeowner', renter:'Renter' });

function displayPhone(value) {
  const normalized = normalizeE164(value);
  const match = normalized.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : normalized;
}

export function producerAlertPhone(env = {}) {
  const recipient = normalizeE164(env.PRODUCER_ALERT_PHONE);
  const sender = normalizeE164(env.RINGCENTRAL_FROM_NUMBER);
  if (!recipient) return { configured:false, reason:'producer_alert_phone_missing', phone:'' };
  if (recipient === sender) return { configured:false, reason:'producer_alert_phone_matches_sender', phone:'' };
  return { configured:true, reason:'', phone:recipient };
}

export function buildProducerBookingAlert(input = {}) {
  const firstName = text(input.firstName, 60) || 'New prospect';
  const role = text(input.roleLabel, 100);
  const review = REVIEW_LABELS[text(input.reviewTrack, 30).toLowerCase()] || 'Insurance review';
  const reason = REASON_LABELS[text(input.reviewReason, 50).toLowerCase()] || text(input.reviewReason, 80);
  const housing = HOUSING_LABELS[text(input.housing, 30).toLowerCase()] || '';
  const sourceType = text(input.sourceType, 30).replace(/[_-]+/g, ' ');
  const propertyZip = text(input.propertyZip, 10);
  const closingDate = text(input.closingDate, 40).replace(/[_-]+/g, ' ');
  const appointment = text(input.appointmentDisplay, 160) || 'Time confirmed in Google Calendar';
  const mobile = displayPhone(input.prospectPhone);
  return [
    'New CoverageFit appointment',
    `${firstName}${role ? ` — ${role}` : ''}`,
    [housing, review].filter(Boolean).join(' · '),
    sourceType ? `Entry: ${sourceType}` : '',
    propertyZip ? `Property ZIP: ${propertyZip}` : '',
    closingDate ? `Closing: ${closingDate}` : '',
    reason ? `Reason: ${reason}` : '',
    appointment,
    mobile ? `Mobile: ${mobile}` : '',
    'Producer alert — no reply needed.'
  ].filter(Boolean).join('\n');
}

export function buildProducerCallNowAlert(input = {}) {
  const firstName = text(input.firstName, 60) || 'New prospect';
  const mobile = displayPhone(input.prospectPhone);
  const message = text(input.customerMessage, 240);
  return [
    'CALL-NOW REQUEST',
    firstName,
    mobile ? `Mobile: ${mobile}` : '',
    message ? `Customer: “${message}”` : '',
    'Call as soon as you are available.',
    'Producer alert — no reply needed.'
  ].filter(Boolean).join('\n');
}

export async function sendProducerBookingAlert(input = {}, options = {}) {
  const requestId = text(input.requestId, 64).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return { status:'skipped', reason:'invalid_request_id', build:PRODUCER_BOOKING_ALERT_BUILD };
  }
  const destination = producerAlertPhone(options.env || {});
  if (!destination.configured) return { status:'skipped', reason:destination.reason, build:PRODUCER_BOOKING_ALERT_BUILD };
  try {
    const sent = await sendSmsThroughGateway({
      to:destination.phone,
      message:buildProducerBookingAlert(input),
      origin:'system',
      workflow:PRODUCER_BOOKING_ALERT_WORKFLOW,
      replyRoute:'none',
      ownershipEffect:'preserve',
      idempotencyKey:`producer-alert:${requestId}`
    }, { ...options, store:options.store });
    return { status:'sent', deduped:sent?.deduped === true, providerMessageId:text(sent?.providerMessageId, 120), build:PRODUCER_BOOKING_ALERT_BUILD };
  } catch (cause) {
    return { status:'failed', reason:text(cause?.code, 80) || 'ringcentral_alert_failed', build:PRODUCER_BOOKING_ALERT_BUILD };
  }
}

export async function sendProducerCallNowAlert(input = {}, options = {}) {
  const eventId = text(input.eventId, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(eventId)) {
    return { status:'skipped', reason:'invalid_event_id', build:PRODUCER_BOOKING_ALERT_BUILD };
  }
  const destination = producerAlertPhone(options.env || {});
  if (!destination.configured) return { status:'skipped', reason:destination.reason, build:PRODUCER_BOOKING_ALERT_BUILD };
  try {
    const sent = await sendSmsThroughGateway({
      to:destination.phone,
      message:buildProducerCallNowAlert(input),
      origin:'system',
      workflow:PRODUCER_CALL_NOW_ALERT_WORKFLOW,
      replyRoute:'none',
      ownershipEffect:'preserve',
      idempotencyKey:`producer-call-now:${eventId}`
    }, { ...options, store:options.store });
    return { status:'sent', deduped:sent?.deduped === true, providerMessageId:text(sent?.providerMessageId, 120), build:PRODUCER_BOOKING_ALERT_BUILD };
  } catch (cause) {
    return { status:'failed', reason:text(cause?.code, 80) || 'ringcentral_alert_failed', build:PRODUCER_BOOKING_ALERT_BUILD };
  }
}
