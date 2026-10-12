import {createPatientPass} from './checkin-ui.js';
import {createSessionController,fetchAccessContext} from './session.js';
import {mountWorkspace,confirmAction,element} from './workspace.js';
import {renderPatientOverview,renderPatientAppointments,showPatientDetails} from './patient-view.js';
import {attendanceLabel,formatVisitRange} from './attendance.js';
import {settings} from './config.js';
import {validateAppointment,appointmentStatus,manilaDateTime,bookingParameters} from './domain.js';
import {availableOptions} from './availability.js';
import {AUTH_STORAGE_KEY,isConfirmed,validatePublicConfig,callbackInfo,friendlyError} from './auth-helpers.js';
import {otpConfig,otpToken,readVerification,saveVerification,cooldownRemaining,clearVerificationContext,OTP_STORAGE_KEY} from './otp.js';
import {mountPasswordRecovery} from './password-recovery-ui.js';
const $=id=>document.getElementById(id),dashboard=document.body.dataset.page==='dashboard';
const status=text=>{$(dashboard?'dashboardStatus':'authStatus').textContent=text;if(!dashboard&&text&&text!=='Ready to sign in.')document.body.classList.add('account-view');};
let client=null,currentUser=null,ready=false,authOperation=false,authEpoch=0;
let appointments=[],filter='upcoming',requestId=null,modalTrigger=null;
let pendingValue=null,slotEpoch=0,slotState='idle';
let leaving=false;
let sessionController,workspaceHandle,attendance=new Map();
const patientPass=document.body.dataset.page==='dashboard'?createPatientPass({getClient:()=>client,isAuthorized:()=>Boolean(currentUser)}):null;
async function routeAfterAuth(){const access=await fetchAccessContext(client);verification=clearVerificationContext(localStorage);location.replace(access.is_staff?'staff.html':'dashboard.html')}
let catalogs={doctors:[],types:[]};
function clearAppStorage(){['currentUser','isLoggedIn','medisched.pendingBooking'].forEach(key=>{try{sessionStorage.removeItem(key)}catch{}});}
async function busy(element,operation){
  if(element.dataset.busy)return;element.dataset.busy='true';element.setAttribute('aria-busy','true');
  const controls=[...element.querySelectorAll('button,input,select')];if(element.tagName==='BUTTON')controls.push(element);
  const before=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
  try{await operation();}catch(error){status(friendlyError(error));}
  finally{controls.forEach((c,i)=>c.disabled=before[i]);delete element.dataset.busy;element.removeAttribute('aria-busy');if(dashboard)syncSlotControls();}
}
function needClient(){if(!client||!ready)throw Error('Supabase is not ready. Check config.js and wait for the connection.');return client;}
function resetPasswords(){document.querySelectorAll('[data-password]').forEach(b=>{$(b.dataset.password).type='password';b.textContent='Show';b.setAttribute('aria-pressed','false');});}
const otpSettings=otpConfig(settings);
let verification=readVerification(localStorage);
function updateResend(){
  if(dashboard)return;
  const remaining=ready?cooldownRemaining(verification):0;
  for(const id of ['resendVerification','resendCode']){
    const button=$(id);button.disabled=!ready||authOperation||remaining>0;
    button.textContent=remaining?`Resend available in ${remaining}s`:id==='resendCode'?'Resend code':'Verify email / resend code';
  }
}
function showPanel(panel,{preserveStatus=false}={}){
  document.body.classList.add("account-view");
  if(ready&&!preserveStatus)status('');
  resetPasswords();
  document.querySelectorAll('input[type=password]').forEach(input=>input.value='');
  $('verificationCode').value='';
  for(const id of ['login','register','verify','recovery'])$(id+'Panel').hidden=id!==panel;
  $('resendVerification').hidden=panel!=='login';
  $(panel==='verify'?'verificationCode':panel==='login'?'loginEmail':panel==='recovery'?'recoveryEmail':'registerName').focus();
  updateResend();
}
function showVerification(email){
  verification.email=email;saveVerification(localStorage,verification);
  $('verificationEmail').textContent=email;showPanel('verify',{preserveStatus:true});
}
function startCooldown(email){
  verification={email,nextResendAt:Date.now()+otpSettings.resendCooldownSeconds*1000};
  saveVerification(localStorage,verification);updateResend();
}
function clearProtectedView(){patientPass?.clear();currentUser=null;appointments=[];attendance.clear();if(dashboard){$('gateStatus').hidden=false;$('nextVisit').replaceChildren();$('detailsBody').replaceChildren();$('welcomeUser').textContent='Your care, organized.';$('dashboardStatus').textContent='';$('bookingStatus').textContent='';document.querySelectorAll('dialog[open]').forEach(d=>d.close(''));} if(dashboard){++slotEpoch;requestId=null;pendingValue=null;slotState='idle';$('scheduleForm').reset();$('appointmentTime').replaceChildren(new Option('Choose a doctor and date',''));$('dashboardContent').hidden=true;$('scheduleModal').close();$('appointmentCards').replaceChildren();}}
async function signOut(scope='global'){
  if(sessionController)await sessionController.signOut(scope);else{const {error}=await needClient().auth.signOut({scope});if(error)throw error;}
  clearProtectedView();clearAppStorage();
}
if(!dashboard){
  const recoveryUI=mountPasswordRecovery({status,showPanel,isReady:()=>ready,isNormalBusy:()=>authOperation,getNormalClient:needClient,clearNormalSession:signOut});
  document.querySelectorAll('[data-switch]').forEach(b=>b.addEventListener('click',()=>{if(!authOperation&&!recoveryUI.isBusy())showPanel(b.dataset.switch);}));
  $('verificationCode').maxLength=otpSettings.otpLength;$('verificationCode').minLength=otpSettings.otpLength;$('verificationCode').pattern=`[0-9]{${otpSettings.otpLength}}`;$('verificationCodeLabel').textContent=`${otpSettings.otpLength}-digit email code`;
  setInterval(updateResend,1000);updateResend();
  document.querySelectorAll('[data-password]').forEach(b=>b.addEventListener('click',()=>{const input=$(b.dataset.password),show=input.type==='password';input.type=show?'text':'password';b.textContent=show?'Hide':'Show';b.setAttribute('aria-pressed',String(show));}));
  $('registerForm').addEventListener('submit',e=>{
    e.preventDefault();if(authOperation)return;
    const form=e.currentTarget,name=$('registerName').value.trim(),email=$('registerEmail').value.trim(),password=$('registerPassword').value;
    if(!name||password!==$('confirmPassword').value){status(!name?'Enter your name.':'Passwords do not match.');return;}
    busy(form,async()=>{
      authOperation=true;status('Submitting registration…');let accepted=false;
      try{
        const auth=needClient().auth;
        if(cooldownRemaining(verification))throw Error('Wait for the resend cooldown before requesting another code.');
        startCooldown(email);
        const {data,error}=await auth.signUp({email,password,options:{data:{full_name:name}}});
        if(error)throw error;accepted=true;
        // Supabase's Auth trigger creates the profile before email confirmation.
        // A null session is the normal successful signup response.
        status('Registration received. Enter the code from your email. If you already have an account, sign in or resend verification.');
        if(data.session){await signOut('local');status('Registration received. Confirm email must be enabled in Supabase Auth settings. This automatic session was ended; check your setup before continuing.');}
        form.reset();resetPasswords();showVerification(email);
      }catch(error){status(accepted?`Registration was accepted, but session cleanup failed. ${friendlyError(error)} Please reload.`:friendlyError(error));}
      finally{authOperation=false;updateResend();}
    });
  });
  $('loginForm').addEventListener('submit',e=>{e.preventDefault();if(authOperation)return;busy(e.currentTarget,async()=>{
    authOperation=true;status('Signing in…');
    try{
      const {data,error}=await needClient().auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
      if(error)throw error;
      const {data:verified,error:validationError}=await client.auth.getUser();if(validationError)throw validationError;
      if(!data.session||!isConfirmed(verified.user)){await signOut('local');status('Verify your email before signing in.');}
      else{clearAppStorage();await routeAfterAuth();}
    }catch(error){status(friendlyError(error));}finally{authOperation=false;updateResend();}
  });});
  async function resendCode(email){
    const auth=needClient().auth;
    if(cooldownRemaining(verification))throw Error('Wait before requesting another code.');
    if(!email)throw Error('Enter your email in the sign-in form first.');
    startCooldown(email);showVerification(email);
    const {error}=await auth.resend({type:'signup',email});if(error)throw error;
    status('Confirmation requested. Enter the new code from your email.');
  }
  for(const id of ['resendVerification','resendCode'])$(id).addEventListener('click',e=>{
    if(authOperation)return;
    busy(e.currentTarget,async()=>{
      authOperation=true;
      try{const email=id==='resendCode'?verification.email:$('loginEmail').value.trim();
        if(id==='resendVerification'&&!$('loginEmail').checkValidity())throw Error('Enter a valid email in the sign-in form first.');
        await resendCode(email);
      }finally{authOperation=false;updateResend();}
    }).then(updateResend);
  });
  $('verifyForm').addEventListener('submit',e=>{
    e.preventDefault();if(authOperation)return;
    busy(e.currentTarget,async()=>{
      authOperation=true;status('Verifying email code…');
      try{
        const token=otpToken($('verificationCode').value,otpSettings.otpLength);
        const {data,error}=await needClient().auth.verifyOtp({email:verification.email,token,type:'email'});if(error)throw error;
        const checked=await client.auth.getUser();if(checked.error)throw checked.error;
        if(!data.session||!isConfirmed(checked.data.user)){await signOut('local');throw Error('Email verification did not establish a confirmed session. Please sign in.');}
        localStorage.removeItem(OTP_STORAGE_KEY);verification={email:'',nextResendAt:0};
        clearAppStorage();status('Email verified. Opening appointments…');await routeAfterAuth();
      }finally{$('verificationCode').value='';authOperation=false;updateResend();}
    });
  });
}
async function handleConfirmation(){
  const info=callbackInfo(new URL(location.href));
  if(!info.code&&!info.error&&!info.accessToken)return false;
  try{
    if(info.error)throw Error(`Confirmation failed: ${info.error}`);
    let response;
    if(info.code)response=await client.auth.exchangeCodeForSession(info.code);
    else if(info.accessToken&&info.refreshToken)response=await client.auth.setSession({access_token:info.accessToken,refresh_token:info.refreshToken});
    else throw Error('Incomplete confirmation link. Request a new link.');
    if(response.error)throw response.error;
    status('Email confirmation received. Checking your session…');return true;
  }catch(error){status(`Email confirmation could not complete. ${friendlyError(error)} Open the link in the browser used to register, or sign in if your email was already confirmed.`);return false;}
  finally{history.replaceState(null,'',location.pathname);}
}
async function checkSession(state){
 const epoch=++authEpoch;
 if(!state.user){clearProtectedView();clearAppStorage();if(state.error){$(dashboard?'gateStatus':'authStatus').textContent=friendlyError(state.error);if(!dashboard)document.body.classList.add('account-view');return}if(!state.pending&&dashboard&&!leaving){leaving=true;location.replace('index.html?reason=session-ended')}return}
 currentUser=state.user;
 verification=clearVerificationContext(localStorage);
 if(!dashboard){location.replace(state.access.is_staff?'staff.html':'dashboard.html');return}
 $('gateStatus').hidden=true;$('dashboardContent').hidden=false;
 if(!workspaceHandle)workspaceHandle=mountWorkspace({role:'patient',onNavigate:view=>{if(view==='appointments'){$('appointmentsSection').scrollIntoView();$('appointmentsTitle').focus()}else window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})},onSignOut:()=>$('logout').click(),onSwitchWorkspace:state.access.is_staff?()=>location.assign('staff.html'):null});
 else {$('switchWorkspace').hidden=!state.access.is_staff; $('switchWorkspace').onclick=state.access.is_staff?()=>location.assign('staff.html'):null}
 try{
 const [{data:profile,error:profileError},{data:doctors,error:doctorError},{data:types,error:typeError}]=await Promise.all([client.from('profiles').select('full_name').eq('id',currentUser.id).maybeSingle(),client.from('doctors').select('id,name').eq('active',true).order('name'),client.from('appointment_types').select('id,name').eq('active',true).order('name')]);
 if(epoch!==authEpoch)return;if(profileError||doctorError||typeError)throw profileError||doctorError||typeError;
 if(!profile)throw Error('Your account exists, but its profile is missing. The administrator must check the Auth profile trigger; do not register again.');
 $('welcomeUser').textContent='Welcome, '+profile.full_name;catalogs={doctors,types};fillCatalogs();await loadAppointments(epoch);
 }catch(error){if(epoch===authEpoch)status(friendlyError(error))}
}
function fillCatalogs(){
  [[$('doctorName'),catalogs.doctors,'Choose a doctor'],[$('appointmentType'),catalogs.types,'Choose a type']].forEach(([select,items,placeholder])=>{
    const chosen=select.value;select.replaceChildren(new Option(placeholder,''));
    items.forEach(item=>select.append(new Option(item.name,item.id)));select.value=chosen;
  });
}
function syncSlotControls(){
  const form=$('scheduleForm');if(!form||form.dataset.busy)return;
  // A lost booking response may already have committed. Freeze its exact payload
  // until a same-ID retry resolves it; do not turn it into a second reservation.
  form.querySelectorAll('input,select').forEach(control=>control.disabled=Boolean(requestId));
  $('appointmentTime').disabled=Boolean(requestId)||slotState!=='ready';
  $('refreshSlots').disabled=Boolean(requestId)||slotState==='loading'||!currentUser||!$('doctorName').value||!$('appointmentDate').value;
  $('reserveAppointment').disabled=!currentUser||(!requestId&&(slotState!=='ready'||!$('appointmentTime').value));
  $('reserveAppointment').textContent=requestId?'Retry reservation':'Reserve appointment';
}
async function refreshSlots({preserve=false}={}){
  if(requestId)return;
  const epoch=++slotEpoch,uid=currentUser?.id,doctor=$('doctorName').value,date=$('appointmentDate').value;
  const previous=preserve?$('appointmentTime').value:'';
  const time=$('appointmentTime'),feedback=$('slotStatus');
  time.replaceChildren(new Option('Choose a doctor and date',''));time.removeAttribute('aria-busy');slotState='idle';
  if(!uid||!doctor||!date){feedback.textContent='Choose a doctor and date to see available times.';syncSlotControls();return;}
  slotState='loading';time.replaceChildren(new Option('Checking available times…',''));
  feedback.textContent='Checking clinic availability…';time.setAttribute('aria-busy','true');syncSlotControls();
  try{
    const {data,error}=await needClient().rpc('list_available_slots',{p_doctor_id:doctor,p_date:date});
    if(epoch!==slotEpoch||currentUser?.id!==uid)return;
    if(error)throw error;
    const options=availableOptions(data,date);
    time.replaceChildren(new Option(options.length?'Choose an available time':'No available times',''));
    options.forEach(option=>time.append(new Option(option.label,option.value)));
    if(options.some(option=>option.value===previous))time.value=previous;
    slotState=options.length?'ready':'empty';
    feedback.textContent=options.length?`${options.length} available start times. Your slot is reserved only after saving.`:'No available one-hour visits for this doctor and date. Try another date or doctor.';
    if(previous&&!time.value&&options.length)feedback.textContent+=' Your previous time is no longer available; choose another.';
  }catch(error){
    if(epoch!==slotEpoch||currentUser?.id!==uid)return;
    slotState='error';time.replaceChildren(new Option('Availability unavailable',''));
    feedback.textContent=error?.code==='PGRST202'||error?.code==='42883'?'Availability needs administrator setup. Apply the available-slots migration, then refresh.':`Available times could not be loaded. ${friendlyError(error)} Use Refresh times to retry.`;
  }finally{if(epoch===slotEpoch){time.removeAttribute('aria-busy');syncSlotControls();}}
}
async function loadAppointments(epoch=authEpoch){
  const uid=currentUser?.id;if(!uid)return false;
  const {data,error}=await client.from('appointments').select('*').eq('owner_uid',uid).order('start_at');
  if(currentUser?.id!==uid||epoch!==authEpoch)return false;
  if(error){status(`Appointments could not be loaded. ${friendlyError(error)}`);return false;}
  const map=new Map();for(let i=0;i<data.length;i+=100){const result=await client.from('appointment_attendance').select('appointment_id,state,version,updated_at').in('appointment_id',data.slice(i,i+100).map(a=>a.id));if(currentUser?.id!==uid||epoch!==authEpoch)return false;if(result.error){status('Attendance could not be loaded. Apply the staff workflow migration (006) or reload.');break}for(const row of result.data)map.set(row.appointment_id,row)}appointments=data;attendance=map;render();return true;
}
function render(){
 renderPatientOverview({user:currentUser,appointments,attendance,onDetails:(a,trigger)=>showPatientDetails(a,attendance,trigger,(visit,button)=>patientPass.open(visit,button))});
 renderPatientAppointments({appointments,attendance,filter,onDetails:(a,trigger)=>showPatientDetails(a,attendance,trigger,(visit,button)=>patientPass.open(visit,button)),onCancel:(a,b)=>busy(b,async()=>{
 const uid=currentUser?.id,epoch=authEpoch;
 if(!await confirmAction({title:'Cancel appointment?',message:'This releases your reservation. Your appointment history will be retained.',confirmLabel:'Confirm cancellation'}))return;
 if(!uid||currentUser?.id!==uid||authEpoch!==epoch||appointmentStatus(a)!=='upcoming')return;
 const {error}=await needClient().rpc('cancel_appointment',{p_appointment_id:a.id});if(currentUser?.id!==uid||authEpoch!==epoch)return;if(error)throw error;
 status('Appointment cancelled. Availability released.');await loadAppointments();
 })});
}

if(dashboard){
  $('logout').addEventListener('click',e=>busy(e.currentTarget,async()=>{
    authOperation=true;try{await signOut();location.replace('index.html');}finally{authOperation=false;updateResend();}
  }));
  $('scheduleBtn').addEventListener('click',e=>{modalTrigger=e.currentTarget;$('appointmentDate').min=manilaDateTime(new Date().toISOString()).date;$('scheduleModal').showModal();(requestId?$('reserveAppointment'):$('patientName')).focus();refreshSlots({preserve:true});});
  for(const id of ['doctorName','appointmentDate'])$(id).addEventListener('change',()=>refreshSlots());
  $('appointmentTime').addEventListener('change',syncSlotControls);
  $('refreshSlots').addEventListener('click',()=>refreshSlots({preserve:true}));
  syncSlotControls();
  $('closeModal').addEventListener('click',()=>{if(!$('scheduleForm').dataset.busy)$('scheduleModal').close();});
  $('scheduleModal').addEventListener('cancel',e=>{if($('scheduleForm').dataset.busy)e.preventDefault();});
  $('scheduleModal').addEventListener('close',()=>modalTrigger?.focus());
  $('viewAppointments').addEventListener('click',()=>{$('appointmentsSection').scrollIntoView();$('appointmentsTitle').focus();});
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(other=>other.setAttribute('aria-pressed',String(other===b)));render();}));
  $('scheduleForm').addEventListener('submit',e=>{
    e.preventDefault();const form=e.currentTarget;if(form.dataset.busy)return;
    const input=Object.fromEntries(new FormData(form));let value;
    try{
      if(requestId)value=pendingValue;
      else{
        if(slotState!=='ready'||!$('appointmentTime').value)throw Error('Choose an available start time first.');
        value=validateAppointment(input,Date.now(),catalogs);
      }
    }catch(error){$('bookingStatus').textContent=error.message;return;}
    busy(form,async()=>{
      const uid=currentUser?.id,epoch=authEpoch;
      $('bookingStatus').textContent='Reserving securely…';requestId??=crypto.randomUUID();pendingValue=value;let saved;
      try{const {data,error}=await needClient().rpc('book_appointment',bookingParameters(requestId,value));if(error)throw error;saved=Array.isArray(data)?data[0]:data;if(!saved?.id)throw Error('Missing booking confirmation.');}
      catch(error){
        if(currentUser?.id!==uid||authEpoch!==epoch)return;
        const definitive=['23P01','22023','42501','55000','23503'].includes(error?.code);
        if(definitive){
          requestId=null;pendingValue=null;
          $('bookingStatus').textContent=error.code==='23P01'?'That time was just booked. Your details are retained; choose another available time.':`Booking was rejected; entries retained. ${friendlyError(error)}`;
          await refreshSlots({preserve:error.code!=='23P01'});
        }else{
          $('bookingStatus').textContent=`Booking not confirmed; entries retained. ${friendlyError(error)} Retry reservation uses the same request and details to avoid duplicates. Close this form and reload appointments before starting a different request.`;
        }
        return;
      }
      if(currentUser?.id!==uid||authEpoch!==epoch)return;
      requestId=null;pendingValue=null;++slotEpoch;slotState='idle';form.reset();$('bookingStatus').textContent='';$('appointmentTime').replaceChildren(new Option('Choose a doctor and date',''));$('slotStatus').textContent='Choose a doctor and date to see available times.';$('scheduleModal').close();status('Appointment saved.');
      const refreshed=await loadAppointments(),refreshMessage=refreshed?'':' Appointment list refresh failed; reload to view it.';
      if(currentUser?.id!==uid||authEpoch!==epoch)return;
      if(saved.status==='cancelled'){status('This request was previously cancelled. No new appointment created.');return;}
      status('Appointment saved. Sending confirmation…');
      try{const {data,error}=await needClient().functions.invoke('appointment-confirmation',{body:{appointmentId:saved.id}});
        if(currentUser?.id!==uid||authEpoch!==epoch)return;
        if(error||!['sent','already_sent'].includes(data?.status))throw Error('Confirmation unavailable.');
        status('Appointment saved; confirmation email accepted for delivery.'+refreshMessage);
      }catch{if(currentUser?.id===uid&&authEpoch===epoch)status('Appointment saved; confirmation email could not be sent'+refreshMessage);}
    });
  });
  setInterval(()=>{if(currentUser)render();},30000);
}
async function initialize(){
  try{
    const config=validatePublicConfig(settings);
    if(!dashboard&&verification.email)showVerification(verification.email);
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.117.3');
    client=createClient(config.url,config.publishableKey,{auth:{storageKey:AUTH_STORAGE_KEY,flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
    sessionController=createSessionController({client,shouldHandle:()=>ready&&!authOperation,onState:state=>{checkSession(state).catch(error=>status(friendlyError(error)))}});
    const attemptedCallback=callbackInfo(new URL(location.href));
    await handleConfirmation();ready=true;
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(!dashboard&&!attemptedCallback.code&&!attemptedCallback.error&&!attemptedCallback.accessToken)status(!$('verifyPanel').hidden?'Enter the email code to finish registration.':new URL(location.href).searchParams.has('reason')?'Your session ended. Please sign in again.':'Ready to sign in.');
    await sessionController.start();
  }catch(error){$(dashboard?'gateStatus':'authStatus').textContent=friendlyError(error);if(!dashboard)document.body.classList.add('account-view');}
}
initialize();
