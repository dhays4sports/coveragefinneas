import { bookCallbackWebAppointment,recommendationCalendarSlots,recommendationCalendarDetails,recommendationCalendarRemove,CALLBACK_CALENDAR_PREFIX,CALLBACK_WEB_BOOKING_PREFIX } from './sms-callback-scheduling-core.mjs';
import { normalizeE164 } from './ringcentral-client.mjs';
import { clean } from '../assets/js/recommendation-model.mjs';
import { deliverRecommendationNotification } from './recommendation-notifications.mjs';
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code})};
export const recommendationSlots=(date,opts)=>recommendationCalendarSlots(date,opts);
export function publicAppointment(value={}) {return value.googleEventId?{status:value.status || 'scheduled',display:value.display || value.scheduledDisplay,start:value.start || value.scheduledStart,calendarUrl:value.calendarUrl,reference:value.requestId || value.calendarToken}:null;}
export async function linkExistingAppointment(record,url,opts) {
  let parsed;try{parsed=new URL(url,opts.origin)}catch{fail(422,'appointment_url','Paste the existing CoverageFit appointment link.');}
  if(parsed.origin!==opts.origin || parsed.pathname!=='/appointment/')fail(422,'appointment_url','Use an appointment link from this CoverageFit site.');
  const token=parsed.searchParams.get('token') || '';
  if(!/^[A-Za-z0-9_-]{24,96}$/.test(token))fail(422,'appointment_url','This appointment link is invalid.');
  const calendar=await opts.store.get(`${CALLBACK_CALENDAR_PREFIX}${token}`);
  if(!calendar || calendar.status!=='scheduled' || Date.parse(calendar.end)<Date.now())fail(404,'appointment_missing','This appointment is not currently scheduled.');
  let appointment=null;
  for(const prefix of [CALLBACK_WEB_BOOKING_PREFIX,'sms-live-conversations/']) {
    const listed=await opts.store.list({prefix,limit:1000});
    for(const item of listed.blobs || []) {
      const saved=await opts.store.get(item.key), candidate=saved?.callbackScheduling || saved;
      if(candidate?.calendarToken!==token || !candidate.googleEventId)continue;
      appointment={status:'scheduled',googleEventId:candidate.googleEventId,calendarToken:token,calendarUrl:`${opts.origin}/appointment/?token=${encodeURIComponent(token)}`,requestId:saved.requestId || saved.callbackSequence?.id || '',sourceKey:item.key,start:calendar.start,end:calendar.end,display:calendar.display,linkedByProducer:true};break;
    }
    if(appointment)break;
  }
  if(!appointment)fail(404,'appointment_missing','This calendar link could not be matched to a saved booking. Keep the existing appointment and contact Dylan to change it.');
  await opts.repo.setAppointment(record.id,appointment);return publicAppointment(appointment);
}
async function executeBooking(record,revision,value,opts) {
  if(!revision.payload.bookingEnabled)fail(409,'booking_disabled','Contact Dylan to arrange a time.');
  const prior=record.appointment?.googleEventId?record.appointment:null;
  if(prior?.requestId===value.requestId) return {booked:true,existing:true,appointment:publicAppointment(prior)};
  const events=await opts.repo.events(record.id);
  if(!prior && !events.some(e=>e.kind==='proceed'&&e.revision===revision.revision))fail(409,'intent_required','Save your request to proceed before choosing an appointment.');
  if(value.callRequest!==true)fail(422,'call_request','Confirm that Dylan can call you at the selected time.');
  let operation=await opts.repo.operation(record.id,'booking');
  const phone=normalizeE164(operation?.payload.phone || value.phone || record.appointment?.callbackPhone || record.draft.contact.mobile);
  if(!phone)fail(422,'phone','Add a valid callback number.');
  if(prior && value.mode!=='reschedule')return {booked:true,existing:true,appointment:publicAppointment(prior)};
  if(prior && value.appointmentReference!==(prior.requestId || prior.calendarToken))fail(409,'appointment_changed','Your appointment changed. Reload before rescheduling.');
  if(operation && operation.payload.requestId!==value.requestId)fail(409,'booking_in_progress','A booking change is still being confirmed. Please retry the pending request.');
  if(!operation) {
    const payload={requestId:value.requestId,date:clean(value.date,10),time:clean(value.time,5),phone,prior,revision:revision.revision,createdAt:new Date().toISOString()};
    if(!await opts.repo.beginOperation(record.id,'booking',payload))fail(409,'booking_in_progress','An appointment is already being confirmed. Please reload and try again.');
    operation={payload};
  }
  const saved=operation.payload;
  if(saved.date!==value.date || saved.time!==value.time || saved.revision!==revision.revision)fail(409,'booking_conflict','Retry the original pending appointment before choosing a different time.');
  if(saved.completed) return {booked:true,appointment:publicAppointment(saved.appointment)};
  let booking=saved.appointment;
  if(!booking) {
    let result;
    try{result=await bookCallbackWebAppointment({requestId:saved.requestId,correlationId:record.id,firstName:record.draft.contact.name.split(' ')[0],phone:saved.phone,productType:revision.payload.options[0]?.policies.length>1?'bundle':'general',source:'coveragefit_recommendation',date:saved.date,time:saved.time,callRequestVersion:'CF-RECOMMEND-1.0',callRequestTimestamp:saved.createdAt,callRequestEvidenceSource:'explicit_recommendation_appointment_request'},opts);}
    catch(error){throw error;}
    if(!result.available){await opts.repo.releaseOperation(record.id,'booking',saved.requestId);return {booked:false,alternatives:result.alternatives || []};}
    booking={...result.booking,status:'scheduled',callbackPhone:saved.phone,display:result.booking.scheduledDisplay,start:result.booking.scheduledStart,end:result.booking.scheduledEnd,calendarUrl:result.calendarUrl,sourceKey:`${CALLBACK_WEB_BOOKING_PREFIX}${saved.requestId}`};
    saved.appointment=booking;await opts.repo.updateOperation(record.id,'booking',saved);
  }
  // Persist the new appointment details before retiring a prior booking. Retries resume here.
  await recommendationCalendarDetails(booking,{...revision.payload,reviewUrl:opts.reviewUrl,pendingChange:Boolean(saved.prior)},opts);
  if(saved.prior && saved.prior.googleEventId!==booking.googleEventId) {
    await recommendationCalendarRemove(saved.prior,opts);
    await recommendationCalendarDetails(booking,{...revision.payload,reviewUrl:opts.reviewUrl,pendingChange:false},opts);
  }
  await opts.repo.setAppointment(record.id,booking);
  const event=await opts.repo.event(record.id,revision.revision,saved.prior?'reschedule':'appointment',`${record.id}:appointment:${saved.requestId}`,{display:booking.display,message:`Callback requested at ${saved.phone}. ${revision.payload.checklist.length?`Have ready: ${revision.payload.checklist.join('; ')}`:'No additional preparation requested.'}`});
  const delivery=deliverRecommendationNotification(event,opts);if(opts.waitUntil)opts.waitUntil(delivery);else await delivery;
  await opts.repo.releaseOperation(record.id,'booking',saved.requestId);
  return {booked:true,appointment:publicAppointment(booking)};
}
export async function bookRecommendation(record,revision,value,opts) {
  try{return await executeBooking(record,revision,value,opts);}
  catch(error){
    const pending=await opts.repo.operation(record.id,'booking');
    if(pending?.payload.requestId===value.requestId){
      if(pending.payload.prior)await opts.repo.setAppointment(record.id,{...pending.payload.prior,status:'change_pending'});
      const event=await opts.repo.event(record.id,revision.revision,'booking_pending',`${record.id}:booking-pending:${value.requestId}`,{message:'The client requested an appointment, but calendar confirmation needs attention. The proceed request remains saved. Check the pending booking in CoverageFit before arranging another call.'});
      const delivery=deliverRecommendationNotification(event,opts);if(opts.waitUntil)opts.waitUntil(delivery);else await delivery;
    }
    throw error;
  }
}
