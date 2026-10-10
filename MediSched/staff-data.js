export function createStaffData(client){async function rpc(name,p){const {data,error}=await client.rpc(name,p);if(error)throw error;if(!data)throw Error('Missing server response. Refresh before retrying.');return data}
 const query=({date,doctorId=null,cursor=null,limit=25})=>({p_date:date,p_doctor_id:doctorId||null,p_cursor:cursor?.at||null,p_cursor_id:cursor?.id||null,p_limit:limit});
 return {context:()=>rpc('get_access_context'),appointments:o=>rpc('list_staff_appointments',{...query(o),p_search:(o.search||'').trim()}),activity:o=>rpc('list_staff_activity',query(o)),transition:o=>rpc('set_appointment_attendance',{p_appointment_id:o.appointmentId,p_action:o.action,p_action_id:o.actionId,p_expected_version:o.expectedVersion})}
}
