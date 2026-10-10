import {element,showDialog} from './workspace.js';import {attendanceLabel,formatVisitRange} from './attendance.js';
export function renderPatientOverview({user,appointments,attendance,onBook,onDetails,onCancel}){const c=document.getElementById('nextVisit');c.replaceChildren();const next=appointments.filter(a=>a.status!=='cancelled'&&Date.parse(a.start_at)>Date.now()).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at))[0];c.append(element('p','YOUR NEXT APPOINTMENT','eyebrow'));if(!next){c.append(element('h2','Ready when you are'),element('p','Book a one-hour visit during clinic hours.','muted'));return}c.append(element('span','Upcoming','badge'),element('h2',next.type_name),element('p',formatVisitRange(next)),element('p',next.doctor_name,'muted'));const b=element('button','View appointment','secondary');b.addEventListener('click',()=>onDetails(next,b));c.append(b)}
export function showPatientDetails(a,attendance,trigger,onPass){const content=document.getElementById('detailsBody');content.replaceChildren();for(const text of [a.type_name,a.doctor_name,formatVisitRange(a),attendanceLabel(a,attendance.get(a.id)),`Patient: ${a.patient_name}`,`Age: ${a.patient_age}`,`Address: ${a.patient_address}`])content.append(element('p',text));if(onPass&&a.status==='active'&&attendance.get(a.id)?.state==='scheduled'&&new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a.start_at))===manilaToday()&&Date.now()<Date.parse(a.end_at)){const b=element('button','Show check-in QR');b.onclick=()=>{document.getElementById('detailsDialog').close();onPass(a,trigger)};content.append(b)}showDialog(document.getElementById('detailsDialog'),trigger)}
export function renderPatientAppointments({appointments,attendance,filter,onDetails,onCancel}){
 const container=document.getElementById('appointmentCards');container.replaceChildren();const visible=appointments.filter(a=>appointmentStatus(a)===filter);
 if(!visible.length)container.append(element('p',`No ${filter} appointments.`));
 if(visible.length){const header=element('div',null,'appointment-table-head');for(const label of ['Type','Doctor','Date / time','Status','Actions'])header.append(element('span',label));container.append(header);}
 for(const a of visible){
  const card=element('article',null,'appointment-card');
  const state=attendanceLabel(a,attendance.get(a.id));
  const badge=element('span',state,'badge');badge.dataset.state=attendance.get(a.id)?.state||a.status;if(a.status==='cancelled')badge.dataset.state='cancelled';
  card.append(element('h3',a.type_name),element('p',a.doctor_name,'visit-doctor'),element('p',formatVisitRange(a),'visit-date'),badge);
  const actions=element('div',null,'visit-actions');
  const details=element('button','View details','secondary');details.addEventListener('click',()=>onDetails(a,details));
  const cancel=element('button',filter==='cancelled'?'Cancelled':filter==='past'?'Visit has started / passed':'Cancel appointment');cancel.dataset.cancel='';cancel.disabled=filter!=='upcoming';cancel.addEventListener('click',()=>onCancel(a,cancel));
  actions.append(details,cancel);card.append(actions);container.append(card);
 }

}
import {appointmentStatus} from './domain.js';
import {manilaToday} from './attendance.js';
