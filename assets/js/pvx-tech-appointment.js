(function(root,document){
  'use strict';
  const BUILD='CF-APPOINTMENT-FIRST-1.0';
  const SCHEMA='408-callback-browser-booking-v1';
  const ENDPOINT='/api/callback/journey-book';
  const form=document.getElementById('techAppointmentForm');
  const dateInput=document.getElementById('appointmentDate');
  const timeInput=document.getElementById('appointmentTime');
  const button=document.getElementById('confirmAppointment');
  const status=document.getElementById('appointmentStatus');
  const alternatives=document.getElementById('appointmentAlternatives');
  let ready=false;
  let requestId='';
  let journeyChannel='web';

  const text=(value,max=160)=>String(value??'').trim().replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max);
  const title=value=>text(value).replace(/[_-]+/g,' ').replace(/\b\w/g,char=>char.toUpperCase());
  const labels={
    review:{home:'Home',auto:'Auto',bundle:'Home + auto'},
    reason:{price:'Price',upcoming_renewal:'Upcoming renewal',new_home_or_vehicle:'New home or vehicle',coverage_concern:'Coverage concern',comparison:'Just comparing'},
    housing:{homeowner:'Homeowner',renter:'Renter'}
  };
  function uuid(){return root.crypto?.randomUUID?.()||'';}
  function isoDate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function weekend(value){const parts=String(value||'').split('-').map(Number);if(parts.length!==3||parts.some(part=>!Number.isInteger(part)))return false;const day=new Date(Date.UTC(parts[0],parts[1]-1,parts[2])).getUTCDay();return day===0||day===6;}
  function safeCalendarUrl(value){try{const url=new URL(String(value||''));return ['https://coveragefit.com','https://www.coveragefit.com','https://review.408farmers.com'].includes(url.origin)&&url.pathname==='/appointment/'&&/^\?token=[A-Za-z0-9_-]{24,96}$/.test(url.search)?url.toString():'';}catch(_){return'';}}
  function track(event,result){root.dataLayer=root.dataLayer||[];root.dataLayer.push({event,funnel:'appointment_first',stage:'booking',result,build:BUILD});}
  function addTimes(){for(let hour=9;hour<=17;hour+=1){for(let minute=0;minute<60;minute+=30){const option=document.createElement('option');option.value=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;const displayHour=hour>12?hour-12:hour;option.textContent=`${displayHour}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;timeInput.appendChild(option);}}}
  function setSummary(seed){
    const professional=seed.context?.professional||{};
    const appointment=seed.context?.appointment||{};
    const reviewCopy={home:'your home coverage',auto:'your auto coverage',bundle:'your home and auto coverage',life:'your life insurance needs',business:'your business insurance needs',buyer:'coverage for the home you’re buying',condo:'your condo coverage',renter:'your renters coverage'};
    const topic=Object.hasOwn(reviewCopy,appointment.reviewTrack)?reviewCopy[appointment.reviewTrack]:'your coverage needs';
    const intro=document.getElementById('appointmentIntro');
    if(intro)intro.textContent=`Your request is saved. We’ll talk through ${topic} and the options available to you. Choose a time for Dylan to call.`;
    const context=text(professional.roleLabel)||title(appointment.sourceType)||'Insurance review';
    document.getElementById('summaryContext').textContent=context;
    const housingRow=document.getElementById('summaryHousingRow');
    const housing=labels.housing[appointment.housing]||title(appointment.housing);
    document.getElementById('summaryHousing').textContent=housing;housingRow.hidden=!housing;
    document.getElementById('summaryReview').textContent=labels.review[appointment.reviewTrack]||title(appointment.reviewTrack);
    document.getElementById('summaryReason').textContent=labels.reason[appointment.reason]||title(appointment.reason);
    const detail1=appointment.propertyZip?['Property ZIP',text(appointment.propertyZip,10)]:appointment.businessType?['Business',text(appointment.businessType,120)]:null;
    const detail2=appointment.closingDate?['Closing',title(appointment.closingDate)]:null;
    const detail1Row=document.getElementById('summaryDetail1Row');const detail2Row=document.getElementById('summaryDetail2Row');
    if(detail1){document.getElementById('summaryDetail1Label').textContent=detail1[0];document.getElementById('summaryDetail1').textContent=detail1[1];detail1Row.hidden=false;}
    if(detail2){document.getElementById('summaryDetail2Label').textContent=detail2[0];document.getElementById('summaryDetail2').textContent=detail2[1];detail2Row.hidden=false;}
    document.getElementById('requestSummary').hidden=false;
  }
  function resetAttempt(){requestId=uuid();alternatives.replaceChildren();alternatives.hidden=true;}
  function chooseAlternative(slot){dateInput.value=text(slot.date,10);timeInput.value=text(slot.time,5);resetAttempt();status.textContent='That available time is selected. Confirm it when you’re ready.';button.focus();}
  function showAlternatives(slots){
    alternatives.replaceChildren();
    for(const slot of Array.isArray(slots)?slots.slice(0,3):[]){
      if(!/^20\d{2}-\d{2}-\d{2}$/.test(String(slot?.date||''))||!/^\d{2}:\d{2}$/.test(String(slot?.time||'')))continue;
      const choice=document.createElement('button');choice.type='button';choice.textContent=text(slot.display,100)||'Choose this available time';choice.addEventListener('click',()=>chooseAlternative(slot));alternatives.appendChild(choice);
    }
    alternatives.hidden=!alternatives.childElementCount;
  }
  async function load(){
    button.disabled=true;
    try{
      let response=await root.fetch('/api/pvx/web-journey',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:'load'})});
      let data=await response.json().catch(()=>({}));
      if(!response.ok||data?.ok!==true){journeyChannel='sms';response=await root.fetch('/api/pvx/sms-journey',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:'load'})});data=await response.json().catch(()=>({}));}
      const seed=data?.journey?.seed;
      if(!response.ok||data?.ok!==true||seed?.journey?.experience!=='appointment_only'||seed?.context?.appointment?.active!==true)throw new Error('This appointment request is unavailable. Please return to 408FARMERS and start again.');
      if(data.journey?.currentStage==='appointment_booked'&&/^\/appointment\/\?token=[A-Za-z0-9_-]{24,96}$/.test(String(data.journey?.destination||''))){root.location.replace(data.journey.destination);return;}
      setSummary(seed);ready=true;button.disabled=false;status.textContent='Choose a date and time to finish.';track('callback_booking_prompt_viewed',journeyChannel);
    }catch(cause){status.textContent=cause.message;track('callback_booking_failed','journey_unavailable');}
  }

  addTimes();
  const today=new Date();const maximum=new Date(today.getFullYear(),today.getMonth(),today.getDate()+60);dateInput.min=isoDate(today);dateInput.max=isoDate(maximum);resetAttempt();
  dateInput.addEventListener('change',resetAttempt);timeInput.addEventListener('change',resetAttempt);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!ready)return;
    if(!dateInput.value||!timeInput.value){status.textContent='Choose a date and time.';(!dateInput.value?dateInput:timeInput).focus();return;}
    if(weekend(dateInput.value)){status.textContent='Choose a Monday through Friday.';dateInput.focus();return;}
    if(!requestId)requestId=uuid();
    button.disabled=true;status.textContent='Checking Dylan’s calendar…';
    try{
      const response=await root.fetch(ENDPOINT,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json','X-CoverageFit-Callback-Version':'1'},body:JSON.stringify({action:'book_from_journey',request_id:requestId,date:dateInput.value,time:timeInput.value,call_request:true,call_request_version:SCHEMA,call_request_timestamp:new Date().toISOString()})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok!==true)throw new Error(data?.error?.message||'The appointment could not be confirmed.');
      if(data.booked!==true||data.available===false){button.disabled=false;status.textContent='That time is no longer available. Choose another time below.';showAlternatives(data.alternatives);requestId=uuid();track('callback_booking_unavailable','unavailable');return;}
      const calendarUrl=safeCalendarUrl(data.appointment?.calendarUrl);if(!calendarUrl)throw new Error('Your appointment is confirmed, but the confirmation page could not be opened.');
      status.textContent='Confirmed. Opening your appointment details…';track('callback_booking_confirmed','confirmed');root.location.assign(calendarUrl);
    }catch(cause){button.disabled=false;status.textContent=cause.message||'The appointment could not be confirmed. Please try again.';track('callback_booking_failed','failed');}
  });
  load();
})(window,document);
