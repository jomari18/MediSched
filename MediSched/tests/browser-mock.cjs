const mockModule=`export function createClient(url,key,options){
 window.clientOptions=options;window.callbacks=[];
 const emit=(event,session)=>window.callbacks.forEach(cb=>cb(event,session));
 const user=()=>JSON.parse(sessionStorage.getItem('mock.user')||'null');
 const session=()=>user()?{user:user(),access_token:'mock'}:null;
 const records=()=>JSON.parse(sessionStorage.getItem('mock.records')||'[]');
 const auth={
 getSession:async()=>({data:{session:session()},error:null}),
 getUser:async()=>window.expired?{data:{user:null},error:{message:'Session expired'}}:{data:{user:user()},error:null},
 onAuthStateChange:cb=>{window.callbacks.push(cb);return {data:{subscription:{unsubscribe(){}}}};},
 signUp:async input=>{window.signup=input;window.profileTrigger=true;if(window.signupError)return {error:{message:'Signup temporarily failed; retry or resend confirmation if an account was created.'},data:{}};return {data:{user:{id:'new-user'},session:null},error:null};},
 signInWithPassword:async()=>{const value=window.loginUser;if(!value.email_confirmed_at)return {error:{code:'email_not_confirmed'},data:{}};sessionStorage.setItem('mock.user',JSON.stringify(value));emit('SIGNED_IN',session());return {data:{user:value,session:session()},error:null};},
 signOut:async ({scope})=>{window.logoutScope=scope;if(window.failSignOut)return {error:{message:'Sign-out failed'}};sessionStorage.setItem('mock.logout',String(Number(sessionStorage.getItem('mock.logout')||0)+1));sessionStorage.removeItem('mock.user');emit('SIGNED_OUT',null);return {error:null};},
 verifyOtp:async value=>{window.otpParams=value;if(value.token!=='001234')return {data:{},error:{code:'otp_expired',message:'Invalid or expired code'}};sessionStorage.setItem('mock.user',JSON.stringify(window.loginUser));emit('SIGNED_IN',session());return {data:{session:session()},error:null};},
 resend:async value=>{window.resendParams=value;return {error:null};},
 exchangeCodeForSession:async code=>{window.exchangedCode=code;if(code==='expired')return {error:{message:'Confirmation code expired'}};sessionStorage.setItem('mock.user',JSON.stringify(window.loginUser));return {data:{session:session()},error:null};},
 setSession:async tokens=>{window.callbackTokens=tokens;sessionStorage.setItem('mock.user',JSON.stringify(window.loginUser));return {data:{session:session()},error:null};}
 };
 return {auth,functions:{invoke:async(name,options)=>{window.notificationInput={name,options};window.notificationCount=(window.notificationCount||0)+1;return window.notificationFailure?{error:{message:'Provider unavailable'},data:null}:{data:{status:'sent'},error:null};}},from(table){const filters=[];const query={select(){return query;},eq(field,value){filters.push({field,value});window.lastFilters={table,filters};return query;},in(field,values){filters.push({field,values});return query;},order(){return query;},maybeSingle:async()=>{window.profileQuery=filters;return {data:window.missingProfile?null:{full_name:'Jomari'},error:null};},then(resolve,reject){let data=table==='doctors'?window.catalogs.doctors:table==='appointment_types'?window.catalogs.types:table==='appointment_attendance'?[]:records().filter(r=>filters.every(f=>r[f.field]===f.value));return Promise.resolve({data,error:null}).then(resolve,reject);}};return query;},
 async rpc(name,input){
 if(name==='get_access_context')return window.contextFailure?{data:null,error:{code:'PGRST202'}}:{data:{display_name:'Jomari',is_staff:sessionStorage.getItem('mock.staff')==='yes'&&!window.staffForbidden},error:null};
 if(name==='list_staff_appointments'||name==='list_staff_activity'){
  if(sessionStorage.getItem('mock.staff')!=='yes'||window.staffForbidden)return {error:{code:'42501',message:'Clinic staff access required'},data:null};
  window.staffQueries??=[];window.staffQueries.push(input);const delay=window.staffDelay||0;window.staffDelay=0;
  let items=JSON.parse(sessionStorage.getItem('mock.staffRows')||'[]');
  if(name==='list_staff_activity')return {data:{items:JSON.parse(sessionStorage.getItem('mock.events')||'[]'),next_cursor:null},error:null};
  if(input.p_search)items=items.filter(x=>x.patient_name.toLowerCase().includes(input.p_search.toLowerCase()));
  if(input.p_doctor_id)items=items.filter(x=>x.doctor_id===input.p_doctor_id);
  if(delay)await new Promise(r=>setTimeout(r,delay));const total=items.length;if(input.p_cursor_id)items=items.filter(x=>x.id>input.p_cursor_id);const next=items.length>input.p_limit?{at:items[input.p_limit-1].start_at,id:items[input.p_limit-1].id}:null;const shown=items.slice(0,input.p_limit);
  return {data:{items:shown,totals:{total,checked_in:items.filter(x=>x.attendance_state==='checked_in').length,completed:0,no_show:0},next_cursor:next},error:null};
 }
 if(name==='set_appointment_attendance'){
  window.transitionRequests??=[];window.transitionRequests.push(input);
  if(window.staffForbidden)return {error:{code:'42501'},data:null};if(window.transitionError)return {error:{code:window.transitionError,message:'Stale state'},data:null};
  const rows=JSON.parse(sessionStorage.getItem('mock.staffRows')||'[]'),row=rows.find(x=>x.id===input.p_appointment_id);row.attendance_state='checked_in';row.version=1;row.allowed_actions=['complete'];sessionStorage.setItem('mock.staffRows',JSON.stringify(rows));if(window.transitionDelay)await new Promise(r=>setTimeout(r,window.transitionDelay));
  if(window.loseTransitionResponse){window.loseTransitionResponse=false;return {error:{message:'Response lost'},data:null};}
  return {data:{appointment_id:row.id,state:'checked_in',version:1,action_id:input.p_action_id,replayed:window.transitionRequests.length>1},error:null};
 }
 if(name==='list_available_slots'){
  window.availabilityQueries??=[];window.availabilityQueries.push(input);
  const delay=window.nextSlotDelay||0;window.nextSlotDelay=0;
  const error=window.availabilityError,response=window.availabilityResponse;
  const all=records(),day=Date.parse(input.p_date+'T00:00:00+08:00');
  let data=[];
  for(const [from,to] of [[480,660],[780,960]])for(let minute=from;minute<=to;minute+=15){
   const start=day+minute*60000;
   if(start>Date.now()&&!all.some(a=>a.doctor_id===input.p_doctor_id&&a.status==='active'&&Date.parse(a.start_at)<start+3600000&&Date.parse(a.end_at)>start))data.push({start_at:new Date(start).toISOString()});
  }
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  window.completedAvailability??=[];window.completedAvailability.push(input);
  return {error:error||null,data:response===undefined?data:response};
 }
 window.lastRpc={name,input};
 if(name==='book_appointment'){
  window.bookRequests??=[];window.bookRequests.push(input);
  if(window.bookingConflict)return {error:{code:'23P01',message:'Slot unavailable'},data:null};
 }
 if(window.failBooking)return {error:{message:'Simulated backend failure'},data:null};
 let rows=records();if(name==='book_appointment'){
 const existing=rows.find(row=>row.id===input.p_request_id);if(existing)return {data:existing,error:null};
 const saved={id:input.p_request_id,owner_uid:user().id,doctor_id:input.p_doctor_id,type_id:input.p_type_id,doctor_name:'Dr. Smith',type_name:'General Check-up',patient_name:input.p_patient_name,patient_address:input.p_patient_address,patient_age:input.p_patient_age,confirmation_email:'saved@example.test',start_at:input.p_start_at,end_at:new Date(Date.parse(input.p_start_at)+3600000).toISOString(),status:'active'};rows.push(saved);sessionStorage.setItem('mock.records',JSON.stringify(rows));if(window.bookingDelay)await new Promise(r=>setTimeout(r,window.bookingDelay));if(window.loseBookingResponse){window.loseBookingResponse=false;return {data:null,error:{message:'Response lost'}};}return {data:saved,error:null};}rows.find(a=>a.id===input.p_appointment_id).status='cancelled';sessionStorage.setItem('mock.records',JSON.stringify(rows));return {data:rows.find(a=>a.id===input.p_appointment_id),error:null};}
 };}
`;
module.exports={mockModule};
